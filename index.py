import os
import logging
import base64
import uuid
import json
import pathlib
import time
import random
from datetime import datetime, timedelta, timezone
import hmac
import hashlib
from urllib.parse import parse_qsl, unquote
from typing import Optional, List, Dict, Any
from zoneinfo import ZoneInfo
from supabase import create_client
from supabase.client import AsyncClient # <-- ИЗМЕНЕНИЕ ЗДЕСЬ


import requests
from fastapi.concurrency import run_in_threadpool
import warnings
from urllib3.exceptions import InsecureRequestWarning
import httpx
import asyncio
import re
from aiogram import Bot, Dispatcher, types, F, Router
from aiogram.filters import Command, CommandObject
from aiogram.types import Update, WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton, MessageReactionUpdated
from aiogram.enums import ParseMode
from aiogram.client.bot import DefaultBotProperties
from aiogram.exceptions import TelegramForbiddenError, TelegramBadRequest
from fastapi import FastAPI, Request, HTTPException, Query, Depends, Body, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi import BackgroundTasks
from dotenv import load_dotenv
from pydantic import BaseModel, Field 
from contextlib import asynccontextmanager
from aiogram.utils.markdown import html_decoration
from dateutil import parser

sleep_cache = {
    "is_sleeping": False,
    "wake_up_at": None,
    "last_checked": 0 # Unix timestamp
}
CACHE_DURATION_SECONDS = 43200 # Проверять базу данных только раз в 15 секунд

# --- НОВЫЙ КЭШ ДЛЯ НАСТРОЕК АДМИНА ---
admin_settings_cache = {
    "settings": None, # Здесь будут храниться сами настройки (объект AdminSettings)
    "last_checked": 0 # Unix timestamp
}
ADMIN_SETTINGS_CACHE_DURATION = 900 # Кэшировать настройки админа на 5 минут (300 секунд)
# --- КОНЕЦ НОВОГО КЭША ---
# --- Добавьте этот блок после sleep_cache и admin_settings_cache ---
webhook_cache = {
    "ids": set(),
    "last_cleanup": 0
}
WEBHOOK_CACHE_TTL = 600 # Хранить ID 10 минут
# ------------------------------------------------------------------
# --- КЭШ ДЛЯ TWITCH (ОПТИМИЗАЦИЯ) ---
twitch_settings_cache = {
    "last_updated": 0,
    "rewards_map": {},      # title -> {id, is_active, ...}
    "cauldron_titles": set(),
    "roulette_titles": set()
}
TWITCH_CACHE_TTL = 300  # Обновлять кэш раз в 5 минут
# --- КЭШ МАГАЗИНА (УСКОРЕНИЕ x1000) ---
shop_goods_cache = {
    # id_категории: { "data": [список_товаров], "expires_at": timestamp }
}
SHOP_CACHE_TTL = 600  # Хранить товары 10 минут (600 секунд)

# --- Глобальный клиент для фоновых задач (ВСТАВИТЬ В НАЧАЛО ФАЙЛА) ---
_background_supabase_client: Optional[httpx.AsyncClient] = None

# --- УПРАВЛЕНИЕ CRON-JOB.ORG (ЭКОНОМИЯ РЕСУРСОВ) ---
async def toggle_cron_job(enable: bool):
    """
    Включает или выключает задачу на cron-job.org через API.
    """
    api_key = os.getenv("CRON_API_KEY")
    job_id = os.getenv("CRON_JOB_ID")
    
    if not api_key or not job_id:
        logging.warning("⚠️ CRON_API_KEY или CRON_JOB_ID не настроены. Пропуск переключения Cron.")
        return

    url = f"https://api.cron-job.org/jobs/{job_id}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    # Для API v1 cron-job.org используем PATCH для обновления статуса
    payload = {"job": {"enabled": enable}}

    # Используем отдельный клиент, так как это внешний запрос
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.patch(url, json=payload, headers=headers)
            if resp.status_code == 200:
                status_text = "ВКЛЮЧЕН (Стрим начался)" if enable else "ВЫКЛЮЧЕН (Стрим окончен)"
                logging.info(f"✅ Cron-job успешно {status_text}.")
            else:
                logging.error(f"❌ Ошибка переключения Cron-job: {resp.text}")
        except Exception as e:
            logging.error(f"❌ Ошибка соединения с Cron-job API: {e}")

async def get_background_client():
    """Возвращает живучий клиент для фоновых задач"""
    global _background_supabase_client
    
    # Если клиента нет или он закрыт — создаем новый
    if _background_supabase_client is None or _background_supabase_client.is_closed:
        # keepalive_expiry=60 держит соединение открытым 60 секунд
        limits = httpx.Limits(max_keepalive_connections=5, max_connections=10, keepalive_expiry=60)
        _background_supabase_client = httpx.AsyncClient(
            base_url=f"{SUPABASE_URL}/rest/v1",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            timeout=10.0, 
            limits=limits
        )
    return _background_supabase_client

# --- Pydantic Models ---
class InitDataRequest(BaseModel):
    initData: str

class ExchangeRequest(BaseModel):
    initData: str
    cost: float
    tickets_reward: int

class BuyItemRequest(BaseModel):
    initData: str
    reward_value: int

class SleepModeRequest(BaseModel):
    initData: str
    minutes: Optional[int] = None # Сколько минут спать

class QuestStartRequest(BaseModel):
    initData: str
    quest_id: int

class PromocodeClaimRequest(BaseModel):
    initData: str
    quest_id: int

class CategoryCreateRequest(BaseModel):
    initData: str
    name: str

class CategoryUpdateRequest(BaseModel):
    initData: str
    category_id: int
    name: str

class CategoryDeleteRequest(BaseModel):
    initData: str
    category_id: int

class UserChallengesRequest(BaseModel):
    initData: str
    user_id: str

class EventEnterRequest(BaseModel):
    initData: str
    event_id: int
    tickets_to_spend: int # ИЗМЕНЕНИЕ: было tickets_cost

class ParticipantsRequest(BaseModel):
    initData: str
    event_id: int

class AuctionBidRequest(BaseModel):
    initData: str
    auction_id: int
    bid_amount: int

class EventParticipantsRequest(BaseModel):
    initData: str
    event_id: int

class EventControlState(BaseModel):
    visible: bool
    paused: bool

# --- Pydantic модели для Админки Аукциона ---
class AuctionCreateRequest(BaseModel):
    initData: str
    title: str
    image_url: Optional[str] = None
    bid_cooldown_hours: Optional[int] = 4 
    snipe_guard_minutes: int = 5
    is_active: Optional[bool] = False
    is_visible: Optional[bool] = False
    min_required_tickets: Optional[int] = 1 
    max_allowed_tickets: Optional[int] = None 
    
    # === [ДОБАВИТЬ ЭТИ ДВЕ СТРОКИ] ===
    rarity: Optional[str] = None
    wear: Optional[str] = None
    # =================================

class AuctionUpdateRequest(BaseModel):
    initData: str
    id: int
    title: Optional[str] = None 
    image_url: Optional[str] = None
    bid_cooldown_hours: Optional[int] = None 
    snipe_guard_minutes: Optional[int] = None
    is_active: Optional[bool] = None
    is_visible: Optional[bool] = None
    min_required_tickets: Optional[int] = None
    max_allowed_tickets: Optional[int] = None

    # === [ДОБАВИТЬ ЭТИ ДВЕ СТРОКИ] ===
    rarity: Optional[str] = None
    wear: Optional[str] = None
    # =================================

class AuctionDeleteRequest(BaseModel):
    initData: str
    id: int
# --- Конец Pydantic моделей для Админки Аукциона ---

# --- NEW Pydantic Models for Sort Order Update ---
class CategorySortOrderUpdateRequest(BaseModel):
    initData: str
    category_id: int
    sort_order: Optional[int] = None # Optional to allow null/clearing

class QuestSortOrderUpdateRequest(BaseModel):
    initData: str
    quest_id: int
    sort_order: Optional[int] = None # Optional to allow null/clearing
# --- End NEW Pydantic Models ---

class PromocodeAdminListRequest(BaseModel):
    initData: str

class PromocodeCreateRequest(BaseModel):
    initData: str
    codes: str
    reward_value: int
    description: str

class EventClearRequest(BaseModel):
    initData: str
    event_id: int

class EventConfirmSentRequest(BaseModel):
    initData: str
    event_id: int

class TradeLinkUpdateRequest(BaseModel):
    initData: str
    trade_link: str
    
class AdminResetCooldownRequest(BaseModel):
    initData: str
    user_id_to_reset: int

# --- МОДЕЛИ ДЛЯ ИВЕНТА "ВЕДЬМИНСКИЙ КОТЕЛ" ---

class CauldronUpdateRequest(BaseModel):
    initData: str
    content: dict # Ожидаем JSON со всеми настройками ивента

class CauldronContributeRequest(BaseModel):
    initData: str
    amount: int # Сколько билетов пользователь хочет вложить

# --- НОВЫЕ МОДЕЛИ ---
class QuestCancelRequest(BaseModel):
    initData: str

class FreeTicketClaimRequest(BaseModel):
    initData: str

class GrantAccessRequest(BaseModel):
    initData: str
    user_id_to_grant: int
    
class CheckpointReward(BaseModel):
    level: int
    title: str
    description: Optional[str] = ""
    icon: str
    type: str
    value: str
    # --- ДОБАВЬТЕ ЭТИ ДВЕ СТРОКИ ---
    total_quantity: Optional[int] = None
    claimed_quantity: Optional[int] = None

class CheckpointContent(BaseModel):
    rewards: List[CheckpointReward] = Field(default_factory=list)

class CheckpointUpdateRequest(BaseModel):
    initData: str
    content: CheckpointContent

class CheckpointInfoUpdateRequest(BaseModel):
    initData: str
    content: str # Это будет HTML-строка из редактора

class CheckpointClaimRequest(BaseModel):
    initData: str
    level: int

class ManualRewardCompleteRequest(BaseModel):
    initData: str
    reward_id: int

class AdminGrantTicketsRequest(BaseModel):
    initData: str
    user_id_to_grant: int
    amount: int

class AdminGrantStarsRequest(BaseModel):
    initData: str
    user_id_to_grant: int
    amount: int

class AdminGrantCheckpointStarsRequest(BaseModel):
    initData: str
    user_id_to_grant: int
    amount: int

class AdminFreezeCheckpointStarsRequest(BaseModel):
    initData: str
    user_id: int # <-- ИЗМЕНЕНО с user_id_to_freeze
    days: int

class AdminFreezeStarsRequest(BaseModel):
    initData: str
    user_id: int # <-- ИЗМЕНЕНО с user_id_to_freeze
    days: int

class AdminAuctionFinishRequest(BaseModel):
    initData: str
    id: int
   
class AdminSettings(BaseModel):
    skin_race_enabled: bool = True
    slider_order: List[str] = Field(default_factory=lambda: ["skin_race", "cauldron", "auction", "checkpoint"])
    challenge_promocodes_enabled: bool = True
    quest_promocodes_enabled: bool = True
    challenges_enabled: bool = True
    quests_enabled: bool = True
    checkpoint_enabled: bool = False
    menu_banner_url: Optional[str] = "https://i.postimg.cc/1Xkj2RRY/sagluska-1200h600.png"
    checkpoint_banner_url: Optional[str] = "https://i.postimg.cc/9046s7W0/cekpoint.png"
    auction_enabled: bool = False # <-- ДОБАВЛЕНО
    auction_banner_url: Optional[str] = "https://i.postimg.cc/6qpWq0dW/aukcion.png" # <-- ДОБАВЛЕНО
    weekly_goals_banner_url: Optional[str] = "https://i.postimg.cc/T1j6hQGP/1200-324.png"
    bonus_gift_enabled: bool = True
    # --- 🔽 ВОТ ЭТУ СТРОКУ НУЖНО ДОБАВИТЬ 🔽 ---
    weekly_goals_enabled: bool = False # (Отступ 8 пробелов)
    quest_schedule_override_enabled: bool = False # (Отступ 8 пробелов)
    quest_schedule_active_type: str = 'twitch' # (Отступ 8 пробелов) 'twitch' или 'telegram'
    advent_start_date: Optional[str] = None # <-- ДОБАВИТЬ ЭТО (Формат "YYYY-MM-DD")
    p2p_admin_trade_link: Optional[str] = ""
    
    
class AdminSettingsUpdateRequest(BaseModel):
    initData: str
    settings: AdminSettings

class StatisticsRequest(BaseModel):
    initData: str

class PendingActionRequest(BaseModel): # Добавьте эту модель в начало файла, где все Pydantic модели
    initData: str

class AdminCheckpointUserRequest(BaseModel):
    initData: str
    user_id: int

class TwitchRewardInfo(BaseModel):
    title: str

class TwitchEventData(BaseModel):
    user_login: str
    reward: TwitchRewardInfo

class TwitchWebhookPayload(BaseModel):
    subscription: dict
    event: TwitchEventData

class TwitchReward(BaseModel):
    id: Optional[int] = None
    title: str
    is_active: bool = True
    notify_admin: bool = True
    icon_url: Optional[str] = None

class TwitchRewardPurchaseCreate(BaseModel):
    initData: str
    reward_id: int
    trade_link: str

class WizebotCheckRequest(BaseModel):
    initData: str
    twitch_username: str
    period: str = "session" # 'session', 'week', или 'month'

class TwitchRewardUpdateRequest(BaseModel):
    initData: str
    id: int
    is_active: Optional[bool] = None
    notify_admin: Optional[bool] = None
    promocode_amount: Optional[int] = None # Старое поле, оставляем для совместимости
    show_user_input: Optional[bool] = None
    condition_type: Optional[str] = None
    target_value: Optional[int] = None
    # Новые поля для Админа 6971
    reward_type: Optional[str] = None      # 'promocode', 'tickets' ИЛИ 'none'
    reward_amount: Optional[int] = None    # Количество для нового типа
    sort_order: Optional[int] = None       # Порядковый номер

class TwitchRewardIssueRequest(BaseModel):
    initData: str
    purchase_id: int

class TwitchRewardIssueTicketsRequest(BaseModel):
    initData: str
    purchase_id: int

class TwitchRewardDeleteRequest(BaseModel):
    initData: str
    reward_id: int

class TwitchPurchaseDeleteRequest(BaseModel):
    initData: str
    purchase_id: int

class RoulettePrizeCreateRequest(BaseModel):
    initData: str
    reward_title: str
    skin_name: str
    image_url: str
    chance_weight: float
    quantity: int # <-- ДОБАВЛЕНО

class RoulettePrizeDeleteRequest(BaseModel):
    initData: str
    prize_id: int

# <-- ДОБАВЛЕНА НОВАЯ МОДЕЛЬ -->
class RoulettePrizeUpdateRequest(BaseModel):
    initData: str
    prize_id: int
    reward_title: str # Добавляем все поля, чтобы их можно было редактировать
    skin_name: str
    image_url: str
    chance_weight: float
    quantity: int

# --- НОВАЯ Pydantic модель для создания ивента ---
class EventCreateRequest(BaseModel):
    initData: str
    title: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    tickets_cost: int
    end_date: Optional[str] = None

class TwitchPurchaseViewedRequest(BaseModel):
    initData: str
    purchase_id: int

class QuestCloseRequest(BaseModel):
    initData: str

class TwitchRewardIdRequest(BaseModel):
    initData: str
    reward_id: int

class AdminUserSearchRequest(BaseModel):
    initData: str
    search_term: str

class AdminForceCompleteRequest(BaseModel):
    initData: str
    user_id: int
    entity_type: str # 'quest' или 'challenge'
    entity_id: int

class AdminEntityListRequest(BaseModel):
    initData: str
    entity_type: str # 'quest' или 'challenge'    

class EventUpdateRequest(BaseModel):
    initData: str
    event_id: int
    title: str
    description: Optional[str] = ""
    image_url: Optional[str] = ""
    tickets_cost: int
    end_date: Optional[str] = None

# Добавьте эту модель к другим моделям в начале файла
class EventDeleteRequest(BaseModel):
    initData: str
    event_id: int

# --- 🔽 ВОТ СЮДА ВСТАВЬ НОВЫЕ МОДЕЛИ 🔽 ---
class WeeklyGoalClaimTaskRequest(BaseModel):
    initData: str
    goal_id: str # UUID задачи

class WeeklyGoalClaimSuperPrizeRequest(BaseModel):
    initData: str

# --- Модели для Админки "Забега" (v3) ---
class WeeklyGoalBase(BaseModel):
    title: str
    description: Optional[str] = None # <-- 🔽 ДОБАВЬ ЭТУ СТРОКУ
    task_type: str
    target_value: int = 1
    reward_type: str = 'none'
    reward_value: int = 0
    sort_order: int = 0
    is_active: bool = True #
    week_id: Optional[str] = None #
    # 🔽 v3: Добавляем необязательные поля 🔽
    target_entity_id: Optional[int] = None
    target_entity_name: Optional[str] = None

class WeeklyGoalCreateRequest(WeeklyGoalBase):
    initData: str

class WeeklyGoalUpdateRequest(WeeklyGoalBase):
    initData: str
    goal_id: str # UUID

class WeeklyGoalDeleteRequest(BaseModel):
    initData: str
    goal_id: str # UUID

class WeeklyRunSettings(BaseModel):
    week_id: str
    super_prize_type: str = 'none'
    super_prize_value: int = 0
    super_prize_description: str = 'Главный приз недели!'

class WeeklyRunSettingsUpdateRequest(BaseModel):
    initData: str
    # 🔽 v3: Модель настроек теперь отдельная 🔽
    settings: WeeklyRunSettings

class GrantDeleteRequest(BaseModel):
    initData: str
    id: int
# --- 🔼 КОНЕЦ НОВЫХ МОДЕЛЕЙ 🔼 ---
# --- Модели для настроек уведомлений ---
class UserSettingsUpdate(BaseModel):
    initData: str
    key: str    # например: notify_auction_start
    value: bool # true/false

class TestNotificationRequest(BaseModel):
    initData: str
    type: str   # какой тип уведомления тестируем

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

class EventsPageContentUpdate(BaseModel):
    initData: str
    content: dict

# Модели для запросов
class ShopBuyRequest(BaseModel):
    initData: str
    item_id: int
    price: int
    # 👇 Новые поля, чтобы сохранить красоту в админку
    title: Optional[str] = "Товар магазина"
    image_url: Optional[str] = None

# Для массового обновления настроек
class UserSettingsBatch(BaseModel):
    initData: str
    updates: Dict[str, bool] # Словарь: {"настройка": true, "другая": false}

# --- Pydantic модели (добавь в начало) ---
class ReferralActivateRequest(BaseModel):
    initData: str

class AdminShopCacheClearRequest(BaseModel):
    initData: str
    password: str

# --- SLAY Models ---

# --- SLAY Models Update ---
class SlayContentUpdate(BaseModel):
    initData: str
    title: str
    description: str
    badge: Optional[str] = "Exclusive Event" 
    prizes: Optional[list] = []  # <-- ИЗМЕНЕНИЕ: Было str, стало list

class SlayNominationUpdate(BaseModel):
    initData: str
    id: int
    title: str
    image_url: Optional[str] = None
    description: Optional[str] = None

class SlayCandidateDelete(BaseModel):
    initData: str
    candidate_id: int

class SlayVoteRequest(BaseModel):
    initData: str
    nomination_id: int
    candidate_id: int

class SlayNominationCreate(BaseModel):
    initData: str
    title: str
    description: Optional[str] = ""
    image_url: Optional[str] = None

class GrindSettings(BaseModel):
    twitch_status_boost_coins: float = 0.5
    twitch_status_free_tickets: int = 5
    ref_boost_coins_per_user: float = 0.1

class SlayCandidateAdd(BaseModel):
    initData: str
    nomination_id: int
    user_id: int
    custom_title: Optional[str] = None

class SlayNominationFinish(BaseModel):
    initData: str
    nomination_id: int

class AdminLinkTwitchManualRequest(BaseModel):
    initData: str
    user_id: int
    twitch_login: str
    twitch_id: str

class CauldronRewardStatusRequest(BaseModel):
    initData: str
    user_id: int
    is_sent: bool

class AdventDayUpdate(BaseModel):
    initData: str
    day_id: int
    task_type: str
    task_target: int
    description: str

class AdventLootItemCreate(BaseModel):
    initData: str
    name: str
    image_url: str
    chance_weight: int

class AdventLootItemDelete(BaseModel):
    initData: str
    item_id: int

class AdventClaimRequest(BaseModel):
    initData: str
    day_id: int

class P2PCreateRequest(BaseModel):
    initData: str
    case_id: int
    quantity: int

class P2PActionRequest(BaseModel):
    initData: str
    trade_id: int
    trade_link: Optional[str] = None # Только для админа (approve)

# --- P2P SETTINGS MODELS ---
class P2PCaseAddRequest(BaseModel):
    initData: str
    case_name: str
    image_url: str
    price_in_coins: int

class P2PCaseEditRequest(BaseModel):
    initData: str
    case_id: int
    price_in_coins: int
    is_active: bool

class P2PCaseDeleteRequest(BaseModel):
    initData: str
    case_id: int

# --- Модели для P2P ---
class P2PApproveRequest(BaseModel):
    initData: str
    trade_id: int
    trade_link: Optional[str] = None

class P2PActionRequest(BaseModel):
    initData: str
    trade_id: int

class SettingsUpdateModel(BaseModel):
    initData: str
    settings: Dict[str, Any]

# --- МОДЕЛИ ДЛЯ ПОДАРКОВ (Вставить к другим моделям) ---
class GiftCheckRequest(BaseModel):
    initData: str

class GiftClaimRequest(BaseModel):
    initData: str

class GiftSkinCreateRequest(BaseModel):
    initData: str
    name: str
    image_url: str
    chance: int

class GiftSkinDeleteRequest(BaseModel):
    initData: str
    skin_id: int

# --- Модель для Телеграм заданий ---
class TelegramTaskModel(BaseModel):
    task_key: str
    title: str
    description: Optional[str] = ""
    reward_amount: int
    action_url: Optional[str] = None
    is_active: bool

# ==========================================
# 🔫 CS:GO STYLE ROULETTE SYSTEM (NEW)
# ==========================================

# --- Модели данных ---
class CSRouletteSpinRequest(BaseModel):
    initData: str
    code: str

class CSItemCreateRequest(BaseModel):
    initData: str
    name: str
    image_url: str
    rarity: str # blue, purple, pink, red, gold
    condition: str
    chance_weight: float
    quantity: int

class CSCodeCreateRequest(BaseModel):
    initData: str
    code: str
    max_uses: int

# ⬇️⬇️⬇️ ВСТАВИТЬ СЮДА (НАЧАЛО БЛОКА) ⬇️⬇️⬇️

def get_notification_settings_keyboard(settings: dict) -> InlineKeyboardMarkup:
    """Генерирует клавиатуру настроек с галочками"""
    
    def btn(key, title):
        # Если True - показываем галочку, иначе крестик
        is_active = settings.get(key, True)
        icon = "✅" if is_active else "❌"
        return f"{icon} {title}"

    # Для тихого режима логика обратная: если включен - значит "Тихо"
    dnd_active = settings.get("notify_dnd_enabled", False)
    dnd_icon = "🌙" if dnd_active else "☀️"
    dnd_text = f"{dnd_icon} Тихий режим (23:00-08:00)"

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        # Блок Аукциона
        [InlineKeyboardButton(text="📢 --- АУКЦИОН ---", callback_data="ignore")],
        [
            InlineKeyboardButton(text=btn("notify_auction_start", "Старт"), callback_data="toggle_notify:notify_auction_start"),
            InlineKeyboardButton(text=btn("notify_auction_outbid", "Перебили"), callback_data="toggle_notify:notify_auction_outbid"),
        ],
        [InlineKeyboardButton(text=btn("notify_auction_end", "Завершение"), callback_data="toggle_notify:notify_auction_end")],
        
        # Блок Наград и Ивентов
        [InlineKeyboardButton(text="🎁 --- НАГРАДЫ ---", callback_data="ignore")],
        [
            InlineKeyboardButton(text=btn("notify_rewards", "Призы (Коды/Билеты)"), callback_data="toggle_notify:notify_rewards"),
            InlineKeyboardButton(text=btn("notify_daily_grind", "Монетка (Гринд)"), callback_data="toggle_notify:notify_daily_grind")
        ],
        
        # Блок Стрима
        [InlineKeyboardButton(text="🟣 --- ТРАНСЛЯЦИЯ ---", callback_data="ignore")],
        [InlineKeyboardButton(text=btn("notify_stream_start", "Начало стрима"), callback_data="toggle_notify:notify_stream_start")],

        # Тихий режим
        [InlineKeyboardButton(text="💤 --- РЕЖИМ ---", callback_data="ignore")],
        [InlineKeyboardButton(text=dnd_text, callback_data="toggle_notify:notify_dnd_enabled")],
        
        # Кнопка закрытия
        [InlineKeyboardButton(text="Закрыть настройки", callback_data="close_settings")]
    ])
    return keyboard

# ⬆️⬆️⬆️ КОНЕЦ ВСТАВКИ ⬆️⬆️⬆️

manager = ConnectionManager()

# соответствие condition_type ↔ колонка из users
CONDITION_TO_COLUMN = {
    # Twitch
    "twitch_messages_session": "daily_message_count",
    "twitch_messages_week": "weekly_message_count",
    "twitch_messages_month": "monthly_message_count",
    "twitch_uptime_session": "daily_uptime_minutes",
    "twitch_uptime_week": "weekly_uptime_minutes",
    "twitch_uptime_month": "monthly_uptime_minutes",

    # Telegram
    "telegram_messages_session": "telegram_daily_message_count",
    "telegram_messages_week": "telegram_weekly_message_count",
    "telegram_messages_month": "telegram_monthly_message_count",
}
# --- Helper для очистки имен от рекламы ---
def clean_user_name_text(text: str) -> str:
    if not text:
        return "User"
    
    # Список запрещенных фраз (в нижнем регистре для простоты)
    banned = ["@cs_shot_bot", "t.me/", "cs.money", "http"]
    
    cleaned_text = text
    for phrase in banned:
        # re.escape экранирует спецсимволы, re.IGNORECASE игнорирует регистр
        cleaned_text = re.sub(re.escape(phrase), "", cleaned_text, flags=re.IGNORECASE)
    
    # Убираем пробелы и проверяем, не стала ли строка пустой
    return cleaned_text.strip() or "User"
# --- Setup ---
load_dotenv()
warnings.filterwarnings("ignore", category=InsecureRequestWarning)
logging.basicConfig(level=logging.INFO)
# Отключаем информационные логи от библиотек запросов, оставляем только предупреждения и ошибки
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
# Отключаем информационные логи aiogram, оставляем только ошибки
logging.getLogger("aiogram.event").setLevel(logging.WARNING)
logging.getLogger("aiogram.dispatcher").setLevel(logging.WARNING)
# -----------------------------------------
# 2. 🔥 САМОЕ ВАЖНОЕ: Глушим логи сервера о входящих запросах
# Это уберет строки вида: "POST /api/v1/user/me HTTP/1.1" 200 OK
logging.getLogger("uvicorn").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING) # <--- Вот эта строка убивает /user/me 200 OK

# --- ЗАГРУЖАЕМ ВСЕ ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ ---
BOT_TOKEN = os.getenv("BOT_TOKEN")
TRUSTED_BOT_TOKEN = os.getenv("TRUSTED_BOT_TOKEN")
ALL_VALID_TOKENS = [t for t in [BOT_TOKEN, TRUSTED_BOT_TOKEN] if t]

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
ALLOWED_CHAT_ID = int(os.getenv("ALLOWED_CHAT_ID", "0") or 0)
WEB_APP_URL = os.getenv("WEB_APP_URL")
ADMIN_TELEGRAM_IDS_STR = os.getenv("ADMIN_TELEGRAM_IDS", "")
ADMIN_IDS = []
if ADMIN_TELEGRAM_IDS_STR:
    for admin_id in ADMIN_TELEGRAM_IDS_STR.split(','):
        admin_id = admin_id.strip()
        if admin_id.isdigit(): # Проверяем, что это число
            ADMIN_IDS.append(int(admin_id))
        else:
            logging.warning(f"Не удалось преобразовать ID администратора в число: '{admin_id}'")
# --- BOT-T CONFIG ---
BOTT_SHOP_URL = "https://shopdigital.bot-t.com/shop"
BOTT_BOT_ID = "233790" 
BOTT_PUBLIC_KEY = "3ff90f7d9067e067dc6bcd7440e3f860"
BOTT_PRIVATE_KEY = "a514e99bd44087724a23b4ebb3812381"
ADMIN_NOTIFY_CHAT_ID = os.getenv("ADMIN_NOTIFY_CHAT_ID")
TWITCH_CLIENT_ID = os.getenv("TWITCH_CLIENT_ID")
TWITCH_CLIENT_SECRET = os.getenv("TWITCH_CLIENT_SECRET")
TWITCH_WEBHOOK_SECRET = os.getenv("TWITCH_WEBHOOK_SECRET")
TWITCH_REDIRECT_URI = os.getenv("TWITCH_REDIRECT_URI")
SECRET_KEY = os.getenv("SECRET_KEY", "a_very_secret_key_that_should_be_changed") # Добавь эту переменную в Vercel для безопасности
WIZEBOT_API_KEY = os.getenv("WIZEBOT_API_KEY")

# --- Paths ---
BASE_DIR = pathlib.Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "public"

# --- ГЛОБАЛЬНЫЙ КЛИЕНТ SUPABASE ---
# Создаем один асинхронный клиент, который будет жить все время работы приложения
supabase: AsyncClient = create_client(SUPABASE_URL, SUPABASE_KEY) # <-- ИЗМЕНЕНИЕ ЗДЕСЬ

global_http_client: Optional[httpx.AsyncClient] = None
global_shop_client: Optional[httpx.AsyncClient] = None # <--- ДОБАВИТЬ ЭТУ СТРОКУ
    

# --- FastAPI app ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Объявляем глобальные переменные
    global global_http_client 
    global global_shop_client # <--- ДОБАВИТЬ
    
    logging.info("🚀 Приложение запускается...")
    
    # Лимиты для Supabase
    limits = httpx.Limits(max_keepalive_connections=20, max_connections=100)
    
    # Клиент для Supabase
    global_http_client = httpx.AsyncClient(
        base_url=f"{SUPABASE_URL}/rest/v1",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        timeout=30.0,
        limits=limits
    )

    # Клиент для МАГАЗИНА (Bot-t) - создаем один раз!
    # Используем стандартные лимиты
    global_shop_client = httpx.AsyncClient(timeout=30.0)
    
    yield # Приложение работает
    
    logging.info("👋 Приложение останавливается...")
    
    # Закрываем соединения
    if global_http_client:
        await global_http_client.aclose()
        
    if global_shop_client: # <--- ДОБАВИТЬ ЗАКРЫТИЕ
        await global_shop_client.aclose()

app = FastAPI(title="Quest Bot API")
# app.mount("/public", StaticFiles(directory=TEMPLATES_DIR), name="public")

# --- Middlewares ---
@app.middleware("http")
async def sleep_mode_check(request: Request, call_next):
    path = request.url.path
    
    # 1. БЕЛЫЙ СПИСОК (Пропускаем служебные запросы без проверки базы)
    # /api/v1/user/me пропускаем, чтобы внутри функции проверить ID админа
    # /api/v1/bootstrap пропускаем, чтобы фронтенд узнал, что включен тех. режим
    if path.startswith(("/api/v1/admin", "/admin", "/api/v1/webhooks", "/public", "/favicon.ico", "/api/v1/bootstrap", "/api/v1/user/me")):
        return await call_next(request)

    # 2. АВТО-ОБНОВЛЕНИЕ СТАТУСА ИЗ БАЗЫ (КЭШ 10 СЕКУНД)
    # Это нужно, чтобы Vercel узнал, что ты нажал кнопку, не перезагружая сервер
    now = time.time()
    if (now - sleep_cache["last_checked"]) > 60: 
        try:
            async with httpx.AsyncClient(
                base_url=f"{SUPABASE_URL}/rest/v1",
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
                timeout=5.0
            ) as client:
                resp = await client.get("/settings", params={"key": "eq.sleep_mode", "select": "value"})
                if resp.status_code == 200 and resp.json():
                    data = resp.json()[0].get("value", {})
                    sleep_cache["is_sleeping"] = data.get("is_sleeping", False)
                    sleep_cache["wake_up_at"] = data.get("wake_up_at")
                sleep_cache["last_checked"] = now
        except Exception as e:
            print(f"Ошибка обновления sleep_cache: {e}")

    # 3. ПРОВЕРКА ТЕХ. РЕЖИМА
    if sleep_cache["is_sleeping"]:
        # Проверяем "пропуск" админа (Cookie или параметр в ссылке)
        has_bypass = (
            request.query_params.get("admin_bypass") == "1" or 
            request.cookies.get("maintenance_bypass") == "1"
        )

        # Если это API (например, попытка купить кейс), и это не белый список
        if path.startswith("/api/"):
             # Возвращаем 200 OK (чтобы не было красных ошибок), но говорим JS уходить
             return JSONResponse(
                status_code=200, 
                content={"maintenance": True, "detail": "Maintenance Mode"}
             )
        
        # Если это обычная страница (не главная) и нет пропуска -> РЕДИРЕКТ
        if path not in ["/", "/index.html"] and not has_bypass:
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url="/")

    # 4. Таймер пробуждения (если задан)
    if sleep_cache["wake_up_at"]:
        if time.time() > sleep_cache["wake_up_at"]:
             sleep_cache["is_sleeping"] = False
             sleep_cache["wake_up_at"] = None

    return await call_next(request)
# --- СИСТЕМА УПРАВЛЕНИЯ КЛИЕНТОМ (DEPENDENCY) ---
# --- Глобальная переменная для ленивой инициализации ---
_lazy_supabase_client: Optional[httpx.AsyncClient] = None

async def get_supabase_client() -> httpx.AsyncClient:
    global _lazy_supabase_client
    
    if _lazy_supabase_client is not None and not _lazy_supabase_client.is_closed:
        return _lazy_supabase_client
        
    logging.info("🔌 (Re)Creating global Supabase client...")
    
    # 🔥 ИЗМЕНЕНИЕ: Добавляем keepalive_expiry=10
    # Это заставит клиент закрывать соединения, которые висят без дела больше 10 секунд.
    # Это предотвратит попытки использования "мертвых" соединений.
    limits = httpx.Limits(max_keepalive_connections=5, max_connections=20, keepalive_expiry=10)
    
    _lazy_supabase_client = httpx.AsyncClient(
        base_url=f"{SUPABASE_URL}/rest/v1",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        timeout=10.0, # 🔥 Уменьшаем таймаут до 10 секунд (15 это много)
        limits=limits
    )
    
    return _lazy_supabase_client

# --- Utils ---
def encode_cookie(value: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(value).encode("utf-8")).decode("ascii")

def decode_cookie(value: str | None) -> dict | None:
    if not value: return None
    try: return json.loads(base64.urlsafe_b64decode(value.encode("ascii")).decode("utf-8"))
    except Exception: return None

def is_valid_init_data(init_data: str, valid_tokens: list[str]) -> dict | None:
    try:
        # --- 🔍 DEBUG LOGS ---
        if not init_data:
            logging.error("❌ Validation Error: initData is EMPTY or None!")
            return None
            
        # Логируем первые 50 символов, чтобы понять, что пришло (не паля весь хеш)
        # logging.info(f"🔍 Validating initData (start): {init_data[:50]}...") 
        # ---------------------

        parsed_data = dict(parse_qsl(init_data))
        
        if "hash" not in parsed_data:
            # 🔥 ВОТ ТУТ МЫ УВИДИМ, ЧТО ПРИШЛО, ЕСЛИ НЕТ ХЕША
            logging.error(f"❌ Validation Error: 'hash' not found. Raw data: {init_data}")
            return None
            
        received_hash = parsed_data.pop("hash")
        
        # Сортируем и собираем строку для проверки
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed_data.items()))
        
        for token in valid_tokens:
            if not token: continue
            secret_key = hmac.new("WebAppData".encode(), token.encode(), hashlib.sha256).digest()
            calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
            
            if calculated_hash == received_hash:
                return json.loads(parsed_data.get("user", "{}"))
                
        logging.error("❌ HASH MISMATCH - Подпись не совпала (проверьте BOT_TOKEN).")
        return None
    except Exception as e:
        logging.error(f"Error checking hash: {e}")
        return None
        
def create_twitch_state(init_data: str) -> str:
    return hmac.new(SECRET_KEY.encode(), init_data.encode(), hashlib.sha256).hexdigest()

def validate_twitch_state(state: str, init_data: str) -> bool:
    expected_state = create_twitch_state(init_data)
    return hmac.compare_digest(expected_state, state)

# --- WebSocket Endpoint ---
# --- WebSocket Endpoint ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # 1. Принимаем и регистрируем новое соединение
    await manager.connect(websocket)
    logging.info("WebSocket клиент подключен.")
    try:
        # 2. Оставляем соединение открытым, чтобы слушать события
        while True:
            # Ожидание данных от клиента (можно убрать, если клиент ничего не шлет)
            await websocket.receive_text()
    except WebSocketDisconnect:
        # 3. При отключении клиента, удаляем его из списка
        manager.disconnect(websocket)
        logging.info("WebSocket клиент отключен.")

# --- Telegram Bot/Dispatcher ---
bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
router = Router()
dp = Dispatcher()
dp.include_router(router)

# --- Telegram handlers ---
@router.message(Command("start"))
async def cmd_start(message: types.Message):
    user_id = message.from_user.id
    # 🔥 Очищаем имя тут тоже
    full_name = clean_user_name_text(message.from_user.full_name)
    username = message.from_user.username
    
    try:
        client = await get_background_client()
        # Ставим is_bot_active = True
        await client.post("/users", json={
            "telegram_id": user_id, "username": username, "full_name": full_name, "is_bot_active": True
        }, headers={"Prefer": "resolution=merge-duplicates"})
        
        kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="📱 Открыть профиль", web_app=WebAppInfo(url=f"{WEB_APP_URL}/profile"))]])
        await message.answer("✅ <b>Бот активирован!</b>\nТеперь уведомления будут приходить.", reply_markup=kb)
    except Exception as e:
        logging.error(f"/start error: {e}")

async def check_active_and_reply(message: types.Message):
    """Вспомогательная функция для ответов в ЛС"""
    try:
        client = await get_background_client()
        resp = await client.get("/users", params={"telegram_id": f"eq.{message.from_user.id}", "select": "is_bot_active"})
        data = resp.json()
        
        is_active = False
        if data: is_active = data[0].get("is_bot_active", False)
        
        if not is_active:
            await message.answer("⛔️ Бот не активирован.\nЧтобы получить доступ к функциям, введите команду /start")
    except:
        pass
        
# ⬆️⬆️⬆️ КОНЕЦ ВСТАВКИ ⬆️⬆️⬆️
# --- Вспомогательная функция (вставь в начало index.py) ---
async def try_send_message(chat_id: int, text: str):
    """Безопасная отправка сообщения, чтобы не ломать API при ошибке телеграма"""
    try:
        if bot and chat_id:
            await bot.send_message(chat_id=chat_id, text=text, parse_mode='HTML')
    except Exception as e:
        print(f"Ошибка отправки уведомления {chat_id}: {e}")
        

@router.message(F.text & ~F.command)
async def track_message(message: types.Message):
    """
    Твоя функция с оптимизацией.
    Считает сообщения в ALLOWED_CHAT_ID, но игнорирует слишком короткие.
    """
    
    # 1. Если ALLOWED_CHAT_ID задан (не 0) И текущий чат не равен ему — игнорируем
    if ALLOWED_CHAT_ID != 0 and message.chat.id != ALLOWED_CHAT_ID:
        return

    # 2. Игнорируем ЛС (чтобы не было ошибок и лишних запросов)
    if message.chat.type == 'private':
        return

    # 3. НОВАЯ ПРОВЕРКА: Экономим ресурсы на коротких сообщениях
    # Если текст есть, но он короче 2 символов (1 символ) — выходим.
    # База данных не дергается, деньги Vercel не тратятся.
    if message.text and len(message.text) < 2:
        return

    # -------------------------
    # Дальше твой код без изменений

    user = message.from_user
    full_name = f"{user.first_name} {user.last_name or ''}".strip()

    try:
        # Используем глобальный клиент для скорости
        client = await get_background_client()
        
        await client.post(
            "/rpc/handle_user_message",
            json={
                "p_telegram_id": user.id,
                "p_full_name": full_name,
            }
        )
    except Exception as e:
        # Логируем warning, чтобы не засорять консоль
        logging.warning(f"Не удалось записать сообщение от {user.id}: {e}")

async def get_admin_settings_async_global() -> AdminSettings: # Убрали аргумент supabase
    """(Глобальная) Вспомогательная функция для получения настроек админки (с кэшированием), использующая ГЛОБАЛЬНЫЙ клиент."""
    now = time.time()
    # Проверяем, есть ли валидный кэш
    if admin_settings_cache["settings"] and (now - admin_settings_cache["last_checked"] < ADMIN_SETTINGS_CACHE_DURATION):
        # logging.info("⚙️ Используем кэшированные настройки админа (глобальный).") # Раскомментируй для отладки
        return admin_settings_cache["settings"]

    logging.info("⚙️ Кэш настроек админа истек или пуст, запрашиваем из БД (глобальный клиент)...")
    try:
        # --- ИЗМЕНЕНИЕ: Используем глобальный клиент supabase и новый синтаксис ---
        response = supabase.table("settings").select("value").eq("key", "admin_controls").execute()
        # execute() вызывается без await

        data = response.data # Данные теперь в response.data

        if data and data[0].get('value'):
            settings_data = data[0]['value']
            # --- Логика парсинга boolean значений (остается без изменений) ---
            quest_rewards_raw = settings_data.get('quest_promocodes_enabled', False)
            quest_rewards_bool = quest_rewards_raw if isinstance(quest_rewards_raw, bool) else str(quest_rewards_raw).lower() == 'true'

            challenge_rewards_raw = settings_data.get('challenge_promocodes_enabled', True)
            challenge_rewards_bool = challenge_rewards_raw if isinstance(challenge_rewards_raw, bool) else str(challenge_rewards_raw).lower() == 'true'

            challenges_raw = settings_data.get('challenges_enabled', True)
            challenges_bool = challenges_raw if isinstance(challenges_raw, bool) else str(challenges_raw).lower() == 'true'

            quests_raw = settings_data.get('quests_enabled', True)
            quests_bool = quests_raw if isinstance(quests_raw, bool) else str(quests_raw).lower() == 'true'

            checkpoint_raw = settings_data.get('checkpoint_enabled', False)
            checkpoint_bool = checkpoint_raw if isinstance(checkpoint_raw, bool) else str(checkpoint_raw).lower() == 'true'
            # --- Конец логики парсинга ---

            # Создаем объект настроек
            loaded_settings = AdminSettings(
                skin_race_enabled=settings_data.get('skin_race_enabled', True),
                slider_order=settings_data.get('slider_order', ["skin_race", "cauldron", "auction"]),
                challenge_promocodes_enabled=challenge_rewards_bool,
                quest_promocodes_enabled=quest_rewards_bool,
                challenges_enabled=challenges_bool,
                quests_enabled=quests_bool,
                checkpoint_enabled=checkpoint_bool,
                menu_banner_url=settings_data.get('menu_banner_url', "https://i.postimg.cc/1Xkj2RRY/sagluska-1200h600.png"),
                checkpoint_banner_url=settings_data.get('checkpoint_banner_url', "https://i.postimg.cc/9046s7W0/cekpoint.png"),
                auction_enabled=settings_data.get('auction_enabled', False), 
                auction_banner_url=settings_data.get('auction_banner_url', "https://i.postimg.cc/6qpWq0dW/aukcion.png"), 
                weekly_goals_banner_url=settings_data.get('weekly_goals_banner_url', "https://i.postimg.cc/T1j6hQGP/1200-324.png"), 
                weekly_goals_enabled=settings_data.get('weekly_goals_enabled', False),
                quest_schedule_override_enabled=settings_data.get('quest_schedule_override_enabled', False),
                quest_schedule_active_type=settings_data.get('quest_schedule_active_type', 'twitch')
            )

            # Сохраняем в кэш
            admin_settings_cache["settings"] = loaded_settings
            admin_settings_cache["last_checked"] = now
            logging.info("✅ Настройки админа загружены и закэшированы (глобальный).")
            return loaded_settings
        else:
            logging.warning("Настройки 'admin_controls' не найдены в БД (глобальный), используем дефолтные и кэшируем их.")
            # Если в базе нет, кэшируем дефолтные
            default_settings = AdminSettings()
            admin_settings_cache["settings"] = default_settings
            admin_settings_cache["last_checked"] = now
            return default_settings

    except Exception as e:
        logging.error(f"Не удалось получить admin_settings (глобальный клиент): {e}", exc_info=True)
        # Возвращаем дефолтные настройки и НЕ кэшируем при ошибке
        admin_settings_cache["settings"] = None
        admin_settings_cache["last_checked"] = 0
        return AdminSettings()

# --- НОВЫЙ КЭШ ДЛЯ НАСТРОЕК ГРИНДА ---
grind_settings_cache = {
    "settings": None, 
    "last_checked": 0 
}
GRIND_SETTINGS_CACHE_DURATION = 300 # Кэшировать настройки на 5 минут

async def get_grind_settings_async_global() -> GrindSettings:
    """Получает настройки гринда (с кэшированием) из Supabase, используя twitch_ префиксы."""
    now = time.time()
    if grind_settings_cache["settings"] and (now - grind_settings_cache["last_checked"] < GRIND_SETTINGS_CACHE_DURATION):
        return grind_settings_cache["settings"]

    logging.info("⚙️ Кэш настроек гринда истек, запрашиваем из БД...")
    try:
        response = supabase.table("grind_settings").select("*").eq("id", 1).limit(1).execute()
        data = response.data

        if data and data[0]:
            settings_data = data[0]
            loaded_settings = GrindSettings(
                twitch_status_boost_coins=settings_data.get('twitch_status_boost_coins', 0.5),
                twitch_status_free_tickets=settings_data.get('twitch_status_free_tickets', 5),
                ref_boost_coins_per_user=settings_data.get('ref_boost_coins_per_user', 0.1),
            )
            grind_settings_cache["settings"] = loaded_settings
            grind_settings_cache["last_checked"] = now
            return loaded_settings
        else:
            default_settings = GrindSettings()
            grind_settings_cache["settings"] = default_settings
            grind_settings_cache["last_checked"] = now
            return default_settings

    except Exception as e:
        logging.error(f"Не удалось получить grind_settings: {e}", exc_info=True)
        grind_settings_cache["settings"] = None
        grind_settings_cache["last_checked"] = 0
        return GrindSettings()


async def get_ticket_reward_amount_global(action_type: str) -> int:
    """(Глобальная) Получает количество билетов для награды из таблицы reward_rules."""
    try:
        # ИСПОЛЬЗУЕМ ГЛОБАЛЬНЫЙ КЛИЕНТ 'supabase'
        resp = supabase.table("reward_rules").select("ticket_amount").eq("action_type", action_type).limit(1).execute()
        
        data = resp.data # Используем .data
        if data and 'ticket_amount' in data[0]:
            return data[0]['ticket_amount']
        
        logging.warning(f"(Global) Правило награды для '{action_type}' не найдено в таблице reward_rules. Используется значение по умолчанию: 1.")
        return 1
        
    except Exception as e:
        logging.error(f"(Global) Ошибка при получении правила награды для '{action_type}': {e}. Используется значение по умолчанию: 1.")
        return 1

# Новый эндпоинт для быстрой загрузки всего сразу
@app.post("/api/v1/bootstrap")
async def bootstrap_app(
    request_data: InitDataRequest, 
    background_tasks: BackgroundTasks, # <--- 1. ОСТАВИЛИ КАК ЕСТЬ
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    🚀 OPTIMIZED: Загружает ВСЕ данные + Статус P2P трейда.
    Автоматически регистрирует пользователя, если его нет в базе.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")

    telegram_id = user_info["id"]

   # --- 🛡️ ЗАЩИТА: ПРОВЕРКА ТЕХ. РЕЖИМА 🛡️ ---
    # Если режим включен и ты НЕ админ — отдаем 200 OK + maintenance: true
    if sleep_cache["is_sleeping"] and telegram_id not in ADMIN_IDS:
        return JSONResponse(
            status_code=200, 
            content={"maintenance": True, "detail": "Maintenance Mode"}
        )
    
    # --- 🔥 2. ОСТАВИЛИ ВАШ БЛОК ЗДЕСЬ 🔥 ---
    # Запускаем проверку Twitch (ник, подписка) в фоне при каждом запуске приложения
    background_tasks.add_task(silent_update_twitch_user, telegram_id)
    # --------------------------------------
    
    try:
        # 1. Запускаем все запросы ПАРАЛЛЕЛЬНО (Добавили Task I)
        results = await asyncio.gather(
            # A. Настройки админа
            get_admin_settings_async_global(),
            
            # B. Данные пользователя (RPC)
            supabase.post("/rpc/get_user_dashboard_data", json={"p_telegram_id": telegram_id}),
            
            # C. Список квестов
            supabase.post("/rpc/get_available_quests_for_user", json={"p_telegram_id": telegram_id}),
            
            # D. Недельные цели
            supabase.post("/rpc/get_user_weekly_goals_status", json={"p_user_id": telegram_id}),
            
            # E. Статус Котла
            supabase.get("/pages_content", params={"page_name": "eq.cauldron_event", "select": "content", "limit": "1"}),

            # F. Реферальные данные
            supabase.get("/users", params={"telegram_id": f"eq.{telegram_id}", "select": "referrer_id, referral_activated_at, bott_internal_id, bott_ref_id"}),
            
            # G. Подсчет рефералов
            supabase.get(
                "/users", 
                params={"referrer_id": f"eq.{telegram_id}", "referral_activated_at": "not.is.null", "select": "telegram_id", "limit": "1"},
                headers={"Prefer": "count=exact"} 
            ),

            # H. Статус стрима
            supabase.get("/settings", params={"key": "eq.twitch_stream_status", "select": "value"}),

            # I. 🔥 НОВОЕ: Статус P2P трейда (для мгновенного обновления плитки)
            supabase.get(
                "/p2p_trades",
                params={
                    "user_id": f"eq.{telegram_id}",
                    "status": "in.(pending,active,review)",
                    "order": "created_at.desc",
                    "limit": 1
                }
            ),
            
            return_exceptions=True
        )
        
        # Распаковка результатов (добавили trade_res в конец)
        (settings_res, user_res, quests_res, goals_res, cauldron_res, user_extra_res, referral_count_res, stream_res, trade_res) = results

        # --- 1. Обработка Настроек ---
        if isinstance(settings_res, Exception):
            logging.error(f"[Bootstrap] Settings error: {settings_res}")
            menu_content = {} 
        else:
            menu_content = settings_res.dict() if hasattr(settings_res, 'dict') else settings_res

        # --- 2. Обработка Пользователя (С АВТО-РЕГИСТРАЦИЕЙ) ---
        user_data = {}
        rpc_data = None
        
        if not isinstance(user_res, Exception) and user_res.status_code == 200:
            rpc_data = user_res.json()

        # 🔥 ЕСЛИ ЮЗЕРА НЕТ — СОЗДАЕМ ЕГО
        if not rpc_data or not rpc_data.get('profile'):
            logging.info(f"🆕 Новый пользователь {telegram_id}...")
            
            raw_full_name = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip()
            full_name_tg = clean_user_name_text(raw_full_name) 
            username_tg = user_info.get("username")
            
            await supabase.post(
                "/users",
                json={
                    "telegram_id": telegram_id,
                    "username": username_tg,
                    "full_name": full_name_tg
                },
                headers={"Prefer": "resolution=merge-duplicates"}
            )
            
            user_data = {
                "telegram_id": telegram_id,
                "full_name": full_name_tg,
                "username": username_tg,
                "tickets": 0,
                "coins": 0,
                "is_bot_active": False,
                "challenge": None,
                "event_participations": {},
            }
        else:
            user_data = rpc_data.get('profile', {}) or {}
            user_data['challenge'] = rpc_data.get('challenge')
            user_data['event_participations'] = rpc_data.get('event_participations', {})

        # --- Дополнительные поля ---
        user_data['is_admin'] = telegram_id in ADMIN_IDS
        user_data['is_checkpoint_globally_enabled'] = menu_content.get('checkpoint_enabled', False)
        user_data['quest_rewards_enabled'] = menu_content.get('quest_promocodes_enabled', False)
        
        # Статус стрима (Task H)
        user_data['is_stream_online'] = False
        if not isinstance(stream_res, Exception) and stream_res.status_code == 200:
            s_data = stream_res.json()
            if s_data:
                user_data['is_stream_online'] = s_data[0].get('value', False)

        # Подписка
        user_data['is_telegram_subscribed'] = True if user_data.get('referral_activated_at') else False

        # Реферальные данные (Task F)
        if not isinstance(user_extra_res, Exception) and user_extra_res.status_code == 200:
            extra_data_list = user_extra_res.json()
            if extra_data_list:
                user_data.update(extra_data_list[0])

        # Счетчик рефералов (Task G)
        user_data['active_referrals_count'] = 0
        if not isinstance(referral_count_res, Exception) and referral_count_res.status_code in [200, 206]:
            content_range = referral_count_res.headers.get("Content-Range")
            if content_range:
                try:
                    count_val = content_range.split('/')[-1]
                    user_data['active_referrals_count'] = int(count_val) if count_val != '*' else 0
                except: pass

        # 🔥 ОБРАБОТКА P2P ТРЕЙДА (Task I) 🔥
        active_trade_status = "none"
        if not isinstance(trade_res, Exception) and trade_res.status_code == 200:
            tr_data = trade_res.json()
            if tr_data:
                trade = tr_data[0]
                db_status = trade.get("status")
                
                # Маппинг статусов P2P
                if db_status == "pending":
                    active_trade_status = "creating"
                elif db_status == "active":
                    active_trade_status = "confirming"
                elif db_status == "review":
                    active_trade_status = "sending"
        
        # Кладем статус в user_data, чтобы фронт его увидел сразу
        user_data['active_trade_status'] = active_trade_status

        # --- 3. Обработка Квестов (Task C) ---
        quests_list = []
        if isinstance(quests_res, Exception) or quests_res.status_code != 200:
            logging.error(f"[Bootstrap] Quests error: {quests_res}")
        else:
            raw_quests = quests_res.json()
            try: quests_list = fill_missing_quest_data(raw_quests)
            except: quests_list = raw_quests

        # --- 4. Обработка Целей (Task D) ---
        goals_data = {"system_enabled": menu_content.get('weekly_goals_enabled', False), "goals": []}
        if isinstance(goals_res, Exception) or goals_res.status_code != 200:
            logging.error(f"[Bootstrap] Goals error: {goals_res}")
        else:
            goals_data.update(goals_res.json())
            goals_data["system_enabled"] = menu_content.get('weekly_goals_enabled', False)

        # --- 5. Обработка Котла (Task E) ---
        cauldron_data = {"is_visible_to_users": False}
        if isinstance(cauldron_res, Exception) or cauldron_res.status_code != 200:
            logging.error(f"[Bootstrap] Cauldron error: {cauldron_res}")
        else:
            c_list = cauldron_res.json()
            if c_list and c_list[0].get('content'):
                cauldron_data = c_list[0]['content']

        # Возврат полного набора данных
        return {
            "user": user_data,
            "menu": menu_content,
            "quests": quests_list,
            "weekly_goals": goals_data,
            "cauldron": cauldron_data
        }

    except Exception as e:
        logging.error(f"🔥 CRITICAL Bootstrap Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Bootstrap Failed: {str(e)}")
        
# --- НОВЫЙ ЭНДПОИНТ: Получение списка всех квестов или челленджей ---

@app.post("/api/v1/admin/events/cauldron/reward_status")
async def update_cauldron_reward_status(
    request_data: CauldronRewardStatusRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # Обновляем конкретную запись в таблице участников
        await supabase.patch(
            "/cauldron_participants",
            params={"user_id": f"eq.{request_data.user_id}"},
            json={"is_reward_sent": request_data.is_sent}
        )
        return {"message": "Статус обновлен"}

    except Exception as e:
        logging.error(f"Error updating status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка обновления")

@app.post("/api/v1/admin/events/cauldron/participants")
async def get_cauldron_participants(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Возвращает список участников с живой проверкой подписки на канал из ENV.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    # 1. Получаем ID канала из переменных окружения
    channel_id_env = os.getenv("TG_QUEST_CHANNEL_ID")
    target_channel_id = None
    
    if channel_id_env:
        try:
            target_channel_id = int(channel_id_env)
        except ValueError:
            logging.error(f"TG_QUEST_CHANNEL_ID должен быть числом! Получено: {channel_id_env}")
    else:
        logging.warning("Переменная TG_QUEST_CHANNEL_ID не найдена в настройках Vercel!")

    try:
        # 2. Запрашиваем данные из базы
        # Используем users(*) чтобы вытянуть все данные юзера
        response = await supabase.get(
            "/cauldron_participants",
            params={
                "select": "*, users(full_name, username, trade_link, twitch_login)", 
                "order": "total_contribution.desc"
            }
        )
        data = response.json()
        
        result = []
        
        # 3. Проверяем подписку
        for item in data:
            user = item.get("users", {}) or {}
            user_tg_id = item.get("user_id")
            
            is_subscribed = False
            
            # Если ID канала и ID юзера есть - проверяем
            if target_channel_id and user_tg_id:
                try:
                    chat_member = await bot.get_chat_member(chat_id=target_channel_id, user_id=user_tg_id)
                    if chat_member.status in ["member", "administrator", "creator"]:
                        is_subscribed = True
                except Exception:
                    # Ошибки игнорируем (например, юзер заблокировал бота или бот не админ)
                    # Можно раскомментировать для отладки:
                    # logging.warning(f"Ошибка проверки подписки юзера {user_tg_id}: {e}")
                    pass

            result.append({
                "user_id": user_tg_id,
                "total_contribution": item.get("total_contribution", 0),
                "is_reward_sent": item.get("is_reward_sent", False),
                "full_name": user.get("full_name") or "Unknown",
                "username": user.get("username"),
                "trade_link": user.get("trade_link"),
                "twitch_login": user.get("twitch_login"),
                "is_subscribed": is_subscribed
            })
            
        return result

    except Exception as e:
        logging.error(f"Error fetching participants: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка загрузки списка")

@app.post("/api/v1/admin/actions/list_entities")
async def admin_list_entities(
    request_data: AdminEntityListRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Возвращает список активных квестов или челленджей для принудительного выполнения."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        if request_data.entity_type == 'quest':
            resp = await supabase.get(
                "/quests",
                params={"is_active": "eq.true", "select": "id,title", "order": "title.asc"}
            )
            return resp.json()
        elif request_data.entity_type == 'challenge':
            resp = await supabase.get(
                "/challenges",
                params={"is_active": "eq.true", "select": "id,description", "order": "id.asc"}
            )
            # Переименуем 'description' в 'title' для удобства фронтенда
            return [{"id": c["id"], "title": c["description"]} for c in resp.json()]
        else:
            raise HTTPException(status_code=400, detail="Неверный тип.")
            
    except Exception as e:
        logging.error(f"Ошибка при получении списка (админ): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось получить список.")



# --- НОВЫЙ ЭНДПОИНТ: Принудительное выполнение ---
@app.post("/api/v1/admin/actions/force_complete")
async def admin_force_complete(
    request_data: AdminForceCompleteRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Принудительно выполняет квест или челлендж для пользователя."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    p_user_id = request_data.user_id
    p_entity_id = request_data.entity_id
    entity_type = request_data.entity_type # Сохраняем тип для логирования

    try:
        rpc_function = ""
        payload = {}

        if entity_type == 'quest':
            rpc_function = "/rpc/admin_force_complete_quest"
            payload = {"p_user_id": p_user_id, "p_quest_id": p_entity_id}
            message_on_success = "Квест принудительно выполнен. Пользователь может забрать награду."

        elif entity_type == 'challenge':
            rpc_function = "/rpc/admin_force_complete_challenge"
            payload = {"p_user_id": p_user_id, "p_challenge_id": p_entity_id}
            message_on_success = "Челлендж принудительно выполнен. Пользователь может забрать награду."
        else:
            raise HTTPException(status_code=400, detail="Неверный тип.")

        # --- ИЗМЕНЕНИЕ ЗДЕСЬ: Вызываем RPC и проверяем ответ ---
        logging.info(f"Вызов RPC '{rpc_function}' с payload: {payload}")
        response = await supabase.post(rpc_function, json=payload)

        # Эта строка выбросит исключение HTTPStatusError для ответов 4xx/5xx (и, возможно, 3xx)
        response.raise_for_status()
        logging.info(f"Успешный ответ от RPC '{rpc_function}'. Status: {response.status_code}")
        # --- КОНЕЦ ИЗМЕНЕНИЯ ---

        return {"message": message_on_success}

    except httpx.HTTPStatusError as e:
        # --- ИЗМЕНЕНИЕ ЗДЕСЬ: Улучшенная обработка ошибок ---
        error_details = f"Unknown database error (Status: {e.response.status_code})"
        try:
            # Пытаемся получить детальное сообщение от Supabase
            error_details = e.response.json().get("message", e.response.text)
        except json.JSONDecodeError:
            error_details = e.response.text # Если ответ не JSON

        # Логируем полную ошибку
        logging.error(f"❌ ОШИБКА от Supabase при вызове '{rpc_function}': {e.response.status_code} - {error_details}")

        # Пробрасываем ошибку Supabase на фронтенд с кодом 400
        # Код 300 тоже попадет сюда и будет возвращен как 400 с деталями
        raise HTTPException(status_code=400, detail=f"Ошибка базы данных: {error_details}")
        # --- КОНЕЦ ИЗМЕНЕНИЯ ---

    except HTTPException as http_e:
         # Если мы сами выбросили HTTPException (например, "Неверный тип.")
         raise http_e
    except Exception as e:
        # Ловим все остальные непредвиденные ошибки
        logging.error(f"Непредвиденная ошибка при принудительном выполнении ({entity_type} ID: {p_entity_id} для user: {p_user_id}): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")
        
# Где-нибудь рядом с другими эндпоинтами
@app.post("/api/v1/admin/verify_password")
async def verify_admin_password(request: Request, data: dict = Body(...)):
    # ВАЖНО: Храните пароль в переменных окружения, а не в коде!
    # На Vercel это настраивается в Settings -> Environment Variables
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "your_default_fallback_password")
    
    submitted_password = data.get("password")
    
    if submitted_password == ADMIN_PASSWORD:
        return {"success": True}
    else:
        return JSONResponse(content={"success": False, "detail": "Incorrect password"}, status_code=401)

# ЭТО НОВАЯ ФУНКЦИЯ, КОТОРУЮ НУЖНО ДОБАВИТЬ
async def process_webhook_in_background(update: dict):
    """
    Фоновая обработка: просто передает данные в Aiogram.
    Логику записи берет на себя функция track_message.
    """
    # logging.info("--- ЗАПУЩЕНА ФОНОВАЯ ОБРАБОТКА webhook ---")
    
    # 1. Передаем обновление в бота (Aiogram)
    # Это запустит нужные хендлеры: cmd_start, open_notification_settings или track_message
    try:
        telegram_update = types.Update(**update)
        await dp.feed_update(bot, telegram_update)
    except Exception as e:
        logging.error(f"Ошибка в process_webhook_in_background: {e}")

@app.post("/api/v1/webhook")
async def telegram_webhook(
    update: dict,
    background_tasks: BackgroundTasks
):
    """
    SUPER-FAST WEBHOOK (10-20ms response time)
    """
    # 1. СРАЗУ возвращаем ответ Телеграму, если это редактирование
    if "edited_message" in update or "channel_post" in update:
        return JSONResponse(content={"status": "ignored"})

    # 2. Быстрая фильтрация чата (как делали раньше)
    if "message" in update:
        chat_id = update["message"].get("chat", {}).get("id")
        if ALLOWED_CHAT_ID != 0 and chat_id != ALLOWED_CHAT_ID and update["message"].get("chat", {}).get("type") != "private":
            return JSONResponse(content={"status": "ignored"})

    # 3. 🔥 ГЛАВНОЕ ИЗМЕНЕНИЕ: Не ждем Aiogram!
    # Мы создаем объект обновления и кидаем его в фон.
    # Сама функция завершится мгновенно.
    
    try:
        # Превращаем JSON в объект Aiogram (это быстро)
        update_obj = types.Update(**update)
        
        # Кидаем обработку в BackgroundTasks
        # ВАЖНО: Мы НЕ пишем await dp.feed... мы добавляем задачу.
        background_tasks.add_task(feed_update_safe, update_obj)
        
    except Exception as e:
        # Даже если ошибка парсинга, отвечаем ОК, чтобы Телеграм не спамил повторами
        print(f"Update parse error: {e}")

    return JSONResponse(content={"status": "ok"})

# --- Вспомогательная функция-обертка ---
async def feed_update_safe(update_obj):
    """Эта функция будет работать, когда Телеграм уже получил 'OK'"""
    try:
        await dp.feed_webhook_update(bot, update_obj)
    except Exception as e:
        logging.error(f"Background processing error: {e}")

async def ensure_twitch_cache(supabase: httpx.AsyncClient):
    """Обновляет кэш настроек Twitch, если он устарел."""
    now = time.time()
    if now - twitch_settings_cache["last_updated"] < TWITCH_CACHE_TTL:
        return

    # Запрашиваем все настройки ПАРАЛЛЕЛЬНО (это ускоряет загрузку в 3 раза)
    logging.info("🔄 Обновление кэша настроек Twitch...")
    
    task_rewards = supabase.get("/twitch_rewards", params={"select": "title,id,is_active,notify_admin,reward_type,reward_amount"})
    task_cauldron = supabase.get("/pages_content", params={"page_name": "eq.cauldron_event", "select": "content"})
    task_roulette = supabase.get("/roulette_prizes", params={"select": "reward_title"})

    # Ждем все ответы
    try:
        r_rewards, r_cauldron, r_roulette = await asyncio.gather(task_rewards, task_cauldron, task_roulette)

        # 1. Обычные награды
        twitch_settings_cache["rewards_map"] = {
            r["title"]: r for r in r_rewards.json()
        } if r_rewards.status_code == 200 else {}

        # 2. Котел
        cauldron_titles = set()
        if r_cauldron.status_code == 200 and r_cauldron.json():
            content = r_cauldron.json()[0].get("content", {})
            triggers = content.get("twitch_reward_triggers", [])
            cauldron_titles = {t.get("title") for t in triggers}
        twitch_settings_cache["cauldron_titles"] = cauldron_titles

        # 3. Рулетка
        roulette_titles = set()
        if r_roulette.status_code == 200:
             roulette_titles = {p.get("reward_title") for p in r_roulette.json()}
        twitch_settings_cache["roulette_titles"] = roulette_titles

        twitch_settings_cache["last_updated"] = now
        logging.info("✅ Кэш Twitch обновлен.")
        
    except Exception as e:
        logging.error(f"Ошибка обновления кэша Twitch: {e}")

async def auto_sync_vips_logic(supabase: httpx.AsyncClient):
    """
    🔄 Магическая функция: Обновляет токен стримера и синхронизирует VIP-ов.
    """
    broadcaster_id = os.getenv("TWITCH_BROADCASTER_ID")
    if not broadcaster_id: return

    # 1. Достаем Refresh Token стримера из базы
    resp = await supabase.get(
        "/users", 
        params={"twitch_id": f"eq.{broadcaster_id}", "select": "twitch_refresh_token"}
    )
    data = resp.json()
    if not data or not data[0].get("twitch_refresh_token"):
        logging.error("❌ Не найден Refresh Token стримера. Зайдите в бота через Twitch!")
        return

    old_refresh_token = data[0]["twitch_refresh_token"]

    # 2. Обновляем токен через Twitch API
    async with httpx.AsyncClient() as client:
        refresh_resp = await client.post(
            "https://id.twitch.tv/oauth2/token",
            data={
                "client_id": TWITCH_CLIENT_ID,
                "client_secret": TWITCH_CLIENT_SECRET,
                "grant_type": "refresh_token",
                "refresh_token": old_refresh_token
            }
        )
        
        if refresh_resp.status_code != 200:
            logging.error(f"❌ Ошибка обновления токена: {refresh_resp.text}")
            return

        tokens = refresh_resp.json()
        new_access_token = tokens["access_token"]
        new_refresh_token = tokens.get("refresh_token", old_refresh_token)

        # 3. Сохраняем новые ключи в базу (чтобы в следующий раз тоже сработало)
        await supabase.patch(
            "/users",
            params={"twitch_id": f"eq.{broadcaster_id}"},
            json={"twitch_access_token": new_access_token, "twitch_refresh_token": new_refresh_token}
        )

        # 4. Скачиваем список VIP-ов
        headers = {"Authorization": f"Bearer {new_access_token}", "Client-Id": TWITCH_CLIENT_ID}
        vips_resp = await client.get(
            f"https://api.twitch.tv/helix/channels/vips?broadcaster_id={broadcaster_id}&first=100",
            headers=headers
        )
        
        if vips_resp.status_code == 200:
            vips_data = vips_resp.json().get("data", [])
            vip_logins = [v["user_login"].lower() for v in vips_data]
            
            if vip_logins:
                # 5. Проставляем статус VIP в базе
                await supabase.patch(
                    "/users",
                    json={"twitch_status": "vip"},
                    params={"twitch_login": f"in.({','.join(vip_logins)})"}
                )
                logging.info(f"✅ Авто-синхронизация: Обновлено {len(vip_logins)} VIP-ов!")
        else:
            logging.error(f"Ошибка получения VIP: {vips_resp.text}")

async def silent_update_twitch_user(telegram_id: int):
    """
    Фоновая задача: Обновляет никнейм и статус подписки.
    Логика:
    1. Если зашел первый раз (или давно не было проверки) -> Проверяем СРАЗУ.
    2. Если недавно проверяли (< 5 мин) -> Пропускаем (экономим запросы).
    """
    CACHE_TTL_SECONDS = 300 # 5 минут

    try:
        # 1. Получаем данные пользователя
        client = await get_background_client()
        user_resp = await client.get(
            "/users", 
            params={
                "telegram_id": f"eq.{telegram_id}", 
                "select": "twitch_id, twitch_refresh_token, twitch_status, last_twitch_sync"
            }
        )
        user_data = user_resp.json()
        
        if not user_data or not user_data[0].get("twitch_refresh_token"):
            return # Не привязан Twitch

        user = user_data[0]
        last_sync_str = user.get("last_twitch_sync")

        # --- 🔥 ЛОГИКА ПРОВЕРКИ + ЛОГИ ---
        if last_sync_str:
            try:
                last_sync_dt = datetime.fromisoformat(last_sync_str.replace('Z', '+00:00'))
                elapsed = (datetime.now(timezone.utc) - last_sync_dt).total_seconds()
                
                if elapsed < CACHE_TTL_SECONDS:
                    # Лог, чтобы ты видел, что все работает, но запрос пропущен
                    logging.info(f"⏳ [Twitch] Пропуск для {telegram_id}: кэш свежий ({int(elapsed)} сек).")
                    return 
                else:
                    logging.info(f"🔄 [Twitch] Кэш истек для {telegram_id}. Обновляем...")
            except ValueError:
                logging.warning(f"⚠️ [Twitch] Ошибка даты для {telegram_id}, обновляем принудительно.")
        else:
            logging.info(f"🆕 [Twitch] Первичная проверка для {telegram_id}. Обновляем мгновенно!")
        # --------------------------------

        refresh_token = user["twitch_refresh_token"]
        twitch_id = user["twitch_id"]
        current_status = user.get("twitch_status")

        # 2. Обновляем токен (Refresh -> Access)
        async with httpx.AsyncClient() as tw_client:
            token_resp = await tw_client.post(
                "https://id.twitch.tv/oauth2/token",
                data={
                    "client_id": TWITCH_CLIENT_ID,
                    "client_secret": TWITCH_CLIENT_SECRET,
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token
                }
            )
            
            # 🔥 ВАЖНЫЙ ЛОГ ОШИБКИ
            if token_resp.status_code != 200:
                logging.error(f"❌ [Twitch Error] Не удалось обновить токен для {telegram_id}: {token_resp.text}")
                return

            new_tokens = token_resp.json()
            access_token = new_tokens["access_token"]
            new_refresh = new_tokens.get("refresh_token", refresh_token)
            
            headers = {"Authorization": f"Bearer {access_token}", "Client-Id": TWITCH_CLIENT_ID}

            # 3. Узнаем АКТУАЛЬНЫЙ никнейм
            user_api_resp = await tw_client.get("https://api.twitch.tv/helix/users", headers=headers)
            twitch_login_actual = None
            if user_api_resp.status_code == 200:
                twitch_login_actual = user_api_resp.json()["data"][0]["login"]

            # 4. Проверяем подписку
            broadcaster_id = os.getenv("TWITCH_BROADCASTER_ID")
            new_status = "none"
            if broadcaster_id:
                try:
                    sub_resp = await tw_client.get(
                        f"https://api.twitch.tv/helix/subscriptions/user?broadcaster_id={broadcaster_id}&user_id={twitch_id}",
                        headers=headers
                    )
                    if sub_resp.status_code == 200:
                        new_status = "subscriber"
                    elif sub_resp.status_code == 404:
                        new_status = "none"
                except: pass
            
            # Если он VIP, не понижаем его
            if current_status == "vip":
                new_status = "vip"

            # 5. Обновляем базу
            update_data = {
                "twitch_access_token": access_token,
                "twitch_refresh_token": new_refresh,
                "twitch_status": new_status,
                "last_twitch_sync": datetime.now(timezone.utc).isoformat()
            }
            if twitch_login_actual:
                update_data["twitch_login"] = twitch_login_actual

            await client.patch("/users", params={"telegram_id": f"eq.{telegram_id}"}, json=update_data)
            
            # Лог успешного обновления
            logging.info(f"✅ [Twitch] Успех для {telegram_id}: Ник={twitch_login_actual}, Статус={new_status}")

    except Exception as e:
        logging.error(f"❌ [Twitch Critical] Ошибка функции: {e}")
        
# --- 1. ФУНКЦИЯ ФОНОВОЙ ОБРАБОТКИ (Вставляетcя ПЕРЕД эндпоинтом) ---
async def process_twitch_notification_background(data: dict, message_id: str):
    if not message_id: return

    # Целевой чат для уведомлений
    TARGET_CHAT_ID = -1002996604964 

    # 👇 1. ОПТИМИЗАЦИЯ: Используем глобального клиента
    try:
        supabase = await get_background_client()
    except Exception as e:
        logging.error(f"Error getting DB client: {e}")
        return

    # 1. Защита от дублей
    try:
        dup_resp = await supabase.post("/processed_webhooks", json={"id": message_id}, headers={"Prefer": "return=minimal"})
        if dup_resp.status_code == 409: return 
    except Exception: return

    # 2. Определяем тип события
    subscription = data.get("subscription", {})
    event_type = subscription.get("type")
    event_data = data.get("event", {})

    # --- ЛОГИКА ДЛЯ СТАТУСА СТРИМА ---
    if event_type == "stream.online":
        logging.info("🟣 Стрим ONLINE! Обновляем статус и запускаем рассылку.")
        
        # 1. Сохраняем статус в settings
        await supabase.post("/settings", json={"key": "twitch_stream_status", "value": True}, headers={"Prefer": "resolution=merge-duplicates"})

        # 🔥 [НОВОЕ] ВКЛЮЧАЕМ CRON-ЗАДАЧУ
        await toggle_cron_job(True)

        # --- АВТО-СИНХРОНИЗАЦИЯ VIP ---
        try:
            logging.info("🔄 Запуск авто-обновления VIP-ов...")
            await auto_sync_vips_logic(supabase)
        except Exception as e:
            logging.error(f"⚠️ Ошибка при авто-синхронизации VIP: {e}")
        
        # 2. Формируем сообщение
        msg_text = (
            "🟣 <b>Стрим НАЧАЛСЯ!</b>\n\n"
            "Залетайте на трансляцию, лутайте баллы и участвуйте в ивентах! 🚀\n\n"
            "https://www.twitch.tv/hatelove_ttv"
        )
        
        # 3. ЗАПУСКАЕМ МАССОВУЮ РАССЫЛКУ
        await broadcast_notification_task(msg_text, "notify_stream_start")
        return
        

    elif event_type == "stream.offline":
        logging.info("⚫ Стрим OFFLINE.")
        await supabase.post("/settings", json={"key": "twitch_stream_status", "value": False}, headers={"Prefer": "resolution=merge-duplicates"})
        # 🔥 [НОВОЕ] ВЫКЛЮЧАЕМ CRON-ЗАДАЧУ
        await toggle_cron_job(False)
        return

    # 2. ОПТИМИЗАЦИЯ: Обновляем и читаем кэш
    await ensure_twitch_cache(supabase)
    
    # 👇👇👇 ИСПРАВЛЕНИЕ: Сдвигаем этот блок ВЛЕВО (на один уровень с await выше) 👇👇👇
    event_data = data.get("event", {})
    reward_title = event_data.get("reward", {}).get("title", "Unknown")
    
    # --- БЫСТРАЯ ПРОВЕРКА ЧЕРЕЗ КЭШ ---
    
    # А. Проверка на "Котел" (быстро)
    is_cauldron = reward_title in twitch_settings_cache["cauldron_titles"]
    
    # Б. Проверка на "Рулетку" (быстро)
    is_roulette = reward_title in twitch_settings_cache["roulette_titles"]
    
    # В. Проверка обычных наград (МГНОВЕННЫЙ ОТСЕВ)
    cached_reward = twitch_settings_cache["rewards_map"].get(reward_title)
    
    # Если это НЕ котел, НЕ рулетка, и мы знаем эту награду, но она ОТКЛЮЧЕНА
    if not is_cauldron and not is_roulette and cached_reward:
        if not cached_reward.get("is_active"):
            logging.info(f"⛔ [CACHE] Награда '{reward_title}' отключена. Игнорируем (без запросов к юзеру).")
            return 

    # ==========================================
    # Только если проверка прошла, грузим юзера
    # ==========================================
    
    twitch_login = event_data.get("user_login", "unknown").lower()
    user_input = event_data.get("user_input")

    # 3. Получаем данные пользователя
    user_resp = await supabase.get(
        "/users", 
        params={
            "twitch_login": f"ilike.{twitch_login}", 
            "select": "telegram_id, full_name, trade_link, daily_message_count, daily_uptime_minutes, weekly_message_count, weekly_uptime_minutes, monthly_message_count, monthly_uptime_minutes", 
            "limit": 1
        }
    )
    user_data = user_resp.json()
    user_record = user_data[0] if user_data else None
    user_id = user_record.get("telegram_id") if user_record else None
    user_display_name = user_record.get("full_name") if user_record else twitch_login

    # --- 4. ЛОГИКА ОБРАБОТКИ (С ИСПОЛЬЗОВАНИЕМ КЭША) ---

    # === ВЕТКА 1: ВЕДЬМИНСКИЙ КОТЕЛ ===
    if is_cauldron:
        # Запрашиваем настройки котла ТОЛЬКО если знаем, что это котел
        cauldron_resp = await supabase.get(
            "/pages_content",
            params={"page_name": "eq.cauldron_event", "select": "content", "limit": 1}
        )
        cauldron_settings = cauldron_resp.json()[0]['content'] if cauldron_resp.json() and cauldron_resp.json()[0].get('content') else {}
        cauldron_triggers = cauldron_settings.get("twitch_reward_triggers", [])
        found_trigger = next((trigger for trigger in cauldron_triggers if trigger.get("title") == reward_title), None)

        if cauldron_settings.get("is_visible_to_users", False) and found_trigger:
            contribution_value = found_trigger.get("value", 0)
            logging.info(f"🔥 Вклад в котел: {twitch_login} -> {contribution_value}")
            
            resp = await supabase.post(
                "/rpc/contribute_to_cauldron",
                json={
                    "p_user_id": user_id,
                    "p_amount": contribution_value,
                    "p_user_display_name": user_display_name,
                    "p_contribution_type": "twitch_points"
                }
            )
            if resp.status_code == 200:
                result = resp.json()
                try:
                    await manager.broadcast(json.dumps({
                        "type": "cauldron_update",
                        "new_progress": result.get('new_progress'),
                        "last_contributor": { "name": user_display_name, "type": "twitch_points", "amount": contribution_value }
                    }))
                except Exception as ws_e:
                    logging.warning(f"WS Broadcast error in background: {ws_e}")
            return # Завершаем, если это был котел

    # === ВЕТКА 2: РУЛЕТКА (SKIN RACE) ===
    elif is_roulette:
        prizes_resp = await supabase.get(
            "/roulette_prizes",
            params={
                "reward_title": f"eq.{reward_title}",
                "select": "id,skin_name,image_url,chance_weight,quantity"
            }
        )
        roulette_definitions = prizes_resp.json() 

        if roulette_definitions:
            in_stock_prizes = [p for p in roulette_definitions if p.get("quantity", 0) > 0]
            
            if in_stock_prizes:
                logging.info(f"🎰 Запуск рулетки для '{reward_title}' от {twitch_login}.")
                
                weights = [p['chance_weight'] * p['quantity'] for p in in_stock_prizes]
                if sum(weights) <= 0:
                        logging.error(f"Сумма весов равна нулю.")
                        return

                winner_prize = random.choices(in_stock_prizes, weights=weights, k=1)[0]
                winner_skin_name = winner_prize.get('skin_name', 'Неизвестный скин')
                winner_prize_id = winner_prize.get('id')
                winner_quantity_before_win = winner_prize.get('quantity', 1)

                if winner_prize_id:
                    await supabase.post(
                        "/rpc/decrement_roulette_prize_quantity",
                        json={"p_prize_id": winner_prize_id}
                    )

                # Получаем настройки награды (или берем из кэша)
                if cached_reward:
                    reward_settings = cached_reward
                else:
                    reward_settings_resp = await supabase.get("/twitch_rewards", params={"title": f"eq.{reward_title}", "select": "id,notify_admin"})
                    reward_settings_list = reward_settings_resp.json()
                    if not reward_settings_list:
                            # Создаем, если нет
                            r_create = await supabase.post("/twitch_rewards", json={"title": reward_title}, headers={"Prefer": "return=representation"})
                            reward_settings = r_create.json()[0]
                    else:
                            reward_settings = reward_settings_list[0]

                final_user_input = f"Выигрыш: {winner_skin_name}"
                if user_input:
                    final_user_input += f" | Сообщение: {user_input}"

                purchase_payload = {
                    "reward_id": reward_settings["id"],
                    "username": user_record.get("full_name", twitch_login) if user_record else twitch_login,
                    "twitch_login": twitch_login,
                    "trade_link": user_record.get("trade_link") if user_record else user_input,
                    "status": "Привязан" if user_record else "Не привязан",
                    "user_input": final_user_input,
                    "user_id": user_record.get("telegram_id") if user_record else None,
                    
                    # Snapshot
                    "snapshot_daily_messages": user_record.get("daily_message_count", 0) if user_record else 0,
                    "snapshot_daily_uptime": user_record.get("daily_uptime_minutes", 0) if user_record else 0,
                    "snapshot_weekly_messages": user_record.get("weekly_message_count", 0) if user_record else 0,
                    "snapshot_weekly_uptime": user_record.get("weekly_uptime_minutes", 0) if user_record else 0,
                    "snapshot_monthly_messages": user_record.get("monthly_message_count", 0) if user_record else 0,
                    "snapshot_monthly_uptime": user_record.get("monthly_uptime_minutes", 0) if user_record else 0
                }
                await supabase.post("/twitch_reward_purchases", json=purchase_payload)
                
                # Триггер Забега (Weekly Goal)
                if user_id: 
                    await supabase.post("/rpc/increment_weekly_goal_progress", json={
                        "p_user_id": user_id, 
                        "p_task_type": "twitch_purchase",
                        "p_entity_id": reward_settings["id"] 
                    })
                
                # Уведомление Админу
                if ADMIN_NOTIFY_CHAT_ID and reward_settings.get("notify_admin", True):
                    notification_text = (
                        f"🎰 <b>Выигрыш в рулетке!</b>\n\n"
                        f"<b>Пользователь:</b> {html_decoration.quote(purchase_payload['username'])}\n" 
                        f"<b>Рулетка:</b> «{html_decoration.quote(reward_title)}»\n"
                        f"<b>Выпал приз:</b> {html_decoration.quote(winner_skin_name)}\n"
                        f"<b>Остаток:</b> {winner_quantity_before_win - 1} шт."
                    )
                    await safe_send_message(ADMIN_NOTIFY_CHAT_ID, notification_text)

                # Триггер Анимации
                winner_index_in_filtered_list = next((i for i, prize in enumerate(in_stock_prizes) if prize['id'] == winner_prize_id), 0)
                animation_payload = {
                    "prizes": in_stock_prizes,
                    "winner": winner_prize,
                    "winner_index": winner_index_in_filtered_list,
                    "user_name": twitch_login,
                    "prize_name": reward_title
                }
                await supabase.post("/roulette_triggers", json={"payload": animation_payload})
                
                logging.info(f"✅ Победитель рулетки определен: {winner_skin_name}")
                return

            else:
                logging.warning(f"Рулетка '{reward_title}' не запущена - нет призов.")
                if ADMIN_NOTIFY_CHAT_ID:
                    await safe_send_message(ADMIN_NOTIFY_CHAT_ID, f"⚠️ <b>Закончились призы</b> для рулетки «{html_decoration.quote(reward_title)}»!")
                return

    # === ВЕТКА 3: ОБЫЧНАЯ НАГРАДА ===
    else:
        logging.info(f"📦 Обычная награда '{reward_title}' от {twitch_login}.")
        
        # Используем данные из КЭША, если есть
        if cached_reward:
            reward_settings = cached_reward
        else:
            # Если в кэше нет, запрашиваем из БД (создаем новую)
            reward_settings_resp = await supabase.get(
                "/twitch_rewards", 
                params={"title": f"eq.{reward_title}", "select": "*"}
            )
            reward_settings_list = reward_settings_resp.json()
            
            if not reward_settings_list:
                # Создаем новую
                r_create = await supabase.post(
                    "/twitch_rewards", 
                    json={
                        "title": reward_title, 
                        "is_active": True, 
                        "notify_admin": True,
                        "reward_type": "promocode", 
                        "reward_amount": 10,         
                        "promocode_amount": 10       
                    }, 
                    headers={"Prefer": "return=representation"}
                )
                reward_settings = r_create.json()[0]
            else:
                reward_settings = reward_settings_list[0]

        if not reward_settings["is_active"]:
            logging.info(f"Награда '{reward_title}' отключена админом. Игнорируем.")
            return

        reward_type = reward_settings.get("reward_type", "promocode")
        reward_amount = reward_settings.get("reward_amount") or reward_settings.get("promocode_amount", 10)
        user_status = "Привязан" if user_record else "Не привязан"

        # Лог покупки
        await supabase.post("/twitch_reward_purchases", json={
            "reward_id": reward_settings["id"], "user_id": user_id,
            "username": user_display_name, "twitch_login": twitch_login,
            "trade_link": user_record.get("trade_link") if user_record else None, 
            "status": user_status,
            "user_input": user_input,
            "viewed_by_admin": False,
            # Snapshot
            "snapshot_daily_messages": user_record.get("daily_message_count", 0) if user_record else 0,
            "snapshot_daily_uptime": user_record.get("daily_uptime_minutes", 0) if user_record else 0,
            "snapshot_weekly_messages": user_record.get("weekly_message_count", 0) if user_record else 0,
            "snapshot_weekly_uptime": user_record.get("weekly_uptime_minutes", 0) if user_record else 0,
            "snapshot_monthly_messages": user_record.get("monthly_message_count", 0) if user_record else 0,
            "snapshot_monthly_uptime": user_record.get("monthly_uptime_minutes", 0) if user_record else 0
        })
        
        # Триггер Забега
        if user_id: 
            await supabase.post("/rpc/increment_weekly_goal_progress", json={
                "p_user_id": user_id,
                "p_task_type": "twitch_purchase",
                "p_entity_id": reward_settings["id"] 
            })
        
        # Уведомление Админу
        if ADMIN_NOTIFY_CHAT_ID and reward_settings["notify_admin"]:
            notification_text = (
                f"🔔 <b>Новая заявка Twitch!</b>\n\n"
                f"<b>Пользователь:</b> {html_decoration.quote(user_display_name)} ({html_decoration.quote(twitch_login)})\n"
                f"<b>Награда:</b> «{html_decoration.quote(reward_title)}»\n"
                f"<b>Статус:</b> {user_status}"
            )
            if reward_type == "tickets":
                notification_text += f"\n<b>Запрос на:</b> {reward_amount} билетов"
            elif reward_type == "promocode":
                notification_text += f"\n<b>Запрос на:</b> Промокод ({reward_amount} звёзд)"
            elif reward_type == "none":
                notification_text += f"\n<b>Тип:</b> Только лог"

            if user_input: notification_text += f"\n<b>Сообщение:</b> <code>{html_decoration.quote(user_input)}</code>"
            
            await safe_send_message(ADMIN_NOTIFY_CHAT_ID, notification_text)

# --- 2. ГЛАВНЫЙ ЭНДПОИНТ (Мгновенный ответ) ---
@app.post("/api/v1/webhooks/twitch")
async def handle_twitch_webhook(
    request: Request,
    background_tasks: BackgroundTasks
):
    """
    Принимает вебхуки от Twitch. 
    ПРОВЕРЯЕТ подпись и СРАЗУ возвращает 200 OK.
    Вся логика перенесена в background_tasks.
    """
    print("🔥🔥🔥 ВЕБХУК ПОЛУЧЕН! КОД ОБНОВЛЕН! 🔥🔥🔥")
    
    # 1. Читаем тело и заголовки
    body = await request.body()
    headers = request.headers
    message_id = headers.get("Twitch-Eventsub-Message-Id")
    timestamp = headers.get("Twitch-Eventsub-Message-Timestamp")
    signature = headers.get("Twitch-Eventsub-Message-Signature")

    if not all([message_id, timestamp, signature, TWITCH_WEBHOOK_SECRET]):
        return Response(content="Missing headers", status_code=403)

    # 2. Проверяем подпись (синхронно, это быстро)
    hmac_message = (message_id + timestamp).encode() + body
    expected_signature = "sha256=" + hmac.new(
        TWITCH_WEBHOOK_SECRET.encode(), hmac_message, hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, signature):
        return Response(content="Invalid signature", status_code=403)

    # 3. Разбираем JSON
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return Response(content="Invalid JSON", status_code=400)

    message_type = headers.get("Twitch-Eventsub-Message-Type")

    # A. Подтверждение подписки (Challenge) - отвечаем сразу
    if message_type == "webhook_callback_verification":
        challenge = data.get("challenge")
        return Response(content=challenge, media_type="text/plain")

    # B. Уведомление (Reward Redemption)
    if message_type == "notification":
        # --- ЗАЩИТА ОТ ДУБЛЕЙ ---
        current_time = time.time()
        
        # Очистка старого кэша (раз в 10 минут)
        if current_time - webhook_cache["last_cleanup"] > WEBHOOK_CACHE_TTL:
            webhook_cache["ids"].clear()
            webhook_cache["last_cleanup"] = current_time

        # Если ID уже в кэше — это повтор от Twitch, игнорируем
        if message_id in webhook_cache["ids"]:
            logging.info(f"♻️ Дубликат вебхука Twitch (ID: {message_id}). Игнорируем.")
            return Response(content="Duplicate ignored", status_code=200)

        # Запоминаем ID
        webhook_cache["ids"].add(message_id)

        # 🔥 ВАЖНО: Добавляем задачу в фон и СРАЗУ отвечаем Twitch'у
        background_tasks.add_task(process_twitch_notification_background, data, message_id)
        
        return Response(content="Processing started", status_code=200)

    # Прочие типы сообщений (на всякий случай отвечаем ОК)
    return Response(status_code=200)
            
# --- НОВЫЙ ЭНДПОИНТ ДЛЯ ПОЛУЧЕНИЯ ДЕТАЛЕЙ ПОБЕДИТЕЛЕЙ РОЗЫГРЫШЕЙ ---
@app.post("/api/v1/admin/events/winners/details")
async def get_event_winners_details_for_admin(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (Админ) Возвращает ПОЛНЫЙ список победителей (из Розыгрышей и Аукционов)
    и их трейд-ссылки для модального окна.
    (Версия 3: Исправлен приоритет Twitch-ника)
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        winners_details = []
        winner_ids_to_fetch = set()
        
        # --- 1. Получаем победителей из старых РОЗЫГРЫШЕЙ (JSON) ---
        content_resp = await supabase.get(
            "/pages_content",
            params={"page_name": "eq.events", "select": "content", "limit": 1}
        )
        content_resp.raise_for_status()
        content_data = content_resp.json()
        
        pending_events_winners = []
        if content_data:
            content = content_data[0].get('content', {})
            events = content.get("events", [])
            pending_events_winners = [
                event for event in events
                if 'winner_id' in event and not event.get('prize_sent_confirmed', False)
            ]
            for event in pending_events_winners:
                winner_ids_to_fetch.add(event['winner_id'])

        # --- 2. Получаем победителей из АУКЦИОНОВ (Таблица) ---
        auctions_resp = await supabase.get(
            "/auctions",
            params={
                "prize_sent_confirmed": "eq.false",
                "winner_id": "not.is.null",
                "select": "id, title, winner_id, current_highest_bidder_name"
            }
        )
        auctions_resp.raise_for_status()
        pending_auction_winners = auctions_resp.json()
        for auction in pending_auction_winners:
            winner_ids_to_fetch.add(auction['winner_id'])

        # --- 3. Получаем Трейд-ссылки и ТВИЧ-НИКИ для ВСЕХ победителей ---
        users_data = {}
        if winner_ids_to_fetch:
            users_resp = await supabase.get(
                "users",
                params={
                    "telegram_id": f"in.({','.join(map(str, winner_ids_to_fetch))})",
                    "select": "telegram_id, trade_link, full_name, twitch_login"
                }
            )
            users_resp.raise_for_status()
            users_data = {
                user['telegram_id']: {
                    "trade_link": user.get('trade_link', 'Не указана'),
                    "full_name": user.get('full_name', 'Неизвестно'),
                    "twitch_login": user.get('twitch_login')
                } for user in users_resp.json()
            }

        # --- 4. Форматируем и объединяем списки ---
        
        # Победители Розыгрышей
        for event in pending_events_winners:
            user_details = users_data.get(event["winner_id"], {})
            
            # --- ИСПРАВЛЕННАЯ ЛОГИКА ---
            # Приоритет: 1. Twitch-ник, 2. Текущее TG-имя, 3. Историческое TG-имя
            display_name = user_details.get("twitch_login") or \
                           user_details.get("full_name") or \
                           event.get("winner_name") or \
                           "Неизвестно"
            
            winners_details.append({
                "event_id": event.get("id"),
                "winner_name": display_name, # <-- ИСПОЛЬЗУЕМ НОВОЕ ИМЯ
                "prize_title": f"[Розыгрыш] {event.get('title', 'Без названия')}",
                "trade_link": user_details.get("trade_link", "Не указана"),
                "prize_sent_confirmed": event.get("prize_sent_confirmed", False)
            })
            
        # Победители Аукционов
        for auction in pending_auction_winners:
            user_details = users_data.get(auction["winner_id"], {})
            
            # --- ИСПРАВЛЕННАЯ ЛОГИКА ---
            # Приоритет: 1. Twitch-ник, 2. Текущее TG-имя, 3. Историческое TG-имя
            display_name = user_details.get("twitch_login") or \
                           user_details.get("full_name") or \
                           auction.get("current_highest_bidder_name") or \
                           "Неизвестно"
                           
            winners_details.append({
                "event_id": auction.get("id"),
                "winner_name": display_name, # <-- ИСПОЛЬЗУЕМ НОВОЕ ИМЯ
                "prize_title": f"[Аукцион] {auction.get('title', 'Без названия')}",
                "trade_link": user_details.get("trade_link", "Не указана"),
                "prize_sent_confirmed": auction.get("prize_sent_confirmed", False)
            })

        # Сортируем (опционально)
        winners_details.sort(key=lambda x: x.get('event_id', 0))
        return winners_details

    except Exception as e:
        logging.error(f"Ошибка при получении деталей победителей (объединенно): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось получить детали победителей.")
# --- КОНЕЦ НОВОГО ЭНДПОИНТА ---

@app.post("/api/v1/auctions/bid")
async def make_auction_bid(
    request_data: AuctionBidRequest,
    background_tasks: BackgroundTasks, # <--- ✅ ОБЯЗАТЕЛЬНО ДОБАВЛЕНО
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Принимает ставку от пользователя, проверяет трейд-ссылку,
    вызывает RPC-функцию и отправляет триггер для OBS.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")

    telegram_id = user_info["id"]
    raw_name = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip() or user_info.get("username", "Пользователь")
    user_name = clean_user_name_text(raw_name)

    try:
        # --- 1. ПРОВЕРКА ТРЕЙД-ССЫЛКИ ---
        user_resp = await supabase.get("/users", params={"telegram_id": f"eq.{telegram_id}", "select": "trade_link"})
        user_resp.raise_for_status()
        user_data = user_resp.json()

        if not user_data or not user_data[0].get("trade_link"):
             raise HTTPException(status_code=400, detail="Пожалуйста, укажите вашу трейд-ссылку в профиле для участия.")

        # --- 2. ПОЛУЧЕНИЕ ПРЕДЫДУЩЕГО ЛИДЕРА (ДО СТАВКИ) ---
        prev_bidder_id = None
        auction_title = "Лот"

        try:
            auc_check = await supabase.get(
                "/auctions", 
                params={"id": f"eq.{request_data.auction_id}", "select": "current_highest_bidder_id, title"}
            )
            if auc_check.json():
                auc_data = auc_check.json()[0]
                prev_bidder_id = auc_data.get("current_highest_bidder_id")
                auction_title = auc_data.get("title", "Лот")
        except Exception:
            pass 

        # --- 3. ВЫЗОВ RPC (СТАВКА) ---
        response = await supabase.post(
            "/rpc/place_auction_bid",
            json={
                "p_auction_id": request_data.auction_id,
                "p_user_id": telegram_id,
                "p_user_name": user_name,
                "p_bid_amount": request_data.bid_amount
            }
        )
        response.raise_for_status() 

        # --- 4. УВЕДОМЛЕНИЕ ТОГО, КОГО ПЕРЕБИЛИ (В ФОНЕ) ---
        # Вставляем это ПОСЛЕ успешной ставки, но ДО блока OBS
        if prev_bidder_id and prev_bidder_id != telegram_id:
            msg_text = (
                f"⚠️ <b>Вашу ставку перебили!</b>\n\n"
                f"Аукцион: «{html_decoration.quote(auction_title)}»\n"
                f"Новая ставка: {request_data.bid_amount} 🎟️\n\n"
                f"Успейте сделать новую ставку!"
            )
            background_tasks.add_task(
                check_and_send_notification,
                prev_bidder_id,
                msg_text,
                "notify_auction_outbid"
            )

        # --- 5. ОТПРАВКА ТРИГГЕРА ДЛЯ OBS ---
        try:
            # Получаем свежие данные
            auction_resp = await supabase.get(
                "/auctions",
                params={"id": f"eq.{request_data.auction_id}", "select": "*"},
                headers={"Prefer": "count=exact"} 
            )
            auction_data = auction_resp.json()[0] if auction_resp.json() else {}

            # Получаем историю
            history_resp = await supabase.get(
                "/auction_bids",
                params={
                    "auction_id": f"eq.{request_data.auction_id}",
                    "select": "bid_amount, user_id, user:users(telegram_id, full_name, twitch_login)",
                    "order": "created_at.desc",
                    "limit": 10
                }
            )
            history_data = history_resp.json()
            
            top_bidders = []
            last_bidder_display_name = user_name
            
            if history_data:
                seen_user_ids = set()
                def get_display_name(ud):
                    if not ud: return "Аноним"
                    return ud.get("twitch_login") or ud.get("full_name") or "Аноним"

                if history_data[0].get("user"):
                     last_bidder_display_name = get_display_name(history_data[0]["user"])
                
                for bid in history_data:
                    if len(top_bidders) >= 3: break
                    uid = bid.get("user_id")
                    if uid and uid not in seen_user_ids:
                        display_name = get_display_name(bid.get("user"))
                        top_bidders.append({"name": display_name, "amount": bid["bid_amount"]})
                        seen_user_ids.add(uid)
            
            trigger_payload = {
                "auction_data": auction_data,
                "last_bidder_name": last_bidder_display_name,
                "top_bidders": top_bidders 
            }
            
            await supabase.post("/auction_triggers", json={"payload": trigger_payload})
            logging.info(f"✅ Триггер для OBS успешно отправлен.")

        except Exception as obs_e:
            logging.error(f"❌ Ошибка триггера OBS: {obs_e}")

        return {"message": "Ваша ставка принята!"}

    except httpx.HTTPStatusError as e:
        error_details = "Ошибка базы данных."
        try:
            error_json = e.response.json()
            error_details = error_json.get("message", e.response.text)
        except Exception:
            error_details = e.response.text
            
        if "violates foreign key constraint" in error_details:
             error_details = "Лот был перезапущен или удален администратором."
            
        logging.warning(f"Ошибка ставки: {error_details}")
        raise HTTPException(status_code=400, detail=error_details)

# --- P2P SYSTEM ---

@app.get("/api/v1/telegram/tasks")
async def get_telegram_tasks(
    request: Request,
    user_id: int = Query(...),
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    try:
        # 1. Берем ВСЕ активные задания из таблицы telegram_tasks
        tasks_resp = await supabase.get(
            "/telegram_tasks", 
            params={"is_active": "eq.true", "select": "*", "order": "sort_order.asc"}
        )
        tasks = tasks_resp.json()

        # 2. Берем прогресс пользователя по этим заданиям
        # !!! ВАЖНО: Добавил last_claimed_at в select, чтобы работал таймер !!!
        progress_resp = await supabase.get(
            "/user_telegram_progress",
            params={"user_id": f"eq.{user_id}", "select": "task_key, completed, current_day, last_claimed_at"}
        )
        # Превращаем прогресс в удобный словарь
        user_progress = {item["task_key"]: item for item in progress_resp.json()}

        result_list = []
        
        for task in tasks:
            # Находим прогресс для этого задания
            prog = user_progress.get(task["task_key"], {})
            is_completed = prog.get("completed", False)
            current_day = prog.get("current_day", 0)
            
            task_data = {
                **task,
                "is_completed": is_completed, # Флаг для фронтенда (серый цвет)
                "current_day": current_day,
                # !!! ВАЖНО: Передаем дату последнего клейма для таймера !!!
                "last_claimed_at": prog.get("last_claimed_at")
            }
            result_list.append(task_data)

        # 3. СОРТИРОВКА:
        # Сначала те, где is_completed = False (0), потом True (1)
        # Внутри групп сохраняем sort_order
        result_list.sort(key=lambda x: x["sort_order"]) # Сначала по порядку админки
        result_list.sort(key=lambda x: x["is_completed"]) # Потом выполненные ВНИЗ

        return JSONResponse(result_list)

    except Exception as e:
        print(f"Error fetching tasks: {e}")
        return JSONResponse({"success": False, "error": str(e)})

# --- 1. Публичный API: Получить список предметов (для прокрутки) ---
@app.get("/api/cs/items")
async def get_cs_items(supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    # Берем только активные предметы, которые есть в наличии
    resp = await supabase.get("/cs_items", params={"is_active": "eq.true", "quantity": "gt.0", "order": "chance_weight.desc"})
    return resp.json()

# --- 2. Публичный API: КРУТИТЬ РУЛЕТКУ ---
@app.post("/api/cs/spin")
async def spin_cs_roulette(
    req: CSRouletteSpinRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(req.initData, ALL_VALID_TOKENS)
    if not user_info: raise HTTPException(401, "Unauthorized")
    user_id = user_info['id']
    code = req.code.strip()

    # А. Проверка Трейд-ссылки
    user_res = await supabase.get("/users", params={"telegram_id": f"eq.{user_id}", "select": "trade_link"})
    user_data = user_res.json()
    if not user_data or not user_data[0].get("trade_link"):
        raise HTTPException(400, "⚠️ Сначала укажите Trade Link в профиле!")

    # Б. Проверка Кода
    code_res = await supabase.get("/cs_codes", params={"code": f"eq.{code}", "is_active": "eq.true"})
    code_data = code_res.json()
    
    if not code_data:
        raise HTTPException(400, "⛔ Неверный код!")
    
    promo = code_data[0]
    if promo['current_uses'] >= promo['max_uses']:
        raise HTTPException(400, "⛔ Этот код закончился!")

    # В. Проверка: Пользователь уже использовал этот код?
    # (Опционально: если код одноразовый для юзера)
    history_check = await supabase.get("/cs_history", params={"user_id": f"eq.{user_id}", "code_used": f"eq.{code}"})
    if history_check.json():
        raise HTTPException(400, "⛔ Вы уже активировали этот код!")

    # Г. Выбор победителя (Weighted Random)
    items_res = await supabase.get("/cs_items", params={"is_active": "eq.true", "quantity": "gt.0"})
    items = items_res.json()
    
    if not items:
        raise HTTPException(400, "Склад пуст!")

    # Логика весов
    weights = [item['chance_weight'] for item in items]
    winner_item = random.choices(items, weights=weights, k=1)[0]

    # Д. Транзакция (Списание кода, Списание предмета, Запись истории)
    # 1. +1 использование кода
    await supabase.patch("/cs_codes", params={"code": f"eq.{code}"}, json={"current_uses": promo['current_uses'] + 1})
    
    # 2. -1 предмет (используем RPC или просто patch, если нет гонки)
    # Лучше создать RPC decrement_cs_item_quantity, но пока сделаем просто:
    new_qty = winner_item['quantity'] - 1
    await supabase.patch("/cs_items", params={"id": f"eq.{winner_item['id']}"}, json={"quantity": new_qty})

    # 3. Запись в историю
    await supabase.post("/cs_history", json={
        "user_id": user_id,
        "item_id": winner_item['id'],
        "code_used": code,
        "status": "pending"
    })

    # 4. Уведомление админу (если нужно)
    if ADMIN_NOTIFY_CHAT_ID:
        msg = f"🎰 <b>CS Roulette Win!</b>\nUser: {user_id}\nItem: {winner_item['name']} ({winner_item['rarity']})\nCode: {code}"
        await try_send_message(int(ADMIN_NOTIFY_CHAT_ID), msg)

    return {"success": True, "winner": winner_item}

# --- 3. Админка: Добавить Скин ---
@app.post("/api/admin/cs/item/add")
async def add_cs_item(req: CSItemCreateRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(req.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(403)
    
    await supabase.post("/cs_items", json=req.dict(exclude={"initData"}))
    return {"message": "Скин добавлен"}

# --- 4. Админка: Создать Код ---
@app.post("/api/admin/cs/code/add")
async def add_cs_code(req: CSCodeCreateRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(req.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(403)
    
    await supabase.post("/cs_codes", json={"code": req.code, "max_uses": req.max_uses})
    return {"message": "Код создан"}

# --- 5. Админка: Список победителей ---
@app.post("/api/admin/cs/winners")
async def get_cs_winners(request: Request):
    """
    Возвращает историю открытий.
    ВАЖНО: execute() здесь синхронный, поэтому await не нужен.
    """
    try:
        body = await request.json()
        # Проверка initData пропущена для краткости
        
        # 1. Запрос к базе (без await перед вызовом цепочки)
        # Мы запрашиваем данные из cs_history и "подтягиваем" данные из users и cs_items
        res = supabase.table("cs_history")\
            .select("*, item:cs_items(*), user:users(full_name, username, trade_link)")\
            .order("created_at", desc=True)\
            .limit(50)\
            .execute()
            
        return JSONResponse(content=res.data)
    except Exception as e:
        logging.error(f"Error getting winners: {e}")
        # Возвращаем пустой список, чтобы фронтенд не падал
        return JSONResponse(content=[], status_code=500)

# 1. Получение списка кейсов и цен (Для магазина и Админки)
@app.get("/api/v1/p2p/cases")
async def get_p2p_cases(supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    resp = await supabase.get("/case_prices", params={"is_active": "eq.true", "order": "price_in_coins.desc"})
    return resp.json()

# 2. Создание заявки пользователем
@app.post("/api/v1/p2p/create")
async def create_p2p_trade(
    request_data: P2PCreateRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info: raise HTTPException(status_code=401)
    
    # Получаем цену кейса
    case_resp = await supabase.get("/case_prices", params={"id": f"eq.{request_data.case_id}"})
    cases = case_resp.json()
    if not cases: raise HTTPException(status_code=400, detail="Кейс не найден")
    
    price = cases[0]['price_in_coins']
    total_coins = price * request_data.quantity
    
    # Создаем сделку (таймер 30 мин ставится при одобрении админом, или сразу - зависит от логики. 
    # По твоему ТЗ таймер дается "чтоб я подтвердил", значит ставим expires_at сразу)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
    
    payload = {
        "user_id": user_info['id'],
        "case_id": request_data.case_id,
        "quantity": request_data.quantity,
        "total_coins": total_coins,
        "status": "pending",
        "expires_at": expires_at
    }
    
    await supabase.post("/p2p_trades", json=payload)
    # === ДОБАВИТЬ: Уведомление в технический чат ===
    if ADMIN_NOTIFY_CHAT_ID:
        admin_msg = (
            f"📦 <b>Новая заявка P2P!</b>\n\n"
            f"Пользователь: ID {user_info['id']}\n"
            f"Кейс ID: {request_data.case_id}\n"
            f"Кол-во: {request_data.quantity}\n"
            f"Сумма: <b>{total_coins} монет</b>"
        )
        await try_send_message(int(ADMIN_NOTIFY_CHAT_ID), admin_msg)
    # ===============================================
    return {"message": "Заявка создана! Ждите подтверждения админа."}

# 3. Пользователь нажал "Я передал кейсы"
@app.post("/api/v1/p2p/confirm_sent")
async def p2p_confirm_sent(
    request_data: P2PActionRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info: raise HTTPException(status_code=401)
    
    # Меняем статус на review
    await supabase.patch(
        "/p2p_trades", 
        params={"id": f"eq.{request_data.trade_id}", "user_id": f"eq.{user_info['id']}"},
        json={"status": "review"}
    )
    
    # === ВСТАВКА: Уведомление ВСЕМ админам ===
    msg = f"⚠️ <b>P2P #{request_data.trade_id}: Юзер подтвердил отправку!</b>\nПроверьте Steam и завершите сделку." 
    # Отправка в общий чат (если задан)
    if ADMIN_NOTIFY_CHAT_ID:
        await try_send_message(int(ADMIN_NOTIFY_CHAT_ID), msg)
    # === КОНЕЦ ВСТАВКИ ===

    return {"message": "Статус обновлен. Ожидайте проверки."}

# --- ADMIN P2P ---

# 1. Добавить новый кейс
@app.post("/api/v1/admin/p2p/case/add")
async def admin_p2p_case_add(
    request_data: P2PCaseAddRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(status_code=403)

    payload = {
        "case_name": request_data.case_name,
        "image_url": request_data.image_url,
        "price_in_coins": request_data.price_in_coins,
        "is_active": True
    }
    await supabase.post("/case_prices", json=payload)
    return {"message": "Кейс добавлен"}

@app.post("/api/v1/admin/p2p/delete")
async def admin_p2p_delete(
    request_data: P2PActionRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    # 1. Проверка прав админа
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS: 
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    # 2. ТИХОЕ УДАЛЕНИЕ (БЕЗ УВЕДОМЛЕНИЙ)
    # Удаляем запись из таблицы p2p_trades по ID
    response = await supabase.delete("/p2p_trades", params={"id": f"eq.{request_data.trade_id}"})
    
    # Supabase обычно возвращает 204 No Content при успешном удалении,
    # или 200 с пустым списком. Проверяем только на явные ошибки (4xx, 5xx).
    if response.status_code >= 400:
        raise HTTPException(status_code=400, detail="Не удалось удалить сделку")

    return {"message": "Сделка удалена безвозвратно"}

@app.post("/api/v1/admin/p2p/force_confirm_sent")
async def admin_p2p_force_confirm_sent(
    request_data: P2PActionRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    # 1. Проверка админа
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS: 
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    # 2. Получаем сделку, чтобы узнать ID юзера
    trade_resp = await supabase.get("/p2p_trades", params={"id": f"eq.{request_data.trade_id}"})
    if not trade_resp.json():
        raise HTTPException(status_code=404, detail="Сделка не найдена")
    trade = trade_resp.json()[0]

    # 3. Меняем статус на 'review' (как будто юзер нажал кнопку)
    await supabase.patch(
        "/p2p_trades",
        params={"id": f"eq.{request_data.trade_id}"},
        json={"status": "review"}
    )

    # 4. Уведомляем пользователя (опционально, чтобы он не пугался)
    msg = f"⚠️ <b>P2P #{request_data.trade_id}</b>\nАдминистратор подтвердил получение скина вручную. Ожидайте начисления монет."
    await try_send_message(trade['user_id'], msg)

    return {"message": "Статус успешно изменен на 'Проверка'"}

# 2. Обновить кейс (цену или статус)
@app.post("/api/v1/admin/p2p/case/update")
async def admin_p2p_case_update(
    request_data: P2PCaseEditRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(status_code=403)

    await supabase.patch(
        "/case_prices", 
        params={"id": f"eq.{request_data.case_id}"},
        json={"price_in_coins": request_data.price_in_coins, "is_active": request_data.is_active}
    )
    return {"message": "Кейс обновлен"}

# 3. Удалить кейс
@app.post("/api/v1/admin/p2p/case/delete")
async def admin_p2p_case_delete(
    request_data: P2PCaseDeleteRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(status_code=403)

    await supabase.delete("/case_prices", params={"id": f"eq.{request_data.case_id}"})
    return {"message": "Кейс удален"}

# 4. Админ: Список заявок
@app.post("/api/v1/admin/p2p/list")
async def admin_p2p_list(request_data: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(status_code=403)
    
    # Получаем сделки вместе с данными юзера и кейса
    resp = await supabase.get(
        "/p2p_trades", 
        params={
            "select": "*, user:users(full_name, username, trade_link), case:case_prices(case_name, image_url)",
            "order": "created_at.desc"
        }
    )
    return resp.json()


# 5. Админ: Подтвердить (начать трейд) и выдать ссылку
@app.post("/api/v1/admin/p2p/approve")
async def admin_p2p_approve(
    request_data: P2PApproveRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: 
        raise HTTPException(status_code=403)
    
    # 1. Сначала ищем ссылку в настройках (ключ admin_controls)
    settings_res = await supabase.get("/settings", params={"key": "eq.admin_controls", "select": "value"})
    settings_data = settings_res.json()
    
    saved_link = ""
    if settings_data and settings_data[0].get('value'):
        saved_link = settings_data[0]['value'].get('p2p_admin_trade_link', '')

    # Если фронт прислал ссылку (вдруг ты руками ввел) - берем её, иначе берем из базы
    link_to_use = request_data.trade_link if request_data.trade_link else saved_link

    if not link_to_use:
        raise HTTPException(status_code=400, detail="Трейд-ссылка не настроена! Зайдите в настройки P2P и сохраните её.")

    # 2. Обновляем статус
    new_expires = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
    
    await supabase.patch(
        "/p2p_trades",
        params={"id": f"eq.{request_data.trade_id}"},
        json={
            "status": "active", 
            "trade_url_given": link_to_use,
            "expires_at": new_expires
        }
    )

    # 3. Уведомление (используем безопасную отправку)
    trade_res = await supabase.get("/p2p_trades", params={"id": f"eq.{request_data.trade_id}"})
    if trade_res.json():
        trade = trade_res.json()[0]
        msg = (f"✅ <b>Заявка P2P #{request_data.trade_id} принята!</b>\n\n"
               f"Ссылка для обмена:\n{link_to_use}\n\n"
               f"Отправьте скин и нажмите кнопку <b>'Я передал скин'</b>.")
        await safe_send_message(trade['user_id'], msg)

    return {"message": "Трейд запущен"}

# --- ДОБАВИТЬ В index.py ---

@app.post("/api/v1/admin/p2p/cancel")
async def admin_p2p_cancel(
    request_data: P2PActionRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    # 1. Проверка админа
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS: 
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    # 2. Получаем сделку (чтобы узнать ID юзера для уведомления)
    trade_resp = await supabase.get("/p2p_trades", params={"id": f"eq.{request_data.trade_id}"})
    if not trade_resp.json():
        raise HTTPException(status_code=404, detail="Сделка не найдена")
    
    trade = trade_resp.json()[0]

    # 3. Меняем статус на canceled
    await supabase.patch(
        "/p2p_trades",
        params={"id": f"eq.{request_data.trade_id}"},
        json={"status": "canceled"}
    )

    # 4. Уведомляем пользователя
    msg = f"❌ <b>P2P Сделка #{request_data.trade_id} отменена администратором.</b>"
    await try_send_message(trade['user_id'], msg)

    # 5. Уведомляем админ-чат (Исправлены отступы)
    if ADMIN_NOTIFY_CHAT_ID:
        try:
            log_msg = f"❌ <b>P2P #{request_data.trade_id} ОТМЕНЕНА</b> администратором."
            await try_send_message(int(ADMIN_NOTIFY_CHAT_ID), log_msg)
        except Exception as e:
            print(f"Ошибка логирования в чат: {e}")

    return {"message": "Сделка отменена"}

# 1. Получение списка P2P (Исправленная версия)
@app.get("/api/v1/admin/p2p/trades")
async def admin_get_p2p_trades(
    request: Request, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    # check_admin_auth(request) # Раскомментируйте, если нужно
    
    # Получаем сделки
    trades_resp = await supabase.get("/p2p_trades", params={"order": "created_at.desc"})
    trades = trades_resp.json() if trades_resp.json() else []
    
    # Считаем остатки (через .get, а не .table)
    # Ищем: telegram_id is null И is_used is false
    stock_resp = await supabase.get("/promocodes", params={
        "select": "reward_value",
        "telegram_id": "is.null",
        "is_used": "is.false"
    })
        
    stock_counts = {}
    data = stock_resp.json()
    if data:
        for p in data:
            val = int(p['reward_value'])
            stock_counts[val] = stock_counts.get(val, 0) + 1

    return {
        "trades": trades, 
        "stock": stock_counts 
    }

# 2. Завершение сделки (Исправленная версия)
@app.post("/api/v1/admin/p2p/complete")
async def admin_p2p_complete(
    request_data: P2PActionRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: 
        raise HTTPException(status_code=403)
    
    # Получаем сделку
    trade_resp = await supabase.get("/p2p_trades", params={"id": f"eq.{request_data.trade_id}"})
    if not trade_resp.json():
        raise HTTPException(status_code=404, detail="Сделка не найдена")
        
    trade = trade_resp.json()[0]
    if trade['status'] == 'completed': 
        return {"message": "Уже выполнено"}
    
    amount = int(trade['total_coins'])
    user_id = trade['user_id']

    # ИЩЕМ СВОБОДНЫЙ КОД
    promo_resp = await supabase.get("/promocodes", params={
        "reward_value": f"eq.{amount}",
        "telegram_id": "is.null",
        "is_used": "is.false",
        "limit": "1"
    })
    
    promo_data = promo_resp.json()
    
    if not promo_data:
        raise HTTPException(status_code=400, detail=f"ОШИБКА: Нет свободных кодов на {amount} монет!")

    promo = promo_data[0]
    promo_id = promo['id']
    code_text = promo['code']

    # ПРИВЯЗЫВАЕМ КОД К ЮЗЕРУ
    current_time = datetime.now(timezone.utc).isoformat()
    await supabase.patch("/promocodes", params={"id": f"eq.{promo_id}"}, json={
        "telegram_id": user_id,
        "claimed_at": current_time,
        "description": f"Покупка P2P #{request_data.trade_id}"
    })
    
    # ЗАКРЫВАЕМ СДЕЛКУ
    await supabase.patch(
        "/p2p_trades", 
        params={"id": f"eq.{request_data.trade_id}"}, 
        json={"status": "completed"}
    )
    
    # ОТПРАВЛЯЕМ СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЮ
    msg = (
        f"✅ <b>P2P Сделка #{request_data.trade_id} завершена!</b>\n\n"
        f"Ваш код на {amount} монет:\n"
        f"<code>{code_text}</code>\n\n"
        f"<i>Код добавлен в ваш профиль.</i>"
    )
    await try_send_message(user_id, msg)

    # УВЕДОМЛЕНИЕ В ТЕХ. ЧАТ АДМИНОВ
    if ADMIN_NOTIFY_CHAT_ID:
        try:
            log_msg = f"✅ <b>P2P #{request_data.trade_id} ЗАВЕРШЕНА</b>\nВыдан код на {amount} монет пользователю {user_id}."
            await try_send_message(int(ADMIN_NOTIFY_CHAT_ID), log_msg)
        except Exception as e:
            print(f"Ошибка уведомления админа: {e}")

    return {"message": "Успешно"}
    
# 7. Получить список МОИХ сделок (для пользователя)
@app.post("/api/v1/p2p/my_trades")
async def get_my_p2p_trades(
    request_data: InitDataRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info: raise HTTPException(status_code=401)
    
    # Запрашиваем сделки конкретного юзера
    resp = await supabase.get(
        "/p2p_trades", 
        params={
            "user_id": f"eq.{user_info['id']}",
            "select": "*, case:case_prices(case_name)",
            "order": "created_at.desc"
        }
    )
    return resp.json()
        
@app.get("/api/v1/auctions/history/{auction_id}")
async def get_auction_history(
    auction_id: int,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (ИСПРАВЛЕНО) Возвращает 10 ЛУЧШИХ УНИКАЛЬНЫХ ставок (лидерборд) для лота,
    используя RPC-функцию get_auction_leaderboard.
    """
    try:
        # 1. Вызываем "умную" RPC-функцию, которая делает всю работу
        resp = await supabase.post(
            "/rpc/get_auction_leaderboard",
            json={"p_auction_id": auction_id}
        )
        resp.raise_for_status()
        
        leaderboard_data = resp.json()
        
        # 2. Форматируем ответ в {bid_amount, user},
        #    который ожидает наш обновленный JavaScript
        formatted_leaderboard = [
            {
                "bid_amount": item.get("highest_bid"),
                "user": item.get("user_info") 
            }
            for item in leaderboard_data
        ]

        return formatted_leaderboard

    except Exception as e:
        logging.error(f"Ошибка при получении истории аукциона (RPC) {auction_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить историю.")

# --- SLAY Эндпоинты ---

# --- SLAY ADMIN: Управление контентом страницы ---
@app.get("/api/v1/slay/content")
async def get_slay_content(supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """Получает заголовки страницы Slay Awards."""
    default_content = {
        "title": "SLAY AWARDS 2025",
        # 👇 ИЗМЕНИ ТЕКСТ ТУТ 👇
        "description": "Главное событие года.<br>Выбираем легенд чата.", 
        "badge": "Exclusive Event",
        "prizes": "[]"
    }
    try:
        resp = await supabase.get(
            "/pages_content", 
            params={"page_name": "eq.slay_awards", "select": "content", "limit": 1}
        )
        data = resp.json()
        if data and data[0].get('content'):
            # Объединяем с дефолтными, чтобы badge не пропал, если его нет в базе
            content = data[0]['content']
            return {**default_content, **content}
            
        # Если в базе пусто, возвращаем дефолт
        return default_content
        
    except Exception as e:
        logging.error(f"Error fetching SLAY content: {e}")
        return default_content

@app.post("/api/v1/admin/slay/content/update")
async def update_slay_content(
    request_data: SlayContentUpdate,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Обновляет контент страницы. Использует PATCH для защиты от дублей."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(status_code=403)

    # Собираем контент. Prizes теперь уже список, Python сам это понял.
    content = {
        "title": request_data.title, 
        "description": request_data.description,
        "badge": request_data.badge,
        "prizes": request_data.prizes 
    }
    
    # 1. Пробуем обновить существующую запись (id 45)
    # Используем PATCH, чтобы не плодить дубликаты
    await supabase.patch(
        "/pages_content",
        params={"page_name": "eq.slay_awards"},
        json={"content": content}
    )
    
    # (На всякий случай) Если записи вдруг нет, создадим её
    # Но так как мы видели id 45, сработает PATCH.
    
    return {"message": "Контент обновлен"}

# --- SLAY ADMIN: Управление номинациями ---
@app.post("/api/v1/admin/slay/nomination/update")
async def update_slay_nomination(
    request_data: SlayNominationUpdate,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Переименовывает номинацию или меняет картинку."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(status_code=403)

    # Формируем payload. Если image_url пустой, не перезаписываем его (чтобы не стереть случайно)
    update_payload = {
        "title": request_data.title,
        "description": request_data.description
    }
    if request_data.image_url and len(request_data.image_url.strip()) > 0:
        update_payload["image_url"] = request_data.image_url

    await supabase.patch(
        "/slay_nominations",
        params={"id": f"eq.{request_data.id}"},
        json=update_payload
    )
    return {"message": "Номинация обновлена"}

# --- SLAY ADMIN: Дисквалификация ---
@app.post("/api/v1/admin/slay/candidate/delete")
async def delete_slay_candidate(
    request_data: SlayCandidateDelete,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Удаляет кандидата из номинации."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(status_code=403)

    await supabase.delete(
        "/slay_candidates",
        params={"id": f"eq.{request_data.candidate_id}"}
    )
    return {"message": "Кандидат удален"}

# 1. Получение активных голосований (Для пользователей)

# --- Вспомогательная функция для перевода строк из базы в True/False ---
def str_to_bool(val):
    """Преобразует строку 'true'/'false' или булево значение в Python bool"""
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() == 'true'
    return False

# =======================================================
# 1. Функция проверки статуса (ИСПРАВЛЕННАЯ)
# =======================================================
async def validate_event_status():
    """
    Проверяет настройки ивента в таблице settings.
    Исправлена ошибка 'object APIResponse can't be used in await'.
    """
    # Внутренняя функция для синхронных запросов (без await!)
    def _fetch_settings_sync():
        try:
            # УБРАНЫ await, так как клиент синхронный
            r_vis = supabase.table("settings").select("value").eq("key", "halloween_visible").execute()
            r_pau = supabase.table("settings").select("value").eq("key", "halloween_paused").execute()
            return r_vis, r_pau
        except Exception as ex:
            print(f"DB Error inside threadpool: {ex}")
            return None, None

    try:
        # Запускаем синхронные запросы в отдельном потоке, чтобы не блокировать бота
        # Само ожидание потока (await run_in_threadpool) корректно
        response_visible, response_paused = await run_in_threadpool(_fetch_settings_sync)

        # Логика обработки visible
        is_visible = False
        if response_visible and response_visible.data:
            val = response_visible.data[0]['value']
            if isinstance(val, bool):
                is_visible = val
            elif isinstance(val, str):
                clean_val = val.strip().replace('"', '').replace("'", "")
                is_visible = clean_val.lower() == 'true'

        # Логика обработки paused
        is_paused = False
        if response_paused and response_paused.data:
            val = response_paused.data[0]['value']
            if isinstance(val, bool):
                is_paused = val
            elif isinstance(val, str):
                clean_val = val.strip().replace('"', '').replace("'", "")
                is_paused = clean_val.lower() == 'true'

        return {"visible": is_visible, "paused": is_paused}

    except Exception as e:
        print(f"Error validating event status: {e}")
        # При ошибке базы безопаснее считать ивент закрытым
        return {"visible": False, "paused": True}


# =======================================================
# 2. GET Endpoint (Для админки, чтобы видеть актуальное состояние)
# =======================================================
@app.get("/api/admin/event/status")
async def get_event_status_admin(request: Request):
    try:
        status = await validate_event_status()
        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =======================================================
# 3. POST Endpoint (Для сохранения настроек)
# =======================================================
@app.post("/api/admin/event/status")
async def set_event_status_admin(state: EventControlState, request: Request):
    try:
        # Преобразуем bool в string для базы
        val_visible = "true" if state.visible else "false"
        val_paused = "true" if state.paused else "false"

        # Внутренняя функция для записи (тоже без await!)
        def _update_settings_sync():
            supabase.from_('settings').update({'value': val_visible}).eq('key', 'halloween_visible').execute()
            supabase.from_('settings').update({'value': val_paused}).eq('key', 'halloween_paused').execute()

        # Запускаем в потоке
        await run_in_threadpool(_update_settings_sync)
        
        return {"status": "success", "data": state}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- ДОБАВИТЬ ЭТОТ БЛОК (Публичный статус для пользователей) ---
@app.get("/api/event/status")
async def get_event_status_public(request: Request):
    """
    Публичный API для проверки статуса ивента (вызывается из halloween.js).
    """
    try:
        # Используем ту же надежную функцию проверки
        status = await validate_event_status()
        return status
    except Exception as e:
        # В случае ошибки лучше не показывать ивент
        return {"visible": False, "paused": True}

@app.post("/api/v1/slay/active")
async def get_active_slay_nominations(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info: raise HTTPException(status_code=401)
    user_id = user_info['id']

    # 1. Получаем номинации (включая winner_id)
    nom_resp = await supabase.get("/slay_nominations", params={"is_active": "eq.true", "order": "id.asc"})
    nominations = nom_resp.json()

    # 2. Получаем кандидатов с данными юзеров
    cand_resp = await supabase.get(
        "/slay_candidates", 
        params={"select": "*, user:users(full_name, username, photo_url, twitch_login)"}
    )
    candidates = cand_resp.json()

    # 3. Получаем ГОЛОСА пользователя
    votes_resp = await supabase.get(
        "/slay_votes", 
        params={"voter_id": f"eq.{user_id}", "select": "nomination_id, candidate_id"}
    )
    votes_map = {v['nomination_id']: v['candidate_id'] for v in votes_resp.json()}

    # 4. Собираем структуру
    result = []
    for nom in nominations:
        nom_candidates = [c for c in candidates if c['nomination_id'] == nom['id']]
        
        # --- НОВАЯ ЛОГИКА: Ищем имя победителя ---
        winner_name = None
        if nom.get('winner_id'):
            winner_cand = next((c for c in nom_candidates if c['id'] == nom['winner_id']), None)
            if winner_cand:
                user_data = winner_cand.get('user', {})
                winner_name = winner_cand.get('custom_title') or user_data.get('twitch_login') or user_data.get('full_name') or "Unknown"
        # -----------------------------------------

        formatted_candidates = []
        for c in nom_candidates:
            user_data = c.get('user', {})
            display_name = c.get('custom_title') or user_data.get('twitch_login') or user_data.get('full_name') or "Unknown"
            formatted_candidates.append({
                "id": c['id'],
                "name": display_name,
                "username": user_data.get('username'), 
                "photo_url": user_data.get('photo_url'),
                "votes": c['votes_count']
            })
        
        result.append({
            "id": nom['id'],
            "title": nom['title'],
            "description": nom['description'],
            "image_url": nom.get('image_url'),
            "has_voted": nom['id'] in votes_map,
            "voted_candidate_id": votes_map.get(nom['id']),
            "winner_id": nom.get('winner_id'),     # <-- Передаем ID победителя
            "winner_name": winner_name,            # <-- Передаем Имя победителя
            "candidates": formatted_candidates
        })

    return result

@app.post("/api/v1/admin/slay/nomination/finish")
async def finish_slay_nomination(
    request_data: SlayNominationFinish,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Завершает номинацию: находит лидера по голосам и записывает winner_id."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(status_code=403)

    nom_id = request_data.nomination_id

    # 1. Получаем кандидатов для этой номинации
    cand_resp = await supabase.get(
        "/slay_candidates",
        params={"nomination_id": f"eq.{nom_id}", "select": "id, votes_count"}
    )
    candidates = cand_resp.json()

    if not candidates:
        raise HTTPException(status_code=400, detail="Нет кандидатов.")

    # 2. Находим кандидата с макс. голосами
    # Сортируем по убыванию голосов
    candidates.sort(key=lambda x: x['votes_count'], reverse=True)
    winner = candidates[0]

    # 3. Обновляем номинацию
    await supabase.patch(
        "/slay_nominations",
        params={"id": f"eq.{nom_id}"},
        json={"winner_id": winner['id']}
    )

    return {"message": f"Номинация завершена. Победитель ID: {winner['id']}"}

# 2. Голосование
# --- ЗАМЕНИТЬ ФУНКЦИЮ vote_slay ПОЛНОСТЬЮ ---
@app.post("/api/v1/slay/vote")
async def vote_slay(
    request_data: SlayVoteRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info: raise HTTPException(status_code=401)
    
    user_id = user_info['id']

    # 1. ПРОВЕРКА НА САМОГОЛОСОВАНИЕ
    try:
        cand_resp = await supabase.get(
            "/slay_candidates",
            params={"id": f"eq.{request_data.candidate_id}", "select": "user_id"}
        )
        candidates_data = cand_resp.json()
        
        if candidates_data:
            candidate_owner_id = candidates_data[0].get('user_id')
            if candidate_owner_id == user_id:
                raise HTTPException(
                    status_code=400,
                    detail="Голосовать за самого себя нельзя! 🤡"
                )
    except HTTPException as he:
        raise he
    except Exception as e:
        logging.error(f"Ошибка проверки самолайка: {e}")
        raise HTTPException(status_code=500, detail="Ошибка проверки кандидата")

    # 2. ПРОВЕРКА ПОДПИСКИ (Gatekeeping)
    REQUIRED_CHANNEL_ID = -1002144676097 
    
    # Создаем бота вне блока try, чтобы закрыть его в finally
    temp_bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    
    try:
        chat_member = await temp_bot.get_chat_member(chat_id=REQUIRED_CHANNEL_ID, user_id=user_id)
        
        # Если статус left (вышел) или kicked (кикнут/забанен)
        if chat_member.status in ['left', 'kicked']:
            raise HTTPException(status_code=403, detail="subscription_required")
            
    except TelegramForbiddenError:
        logging.error(f"Бот не админ в канале {REQUIRED_CHANNEL_ID}")
        # Если бот не админ, мы не можем проверить подписку, поэтому пропускаем или блокируем (на ваше усмотрение)
        # Обычно лучше пропустить, чтобы не блокировать функционал из-за ошибки настройки
        pass 
    except TelegramBadRequest as e:
        # 🔥 ФИКС: Обработка PARTICIPANT_ID_INVALID
        # Если Telegram говорит, что ID невалиден, значит, он не может найти связь юзера с чатом.
        # Чаще всего это равносильно отсутствию подписки.
        if "PARTICIPANT_ID_INVALID" in str(e):
            logging.warning(f"Ошибка ID при проверке подписки для {user_id}. Считаем, что не подписан.")
            raise HTTPException(status_code=403, detail="subscription_required")
        else:
            logging.error(f"Ошибка TelegramBadRequest: {e}")
            pass
    except HTTPException as he:
        raise he 
    except Exception as e:
        logging.error(f"Ошибка проверки подписки: {e}")
        pass 
    finally:
        # 🔥 ФИКС: Сессия закрывается ВСЕГДА, даже если была ошибка
        await temp_bot.session.close()

    # 3. ЗАПИСЬ ГОЛОСА
    try:
        response = await supabase.post(
            "/rpc/vote_in_slay",
            json={
                "p_nomination_id": request_data.nomination_id,
                "p_candidate_id": request_data.candidate_id,
                "p_voter_id": user_id
            }
        )
        
        if response.status_code == 200:
             try:
                 result = response.json()
                 if isinstance(result, dict) and not result.get('success', True):
                     raise HTTPException(status_code=400, detail=result.get('message'))
             except:
                 pass 
                 
        elif response.status_code >= 400:
             error_msg = response.json().get('message', 'Ошибка при голосовании')
             raise HTTPException(status_code=400, detail=error_msg)

        return {"success": True, "message": "Голос принят"}
    except HTTPException as he:
        raise he
    except Exception as e:
        logging.error(f"Slay Vote Error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка голосования")

# 3. Админ: Создать номинацию
@app.post("/api/v1/admin/slay/nomination/create")
async def create_slay_nomination(
    request_data: SlayNominationCreate, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(status_code=403)

    # Сохраняем картинку
    await supabase.post("/slay_nominations", json={
        "title": request_data.title, 
        "description": request_data.description,
        "image_url": request_data.image_url # <-- Пишем в базу
    })
    return {"message": "Номинация создана"}

# 4. Админ: Добавить кандидата (по user_id)
@app.post("/api/v1/admin/slay/candidate/add")
async def add_slay_candidate(
    request_data: SlayCandidateAdd, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(status_code=403)

    await supabase.post("/slay_candidates", json={
        "nomination_id": request_data.nomination_id,
        "user_id": request_data.user_id,
        "custom_title": request_data.custom_title
    })
    return {"message": "Кандидат добавлен"}

# 4. Админ: Добавить кандидата (по user_id)        
# --- НОВЫЕ ЭНДПОИНТЫ: АДМИНКА АУКЦИОНА ---

@app.post("/api/v1/admin/auctions/finish_manual")
async def admin_finish_auction(
    request_data: AdminAuctionFinishRequest,
    background_tasks: BackgroundTasks, # <--- ✅ ВАЖНО
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (Админ) Принудительно завершает аукцион и отправляет уведомления.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    auction_id = request_data.id
    
    try:
        rpc_resp = await supabase.post("/rpc/finish_auction", json={"p_auction_id": auction_id})
        rpc_resp.raise_for_status()
        
        winner_data_list = rpc_resp.json()
        if not winner_data_list:
            return {"message": "Аукцион завершен, ставок не было."}

        winner_data = winner_data_list[0]
        
        if winner_data.get('winner_id'):
            winner_id = winner_data['winner_id']
            winner_name = winner_data['winner_name']
            auction_title = winner_data.get('auction_title') or winner_data.get('title') or "Лот"
            winning_bid = winner_data['winning_bid']
            
            # Уведомление победителю
            msg_text = (
                f"🎉 <b>Поздравляем, {html_decoration.quote(winner_name)}!</b>\n\n"
                f"Вы победили в аукционе за лот «{html_decoration.quote(auction_title)}»!\n"
                f"Ставка: <b>{winning_bid} билетов</b> (списаны).\n\n"
                f"Администратор свяжется с вами для выдачи приза."
            )
            background_tasks.add_task(
                check_and_send_notification,
                winner_id,
                msg_text,
                "notify_auction_end"
            )
            
            # Уведомление админу (всегда шлем)
            if ADMIN_NOTIFY_CHAT_ID:
                await safe_send_message(
                    ADMIN_NOTIFY_CHAT_ID,
                    f"🏆 <b>Аукцион завершен! (Вручную)</b>\n\n"
                    f"Лот: {html_decoration.quote(auction_title)}\n"
                    f"Победитель: {html_decoration.quote(winner_name)} (ID: {winner_id})\n"
                    f"Ставка: {winning_bid}"
                )
            return {"message": f"Аукцион {auction_id} завершен, победитель {winner_id}."}
        else:
            return {"message": f"Аукцион {auction_id} завершен, победитель не определен."}
    
    except Exception as e:
        logging.error(f"Ошибка завершения аукциона: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при завершении аукциона.")
    # --- 🔼🔼🔼 КОНЕЦ ИСПРАВЛЕНИЯ 🔼🔼🔼 ---

@app.post("/api/v1/admin/auctions/clear_participants")
async def admin_clear_auction_participants(
    request_data: AuctionDeleteRequest, # Мы можем повторно использовать эту модель
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (Админ) "Сбрасывает" аукцион, создавая его клон и удаляя старый.
    (Логика 1-в-1 как у "events")
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    old_auction_id = request_data.id
    logging.info(f"АДМИН: Сброс (клонирование) аукциона ID {old_auction_id}...")

    try:
        # 1. Получаем данные старого аукциона
        old_auction_resp = await supabase.get(
            "/auctions",
            params={"id": f"eq.{old_auction_id}", "select": "*", "limit": 1}
        )
        old_auction_resp.raise_for_status()
        old_auction_data = old_auction_resp.json()
        if not old_auction_data:
            raise HTTPException(status_code=404, detail="Аукцион для сброса не найден.")
        
        old_auction = old_auction_data[0]

        # 2. Создаем НОВЫЙ аукцион (клон)
        new_auction_payload = {
            "title": old_auction.get("title"),
            "image_url": old_auction.get("image_url"),
            "bid_cooldown_hours": old_auction.get("bid_cooldown_hours", 4),
            # Все остальные поля (is_active, winner_id, etc.) будут по умолчанию (false/null)
        }

        new_auction_resp = await supabase.post(
            "/auctions",
            json=new_auction_payload,
            headers={"Prefer": "return=representation"}
        )
        new_auction_resp.raise_for_status()
        new_auction = new_auction_resp.json()[0]
        new_auction_id = new_auction['id']
        
        # 3. Удаляем СТАРЫЙ аукцион
        # (У вас должна быть включена "ON DELETE CASCADE" для 'auction_bids')
        await supabase.delete(
            "/auctions",
            params={"id": f"eq.{old_auction_id}"}
        )
        
        return {"message": f"Аукцион сброшен. Создан новый лот (ID: {new_auction_id})."}

    except Exception as e:
        logging.error(f"❌ ОШИБКА при сбросе (клонировании) аукциона {old_auction_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера при сбросе.")

@app.post("/api/v1/admin/auctions/reset")
async def admin_reset_auction(
    request_data: AuctionDeleteRequest, # Мы можем повторно использовать эту модель
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (Админ) Сбрасывает аукцион к начальному состоянию и удаляет все ставки.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    auction_id = request_data.id
    logging.info(f"АДМИН: Сброс аукциона ID {auction_id}...")

    try:
        # 1. Удаляем все ставки, связанные с этим аукционом
        # (Убедитесь, что у вашей service_role есть права на DELETE в auction_bids)
        await supabase.delete(
            "/auction_bids",
            params={"auction_id": f"eq.{auction_id}"}
        )

        # 2. Сбрасываем состояние самого аукциона
        reset_payload = {
            "current_highest_bid": None,
            "current_highest_bidder_name": None,
            "current_highest_bidder_id": None,
            "winner_id": None,
            "ended_at": None,
            "bid_cooldown_ends_at": None,
            "prize_sent_confirmed": False,
            "is_active": False # Лот также становится неактивным
        }
        
        await supabase.patch(
            "/auctions",
            params={"id": f"eq.{auction_id}"},
            json=reset_payload
        )
        
        return {"message": "Аукцион сброшен. Все ставки удалены, лот деактивирован."}

    except Exception as e:
        logging.error(f"❌ ОШИБКА при сбросе аукциона {auction_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера при сбросе.")

# --- НОВЫЙ ЭНДПОИНТ ДЛЯ ПОЛУЧЕНИЯ ДЕТАЛЕЙ ПРИЗОВ ЧЕКПОИНТА ---
@app.post("/api/v1/admin/checkpoint_rewards/details")
async def get_checkpoint_rewards_details_for_admin( # Новое имя функции
    request_data: PendingActionRequest, # Модель можно оставить
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (Админ) Возвращает ПОЛНЫЙ список ручных наград из системы Чекпоинт для модального окна.
    (Повторяет логику старого эндпоинта /api/v1/admin/checkpoint_rewards до изменений)
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    try:
        # Шаг 1: Получаем все ожидающие награды напрямую из таблицы
        rewards_resp = await supabase.get(
            "/manual_rewards",
            params={
                "status": "eq.pending",
                "select": "id,user_id,reward_details,source_description,created_at"
            }
        )
        rewards_resp.raise_for_status()
        all_pending_rewards = rewards_resp.json()

        # Шаг 2: Фильтруем в Python, чтобы остались только награды из Чекпоинта
        checkpoint_rewards_raw = [
            r for r in all_pending_rewards
            if r.get("source_description") and "чекпоинт" in r["source_description"].lower()
        ]

        if not checkpoint_rewards_raw:
            return [] # Возвращаем пустой список, если наград нет

        # Шаг 3: Собираем ID пользователей и запрашиваем их данные
        user_ids = {r["user_id"] for r in checkpoint_rewards_raw}
        users_resp = await supabase.get(
            "/users",
            params={
                "telegram_id": f"in.({','.join(map(str, user_ids))})",
                "select": "telegram_id,full_name,trade_link"
            }
        )
        users_resp.raise_for_status()
        users_data = {u["telegram_id"]: u for u in users_resp.json()}

        # Шаг 4: Объединяем данные о наградах с данными о пользователях
        final_rewards = []
        for reward in checkpoint_rewards_raw:
            user_details = users_data.get(reward["user_id"], {})
            # Добавляем все нужные поля для renderCheckpointPrizes
            final_rewards.append({
                "id": reward.get("id"),
                "source_description": reward.get("source_description"),
                "reward_details": reward.get("reward_details"),
                "user_full_name": user_details.get("full_name", "N/A"),
                "user_trade_link": user_details.get("trade_link"),
                "created_at": reward.get("created_at") # Добавим дату для сортировки
            })

        # Шаг 5: Сортируем по дате создания (новые сверху)
        final_rewards.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        return final_rewards

    except Exception as e:
        logging.error(f"Ошибка при получении деталей наград Чекпоинта: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить детали наград Чекпоинта.")
# --- КОНЕЦ НОВОГО ЭНДПОИНТА ---

# --- НОВЫЙ ЭНДПОИНТ ДЛЯ МАГАЗИНА ---
@app.post("/api/v1/admin/shop_purchases/details")
async def get_shop_purchases_details_for_admin(
    request_data: PendingActionRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Возвращает список покупок в магазине (source_type='shop')."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    try:
        # 1. Получаем награды типа 'shop'
        rewards_resp = await supabase.get(
            "/manual_rewards",
            params={
                "status": "eq.pending",
                "source_type": "eq.shop", 
                "select": "id,user_id,reward_details,source_description,created_at"
            }
        )
        rewards_resp.raise_for_status()
        shop_rewards = rewards_resp.json()

        if not shop_rewards:
            return []

        # 2. Собираем ID пользователей
        user_ids = {r["user_id"] for r in shop_rewards}
        users_resp = await supabase.get(
            "/users",
            params={
                "telegram_id": f"in.({','.join(map(str, user_ids))})",
                "select": "telegram_id,full_name,trade_link,username"
            }
        )
        users_data = {u["telegram_id"]: u for u in users_resp.json()}

        # 3. Формируем ответ
        final_rewards = []
        for reward in shop_rewards:
            user_details = users_data.get(reward["user_id"], {})
            
            # --- 👇 ИСПРАВЛЕНИЕ: Извлекаем картинку из source_description 👇 ---
            raw_desc = reward.get("source_description", "")
            image_url = "https://placehold.co/100?text=Item" # Дефолт
            
            # Формат в базе: "Название Товара|https://картинка..."
            if raw_desc and "|" in raw_desc:
                parts = raw_desc.split("|")
                # Проверяем, что вторая часть похожа на ссылку
                if len(parts) > 1 and parts[1].strip().startswith("http"):
                    image_url = parts[1].strip()
            # --- 👆 КОНЕЦ ИСПРАВЛЕНИЯ 👆 ---
            
            final_rewards.append({
                "id": reward.get("id"),
                "user_id": reward.get("user_id"),  # <--- 🔥 ДОБАВИТЬ ВОТ ЭТУ СТРОКУ 🔥
                "title": reward.get("reward_details"), 
                "description": raw_desc,
                "user_full_name": user_details.get("full_name", "N/A"),
                "user_username": user_details.get("username"),
                "user_trade_link": user_details.get("trade_link"),
                "created_at": reward.get("created_at"),
                "image_url": image_url 
            })

        final_rewards.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        return final_rewards

    except Exception as e:
        logging.error(f"Ошибка при получении покупок магазина: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить покупки.")

@app.post("/api/v1/admin/shop/reset_cache")
async def admin_reset_shop_cache(
    request_data: AdminShopCacheClearRequest,
    background_tasks: BackgroundTasks,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (Админ) Очищает кэш И СРАЗУ загружает свежие данные для главной категории.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    if request_data.password != "6971":
        raise HTTPException(status_code=403, detail="Неверный пароль.")

    try:
        # 1. Удаляем ВСЕ старые записи (ИСПРАВЛЕНО для httpx)
        # Используем параметр category_id=neq.-1, чтобы удалить всё (PostgREST синтаксис)
        response = await supabase.delete(
            "/shop_cache", 
            params={"category_id": "neq.-1"}
        )
        
        # Если вдруг API вернет ошибку при удалении
        if response.status_code not in range(200, 300):
             logging.error(f"Ошибка удаления кэша БД: {response.text}")

        # Очищаем локальную переменную Python
        global shop_goods_cache
        shop_goods_cache = {} 

        # 2. 🔥 ЗАГРУЖАЕМ СВЕЖИЕ ДАННЫЕ (Главная категория 0) ПРЯМО СЕЙЧАС
        await fetch_and_cache_goods_background(0)
        
        logging.info(f"Admin {user_info['id']} сбросил и обновил кэш магазина.")
        return {"message": "Кэш очищен и обновлен! Новые товары уже загружены."}

    except Exception as e:
        logging.error(f"Ошибка при сбросе кэша: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка при обновлении кэша.")

@app.get("/api/v1/auth/check_token")
async def check_token_auth(token: str, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    try:
        r = await supabase.get("/auth_tokens", params={"token": f"eq.{token}", "select": "telegram_id,used"})
        r.raise_for_status()
        data = r.json()
        if data and data[0].get("telegram_id") and data[0].get("used"):
            user_id = data[0]["telegram_id"]
            session_cookie = encode_cookie({"id": user_id})
            response = JSONResponse(content={"authenticated": True, "telegram_id": user_id})
            response.set_cookie(key="auth_session", value=session_cookie, path="/", max_age=604800, httponly=True, samesite="None", secure=True)
            return response
        return JSONResponse(content={"authenticated": False})
    except Exception as e:
        logging.error(f"Ошибка в check_token: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/auth/session_check")
async def session_check(request: Request):
    auth_cookie = request.cookies.get("auth_session")
    user_data = decode_cookie(auth_cookie)
    if not user_data or "id" not in user_data:
        return {"is_guest": True}
    return {"is_guest": False}

# --- НОВЫЙ ЭНДПОИНТ ДЛЯ СЧЕТЧИКОВ ---
@app.post("/api/v1/admin/pending_counts")
async def get_pending_counts(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Возвращает количество ожидающих действий."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # 1. Считаем заявки на ручные квесты
        subs_resp = await supabase.get(
            "/quest_submissions",
            params={"status": "eq.pending", "select": "id"},
            headers={"Prefer": "count=exact"}
        )
        submission_count = int(subs_resp.headers.get('content-range', '0').split('/')[-1])

        # 2. Получаем все ручные награды разом
        manual_rewards_details = await supabase.get(
            "/manual_rewards",
            params={"status": "eq.pending", "select": "source_type, source_description"}
        )
        manual_rewards_list = manual_rewards_details.json()

        # Фильтруем по типам
        # Чекпоинт: если в описании есть слово "чекпоинт"
        checkpoint_prize_count = sum(1 for r in manual_rewards_list if r.get("source_description") and "чекпоинт" in r["source_description"].lower())
        
        # --- НОВОЕ: Магазин: если source_type == 'shop' ---
        shop_prize_count = sum(1 for r in manual_rewards_list if r.get("source_type") == "shop")

        # 3. Считаем невыданные призы розыгрышей
        content_resp = await supabase.get(
            "/pages_content",
            params={"page_name": "eq.events", "select": "content", "limit": 1}
        )
        event_prize_count = 0
        if content_resp.json():
            content = content_resp.json()[0].get('content', {})
            events = content.get("events", [])
            event_prize_count = sum(1 for event in events if 'winner_id' in event and not event.get('prize_sent_confirmed', False))

        return {
            "submissions": submission_count,
            "event_prizes": event_prize_count,
            "checkpoint_prizes": checkpoint_prize_count,
            "shop_prizes": shop_prize_count # <-- Добавили это поле
        }

    except Exception as e:
        logging.error(f"Ошибка при получении счетчиков: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось получить счетчики.")
# --- КОНЕЦ НОВОГО ЭНДПОИНТА ---

# --- НОВЫЙ ЭНДПОИНТ: Архив аукционов ---
@app.post("/api/v1/auctions/archive")
async def get_auctions_archive(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Возвращает список завершенных аукционов (с победителями)."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        # Запрашиваем лоты, у которых есть winner_id.
        # Используем синтаксис PostgREST для JOIN таблицы users (чтобы получить имена).
        response = await supabase.get(
            "/auctions",
            params={
                "winner_id": "not.is.null",
                "select": "id, title, image_url, current_highest_bid, ended_at, winner:users!winner_id(full_name, twitch_login)",
                "order": "ended_at.desc",
                "limit": "30"
            }
        )
        response.raise_for_status()
        return response.json()

    except Exception as e:
        logging.error(f"Ошибка получения архива аукционов: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить архив.")

@app.post("/api/v1/auctions/list") # <-- ИЗМЕНЕНО: GET на POST
async def get_auctions_list_for_user(
    request_data: InitDataRequest, # <-- ИЗМЕНЕНО: Принимаем initData
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (ИСПРАВЛЕНО) Возвращает список активных аукционов,
    включая данные о ставке и ранге ТЕКУЩЕГО пользователя.
    """
    # 1. Валидация пользователя
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        # Если пользователь гость (или невалидный initData), p_user_id будет null
        user_id = None
    else:
        user_id = user_info["id"]

    try:
        # 2. Вызов "умной" RPC-функции
        rpc_params = {"p_user_id": user_id}
        
        resp = await supabase.post(
            "/rpc/get_public_auctions_for_user", # <-- ИЗМЕНЕНО: Новая RPC
            json=rpc_params
        )
        resp.raise_for_status()
        
        # 3. RPC вернет готовый JSON-массив
        return resp.json()
        
    except Exception as e:
        logging.error(f"Ошибка при получении списка аукционов для user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить лоты.")


@app.post("/api/v1/quests/manual")
async def get_manual_quests(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")

    telegram_id = user_info["id"]

    try:
        # 1. Получаем ID всех одобренных заявок для этого пользователя
        completed_resp = await supabase.get(
            "/quest_submissions",
            params={"user_id": f"eq.{telegram_id}", "status": "eq.approved", "select": "quest_id"}
        )
        completed_resp.raise_for_status()
        completed_quest_ids = {sub['quest_id'] for sub in completed_resp.json()}

# 2. Получаем все активные квесты с ручной проверкой, включая данные категории и sort_order
        # --- ИЗМЕНЕНИЕ ЗДЕСЬ: Упрощаем сортировку в запросе ---
        all_manual_quests_resp = await supabase.get(
            "/quests",
            params={
                "is_active": "eq.true",
                "quest_type": "eq.manual_check",
                "select": "*, quest_categories(name, sort_order), sort_order", # Запрашиваем все нужные поля
                # Сортируем ТОЛЬКО по ID для начала, остальное сделаем в Python
                "order": "id.asc"
            }
        )
        all_manual_quests_resp.raise_for_status()
        all_manual_quests = all_manual_quests_resp.json()
        # --- КОНЕЦ ИЗМЕНЕНИЯ ---

        # 3. Фильтруем квесты...
        available_quests_filtered = [
            quest for quest in all_manual_quests
            if quest.get('is_repeatable') or quest.get('id') not in completed_quest_ids
        ]

        # --- НОВЫЙ БЛОК: Сортируем отфильтрованный список в Python ---
        def get_sort_key(quest):
            category_sort = 9999 # По умолчанию для квестов без категории
            quest_sort = quest.get('sort_order') if quest.get('sort_order') is not None else 9999
            if quest.get('quest_categories'):
                category_sort = quest['quest_categories'].get('sort_order') if quest['quest_categories'].get('sort_order') is not None else 9999
            return (category_sort, quest_sort, quest.get('id', 0))

        available_quests_filtered.sort(key=get_sort_key)
        # --- КОНЕЦ НОВОГО БЛОКА ---

        # 4. Возвращаем отсортированный и отфильтрованный список
        return available_quests_filtered # Возвращаем новый отсортированный список

    except Exception as e:
        logging.error(f"Ошибка при получении ручных квестов для {telegram_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить задания.")

@app.post("/api/v1/quests/close_expired")
async def close_expired_quest(
    request_data: QuestCloseRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Просто закрывает активный квест пользователя без применения кулдаунов."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")

    telegram_id = user_info["id"]

    try:
        # Просто сбрасываем активный квест в профиле пользователя
        await supabase.patch(
            "/users",
            params={"telegram_id": f"eq.{telegram_id}"},
            json={"active_quest_id": None, "quest_progress": 0} # quest_progress - возможное имя колонки, проверьте в вашей БД
        )
        return {"message": "Истекшее задание успешно закрыто."}
    except Exception as e:
        logging.error(f"Ошибка при закрытии истекшего квеста для {telegram_id}: {e}")
        raise HTTPException(status_code=500, detail="Не удалось закрыть задание.")
    
@app.post("/api/v1/quests/categories")
async def get_quests_categories(request_data: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """
    Получает список категорий для отображения на странице Заданий.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")

    resp = await supabase.get("/quest_categories", params={"select": "name,id", "order": "sort_order.asc"})
    resp.raise_for_status()
    return resp.json()
    
@app.post("/api/v1/quests/list")
async def get_public_quests(request_data: InitDataRequest):
    """
    Получает список квестов.
    Вся логика расписания и приоритетов (Ручное/Авто)
    теперь выполняется внутри SQL-функции get_available_quests_for_user.
    Python просто передает результат.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    telegram_id = user_info.get("id") if user_info else None

    if not telegram_id:
        return []

    try:
        # Вызываем "умную" SQL функцию
        response = supabase.rpc(
            "get_available_quests_for_user",
            {"p_telegram_id": telegram_id}
        ).execute()

        available_quests_raw = response.data

        if available_quests_raw is None or not isinstance(available_quests_raw, list):
            available_quests = []
        else:
            available_quests = available_quests_raw

        # Просто добавляем технические поля, не фильтруя список
        processed_quests = []
        for quest_data in available_quests:
            if isinstance(quest_data, dict):
                quest_data['is_completed'] = False
                processed_quests.append(quest_data)

        return fill_missing_quest_data(processed_quests)

    except Exception as e:
        logging.error(f"Ошибка при получении квестов RPC: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось получить список квестов.")
        
# 👇 Убедитесь, что этот импорт есть в начале файла
# 👇 Убедитесь, что этот импорт есть в самом верху файла index.py
from urllib.parse import urlencode

@app.get("/api/v1/auth/twitch_oauth")
async def twitch_oauth_start(
    request: Request, # <--- ВАЖНО: Добавили request для чтения заголовков устройства
    initData: str
):
    # 1. Парсим данные пользователя для логов
    try:
        user_data = dict(parse_qsl(initData))
        user_json = json.loads(user_data.get("user", "{}"))
        user_id = user_json.get("id", "unknown")
        username = user_json.get("username", "unknown")
    except:
        user_id = "parse_error"
        username = "parse_error"

    # 2. Получаем информацию об устройстве (User-Agent)
    user_agent = request.headers.get('user-agent', 'unknown')

    # --- ЛОГ: МАКСИМАЛЬНАЯ ДЕТАЛИЗАЦИЯ ---
    logging.info(f"🟣 [Twitch OAuth] Запрос от: ID={user_id} (@{username})")
    logging.info(f"📱 [Twitch OAuth] Устройство: {user_agent}")
    
    if not initData:
        logging.error(f"❌ [Twitch OAuth] Ошибка: initData пустой для user {user_id}")
        raise HTTPException(status_code=400, detail="initData is required")
    
    # Проверка переменных
    if not TWITCH_CLIENT_ID or not TWITCH_REDIRECT_URI:
        logging.error("❌ Config Error: ClientID or RedirectURI missing")
        raise HTTPException(status_code=500, detail="Server config error")

    state = create_twitch_state(initData)
    scopes_list = "user:read:email channel:read:redemptions user:read:subscriptions channel:read:vips"
    
    # Параметры ссылки
    params = {
        "response_type": "code",
        "client_id": TWITCH_CLIENT_ID,
        "redirect_uri": TWITCH_REDIRECT_URI,
        "scope": scopes_list,
        "state": state
    }
    
    query_string = urlencode(params)
    twitch_auth_url = f"https://id.twitch.tv/oauth2/authorize?{query_string}"
    
    logging.info(f"🔗 [Twitch HTML Redirect] Сгенерирована ссылка: {twitch_auth_url}")

    # Используем безопасный метод вставки (без f-строк HTML, чтобы не ломать подсветку)
    html_template = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Redirecting...</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script type="text/javascript">
            window.location.replace("TARGET_URL");
        </script>
    </head>
    <body>
        <p style="text-align:center; margin-top:20px;">Переход на Twitch...</p>
    </body>
    </html>
    """
    
    html_content = html_template.replace("TARGET_URL", twitch_auth_url)
    
    response = Response(content=html_content, media_type="text/html")
    
    response.set_cookie(
        key="twitch_oauth_init_data", 
        value=initData, 
        max_age=300, 
        path="/", 
        samesite="None", 
        secure=True
    )
    
    return response
    
@app.get("/api/v1/auth/twitch_callback")
async def twitch_oauth_callback(
    request: Request, 
    code: str = Query(...), 
    state: str = Query(...),
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    init_data = request.cookies.get("twitch_oauth_init_data")
    if not init_data or not validate_twitch_state(state, init_data):
        raise HTTPException(status_code=403, detail="Invalid state. CSRF attack?")
        
    async with httpx.AsyncClient() as client:
        # 1. Обмениваем код на токен
        token_response = await client.post(
            "https://id.twitch.tv/oauth2/token",
            data={
                "client_id": TWITCH_CLIENT_ID, 
                "client_secret": TWITCH_CLIENT_SECRET,
                "code": code, 
                "grant_type": "authorization_code", 
                "redirect_uri": TWITCH_REDIRECT_URI,
            }
        )
        token_data = token_response.json()
        if "access_token" not in token_data:
            raise HTTPException(status_code=500, detail="Failed to get access token from Twitch")
            
        access_token = token_data["access_token"]
        refresh_token = token_data.get("refresh_token") 
        headers = {"Authorization": f"Bearer {access_token}", "Client-Id": TWITCH_CLIENT_ID}
        
        # 2. Получаем данные пользователя Twitch
        user_response = await client.get("https://api.twitch.tv/helix/users", headers=headers)
        user_data = user_response.json()
        if not user_data.get("data"):
            raise HTTPException(status_code=500, detail="Failed to get user info from Twitch")

        twitch_user = user_data["data"][0]
        twitch_id = twitch_user["id"]
        twitch_login = twitch_user["login"] 
        
        # 3. Готовим данные
        user_info = is_valid_init_data(init_data, ALL_VALID_TOKENS)
        if not user_info: raise HTTPException(status_code=401)
        telegram_id = user_info["id"]

        update_payload = {
            "twitch_id": twitch_id, 
            "twitch_login": twitch_login,
            "twitch_access_token": access_token,   # 🔥 СОХРАНЯЕМ ВСЕМ (для тихого обновления)
            "twitch_refresh_token": refresh_token  # 🔥 СОХРАНЯЕМ ВСЕМ (для тихого обновления)
        }

        # --- Проверка подписки при ПЕРВОМ входе ---
        broadcaster_id = os.getenv("TWITCH_BROADCASTER_ID")
        new_status = "none"
        
        if broadcaster_id:
            try:
                sub_url = f"https://api.twitch.tv/helix/subscriptions/user?broadcaster_id={broadcaster_id}&user_id={twitch_id}"
                sub_resp = await client.get(sub_url, headers=headers)
                if sub_resp.status_code == 200:
                    new_status = "subscriber"
            except Exception as e:
                logging.error(f"Error checking sub: {e}")

        # Защита VIP (получаем текущий статус, чтобы не сбросить VIP)
        try:
            current_user_resp = await supabase.get("/users", params={"telegram_id": f"eq.{telegram_id}", "select": "twitch_status"})
            current_status_db = current_user_resp.json()[0].get("twitch_status") if current_user_resp.json() else None
            
            if current_status_db == "vip":
                new_status = "vip" 
            
            update_payload["twitch_status"] = new_status
        except: pass

        # 4. Обновляем таблицу users
        await supabase.patch(
            "/users",
            params={"telegram_id": f"eq.{telegram_id}"},
            json=update_payload
        )
        
    redirect_url = f"{WEB_APP_URL}/profile"
    response = Response(status_code=307)
    response.headers['Location'] = redirect_url
    response.delete_cookie("twitch_oauth_init_data", path="/", samesite="None", secure=True)
    return response

class PromocodeDeleteRequest(BaseModel): initData: str; code: str
class InitDataRequest(BaseModel): initData: str
class GrantCheckpointAccessRequest(BaseModel):
    initData: str
    user_id_to_grant: int
class QuestSubmission(BaseModel): initData: str; submittedData: str
class QuestSubmissionRequest(BaseModel): initData: str; submittedData: str    
class QuestCreateRequest(BaseModel): 
    initData: str
    title: str
    description: str = ""
    reward_amount: int
    quest_type: str
    target_value: Optional[int] = None
    icon_url: Optional[str] = None
    duration_hours: Optional[int] = 0 # <-- НОВЫЙ КОД
    action_url: Optional[str] = None
    category_id: Optional[int] = None
    is_repeatable: bool = False

class TelegramClaimRequest(BaseModel):
    initData: str
    user_id: int
    task_key: str

class QuestUpdateRequest(BaseModel):
    initData: str
    quest_id: int
    title: str
    description: str = ""
    reward_amount: int = 0
    quest_type: str
    target_value: Optional[int] = 0
    icon_url: Optional[str] = None
    is_active: bool = True
    duration_hours: Optional[int] = 0 # <-- НОВЫЙ КОД
    action_url: Optional[str] = None
    category_id: Optional[int] = None
    is_repeatable: bool = False

class SubmissionUpdateRequest(BaseModel): initData: str; submission_id: int; action: str
class QuestDeleteRequest(BaseModel): initData: str; quest_id: int
class QuestDetailsRequest(BaseModel):
    initData: str
    quest_id: int
class PromocodeAddRequest(BaseModel): initData: str; codes: str; reward_value: int; description: str
class PromocodeClaimRequest(BaseModel): initData: str; quest_id: int
class ChallengeAdminCreateRequest(BaseModel): initData: str; description: str; condition_type: str; target_value: int; duration_days: int; reward_amount: int; is_active: bool = True
class ChallengeAdminUpdateRequest(BaseModel): initData: str; challenge_id: int; description: str; condition_type: str; target_value: int; duration_days: int; reward_amount: int; is_active: bool
class ChallengeAdminDeleteRequest(BaseModel): initData: str; challenge_id: int
class QuestStartRequest(BaseModel):
    initData: str
    quest_id: int

class BottWebhookModel(BaseModel):
    id: str | int          # ID платежа в Bot-t
    amount: float          # Сумма
    status_id: str | int   # Статус (обычно '1' или 'paid')
    custom_fields: Optional[str] = None # Сюда придет ID юзера
    # Остальные поля можно не описывать, если они нам не нужны

# ------------------------------------------------------------------
# 1. ПОЛНОСТЬЮ ЗАМЕНИТЕ ВСПОМОГАТЕЛЬНУЮ ФУНКЦИЮ НА ЭТУ ВЕРСИЮ
# ------------------------------------------------------------------
async def broadcast_notification_task(text: str, setting_key: str):
    """
    ОПТИМИЗИРОВАННАЯ ФОНОВАЯ ЗАДАЧА (Batch sending).
    Отправляет сообщения пачками по 25 штук, чтобы успеть до тайм-аута Vercel.
    """
    try:
        client = await get_background_client()
        
        # 1. Получаем пользователей
        resp = await client.get(
            "/users", 
            params={
                "is_bot_active": "eq.true",
                setting_key: "eq.true",
                "select": "telegram_id"
            }
        )
        users = resp.json()
        
        if not users:
            return

        logging.info(f"📢 Рассылка ({setting_key}): {len(users)} чел.")
        temp_bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        
        try:
            # 2. Разбиваем на пачки по 25 пользователей
            batch_size = 25
            
            for i in range(0, len(users), batch_size):
                batch = users[i:i + batch_size]
                tasks = []
                
                # Создаем задачи для всей пачки
                for user in batch:
                    user_id = user.get("telegram_id")
                    if user_id:
                        # Добавляем задачу отправки в список (без await здесь!)
                        tasks.append(safe_send_one(temp_bot, user_id, text))
                
                # 3. Отправляем всю пачку ОДНОВРЕМЕННО
                await asyncio.gather(*tasks)
                
                # Ждем 1.1 секунду между пачками (защита от спам-бана ТГ)
                await asyncio.sleep(1.1)
                    
        finally:
            await temp_bot.session.close()
            
        logging.info("✅ Рассылка завершена.")

    except Exception as e:
        logging.error(f"Ошибка рассылки: {e}")

# Вспомогательная функция для отправки одного (чтобы гасить ошибки внутри пачки)
async def safe_send_one(bot, chat_id, text):
    try:
        await bot.send_message(chat_id=chat_id, text=text)
    except Exception:
        pass # Игнорируем ошибки (блок, удален), чтобы не сбить рассылку

async def send_admin_notification_task(quest_title: str, user_info: dict, submitted_data: str):
    """
    Отправляет уведомление администратору в фоновом режиме
    с явным созданием и закрытием сессии бота для максимальной надежности.
    """
    # Создаем новый, временный экземпляр бота специально для этой задачи
    temp_bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    
    try:
        if ADMIN_NOTIFY_CHAT_ID:
            user_name = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip() or "Пользователь"
            # Для html_decoration не нужен bot, поэтому используем его напрямую
            safe_user_name = html_decoration.quote(user_name)
            safe_quest_title = html_decoration.quote(quest_title)
            telegram_id = user_info.get("id", "N/A")

            message_text = (
                f"🔔 Новая заявка на проверку!\n\n"
                f"<b>Задание:</b> «{safe_quest_title}»\n"
                f"<b>Пользователь:</b> {safe_user_name} (ID: {telegram_id})\n"
                f"<b>Данные:</b>\n<code>{html_decoration.quote(submitted_data)}</code>"
            )
            
            logging.info("Отправка уведомления админу в новой сессии...")
            # Используем временный экземпляр бота для отправки
            await temp_bot.send_message(ADMIN_NOTIFY_CHAT_ID, message_text, parse_mode=ParseMode.HTML)
            logging.info("Фоновое уведомление админу успешно отправлено.")
            
    except Exception as e:
        logging.error(f"ОШИБКА в фоновой задаче с новой сессией: {e}", exc_info=True)
    finally:
        # Это КЛЮЧЕВОЙ момент: мы всегда закрываем сессию временного бота,
        # чтобы не оставлять "висящих" соединений.
        await temp_bot.session.close()
        logging.info("Сессия временного бота в фоновой задаче закрыта.")

async def safe_send_message(chat_id: int, text: str, **kwargs):
    """
    Универсальная и надежная функция для отправки сообщений.
    Обрабатывает блокировку бота пользователем.
    """
    temp_bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    try:
        await temp_bot.send_message(chat_id=chat_id, text=text, **kwargs)
        logging.info(f"✅ Безопасная отправка сообщения в чат {chat_id} выполнена.")
    except TelegramForbiddenError:
        # Это случается, если пользователь заблокировал бота
        logging.warning(f"⚠️ Не удалось отправить сообщение {chat_id}: пользователь заблокировал бота.")
    except Exception as e:
        # Остальные ошибки (например, проблемы с сетью)
        logging.error(f"❌ ОШИБКА отправки в чат {chat_id}: {e}", exc_info=True)
    finally:
        await temp_bot.session.close()

async def check_and_send_notification(
    user_id: int, 
    message_text: str, 
    setting_key: str, 
    reply_markup=None
):
    """
    Умная отправка уведомлений. Проверяет настройки пользователя перед отправкой.
    Использует глобальный клиент Supabase для скорости.
    """
    try:
        # 1. Проверяем настройки пользователя (Один быстрый запрос)
        # Нам нужно знать: включен ли DND и включена ли конкретная настройка (setting_key)
        resp = supabase.table("users").select(f"notify_dnd_enabled, {setting_key}").eq("telegram_id", user_id).execute()
        
        if not resp.data:
            return # Пользователь не найден

        settings = resp.data[0]
        is_notify_enabled = settings.get(setting_key, True) # По умолчанию шлем, если настройки нет
        is_dnd_enabled = settings.get("notify_dnd_enabled", False)

        # 2. Проверка: Если настройка выключена пользователем -> НЕ ШЛЕМ
        if not is_notify_enabled:
            logging.info(f"🔕 Уведомление ({setting_key}) для {user_id} отключено в настройках.")
            return

        # 3. Проверка: Тихий режим (DND)
        if is_dnd_enabled:
            # Получаем текущее время в Москве (UTC+3)
            tz_msk = timezone(timedelta(hours=3))
            now_hour = datetime.now(tz_msk).hour
            
            # Если время от 23:00 до 08:00
            if now_hour >= 23 or now_hour < 8:
                logging.info(f"🌙 Тихий режим для {user_id}: уведомление пропущено (время {now_hour}:00).")
                return

        # 4. Если все проверки пройдены -> Шлем через безопасную функцию
        await safe_send_message(user_id, message_text, reply_markup=reply_markup)

    except Exception as e:
        logging.error(f"Ошибка в check_and_send_notification: {e}")

# ⬆️⬆️⬆️ КОНЕЦ ВСТАВКИ ⬆️⬆️⬆️

# ------------------------------------------------------------------
# 2. ПОЛНОСТЬЮ ЗАМЕНИТЕ ВАШУ СТАРУЮ ФУНКЦИЮ НА ЭТУ
# ------------------------------------------------------------------
@app.post("/api/v1/quests/{quest_id}/submit")
async def submit_for_quest(
    quest_id: int, 
    request_data: QuestSubmissionRequest, 
    background_tasks: BackgroundTasks, # <-- Ключевое изменение
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Принимает заявку от пользователя на квест с ручной проверкой.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")
    
    telegram_id = user_info["id"]

    # 1. Проверяем квест
    quest_resp = await supabase.get("/quests", params={"id": f"eq.{quest_id}", "select": "title, is_repeatable"})
    if not quest_resp.json():
        raise HTTPException(status_code=404, detail="Задание не найдено.")
    
    quest_data = quest_resp.json()[0]
    quest_title = quest_data['title']
    is_quest_repeatable = quest_data['is_repeatable']

    # 2. Проверяем предыдущие заявки, если квест не многоразовый
    if not is_quest_repeatable:
        submission_check_resp = await supabase.get(
            "/quest_submissions", 
            params={"user_id": f"eq.{telegram_id}", "quest_id": f"eq.{quest_id}", "select": "status"}
        )
        previous_submissions = submission_check_resp.json()
        if previous_submissions:
            for submission in previous_submissions:
                if submission.get("status") == "pending":
                    raise HTTPException(status_code=400, detail="Ваша предыдущая заявка еще на рассмотрении.")
                if submission.get("status") == "approved":
                    raise HTTPException(status_code=400, detail="Вы уже успешно выполнили это одноразовое задание.")

    # 3. Создаем новую заявку
    await supabase.post("/quest_submissions", json={
        "quest_id": quest_id,
        "user_id": telegram_id,
        "status": "pending",
        "submitted_data": request_data.submittedData
    })

    # 4. Отправляем уведомление админу в ФОНОВОМ РЕЖИМЕ
    background_tasks.add_task(
        send_admin_notification_task,
        quest_title=quest_title,
        user_info=user_info,
        submitted_data=request_data.submittedData
    )

    return {"message": "Ваша заявка принята и отправлена на проверку!"}
    
# --- НОВЫЙ ЭНДПОИНТ ДЛЯ ЗАПУСКА КВЕSTA ---
@app.post("/api/v1/quests/start")
async def start_quest(request_data: QuestStartRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    # 🟢 INFO: Запрос принят
    logging.info(f"--- ЗАПУСК start_quest ---")
    
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    
    # 🟢 INFO: Проверка initData
    logging.info(f"Проверка initData. Валидно: {user_info is not None}")

    if not user_info or "id" not in user_info:
        # ❌ ERROR: Неверные данные аутентификации
        logging.error("Неверные данные аутентификации.")
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")

    telegram_id = user_info["id"]
    quest_id = request_data.quest_id

    # 🟢 INFO: Данные пользователя и квеста получены
    logging.info(f"Пользователь: {telegram_id}, пытается взять квест ID: {quest_id}")

    try:
        # 🟢 INFO: Отправка запроса в Supabase
        logging.info(f"Вызов RPC функции 'start_quest_atomic' в Supabase...")
        
        # Используем httpx.post для вызова RPC
        response = await supabase.post(
            "/rpc/start_quest_atomic",
            json={"p_user_id": telegram_id, "p_quest_id": quest_id}
        )
        
        # Проверяем, что Supabase не вернул ошибку
        response.raise_for_status()

        # 🟢 INFO: Запрос в Supabase успешен
        logging.info(f"✅ Успех! Квест {quest_id} активирован для пользователя {telegram_id}.")
        return {"message": "Квест успешно активирован."}
        
    except httpx.HTTPStatusError as e:
        # ❌ ERROR: Supabase вернул ошибку
        error_details = e.response.text
        logging.error(f"❌ ОШИБКА от Supabase при активации квеста: {error_details}")
        raise HTTPException(status_code=400, detail=f"Ошибка базы данных: {error_details}")
    except Exception as e:
        # ❌ ERROR: Другая ошибка
        logging.error(f"❌ КРИТИЧЕСКАЯ ОШИБКА при активации квеста {quest_id} для {telegram_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")

# --- ДОБАВЬТЕ ЭТОТ КЛАСС ПЕРЕД ФУНКЦИЕЙ, ЕСЛИ ЕГО НЕТ ---
class InitDataModel(BaseModel):
    initData: str

# --- ВАШ НОВЫЙ ЭНДПОИНТ ---
@app.post("/api/v1/quests/manual")
async def get_manual_quests(request: Request, body: InitDataModel):
    # Проверяем, что функция валидации доступна
    # Если validate_telegram_init_data подчеркивается красным, убедитесь, что она определена выше
    user_data = validate_telegram_init_data(body.initData)
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid initData")
    
    user_id = user_data['id']

    # 1. Получаем все активные ручные квесты
    response = await supabase.table("quests").select("*, quest_categories(name)").eq("is_active", True).eq("quest_type", "manual_check").execute()
    manual_quests = response.data

    if not manual_quests:
        return []

    # 2. Получаем прогресс пользователя по этим квестам
    manual_quest_ids = [q['id'] for q in manual_quests]
    
    # Если квестов нет, пропускаем запрос
    if not manual_quest_ids:
        return []

    user_quests_response = await supabase.table("user_quests").select("*").in_("quest_id", manual_quest_ids).eq("user_id", user_id).execute()
    user_quests_map = {uq['quest_id']: uq for uq in user_quests_response.data}

    # 3. Собираем итоговый список
    final_quests = []
    for q in manual_quests:
        uq = user_quests_map.get(q['id'])
        
        # Заполняем статус
        q['is_completed'] = False
        q['is_pending'] = False # На проверке
        q['completed_at'] = None
        
        if uq:
            if uq.get('status') == 'completed':
                 q['is_completed'] = True
                 q['completed_at'] = uq.get('completed_at')
            elif uq.get('status') == 'pending':
                 q['is_pending'] = True
        
        # Подчищаем категории для фронта (если нужно)
        if q.get('quest_categories'):
             pass 
        
        final_quests.append(q)

    # Заполняем дефолтные поля (убедитесь, что эта функция существует в index.py)
    final_quests = fill_missing_quest_data(final_quests)
    
    return final_quests
        
@app.post("/api/v1/user/promocodes/delete")
async def delete_promocode(request_data: PromocodeDeleteRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info: raise HTTPException(status_code=401, detail="Доступ запрещен")
    telegram_id = user_info["id"]; code_to_delete = request_data.code
    await supabase.patch("/promocodes", params={"code": f"eq.{code_to_delete}", "telegram_id": f"eq.{telegram_id}"}, json={"telegram_id": None})
    return {"message": "Промокод удален из вашего списка."}

@app.post("/api/v1/user/promocodes/delete-all")
async def delete_all_user_promocodes(request_data: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """Удаляет (отвязывает) все промокоды у текущего пользователя."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Доступ запрещен")
    
    telegram_id = user_info["id"]
    
    # Говорим базе данных: "Найди все промокоды этого пользователя и сделай их снова ничьими"
    await supabase.patch(
        "/promocodes",
        params={"telegram_id": f"eq.{telegram_id}"},
        json={"telegram_id": None} # Мы не удаляем код, а просто отвязываем его
    )
    
    return {"message": "Все промокоды успешно удалены из вашего списка."}

@app.post("/api/v1/user/twitch/unlink")
async def unlink_twitch_account(request_data: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info: raise HTTPException(status_code=401, detail="Неверные данные аутентификации")
    telegram_id = user_info["id"]
    await supabase.patch("/users", params={"telegram_id": f"eq.{telegram_id}"}, json={"twitch_id": None, "twitch_login": None})
    return {"message": "Аккаунт Twitch успешно отвязан."}

async def get_admin_settings_async_global() -> AdminSettings: # Убрали аргумент supabase
    """Вспомогательная функция для получения настроек админки (с кэшированием), использующая ГЛОБАЛЬНЫЙ клиент."""
    now = time.time()
    # Проверяем, есть ли валидный кэш
    if admin_settings_cache["settings"] and (now - admin_settings_cache["last_checked"] < ADMIN_SETTINGS_CACHE_DURATION):
        # logging.info("⚙️ Используем кэшированные настройки админа (глобальный).") # Раскомментируй для отладки
        return admin_settings_cache["settings"]

    logging.info("⚙️ Кэш настроек админа истек или пуст, запрашиваем из БД (глобальный клиент)...")
    try:
        # --- 1. ИЗМЕНЕНИЕ: Запрашиваем ВСЮ таблицу (key и value), а не одну строку ---
        response = supabase.table("settings").select("key, value").execute()
        data = response.data 

        if data:
            # --- 2. ИЗМЕНЕНИЕ: Превращаем список строк БД в словарь ---
            # Было: [ {key: 'admin_controls', value: {...}}, {key: 'bonus_gift_enabled', value: 'false'} ]
            # Стало: { 'admin_controls': {...}, 'bonus_gift_enabled': 'false' }
            settings_map = {item['key']: item['value'] for item in data}

            # Берем основной JSON со старыми настройками
            settings_data = settings_map.get('admin_controls', {})

            # --- 3. ИЗМЕНЕНИЕ: Достаем твою ОТДЕЛЬНУЮ строку ---
            bonus_gift_raw = settings_map.get('bonus_gift_enabled', True) 
            # Превращаем в true/false (на случай если в базе это строка "true")
            bonus_gift_bool = str(bonus_gift_raw).lower() == 'true' if isinstance(bonus_gift_raw, str) else bool(bonus_gift_raw)


            # --- Логика парсинга старых boolean значений (остается без изменений) ---
            quest_rewards_raw = settings_data.get('quest_promocodes_enabled', False)
            quest_rewards_bool = quest_rewards_raw if isinstance(quest_rewards_raw, bool) else str(quest_rewards_raw).lower() == 'true'

            challenge_rewards_raw = settings_data.get('challenge_promocodes_enabled', True)
            challenge_rewards_bool = challenge_rewards_raw if isinstance(challenge_rewards_raw, bool) else str(challenge_rewards_raw).lower() == 'true'

            challenges_raw = settings_data.get('challenges_enabled', True)
            challenges_bool = challenges_raw if isinstance(challenges_raw, bool) else str(challenges_raw).lower() == 'true'

            quests_raw = settings_data.get('quests_enabled', True)
            quests_bool = quests_raw if isinstance(quests_raw, bool) else str(quests_raw).lower() == 'true'

            checkpoint_raw = settings_data.get('checkpoint_enabled', False)
            checkpoint_bool = checkpoint_raw if isinstance(checkpoint_raw, bool) else str(checkpoint_raw).lower() == 'true'
            # --- Конец логики парсинга ---

            # Создаем объект настроек
            loaded_settings = AdminSettings(
                # 👇 ВОТ ТУТ МЫ ПЕРЕДАЕМ НАШУ НОВУЮ ПЕРЕМЕННУЮ
                bonus_gift_enabled=bonus_gift_bool,
                
                skin_race_enabled=settings_data.get('skin_race_enabled', True),
                slider_order=settings_data.get('slider_order', ["skin_race", "cauldron", "auction"]),
                challenge_promocodes_enabled=challenge_rewards_bool,
                quest_promocodes_enabled=quest_rewards_bool,
                challenges_enabled=challenges_bool,
                quests_enabled=quests_bool,
                checkpoint_enabled=checkpoint_bool,
                menu_banner_url=settings_data.get('menu_banner_url', "https://i.postimg.cc/1Xkj2RRY/sagluska-1200h600.png"),
                checkpoint_banner_url=settings_data.get('checkpoint_banner_url', "https://i.postimg.cc/9046s7W0/cekpoint.png"),
                auction_enabled=settings_data.get('auction_enabled', False), 
                auction_banner_url=settings_data.get('auction_banner_url', "https://i.postimg.cc/6qpWq0dW/aukcion.png"), 
                weekly_goals_banner_url=settings_data.get('weekly_goals_banner_url', "https://i.postimg.cc/T1j6hQGP/1200-324.png"), 
                weekly_goals_enabled=settings_data.get('weekly_goals_enabled', False),
                quest_schedule_override_enabled=settings_data.get('quest_schedule_override_enabled', False),
                quest_schedule_active_type=settings_data.get('quest_schedule_active_type', 'twitch')
            )

            # Сохраняем в кэш
            admin_settings_cache["settings"] = loaded_settings
            admin_settings_cache["last_checked"] = now
            logging.info("✅ Настройки админа загружены и закэшированы (глобальный).")
            return loaded_settings
        else:
            logging.warning("Настройки не найдены в БД...")
            default_settings = AdminSettings()
            admin_settings_cache["settings"] = default_settings
            admin_settings_cache["last_checked"] = now
            return default_settings

    except Exception as e:
        logging.error(f"Не удалось получить admin_settings (глобальный клиент): {e}", exc_info=True)
        admin_settings_cache["settings"] = None
        admin_settings_cache["last_checked"] = 0
        return AdminSettings()

# --- ВСТАВИТЬ В index.py (глобальная область видимости, не внутри другой функции) ---

# --- НОВЫЙ ЭНДПОИНТ: ПРОВЕРКА ПОДПИСКИ (GATEKEEPER) ---
@app.post("/api/v1/user/check_subscription")
async def check_channel_subscription(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Проверяет подписку пользователя на обязательный канал.
    Возвращает { "is_subscribed": bool }
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info:
        # Если данные невалидны, не пускаем
        return {"is_subscribed": False}

    user_id = user_info["id"]
    
    # ID канала: https://t.me/hatelove_ttv
    # В вашем коде ранее использовался этот ID для этого канала
    REQUIRED_CHANNEL_ID = -1002144676097 

    # Используем глобальный объект bot (aiogram), объявленный в начале файла
    try:
        chat_member = await bot.get_chat_member(chat_id=REQUIRED_CHANNEL_ID, user_id=user_id)
        
        # Статусы, которые считаются "подписан"
        if chat_member.status in ['member', 'administrator', 'creator', 'restricted']:
            return {"is_subscribed": True}
        else:
            # status: left, kicked
            return {"is_subscribed": False}

    except TelegramForbiddenError:
        logging.error(f"Gatekeeper: Бот не является администратором канала {REQUIRED_CHANNEL_ID}")
        # Если бот не админ, мы не можем проверить. 
        # В целях безопасности лучше вернуть False или True (зависит от того, хотите ли вы блокировать людей при ошибке)
        # Вернем False, чтобы админ заметил проблему.
        return {"is_subscribed": False, "error": "bot_not_admin"}
        
    except Exception as e:
        logging.error(f"Gatekeeper error for user {user_id}: {e}")
        # При ошибке API (например, таймаут) лучше вернуть False и попросить проверить снова
        return {"is_subscribed": False}
    
# --- ПРАВИЛЬНО ---
@app.post("/api/v1/user/me")
async def get_current_user_data(
    request_data: InitDataRequest,
    background_tasks: BackgroundTasks,
    # 👇 Используем быстрый HTTP-клиент (внедрение зависимости)
    supabase: httpx.AsyncClient = Depends(get_supabase_client) 
): 
    """
    Получение профиля пользователя.
    ОПТИМИЗАЦИЯ: Все запросы к БД выполняются параллельно для скорости.
    """
    
    # 1. Проверка авторизации Telegram
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        return JSONResponse(content={"is_guest": True})

    telegram_id = user_info["id"]

    # --- 🛡️ ЗАЩИТА: ПРОВЕРКА ТЕХ. РЕЖИМА 🛡️ ---
    # Если режим включен и ты НЕ админ — выдаем ошибку 503 (Maintenance)
    if sleep_cache["is_sleeping"] and telegram_id not in ADMIN_IDS:
        return JSONResponse(
            status_code=503, 
            content={"detail": "Ботик спит 😴", "maintenance": True}
        )
        
    # 2. Фоновые задачи (не тормозят ответ пользователю)
    # Обновляем инфу о Twitch-подписке тихо в фоне
    background_tasks.add_task(silent_update_twitch_user, telegram_id)

    try:
        # 3. 🚀 ТУРБО-РЕЖИМ: ЗАПУСКАЕМ ВСЕ ЗАПРОСЫ ОДНОВРЕМЕННО
        # Мы не ждем каждый ответ по очереди. Мы запускаем их "пачкой".
        # Это снижает время загрузки с 600мс до ~150мс.
        results = await asyncio.gather(
            
            # A. Основные данные профиля (RPC-функция в базе)
            supabase.post("/rpc/get_user_dashboard_data", json={"p_telegram_id": telegram_id}),
            
            # B. Статус привязки Twitch
            supabase.get("/users", params={"telegram_id": f"eq.{telegram_id}", "select": "twitch_status"}),
            
            # C. Настройки игры (Гринд) - берем из кэша или быстро из БД
            get_grind_settings_async_global(),
            
            # D. Количество активных рефералов (Считаем через заголовок count)
            supabase.get(
                "/users", 
                params={
                    "referrer_id": f"eq.{telegram_id}", 
                    "referral_activated_at": "not.is.null",
                    "select": "telegram_id",
                    "limit": "1" # Нам не нужны данные, только кол-во
                },
                headers={"Prefer": "count=exact"}
            ),
            
            # E. Настройки Админа (Глобальные флаги)
            get_admin_settings_async_global(),
            
            # F. Статус стрима (Онлайн/Оффлайн)
            supabase.get("/settings", params={"key": "eq.twitch_stream_status", "select": "value"}),
            
            # Если один из второстепенных запросов упадет — не ломаем весь профиль
            return_exceptions=True 
        )

        # 4. РАСПАКОВКА РЕЗУЛЬТАТОВ (Порядок важен!)
        (rpc_resp, twitch_resp, grind_settings, ref_resp, admin_settings, stream_resp) = results

        # --- [A] Обработка Профиля ---
        data = None
        # Проверяем, что запрос прошел успешно и не вернул ошибку
        if not isinstance(rpc_resp, Exception) and rpc_resp.status_code == 200:
            data = rpc_resp.json()

        # Если профиля нет — создаем нового пользователя (Авто-регистрация)
        if not data or not data.get('profile'):
            full_name_tg = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip() or "Без имени"
            
            # Создаем запись в БД
            await supabase.post("/users", json={
                 "telegram_id": telegram_id, 
                 "username": user_info.get("username"), 
                 "full_name": full_name_tg
            }, headers={"Prefer": "resolution=merge-duplicates"})
            
            # Пробуем получить данные еще раз (теперь точно должны быть)
            retry_resp = await supabase.post("/rpc/get_user_dashboard_data", json={"p_telegram_id": telegram_id})
            data = retry_resp.json()

        if not data: 
            raise HTTPException(status_code=500, detail="Не удалось загрузить профиль")

        # Формируем базовый ответ
        final_response = data.get('profile', {})
        final_response['challenge'] = data.get('challenge')
        final_response['event_participations'] = data.get('event_participations', {})
        final_response['is_admin'] = telegram_id in ADMIN_IDS

        # --- [B] Обработка Twitch ---
        twitch_status = None
        if not isinstance(twitch_resp, Exception) and twitch_resp.status_code == 200:
            tw_data = twitch_resp.json()
            if tw_data:
                twitch_status = tw_data[0].get('twitch_status')
        final_response['twitch_status'] = twitch_status

        # --- [C] Обработка Настроек Гринда ---
        # Превращаем объект настроек в словарь
        final_response['grind_settings'] = grind_settings.dict() if hasattr(grind_settings, 'dict') else {}

        # --- [D] Обработка Рефералов ---
        ref_count = 0
        if not isinstance(ref_resp, Exception):
            # Supabase возвращает количество в заголовке Content-Range
            content_range = ref_resp.headers.get("Content-Range")
            if content_range:
                try:
                    count_val = content_range.split('/')[-1]
                    ref_count = int(count_val) if count_val != '*' else 0
                except: pass
        final_response['active_referrals_count'] = ref_count

        # --- [E] Обработка Настроек Админа ---
        final_response['is_checkpoint_globally_enabled'] = admin_settings.checkpoint_enabled
        final_response['quest_rewards_enabled'] = admin_settings.quest_promocodes_enabled

        # --- [F] Обработка Статуса Стрима ---
        is_online = False
        if not isinstance(stream_resp, Exception) and stream_resp.status_code == 200:
            s_data = stream_resp.json()
            if s_data:
                is_online = s_data[0].get('value', False)
        final_response['is_stream_online'] = is_online

        # --- Дополнительные вычисляемые поля ---
        # Если есть дата активации рефералки — значит подписан
        final_response['is_telegram_subscribed'] = True if final_response.get('referral_activated_at') else False

        # Отправляем готовый JSON
        return JSONResponse(content=final_response)

    except Exception as e:
        # Логируем ошибку, но стараемся не пугать пользователя
        logging.error(f"Ошибка в /user/me: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка загрузки профиля")
        
@app.post("/api/v1/user/heartbeat")
async def user_heartbeat(
    request: Request,  # <--- Добавьте request: Request сюда, если его нет
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    # --- ЛОГИРОВАНИЕ ЗАПРОСА ---
    user_agent = request.headers.get("user-agent", "unknown")
    print(f"💓 HEARTBEAT from: {user_agent} at {datetime.now()}")
    # ---------------------------
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info:
        return {"is_active": False}
    
    telegram_id = user_info["id"]

    try:
        # Вызываем RPC функцию, которая вернет всё одним запросом
        rpc_resp = await supabase.post("/rpc/get_user_heartbeat_data", json={"p_telegram_id": telegram_id})
        rpc_resp.raise_for_status() # Если RPC вернет ошибку (например, юзер не найден), упадет в except
        
        return rpc_resp.json()
        
    except Exception as e:
        logging.error(f"Heartbeat error: {e}")
        # Если ошибка, возвращаем безопасный ответ, чтобы фронтенд не упал
        return {"is_active": False}
        
# --- API ДЛЯ ИВЕНТА "ВЕДЬМИНСКИЙ КОТЕЛ" ---

@app.post("/api/v1/admin/cauldron/update")
async def update_cauldron_event(
    request_data: CauldronUpdateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Обновляет или создает настройки для ивента 'Котел'."""
    logging.info("--- Endpoint: /api/v1/admin/events/cauldron/update (v2 - PATCH fix) ---") # Добавил v2 для ясности
    
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        logging.warning(f"Запрос на обновление котла отклонен: нет прав. User: {user_info}")
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        content_to_update = request_data.content
        logging.info(f"Получены данные для обновления котла: {content_to_update}")
        
        # --- НАЧАЛО ИСПРАВЛЕНИЯ ---
        # Было: supabase.post(...)
        # Стало: supabase.patch(...) с указанием, какую строку обновлять
        
        response = await supabase.patch(
            "/pages_content",
            params={"page_name": "eq.cauldron_event"}, # Указываем, какую строку найти
            json={"content": content_to_update}       # Указываем, что в ней обновить
        )

        # Эта строка теперь ПРАВИЛЬНО обработает ошибку, если она будет
        response.raise_for_status()
        # --- КОНЕЦ ИСПРАВЛЕНИЯ ---
        
        logging.info("Данные котла успешно ОБНОВЛЕНЫ в Supabase.")
        
        await manager.broadcast(json.dumps({"type": "cauldron_config_updated", "content": content_to_update}))
        
        return {"message": "Настройки ивента успешно обновлены."}
        
    except httpx.HTTPStatusError as e:
        # Теперь эта ошибка будет правильно поймана
        error_details = e.response.json().get("message", "Ошибка базы данных")
        logging.error(f"ОШИБКА HTTP от Supabase при обновлении котла: {error_details}")
        raise HTTPException(status_code=500, detail=f"Не удалось сохранить настройки: {error_details}")
    except Exception as e:
        logging.error(f"КРИТИЧЕСКАЯ ОШИБКА при обновлении настроек котла: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось сохранить настройки.")

@app.post("/api/v1/admin/events/cauldron/reset")
async def reset_cauldron_progress(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Полностью сбрасывает прогресс ивента 'Котел'."""
    logging.info("--- Endpoint: /api/v1/admin/events/cauldron/reset ---")

    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        logging.warning(f"Запрос на сброс котла отклонен: нет прав. User: {user_info}")
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        logging.info("Шаг 1: Получение текущих настроек котла...")
        resp = await supabase.get(
            "/pages_content",
            params={"page_name": "eq.cauldron_event", "select": "content", "limit": 1}
        )
        resp.raise_for_status()
        data = resp.json()

        if data and data[0].get('content'):
            content = data[0]['content']
            logging.info(f"Шаг 2: Обнуление прогресса. Текущий прогресс: {content.get('current_progress', 'N/A')}")
            content['current_progress'] = 0

            # --- ИСПРАВЛЕНИЕ ЗДЕСЬ ---
            # Меняем .post на .patch для надежного обновления существующей записи.
            # Это гарантирует, что счетчик билетов будет сохранен как 0.
            await supabase.patch(
                "/pages_content",
                params={"page_name": "eq.cauldron_event"}, # Указываем, какую строку обновлять
                json={"content": content}                   # Указываем, что в ней обновить
            )
            # --- КОНЕЦ ИСПРАВЛЕНИЯ ---

        else:
            logging.warning("Настройки для котла не найдены в базе, сброс прогресса пропущен.")

        logging.info("Шаг 3: Очистка таблицы event_contributions...")
        await supabase.delete("/event_contributions", params={"id": "gt.0"})
        logging.info("Таблица вкладов успешно очищена.")

        await manager.broadcast(json.dumps({
            "type": "cauldron_update",
            "new_progress": 0
        }))

        return {"message": "Прогресс ивента и история вкладов полностью сброшены."}

    except Exception as e:
        logging.error(f"КРИТИЧЕСКАЯ ОШИБКА при сбросе прогресса котла: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось сбросить прогресс.")
        
# --- API ДЛЯ ИВЕНТА "ВЕДЬМИНСКИЙ КОТЕЛ" ---

@app.post("/api/v1/admin/events/cauldron/participants")
async def get_cauldron_participants_admin(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (Админ) Возвращает список участников ивента 'Котел' с проверкой подписки и ТРЕЙД-ССЫЛКАМИ.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # 1. Получаем список участников через RPC
        resp = await supabase.post("/rpc/get_cauldron_leaderboard_public")
        
        data = resp.json()
        participants = data.get('all', []) if data else []
        
        if not participants:
            return []

        # 2. Собираем ID пользователей
        user_ids = [p['user_id'] for p in participants if p.get('user_id')]
        
        # --- 🔥 ФИКС НАЧАЛО: Запрашиваем трейд-ссылки отдельно ---
        trade_link_map = {}
        if user_ids:
            # Делаем запрос в таблицу users для этих ID
            users_resp = await supabase.get(
                "/users",
                params={
                    "telegram_id": f"in.({','.join(map(str, user_ids))})",
                    "select": "telegram_id, trade_link"
                }
            )
            if users_resp.status_code == 200:
                # Собираем словарь { telegram_id: "ссылка" }
                for u in users_resp.json():
                    trade_link_map[u['telegram_id']] = u.get('trade_link')
        # --- 🔥 ФИКС КОНЕЦ ---

        # 3. Проверяем подписку (Ваш существующий код)
        REQUIRED_CHANNEL_ID = -1002144676097
        temp_bot = Bot(token=BOT_TOKEN)
        
        async def check_user_sub(uid):
            try:
                m = await temp_bot.get_chat_member(chat_id=REQUIRED_CHANNEL_ID, user_id=uid)
                is_sub = m.status in ['member', 'administrator', 'creator', 'restricted']
                return uid, is_sub
            except Exception:
                return uid, False

        tasks = [check_user_sub(uid) for uid in user_ids]
        results = await asyncio.gather(*tasks)
        await temp_bot.session.close()
        
        sub_map = {uid: is_sub for uid, is_sub in results}
        
        # 4. Обогащаем список (Подписка + Ссылка)
        for p in participants:
            uid = p.get('user_id')
            p['is_subscribed'] = sub_map.get(uid, False)
            
            # Вставляем ссылку, которую получили отдельно
            p['trade_link'] = trade_link_map.get(uid) 
            
        return participants

    except Exception as e:
        logging.error(f"Ошибка получения участников котла (admin): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить список участников.")

@app.post("/api/v1/admin/events/cauldron/toggle_reward_status")
async def toggle_cauldron_reward_status(
    request_data: CauldronRewardStatusRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (Админ) Переключает статус выдачи награды для участника Котла.
    Использует таблицу upsert (вставка или обновление).
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # Используем upsert: если записи нет — создаст, если есть — обновит
        # В Supabase-py / PostgREST это делается через .upsert() или .post(..., upsert=True)
        # В httpx мы используем POST с заголовком Preference: resolution=merge-duplicates
        
        payload = {
            "user_id": request_data.user_id,
            "is_sent": request_data.is_sent,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        response = await supabase.post(
            "/cauldron_reward_status",
            json=payload,
            headers={"Prefer": "resolution=merge-duplicates"} # Это включает режим UPSERT
        )
        response.raise_for_status()

        status_text = "выдана" if request_data.is_sent else "не выдана"
        return {"message": f"Статус обновлен: награда {status_text}."}

    except Exception as e:
        logging.error(f"Ошибка при обновлении статуса награды котла: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось сохранить статус.")

@app.post("/api/v1/admin/events/create")
async def create_event(
    request_data: EventCreateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)

    # 🔍 Отладка
    logging.info(f"ADMIN_IDS = {ADMIN_IDS}")
    logging.info(f"user из initData = {user}")
    current_id = None
    try:
        current_id = int(user.get("id")) if user and "id" in user else None
    except Exception:
        logging.warning(f"Не удалось привести ID к int: {user.get('id') if user else None}")

    logging.info(f"current_id (int) = {current_id}")

    # 🚫 Проверка доступа
    if not current_id or current_id not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Недостаточно прав.")

    try:
        # 1. Формируем данные для Supabase
        event_payload = {
            "title": request_data.title,
            "description": request_data.description,
            "image_url": request_data.image_url,
            "tickets_cost": request_data.tickets_cost
        }
        if request_data.end_date:
            event_payload["end_date"] = datetime.fromisoformat(request_data.end_date).isoformat() + 'Z'
        
        # 2. Отправляем запрос в Supabase для создания новой записи
        resp = await supabase.post(
            "/events",
            json=event_payload,
            headers={"Prefer": "return=representation"}
        )
        resp.raise_for_status()
        new_event = resp.json()
        
        # 3. Уведомляем клиентов через WebSocket о новом событии
        await manager.broadcast(json.dumps({"type": "event_created", "event": new_event}))
        
        return {"status": "ok", "message": "Событие успешно создано!", "event": new_event}
    
    except httpx.HTTPStatusError as e:
        logging.error(f"Supabase вернул ошибку при создании события: {e.response.text}")
        raise HTTPException(status_code=e.response.status_code, detail=f"Ошибка базы данных: {e.response.text}")
    except Exception as e:
        logging.error(f"Непредвиденная ошибка при создании события: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")

@app.post("/api/v1/admin/stats")
async def get_admin_stats(
    request_data: StatisticsRequest, # Используем твою модель
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (Админ) Возвращает общую статистику - количество скинов на складе.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # 1. Вызываем RPC функцию для подсчета суммы quantity
        response = await supabase.post("/rpc/get_total_roulette_stock")
        response.raise_for_status()

        # Функция вернет объект вида {"total_stock": N} или {"total_stock": null}
        stats_data = response.json()
        total_stock = stats_data.get("total_stock") if stats_data else 0

        # 2. Формируем ответ только с этим значением
        final_response = {
            "total_skin_stock": total_stock if total_stock is not None else 0
        }

        return final_response

    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Ошибка базы данных")
        logging.error(f"HTTP-ошибка при получении статистики склада: {error_details}")
        raise HTTPException(status_code=500, detail=f"Не удалось загрузить статистику: {error_details}")
    except Exception as e:
        logging.error(f"Критическая ошибка при получении статистики склада: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера при сборе статистики.")

@app.post("/api/v1/admin/events/update")
async def update_events_page_content(
    request_data: EventsPageContentUpdate,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Обновляет ВЕСЬ контент страницы ивентов в таблице pages_content.
    Версия 2: Использует PATCH для надежного обновления существующей записи.
    """
    # 1. Проверка прав администратора
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещён.")

    try:
        content_to_save = request_data.content

        # ИЗМЕНЕНИЕ: Используем метод PATCH для явного обновления
        # Он находит строку, где page_name равно 'events', и обновляет ее поле 'content'
        await supabase.patch(
            "/pages_content",
            params={"page_name": "eq.events"}, # Фильтр: какую именно строку обновлять
            json={"content": content_to_save}     # Данные: что именно обновлять
        )

        return {"message": "Контент страницы успешно обновлён."}

    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Ошибка базы данных")
        logging.error(f"HTTP-ошибка при обновлении контента: {error_details}")
        raise HTTPException(status_code=400, detail=error_details)
    except Exception as e:
        logging.error(f"Критическая ошибка при обновлении контента: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось сохранить контент страницы.")
        
@app.post("/api/v1/admin/quest/submissions")
async def get_submissions_for_quest(request_data: QuestDeleteRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS: raise HTTPException(status_code=403, detail="Доступ запрещен")
    quest_id = request_data.quest_id
    response = await supabase.post("/rpc/get_quest_submissions_with_details", json={"p_quest_id": quest_id})
    return response.json()

@app.post("/api/v1/admin/quests")
async def create_quest(request_data: QuestCreateRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
        
    quest_to_create = {
        "title": request_data.title,
        "description": request_data.description,
        "reward_amount": request_data.reward_amount,
        "quest_type": request_data.quest_type,
        "target_value": request_data.target_value,
        "icon_url": request_data.icon_url,
        "action_url": request_data.action_url,
        "category_id": request_data.category_id,
        "is_active": True,
        "start_date": datetime.now(timezone.utc).isoformat(),
        "is_repeatable": request_data.is_repeatable,
        "duration_hours": request_data.duration_hours # <-- НОВЫЙ КОД
    }
    
    # Убираем end_date и start_date, они больше не нужны для таймера
    quest_to_create.pop('end_date', None)
    quest_to_create.pop('start_date', None)

    if quest_to_create.get('quest_type') != 'manual_check':
        quest_to_create['category_id'] = None
    
    await supabase.post("/quests", json=quest_to_create)
    return {"message": f"Квест '{request_data.title}' успешно создан!"}

@app.post("/api/v1/admin/quest/update")
async def update_quest(request_data: QuestUpdateRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    quest_id = request_data.quest_id
    # Используем exclude_unset=True, чтобы не отправлять пустые поля
    quest_data_to_update = request_data.dict(exclude={'initData', 'quest_id'}, exclude_unset=True)

    if quest_data_to_update.get('quest_type') != 'manual_check':
        quest_data_to_update['category_id'] = None

    # Убираем логику расчета end_date, так как теперь мы храним только длительность
    quest_data_to_update.pop('end_date', None)
    quest_data_to_update.pop('start_date', None)

    await supabase.patch("/quests", params={"id": f"eq.{quest_id}"}, json=quest_data_to_update)

    return {"message": f"Квест ID {quest_id} успешно обновлен!"}

@app.post("/api/v1/admin/checkpoint/grant-access")
async def grant_checkpoint_access(
    request_data: GrantCheckpointAccessRequest, # Используем новую модель
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Выдает пользователю доступ к странице Чекпоинта."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    user_id_to_grant = request_data.user_id_to_grant

    # Проверяем, существует ли пользователь
    user_response = await supabase.get(f"/users?telegram_id=eq.{user_id_to_grant}")
    if not user_response.json():
        raise HTTPException(status_code=404, detail=f"Пользователь с ID {user_id_to_grant} не найден.")

    await supabase.patch(
        "/users",
        params={"telegram_id": f"eq.{user_id_to_grant}"},
        json={"has_checkpoint_access": True}
    )

    return {"message": f"Доступ к Чекпоинту для пользователя {user_id_to_grant} успешно предоставлен!"}

@app.post("/api/v1/admin/events/grant-access")
async def grant_events_access(
    request_data: GrantAccessRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Выдает пользователю доступ к странице ивентов."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    user_id_to_grant = request_data.user_id_to_grant

    await supabase.patch(
        "/users",
        params={"telegram_id": f"eq.{user_id_to_grant}"},
        json={"has_events_access": True}
    )

    return {"message": f"Доступ к ивентам для пользователя {user_id_to_grant} успешно предоставлен!"}

@app.post("/api/v1/admin/user_challenges")
async def get_user_challenges_by_admin(
    request_data: UserChallengesRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    user_id = request_data.user_id
    
    resp = await supabase.get(
        "/user_challenges",
        params={
            "user_id": f"eq.{user_id}",
            "select": "*,challenges(*)"
        }
    )
    resp.raise_for_status()
    challenges = resp.json()
    
    # Разделяем condition_type на base_condition_type и period
    for c in challenges:
        if c.get("challenges") and c["challenges"].get("condition_type"):
            condition_type = c["challenges"]["condition_type"]

            parts = condition_type.split("_")
            if len(parts) > 2 and (parts[1] in ["messages", "uptime"]):
                c["challenges"]["base_condition_type"] = parts[0] + "_" + parts[1]
                c["challenges"]["period"] = parts[2]
            else:
                c["challenges"]["base_condition_type"] = condition_type
                c["challenges"]["period"] = None

            # 🔥 progress берём прямо из user_challenges
            c["progress_value"] = c.get("progress_value", 0)

    return challenges


@app.post("/api/v1/admin/quest/delete")
async def delete_quest(request_data: QuestDeleteRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS: raise HTTPException(status_code=403, detail="Доступ запрещен")
    quest_id = request_data.quest_id
    await supabase.delete("/quest_submissions", params={"quest_id": f"eq.{quest_id}"})
    await supabase.delete("/quests", params={"id": f"eq.{quest_id}"})
    return {"message": "Задание и все заявки по нему удалены."}
    
@app.post("/api/v1/admin/quest/details")
async def get_quest_details(request_data: QuestDetailsRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS: raise HTTPException(status_code=403, detail="Доступ запрещен")
    quest_id = request_data.quest_id
    response = await supabase.get("/quests", params={"id": f"eq.{quest_id}", "select": "*"})
    quests = response.json()
    if not quests: raise HTTPException(status_code=404, detail="Задание не найдено")
    quest = quests[0]
    
    # Просто возвращаем данные как есть. 
    # Поле duration_hours уже должно быть в объекте quest.
    # Старая логика с вычислением больше не нужна.
    return quest

@app.post("/api/v1/webhooks/bott")
async def bott_webhook(
    request: Request,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Упрощенный вебхук (без ключей).
    Просто прибавляет сумму пополнения к текущему балансу в базе.
    """
    try:
        form_data = await request.form()
        data = dict(form_data)
        logging.info(f"💰 [WEBHOOK] Оплата: {data}")

        status = str(data.get('status_id', ''))
        if status not in ['1', 'success', 'paid']:
            return {"status": "ignored"}

        custom_fields = data.get('custom_fields')
        if not custom_fields:
            return {"status": "error", "message": "No user ID"}
        
        user_id = int(custom_fields)
        amount_rub = float(data.get('amount', 0))
        
        # Считаем: 1 рубль = 100 копеек (или как у вас настроено)
        # Если в боте курс 1 к 1, то amount_coins = int(amount_rub)
        # Если в боте копейки, то * 100
        amount_coins = int(amount_rub * 100) 

        # Используем RPC-функцию для безопасного прибавления (атомарно)
        # Предполагаем, что в вашей базе 'coins' - это игровые монеты, а 'bot_t_coins' - баланс бота
        # Так как RPC 'increment_coins' обычно для игровых, тут сделаем вручную:
        
        # 1. Получаем текущий
        resp = await supabase.get("/users", params={"telegram_id": f"eq.{user_id}", "select": "bot_t_coins"})
        current_bal = 0
        if resp.json():
            current_bal = resp.json()[0].get('bot_t_coins', 0)
            
        # 2. Прибавляем
        new_balance = current_bal + amount_coins
        
        # 3. Сохраняем
        await supabase.patch(
            "/users",
            params={"telegram_id": f"eq.{user_id}"},
            json={"bot_t_coins": new_balance}
        )

        await safe_send_message(user_id, f"✅ Баланс пополнен на {amount_rub}₽!\n(Обновите профиль, чтобы увидеть изменения)")

        return "OK"

    except Exception as e:
        logging.error(f"❌ [WEBHOOK] Ошибка: {e}")
        return "Error"

@app.post("/api/v1/user/shop_link")
async def get_bott_link(
    request_data: InitDataRequest,
):
    """Генерирует ссылку на Bot-t с 'зашитым' ID пользователя"""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = user_info["id"]

    # Параметр custom_fields очень важен! Именно он вернется нам при оплате.
    link = f"{BOTT_SHOP_URL}?bot_id={BOTT_BOT_ID}&public_key={BOTT_PUBLIC_KEY}&custom_fields={user_id}"
    
    return {"url": link}



# --- API ДЛЯ ИВЕНТА "ВЕДЬМИНСКИЙ КОТЕЛ" ---

@app.get("/api/v1/events/cauldron/status")
async def get_cauldron_status(): # <<< Убрали request и Depends
    """Отдает текущее состояние ивента 'Котел', используя глобальный клиент."""
    try:
        # --- ИЗМЕНЕНИЕ: Используем глобальный supabase и .table().select().execute() без await ---
        response = supabase.table("pages_content").select("content").eq("page_name", "cauldron_event").limit(1).execute()
        # execute() вызывается без await

        data = response.data # Данные в response.data (это список)

        # Если запись не найдена или content пустой
        if not data or not data[0].get('content'):
            logging.warning("Контент для 'cauldron_event' не найден в pages_content.")
            return {"is_visible_to_users": False} # Возвращаем статус по умолчанию

        # Просто возвращаем содержимое поля content
        return data[0]['content']

    # except PostgrestAPIError as e: # Можно ловить специфичные ошибки supabase-py
    #     logging.error(f"Ошибка Supabase API в /events/cauldron/status: {e}", exc_info=True)
    #     # Возвращаем статус по умолчанию при ошибке базы данных
    #     return {"is_visible_to_users": False}
    except Exception as e:
        logging.error(f"Критическая ошибка при получении статуса котла: {e}", exc_info=True)
        # Возвращаем статус по умолчанию при любой другой ошибке
        return {"is_visible_to_users": False}
        
@app.get("/api/v1/events/cauldron/leaderboard")
async def get_cauldron_leaderboard(supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """Отдает публичные данные для лидерборда ивента 'Котел'."""
    try:
        response = await supabase.post("/rpc/get_cauldron_leaderboard_public")
        response.raise_for_status()
        
        # Функция возвращает готовый JSON, если участников нет, он может быть null
        data = response.json()
        if not data:
            # Возвращаем пустую структуру, если в базе еще нет данных
            return {"all": [], "top20": []}
            
        return data
    except Exception as e:
        logging.error(f"Ошибка при получении лидерборда котла: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось получить данные лидерборда.")

# --- НОВАЯ ОТДЕЛЬНАЯ ФУНКЦИЯ ДЛЯ OBS ---
# --- 1. ОБНОВЛЁННАЯ ВЕРСИЯ ФУНКЦИИ ДЛЯ ТРИГГЕРА ---
async def send_cauldron_trigger_to_obs(
    supabase: httpx.AsyncClient, 
    user_display_name: str, 
    amount: int,
    new_progress: int  # Добавляем новый аргумент
):
    """
    Получает актуальное состояние ивента, ОБНОВЛЯЕТ его свежим прогрессом 
    и отправляет триггер в Supabase для OBS-оверлея.
    """
    try:
        # Получаем актуальные данные ивента "Котел"
        event_status_resp = await supabase.get(
            "/pages_content",
            params={"page_name": "eq.cauldron_event", "select": "content", "limit": 1}
        )
        event_data = event_status_resp.json()[0]['content'] if event_status_resp.json() else {}
        
        # ИСПРАВЛЕНИЕ: Принудительно обновляем прогресс в данных, которые мы отправляем
        if event_data:
            event_data['current_progress'] = new_progress
        
        # Формируем payload для триггера
        trigger_payload = {
            "event_data": event_data,
            "last_contributor": {
                "name": user_display_name,
                "amount": amount
            }
        }
        # Отправляем payload в таблицу cauldron_triggers
        await supabase.post("/cauldron_triggers", json={"payload": trigger_payload})
        logging.info("✅ Триггер для оверлея котла с корректным прогрессом успешно отправлен.")
    
    except Exception as e:
        logging.error(f"❌ Не удалось отправить триггер для оверлея котла: {e}")


# --- 2. ОБНОВЛЁННАЯ ВЕРСИЯ ОСНОВНОЙ ФУНКЦИИ ---
@app.post("/api/v1/events/cauldron/contribute")
async def contribute_to_cauldron(
    request_data: CauldronContributeRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Пользователь вносит билеты в котел. Добавлена проверка трейд-ссылки."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")
    
    telegram_id = user_info["id"]

    # 🔥🔥🔥 ВСТАВИТЬ СЮДА (НАЧАЛО) 🔥🔥🔥
    status = await validate_event_status()
    
    if not status['visible']:
        raise HTTPException(status_code=403, detail="Ивент завершен")
        
    if status['paused']:
        raise HTTPException(status_code=423, detail="Ивент на паузе (подсчет итогов)")
    # 🔥🔥🔥 ВСТАВИТЬ СЮДА (КОНЕЦ) 🔥🔥🔥
    amount = request_data.amount
    user_display_name = user_info.get("first_name", "User")

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Количество билетов должно быть больше нуля.")

    try:
        # --- НОВАЯ ПРОВЕРКА ---
        # 1. Получаем данные пользователя, чтобы проверить трейд-ссылку
        user_resp = await supabase.get("/users", params={"telegram_id": f"eq.{telegram_id}", "select": "trade_link"})
        user_resp.raise_for_status()
        user_data = user_resp.json()

        # 2. Проверяем, есть ли ссылка
        if not user_data or not user_data[0].get("trade_link"):
             raise HTTPException(status_code=400, detail="Пожалуйста, укажите вашу трейд-ссылку в профиле для участия.")
        # --- КОНЕЦ ПРОВЕРКИ ---

        # Вызываем RPC функцию в Supabase, которая атомарно выполнит все действия
        response = await supabase.post(
            "/rpc/contribute_to_cauldron",
            json={
                "p_user_id": telegram_id,
                "p_amount": amount,
                "p_user_display_name": user_display_name,
                "p_contribution_type": "ticket"
            }
        )
        response.raise_for_status()
        
        result = response.json()
        new_progress = result.get('new_progress')
        new_ticket_balance = result.get('new_ticket_balance')
        
        # ИСПРАВЛЕНИЕ: Передаем `new_progress` в функцию триггера
        await send_cauldron_trigger_to_obs(supabase, user_display_name, amount, new_progress)

        await manager.broadcast(json.dumps({
            "type": "cauldron_update",
            "new_progress": new_progress,
            "last_contributor": {
                "name": user_display_name,
                "type": "ticket",
                "amount": amount
            }
        }))

        return {
            "message": "Ваш вклад принят!",
            "new_progress": new_progress,
            "new_ticket_balance": new_ticket_balance
}
    # --- 👇 ВОТ СЮДА ВСТАВЬТЕ НОВЫЙ БЛОК ---
    except HTTPException as e:
        # Этот блок перехватит нашу ошибку о трейд-ссылке и отправит её клиенту как есть,
        # не давая ей "провалиться" в общий обработчик Exception ниже.
        raise e
    # --- 👆 КОНЕЦ НОВОГО БЛОКА ---
    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Ошибка на стороне базы данных.")
        raise HTTPException(status_code=400, detail=error_details)
    except Exception as e:
        logging.error(f"Критическая ошибка при вкладе в котел: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")

@app.get("/api/v1/admin/twitch_rewards/list")
async def list_twitch_rewards(supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    # 1. Получаем ВСЕ данные наград, сортируем (новые в конце)
    resp = await supabase.get(
        "/twitch_rewards", 
        params={"select": "*", "order": "sort_order.asc.nullslast,id.asc"}
    )
    resp.raise_for_status()
    data = resp.json()
    reward_ids = [r['id'] for r in data]
    
    if not reward_ids:
        return []

    # 2. Запрос для подсчета неотвеченных (непросмотренных И невыданных)
    pending_resp = await supabase.get(
        "/twitch_reward_purchases",
        params={
            "reward_id": f"in.({','.join(map(str, reward_ids))})",
            "viewed_by_admin": "eq.false",
            "rewarded_at": "is.null",
            "select": "reward_id"
        }
    )
    
    # 3. Считаем в Python
    pending_counts_map = {}
    for purchase in pending_resp.json():
        r_id = purchase['reward_id']
        pending_counts_map[r_id] = pending_counts_map.get(r_id, 0) + 1
    
    # 4. Добавляем счетчик к каждому объекту
    for reward in data:
        reward['pending_count'] = pending_counts_map.get(reward['id'], 0)
        
    return data


@app.post("/api/v1/admin/twitch_rewards/update")
async def update_twitch_reward(
    request_data: TwitchRewardUpdateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    reward_id = request_data.id
    
   # --- НАЧАЛО ИСПРАВЛЕНИЯ (v4) ---
    
    # 1. Получаем все поля, которые прислал фронтенд
    update_data = request_data.dict(exclude={'initData', 'id'})
    supabase_payload = update_data.copy()

    # 2. Определяем ОДНО правильное значение (то, что ввел админ)
    #    JS отправляет 'reward_amount' (из нового поля) и 'promocode_amount' (из старого).
    
    definitive_amount = 10 # Значение по умолчанию
    
    # Сначала проверяем 'reward_amount' (приоритет у нового поля)
    if supabase_payload.get('reward_amount') is not None:
         definitive_amount = supabase_payload['reward_amount']
    # Если его нет, проверяем 'promocode_amount' (для модераторов)
    elif supabase_payload.get('promocode_amount') is not None:
         definitive_amount = supabase_payload['promocode_amount']

    # 3. Если тип награды "none", принудительно ставим 0
    if supabase_payload.get('reward_type') == 'none':
         definitive_amount = 0

    # 4. Устанавливаем ОБЕ колонки в базе данных на это значение
    supabase_payload['reward_amount'] = definitive_amount
    supabase_payload['promocode_amount'] = definitive_amount
    
    # --- КОНЕЦ ИСПРАВЛЕНИЯ (v4) ---

    if not supabase_payload:
        raise HTTPException(status_code=400, detail="Нет полей для обновления")

    try:
        response = await supabase.patch(
            "/twitch_rewards",
            params={"id": f"eq.{reward_id}"},
            json=supabase_payload  # Используем исправленный payload
        )
        response.raise_for_status()
    
    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", e.response.text)
        logging.error(f"Ошибка Supabase при обновлении twitch_rewards: {error_details}")
        logging.error(f"Payload, который не понравился Supabase: {supabase_payload}")
        raise HTTPException(status_code=400, detail=f"Ошибка Supabase: {error_details}")
    except Exception as e:
        logging.error(f"Неизвестная ошибка при обновлении twitch_rewards: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")

    return {"status": "ok", "message": "Настройки награды обновлены."}

@app.post("/api/v1/twitch_rewards/purchase")
async def create_twitch_reward_purchase(
    request_data: TwitchRewardPurchaseCreate,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Invalid Telegram initData")

    telegram_id = user_info["id"]
    username = user_info.get("username") or user_info.get("first_name") or "Unknown"

    resp = await supabase.post(
        "/twitch_reward_purchases",
        json={
            "reward_id": request_data.reward_id,
            "user_id": telegram_id,
            "username": username,
            "trade_link": request_data.trade_link,
        },
        headers={"Prefer": "return=representation"}
    )
    return resp.json()

@app.get("/api/v1/admin/twitch_rewards/{reward_id}/purchases")
async def get_twitch_reward_purchases(
    reward_id: int,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Получает список покупок напрямую через HTTP-запрос к таблице
    (чтобы видеть все новые поля, включая viewed_by_admin_name).
    """
    try:
        # 1. 🔥 ИЗМЕНЕНИЕ: Используем .get() вместо .from_()
        # Запрашиваем таблицу twitch_reward_purchases
        purchases_response = await supabase.get(
            "/twitch_reward_purchases",
            params={
                "reward_id": f"eq.{reward_id}",
                "select": "*",               # Забираем ВСЕ колонки
                "order": "created_at.desc"   # Сортируем: новые сверху
            }
        )
        purchases_response.raise_for_status()
        purchases_data = purchases_response.json()

        # 2. Запрашиваем настройки награды (тоже через .get)
        reward_settings_response = await supabase.get(
            "/twitch_rewards",
            params={
                "id": f"eq.{reward_id}",
                "select": "*",
                "limit": 1
            }
        )
        reward_settings_response.raise_for_status()
        
        reward_settings_data = reward_settings_response.json()
        if not reward_settings_data:
            raise HTTPException(status_code=404, detail="Настройки для этой награды не найдены.")
        
        fresh_settings = reward_settings_data[0]
        
        # 3. Формируем ответ
        return {
            "purchases": purchases_data,
            "reward_settings": fresh_settings
        }

    except Exception as e:
        logging.error(f"Критическая ошибка при получении покупок: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")

# 🔼🔼🔼 КОНЕЦ БЛОКА ДЛЯ ЗАМЕНЫ 🔼🔼🔼
        
# --- КОНЕЦ НОВОЙ ВСПОМОГАТЕЛЬНОЙ ФУНКЦИИ ---
        
@app.post("/api/v1/admin/auctions/list") 
async def admin_get_auctions(
    request_data: InitDataRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Получает ВСЕ аукционы, включая данные о ставке админа. (ИСПРАВЛЕНО)"""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")
    
    # Мы знаем ID админа, который запрашивает
    admin_user_id = user_info["id"]

    try:
        # Вызов "умной" RPC-функции для админов
        rpc_params = {"p_user_id": admin_user_id}
        
        resp = await supabase.post(
            "/rpc/get_admin_auctions_for_user", # <-- ИЗМЕНЕНО: Новая RPC
            json=rpc_params
        )
        resp.raise_for_status()
        
        return resp.json()

    except Exception as e:

        # --- ДИАГНОСТИКА ---
        try:
            error_body = e.response.json()
            logging.error(f"Детали ошибки Supabase: {error_body}")
        except:
            logging.error(f"Текст ошибки Supabase: {e.response.text}")
        # -------------------
        
        logging.error(f"Ошибка при получении админ-списка аукционов для admin {admin_user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить лоты.")

@app.post("/api/v1/admin/auctions/create")
async def admin_create_auction(
    request_data: AuctionCreateRequest,
    background_tasks: BackgroundTasks, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    # Use request_data, not request
    duration_hours = request_data.bid_cooldown_hours
    
    # Corrected payload using request_data
    payload = {
        "title": request_data.title,
        "image_url": request_data.image_url,
        "bid_cooldown_hours": request_data.bid_cooldown_hours,
        "snipe_guard_minutes": request_data.snipe_guard_minutes,
        "is_active": request_data.is_active,
        "is_visible": request_data.is_visible,
        "min_required_tickets": request_data.min_required_tickets,
        "max_allowed_tickets": request_data.max_allowed_tickets,

        # New fields
        "rarity": request_data.rarity,
        "wear": request_data.wear,

        "current_highest_bid": 0,
        "current_highest_bidder_id": None,
        "current_highest_bidder_name": None,
        "created_at": "now()", 
        "ended_at": None
    }

    try:
        # 1. Create lot in DB
        response = await supabase.post("/auctions", json=payload)
        response.raise_for_status()
        
        # 2. Launch mass notification (if active and visible)
        if request_data.is_active and request_data.is_visible:
            msg = (
                f"📢 <b>Новый аукцион!</b>\n\n"
                f"Лот: «{html_decoration.quote(request_data.title)}»\n"
                f"Начальная цена: 1 🎟️\n\n" 
                f"Делайте ваши ставки в приложении!"
            )
            
            # Launch background task
            background_tasks.add_task(broadcast_notification_task, msg, "notify_auction_start")
            
    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", e.response.text)
        logging.error(f"❌ ОШИБКА SUPABASE: {error_details}")
        raise HTTPException(status_code=400, detail=f"Ошибка: {error_details}")
    except Exception as e:
        logging.error(f"❌ Ошибка создания лота: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")

    return {"message": "Лот создан, рассылка запущена."}

    # --- КОНЕЦ ИСПРАВЛЕНИЯ ---

@app.post("/api/v1/admin/auctions/update")
async def admin_update_auction(
    request_data: AuctionUpdateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    # Благодаря exclude_unset=True, поля rarity и wear попадут сюда АВТОМАТИЧЕСКИ,
    # если они были переданы с фронтенда.
    update_data = request_data.dict(exclude={'initData', 'id'}, exclude_unset=True)

    # ⬇️ ИСПРАВЛЕННАЯ ЛОГИКА ⬇️
    # Обрабатываем max_allowed_tickets, если он был отправлен
    if 'max_allowed_tickets' in update_data:
        max_val = update_data['max_allowed_tickets']
        update_data['max_allowed_tickets'] = max_val if max_val and max_val > 0 else None
    # ⬆️ КОНЕЦ ИСПРАВЛЕНИЯ ⬆️

    # (!!!) ЛОГИКА ТАЙМЕРА (!!!)
    # Если админ поменял длительность в ЧАСАХ...
    if 'bid_cooldown_hours' in update_data:
        # ...мы берем эти часы
        duration_hours = update_data['bid_cooldown_hours']
        
        # ...и СБРАСЫВАЕМ таймер на (СЕЙЧАС + новая длительность)
        end_time = datetime.now(timezone.utc) + timedelta(hours=duration_hours)
        
        # ...обновляя ТОЛЬКО bid_cooldown_ends_at.
        update_data['bid_cooldown_ends_at'] = end_time.isoformat()
    # (!!!) КОНЕЦ ЛОГИКИ ТАЙМЕРА (!!!)

    await supabase.patch(
        "/auctions",
        params={"id": f"eq.{request_data.id}"},
        json=update_data
    )
    return {"message": "Лот обновлен."}
    
@app.post("/api/v1/admin/auctions/delete")
async def admin_delete_auction(
    request_data: AuctionDeleteRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    # Таблица auction_bids имеет "ON DELETE CASCADE",
    # поэтому ставки удалятся автоматически.
    await supabase.delete(
        "/auctions",
        params={"id": f"eq.{request_data.id}"}
    )
    return {"message": "Лот и история ставок удалены."}
        
# --- АДМИНСКИЕ ПРОМОКОДЫ ---
@app.post("/api/v1/admin/promocodes")
async def create_promocodes(
    request_data: PromocodeCreateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    # Разделяем коды, введенные в textarea, по строкам
    codes = [c.strip() for c in request_data.codes.split("\n") if c.strip()]
    if not codes:
        raise HTTPException(status_code=400, detail="Поле с кодами не может быть пустым.")

    try:
        # Готовим список объектов для вставки в базу данных
        promocodes_to_insert = [
            {
                "code": code,
                "reward_value": request_data.reward_value,
                "description": request_data.description
            }
            for code in codes
        ]
        
        # Отправляем все промокоды одним запросом
        resp = await supabase.post("/promocodes", json=promocodes_to_insert)
        resp.raise_for_status()

        return {"message": f"✅ Добавлено {len(codes)} промокодов"}
    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Не удалось добавить промокоды.")
        logging.error(f"Ошибка при создании промокодов: {error_details}")
        raise HTTPException(status_code=400, detail=error_details)
    except Exception as e:
        logging.error(f"Ошибка при создании промокодов: {e}")
        raise HTTPException(status_code=500, detail="Не удалось добавить промокоды.")
# --- АДМИНСКИЕ ПРОМОКОДЫ  ---        
@app.get("/api/v1/cron/trigger_draws")
async def trigger_draws(
    request: Request,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    cron_secret = os.getenv("CRON_SECRET")
    auth_header = request.headers.get("Authorization")

    # --- 👇👇👇 ДОБАВЬТЕ ЭТИ СТРОКИ ДЛЯ ДИАГНОСТИКИ 👇👇👇 ---
    logging.info(f"СЕКРЕТ ИЗ VERCEL: |{cron_secret}|")
    logging.info(f"ПОЛУЧЕННЫЙ ЗАГОЛОВОК: |{auth_header}|")
    logging.info(f"СТРОКА, С КОТОРОЙ СРАВНИВАЕМ: |Bearer {cron_secret}|")
    # --- 👆👆👆 КОНЕЦ БЛОКА ДИАГНОСТИКИ 👆👆👆 ---

    if not cron_secret or auth_header != f"Bearer {cron_secret}":
        raise HTTPException(status_code=403, detail="Forbidden: Invalid secret")

    logging.info("🚀 CRON: Проверка ивентов для розыгрыша...")
    
    try:
        content_resp = await supabase.get("/pages_content", params={"page_name": "eq.events", "select": "content", "limit": 1})
        content_resp.raise_for_status()
        page_data = content_resp.json()
        if not page_data:
            logging.warning("CRON: Контент для страницы ивентов не найден.")
            return {"message": "Events content not found."}
        
        content = page_data[0]['content']
        raffle_end_time_str = content.get("raffleEndTime")

        if not raffle_end_time_str:
            logging.info("CRON: Время розыгрыша не установлено. Пропускаем.")
            return {"message": "Raffle end time not set."}

        now_utc = datetime.now(timezone.utc)
        naive_end_time = datetime.fromisoformat(raffle_end_time_str)
        end_time_moscow = naive_end_time.replace(tzinfo=ZoneInfo("Europe/Moscow"))
        
        if now_utc < end_time_moscow:
            logging.info(f"CRON: Время розыгрыша ({end_time_moscow}) еще не наступило. Текущее время UTC: {now_utc}.")
            return {"message": "Raffle time has not yet come."}

        # --- 👇👇👇 ДОБАВЛЕННЫЙ КОД ДЛЯ ФИЛЬТРАЦИИ 👇👇👇 ---
        logging.info("CRON: Время розыгрыша наступило. Получаем ивенты, которые еще не разыграны...")

        # Получаем список event_id, которые уже были разыграны
        winners_resp = await supabase.get("/event_winners", params={"select": "event_id"})
        winners_resp.raise_for_status()
        events_with_winners = {e['event_id'] for e in winners_resp.json()}

        # Фильтруем ивенты, оставляя только те, у которых еще нет победителя в таблице `event_winners`
        events_to_draw = [e for e in content.get("events", []) if e.get('id') not in events_with_winners]
        # --- 👆👆👆 КОНЕЦ ДОБАВЛЕННОГО КОДА 👆👆👆 ---
        
        if not events_to_draw:
            logging.info("CRON: Нет ивентов для розыгрыша (у всех уже есть победители).")
            return {"message": "No events to draw."}
        
        updated = False
        for event in events_to_draw:
            event_id = event["id"]

            # --- НАЧАЛО ИЗМЕНЕНИЯ 2: Проверка на минимальное количество участников ---
            part_resp = await supabase.get(
                "/event_entries",
                params={"event_id": f"eq.{event_id}", "select": "user_id"}
            )
            if not part_resp.is_success:
                logging.error(f"Ошибка при получении участников для ивента {event_id}: {part_resp.text}")
                continue
            
            unique_participants = set(entry['user_id'] for entry in part_resp.json())
            
            if len(unique_participants) < 3:
                logging.warning(f"CRON: Розыгрыш для ивента {event_id} отложен. Участников: {len(unique_participants)} (требуется минимум 3).")
                continue # Переходим к следующему ивенту
            # --- КОНЕЦ ИЗМЕНЕНИЯ 2 ---

            logging.info(f"--- Запуск розыгрыша для ивента ID: {event_id} ---")

            rpc_response = await supabase.post("/rpc/draw_event_winner", json={"p_event_id": event_id})
            
            if rpc_response.status_code != 200:
                logging.error(f"Ошибка RPC для ивента {event_id}: {rpc_response.text}")
                continue
            
            winner_data = rpc_response.json()
            if not winner_data:
                logging.warning(f"Для ивента {event_id} не нашлось участников.")
                continue

            winner = winner_data[0]
            winner_id = winner.get('winner_id')
            winner_name = winner.get('winner_name')

            event["winner_name"] = winner_name
            event["winner_id"] = winner_id
            updated = True
            
            logging.info(f"✅ Победитель для ивента {event_id}: {winner_name} (ID: {winner_id})")

            try:
                # Создаем запись о ручной награде
                await supabase.post(
                    "/manual_rewards",
                    json={
                        "user_id": winner_id,
                        "source_type": "event_win",
                        "source_description": f"Победа в ивенте «{event.get('title', '')}»",
                        "reward_details": event.get('title', 'Не указан'),
                        "status": "pending"
                    }
                )
            
                # Отправляем уведомление админу
                if ADMIN_NOTIFY_CHAT_ID:
                    await bot.send_message(
                        ADMIN_NOTIFY_CHAT_ID,
                        f"🏆 <b>Победитель в ивенте!</b>\n\n"
                        f"<b>Пользователь:</b> {winner_name} (ID: <code>{winner_id}</code>)\n"
                        f"<b>Приз:</b> {event.get('title', 'Не указан')}\n\n"
                        f"Пожалуйста, выдайте награду и отметьте в админ-панели."
                    )
            except Exception as e:
                logging.error(f"Не удалось создать заявку на ручную награду для ивента {event_id}: {e}")
            #
            # КОНЕЦ БЛОКА ДЛЯ ЗАМЕНЫ
            #

            try:
                message_text = (
                    f"🎉 Поздравляем, {winner_name}!\n\n"
                    f"Вы победили в розыгрыше приза «{event.get('title', '')}»! "
                    f"Ваша награда скоро будет начислена."
                )
                await bot.send_message(winner_id, message_text)
            except Exception as e:
                logging.error(f"Не удалось отправить уведомление победителю {winner_id}: {e}")

        if updated:
            await supabase.patch(
                "/pages_content",
                params={"page_name": "eq.events"},
                json={"content": content}
            )
            logging.info("CRON: Обновленный контент с победителями сохранен в базе.")

        return {"message": f"Draw process completed. Winners selected for {len(events_to_draw)} event(s)."}

    except Exception as e:
        logging.error(f"❌ КРИТИЧЕСКАЯ ОШИБКА в cron-задаче: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/v1/cron/trigger_auctions")
async def trigger_auctions(
    request: Request,
    background_tasks: BackgroundTasks, # <--- ✅ ВАЖНО
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    cron_secret = os.getenv("CRON_SECRET")
    auth_header = request.headers.get("Authorization")
    if not cron_secret or auth_header != f"Bearer {cron_secret}":
        raise HTTPException(status_code=403, detail="Forbidden: Invalid secret")

    logging.info("🚀 CRON (Аукцион): Проверка аукционов...")

    try:
        now_utc_iso = datetime.now(timezone.utc).isoformat()
        resp = await supabase.get(
            "/auctions",
            params={
                "is_active": "eq.true",
                "ended_at": "is.null",
                "bid_cooldown_ends_at": f"lt.{now_utc_iso}",
                "select": "id"
            }
        )
        auctions_to_finish = resp.json()

        if not auctions_to_finish:
            return {"message": "No auctions to finish."}
        
        results = []
        for auc in auctions_to_finish:
            rpc_resp = await supabase.post("/rpc/finish_auction", json={"p_auction_id": auc['id']})
            data = rpc_resp.json()
            
            if data and data[0].get('winner_id'):
                res = data[0]
                msg_text = (
                    f"🎉 <b>Поздравляем!</b> Вы выиграли лот «{res.get('auction_title')}»!\n"
                    f"Ставка: {res.get('winning_bid')} билетов."
                )
                background_tasks.add_task(
                    check_and_send_notification,
                    res['winner_id'],
                    msg_text,
                    "notify_auction_end"
                )
                
                if ADMIN_NOTIFY_CHAT_ID:
                    await safe_send_message(
                        ADMIN_NOTIFY_CHAT_ID,
                        f"🏆 <b>Аукцион завершен (Авто)!</b>\nЛот: {res.get('auction_title')}\nПобедитель: {res.get('winner_name')}"
                    )
                results.append(f"Auc {auc['id']} won by {res['winner_id']}")
            else:
                results.append(f"Auc {auc['id']} finished (no bids)")

        return {"results": results}

    except Exception as e:
        logging.error(f"❌ КРИТИЧЕСКАЯ ОШИБКА в cron-задаче (Аукцион): {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})
        
@app.post("/api/v1/cron/sync_leaderboard")
async def sync_leaderboard_to_supabase(
    request: Request,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    # 1. Проверяем секретный ключ для защиты от несанкционированного доступа
    cron_secret = os.getenv("CRON_SECRET")
    auth_header = request.headers.get("Authorization")
    if not cron_secret or auth_header != f"Bearer {cron_secret}":
        raise HTTPException(status_code=403, detail="Forbidden: Invalid secret")

    logging.info("🚀 Запуск синхронизации через ОБЩИЙ ЛИДЕРБОРД...")

    if not WIZEBOT_API_KEY:
        raise HTTPException(status_code=500, detail="Wizebot API не настроен.")

    # Определяем, какие метрики мы хотим синхронизировать
    metrics_to_sync = [
        {"name": "message", "metric_type_db": "messages"},
        {"name": "uptime", "metric_type_db": "uptime"}
    ]
    
    try:
        # Используем set, чтобы не было дубликатов ID пользователей для пересчёта
        users_to_recalculate = set()

        # Проходим по каждой метрике (сообщения, время)
        for metric in metrics_to_sync:
            metric_name = metric["name"]
            metric_type_db = metric["metric_type_db"]
            logging.info(f"--- Синхронизация метрики: {metric_name} ---")

            # Запрашиваем топ-100 у Wizebot
            limit = 100
            url = f"https://wapi.wizebot.tv/api/ranking/{WIZEBOT_API_KEY}/top/{metric_name}/session/{limit}"
            
            leaderboard_data = []
            updated_user_logins = set()
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(url, timeout=25.0)
                    resp.raise_for_status()
                    data = resp.json()
                    leaderboard_data = data.get("list", [])
            except Exception as e:
                logging.error(f"❌ Ошибка при получении лидерборда ({metric_name}) от Wizebot: {e}")
                continue

            if not leaderboard_data:
                logging.info(f"Лидерборд ({metric_name}) от Wizebot пуст.")
                continue
            
            # Готовим данные для отправки в нашу "умную" SQL-функцию
            stats_payload = []
            for entry in leaderboard_data:
                twitch_login = entry.get("user_name")
                value = int(entry.get("value", 0))
                if twitch_login:
                    stats_payload.append({"twitch_login": twitch_login.lower(), "value": value})
                    updated_user_logins.add(twitch_login.lower())

            # ИСПРАВЛЕНИЕ: Добавлен недостающий параметр p_period, который требуется функцией sync_twitch_stats
            await supabase.post(
                "/rpc/sync_twitch_stats",
                json={
                    "p_metric_type": metric_type_db,
                    "p_period": "session",  # <-- Вот здесь мы добавили параметр
                    "p_stats": stats_payload
                }
            )
            
            # Находим telegram_id всех пользователей, чьи данные обновились
            if updated_user_logins:
                users_resp = await supabase.get(
                    "/users",
                    params={"select": "telegram_id", "twitch_login": f"in.({','.join(map(lambda x: f'\"{x}\"', updated_user_logins))})"}
                )
                users_resp.raise_for_status()
                for user in users_resp.json():
                    if user.get("telegram_id"):
                        users_to_recalculate.add(user["telegram_id"])

        # ✅ После обновления всех статистик, запускаем пересчёт прогресса для затронутых пользователей
        if users_to_recalculate:
            logging.info(f"Пересчитываем прогресс Twitch для {len(users_to_recalculate)} пользователей...")
            for user_id in users_to_recalculate:
                await supabase.post("/rpc/recalculate_twitch_progress", json={"p_user_id": user_id})

    except Exception as e:
        logging.error(f"❌ Ошибка при синхронизации Twitch: {e}", exc_info=True)
        # TODO: Можно добавить возврат ошибки 500
        # raise HTTPException(status_code=500, detail="Ошибка при синхронизации Twitch")

    logging.info("🎉 Синхронизация статистики Twitch завершена.")
    return {"message": "Leaderboard sync completed."}

async def background_challenge_bonuses(user_id: int):
    """
    Начисляет бонусы (звезды, билеты, таймер) в фоне.
    🔥 ИСПРАВЛЕНО: Теперь учитывает VIP и SUB статус!
    """
    try:
        # Используем того же быстрого клиента
        client = await get_background_client()
        
        # 1. Получаем статус пользователя и настройки (ПАРАЛЛЕЛЬНО для скорости)
        user_task = client.get("/users", params={"telegram_id": f"eq.{user_id}", "select": "twitch_status"})
        settings_task = get_grind_settings_async_global()
        
        user_resp, grind_settings = await asyncio.gather(user_task, settings_task)
        
        twitch_status = "none"
        if user_resp.status_code == 200 and user_resp.json():
            twitch_status = user_resp.json()[0].get("twitch_status", "none")

        # 2. Начисляем звезду Чекпоинта (Всегда +1)
        await client.post("/rpc/increment_checkpoint_stars", json={"p_user_id": user_id, "p_amount": 1})
        
        # 3. Начисляем билеты
        # Сначала берем базу (обычно 1)
        rules_resp = await client.get("/reward_rules", params={"action_type": "eq.challenge_completion", "select": "ticket_amount"})
        rules_data = rules_resp.json()
        base_tickets = rules_data[0]['ticket_amount'] if rules_data else 1
        
        final_tickets = base_tickets
        
        # --- 🔥 ГЛАВНОЕ ИСПРАВЛЕНИЕ: БОНУС ЗА СТАТУС 🔥 ---
        if twitch_status in ['subscriber', 'vip']:
            # Берем размер бонуса из настроек (обычно 5)
            bonus = grind_settings.twitch_status_free_tickets
            final_tickets += bonus
            logging.info(f"💎 [Grind] User {user_id} is {twitch_status}! Added bonus: +{bonus} tickets. Total: {final_tickets}")
        # --------------------------------------------------

        if final_tickets > 0:
            await client.post("/rpc/increment_tickets", json={"p_user_id": user_id, "p_amount": final_tickets})
            
        # 4. Обновляем таймер (чтобы запустить кулдаун)
        await client.post("/rpc/update_last_challenge_time", json={"p_user_id": user_id})
        
        logging.info(f"✅ [BG] Бонусы челленджа начислены для {user_id} (Билетов: {final_tickets})")

    except Exception as e:
        logging.error(f"❌ [BG] Ошибка начисления бонусов челленджа: {e}")
    
@app.post("/api/v1/challenges/{challenge_id}/claim")
async def claim_challenge(
    challenge_id: int,
    request_data: InitDataRequest,
    background_tasks: BackgroundTasks,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")

    current_user_id = user_info["id"]
    
    # 1. Проверяем настройки (быстро из кэша)
    admin_settings = await get_admin_settings_async_global()
    
    promocode_text = None
    message = ""

    # Если награды выключены админом
    if not admin_settings.challenge_promocodes_enabled:
        await supabase.post(
            "/rpc/complete_challenge_and_set_cooldown",
            json={"p_user_id": current_user_id, "p_challenge_id": challenge_id}
        )
        return {"success": True, "message": "Челлендж выполнен! Награды временно отключены.", "promocode": None}

    # 2. Пробуем забрать награду (Основной путь)
    try:
        rpc_response = await supabase.post(
            "/rpc/claim_challenge_and_get_reward", 
            json={"p_user_id": current_user_id, "p_challenge_id": challenge_id}
        )
        rpc_response.raise_for_status()
        promocode_text = rpc_response.text.strip('"')
        message = "Награда получена!"

    except httpx.HTTPStatusError as e:
        # --- 🔥 ИСПРАВЛЕНИЕ ЛОГИКИ ОШИБОК 🔥 ---
        
        # Получаем текст ошибки от базы
        error_details = e.response.json().get("message", e.response.text) if e.response.headers.get("content-type") == "application/json" else e.response.text
        
        # 3. Если произошла ошибка, ПРОВЕРЯЕМ РЕАЛЬНЫЙ СТАТУС в базе
        # Это надежнее, чем гадать по тексту ошибки
        status_check = await supabase.get(
            "/user_challenges",
            params={
                "user_id": f"eq.{current_user_id}", 
                "challenge_id": f"eq.{challenge_id}",
                "select": "status"
            }
        )
        real_status = None
        if status_check.json():
            real_status = status_check.json()[0].get("status")

        # 4. Принимаем решение на основе статуса
        if real_status == 'expired':
            # Если истек — честно говорим об этом и НЕ пытаемся выдать награду
            raise HTTPException(status_code=400, detail="Время выполнения челленджа истекло. Попробуйте взять новый.")
            
        elif real_status in ['claimed', 'completed']:
            # Если выполнен, но код не пришел — пробуем восстановить (Fallback)
            try:
                award_resp = await supabase.post(
                    "/rpc/award_reward_and_get_promocode",
                    json={"p_user_id": current_user_id, "p_source_type": "challenge", "p_source_id": challenge_id}
                )
                award_resp.raise_for_status()
                
                try:
                    award_json = award_resp.json()
                    promocode_text = award_json.get("code") if isinstance(award_json, dict) else str(award_json).strip('"')
                except:
                    promocode_text = award_resp.text.strip('"')
                    
                message = "Награда получена (восстановлена)!"
            except Exception as fallback_error:
                # Если даже восстановление не сработало (например, кончились промокоды)
                logging.error(f"Fallback claim failed: {fallback_error}")
                raise HTTPException(status_code=409, detail="Награда уже получена, либо закончились промокоды. Проверьте ваш профиль или обратитесь к админу.")
        
        else:
            # Какой-то другой статус (например, pending) или ошибка валидации
            raise HTTPException(status_code=400, detail=error_details)

    # 5. 🔥 БОНУСЫ В ФОНЕ 🔥
    background_tasks.add_task(background_challenge_bonuses, current_user_id)

    return {
        "success": True,
        "message": message,
        "promocode": promocode_text
    }
# --- НОВЫЙ ЭНДПОИНТ: Получение активных сущностей пользователя ---
@app.get("/api/v1/admin/users/{user_id}/active_entities")
async def admin_get_user_active_entities(
    user_id: int,
    initData: str = Query(...), # Получаем initData из query параметра
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Возвращает ID активного квеста и/или челленджа для пользователя."""
    # Валидация админа
    user_info = is_valid_init_data(initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # Получаем активный квест пользователя
        user_resp = await supabase.get(
            "/users",
            params={"telegram_id": f"eq.{user_id}", "select": "active_quest_id"}
        )
        user_resp.raise_for_status()
        user_data = user_resp.json()
        active_quest_id = user_data[0].get("active_quest_id") if user_data else None

        # Получаем активный челлендж пользователя (pending и не истекший)
        challenge_resp = await supabase.get(
            "/user_challenges",
            params={
                "user_id": f"eq.{user_id}",
                "status": "eq.pending",
                "expires_at": f"gte.{datetime.now(timezone.utc).isoformat()}", # gte = greater than or equal
                "select": "challenge_id",
                "limit": 1
            }
        )
        challenge_resp.raise_for_status()
        challenge_data = challenge_resp.json()
        active_challenge_id = challenge_data[0].get("challenge_id") if challenge_data else None

        return {
            "active_quest_id": active_quest_id,
            "active_challenge_id": active_challenge_id
        }

    except Exception as e:
        logging.error(f"Ошибка при получении активных сущностей для user {user_id} (админ): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось получить данные.")

@app.get("/api/v1/challenges/{challenge_id}/debug")
async def check_challenge_state(
    challenge_id: int,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    try:
        logging.info(f"🔍 Проверка состояния челленджа {challenge_id}")

        # Получаем user_challenge + reward_amount
        challenge_resp = await supabase.get(
            "/user_challenges",
            params={
                "id": f"eq.{challenge_id}",
                "select": "*,challenges(reward_amount)"
            }
        )
        challenge_resp.raise_for_status()
        challenge_data = challenge_resp.json()

        if not challenge_data:
            return {"error": "Челлендж не найден"}

        challenge = challenge_data[0]
        user_id = challenge["user_id"]
        reward_amount = challenge["challenges"]["reward_amount"]

        # Проверка промокодов
        promo_resp = await supabase.get(
            "/promocodes",
            params={
                "is_used": "eq.false",
                "reward_value": f"eq.{reward_amount}",
                "limit": "1"
            }
        )
        promo_resp.raise_for_status()
        promo_data = promo_resp.json()

        # Пробный вызов RPC
        rpc_resp = await supabase.post(
            "/rpc/award_reward_and_get_promocode",
            json={
                "p_user_id": user_id,
                "p_source_type": "challenge",
                "p_source_id": challenge_id
            }
        )
        rpc_text = rpc_resp.text
        rpc_status = rpc_resp.status_code

        return {
            "challenge": {
                "id": challenge["id"],
                "user_id": user_id,
                "status": challenge["status"],
                "claimed_at": challenge["claimed_at"],
                "reward_amount": reward_amount
            },
            "promocode_available": bool(promo_data),
            "rpc_response_status": rpc_status,
            "rpc_response_text": rpc_text
        }

    except Exception as e:
        logging.error(f"❌ Ошибка при проверке состояния челленджа: {e}", exc_info=True)
        return {"error": str(e)}

@app.post("/api/v1/admin/submissions")
async def get_pending_submissions(request_data: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS: raise HTTPException(status_code=403, detail="Доступ запрещен")
    response = await supabase.post("/rpc/get_pending_submissions_with_details")
    return response.json()




# --- ОБНОВЛЕННАЯ ОСНОВНАЯ ФУНКЦИЯ ---

async def send_approval_notification(user_id: int, quest_title: str, promo_code: str):
    """Отправляет уведомление об одобрении заявки в фоне."""
    try:
        safe_promo_code = re.sub(r"[^a-zA-Z0-9_]", "_", promo_code)
        activation_url = f"https://t.me/HATElavka_bot?start={safe_promo_code}"
        notification_text = (
            f"<b>🎉 Твоя награда за квест «{html_decoration.quote(quest_title)}»!</b>\n\n"
            f"Скопируй промокод и используй его в @HATElavka_bot, чтобы получить свои звёзды.\n\n"
            f"Твой промокод:\n<code>{promo_code}</code>"
        )
        
        # Клавиатура
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="✅ Активировать в HATElavka", url=activation_url)],
            [InlineKeyboardButton(text="🗑️ Получил, удалить из списка", callback_data=f"confirm_reward:promocode:{promo_code}")]
        ])

        # 👇 ИСПОЛЬЗУЕМ НОВУЮ ФУНКЦИЮ ОТПРАВКИ С ПРОВЕРКОЙ НАСТРОЕК 👇
        # Передаем ключ настройки 'notify_rewards'
        await check_and_send_notification(
            user_id, 
            notification_text, 
            "notify_rewards", 
            reply_markup=keyboard
        )
        # 👆 -------------------------------------------------------- 👆

        logging.info(f"Фоновое уведомление для {user_id} успешно отправлено.")
    except Exception as e:
        logging.error(f"Ошибка при отправке фонового уведомления для {user_id}: {e}")
        logging.info(f"Фоновое уведомление для {user_id} успешно отправлено.")
    except Exception as e:
        logging.error(f"Ошибка при отправке фонового уведомления для {user_id}: {e}")

@app.post("/api/v1/admin/submission/update")
async def update_submission_status(
    request_data: SubmissionUpdateRequest,
    background_tasks: BackgroundTasks,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    submission_id = request_data.submission_id
    action = request_data.action

    # Поле reward_amount из квеста больше не используется, берем только title
    submission_data_resp = await supabase.get(
        "/quest_submissions",
        params={"id": f"eq.{submission_id}", "select": "user_id, quest:quests(title)"}
    )
    submission_data = submission_data_resp.json()
    if not submission_data:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    user_to_notify = submission_data[0]['user_id']
    quest_title = submission_data[0]['quest']['title']

    if action == 'rejected':
        await supabase.patch("/quest_submissions", params={"id": f"eq.{submission_id}"}, json={"status": "rejected"})
        background_tasks.add_task(safe_send_message, user_to_notify, f"❌ Увы, твоя заявка на квест «{quest_title}» была отклонена.")
        return {"message": "Заявка отклонена."}

    # --- 👇👇👇 НАЧАЛО НОВОГО БЛОКА 👇👇👇 ---
    elif action == 'rejected_silent':
        # Просто обновляем статус в базе данных
        await supabase.patch(
            "/quest_submissions",
            params={"id": f"eq.{submission_id}"},
            json={"status": "rejected"}
        )
        # НЕ отправляем уведомление пользователю
        logging.info(f"Заявка {submission_id} была бесшумно отклонена.")
        return {"message": "Заявка отклонена (бесшумно)."}
    # --- 👆👆👆 КОНЕЦ НОВОГО БЛОКА 👆👆👆 ---

    # --- 👇 CORRECTED INDENTATION FOR ELIF 👇 ---
    elif action == 'approved':
        try:
            # 1. Начисляем билеты
            ticket_reward = await get_ticket_reward_amount_global("manual_quest_approval")
            if ticket_reward > 0:
                await supabase.post("/rpc/increment_tickets", json={"p_user_id": user_to_notify, "p_amount": ticket_reward})
                logging.info(f"Начислено {ticket_reward} билета(ов) за ручной квест пользователю {user_to_notify}.")

            # 2. Выдаем промокод
            response = await supabase.post(
                "/rpc/award_reward_and_get_promocode",
                json={ "p_user_id": user_to_notify, "p_source_type": "manual_submission", "p_source_id": submission_id }
            )
            response.raise_for_status()
            promo_code = response.text.strip('"')

            # --- 🔽🔽🔽 БЛОК С ЛОГАМИ (ЗАМЕНИ СТАРЫЙ БЛОК НА ЭТОТ) 🔽🔽🔽 ---
            # 3. Вызываем триггер для "Недельного Забега"
            try:
                logging.info(f"--- [update_submission_status] Запуск триггера 'Забега' для submission_id: {submission_id} ---")
                submission_details_resp = await supabase.get(
                    "/quest_submissions",
                    params={"id": f"eq.{submission_id}", "select": "quest_id"}
                )
                submission_details = submission_details_resp.json()
                
                if submission_details:
                    manual_quest_id = submission_details[0].get('quest_id')
                    logging.info(f"--- [update_submission_status] Найден manual_quest_id: {manual_quest_id} (Тип: {type(manual_quest_id)}) ---")
                    
                    if manual_quest_id is None or manual_quest_id == "":
                         logging.error(f"--- [update_submission_status] ОШИБКА: manual_quest_id ПУСТОЙ. Триггер не будет вызван. ---")
                    else:
                        await supabase.post(
                            "/rpc/increment_weekly_goal_progress",
                            json={
                                "p_user_id": user_to_notify,
                                "p_task_type": "manual_quest_complete",
                                "p_entity_id": manual_quest_id
                            }
                        )
                        logging.info(f"--- [update_submission_status] УСПЕХ: Триггер 'manual_quest_complete' (ID: {manual_quest_id}) вызван для user {user_to_notify}. ---")
                else:
                    logging.warning(f"--- [update_submission_status] НЕ НАЙДЕН quest_id для submission {submission_id}, триггер 'Забега' не вызван. ---")
            except Exception as trigger_e:
                logging.error(f"--- [update_submission_status] ОШИБКА при вызове триггера 'Забега': {trigger_e} ---", exc_info=True)
            # --- 🔼🔼🔼 КОНЕЦ БЛОКА С ЛОГАМИ 🔼🔼🔼 ---

            # 4. Отправляем уведомление
            background_tasks.add_task(
                send_approval_notification,
                user_id=user_to_notify,
                quest_title=quest_title,
                promo_code=promo_code
            )

            logging.info(f"Заявка {submission_id} одобрена. Билеты ({ticket_reward}) начислены, промокод '{promo_code}' отправляется.")
            return {"message": "Заявка одобрена. Награда (билеты и промокод) отправляется пользователю.", "promocode": promo_code}

            # --- КОНЕЦ ИЗМЕНЕНИЯ ---

        except httpx.HTTPStatusError as e:
            # Обработка ошибок, если RPC award_reward_and_get_promocode вернула ошибку
            # (например, не нашлось свободного промокода)
            error_details = e.response.json().get("message", "Ошибка базы данных при выдаче награды.")
            logging.error(f"Ошибка при одобрении заявки {submission_id}: {error_details}")
            # Важно: Не меняем статус заявки на approved, если награду выдать не удалось
            raise HTTPException(status_code=400, detail=error_details)
        except Exception as e:
            logging.error(f"Критическая ошибка при одобрении заявки {submission_id}: {e}", exc_info=True)
            # Важно: Не меняем статус заявки на approved при неизвестной ошибке
            raise HTTPException(status_code=500, detail="Не удалось одобрить заявку.")
    # --- 👇 CORRECTED INDENTATION FOR ELSE 👇 ---
    else:
        raise HTTPException(status_code=400, detail="Неверное действие.")
# --- ВАШ СУЩЕСТВУЮЩИЙ ЭНДПОИНТ (оставьте его без изменений) ---
@app.get("/api/v1/leaderboard/wizebot")
async def get_wizebot_leaderboard(sub_type: str = "ALL", limit: int = 50):
    # ... (код этой функции остается прежним)
    if not WIZEBOT_API_KEY:
        raise HTTPException(status_code=500, detail="Wizebot API is not configured.")

    url = f"https://wapi.wizebot.tv/api/ranking/{WIZEBOT_API_KEY}/top/ranks/{sub_type}/{limit}"

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, timeout=15.0)
            resp.raise_for_status()
            data = resp.json()

            formatted_data = [
                {
                    "full_name": entry.get("user_name"),
                    "user_id": entry.get("user_uid"),
                    "total_activity": int(entry.get("value", 0))
                }
                for entry in data.get("list", [])
            ]

            return formatted_data

        except Exception as e:
            logging.error(f"❌ Ошибка при запросе к Wizebot API: {e}")
            return JSONResponse(
                status_code=502,
                content={"error": "Failed to fetch leaderboard from Wizebot"}
            )


# --- ОБНОВЛЕННЫЙ ЭНДПОИНТ ДЛЯ СТАТИСТИКИ (используйте этот код) ---
@app.get("/api/v1/leaderboard/wizebot/stats")
async def get_wizebot_stats(
    metric: str = Query("message", enum=["message", "uptime"]), 
    period: str = Query("week", enum=["session", "week", "month", "global"]),
    limit: int = 50
):
    """
    Получает кастомную статистику из Wizebot по разным метрикам и периодам.
    - metric: 'message' (сообщения) или 'uptime' (время просмотра).
    - period: 'week', 'month' или 'uptime' (для совместимости с вашим примером).
    """
    if not WIZEBOT_API_KEY:
        raise HTTPException(status_code=500, detail="Wizebot API is not configured.")

    # Собираем URL на основе метрики и периода
    url = f"https://wapi.wizebot.tv/api/ranking/{WIZEBOT_API_KEY}/top/{metric}/{period}/{limit}"

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, timeout=15.0)
            resp.raise_for_status()
            data = resp.json()

            # Форматируем данные в едином стиле
            # 'value' будет содержать либо кол-во сообщений, либо минуты просмотра
            formatted_data = [
                {
                    "username": entry.get("user_name"),
                    "user_id": entry.get("user_uid"),
                    "value": int(entry.get("value", 0))
                }
                for entry in data.get("list", [])
            ]

            return {"metric": metric, "period": period, "leaderboard": formatted_data}

        except httpx.HTTPStatusError as e:
            logging.error(f"❌ Ошибка от Wizebot API: {e.response.status_code} - {e.response.text}")
            return JSONResponse(
                status_code=e.response.status_code,
                content={"error": "Failed to fetch stats from Wizebot", "detail": e.response.text}
            )
        except Exception as e:
            logging.error(f"❌ Неизвестная ошибка при запросе к Wizebot API: {e}")
            return JSONResponse(
                status_code=502,
                content={"error": "An unexpected error occurred while communicating with Wizebot"}
            )



@app.get("/api/v1/leaderboard")
async def get_leaderboard_data(request: Request, period: str = "day", supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    MSK = timezone(timedelta(hours=3)); now = datetime.now(MSK); start_date_str = None
    if period == "day": start_date_str = now.date().isoformat()
    elif period == "week": start_date_str = (now.date() - timedelta(days=now.weekday())).isoformat()
    elif period == "month": start_date_str = now.date().replace(day=1).isoformat()
    elif period != "all": raise HTTPException(status_code=400, detail="Invalid period")
    params = {"p_start_date": start_date_str} if start_date_str else {}
    response = await supabase.post("/rpc/get_leaderboard", json=params); response.raise_for_status()
    return response.json()

@app.post("/api/v1/user/rewards")
async def get_user_rewards(
    request_data: InitDataRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Возвращает ОБЪЕДИНЕННЫЙ список наград: промокоды и ручные выдачи."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info: 
        raise HTTPException(status_code=401, detail="Доступ запрещен")
    
    user_id = user_info['id']
    all_rewards = []

    try:
        # 1. Получаем промокоды
        promocodes_resp = await supabase.get(
            "/promocodes", 
            params={
                "telegram_id": f"eq.{user_id}", 
                "select": "code,description,reward_value,claimed_at"
            }
        )
        promocodes = promocodes_resp.json()
        for promo in promocodes:
            all_rewards.append({
                "type": "promocode",
                "date": promo['claimed_at'],
                "data": promo
            })

        # 2. Получаем ручные выдачи
        grants_resp = await supabase.get(
            "/manual_grants",
            params={
                "user_id": f"eq.{user_id}",
                # 👇 ДОБАВЛЕНО 'id' В ЗАПРОС 👇
                "select": "id, created_at, grant_type, amount"
            }
        )
        grants = grants_resp.json()
        for grant in grants:
            all_rewards.append({
                "type": "grant",
                "date": grant['created_at'],
                "data": grant
            })
            
        # Если даты нет, подставляем старую дату (или пустую строку), чтобы ошибка не возникала
        all_rewards.sort(key=lambda x: str(x.get('date') or '1970-01-01'), reverse=True)

        
        return all_rewards

    except Exception as e:
        logging.error(f"Ошибка при получении объединенных наград для {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить список наград.")

# --- ИСПРАВЛЕННЫЙ ЭНДПОИНТ ДЛЯ КВЕСТОВ ---
# --- ИСПРАВЛЕННАЯ ВЕРСИЯ ФУНКЦИИ (УДАЛЕНА ПРОВЕРКА .error) ---

@app.post("/api/v1/user/grants/delete-all")
async def delete_all_manual_grants(
    request_data: InitDataRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Удаляет ВСЕ записи о ручной выдаче для текущего пользователя."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    telegram_id = user_info["id"]
    
    # Удаляем все записи из manual_grants для этого юзера
    await supabase.delete(
        "/manual_grants",
        params={"user_id": f"eq.{telegram_id}"}
    )
    
    return {"message": "Все записи о выдаче удалены."}

@app.post("/api/v1/user/grants/delete")
async def delete_manual_grant(
    request_data: GrantDeleteRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    telegram_id = user_info["id"]
    
    # Удаляем запись о гранте, но только если она принадлежит этому пользователю
    await supabase.delete(
        "/manual_grants",
        params={
            "id": f"eq.{request_data.id}",
            "user_id": f"eq.{telegram_id}"
        }
    )
    
    return {"message": "Запись удалена."}

@app.post("/api/v1/promocode")
async def get_promocode(request_data: PromocodeClaimRequest): # <<< Убрали Depends
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = user_info["id"]
    quest_id = request_data.quest_id

    try:
        # --- 1. Проверяем прогресс квеста ---
        # ИЗМЕНЕНИЕ: Используем глобальный supabase
        progress_response = supabase.table("user_quest_progress").select("current_progress").eq("user_id", user_id).eq("quest_id", quest_id).is_("claimed_at", None).execute()
        progress_data = progress_response.data

        if not progress_data:
            raise HTTPException(status_code=400, detail="Награда уже была получена или квест не был начат.")

        user_progress = progress_data[0].get("current_progress", 0)

        # --- Получаем детали квеста ---
        # ИЗМЕНЕНИЕ: Используем глобальный supabase
        quest_response = supabase.table("quests").select("target_value").eq("id", quest_id).execute()
        quest_data = quest_response.data

        if not quest_data:
            raise HTTPException(status_code=404, detail="Задание не найдено.")

        target_value = quest_data[0].get("target_value", 1)

        if user_progress < target_value:
            raise HTTPException(status_code=400, detail="Задание еще не выполнено.")

        # --- 2. Начисляем билеты ---
        # ИЗМЕНЕНИЕ: Используем новую вспомогательную функцию с глобальным клиентом
        ticket_reward = await get_ticket_reward_amount_global("automatic_quest_claim")
        if ticket_reward > 0:
            # ИЗМЕНЕНИЕ: Используем глобальный supabase
             supabase.rpc(
                 "increment_tickets",
                 {"p_user_id": user_id, "p_amount": ticket_reward}
             ).execute()

        # --- 3. Получаем настройки админ-панели ---
        # ИЗМЕНЕНИЕ: Используем новую вспомогательную функцию с глобальным клиентом
        admin_settings = await get_admin_settings_async_global()

        # --- 4. Проверяем, включена ли выдача промокодов ---
        if not admin_settings.quest_promocodes_enabled:
            # Если промокоды выключены, просто завершаем квест
            # ИЗМЕНЕНИЕ: Используем глобальный supabase
            supabase.table("user_quest_progress").update(
                {"claimed_at": datetime.now(timezone.utc).isoformat()}
            ).eq("user_id", user_id).eq("quest_id", quest_id).execute()

            # ИЗМЕНЕНИЕ: Используем глобальный supabase
            supabase.table("users").update(
                {"active_quest_id": None, "active_quest_end_date": None, "quest_progress": 0}
            ).eq("telegram_id", user_id).eq("active_quest_id", quest_id).execute() # Добавил eq active_quest_id для безопасности

            return {"message": f"Квест выполнен! Вам начислено {ticket_reward} билет(а/ов).", "tickets_only": True, "tickets_awarded": ticket_reward}
        else:
            # Если промокоды включены, выдаем их
            # ИЗМЕНЕНИЕ: Используем глобальный supabase
            rpc_response = supabase.rpc(
                 "award_reward_and_get_promocode",
                 { "p_user_id": user_id, "p_source_type": "quest", "p_source_id": quest_id }
            ).execute()

            promocode_data = rpc_response.data
            # RPC возвращает сам промокод строкой, а не JSON объект
            # Поэтому нужно убедиться, что фронтенд ожидает именно строку или адаптировать ответ
            if isinstance(promocode_data, str): # Проверка, что вернулась строка
                 # Адаптируем ответ под старый формат, если нужно
                 promocode_obj = {"code": promocode_data} # Пример, если фронтенд ждет объект
            else:
                 # Если RPC возвращает JSON или что-то другое, используем как есть
                 promocode_obj = promocode_data

            return { "message": "Квест выполнен! Ваша награда добавлена в профиль.", "promocode": promocode_obj }

    # except PostgrestAPIError as e: # Можно ловить специфичные ошибки supabase-py
    #     error_details = getattr(e, 'message', str(e))
    #     logging.error(f"Ошибка Supabase API при получении награды за квест: {error_details}", exc_info=True)
    #     raise HTTPException(status_code=getattr(e, 'status_code', 400), detail=error_details)
    except Exception as e:
        logging.error(f"Критическая ошибка при получении награды за квест для user {user_id}, quest {quest_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось получить награду.")

# --- Эндпоинт 1: Проверка (вызывать при старте приложения) ---
@app.post("/api/v1/user/referral/sync")
async def sync_referral_with_bott(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info: return {"status": "error"}
    
    user_id = user_info["id"]
    
    # 1. Проверяем, есть ли уже реферер в нашей базе
    resp = await supabase.get("/users", params={"telegram_id": f"eq.{user_id}", "select": "referrer_id"})
    if resp.json() and resp.json()[0].get("referrer_id"):
        return {"status": "exists"}

    # 2. Стучимся в Bot-t API
    url = f"https://api.bot-t.com/v1/bot/user/view-by-telegram-id"
    payload = {
        "bot_id": int(BOTT_BOT_ID),
        "token": BOTT_PUBLIC_KEY, # Используем токен (публичный или приватный, проверь доку Bot-t)
        "telegram_id": user_id
    }
    
    # ВАЖНО: Bot-t может требовать GET или POST. В доке написано:
    # "Обязательные данные: token (GET string)". Но обычно API принимают JSON.
    # Реализуем как GET с параметрами, судя по доке.
    
    async with httpx.AsyncClient() as client:
        try:
            bott_resp = await client.post(url, json=payload) # Bot-t обычно POST
            data = bott_resp.json()
            
            # Структура ответа Bot-t (BotUser -> ref)
            ref_user = data.get("ref")
            if ref_user and ref_user.get("telegram_id"):
                referrer_tg_id = ref_user.get("telegram_id")
                
                # Записываем реферера к нам в базу
                await supabase.patch(
                    "/users",
                    params={"telegram_id": f"eq.{user_id}"},
                    json={"referrer_id": referrer_tg_id}
                )
                return {"status": "linked", "referrer": referrer_tg_id}
        except Exception as e:
            logging.error(f"Bot-t sync error: {e}")
            
    return {"status": "no_ref"}

# Используем точный ID канала (числом, без кавычек)
REQUIRED_CHANNEL_ID = -1002144676097 

@app.post("/api/v1/user/referral/activate")
async def activate_referral_bonus(
    request_data: ReferralActivateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    import traceback
    logging.info("--- [REFERRAL_ACTIVATE] Попытка активации бонуса ---")
    
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info: 
        logging.error("[REFERRAL_ACTIVATE] ❌ Неверный initData")
        raise HTTPException(status_code=401)
    
    # 🔥 ФИКС 1: Явное преобразование в int
    try:
        user_id = int(user_info["id"])
    except ValueError:
        logging.error(f"[REFERRAL_ACTIVATE] ❌ Некорректный ID пользователя: {user_info.get('id')}")
        raise HTTPException(status_code=400, detail="Invalid User ID format")

    logging.info(f"[REFERRAL_ACTIVATE] Пользователь: {user_id}")

    # 1. Получаем данные пользователя
    try:
        u_resp = await supabase.get("/users", params={"telegram_id": f"eq.{user_id}", "select": "referrer_id, twitch_id, referral_activated_at"})
        if not u_resp.json():
            logging.error("[REFERRAL_ACTIVATE] ❌ Пользователь не найден в БД")
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        user = u_resp.json()[0]
    except Exception as e:
        logging.error(f"[REFERRAL_ACTIVATE] Ошибка БД: {e}")
        raise HTTPException(status_code=500, detail="Ошибка базы данных")

    # Если уже активировал
    if user.get("referral_activated_at"):
        logging.info("[REFERRAL_ACTIVATE] ⚠️ Уже активировано ранее")
        return {"message": "Бонус уже активирован ранее!", "already_done": True}

    # 2. Проверка TWITCH
    if not user.get("twitch_id"):
        logging.warning("[REFERRAL_ACTIVATE] ⛔ Twitch не привязан")
        raise HTTPException(status_code=400, detail="Сначала привяжите Twitch аккаунт!")

    # 3. Проверка ПОДПИСКИ НА КАНАЛ
    logging.info(f"[REFERRAL_ACTIVATE] Проверка подписки в канале {REQUIRED_CHANNEL_ID}...")
    
    # 🔥 ФИКС 2: Используем глобального бота 'bot' вместо создания 'temp_bot'
    # Это надежнее и быстрее. 'bot' объявлен в начале вашего файла index.py
    try:
        # Используем глобальный объект bot
        chat_member = await bot.get_chat_member(chat_id=REQUIRED_CHANNEL_ID, user_id=user_id)
        logging.info(f"[REFERRAL_ACTIVATE] Статус в канале: {chat_member.status}")
        
        if chat_member.status in ['left', 'kicked']:
             raise HTTPException(status_code=400, detail=f"Подпишитесь на канал HATElove_ttv, чтобы забрать бонус!")
             
    except TelegramForbiddenError:
        logging.error(f"[REFERRAL_ACTIVATE] ❌ Бот не админ в канале {REQUIRED_CHANNEL_ID}")
        raise HTTPException(status_code=500, detail="Ошибка: Бот не является администратором канала.")
    except HTTPException as he:
        raise he 
    except Exception as e:
        # Логируем точную ошибку
        logging.error(f"[REFERRAL_ACTIVATE] ❌ Ошибка проверки подписки: {e}")
        
        # Если Telegram всё равно ругается на ID (редкий баг), можно попробовать пропустить
        if "PARTICIPANT_ID_INVALID" in str(e):
            logging.error(f"[REFERRAL_ACTIVATE] Странная ошибка ID {user_id}. Пробуем пропустить проверку (fail-safe).")
            # Если хотите жесткую проверку — раскомментируйте raise ниже. 
            # Если хотите дать бонус при ошибке телеграма — закомментируйте raise.
            raise HTTPException(status_code=400, detail="Ошибка проверки ID в Telegram. Попробуйте позже.")
            
        if "chat not found" in str(e).lower():
             raise HTTPException(status_code=500, detail="Ошибка настройки: Канал не найден.")
        raise HTTPException(status_code=400, detail="Не удалось проверить подписку. Попробуйте позже.")

    # 4. Выдача награды
    try:
        logging.info("[REFERRAL_ACTIVATE] ✅ Условия выполнены. Начисляем награду...")
        await supabase.post("/rpc/increment_coins", json={"p_user_id": user_id, "p_amount": 10})
        await supabase.post("/rpc/increment_tickets", json={"p_user_id": user_id, "p_amount": 1}) 
        
        await supabase.patch(
            "/users",
            params={"telegram_id": f"eq.{user_id}"},
            json={
                "referral_activated_at": datetime.now(timezone.utc).isoformat(),
                "is_bot_active": True
            }
        )
        logging.info("[REFERRAL_ACTIVATE] 🎉 Награда выдана успешно!")
    except Exception as e:
        logging.error(f"[REFERRAL_ACTIVATE] ❌ Ошибка при выдаче награды: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при начислении награды")

    return {"message": "Успех! +10 гринд монет и VIP-статус получены.", "success": True}
    
# --- Пользовательские эндпоинты ---
@app.post("/api/v1/user/challenge/available")
async def get_available_challenges(request_data: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info: raise HTTPException(status_code=401, detail="Доступ запрещен")
    telegram_id = user_info["id"]

    # --- НАЧАЛО ИСПРАВЛЕНИЯ ---
    # Проверяем активные челленджи, но также учитываем, не истек ли их срок
    pending_resp = await supabase.get(
        "/user_challenges", 
        params={"user_id": f"eq.{telegram_id}", "status": "eq.pending", "select": "id,expires_at"}
    )
    pending_challenges = pending_resp.json()

    if pending_challenges:
        current_challenge = pending_challenges[0]
        expires_at_str = current_challenge.get("expires_at")
        
        is_expired = False
        if expires_at_str:
            try:
                # Преобразуем строку в объект времени с часовым поясом
                expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
                if expires_at < datetime.now(timezone.utc):
                    is_expired = True
                    # Срок челленджа истек, обновляем его статус в базе
                    await supabase.patch(
                        "/user_challenges",
                        params={"id": f"eq.{current_challenge['id']}"},
                        json={"status": "expired"}
                    )
            except ValueError:
                # На случай, если дата в базе имеет неверный формат
                logging.warning(f"Неверный формат даты истечения срока для челленджа {current_challenge['id']}")

        # Выдаем ошибку, только если челлендж действительно активен (не истек)
        if not is_expired:
            raise HTTPException(status_code=409, detail="У вас уже есть активный челлендж.")
    # --- КОНЕЦ ИСПРАВЛЕНИЯ ---

    # Проверяем, привязан ли Twitch у пользователя
    user_resp = await supabase.get("/users", params={"telegram_id": f"eq.{telegram_id}", "select": "twitch_id"})
    user_has_twitch = user_resp.json() and user_resp.json()[0].get("twitch_id") is not None

    completed_resp = await supabase.get("/user_challenges", params={"user_id": f"eq.{telegram_id}", "status": "in.(claimed,expired)", "select": "challenge_id"})
    completed_ids = {c['challenge_id'] for c in completed_resp.json()}
    
    available_resp = await supabase.get("/challenges", params={"is_active": "eq.true", "select": "id,description,reward_amount,condition_type"})
    all_available = [c for c in available_resp.json() if c['id'] not in completed_ids]

    # Фильтруем квесты, если нет Twitch
    if not user_has_twitch:
        final_available = [c for c in all_available if c.get("condition_type") != 'twitch_points']
    else:
        final_available = all_available

    return final_available

@app.post("/api/v1/user/challenge/close_expired")
async def close_expired_challenge(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (ИСПРАВЛЕНИЕ v3)
    Принудительно закрывает (устанавливает 'expired') ЛЮБОЙ НЕЗАБРАННЫЙ челлендж
    (в статусе 'pending' ИЛИ 'completed'), у которого ВЫШЛО ВРЕМЯ.
    Это чинит баг, когда 'recalculate' ставит 'completed', но время истекает.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Доступ запрещен")
    
    telegram_id = user_info["id"]
    logging.info(f"--- [close_expired v3] Пользователь {telegram_id} пытается закрыть истекший челлендж. ---")

    try:
        # 1. Мы должны найти ЛЮБОЙ челлендж, который мешает взять новый.
        #    Это 'pending' ИЛИ 'completed' (если его не забрали).
        # 2. Мы должны убедиться, что он ДЕЙСТВИТЕЛЬНО истек.
        
        now_utc = datetime.now(timezone.utc).isoformat()

        patch_resp = await supabase.patch(
            "/user_challenges",
            params={
                "user_id": f"eq.{telegram_id}",
                "status": "in.(pending,completed)", # Ищем 'pending' ИЛИ 'completed'
                "claimed_at": "is.null",         # Который еще не забрали
                "expires_at": f"lt.{now_utc}"      # И который ДЕЙСТВИТЕЛЬНО истек
            },
            json={"status": "expired"}, # Принудительно ставим 'expired'
            headers={"Prefer": "count=exact"}
        )
        
        updated_count_str = patch_resp.headers.get('content-range', '*/0').split('/')[-1]
        updated_count = int(updated_count_str) if updated_count_str.isdigit() else 0

        if updated_count > 0:
            logging.info(f"[close_expired v3] УСПЕХ: Найден и закрыт (как 'expired') {updated_count} челлендж для {telegram_id}.")
            return {"message": "Истекший челлендж успешно закрыт."}
        else:
            # Если 0 строк обновлено, значит, он УЖЕ 'expired' или не найден.
            # В любом случае, это не ошибка.
            logging.warning(f"[close_expired v3] ВНИМАНИЕ: Не найдено 'pending' или 'completed' истекших челленджей для {telegram_id}. Вероятно, он уже был 'expired'.")
            return {"message": "Челлендж уже был закрыт (или не найден)."}

    except Exception as e:
        logging.error(f"Критическая ошибка в /close_expired (v3) для {telegram_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось закрыть челлендж.")
    
@app.post("/api/v1/user/challenge")
async def get_or_assign_user_challenge(
    request_data: InitDataRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Доступ запрещен")
    
    telegram_id = user_info["id"]

    # 1. Проверка настроек админа (кэш, очень быстро)
    admin_settings = await get_admin_settings_async_global()
    if not admin_settings.challenges_enabled:
        return JSONResponse(status_code=403, content={"message": "Система челленджей временно отключена."})

    # 2. Вызываем RPC (Мозг)
    try:
        rpc_resp = await supabase.post(
            "/rpc/assign_user_challenge",
            json={"p_user_id": telegram_id}
        )
        
        # Обработка логических ошибок от базы данных
        if rpc_resp.status_code == 400: # Ошибка 400, если сработал RAISE EXCEPTION
            error_json = rpc_resp.json()
            error_msg = error_json.get("message", "")
            
            if "COOLDOWN" in error_msg:
                date_part = error_msg.split(": ", 1)[1] if ": " in error_msg else ""
                
                # Попробуем сделать дату читаемой
                readable_date = date_part
                try:
                    # Парсим строку времени
                    dt = datetime.fromisoformat(date_part.replace('Z', '+00:00'))
                    # Конвертируем в читаемый формат (ДД.ММ.ГГГГ ЧЧ:ММ)
                    readable_date = dt.strftime("%d.%m.%Y %H:%M")
                except ValueError:
                    pass # Если не вышло, оставляем как есть

                return JSONResponse(
                    status_code=429, 
                    content={
                        "detail": f"Следующий челлендж можно взять: {readable_date} (UTC)",
                        "cooldown_until": date_part
                    }
                )
            if "NO_CHALLENGES_AVAILABLE" in error_msg:
                return JSONResponse(status_code=404, content={"message": "Для вас пока нет новых челленджей."})
            
            # Любая другая ошибка
            raise HTTPException(status_code=400, detail=error_msg)

        rpc_resp.raise_for_status()
        return rpc_resp.json()

    except httpx.HTTPStatusError as e:
        # Ловим, если RPC упала с 500 или другой ошибкой HTTP
        error_txt = e.response.text
        try:
             error_txt = e.response.json().get("message", error_txt)
        except: pass
        
        logging.error(f"RPC assign_user_challenge Error: {error_txt}")
        raise HTTPException(status_code=400, detail=f"Ошибка: {error_txt}")

    except Exception as e:
        logging.error(f"Assignment critical error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")
        
@app.post("/api/v1/user/challenge/check")
async def check_challenge_progress(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Доступ запрещен")
    
    telegram_id = user_info["id"]

    try:
        await supabase.post(
            "/rpc/recalculate_single_challenge",
            json={"p_user_id": telegram_id}
        )
        return {"message": "Прогресс обновлен."}
    except Exception as e:
        logging.error(f"Ошибка при вызове recalculate_single_challenge: {e}")
        return {"message": "Не удалось обновить прогресс."}

@app.post("/api/v1/admin/challenges/update")
async def update_challenge(request_data: ChallengeAdminUpdateRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS: 
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    challenge_id = request_data.challenge_id
    update_data = request_data.dict(exclude={'initData', 'challenge_id'})
    
    try:
        await supabase.patch(
            "/challenges",
            params={"id": f"eq.{challenge_id}"},
            json=update_data
        )
        return {"message": "Челлендж успешно обновлен."}
    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", str(e))
        logging.error(f"Ошибка обновления челленджа в Supabase: {error_details}")
        raise HTTPException(status_code=400, detail=f"Ошибка базы данных: {error_details}")
        
@app.post("/api/v1/admin/challenges/reset-cooldown")
async def reset_challenge_cooldown(
    request_data: AdminResetCooldownRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")
    
    user_id_to_reset = request_data.user_id_to_reset

    await supabase.post(
        "/rpc/admin_reset_challenge_cooldown",
        json={"p_user_id": user_id_to_reset}
    )
    return {"message": f"Кулдаун на челленджи для пользователя {user_id_to_reset} успешно сброшен."}

# --- НОВЫЕ ЭНДПОИНТЫ ДЛЯ УПРАВЛЕНИЯ СНОМ ---
@app.post("/api/v1/admin/sleep_mode_status")
async def get_sleep_mode_status(request_data: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")
    
    resp = await supabase.get("/settings", params={"key": "eq.sleep_mode", "select": "value"})
    settings = resp.json()
    if not settings:
        return {"is_sleeping": False, "wake_up_at": None}
    return settings[0].get('value', {"is_sleeping": False, "wake_up_at": None})

@app.post("/api/v1/admin/toggle_sleep_mode")
async def toggle_sleep_mode(request_data: SleepModeRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    resp = await supabase.get("/settings", params={"key": "eq.sleep_mode", "select": "value"})
    settings_data = resp.json()

    # ✅ ИЗМЕНЕНИЕ: Добавляем проверку, что данные из базы вообще пришли
    if settings_data:
        current_sleep_data = settings_data[0].get('value', {})
    else:
        # Если в базе нет строки 'sleep_mode', считаем, что бот не спит
        current_sleep_data = {"is_sleeping": False, "wake_up_at": None}

    is_currently_sleeping = current_sleep_data.get('is_sleeping', False)

    if is_currently_sleeping:
        # Разбудить бота
        new_value = {"is_sleeping": False, "wake_up_at": None}
        message = "Ботик проснулся!"
    else:
        # Уложить спать
        wake_up_at = None
        if request_data.minutes and request_data.minutes > 0:
            wake_up_at = (datetime.now(timezone.utc) + timedelta(minutes=request_data.minutes)).isoformat()
        
        new_value = {"is_sleeping": True, "wake_up_at": wake_up_at}
        message = "Ботик отправился спать."
    
    # Используем "upsert" для надёжности: если строки нет, она создастся
    await supabase.post(
        "/settings",
        json={"key": "sleep_mode", "value": new_value},
        headers={"Prefer": "resolution=merge-duplicates"}
    )
    
    return {"message": message, "new_status": new_value}

# --- НОВЫЙ ЭНДПОИНТ: Поиск пользователей для админки ---
@app.post("/api/v1/admin/users/search")
async def admin_search_users(
    request_data: AdminUserSearchRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Ищет пользователей по ID, TG-нику или Twitch-нику."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    term = request_data.search_term.strip()
    if len(term) < 2: # Не ищем по слишком коротким запросам
        return []

    try:
        # Эта RPC-функция будет искать по нескольким полям
        response = await supabase.post(
            "/rpc/admin_search_users",
            json={"p_term": f"%{term}%"} # Используем % для поиска подстроки
        )
        response.raise_for_status()
        return response.json()

    except Exception as e:
        logging.error(f"Ошибка при поиске пользователя (админ): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось выполнить поиск.")

@app.post("/api/v1/admin/users/link_twitch_manual")
async def admin_link_twitch_manual(
    request_data: AdminLinkTwitchManualRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Ручная привязка Twitch к пользователю (3 этапа)."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    # Обновляем данные пользователя: Логин, ID и ставим статус подписчика (чтобы работали бонусы)
    await supabase.patch(
        "/users",
        params={"telegram_id": f"eq.{request_data.user_id}"},
        json={
            "twitch_login": request_data.twitch_login,
            "twitch_id": request_data.twitch_id,
            "twitch_status": "subscriber", # Ставим подписку по умолчанию
            "last_twitch_sync": datetime.now(timezone.utc).isoformat()
        }
    )
    return {"message": f"Twitch успешно привязан к пользователю {request_data.user_id}."}

@app.post("/api/v1/admin/grants/log")
async def get_admin_grant_log(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Возвращает лог выдачи наград за последние 7 дней."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")
    
    try:
        # Запрашиваем записи за последнюю неделю
        seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        
        resp = await supabase.get(
            "/manual_grants",
            params={
                "created_at": f"gte.{seven_days_ago}",
                "select": "*",
                "order": "created_at.desc"
            }
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logging.error(f"Ошибка при получении лога выдачи: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить лог.")
    
@app.post("/api/v1/admin/challenges")
async def get_all_challenges(request_data: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS: raise HTTPException(status_code=403, detail="Доступ запрещен")
    resp = await supabase.get("/challenges", params={"select": "*", "order": "id.desc"})
    return resp.json()

@app.post("/api/v1/admin/challenges/create")
async def create_challenge(request_data: ChallengeAdminCreateRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS: raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    try:
        response = await supabase.post("/challenges", json=request_data.dict(exclude={'initData'}))
        response.raise_for_status() # Эта строка теперь вызовет ошибку, если Supabase ответит с ошибкой
    except httpx.HTTPStatusError as e:
        # Ловим ошибку и возвращаем понятный ответ
        error_details = e.response.json().get("message", str(e))
        logging.error(f"Ошибка создания челленджа в Supabase: {error_details}")
        raise HTTPException(status_code=400, detail=f"Ошибка базы данных: {error_details}")

    return {"message": "Челлендж успешно создан."}

# --- НОВЫЕ ЭНДПОИНТЫ ДЛЯ УПРАВЛЕНИЯ КАТЕГОРИЯМИ ---

@app.post("/api/v1/admin/twitch_rewards/purchase/mark_viewed")
async def mark_twitch_purchase_viewed(
    request_data: TwitchPurchaseViewedRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Помечает покупку как просмотренную и сохраняет имя админа."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    # Получаем имя админа из Telegram данных
    admin_name = user_info.get("first_name", "Admin")
    if user_info.get("last_name"):
        admin_name += f" {user_info.get('last_name')}"
    admin_name = admin_name.strip()

    purchase_id = request_data.purchase_id
    
    await supabase.patch(
        "/twitch_reward_purchases",
        params={"id": f"eq.{purchase_id}"},
        json={
            "viewed_by_admin": True,
            "viewed_by_admin_name": admin_name # <-- Сохраняем имя
        }
    )
    
    return {"status": "ok", "viewer": admin_name}

@app.post("/api/v1/admin/categories")
async def get_categories(request_data: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """Получает список всех категорий квестов."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    # --- ИЗМЕНЕНИЕ ЗДЕСЬ ---
    # Добавляем sort_order в select и order
    resp = await supabase.get(
        "/quest_categories",
        params={"select": "*,sort_order", "order": "sort_order.asc.nullslast,id.asc"} # Сначала по номеру, потом по ID
    )
    # --- КОНЕЦ ИЗМЕНЕНИЯ ---

    resp.raise_for_status()
    return resp.json()

@app.post("/api/v1/admin/categories/update_sort_order")
async def update_category_sort_order(
    request_data: CategorySortOrderUpdateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Обновляет порядковый номер (sort_order) для категории."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # Преобразуем None в null для базы данных, если нужно
        sort_order_value = request_data.sort_order if request_data.sort_order is not None else None

        await supabase.patch(
            "/quest_categories",
            params={"id": f"eq.{request_data.category_id}"},
            json={"sort_order": sort_order_value}
        )
        return {"message": "Порядок категории обновлен."}
    except Exception as e:
        logging.error(f"Ошибка обновления sort_order категории: {e}")
        raise HTTPException(status_code=500, detail="Не удалось обновить порядок категории.")

@app.post("/api/v1/admin/quests/update_sort_order")
async def update_quest_sort_order(
    request_data: QuestSortOrderUpdateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Обновляет порядковый номер (sort_order) для задания."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # Преобразуем None в null для базы данных, если нужно
        sort_order_value = request_data.sort_order if request_data.sort_order is not None else None

        await supabase.patch(
            "/quests",
            params={"id": f"eq.{request_data.quest_id}"},
            json={"sort_order": sort_order_value}
        )
        return {"message": "Порядок задания обновлен."}
    except Exception as e:
        logging.error(f"Ошибка обновления sort_order задания: {e}")
        raise HTTPException(status_code=500, detail="Не удалось обновить порядок задания.")
        
@app.post("/api/v1/admin/categories/create")
async def create_category(request_data: CategoryCreateRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """Создает новую категорию квестов."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    await supabase.post("/quest_categories", json={"name": request_data.name})
    return {"message": "Категория успешно создана."}

@app.post("/api/v1/admin/quests/reset-all-active")
async def reset_all_active_quests(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Сбрасывает активный квест для всех пользователей.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # --- ИЗМЕНЕНИЕ: Используем правильное имя колонки 'quest_progress' ---
        response = await supabase.patch(
            "/users",
            params={"active_quest_id": "not.is.null"},
            json={"active_quest_id": None, "quest_progress": 0}
        )
        response.raise_for_status() 
        
        return {"message": "Все активные квесты сброшены."}
    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Неизвестная ошибка Supabase.")
        logging.error(f"Ошибка Supabase при сбросе квестов: {error_details}")
        raise HTTPException(status_code=400, detail=error_details)
    except Exception as e:
        logging.error(f"Ошибка при сбросе всех активных квестов: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось сбросить активные квесты.")

@app.post("/api/v1/admin/categories/update")
async def update_category(request_data: CategoryUpdateRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """Обновляет название существующей категории."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    await supabase.patch(
        "/quest_categories",
        params={"id": f"eq.{request_data.category_id}"},
        json={"name": request_data.name}
    )
    return {"message": "Категория успешно обновлена."}

@app.post("/api/v1/admin/categories/delete")
async def delete_category(request_data: CategoryDeleteRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """Удаляет категорию, если в ней нет квестов."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    category_id_to_delete = request_data.category_id

    # 1. ЗАЩИТА: Проверяем, есть ли квесты в этой категории
    check_resp = await supabase.get(
        "/quests",
        params={"category_id": f"eq.{category_id_to_delete}", "select": "id", "limit": 1}
    )
    check_resp.raise_for_status()
    
    if check_resp.json():
        # Если ответ не пустой, значит, найден хотя бы один квест
        raise HTTPException(status_code=400, detail="Нельзя удалить категорию, в которой есть задания. Сначала переместите или удалите их.")

    # 2. Если квестов нет, удаляем категорию
    await supabase.delete(
        "/quest_categories",
        params={"id": f"eq.{category_id_to_delete}"}
    )
    
    return {"message": "Категория успешно удалена."}

@app.post("/api/v1/admin/challenges/delete")
async def delete_challenge(request_data: ChallengeAdminDeleteRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS: raise HTTPException(status_code=403, detail="Доступ запрещен")
    challenge_id = request_data.challenge_id
    await supabase.delete("/user_challenges", params={"challenge_id": f"eq.{challenge_id}"})
    await supabase.delete("/challenges", params={"id": f"eq.{challenge_id}"})
    return {"message": "Челлендж и все связанные с ним данные удалены."}

@app.post("/api/v1/admin/quests/all")
async def get_all_quests(request_data: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """
    Эндпоинт для получения списка всех заданий в админ-панели.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    # --- ИЗМЕНЕНИЕ ЗДЕСЬ ---
    # Добавляем sort_order в select. Сортировка будет на фронтенде.
    resp = await supabase.get("/quests", params={"select": "*,sort_order", "order": "id.desc"})
    # --- КОНЕЦ ИЗМЕНЕНИЯ ---

    resp.raise_for_status()
    return resp.json()
    
@app.post("/api/v1/admin/challenges/reset-cooldown")
async def reset_challenge_cooldown(
    request_data: AdminResetCooldownRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")
    
    user_id_to_reset = request_data.user_id_to_reset

    try:
        await supabase.post(
            "/rpc/admin_reset_challenge_cooldown",
            json={"p_user_id": user_id_to_reset}
        )
        return {"message": f"Кулдаун на челленджи для пользователя {user_id_to_reset} успешно сброшен."}
    except Exception as e:
        logging.error(f"Ошибка при сбросе кулдауна для {user_id_to_reset}: {e}")
        raise HTTPException(status_code=500, detail="Не удалось сбросить кулдаун.")
# --- Pydantic модели для контента страницы ивентов ---
class EventItem(BaseModel):
    id: int
    title: str
    image_url: str
    tickets_cost: int
    top_border_color: Optional[str] = None
    bg_color: Optional[str] = None
    dot_color: Optional[str] = None
    image_scale: Optional[float] = None

class EventsPageContent(BaseModel):
    mainTitle: str
    raffleEndTime: Optional[str] = None
    infoBlock1Title: str
    infoBlock1Desc: str
    infoBlock2Title: str
    infoBlock2Desc: str
    infoBlock3Title: str
    infoBlock3Desc: str
    infoBlock1Icon: Optional[str] = None
    infoBlock2Icon: Optional[str] = None
    infoBlock3Icon: Optional[str] = None
    events: List[EventItem]

class EventsPageUpdateRequest(BaseModel):
    initData: str
    content: dict  # Ожидается {"events": [...]}

@app.post("/api/v1/events/participants")
async def get_event_participants(
    request_data: EventParticipantsRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Возвращает список топ-5 участников для указанного ивента, объединяя ставки по пользователю.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")

    try:
        # Получаем все записи для данного ивента
        resp = await supabase.get(
            "/event_entries",
            params={
                "event_id": f"eq.{request_data.event_id}",
                "select": "tickets_spent, user:users(full_name, username)"
            }
        )
        resp.raise_for_status()
        all_entries = resp.json()

        # Объединяем ставки по каждому пользователю
        aggregated_participants = {}
        for entry in all_entries:
            user_data = entry.get("user", {})
            full_name = user_data.get("full_name") or user_data.get("username", "Без имени")
            tickets_spent = entry.get("tickets_spent", 0)

            if full_name not in aggregated_participants:
                aggregated_participants[full_name] = {
                    "full_name": full_name,
                    "username": user_data.get("username"),
                    "tickets_spent": 0
                }
            aggregated_participants[full_name]["tickets_spent"] += tickets_spent

        # Конвертируем словарь обратно в список и сортируем
        sorted_participants = sorted(
            list(aggregated_participants.values()),
            key=lambda x: x["tickets_spent"],
            reverse=True
        )

        # Возвращаем топ-5
        return {"participants": sorted_participants[:5]}

    except Exception as e:
        logging.error(f"Ошибка при получении участников ивента: {e}")
        raise HTTPException(status_code=500, detail="Не удалось получить список участников.")
        
@app.get("/api/v1/events/content")
async def get_events_content(supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """
    Возвращает JSON с контентом для страницы ивентов.
    """
    try:
        resp = await supabase.get(
            "/pages_content",
            params={"page_name": "eq.events", "select": "content", "limit": 1}
        )
        resp.raise_for_status()
        data = resp.json()

        # Если запись не найдена или content пустой, возвращаем пустой массив событий
        if not data or not data[0].get('content'):
            logging.info("Контент для страницы ивентов не найден, возвращается пустой массив.")
            return {"events": []}

        return data[0]['content']

    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Ошибка базы данных.")
        logging.error(f"HTTP-ошибка при получении контента страницы ивентов: {error_details}")
        raise HTTPException(status_code=500, detail="Не удалось загрузить контент страницы.")
    except Exception as e:
        logging.error(f"Критическая ошибка при получении контента страницы ивентов: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")

# --- Эндпоинты API ---
@app.post("/api/v1/events/enter")
async def enter_event(
    request_data: EventEnterRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Обрабатывает вход пользователя в ивент, списывает билеты.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")

    telegram_id = user_info["id"]
    event_id_to_enter = request_data.event_id

    # --- НАЧАЛО ИЗМЕНЕНИЯ 1: Проверка на участие в других активных ивентах ---
    try:
        # 1. Получаем список всех ивентов, чтобы найти активные
        content_resp = await supabase.get(
            "/pages_content",
            params={"page_name": "eq.events", "select": "content", "limit": 1}
        )
        content_resp.raise_for_status()
        content_data = content_resp.json()
        if not content_data:
            # Если контента нет, просто пропускаем проверку
            all_events = []
        else:
            all_events = content_data[0].get("content", {}).get("events", [])
        
        # 2. Собираем ID всех активных (не разыгранных) ивентов, КРОМЕ текущего
        active_event_ids = [
            event['id'] for event in all_events 
            if 'winner_id' not in event and event.get('id') != event_id_to_enter
        ]
        
        # 3. Проверяем, есть ли у пользователя ставки в других активных ивентах
        if active_event_ids:
            check_resp = await supabase.get(
                "/event_entries",
                params={
                    "user_id": f"eq.{telegram_id}",
                    "event_id": f"in.({','.join(map(str, active_event_ids))})",
                    "select": "event_id",
                    "limit": "1"
                }
            )
            check_resp.raise_for_status()
            
            if check_resp.json():
                raise HTTPException(
                    status_code=409, # Conflict
                    detail="Вы уже участвуете в другом активном розыгрыше. Можно участвовать только в одном ивенте одновременно."
                )
    except HTTPException as e:
        raise e # Пробрасываем нашу ошибку 409 дальше
    except Exception as e:
        logging.error(f"Ошибка при проверке участия в ивентах: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера при проверке участия.")
    # --- КОНЕЦ ИЗМЕНЕНИЯ 1 ---

    # Используем уже полученные данные об ивентах
    event_min_tickets = next((e['tickets_cost'] for e in all_events if e['id'] == request_data.event_id), 1)

    # 2. Проверяем, что ставка пользователя не меньше минимальной
    if request_data.tickets_to_spend < event_min_tickets:
        raise HTTPException(
            status_code=400,
            detail=f"Минимальная ставка для этого ивента - {event_min_tickets} билетов."
        )

    # 3. Вызываем RPC-функцию, передавая ставку пользователя
    try:
        response = await supabase.post(
            "/rpc/enter_event",
            json={
                "p_user_id": telegram_id,
                "p_event_id": request_data.event_id,
                "p_tickets_to_spend": request_data.tickets_to_spend
            }
        )
        response.raise_for_status()

        new_balance = response.json()
        return {
            "message": "Вы успешно зарегистрированы в ивенте!",
            "new_ticket_balance": new_balance
        }

    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Неизвестная ошибка базы данных.")
        raise HTTPException(status_code=400, detail=error_details)
    except Exception as e:
        logging.error(f"Критическая ошибка при входе в ивент: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")

# --- Дополнительные эндпоинты ---
@app.post("/api/v1/events/create")
async def create_event(
    request_data: EventCreateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Создает новый розыгрыш в таблице events.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")
    
    try:
        data_to_insert = {
            "title": request_data.title,
            "description": request_data.description,
            "image_url": request_data.image_url,
            "tickets_cost": request_data.tickets_cost,
            "end_date": request_data.end_date.isoformat() if request_data.end_date else None
        }
        
        response = await supabase.post(
            "/events",
            json=data_to_insert
        )
        response.raise_for_status()
        
        new_event = response.json()[0]
        return {
            "message": "Новый розыгрыш успешно создан.",
            "event_id": new_event["id"]
        }
        
    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Неизвестная ошибка базы данных.")
        raise HTTPException(status_code=400, detail=error_details)
    except Exception as e:
        logging.error(f"Критическая ошибка при создании розыгрыша: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")
        
@app.post("/api/v1/user/trade_link/save")
async def save_trade_link(
    request_data: TradeLinkUpdateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Сохраняет или обновляет трейд-ссылку пользователя."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")
    
    telegram_id = user_info["id"]
    
    await supabase.patch(
        "/users",
        params={"telegram_id": f"eq.{telegram_id}"},
        json={"trade_link": request_data.trade_link}
    )
    
    return {"message": "Трейд-ссылка успешно сохранена!"}

@app.post("/api/v1/admin/events/winners")
async def get_pending_event_prizes_grouped(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (Админ) Возвращает ОБЪЕДИНЕННЫЙ подсчет невыданных призов
    (из Розыгрышей и Аукционов) для иконки в админ-панели.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        event_prize_count = 0
        auction_prize_count = 0

        # --- 1. Считаем призы из старых РОЗЫГРЫШЕЙ (JSON) ---
        content_resp = await supabase.get(
            "/pages_content",
            params={"page_name": "eq.events", "select": "content", "limit": 1}
        )
        content_resp.raise_for_status()
        content_data = content_resp.json()

        if content_data:
            content = content_data[0].get('content', {})
            events = content.get("events", [])
            event_prize_count = sum(1 for event in events if 'winner_id' in event and not event.get('prize_sent_confirmed', False))

        # --- 2. Считаем призы из АУКЦИОНОВ (Таблица) ---
        # (Используем headers={"Prefer": "count=exact"} для подсчета)
        auctions_resp = await supabase.get(
            "/auctions",
            params={
                "prize_sent_confirmed": "eq.false",
                "winner_id": "not.is.null",
                "select": "id" # Нам нужны только ID для подсчета
            },
            headers={"Prefer": "count=exact"}
        )
        auctions_resp.raise_for_status()
        # 'content-range' -> '0-4/5' or '*/0'
        auction_prize_count = int(auctions_resp.headers.get('content-range', '0').split('/')[-1])

        # --- 3. Суммируем ---
        total_count = event_prize_count + auction_prize_count

        if total_count > 0:
            return [{
                "type": "event_prizes", # Оставляем старый тип, чтобы frontend (JS) его понял
                "title": "Розыгрыши",
                "icon_class": "fa-solid fa-trophy",
                "pending_count": total_count # Возвращаем общую сумму
            }]
        else:
            return [] # Пустой массив, если выдавать нечего

    except Exception as e:
        logging.error(f"Ошибка при группировке призов (Розыгрыши + Аукционы): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось сгруппировать призы.")
        
@app.post("/api/v1/admin/events/clear_participants")
async def clear_event_participants(
    request_data: EventClearRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Удаляет участников для старого ивента и заменяет его ID на новый,
    фактически создавая новый розыгрыш.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    old_event_id = request_data.event_id

    try:
        # 1. Получаем текущий JSON-контент страницы ивентов
        content_resp = await supabase.get("/pages_content", params={"page_name": "eq.events", "select": "content", "limit": 1})
        content_resp.raise_for_status()
        page_data = content_resp.json()
        if not page_data:
            raise HTTPException(status_code=404, detail="Контент для страницы ивентов не найден.")

        content = page_data[0]['content']
        events = content.get("events", [])

        # 2. Находим нужный ивент, генерируем новый ID и удаляем данные победителя
        event_found = False
        new_event_id = None
        for i, event in enumerate(events):
            if event.get("id") == old_event_id:
                # Генерируем новый уникальный ID
                new_event_id = int(uuid.uuid4().int / 1e27)
                
                # Создаем новый объект ивента, сохраняя ключевые поля
                new_event = {
                    "id": new_event_id,
                    "title": event.get("title", "Без названия"),
                    "image_url": event.get("image_url", ""),
                    "tickets_cost": event.get("tickets_cost", 1),
                    "description": event.get("description", "")
                }
                # Заменяем старый ивент новым в списке
                events[i] = new_event
                event_found = True
                break

        if not event_found:
            raise HTTPException(status_code=404, detail=f"Ивент с ID {old_event_id} не найден.")

        # 3. Сохраняем обновленный JSON-контент обратно в базу данных
        await supabase.patch(
            "/pages_content",
            params={"page_name": "eq.events"},
            json={"content": content}
        )
        
        # 4. Удаляем участников, связанных со СТАРЫМ ID ивента
        await supabase.delete(
            "/event_entries",
            params={"event_id": f"eq.{old_event_id}"}
        )

        return {
            "message": f"Розыгрыш сброшен. Создан новый ивент с ID {new_event_id}.",
            "new_event_id": new_event_id
        }
    except Exception as e:
        logging.error(f"Ошибка при сбросе ивента: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось сбросить розыгрыш.")

@app.post("/api/v1/admin/events/confirm_sent")
async def confirm_event_prize_sent(
    request_data: EventConfirmSentRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (Админ) Подтверждает отправку приза.
    Сначала проверяет таблицу Аукционов, затем - JSON Розыгрышей.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    prize_id = request_data.event_id

    try:
        # --- 1. Пытаемся обновить АУКЦИОН ---
        # Мы используем 'count=exact' (в supabase-py v1 это был 'count'), 
        # чтобы узнать, была ли строка обновлена.
        # В httpx это возвращается в заголовке 'content-range'
        update_resp = await supabase.patch(
            "/auctions",
            params={"id": f"eq.{prize_id}", "prize_sent_confirmed": "eq.false"},
            json={"prize_sent_confirmed": True},
            headers={"Prefer": "return=representation,count=exact"}
        )
        
        # Проверяем, удалось ли обновить строку в 'auctions'
        if update_resp.status_code == 200 and update_resp.json():
            logging.info(f"Приз (Аукцион) ID {prize_id} помечен как отправленный.")
            return {"message": "Отправка приза (Аукцион) успешно подтверждена."}

        # --- 2. Если не аукцион, пытаемся обновить РОЗЫГРЫШ (старая логика) ---
        content_resp = await supabase.get("/pages_content", params={"page_name": "eq.events", "select": "content", "limit": 1})
        content_resp.raise_for_status()
        page_data = content_resp.json()
        
        if not page_data:
            raise HTTPException(status_code=404, detail="Контент для страницы ивентов не найден.")
        
        content = page_data[0]['content']
        event_found = False
        
        for event in content.get("events", []):
            if event.get("id") == prize_id:
                if event.get('prize_sent_confirmed', False) == True:
                     raise HTTPException(status_code=400, detail="Этот приз уже был подтвержден.")
                     
                event["prize_sent_confirmed"] = True
                event_found = True
                break

        if not event_found:
             raise HTTPException(status_code=404, detail=f"Запись с ID {prize_id} не найдена ни в Аукционах, ни в Розыгрышах.")

        # Сохраняем обновленный JSON
        await supabase.patch(
            "/pages_content",
            params={"page_name": "eq.events"},
            json={"content": content}
        )
        
        logging.info(f"Приз (Розыгрыш) ID {prize_id} помечен как отправленный.")
        return {"message": "Отправка приза (Розыгрыш) успешно подтверждена."}

    except Exception as e:
        logging.error(f"Ошибка при подтверждении приза {prize_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось подтвердить приз: {str(e)}")

# --- НОВЫЙ ЭНДПОИНТ: Отмена квеста ---
@app.post("/api/v1/quests/cancel")
async def cancel_active_quest(
    request_data: QuestCancelRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")

    telegram_id = user_info["id"]

    try:
        # Вызываем RPC-функцию, которая содержит всю логику
        await supabase.post("/rpc/cancel_active_quest", json={"p_user_id": telegram_id})
        return {"message": "Задание успешно отменено."}
    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Не удалось отменить задание.")
        logging.error(f"Ошибка RPC при отмене квеста для user {telegram_id}: {error_details}")
        raise HTTPException(status_code=400, detail=error_details)
    except Exception as e:
        logging.error(f"Критическая ошибка при отмене квеста для user {telegram_id}: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")

# --- НОВЫЙ ЭНДПОИНТ: Получение бесплатного билета ---
@app.post("/api/v1/user/claim-free-ticket")
async def claim_free_ticket(
    request_data: FreeTicketClaimRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")

    telegram_id = user_info["id"]

    try:
        # 1. Забираем билет через твою SQL-функцию
        # Она проверит 24ч кулдаун и начислит +1 (или +2, если сработала логика в SQL)
        response = await supabase.post("/rpc/claim_daily_ticket", json={"p_user_id": telegram_id})
        response.raise_for_status()
        
        # 🔥 ИСПРАВЛЕНИЕ ОШИБКИ ТИПОВ 🔥
        # Твой SQL возвращает JSON: {"new_ticket_balance": 123}
        rpc_data = response.json()
        
        # Достаем число из словаря. Если вдруг вернется просто число — обработаем и это.
        if isinstance(rpc_data, dict):
            base_balance = rpc_data.get("new_ticket_balance", 0)
        else:
            base_balance = int(rpc_data) # На случай, если SQL изменится

        # 2. Теперь проверяем Twitch-статус для ДОПОЛНИТЕЛЬНОГО бонуса
        # (Параллельно грузим статус и настройки)
        user_task = supabase.get("/users", params={"telegram_id": f"eq.{telegram_id}", "select": "twitch_status"})
        settings_task = get_grind_settings_async_global()
        
        user_resp, grind_settings = await asyncio.gather(user_task, settings_task)
        
        twitch_bonus = 0
        twitch_status = "none"
        
        if user_resp.status_code == 200 and user_resp.json():
            twitch_status = user_resp.json()[0].get("twitch_status", "none")
            
        # 3. Начисляем бонус за Twitch (VIP/Sub)
        if twitch_status in ['subscriber', 'vip']:
            twitch_bonus = grind_settings.twitch_status_free_tickets # Обычно 5
            
            if twitch_bonus > 0:
                logging.info(f"💎 [FreeTicket] User {telegram_id} is {twitch_status}! Adding bonus +{twitch_bonus} tickets.")
                await supabase.post("/rpc/increment_tickets", json={"p_user_id": telegram_id, "p_amount": twitch_bonus})

        # 4. Итоговый баланс
        # (Баланс из SQL + Наш бонус сверху)
        final_balance = base_balance + twitch_bonus

        msg = "✅ Бесплатный билет получен!"
        if twitch_bonus > 0:
            msg += f"\n🎁 Бонус за статус ({twitch_status}): +{twitch_bonus} шт."

        return {
            "message": msg,
            "new_ticket_balance": final_balance
        }

    except httpx.HTTPStatusError as e:
        # Если SQL вернул ошибку (например, COOLDOWN)
        error_details = e.response.json().get("message", "Не удалось получить билет.")
        logging.warning(f"Ошибка получения билета {telegram_id}: {error_details}")
        raise HTTPException(status_code=400, detail=error_details)
        
    except Exception as e:
        logging.error(f"Критическая ошибка при получении билета для user {telegram_id}: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")
        
@app.get("/api/v1/checkpoint/content")
async def get_checkpoint_content(supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """Отдает JSON с контентом для страницы 'Чекпоинт'."""
    try:
        resp = await supabase.get(
            "/pages_content",
            params={"page_name": "eq.checkpoint", "select": "content", "limit": 1}
        )
        resp.raise_for_status()
        data = resp.json()
        if not data or 'rewards' not in data[0].get('content', {}):
            # Возвращаем пустую структуру по умолчанию, если в базе ничего нет
            return {"rewards": []}
        return data[0]['content']
    except Exception as e:
        logging.error(f"Ошибка при получении контента Чекпоинта: {e}")
        raise HTTPException(status_code=500, detail="Не удалось загрузить контент страницы.")

@app.post("/api/v1/admin/checkpoint/update")
async def update_checkpoint_content(
    request_data: CheckpointUpdateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Обновляет контент страницы 'Чекпоинт' (только для админов)."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # Используем PATCH для обновления конкретной записи, где page_name = 'checkpoint'
        await supabase.patch(
            "/pages_content",
            params={"page_name": "eq.checkpoint"},
            json={"content": request_data.content.dict()}
        )
        return {"message": "Контент марафона успешно обновлен."}
    except Exception as e:
        logging.error(f"Ошибка при обновлении контента Чекпоинта: {e}")
        raise HTTPException(status_code=500, detail="Не удалось сохранить контент страницы.")
        
@app.post("/api/v1/checkpoint/claim")
async def claim_checkpoint_reward(
    request_data: CheckpointClaimRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Handles a user's claim for a checkpoint reward.
    FINAL FIX v2: Adds notification logic after confirming manual reward creation.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info:
        raise HTTPException(status_code=401, detail="Invalid authentication data.")

    telegram_id = user_info["id"]
    level_to_claim = request_data.level
    user_full_name = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip() or user_info.get("username", "No name")

    try:
        # 1. Get reward details
        content_resp = await supabase.get("/pages_content", params={"page_name": "eq.checkpoint", "select": "content", "limit": 1})
        content_resp.raise_for_status()
        content_data = content_resp.json()
        reward_details = None
        if content_data:
            rewards = content_data[0].get('content', {}).get('rewards', [])
            for r in rewards:
                if r.get('level') == level_to_claim:
                    reward_details = r
                    break
        
        if not reward_details:
             raise HTTPException(status_code=404, detail="Reward for this level not found.")

        # 2. Call RPC to deduct stars
        response = await supabase.post(
            "/rpc/claim_checkpoint_reward",
            json={"p_user_id": telegram_id, "p_level_to_claim": level_to_claim}
        )
        response.raise_for_status()
        new_level = response.json()

        # 3. If it's a skin, create a manual reward request AND NOTIFY
        if reward_details.get('type') == 'cs2_skin':
            logging.info(f"Reward type 'cs2_skin' for level {level_to_claim}. Creating request.")
            
            try:
                # Formulate the JSON strictly according to the table schema
                payload = {
                    "user_id": telegram_id,
                    "status": "pending",
                    "reward_details": reward_details.get('value', 'CS2 Skin not specified'),
                    "source_description": f"Чекпоинт (Уровень {reward_details.get('level')}): {reward_details.get('title', 'No title')}"
                }

                # Create the record in manual_rewards
                # --- START OF FINAL FIX ---
                manual_reward_resp = await supabase.post("/manual_rewards", json=payload, headers={"Prefer": "return=representation"})
                manual_reward_resp.raise_for_status() # This will raise an error if creation fails
                
                # If creation is successful, THEN update counter and notify
                await supabase.post(
                    "/rpc/update_checkpoint_reward_quantity",
                    json={ "p_level_to_update": level_to_claim, "p_claimer_name": user_full_name }
                )

                if ADMIN_NOTIFY_CHAT_ID:
                    await safe_send_message(
                        ADMIN_NOTIFY_CHAT_ID,
                        f"🔔 <b>Заявка на скин из Чекпоинта!</b>\n\n"
                        f"<b>Пользователь:</b> {user_full_name} (ID: <code>{telegram_id}</code>)\n"
                        f"<b>Награда:</b> {reward_details.get('value', 'Не указан')}\n\n"
                        f"Заявка ждет подтверждения в админ-панели."
                    )
                # --- END OF FINAL FIX ---

            except Exception as e_manual:
                logging.error(f"Critical error creating manual reward: {e_manual}", exc_info=True)
                # OPTIONAL: Here you could try to refund the stars to the user
                raise HTTPException(status_code=500, detail="Could not create reward request. Contact an administrator.")

        # 4. Return a success response
        return {"message": "Reward claimed successfully!", "new_level": new_level}

    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Could not claim reward.")
        raise HTTPException(status_code=400, detail=error_details)
    except Exception as e:
        logging.error(f"Critical error in /api/v1/checkpoint/claim: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error.")

@app.get("/api/v1/checkpoint/info")
async def get_checkpoint_info(supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """Отдает JSON с контентом для инфо-модалки 'Чекпоинт'."""
    try:
        # Мы ищем запись, где page_name == 'checkpoint_info'
        resp = await supabase.get(
            "/pages_content",
            params={"page_name": "eq.checkpoint_info", "select": "content", "limit": 1}
        )
        resp.raise_for_status()
        data = resp.json()
        
        # Фронтенд (checkpoint.html) ожидает получить объект {"content": "..."}
        if not data or not data[0].get('content'):
            return {"content": ""} # Возвращаем пустой объект, если в базе ничего нет
        
        # Возвращаем {"content": "..."} из базы
        return data[0]['content']
        
    except Exception as e:
        logging.error(f"Ошибка при получении checkpoint/info: {e}")
        raise HTTPException(status_code=500, detail="Не удалось загрузить информацию.")

@app.post("/api/v1/admin/checkpoint/info/update")
async def update_checkpoint_info(
    request_data: CheckpointInfoUpdateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Обновляет HTML-контент для инфо-модалки 'Чекпоинт'."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")
    
    try:
        # Фронтенд присылает HTML-строку. Мы заворачиваем ее в объект,
        # чтобы GET-эндпоинт мог ее правильно прочитать.
        content_to_save = {"content": request_data.content}
        
        # Используем upsert: обновляем запись 'checkpoint_info' или создаем ее,
        # если она еще не существует.
        await supabase.post(
            "/pages_content",
            json={"page_name": "checkpoint_info", "content": content_to_save},
            headers={"Prefer": "resolution=merge-duplicates"} # 'merge-duplicates' = ON CONFLICT DO UPDATE
        )
        return {"message": "Информация успешно обновлена."}
    except Exception as e:
        logging.error(f"Ошибка при обновлении checkpoint/info: {e}")
        raise HTTPException(status_code=500, detail="Не удалось сохранить информацию.")

@app.post("/api/v1/admin/settings")
async def get_admin_settings(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (v3) Получает ВСЕ настройки: 
    1. Общие (admin_controls)
    2. Недельного забега (weekly_run_settings)
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    # --- 🔽 НОВЫЙ КОД (v3) 🔽 ---
    try:
        # 1. Запрашиваем ОБЕ настройки одновременно
        admin_controls_resp = await supabase.get("/settings", params={"key": "eq.admin_controls", "select": "value"})
        weekly_run_resp = await supabase.get("/weekly_run_settings", params={"id": "eq.1", "select": "*"})
        
        admin_controls_resp.raise_for_status()
        weekly_run_resp.raise_for_status()
        
        admin_data = admin_controls_resp.json()
        weekly_data = weekly_run_resp.json()

        # 2. Парсим 'admin_controls' (старая логика)
        if not admin_data or not admin_data[0].get('value'):
            loaded_settings = AdminSettings() # Дефолтные
        else:
            settings_data = admin_data[0]['value']
            
            # (Логика парсинга boolean-значений)
            quest_rewards_raw = settings_data.get('quest_promocodes_enabled', False)
            quest_rewards_bool = quest_rewards_raw if isinstance(quest_rewards_raw, bool) else str(quest_rewards_raw).lower() == 'true'

            challenge_rewards_raw = settings_data.get('challenge_promocodes_enabled', True)
            challenge_rewards_bool = challenge_rewards_raw if isinstance(challenge_rewards_raw, bool) else str(challenge_rewards_raw).lower() == 'true'

            challenges_raw = settings_data.get('challenges_enabled', True)
            challenges_bool = challenges_raw if isinstance(challenges_raw, bool) else str(challenges_raw).lower() == 'true'

            quests_raw = settings_data.get('quests_enabled', True)
            quests_bool = quests_raw if isinstance(quests_raw, bool) else str(quests_raw).lower() == 'true'

            checkpoint_raw = settings_data.get('checkpoint_enabled', False)
            checkpoint_bool = checkpoint_raw if isinstance(checkpoint_raw, bool) else str(checkpoint_raw).lower() == 'true'

            loaded_settings = AdminSettings(
                skin_race_enabled=settings_data.get('skin_race_enabled', True),
                slider_order=settings_data.get('slider_order', ["skin_race", "cauldron", "auction"]),
                challenge_promocodes_enabled=challenge_rewards_bool,
                quest_promocodes_enabled=quest_rewards_bool,
                challenges_enabled=challenges_bool,
                quests_enabled=quests_bool,
                checkpoint_enabled=checkpoint_bool,
                menu_banner_url=settings_data.get('menu_banner_url', "https://i.postimg.cc/1Xkj2RRY/sagluska-1200h600.png"),
                checkpoint_banner_url=settings_data.get('checkpoint_banner_url', "https://i.postimg.cc/9046s7W0/cekpoint.png"),
                auction_enabled=settings_data.get('auction_enabled', False),
                auction_banner_url=settings_data.get('auction_banner_url', "https://i.postimg.cc/6qpWq0dW/aukcion.png"),
                weekly_goals_banner_url=settings_data.get('weekly_goals_banner_url', "https://i.postimg.cc/T1j6hQGP/1200-324.png"),
                weekly_goals_enabled=settings_data.get('weekly_goals_enabled', False),
                
                # --- 🔽 ВОТ ЭТИ СТРОКИ БЫЛИ ПРОПУЩЕНЫ В ЭТОЙ ФУНКЦИИ 🔽 ---
                quest_schedule_override_enabled=settings_data.get('quest_schedule_override_enabled', False),
                quest_schedule_active_type=settings_data.get('quest_schedule_active_type', 'twitch'),
                p2p_admin_trade_link=settings_data.get('p2p_admin_trade_link', '')
                # --- 🔼 ТЕПЕРЬ ОНИ ТУТ ЕСТЬ 🔼 ---
            )
        
        # 3. Парсим 'weekly_run_settings'
        if not weekly_data:
            # Если в базе нет строки (id=1), возвращаем дефолт
            weekly_run_settings = WeeklyRunSettings(week_id="").dict()
        else:
            weekly_run_settings = weekly_data[0] # Берем первую строку

        # 4. Объединяем и возвращаем
        # Превращаем Pydantic модель в словарь
        final_settings = loaded_settings.dict()
        # Добавляем настройки "Забега" в отдельное поле
        final_settings['weekly_run_settings'] = weekly_run_settings
        
        return final_settings

    except Exception as e:
        logging.error(f"Ошибка в get_admin_settings (v3): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить настройки админки.")
    # --- 🔼 КОНЕЦ НОВОГО КОДА (v3) 🔼 ---

@app.post("/api/v1/admin/settings/update")
async def update_admin_settings(
    request_data: AdminSettingsUpdateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Обновляет настройки админ-панели."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    await supabase.post(
        "/settings",
        json={"key": "admin_controls", "value": request_data.settings.dict()},
        headers={"Prefer": "resolution=merge-duplicates"}
    )

    # --- 🔽 ДОБАВЬ ЭТИ ДВЕ СТРОКИ 🔽 ---
    # Сбрасываем кэш, чтобы настройки применились мгновенно
    admin_settings_cache["settings"] = None
    admin_settings_cache["last_checked"] = 0
    # --- 🔼 КОНЕЦ ДОБАВЛЕНИЯ 🔼 ---

    return {"message": "Настройки успешно сохранены."}

@app.post("/api/v1/admin/weekly_goals/settings/update")
async def update_weekly_run_settings(
    request_data: WeeklyRunSettingsUpdateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ v3) Обновляет настройки "Недельного Забега" (суперприз, week_id)"""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # Обновляем строку, где id = 1
        await supabase.patch(
            "/weekly_run_settings",
            params={"id": "eq.1"},
            json=request_data.settings.dict()
        )
        return {"message": "Настройки забега сохранены."}
    except Exception as e:
        logging.error(f"Ошибка в update_weekly_run_settings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось сохранить настройки забега.")


@app.get("/api/v1/admin/weekly_goals/list")
async def get_weekly_goals_list(
    request: Request, # Используем GET, initData не нужен для чтения
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ v3) Получает список всех созданных задач (weekly_goals)"""
    # Тут можно добавить проверку админа, если нужно, но для списка это некритично
    
    try:
        resp = await supabase.get(
            "/weekly_goals",
            params={"select": "*", "order": "sort_order.asc"}
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logging.error(f"Ошибка в get_weekly_goals_list: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить список задач.")


@app.post("/api/v1/admin/weekly_goals/create")
async def create_weekly_goal(
    request_data: WeeklyGoalCreateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ v3) Создает новую задачу в "Недельном Забеге" """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # Pydantic v3: `target_entity_id` и `target_entity_name` уже в модели
        goal_data = request_data.dict(exclude={'initData'})
        
        await supabase.post("/weekly_goals", json=goal_data)
        return {"message": "Задача создана."}
    except Exception as e:
        logging.error(f"Ошибка в create_weekly_goal: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось создать задачу.")


@app.post("/api/v1/admin/weekly_goals/update")
async def update_weekly_goal(
    request_data: WeeklyGoalUpdateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ v3) Обновляет существующую задачу в "Недельном Забеге" """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        goal_id = request_data.goal_id
        # Pydantic v3: `target_entity_id` и `target_entity_name` уже в модели
        goal_data = request_data.dict(exclude={'initData', 'goal_id'})
        
        await supabase.patch(
            "/weekly_goals",
            params={"id": f"eq.{goal_id}"},
            json=goal_data
        )
        return {"message": "Задача обновлена."}
    except Exception as e:
        logging.error(f"Ошибка в update_weekly_goal: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось обновить задачу.")


@app.post("/api/v1/admin/weekly_goals/delete")
async def delete_weekly_goal(
    request_data: WeeklyGoalDeleteRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ v3) Удаляет задачу (ON DELETE CASCADE удалит прогресс)"""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        await supabase.delete(
            "/weekly_goals",
            params={"id": f"eq.{request_data.goal_id}"}
        )
        return {"message": "Задача удалена."}
    except Exception as e:
        logging.error(f"Ошибка в delete_weekly_goal: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось удалить задачу.")

# --- 🔽🔽🔽 ВОТ СЮДА ВСТАВЬ НОВЫЙ ЭНДПОИНТ 🔽🔽🔽 ---
@app.post("/api/v1/admin/weekly_goals/clear_all_progress")
async def clear_all_weekly_progress(
    request_data: InitDataRequest, # Используем существующую модель
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (Админ) ВНИМАНИЕ:
    1. Переносит все АКТИВНЫЕ задачи (is_active=true) на ID недели из настроек.
    2. Удаляет ВЕСЬ прогресс "Забега" для ВСЕХ пользователей.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # --- НОВЫЙ БЛОК: ШАГ 1 ---
        # Получаем ID недели, который админ сохранил в настройках
        logging.info("Шаг 1: Получение нового ID недели из 'weekly_run_settings'...")
        settings_resp = await supabase.get(
            "/weekly_run_settings",
            params={"id": "eq.1", "select": "week_id"}
        )
        settings_resp.raise_for_status()
        settings_data = settings_resp.json()
        
        if not settings_data or not settings_data[0].get("week_id"):
            logging.error("Не удалось получить 'week_id' из 'weekly_run_settings'. ID недели не установлен в настройках.")
            raise HTTPException(status_code=400, detail="Ошибка: Сначала сгенерируйте и сохраните новый 'ID Текущей Недели' в настройках.")
        
        new_week_id = settings_data[0]["week_id"]
        logging.info(f"Шаг 1: Успех. Новый ID недели: {new_week_id}")
        
        # --- НОВЫЙ БЛОК: ШАГ 2 ---
        # Обновляем ВСЕ задачи, присваивая им новый ID недели
        logging.info(f"Шаг 2: Обновление 'week_id' на '{new_week_id}' для ВСЕХ задач в 'weekly_goals'...")
        update_resp = await supabase.patch(
            "/weekly_goals",
            params={"id": "not.is.null"},   # Находим ВСЕ задачи (ID не пустой)
            json={"week_id": new_week_id}   # Устанавливаем им новый ID
        )
        update_resp.raise_for_status()
        logging.info("Шаг 2: Успех. Активные задачи перенесены на новую неделю.")

        # --- СТАРЫЙ БЛОК: ШАГ 3 (Без изменений) ---
        # Удаляем ВЕСЬ старый прогресс
        logging.info("Шаг 3: Выполняем прямой DELETE запрос к 'user_weekly_progress' (сброс)...")
        delete_resp = await supabase.delete(
            "/user_weekly_progress",
            params={"user_id": "gt.0"} # Удаляем все строки
        )
        delete_resp.raise_for_status()
        logging.info("Шаг 3: Успех. Весь старый прогресс 'Забега' сброшен.")
        
        return {"message": f"Успешно! Все активные задачи перенесены на неделю '{new_week_id}' и весь старый прогресс сброшен."}
    
    except Exception as e:
        # Логируем ошибку, но также смотрим, не пришла ли она от Supabase
        error_detail = str(e)
        if isinstance(e, httpx.HTTPStatusError):
            try:
                error_detail = e.response.json().get("message", str(e))
            except:
                pass # Оставляем str(e)
                
        logging.error(f"Ошибка в clear_all_weekly_progress: {error_detail}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось очистить прогресс: {error_detail}")
# --- 🔼🔼🔼 КОНЕЦ НОВОГО ЭНДПОИНТА 🔼🔼🔼

# --- 🔽🔽🔽 ВСТАВЬТЕ НОВЫЙ ЭНДПОИНТ СЮДА 🔽🔽🔽 ---
class AdminClearUserWeeklyProgressRequest(BaseModel):
    initData: str
    user_id_to_clear: int

@app.post("/api/v1/admin/weekly_goals/clear_user_progress")
async def clear_user_weekly_progress(
    request_data: AdminClearUserWeeklyProgressRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Удаляет ВЕСЬ прогресс "Забега" для ОДНОГО пользователя."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    user_id_to_clear = request_data.user_id_to_clear

    try:
        # --- ИЗМЕНЕНИЕ: ВЫПОЛНЯЕМ ЗАПРОС НАПРЯМУЮ, В ОБХОД RPC ---
        logging.info(f"Выполняем прямой DELETE запрос к 'user_weekly_progress' для user_id {user_id_to_clear}...")
        response = await supabase.delete(
            "/user_weekly_progress",
            params={"user_id": f"eq.{user_id_to_clear}"} # Удаляем строки только для этого user_id
        )
        # --- КОНЕЦ ИЗМЕНЕНИЯ ---

        response.raise_for_status()
        return {"message": f"Прогресс 'Забега' для пользователя {user_id_to_clear} был успешно сброшен."}
    except Exception as e:
        logging.error(f"Ошибка в clear_user_weekly_progress (user: {user_id_to_clear}): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось очистить прогресс пользователя.")
# --- 🔼🔼🔼 КОНЕЦ НОВОГО ЭНДПОИНТА 🔼🔼🔼 ---

@app.post("/api/v1/admin/users/grant-checkpoint-stars")
async def grant_checkpoint_stars_to_user(
    request_data: AdminGrantCheckpointStarsRequest,
    background_tasks: BackgroundTasks, # <-- Добавили BackgroundTasks
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Вручную выдает звезды для Чекпоинта, логирует действие и уведомляет пользователя."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    admin_id = user_info["id"]
    user_id_to_grant = request_data.user_id_to_grant
    amount = request_data.amount

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Количество звезд должно быть положительным.")

    try:
        # 1. Получаем имена админа и пользователя
        # (Мы можем сделать это одним запросом, но для ясности разделим)
        admin_name_resp = await supabase.get("/users", params={"telegram_id": f"eq.{admin_id}", "select": "full_name"})
        user_name_resp = await supabase.get("/users", params={"telegram_id": f"eq.{user_id_to_grant}", "select": "full_name"})
        
        admin_name = admin_name_resp.json()[0]['full_name'] if admin_name_resp.json() else "Админ"
        user_name = user_name_resp.json()[0]['full_name'] if user_name_resp.json() else "Пользователь"

        # 2. Вызываем RPC функцию
        await supabase.post(
            "/rpc/increment_checkpoint_stars",
            json={"p_user_id": user_id_to_grant, "p_amount": amount}
        )
        
        # 3. Пишем лог в новую таблицу
        await supabase.post(
            "/manual_grants",
            json={
                "admin_id": admin_id,
                "user_id": user_id_to_grant,
                "grant_type": "checkpoint_stars",
                "amount": amount,
                "admin_name": admin_name,
                "user_name": user_name
            }
        )

        # 4. Отправляем уведомление пользователю в фоне
        notification_text = (
            f"🔋 Вам начислено <b>{amount} процентов</b> Чекпоинта!\n\n"
            f"Награда выдана администратором и уже доступна на вашем балансе в профиле."
        )
        background_tasks.add_task(safe_send_message, user_id_to_grant, notification_text)

        return {"message": f"{amount} звезд Чекпоинта успешно выдано пользователю {user_name}."}
    except Exception as e:
        logging.error(f"Ошибка при выдаче звезд Чекпоинта: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось выдать процент Чекпоинта.")


# --- ИСПРАВЛЕННАЯ ФУНКЦИЯ ЗАМОРОЗКИ ЗВЕЗД ЧЕКПОИНТА ---
@app.post("/api/v1/admin/users/freeze-checkpoint-stars")
async def freeze_checkpoint_stars(
    request_data: AdminFreezeCheckpointStarsRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Замораживает звезды Чекпоинта пользователя на указанное количество дней."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    # --- ИСПРАВЛЕНИЕ ЗДЕСЬ ---
    user_id_to_freeze = request_data.user_id # Получаем user_id из request_data
    # --- КОНЕЦ ИСПРАВЛЕНИЯ ---
    days = request_data.days

    if days < 0:
        raise HTTPException(status_code=400, detail="Количество дней не может быть отрицательным.")

    try:
        freeze_until_date = None
        # Если дни > 0, считаем дату окончания заморозки
        if days > 0:
            freeze_until_date = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()

        # Обновляем новое поле в базе данных
        await supabase.patch(
            "/users",
            params={"telegram_id": f"eq.{user_id_to_freeze}"},
            json={"checkpoint_stars_frozen_until": freeze_until_date}
        )

        message = f"Звезды Чекпоинта для пользователя {user_id_to_freeze} заморожены на {days} дней." if days > 0 else f"Заморозка звезд Чекпоинта для пользователя {user_id_to_freeze} снята."
        return {"message": message}
    except Exception as e:
        logging.error(f"Ошибка при заморозке звезд Чекпоинта для {user_id_to_freeze}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось выполнить заморозку звезд Чекпоинта.")


# --- ИСПРАВЛЕННАЯ ФУНКЦИЯ ЗАМОРОЗКИ БИЛЕТОВ (ЗВЕЗД) ---
@app.post("/api/v1/admin/users/freeze-stars")
async def freeze_user_stars(
    request_data: AdminFreezeStarsRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Замораживает звезды (билеты) пользователя на указанное количество дней."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    # --- ИСПРАВЛЕНИЕ ЗДЕСЬ ---
    user_id_to_freeze = request_data.user_id # Получаем user_id из request_data
    # --- КОНЕЦ ИСПРАВЛЕНИЯ ---
    days = request_data.days

    if days < 0:
        raise HTTPException(status_code=400, detail="Количество дней не может быть отрицательным.")

    try:
        # Это предполагает, что у вас есть колонка `stars_frozen_until` типа 'timestamptz' в таблице 'users'.
        freeze_until_date = None
        if days > 0:
            freeze_until_date = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()

        await supabase.patch(
            "/users",
            params={"telegram_id": f"eq.{user_id_to_freeze}"},
            json={"stars_frozen_until": freeze_until_date} # Убедитесь, что колонка называется именно так
        )

        message = f"Билеты пользователя {user_id_to_freeze} заморожены на {days} дней." if days > 0 else f"Заморозка билетов для пользователя {user_id_to_freeze} снята."
        return {"message": message}
    except Exception as e:
        logging.error(f"Ошибка при заморозке билетов для {user_id_to_freeze}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось выполнить заморозку билетов.")

@app.post("/api/v1/admin/users/grant-stars")
async def grant_stars_to_user(
    request_data: AdminGrantStarsRequest,
    background_tasks: BackgroundTasks, # <-- Добавили BackgroundTasks
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Вручную выдает билеты, логирует действие и уведомляет пользователя."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    admin_id = user_info["id"]
    user_id_to_grant = request_data.user_id_to_grant
    amount = request_data.amount

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Количество звезд должно быть положительным.")

    try:
        # 1. Получаем имена
        admin_name_resp = await supabase.get("/users", params={"telegram_id": f"eq.{admin_id}", "select": "full_name"})
        user_name_resp = await supabase.get("/users", params={"telegram_id": f"eq.{user_id_to_grant}", "select": "full_name"})
        
        admin_name = admin_name_resp.json()[0]['full_name'] if admin_name_resp.json() else "Админ"
        user_name = user_name_resp.json()[0]['full_name'] if user_name_resp.json() else "Пользователь"

        # 2. Вызываем RPC
        await supabase.post(
            "/rpc/increment_tickets",
            json={"p_user_id": user_id_to_grant, "p_amount": amount}
        )

        # 3. Пишем лог
        await supabase.post(
            "/manual_grants",
            json={
                "admin_id": admin_id,
                "user_id": user_id_to_grant,
                "grant_type": "tickets",
                "amount": amount,
                "admin_name": admin_name,
                "user_name": user_name
            }
        )

        # 4. Отправляем уведомление
        notification_text = (
            f"🎟️ Вам начислено <b>{amount} билетов</b>!\n\n"
            f"Награда выдана администратором и уже доступна на вашем балансе."
        )
        background_tasks.add_task(safe_send_message, user_id_to_grant, notification_text)

        return {"message": f"{amount} билетов успешно выдано пользователю {user_name}."}
    except Exception as e:
        logging.error(f"Ошибка при выдаче звезд пользователю {user_id_to_grant}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось выдать билеты.")

@app.get("/api/v1/content/menu")
async def get_menu_content(request: Request, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    
    defaults = {
        "menu_banner_url": "https://i.postimg.cc/1Xkj2RRY/sagluska-1200h600.png",
        "checkpoint_banner_url": "https://i.postimg.cc/9046s7W0/cekpoint.png",
        "auction_banner_url": "https://i.postimg.cc/6qpWq0dW/aukcion.png",
        "weekly_goals_banner_url": "https://i.postimg.cc/T1j6hQGP/1200-324.png",
        "skin_race_enabled": True,
        "slider_order": ["skin_race", "cauldron", "auction", "checkpoint"],
        "auction_enabled": False, 
        "auction_slide_data": None,
        "checkpoint_enabled": False,
        "weekly_goals_enabled": False,
        "quest_schedule_override_enabled": False,
        "quest_schedule_active_type": "twitch"
    }
    
    is_admin = False
    
    # 1. Быстрая проверка админа (синхронно)
    try:
        init_data_header = request.headers.get("X-Init-Data")
        if init_data_header:
            user_info = is_valid_init_data(init_data_header, ALL_VALID_TOKENS)
            if user_info and user_info.get("id") in ADMIN_IDS:
                is_admin = True
    except Exception:
        pass

    try:
        # --- 2. ПОДГОТОВКА И ЗАПУСК ПАРАЛЛЕЛЬНЫХ ЗАПРОСОВ ---
        
        # A. Настройки аукциона (должны быть выполнены в отдельном запросе)
        auction_params = {
            "select": "id,title,image_url",
            "order": "created_at.desc",
            "limit": 1
        }
        if not is_admin:
            auction_params["is_active"] = "eq.true"
            auction_params["is_visible"] = "eq.true"
            
        # Запускаем две асинхронные задачи ПАРАЛЛЕЛЬНО:
        # 1. Получение настроек (с использованием кэша!)
        settings_task = get_admin_settings_async_global()
        # 2. Получение данных аукциона (безусловно, для скорости)
        auction_task = supabase.get("auctions", params=auction_params)

        # Ждем завершения обеих задач
        admin_settings_pydantic, auction_resp = await asyncio.gather(settings_task, auction_task)

        # --- 3. ОБРАБОТКА РЕЗУЛЬТАТОВ ---
        
        # A. Настройки (из Pydantic модели)
        settings = admin_settings_pydantic.dict() if admin_settings_pydantic else defaults
        
        # B. Данные аукциона
        auction_resp.raise_for_status() # Проверяем, что запрос аукциона успешен
        auction_data = auction_resp.json()
        auction_slide_data = auction_data[0] if auction_data else None

        # C. Логика формирования slider_order (Ваш существующий код)
        loaded_order = settings.get("slider_order", defaults["slider_order"])
        all_known_slides = ["skin_race", "cauldron", "auction", "checkpoint", "weekly_goals"]
        existing_slides_set = set(loaded_order)
        for slide in all_known_slides:
            if slide not in existing_slides_set:
                loaded_order.append(slide)

        auction_enabled = settings.get("auction_enabled", defaults["auction_enabled"])

        # --- 4. ВОЗВРАТ РЕЗУЛЬТАТА ---
        return {
            "menu_banner_url": settings.get("menu_banner_url", defaults["menu_banner_url"]),
            "checkpoint_banner_url": settings.get("checkpoint_banner_url", defaults["checkpoint_banner_url"]),
            "auction_banner_url": settings.get("auction_banner_url", defaults["auction_banner_url"]),
            "weekly_goals_banner_url": settings.get("weekly_goals_banner_url", defaults["weekly_goals_banner_url"]),
            "skin_race_enabled": settings.get("skin_race_enabled", defaults["skin_race_enabled"]),
            "slider_order": loaded_order,
            "auction_enabled": auction_enabled,
            "checkpoint_enabled": settings.get("checkpoint_enabled", defaults["checkpoint_enabled"]),
            "weekly_goals_enabled": settings.get("weekly_goals_enabled", defaults["weekly_goals_enabled"]),
            "quest_schedule_override_enabled": settings.get("quest_schedule_override_enabled", defaults["quest_schedule_override_enabled"]),
            "quest_schedule_active_type": settings.get("quest_schedule_active_type", defaults["quest_schedule_active_type"]),
            "auction_slide_data": auction_slide_data
        }

    except Exception as e:
        # Логируем ошибку, если она произошла
        logging.error(f"[content/menu] Error: {e}", exc_info=True)
        # И возвращаем дефолтные значения, чтобы меню не сломалось
        return defaults

@app.post("/api/v1/user/weekly_goals")
async def get_user_weekly_goals(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (ПОЛЬЗОВАТЕЛЬ) Возвращает список недельных задач, прогресс
    и статус главного приза. (v2: Добавлен обход для админа)
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Доступ запрещен.")
    
    telegram_id = user_info["id"]

    # --- 🔽 НОВЫЙ КОД: ПРОВЕРКА АДМИНА 🔽 ---
    is_admin = telegram_id in ADMIN_IDS
    # --- 🔼 КОНЕЦ НОВОГО КОДА 🔼 ---

    try:
        # 1. Проверяем, включена ли система
        admin_settings = await get_admin_settings_async_global() # <-- ИЗМЕНЕНИЕ ЗДЕСЬ
        
        # --- 🔽 ИЗМЕНЕННАЯ ЛОГИКА 🔽 ---
        # Прячем, только если (система выключена И пользователь НЕ админ)
        if not admin_settings.weekly_goals_enabled and not is_admin:
            return {"system_enabled": False, "goals": []} # <-- Теперь это SOFT STOP
        # --- 🔼 КОНЕЦ ИЗМЕНЕНИЯ 🔼 ---

        # 2. Вызываем RPC-функцию, которая соберет все данные
        response = await supabase.post(
            "/rpc/get_user_weekly_goals_status",
            json={"p_user_id": telegram_id}
        )
        response.raise_for_status()
        
        # RPC вернет готовый JSON (он может быть пуст, если week_id не совпали)
        data = response.json()
        
        # (v3) Передаем в data, включена ли система
        # (Клиентский код `menu (2).js` уже умеет это обрабатывать)
        data["system_enabled"] = admin_settings.weekly_goals_enabled
        return data

    except Exception as e:
        logging.error(f"Ошибка в get_user_weekly_goals: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить недельные задачи.")


# (Найди эту функцию в index (1).py и ЗАМЕНИ ее)
@app.post("/api/v1/user/weekly_goals/claim_task")
async def claim_weekly_task_reward(
    request_data: WeeklyGoalClaimTaskRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (ПОЛЬЗОВАТЕЛЬ) Забирает опциональную награду за 1 выполненную задачу.
    (ВЕРСИЯ С ЛОГАМИ)
    """
    logging.info("--- [claim_weekly_task_reward] ЗАПУСК ---")
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    
    if not user_info or "id" not in user_info:
        logging.error("--- [claim_weekly_task_reward] ОШИБКА: user_info не прошел проверку.")
        raise HTTPException(status_code=401, detail="Доступ запрещен.")

    # --- 🔽🔽🔽 НОВЫЕ ЛОГИ 🔽🔽🔽 ---
    user_id_val = user_info["id"]
    goal_id_val = request_data.goal_id
    
    logging.info(f"--- [claim_weekly_task_reward] User ID: {user_id_val} (Тип: {type(user_id_val)})")
    logging.info(f"--- [claim_weekly_task_reward] Goal ID: {goal_id_val} (Тип: {type(goal_id_val)})")
    
    if not user_id_val or user_id_val == "":
        logging.critical("--- [claim_weekly_task_reward] КРИТИЧЕСКАЯ ОШИБКА: user_id_val ПУСТОЙ! ('') ---")
        raise HTTPException(status_code=400, detail="Ошибка ID пользователя: получен пустой ID.")
    # --- 🔼🔼🔼 КОНЕЦ НОВЫХ ЛОГОВ 🔼🔼🔼 ---

    try:
        response = await supabase.post(
            "/rpc/claim_weekly_goal_task_reward",
            json={
                "p_user_id": user_id_val,
                "p_goal_id": goal_id_val
            }
        )
        response.raise_for_status()
        
        logging.info("--- [claim_weekly_task_reward] УСПЕХ: RPC выполнена. ---")
        return response.json()

    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Не удалось забрать награду.")
        # --- 🔽🔽🔽 НОВЫЙ ЛОГ 🔽🔽🔽 ---
        logging.error(f"--- [claim_weekly_task_reward] ОШИБКА RPC: {error_details} ---")
        # --- 🔼🔼🔼 КОНЕЦ НОВОГО ЛОГА 🔼🔼🔼 ---
        raise HTTPException(status_code=400, detail=error_details)
    except Exception as e:
        logging.error(f"--- [claim_weekly_task_reward] КРИТИЧЕСКАЯ ОШИБКА: {e} ---", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")


@app.post("/api/v1/user/weekly_goals/claim_super_prize")
async def claim_weekly_super_prize(
    request_data: WeeklyGoalClaimSuperPrizeRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (ПОЛЬЗОВАТЕЛЬ) Забирает ГЛАВНЫЙ ПРИЗ за выполнение ВСЕХ задач.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Доступ запрещен.")

    try:
        response = await supabase.post(
            "/rpc/claim_weekly_super_prize",
            json={"p_user_id": user_info["id"]}
        )
        response.raise_for_status()
        
        # RPC вернет, например: {"message": "Суперприз 'ПРОМО123' добавлен в ваш профиль!"}
        return response.json()

    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Не удалось забрать суперприз.")
        raise HTTPException(status_code=400, detail=error_details)
    except Exception as e:
        logging.error(f"Ошибка в claim_weekly_super_prize: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")

# --- 🔼 КОНЕЦ НОВЫХ ЭНДПОИНТОВ 🔼 ---

@app.post("/api/v1/admin/manual_rewards")
async def get_manual_rewards(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Получает список всех наград, ожидающих ручной выдачи."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")
    
    resp = await supabase.post("/rpc/get_pending_manual_rewards_with_user")
    resp.raise_for_status()
    return resp.json()

# --- Функция отправки сообщений (если еще нет) ---
async def send_telegram_message(chat_id: int, text: str):
    try:
        # bot - это экземпляр aiogram Bot, который у тебя должен быть глобально
        await bot.send_message(chat_id=chat_id, text=text, parse_mode="HTML")
    except Exception as e:
        print(f"Ошибка отправки сообщения {chat_id}: {e}")

@app.post("/api/v1/admin/manual_rewards/complete")
async def complete_manual_reward(
    request_data: ManualRewardCompleteRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Помечает ручную награду как выданную + Выдает ПРОМОКОД."""
    # 1. Проверка админа
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    # 2. Получаем данные о самой покупке, чтобы узнать user_id и название
    res = await supabase.get("/manual_rewards", params={"id": f"eq.{request_data.reward_id}"})
    purchase = res.json()[0] if res.json() else None
    if not purchase:
        raise HTTPException(status_code=404, detail="Награда не найдена")

    user_tg_id = purchase.get("user_id") # или telegram_id, проверь как в базе
    title = purchase.get("title", "").lower()
    
    issued_code_text = None
    update_data = {
        "status": "completed", 
        "completed_at": datetime.now(timezone.utc).isoformat()
    }

    # 3. ЛОГИКА ПРОМОКОДОВ
    # Если в названии есть "промокод" или "код" (или добавь проверку по типу)
    if "промокод" in title or "билет" in title or "код" in title:
        # Ищем свободный код
        # limit=1, is_used=false
        code_res = await supabase.get("/promocodes", params={"is_used": "is.false", "limit": "1"})
        available_codes = code_res.json()
        
        if not available_codes:
             # Если кодов нет, но это товар-промокод — ошибка
             raise HTTPException(status_code=400, detail="В базе закончились свободные промокоды!")
        
        free_code = available_codes[0]
        issued_code_text = free_code['code']

        # 3.1. Помечаем код как использованный
        await supabase.patch(
            "/promocodes",
            params={"id": f"eq.{free_code['id']}"},
            json={
                "is_used": True,
                "telegram_id": user_tg_id,
                "claimed_at": datetime.now(timezone.utc).isoformat(),
                "description": f"Reward: {purchase.get('title')}"
            }
        )

        # 3.2. Добавляем код в поле user_input (или note), чтобы сохранить историю
        update_data["user_input"] = f"Выдан код: {issued_code_text}"

    # 4. Обновляем статус награды
    await supabase.patch(
        "/manual_rewards",
        params={"id": f"eq.{request_data.reward_id}"},
        json=update_data
    )

    # 5. Уведомляем пользователя
    msg = f"✅ <b>Ваша заявка одобрена!</b>\nТовар: {purchase.get('title')}"
    if issued_code_text:
        msg += f"\n\n🎁 <b>Ваш код:</b> <code>{issued_code_text}</code>"
    
    await send_telegram_message(user_tg_id, msg)

    return {"message": "Награда выдана", "code": issued_code_text}

# Модель для запроса отмены
class ManualRewardRejectRequest(BaseModel):
    initData: str
    reward_id: int
    is_silent: Optional[bool] = False

@app.post("/api/v1/admin/manual_rewards/reject")
async def reject_manual_reward(
    request_data: ManualRewardRejectRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Отклоняет награду. Если это товар из магазина (shop), делает возврат в Bot-t.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    reward_id = request_data.reward_id

    try:
        # 1. Получаем данные о награде, чтобы узнать source_type и description
        reward_resp = await supabase.get(
            "/manual_rewards", 
            params={"id": f"eq.{reward_id}", "select": "*"}
        )
        reward_resp.raise_for_status()
        rewards = reward_resp.json()
        
        if not rewards:
            raise HTTPException(status_code=404, detail="Запись не найдена.")
            
        reward = rewards[0]
        
        # Если это МАГАЗИН, нужно сделать возврат в Bot-t
        if reward.get("source_type") == "shop":
            logging.info(f"Попытка отмены заказа магазина ID {reward_id}...")
            
            # 2. Парсим Bot-t Order ID из source_description
            # Формат: "Название|Картинка|OrderID"
            source_desc = reward.get("source_description", "")
            parts = source_desc.split("|")
            
            bott_order_id = None
            if len(parts) >= 3:
                # Пытаемся взять последний элемент как ID
                try:
                    bott_order_id = int(parts[2])
                except ValueError:
                    pass
            
            if not bott_order_id:
                # Если ID заказа не найден, мы не можем вернуть деньги в Bot-t
                # Но мы всё равно можем отменить запись у себя (или выдать ошибку)
                logging.warning("Не найден Bot-t Order ID в описании. Возврат средств в Bot-t невозможен.")
                # return {"message": "Ошибка: Не найден номер заказа Bot-t. Невозможно вернуть средства."} 
                # Или продолжаем, чтобы просто закрыть запись у себя
            else:
                # 3. Получаем секретные ключи пользователя (они нужны для API Bot-t)
                user_id = reward.get("user_id")
                user_resp = await supabase.get("/users", params={"telegram_id": f"eq.{user_id}", "select": "bott_internal_id, bott_secret_key, bot_t_coins"})
                user_data = user_resp.json()
                
                if user_data and user_data[0].get("bott_secret_key"):
                    user_keys = user_data[0]
                    
                    # 4. Отправляем запрос отмены в Bot-t
                    # Ссылка: https://api.bot-t.com/v1/shopdigital/order-public/cancel 
                    cancel_url = "https://api.bot-t.com/v1/shopdigital/order-public/cancel"
                    cancel_payload = {
                        "bot_id": int(BOTT_BOT_ID),
                        "order_id": bott_order_id,
                        "user_id": int(user_keys["bott_internal_id"]),
                        "secret_user_key": user_keys["bott_secret_key"]
                    }
                    
                    async with httpx.AsyncClient() as client:
                        cancel_resp = await client.post(cancel_url, json=cancel_payload)
                        
                    if cancel_resp.status_code == 200 and cancel_resp.json().get("result") is True:
                        logging.info(f"✅ Заказ {bott_order_id} успешно отменен в Bot-t. Средства возвращены.")
                        
                        # (Опционально) Можно синхронизировать баланс пользователя, так как Bot-t вернул деньги
                        # Но это не критично, пользователь увидит новый баланс при обновлении
                    else:
                        logging.error(f"❌ Ошибка при отмене в Bot-t: {cancel_resp.text}")
                        raise HTTPException(status_code=400, detail="Bot-t не разрешил отмену заказа (возможно, он уже выполнен или прошел срок).")
                else:
                    logging.error("Не найдены ключи пользователя для возврата.")
                    raise HTTPException(status_code=400, detail="Нет ключей пользователя для возврата.")

        # 5. Обновляем статус у нас в базе на "rejected"
        await supabase.patch(
            "/manual_rewards",
            params={"id": f"eq.{reward_id}"},
            json={"status": "rejected"}
        )
        
        return {"message": "Заявка отклонена (возврат оформлен, если это магазин)."}

    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=400, detail="Ошибка базы данных.")
    except Exception as e:
        logging.error(f"Ошибка при отклонении: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# --- МОДИФИЦИРОВАННЫЙ ЭНДПОИНТ ДЛЯ ГРУППИРОВКИ ЗАЯВОК ---
@app.post("/api/v1/admin/pending_actions")
async def get_grouped_pending_submissions( # Переименовали функцию для ясности
    request_data: PendingActionRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Возвращает сгруппированный список квестов, у которых есть ожидающие заявки.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    try:
        # Используем новую RPC функцию, которую нужно создать в Supabase
        response = await supabase.post("/rpc/get_grouped_pending_submissions")
        response.raise_for_status()
        grouped_submissions = response.json()

        # Если RPC вернула null или пустой результат
        if not grouped_submissions:
            return []

        # Сортируем по названию квеста для консистентности
        grouped_submissions.sort(key=lambda x: x.get('quest_title', ''))

        return grouped_submissions

    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Ошибка базы данных")
        logging.error(f"Ошибка RPC get_grouped_pending_submissions: {error_details}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось сгруппировать заявки: {error_details}")
    except Exception as e:
        logging.error(f"Ошибка при группировке pending_actions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить сгруппированный список.")
# --- КОНЕЦ МОДИФИЦИРОВАННОГО ЭНДПОИНТА ---

@app.post("/api/v1/admin/checkpoint_rewards")
async def get_pending_checkpoint_prizes_grouped( # Переименовали функцию
    request_data: PendingActionRequest, # Модель осталась прежней
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Возвращает сгруппированные данные для иконок невыданных призов чекпоинта."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    try:
        # Получаем детали всех ожидающих ручных наград
        rewards_details = await supabase.get(
            "/manual_rewards",
            params={"status": "eq.pending", "select": "source_description"}
        )
        rewards_details.raise_for_status()

        # Считаем только те, что относятся к чекпоинту
        count = sum(1 for r in rewards_details.json() if r.get("source_description") and "чекпоинт" in r["source_description"].lower())

        # Возвращаем массив с одним элементом, если есть что выдать
        if count > 0:
            return [{
                "type": "checkpoint_prizes",
                "title": "Чекпоинт",
                "icon_class": "fa-solid fa-flag-checkered", # Иконка FontAwesome
                "pending_count": count
            }]
        else:
            return [] # Пустой массив, если выдавать нечего

    except Exception as e:
        logging.error(f"Ошибка при группировке призов чекпоинта: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось сгруппировать призы чекпоинта.")

@app.post("/api/v1/admin/users/reset-checkpoint-progress")
async def reset_user_checkpoint_progress(
    request_data: AdminCheckpointUserRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Сбрасывает ТОЛЬКО прогресс (список наград) Чекпоинта для одного пользователя."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    user_id = request_data.user_id
    await supabase.delete(
        "/claimed_checkpoint_rewards",
        params={"user_id": f"eq.{user_id}"}
    )
    return {"message": f"Список наград Чекпоинта для пользователя {user_id} был очищен."}

# --- НОВЫЙ ЭНДПОИНТ ДЛЯ ДЕТАЛЕЙ ЗАЯВОК ПО КВЕСТУ ---
@app.post("/api/v1/admin/pending_actions/quest/{quest_id}")
async def get_pending_submissions_for_single_quest(
    quest_id: int,
    request_data: InitDataRequest, # Используем простую модель для initData
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Возвращает список ожидающих заявок ТОЛЬКО для указанного quest_id."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    try:
        # Можно адаптировать существующую RPC get_pending_submissions_with_details,
        # добавив ей параметр p_quest_id, или сделать прямой запрос:
        response = await supabase.post(
            "/rpc/get_quest_submissions_with_details", # Используем твою существующую RPC
            json={"p_quest_id": quest_id} # Передаем ID квеста
        )
        response.raise_for_status()
        submissions = response.json()

        # Дополнительно фильтруем по статусу 'pending', если RPC не делает этого
        pending_submissions = [s for s in submissions if s.get('status') == 'pending']

        # Сортируем по дате создания
        pending_submissions.sort(key=lambda x: x.get('created_at', ''), reverse=True)

        return pending_submissions

    except Exception as e:
        logging.error(f"Ошибка при получении заявок для квеста {quest_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить список заявок.")
# --- КОНЕЦ НОВОГО ЭНДПОИНТА ---

@app.post("/api/v1/admin/users/clear-checkpoint-stars")
async def clear_user_checkpoint_stars(
    request_data: AdminCheckpointUserRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) ТОЛЬКО обнуляет баланс звёзд Чекпоинта для одного пользователя."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    user_id = request_data.user_id
    await supabase.patch(
        "/users",
        params={"telegram_id": f"eq.{user_id}"},
        json={"checkpoint_stars": 0}
    )
    return {"message": f"Баланс звёзд Чекпоинта для пользователя {user_id} обнулён."}


@app.post("/api/v1/admin/users/reset-all-checkpoint-progress")
async def reset_all_checkpoint_progress(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) ВНИМАНИЕ: Сбрасывает прогресс (список наград) Чекпоинта для ВСЕХ пользователей."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    await supabase.post("/rpc/truncate_claimed_checkpoint_rewards")
    return {"message": "Прогресс (список наград) Чекпоинта был сброшен для ВСЕХ пользователей."}

@app.post("/api/v1/admin/users/clear-all-checkpoint-stars")
async def clear_all_checkpoint_stars(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) ВНИМАНИЕ: Обнуляет баланс звёзд Чекпоинта для ВСЕХ пользователей."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    await supabase.patch(
        "/users",
        params={"checkpoint_stars": "gt.0"},
        json={"checkpoint_stars": 0}
    )
    return {"message": "Баланс звёзд Чекпоинта был обнулён для ВСЕХ пользователей."}

@app.post("/api/v1/admin/wizebot/check_user")
async def check_wizebot_user_stats(
    request_data: WizebotCheckRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Проверяет статистику конкретного пользователя напрямую через API Wizebot.
    """
    # Проверка, что запрос от админа
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    if not WIZEBOT_API_KEY:
        raise HTTPException(status_code=500, detail="Wizebot API не настроен.")

    twitch_username_to_find = request_data.twitch_username.lower()
    period = request_data.period
    limit = 100 # Ищем в топ-100

    # Запрашиваем у Wizebot топ по сообщениям за указанный период
    url = f"https://wapi.wizebot.tv/api/ranking/{WIZEBOT_API_KEY}/top/message/{period}/{limit}"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=15.0)
            resp.raise_for_status()
            data = resp.json()
            leaderboard = data.get("list", [])

            # Ищем нашего пользователя в полученном списке
            for user in leaderboard:
                if user.get("user_name", "").lower() == twitch_username_to_find:
                    return {
                        "found": True,
                        "username": user.get("user_name"),
                        "messages": int(user.get("value", 0)),
                        "rank": user.get("rank"),
                        "period": period
                    }
            
            # Если пользователь не найден в цикле
            return {
                "found": False,
                "message": f"Пользователь '{request_data.twitch_username}' не найден в топ-{limit} Wizebot за этот период."
            }

    except Exception as e:
        logging.error(f"Ошибка при запросе к Wizebot API: {e}")
        raise HTTPException(status_code=502, detail="Не удалось получить данные от Wizebot.")

@app.post("/api/v1/admin/twitch_rewards/issue_promocode")
async def issue_twitch_reward_promocode(
    request_data: TwitchRewardIssueRequest,
    background_tasks: BackgroundTasks,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Выдает промокод за покупку на Twitch. Проверка Wizebot УДАЛЕНА."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    purchase_id = request_data.purchase_id

    try:
        # --- БЛОК ПРОВЕРКИ WIZEBOT (ШАГ 3) БЫЛ ПОЛНОСТЬЮ УДАЛЕН ---
        
        # Сразу вызываем RPC для выдачи промокода
        rpc_response = await supabase.post(
            "/rpc/issue_promocode_for_twitch_purchase",
            json={"p_purchase_id": purchase_id}
        )
        rpc_response.raise_for_status()
        
        result = rpc_response.json()[0]
        user_id_to_notify = result.get("user_id")
        promo_code = result.get("promocode")
        reward_title = result.get("reward_title")

        if not all([user_id_to_notify, promo_code, reward_title]):
            raise HTTPException(status_code=404, detail="Не удалось получить все данные для отправки уведомления.")
            
        # Отправляем уведомление в фоне
        safe_promo_code = re.sub(r"[^a-zA-Z0-9_]", "_", promo_code)
        activation_url = f"https://t.me/HATElavka_bot?start={safe_promo_code}"
        
        notification_text = (
            f"<b>🎉 Ваша награда за «{html_decoration.quote(reward_title)}»!</b>\n\n"
            f"Скопируйте промокод и используйте его в @HATElavka_bot, чтобы получить свои звёзды.\n\n"
            f"Ваш промокод:\n<code>{promo_code}</code>"
        )
        
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="✅ Активировать в HATElavka", url=activation_url)],
            [InlineKeyboardButton(text="🗑️ Получил, удалить из списка", callback_data=f"confirm_reward:promocode:{promo_code}")]
        ])

        background_tasks.add_task(safe_send_message, user_id_to_notify, text=notification_text, reply_markup=keyboard)

        return {"message": f"Награда успешно отправлена пользователю. Промокод: {promo_code}"}

    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Ошибка базы данных.")
        raise HTTPException(status_code=400, detail=error_details)
    except Exception as e:
        logging.error(f"Ошибка при выдаче промокода за Twitch награду: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось выдать награду.")

@app.post("/api/v1/admin/twitch_rewards/issue_tickets")
async def issue_twitch_reward_tickets(
    request_data: TwitchRewardIssueTicketsRequest,
    background_tasks: BackgroundTasks,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Вручную выдает БИЛЕТЫ за покупку на Twitch."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    purchase_id = request_data.purchase_id

    try:
        # 1. Вызываем RPC-функцию, которая делает всю работу
        #    (начисляет билеты, помечает заявку, возвращает данные)
        rpc_response = await supabase.post(
            "/rpc/issue_tickets_for_twitch_purchase",
            json={"p_purchase_id": purchase_id}
        )
        rpc_response.raise_for_status()

        result = rpc_response.json()

        # Проверяем, что RPC-функция вернула данные (она должна вернуть массив)
        if not result:
            raise HTTPException(status_code=404, detail="Не удалось обработать заявку. Данные не найдены.")

        reward_data = result[0]
        user_id_to_notify = reward_data.get("user_id")
        reward_amount = reward_data.get("reward_amount")
        reward_title = reward_data.get("reward_title")

        if not all([user_id_to_notify, reward_title]) or reward_amount is None:
            raise HTTPException(status_code=404, detail="Не удалось получить все данные для отправки уведомления.")

        # 2. Отправляем уведомление пользователю в фоне
        notification_text = (
            f"<b>🎉 Ваша награда за «{html_decoration.quote(reward_title)}»!</b>\n\n"
            f"Вам начислено: <b>{reward_amount} билетов</b> 🎟️\n\n"
            f"Награда уже на вашем балансе."
        )

        # (Мы не добавляем кнопку "Удалить", т.к. билеты не хранятся в списке пользователя)
        keyboard = None

        background_tasks.add_task(safe_send_message, user_id_to_notify, text=notification_text, reply_markup=keyboard)

        return {"message": f"Награда ({reward_amount} билетов) успешно отправлена пользователю."}

    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Ошибка базы данных.")
        raise HTTPException(status_code=400, detail=error_details)
    except Exception as e:
        logging.error(f"Ошибка при выдаче билетов за Twitch награду: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось выдать награду.")

# 2. ЗАМЕНИТЕ ВАШУ СТАРУЮ ФУНКЦИЮ send_approval_notification НА ЭТУ:
async def send_approval_notification(user_id: int, quest_title: str, promo_code: str):
    """Отправляет уведомление об одобрении заявки в фоне."""
    try:
        safe_promo_code = re.sub(r"[^a-zA-Z0-9_]", "_", promo_code)
        activation_url = f"https://t.me/HATElavka_bot?start={safe_promo_code}"
        notification_text = (
            f"<b>🎉 Твоя награда за квест «{html_decoration.quote(quest_title)}»!</b>\n\n"
            f"Скопируй промокод и используй его в @HATElavka_bot, чтобы получить свои звёзды.\n\n"
            f"Твой промокод:\n<code>{promo_code}</code>"
        )
        
        # --- ИЗМЕНЕНИЕ: Добавлена кнопка подтверждения ---
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="✅ Активировать в HATElavka", url=activation_url)],
            [InlineKeyboardButton(text="🗑️ Получил, удалить из списка", callback_data=f"confirm_reward:promocode:{promo_code}")]
        ])

        await safe_send_message(user_id, text=notification_text, reply_markup=keyboard, parse_mode=ParseMode.HTML)
        logging.info(f"Фоновое уведомление для {user_id} успешно отправлено.")
    except Exception as e:
        logging.error(f"Ошибка при отправке фонового уведомления для {user_id}: {e}")

@router.callback_query(F.data.startswith("confirm_reward:"))
async def handle_confirm_reward(
    callback: types.CallbackQuery,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Обрабатывает кнопку 'подтвердить и удалить' для наград.
    Удаляет запись из БД и обновляет сообщение.
    """
    try:
        parts = callback.data.split(":")
        if len(parts) != 3:
            await callback.answer("Ошибка: неверные данные.", show_alert=True)
            return

        action, reward_type, reward_identifier = parts

        if reward_type == "promocode":
            # Удаляем промокод, так как он больше не нужен пользователю в списке
            await supabase.delete(
                "/promocodes",
                params={"code": f"eq.{reward_identifier}"}
            )
            
            await callback.bot.edit_message_text(
                chat_id=callback.from_user.id,
                message_id=callback.message.message_id,
                text=f"✅ <b>Награда подтверждена и удалена из вашего списка.</b>\n\nКод был: <code>{html_decoration.quote(reward_identifier)}</code>",
                reply_markup=None # Убираем кнопки
            )
            
            await callback.answer("Промокод удален из вашего списка.")
        else:
            await callback.answer(f"Неизвестный тип награды: {reward_type}", show_alert=True)

    except httpx.HTTPStatusError as e:
        logging.error(f"Ошибка Supabase при подтверждении награды: {e.response.text}")
        await callback.answer("Ошибка базы данных. Попробуйте позже.", show_alert=True)
    except Exception as e:
        logging.error(f"Ошибка при обработке подтверждения награды: {e}", exc_info=True)
        await callback.answer("Произошла непредвиденная ошибка.", show_alert=True)

@app.post("/api/v1/admin/twitch_rewards/purchases/delete_all")
async def delete_all_twitch_reward_purchases(
    request_data: TwitchRewardIdRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Удаляет ВСЕ покупки для указанной Twitch награды."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    reward_id_to_clear = request_data.reward_id

    await supabase.delete(
        "/twitch_reward_purchases",
        params={"reward_id": f"eq.{reward_id_to_clear}"}
    )

    return {"message": f"Все покупки для награды ID {reward_id_to_clear} были удалены."}

@app.post("/api/v1/admin/twitch_rewards/delete")
async def delete_twitch_reward(
    request_data: TwitchRewardDeleteRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Полностью удаляет Twitch награду и все связанные с ней покупки."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")
    
    reward_id_to_delete = request_data.reward_id

    # Supabase настроен с 'ON DELETE CASCADE', поэтому при удалении награды
    # автоматически удалятся все связанные покупки.
    await supabase.delete(
        "/twitch_rewards",
        params={"id": f"eq.{reward_id_to_delete}"}
    )
    
    return {"message": "Награда и все ее покупки успешно удалены."}

@app.post("/api/v1/admin/twitch_rewards/purchase/delete")
async def delete_twitch_reward_purchase(
    request_data: TwitchPurchaseDeleteRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Удаляет покупку. Если это был выигрыш в рулетке (отклонение из-за условий) — возвращает приз на склад."""
    
    # Проверка прав
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    purchase_id = request_data.purchase_id

    try:
        # 1. Сначала получаем данные о покупке, чтобы узнать, что удаляем
        purchase_resp = await supabase.get(
            "/twitch_reward_purchases",
            params={"id": f"eq.{purchase_id}", "select": "user_input"}
        )
        purchase_data = purchase_resp.json()

        if purchase_data:
            user_input = purchase_data[0].get("user_input", "")
            
            # 2. Проверяем, похоже ли это на выигрыш в рулетке
            # Формат записи: "Выигрыш: AWP | Asiimov | Сообщение: ..."
            # Если админ удаляет такую запись (например, "Условие не выполнено!"), мы должны вернуть скин.
            if user_input and user_input.startswith("Выигрыш:"):
                # Извлекаем название скина через регулярное выражение
                # Берем все между "Выигрыш: " и " | Сообщение" (если есть) или до конца строки
                match = re.search(r"Выигрыш:\s*(.*?)(?:\s*\|\s*Сообщение:|$)", user_input)
                if match:
                    skin_name = match.group(1).strip()
                    
                    logging.info(f"♻️ Возврат скина на склад: '{skin_name}' (Удаление покупки {purchase_id})")
                    
                    # 3. Ищем этот приз в таблице призов
                    prize_resp = await supabase.get(
                        "/roulette_prizes",
                        params={"skin_name": f"eq.{skin_name}", "select": "id, quantity"}
                    )
                    prize_data = prize_resp.json()
                    
                    if prize_data:
                        # 4. Если нашли — увеличиваем количество на 1 (возврат)
                        prize_id = prize_data[0]['id']
                        current_qty = prize_data[0].get('quantity', 0)
                        
                        await supabase.patch(
                            "/roulette_prizes",
                            params={"id": f"eq.{prize_id}"},
                            json={"quantity": current_qty + 1}
                        )
                    else:
                        logging.warning(f"⚠️ Не удалось вернуть скин '{skin_name}': приз не найден в базе.")

        # 5. Теперь удаляем саму запись покупки
        response = await supabase.delete(
            "/twitch_reward_purchases",
            params={"id": f"eq.{purchase_id}"}
        )
        
        if response.status_code not in range(200, 300):
            logging.error(f"❌ Ошибка удаления ID {purchase_id}: {response.text}")
            raise HTTPException(status_code=response.status_code, detail=f"DB Error: {response.text}")

        return {"message": "Покупка удалена (приз возвращен на склад, если это была рулетка)."}

    except Exception as e:
        logging.error(f"🔥 Критическая ошибка при удалении: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/admin/roulette/prizes")
async def get_roulette_prizes(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Получает список всех призов для всех рулеток."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")
    
    resp = await supabase.get("/roulette_prizes", params={"select": "*", "order": "reward_title.asc,chance_weight.desc"})
    resp.raise_for_status()
    return resp.json()

@app.post("/api/v1/admin/roulette/create")
async def create_roulette_prize(
    request_data: RoulettePrizeCreateRequest, # <-- Используем обновленную модель
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Создает новый приз для рулетки, включая количество."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    if request_data.quantity < 0:
        raise HTTPException(status_code=400, detail="Количество не может быть отрицательным.")

    await supabase.post("/roulette_prizes", json={
        "reward_title": request_data.reward_title.strip(),
        "skin_name": request_data.skin_name.strip(),
        "image_url": request_data.image_url.strip(),
        "chance_weight": request_data.chance_weight,
        "quantity": request_data.quantity # <-- ДОБАВЛЕНО
    })
    return {"message": "Приз успешно добавлен в рулетку."}

@app.post("/api/v1/admin/roulette/update")
async def update_roulette_prize(
    request_data: RoulettePrizeUpdateRequest, # <-- Используем новую модель
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Обновляет существующий приз рулетки."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    prize_id = request_data.prize_id

    if request_data.quantity < 0:
        raise HTTPException(status_code=400, detail="Количество не может быть отрицательным.")

    # Используем dict() для преобразования Pydantic модели в словарь, исключая initData и prize_id
    update_data = request_data.dict(exclude={'initData', 'prize_id'})

    # Убираем пробелы из строковых полей на всякий случай
    if 'reward_title' in update_data: update_data['reward_title'] = update_data['reward_title'].strip()
    if 'skin_name' in update_data: update_data['skin_name'] = update_data['skin_name'].strip()
    if 'image_url' in update_data: update_data['image_url'] = update_data['image_url'].strip()

    await supabase.patch(
        "/roulette_prizes",
        params={"id": f"eq.{prize_id}"},
        json=update_data
    )
    return {"message": f"Приз ID {prize_id} успешно обновлен."}

@app.post("/api/v1/admin/roulette/delete")
async def delete_roulette_prize(
    request_data: RoulettePrizeDeleteRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Удаляет приз из рулетки."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    await supabase.delete(
        "/roulette_prizes",
        params={"id": f"eq.{request_data.prize_id}"}
    )
    return {"message": "Приз удален."}

# --- ЭНДПОИНТЫ ДЛЯ ГРИНД-СТАНЦИИ ---

@app.post("/api/v1/user/grind/claim")
async def claim_grind_reward_endpoint(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Пользователь забирает ежедневную награду.
    ИСПРАВЛЕНО: Убрано двойное ожидание задач (double await fix).
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")

    telegram_id = user_info["id"]

    try:
        # 1. ЗАПУСКАЕМ ЗАДАЧИ (но НЕ ждем их тут!)
        task_rpc = supabase.post("/rpc/claim_grind_reward", json={"p_user_id": telegram_id})
        task_user = supabase.get("/users", params={"telegram_id": f"eq.{telegram_id}", "select": "twitch_status, referral_activated_at"})
        task_settings = get_grind_settings_async_global()

        # 2. Ждем ВСЕ результаты ОДИН РАЗ в одной точке
        rpc_resp, user_resp, settings = await asyncio.gather(task_rpc, task_user, task_settings)

        # 3. Проверяем ошибки
        rpc_resp.raise_for_status()
        user_resp.raise_for_status() # Важно проверить и это!

        result = rpc_resp.json()
        
        # Берем данные пользователя
        user_data_list = user_resp.json()
        user_data = user_data_list[0] if user_data_list else {}

        extra_bonus = 0.0

        # --- A. Бонус за VIP ---
        ref_date_str = user_data.get('referral_activated_at')
        if ref_date_str:
            try:
                ref_dt = datetime.fromisoformat(ref_date_str.replace('Z', '+00:00'))
                if (datetime.now(timezone.utc) - ref_dt) < timedelta(days=7):
                    extra_bonus += 0.2
            except ValueError:
                pass

        # --- B. Бонус за Twitch ---
        t_status = user_data.get('twitch_status')
        if t_status in ['vip', 'subscriber']:
            extra_bonus += settings.twitch_status_boost_coins

        # 4. Доначисляем бонус
        if extra_bonus > 0:
            logging.info(f"💰 Доп. бонус +{extra_bonus} для {telegram_id}")
            current_coins = float(result.get('new_coins', 0))
            final_coins = round(current_coins + extra_bonus, 4)

            # Обновляем базу
            await supabase.patch(
                "/users",
                params={"telegram_id": f"eq.{telegram_id}"},
                json={"coins": final_coins}
            )

            # Обновляем ответ
            result['new_coins'] = final_coins
            result['reward_claimed'] = round(float(result.get('reward_claimed', 0)) + extra_bonus, 4)

        return result

    except httpx.HTTPStatusError as e:
        try:
            error_msg = e.response.json().get("message", e.response.text)
        except:
            error_msg = e.response.text
        raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        logging.error(f"Grind claim error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal Server Error")
        
@app.post("/api/v1/user/grind/exchange")
async def exchange_coins_endpoint(
    request_data: ExchangeRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Обмен монет на билеты. Исправлено: курс обмена снижен до 2.9,
    чтобы разрешить обмен по цене 3 монеты за билет.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    
    # 1. Проверка аутентификации
    if not user_info or "id" not in user_info:
        logging.error("❌ Exchange Failed: Invalid initData.")
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Временный лог для отладки клиента (можно удалить после подтверждения работы)
    logging.info(
        f"🔍 Exchange Data: User={user_info['id']}, "
        f"Cost={request_data.cost}, Reward={request_data.tickets_reward}"
    )

    # 2. Валидация входных данных (защита от деления на ноль и нулевой награды)
    if (request_data.tickets_reward <= 0):
        logging.error(f"❌ Exchange Failed: Tickets reward must be positive (Got: {request_data.tickets_reward}).")
        raise HTTPException(status_code=400, detail="Неверное количество билетов для обмена.")

    # 3. ПРОВЕРКА КУРСА: Установлен минимальный порог 2.9, чтобы разрешить курс 3.0.
    MIN_REQUIRED_RATE = 2.9 
    exchange_rate = request_data.cost / request_data.tickets_reward
    
    if exchange_rate < MIN_REQUIRED_RATE: 
        logging.error(f"❌ Exchange Failed: Invalid exchange rate (Got: {exchange_rate}). Min required: {MIN_REQUIRED_RATE}")
        raise HTTPException(status_code=400, detail="Неверный курс обмена.")

    # 4. Вызов RPC
    try:
        response = await supabase.post(
            "/rpc/exchange_coins",
            json={
                "p_user_id": user_info["id"],
                "p_cost": request_data.cost,
                "p_tickets_reward": request_data.tickets_reward
            }
        )
        response.raise_for_status()
        
        # 5. Успех
        return response.json()

    except httpx.HTTPStatusError as e:
        # 6. Обработка ошибки RPC (Недостаточно монет, User not found и т.д.)
        error_details = e.response.json().get("message", e.response.text)
        logging.error(f"❌ Exchange RPC Error (400): {error_details}")
        
        raise HTTPException(status_code=400, detail=error_details) 

    except Exception as e:
        logging.error(f"❌ Exchange Critical Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")

@app.post("/api/v1/user/grind/buy_promo")
async def buy_promo_endpoint(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Покупка реального промокода из таблицы promocodes за монеты."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # --- НАСТРОЙКИ ЦЕНЫ ---
    COST_IN_COINS = 10.0   # Сколько монет стоит покупка
    REWARD_STARS = 50      # Какой номинал промокода искать в базе (например, промокод на 50 звезд)
    # Убедись, что в таблице 'promocodes' есть свободные коды с reward_value = 50 (или сколько ты поставишь)
    # ----------------------

    try:
        response = await supabase.post(
            "/rpc/buy_promo_for_coins",
            json={
                "p_user_id": user_info["id"],
                "p_cost": COST_IN_COINS,
                "p_reward_value": REWARD_STARS 
            }
        )
        
        # Обработка ошибок от SQL (например, если коды закончились)
        if response.status_code != 200:
            error_data = response.json()
            error_msg = error_data.get("message", "Ошибка покупки")
            # Если коды закончились, база вернет нашу ошибку 'Промокоды закончились...'
            raise HTTPException(status_code=400, detail=error_msg)

        return response.json()

    except httpx.HTTPStatusError as e:
        error_msg = e.response.json().get("message", e.response.text)
        raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        logging.error(f"Promo buy error: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

# Модель для запроса конкретной категории
class ShopCategoryRequest(BaseModel):
    initData: str
    category_id: int = 0  # По умолчанию 0 (главная)

async def fetch_and_cache_goods_background(category_id: int):
    """Фоновая задача: Скачивает товары с Bot-t и сохраняет в Supabase (shop_cache)"""
    url = "https://api.bot-t.com/v1/shoppublic/category/view"
    payload = {
        "bot_id": str(BOTT_BOT_ID),
        "public_key": BOTT_PUBLIC_KEY,
        "category_id": category_id 
    }
    headers = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
    
    try:
        # logging.info(f"🔄 [BG_SHOP] Начало обновления категории {category_id}...")
        async with httpx.AsyncClient(timeout=60.0) as client: # Увеличенный таймаут для Bot-t
            resp = await client.post(url, json=payload, headers=headers)
            
        if resp.status_code != 200:
            logging.error(f"[BG_SHOP] Ошибка Bot-t: {resp.status_code}")
            return

        data = resp.json().get("data", [])
        mapped_items = []

        # Ваш парсинг (без изменений)
        for item in data:
            is_folder = (item.get("type") == 0)
            image_url = "https://placehold.co/150?text=No+Image"
            if item.get("design") and item["design"].get("image"):
                image_url = item["design"]["image"]
            elif item.get("photo") and item["photo"].get("abs_path"):
                image_url = item["photo"]["abs_path"]
            price = 0
            if item.get("price"):
                amount = item["price"].get("amount", 0)
                price = int(amount / 100) if amount else 0
            name = "Без названия"
            if item.get("design"):
                name = item["design"].get("title", "Без названия")
            count = None 
            if item.get("setting"):
                raw_count = item["setting"].get("count")
                if raw_count is not None: count = int(raw_count)

            mapped_items.append({
                "id": item.get("id"),
                "name": name,
                "price": price,
                "image_url": image_url,
                "is_folder": is_folder,
                "count": count 
            })

        # Сохраняем в Supabase (shop_cache)
        # Используем upsert (обновить или вставить)
        async with httpx.AsyncClient(base_url=f"{SUPABASE_URL}/rest/v1", headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}) as sb_client:
            await sb_client.post(
                "/shop_cache",
                json={
                    "category_id": category_id,
                    "data": mapped_items,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                },
                headers={"Prefer": "resolution=merge-duplicates"}
            )
        # logging.info(f"✅ [BG_SHOP] Категория {category_id} обновлена в базе.")

    except Exception as e:
        logging.error(f"[BG_SHOP] Ошибка обновления: {e}")

# --- ОПТИМИЗИРОВАННЫЙ ЭНДПОИНТ МАГАЗИНА ---
@app.post("/api/v1/shop/goods")
async def get_bott_goods_proxy(
    request_data: ShopCategoryRequest,
    background_tasks: BackgroundTasks,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    category_id = request_data.category_id
    
    # 1. Сразу запрашиваем данные из Supabase (shop_cache)
    try:
        resp = await supabase.get(
            "/shop_cache",
            params={"category_id": f"eq.{category_id}", "select": "data,updated_at"}
        )
        db_data = resp.json()
    except Exception as e:
        logging.error(f"[SHOP] Ошибка чтения кэша: {e}")
        db_data = []

    cached_goods = []
    should_update = True

    if db_data:
        row = db_data[0]
        cached_goods = row.get("data") or []
        updated_at_str = row.get("updated_at")
        
        # Проверяем, насколько данные свежие (например, 10 минут)
        if updated_at_str:
            try:
                updated_at = datetime.fromisoformat(updated_at_str.replace('Z', '+00:00'))
                # Если прошло меньше 10 минут (600 сек), не обновляем
                if (datetime.now(timezone.utc) - updated_at).total_seconds() < 600:
                    should_update = False
            except ValueError:
                pass

    # 2. Логика обновления
    if should_update:
        # Если данных вообще нет или они старые -> запускаем задачу в ФОНЕ
        # logging.info(f"⏳ [SHOP] Запуск фонового обновления для категории {category_id}")
        background_tasks.add_task(fetch_and_cache_goods_background, category_id)

    # 3. Возвращаем то, что есть в базе (мгновенно)
    # Если база пустая (первый запуск), вернем пустой список, но в фоне уже качается.
    # Пользователь может просто обновить страницу через пару секунд.
    
    return cached_goods

async def save_balance_background(telegram_id: int, update_data: dict):
    """Фоновая задача для сохранения данных магазина в Supabase"""
    try:
        # Используем глобальный клиент или создаем временный
        async with httpx.AsyncClient(
            base_url=f"{SUPABASE_URL}/rest/v1",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            timeout=10.0
        ) as client:
            await client.patch(
                "/users",
                params={"telegram_id": f"eq.{telegram_id}"},
                json=update_data
            )
    except Exception as e:
        logging.error(f"[BG_SYNC] Ошибка фонового сохранения баланса: {e}")

# --- ОПТИМИЗИРОВАННЫЙ ЭНДПОИНТ БАЛАНСА (БЫСТРОЕ ОБНОВЛЕНИЕ) ---
@app.post("/api/v1/user/sync_balance")
async def sync_user_balance(
    request_data: InitDataRequest,
    background_tasks: BackgroundTasks,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    1. Если синхронизация была < 5 сек назад -> отдаем данные из БД (Мгновенно).
    2. Если > 5 сек -> идем в Bot-t и обновляем (Актуально).
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    telegram_id = user_info["id"]

    # 1. Получаем текущие данные из БД
    user_resp = await supabase.get(
        "/users", 
        params={"telegram_id": f"eq.{telegram_id}", "select": "bot_t_coins,bott_ref_id,last_balance_sync"}
    )
    user_data = user_resp.json()[0] if user_resp.json() else {}
    
    # Проверяем время последней синхронизации
    last_sync = user_data.get("last_balance_sync")
    should_refresh = True
    
    if last_sync:
        try:
            last_sync_dt = datetime.fromisoformat(last_sync.replace('Z', '+00:00'))
            # 🔥 ИЗМЕНЕНИЕ: Уменьшили кэш с 60 до 5 секунд для магазина
            if (datetime.now(timezone.utc) - last_sync_dt).total_seconds() < 5:
                should_refresh = False
        except ValueError:
            pass 

    # А. БЫСТРЫЙ ПУТЬ: Отдаем данные из базы (если недавно обновляли)
    if not should_refresh:
        return {
            "bot_t_coins": user_data.get("bot_t_coins", 0),
            "bott_ref_id": user_data.get("bott_ref_id")
        }

    # Б. МЕДЛЕННЫЙ ПУТЬ: Запрос к Bot-t (если кэш устарел > 5 сек)
    url = "https://api.bot-t.com/v1/module/bot/check-hash"
    payload = {"bot_id": int(BOTT_BOT_ID), "userData": request_data.initData}

    try:
        # Используем глобальный клиент
        client_to_use = global_shop_client if global_shop_client else httpx.AsyncClient(timeout=10.0)
        
        # Если есть глобальный клиент, используем его, иначе создаем временный
        if global_shop_client:
             resp = await global_shop_client.post(url, json=payload)
        else:
             async with httpx.AsyncClient(timeout=10.0) as temp_client:
                 resp = await temp_client.post(url, json=payload)
        
        if resp.status_code != 200:
            return {"bot_t_coins": user_data.get("bot_t_coins", 0)} 

        data = resp.json()
        response_data = data.get("data", {})
        
        if not response_data:
             return {"bot_t_coins": user_data.get("bot_t_coins", 0)}

        # Парсим данные
        internal_id = response_data.get("id")
        ref_id = None
        if response_data.get("user"):
            ref_id = response_data["user"].get("id") 
        
        money_raw = response_data.get("money", 0)
        current_balance = int(float(money_raw))
        secret_key = response_data.get("secret_user_key")

        # Сохраняем в БД (включая last_balance_sync)
        update_data = {
            "bot_t_coins": current_balance,
            "last_balance_sync": datetime.now(timezone.utc).isoformat()
        }
        if internal_id: update_data["bott_internal_id"] = internal_id
        if ref_id: update_data["bott_ref_id"] = ref_id
        if secret_key: update_data["bott_secret_key"] = secret_key

        # Сохраняем в фоне, чтобы не задерживать ответ пользователю
        background_tasks.add_task(save_balance_background, telegram_id, update_data)
        
        return {"bot_t_coins": current_balance, "bott_ref_id": ref_id}

    except Exception as e:
        logging.error(f"[SYNC] Ошибка: {e}")
        # При ошибке возвращаем старый баланс, чтобы интерфейс не ломался
        return {"bot_t_coins": user_data.get("bot_t_coins", 0)}

# --- 1. ФОНОВАЯ ЗАДАЧА СИНХРОНИЗАЦИИ (Стучится в Bot-t) ---
async def background_bott_sync_task(telegram_id: int, init_data: str):
    """
    Фоновая задача: тихо идет в API Bot-t, берет актуальный баланс
    и сохраняет его в нашу базу Supabase.
    """
    # URL для проверки баланса в Bot-t
    url = "https://api.bot-t.com/v1/module/bot/check-hash"
    payload = {"bot_id": int(BOTT_BOT_ID), "userData": init_data}

    try:
        # Используем глобальный клиент для скорости (или создаем временный)
        client_to_use = global_shop_client if global_shop_client else httpx.AsyncClient(timeout=10.0)
        
        # Выполняем запрос к Bot-t
        if global_shop_client:
             resp = await global_shop_client.post(url, json=payload)
        else:
             async with httpx.AsyncClient(timeout=10.0) as temp_client:
                 resp = await temp_client.post(url, json=payload)

        # Если Bot-t ответил успешно (200 OK)
        if resp.status_code == 200:
            data = resp.json()
            response_data = data.get("data", {})
            
            if response_data:
                # Достаем баланс (там могут быть копейки, поэтому float -> int)
                money_raw = response_data.get("money", 0)
                current_balance = int(float(money_raw))
                
                # Достаем ключи (на всякий случай обновляем их тоже)
                internal_id = response_data.get("id")
                secret_key = response_data.get("secret_user_key")
                
                # Готовим данные для обновления в Supabase
                update_data = {
                    "bot_t_coins": current_balance,
                    "last_balance_sync": datetime.now(timezone.utc).isoformat()
                }
                if internal_id: update_data["bott_internal_id"] = internal_id
                if secret_key: update_data["bott_secret_key"] = secret_key

                # Записываем в Supabase (не блокируя основной поток)
                async with httpx.AsyncClient(
                    base_url=f"{SUPABASE_URL}/rest/v1",
                    headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
                    timeout=10.0
                ) as sb_client:
                    await sb_client.patch(
                        "/users",
                        params={"telegram_id": f"eq.{telegram_id}"},
                        json=update_data
                    )
                # Лог для отладки (можно убрать)
                # logging.info(f"✅ [Smart Sync] Баланс {telegram_id} обновлен: {current_balance}")
                
    except Exception as e:
        logging.error(f"⚠️ [Smart Sync] Ошибка фона: {e}")


# --- 2. УМНЫЙ ЭНДПОИНТ ДЛЯ МАГАЗИНА ---
@app.post("/api/v1/shop/smart_balance")
async def get_shop_smart_balance(
    request_data: InitDataRequest,
    background_tasks: BackgroundTasks,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Вызывается при открытии магазина или нажатии Reload.
    1. Отдает старый баланс мгновенно (чтобы интерфейс не висел).
    2. Если данные старее 10 секунд -> запускает обновление в фоне.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    telegram_id = user_info["id"]

    # 1. Быстро читаем текущее состояние из базы
    user_resp = await supabase.get(
        "/users", 
        params={"telegram_id": f"eq.{telegram_id}", "select": "bot_t_coins, last_balance_sync"}
    )
    # Если юзера нет в базе, вернем 0, но фоновая задача его создаст/обновит позже
    user_data = user_resp.json()[0] if user_resp.json() else {}
    
    current_coins = user_data.get("bot_t_coins", 0)
    last_sync = user_data.get("last_balance_sync")

    # 2. Решаем, нужно ли обновлять (кэш 10 секунд)
    should_sync = True
    if last_sync:
        try:
            last_sync_dt = datetime.fromisoformat(last_sync.replace('Z', '+00:00'))
            # Если прошло меньше 10 секунд с последнего обновления - не трогаем Bot-t
            if (datetime.now(timezone.utc) - last_sync_dt).total_seconds() < 10:
                should_sync = False
        except ValueError:
            pass

    # 3. Если нужно обновление — добавляем задачу в фон
    if should_sync:
        background_tasks.add_task(background_bott_sync_task, telegram_id, request_data.initData)

    # 4. Сразу возвращаем то, что есть сейчас
    return {"balance": current_coins}

# --- ЭНДПОИНТ 2: РЕФЕРАЛЫ (С ДЕТАЛЬНЫМ ЛОГОМ ПАРСИНГА) ---
@app.post("/api/v1/user/sync_referral")
async def sync_user_referral(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Исправленная версия (v2).
    Фикс синтаксиса OR для PostgREST (добавлены скобки).
    Добавлена проверка типа ответа (защита от KeyError).
    """
    logging.info("[REF DEBUG] 🟢 Эндпоинт вызван. Начинаем проверку...")

    try:
        # 1. Валидация
        user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
        if not user_info: 
            logging.error("[REF DEBUG] ❌ InitData НЕ прошла валидацию!")
            return {"status": "ignored"}
        
        telegram_id = user_info["id"]
        logging.info(f"[REF DEBUG] 👤 Пользователь: {telegram_id}")

        # 2. Парсинг
        parsed_init = dict(parse_qsl(request_data.initData))
        start_param = parsed_init.get("start_param")
        
        if start_param:
            logging.info(f"[REF DEBUG] 🎯 НАЙДЕН start_param: '{start_param}'")
            
            if start_param.startswith("r_"):
                target_id_str = start_param[2:]
                
                if target_id_str.isdigit():
                    target_ref_id = int(target_id_str)
                    logging.info(f"[REF DEBUG] 👉 Код реферала: {target_ref_id}. Ищем в базе...")
                    
                    # --- ИСПРАВЛЕНИЕ: Добавлены скобки () в параметр 'or' ---
                    res = await supabase.get(
                        "/users",
                        params={
                            "select": "telegram_id",
                            "or": f"(bott_ref_id.eq.{target_ref_id},bott_internal_id.eq.{target_ref_id})", # <--- СКОБКИ ВАЖНЫ!
                            "limit": 1
                        }
                    )
                    
                    data = res.json()
                    
                    # --- ЗАЩИТА ОТ ОШИБКИ (KeyError: 0) ---
                    if not isinstance(data, list):
                        logging.error(f"[REF DEBUG] ❌ Supabase вернул ошибку вместо списка: {data}")
                        return {"status": "db_error"}

                    if data:
                        found_referrer = data[0]['telegram_id']
                        logging.info(f"[REF DEBUG] ✅ Владелец кода найден: {found_referrer}")
                        
                        if found_referrer != telegram_id:
                            # Проверка на существование (через .get)
                            check_user_resp = await supabase.get(
                                "/users",
                                params={
                                    "telegram_id": f"eq.{telegram_id}",
                                    "select": "referrer_id"
                                }
                            )
                            check_data = check_user_resp.json()
                            
                            # Тоже проверяем, что пришел список
                            if isinstance(check_data, list) and check_data and check_data[0].get("referrer_id"):
                                 logging.info(f"[REF DEBUG] ⚠️ У юзера {telegram_id} УЖЕ есть реферал (ID: {check_data[0]['referrer_id']}). Пропускаем.")
                                 return {"status": "already_has_ref"}

                            # Записываем реферала
                            await supabase.patch(
                                "/users",
                                params={"telegram_id": f"eq.{telegram_id}"},
                                json={"referrer_id": found_referrer}
                            )
                            logging.info(f"[REF DEBUG] 🎉 УСПЕХ! Записали {found_referrer} как реферала для {telegram_id}")
                            return {"status": "success", "referrer": found_referrer}
                        else:
                            logging.warning(f"[REF DEBUG] ⚠️ Само-реферал.")
                    else:
                        logging.error(f"[REF DEBUG] ❌ Владелец кода {target_ref_id} не найден в базе.")
                else:
                     logging.error(f"[REF DEBUG] ❌ Код '{target_id_str}' не число.")
            else:
                logging.info(f"[REF DEBUG] ℹ️ start_param '{start_param}' не начинается на 'r_'.")
        else:
            pass 
                        
    except Exception as e:
        logging.error(f"[REF DEBUG] 💀 КРИТИЧЕСКАЯ ОШИБКА: {e}", exc_info=True)
        
    return {"status": "no_change"}
        
@app.post("/api/v1/shop/buy")
async def buy_bott_item_proxy(
    request_data: ShopBuyRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    logging.info("========== [SHOP] ПОКУПКА v9 (С ID ЗАКАЗА) ==========")
    
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    telegram_id = user_info["id"]
    price = request_data.price
    item_id = request_data.item_id
    
    # 1. Получаем ключи из БД
    try:
        user_db_resp = await supabase.get(
            "/users", 
            params={
                "telegram_id": f"eq.{telegram_id}",
                "select": "bot_t_coins,bott_internal_id,bott_secret_key"
            }
        )
        user_data_list = user_db_resp.json()
    except Exception as e:
        logging.error(f"[SHOP] Ошибка БД: {e}")
        raise HTTPException(status_code=500, detail="Ошибка базы данных")
    
    if not user_data_list:
        raise HTTPException(status_code=404, detail="Пользователь не найден.")
        
    user_record = user_data_list[0]
    bott_internal_id = user_record.get("bott_internal_id")
    bott_secret_key = user_record.get("bott_secret_key")
    current_balance_kopecks = user_record.get("bot_t_coins", 0)

    if not bott_internal_id or not bott_secret_key:
         raise HTTPException(status_code=400, detail="Данные авторизации устарели. Перезайдите в Меню.")

    # 2. Проверка баланса
    if current_balance_kopecks < (price * 100):
        raise HTTPException(status_code=400, detail="Недостаточно средств!")

    # 3. Создаем заказ в Bot-t
    url = "https://api.bot-t.com/v1/shopdigital/order-public/create"
    payload = {
        "bot_id": int(BOTT_BOT_ID),
        "category_id": item_id,
        "count": 1,
        "user_id": int(bott_internal_id),
        "secret_user_key": bott_secret_key
    }

    # --- ИСПРАВЛЕНИЕ ЗДЕСЬ (timeout=60.0) ---
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, json=payload)
        
        if resp.status_code != 200:
            # Логируем текст ошибки для отладки
            logging.error(f"[SHOP] Ошибка магазина {resp.status_code}: {resp.text}")
            raise HTTPException(status_code=500, detail=f"Ошибка магазина: {resp.text}")

        resp_json = resp.json()
        
        if resp_json.get("result") is False:
            err_msg = resp_json.get("message", "Неизвестная ошибка")
            raise HTTPException(status_code=400, detail=f"Магазин отклонил покупку: {err_msg}")

        # Получаем ID заказа из ответа Bot-t
        bott_order_data = resp_json.get("data", {})
        bott_order_id = bott_order_data.get("id")

        # 4. Обновляем баланс локально (списываем монеты)
        new_balance = current_balance_kopecks - (price * 100)
        await supabase.patch(
            "/users",
            params={"telegram_id": f"eq.{telegram_id}"},
            json={"bot_t_coins": new_balance} 
        )

        # 5. Сохраняем лог покупки в админку
        try:
            item_title = request_data.title or "Товар"
            item_image = request_data.image_url or ""
            
            safe_order_id = bott_order_id if bott_order_id else 0
            source_desc = f"{item_title}|{item_image}|{safe_order_id}"

            await supabase.post("/manual_rewards", json={
                "user_id": telegram_id,
                "status": "pending",
                "source_type": "shop",
                "reward_details": item_title,
                "source_description": source_desc
            })
            logging.info(f"[SHOP] Запись о покупке '{item_title}' (Order ID: {safe_order_id}) сохранена.")
        except Exception as e_log:
            logging.error(f"[SHOP] Не удалось сохранить лог покупки: {e_log}")

    return {"message": "Покупка успешна! Товар выдан."}

# --- ПОЛУЧЕНИЕ АССОРТИМЕНТА МАГАЗИНА ---
@app.get("/api/v1/user/grind/shop")
async def get_grind_shop(supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """Возвращает доступные номиналы промокодов."""
    try:
        response = await supabase.post("/rpc/get_grind_shop_inventory")
        return response.json()
    except Exception as e:
        logging.error(f"Shop inventory error: {e}")
        return [] # Возвращаем пустой список, если ошибка

# --- ПОКУПКА ДИНАМИЧЕСКОГО ПРОМОКОДА ---
class BuyPromoRequest(BaseModel):
    initData: str
    reward_value: int # Пользователь присылает только номинал, который хочет купить

@app.post("/api/v1/user/grind/buy_item")
async def buy_dynamic_promo_endpoint(
    request_data: BuyPromoRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        response = await supabase.post(
            "/rpc/buy_dynamic_promo",
            json={
                "p_user_id": user_info["id"],
                "p_reward_value": request_data.reward_value
            }
        )
        
        # Обработка ошибок SQL (например, код кончился или мало денег)
        if response.status_code != 200:
            error_data = response.json()
            # Пытаемся достать понятное сообщение
            msg = error_data.get("message", "Ошибка покупки")
            raise HTTPException(status_code=400, detail=msg)

        return response.json()

    except httpx.HTTPStatusError as e:
        # Ловим ошибки от raise exception в SQL
        error_msg = e.response.json().get("message", e.response.text)
        raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        logging.error(f"Buy promo error: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

@app.get("/api/v1/debug/test_all_tokens")
async def debug_test_all_tokens():
    """
    Проверяет все 3 доступных ключа на эндпоинте /referrals.
    """
    # 1. Данные для теста
    VALENTIN_INTERNAL_ID = 106597615
    URL = "https://api.bot-t.com/v1/bot/user/referrals"
    
    # 2. Список ключей для проверки
    tokens_to_test = [
        {
            "name": "PUBLIC KEY (Магазин)",
            "key": "3ff90f7d9067e067dc6bcd7440e3f860" 
        },
        {
            "name": "PRIVATE KEY (Старый)",
            "key": "a514e99bd44087724a23b4ebb3812381"
        },
        {
            "name": "USER SECRET (Валентин)",
            "key": "8b4ddc03c34915808b4d56e279964e1fbc3956e23de3d89e"
        }
    ]

    results = []

    async with httpx.AsyncClient() as client:
        for item in tokens_to_test:
            try:
                # Параметры запроса
                params = {"token": item["key"]}
                payload = {
                    "bot_id": int(BOTT_BOT_ID),
                    "user_id": VALENTIN_INTERNAL_ID,
                    "limit": 5
                }
                
                # Делаем запрос
                resp = await client.post(URL, params=params, json=payload)
                
                # Анализируем ответ
                data = resp.json()
                is_success = data.get("result") is True
                
                results.append({
                    "token_type": item["name"],
                    "status_code": resp.status_code,
                    "success": is_success,
                    "response_message": data.get("message", "No message"),
                    "data_preview": str(data.get("data"))[:100] if "data" in data else "No data"
                })
                
            except Exception as e:
                results.append({
                    "token_type": item["name"],
                    "error": str(e)
                })

    return {"test_results": results}

# --- 🛠️ РЕМОНТ ПОДПИСОК TWITCH ---
@app.get("/api/v1/debug/fix_twitch_subs")
async def fix_twitch_subs(
    request: Request,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Удаляет старые подписки и создает новые: Награды + СТРИМ (Online/Offline).
    """
    async with httpx.AsyncClient() as client:
        # 1. Получаем токен
        token_resp = await client.post(
            "https://id.twitch.tv/oauth2/token",
            data={
                "client_id": TWITCH_CLIENT_ID,
                "client_secret": TWITCH_CLIENT_SECRET,
                "grant_type": "client_credentials"
            }
        )
        if token_resp.status_code != 200:
            return {"error": "Twitch Auth Failed", "details": token_resp.json()}
        
        access_token = token_resp.json()["access_token"]
        headers = {
            "Client-ID": TWITCH_CLIENT_ID,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

        # 2. Ищем ID админа (стримера)
        admin_user = None
        for admin_id in ADMIN_IDS:
            u_resp = await supabase.get("/users", params={"telegram_id": f"eq.{admin_id}", "select": "twitch_id"})
            if u_resp.json() and u_resp.json()[0].get("twitch_id"):
                admin_user = u_resp.json()[0]
                break
        
        if not admin_user:
            return {"error": "Не найден Twitch ID админа. Зайдите в профиль бота и привяжите Twitch."}
        
        broadcaster_id = admin_user["twitch_id"]
        callback_url = f"{WEB_APP_URL}/api/v1/webhooks/twitch"

        # 3. Удаляем ВСЕ старые подписки
        subs_resp = await client.get("https://api.twitch.tv/helix/eventsub/subscriptions", headers=headers)
        if subs_resp.status_code == 200:
            for sub in subs_resp.json().get("data", []):
                # Удаляем вообще все, чтобы пересоздать чисто
                if sub["status"] != "enabled" or callback_url in sub["transport"]["callback"]:
                    await client.delete(f"https://api.twitch.tv/helix/eventsub/subscriptions?id={sub['id']}", headers=headers)

        # 4. Создаем НОВЫЕ подписки (Награды + Online + Offline)
        event_types = [
            "channel.channel_points_custom_reward_redemption.add",
            "stream.online",
            "stream.offline"
        ]
        
        created_subs = []
        for event_type in event_types:
            sub_payload = {
                "type": event_type,
                "version": "1",
                "condition": {"broadcaster_user_id": broadcaster_id},
                "transport": {
                    "method": "webhook",
                    "callback": callback_url,
                    "secret": TWITCH_WEBHOOK_SECRET
                }
            }
            create_resp = await client.post("https://api.twitch.tv/helix/eventsub/subscriptions", headers=headers, json=sub_payload)
            created_subs.append({event_type: create_resp.status_code})

        return {
            "message": "Подписки обновлены (Rewards + Stream Online/Offline)!",
            "broadcaster_id": broadcaster_id,
            "results": created_subs
        }

#### https://hatelavka-quest-nine.vercel.app/api/v1/debug/fix_twitch_subs <- ссылка для фикса

# --- API УВЕДОМЛЕНИЙ (WEB APP) ---

# --- API УВЕДОМЛЕНИЙ (WEB APP) ---

@app.post("/api/v1/user/settings/update_batch")
async def update_user_settings_batch(
    request_data: UserSettingsBatch,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Обновляет сразу несколько настроек одним запросом (Debounce)."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    telegram_id = user_info["id"]
    updates = request_data.updates
    
    # Фильтрация разрешенных полей (Защита)
    allowed_keys = {
        "notify_auction_start", "notify_auction_outbid", "notify_auction_end", 
        "notify_rewards", "notify_stream_start", "notify_daily_grind", "notify_dnd_enabled"
    }
    
    # Оставляем только безопасные ключи, которые есть в allowed_keys
    safe_updates = {k: v for k, v in updates.items() if k in allowed_keys}
    
    if not safe_updates:
        return {"status": "no_changes"}

    try:
        # Отправляем ОДИН запрос в базу на обновление всех полей
        await supabase.patch(
            "/users",
            params={"telegram_id": f"eq.{telegram_id}"},
            json=safe_updates
        )
        return {"status": "updated", "count": len(safe_updates)}
        
    except Exception as e:
        logging.error(f"Ошибка batch update: {e}")
        raise HTTPException(status_code=500, detail="DB Error")

@app.post("/api/v1/user/settings/get")
async def get_user_settings_api(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Возвращает настройки и статус активности бота."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info:
        # Возвращаем дефолт, чтобы профиль не ломался, если что-то не так с авторизацией
        return {"is_bot_active": False}
    
    telegram_id = user_info["id"]
    
    # Запрашиваем статус активности и настройки
    resp = await supabase.get(
        "/users", 
        params={
            "telegram_id": f"eq.{telegram_id}",
            "select": "is_bot_active,notify_auction_start,notify_auction_outbid,notify_auction_end,notify_rewards,notify_stream_start,notify_daily_grind,notify_dnd_enabled"
        }
    )
    
    data = resp.json()
    if not data:
        return {"is_bot_active": False}
        
    return data[0]

@app.post("/api/v1/user/settings/update")
async def update_user_setting_api(
    request_data: UserSettingsUpdate,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Переключает тумблер настройки."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    telegram_id = user_info["id"]
    
    # Разрешенные поля
    allowed = [
        "notify_auction_start", "notify_auction_outbid", "notify_auction_end", 
        "notify_rewards", "notify_stream_start", "notify_daily_grind", "notify_dnd_enabled"
    ]
    
    if request_data.key not in allowed:
        raise HTTPException(status_code=400, detail="Invalid setting")
        
    await supabase.patch(
        "/users",
        params={"telegram_id": f"eq.{telegram_id}"},
        json={request_data.key: request_data.value}
    )
    return {"status": "ok"}

@app.post("/api/v1/user/notification/test")
async def send_test_notification_api(
    request_data: TestNotificationRequest,
    background_tasks: BackgroundTasks
):
    """Отправляет тестовое сообщение (ТОЧНАЯ КОПИЯ РЕАЛЬНЫХ)."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    telegram_id = user_info["id"]
    n_type = request_data.type
    
    msg = ""
    
    if n_type == 'notify_auction_start':
        # Формат, как если бы админ запустил аукцион
        msg = (
            "📢 <b>Новый аукцион!</b>\n\n"
            "Лот: «SKIN (TEST)»\n"
            "Начальная цена: 10 🎟️\n\n"
            "Делайте ваши ставки в приложении!"
        )

    elif n_type == 'notify_auction_outbid':
        # Точная копия из make_auction_bid
        msg = (
            "⚠️ <b>Вашу ставку перебили!</b>\n\n"
            "Аукцион: «SKIN (TEST)»\n"
            "Новая ставка: 150 🎟️\n\n"
            "Успейте сделать новую ставку!"
        )

    elif n_type == 'notify_rewards':
        # Точная копия из send_approval_notification / Twitch rewards
        msg = (
            "<b>🎉 Твоя награда за «SKIN (TEST)»!</b>\n\n"
            "Скопируй промокод и используй его в @HATElavka_bot, чтобы получить свои звёзды.\n\n"
            "Твой промокод:\n<code>TEST-CODE-123</code>"
        )

    elif n_type == 'notify_stream_start':
        # Точная копия из process_twitch_notification_background
        msg = (
            "🟣 <b>Стрим НАЧАЛСЯ!</b>\n\n"
            "Залетайте на трансляцию, лутайте баллы и участвуйте в ивентах! 🚀\n\n"
            "https://www.twitch.tv/hatelove_ttv"
        )

    elif n_type == 'notify_daily_grind':
        # Стандартный формат для монетки
        msg = (
            "💰 <b>Монетка доступна!</b>\n\n"
            "Зайдите в приложение, чтобы забрать свою ежедневную награду за активность."
        )

    elif n_type == 'notify_dnd_enabled':
        # Информационное сообщение о режиме
        msg = (
            "🌙 <b>Тихий режим активен</b>\n\n"
            "Бот не будет присылать уведомления с 23:00 до 08:00 (МСК), чтобы вы могли отдохнуть."
        )

    else:
        msg = "🔔 Тестовое уведомление работает!"

    # Отправляем через безопасную функцию (которая учитывает блокировку бота)
    background_tasks.add_task(safe_send_message, telegram_id, msg)
    
    return {"status": "sent"}

# --- ADVENT CALENDAR ENDPOINTS ---

STAT_MAPPING = {
    # Twitch Сообщения
    "twitch_messages_daily": "daily_message_count",
    "twitch_messages_weekly": "weekly_message_count",
    "twitch_messages_monthly": "monthly_message_count",
    "twitch_messages_total": "total_message_count",
    
    # Twitch Аптайм
    "twitch_uptime_daily": "daily_uptime_minutes",
    "twitch_uptime_weekly": "weekly_uptime_minutes",
    "twitch_uptime_monthly": "monthly_uptime_minutes",
    "twitch_uptime_total": "total_uptime_minutes",

    # Telegram Сообщения
    "tg_messages_daily": "telegram_daily_message_count",
    "tg_messages_weekly": "telegram_weekly_message_count",
    "tg_messages_monthly": "telegram_monthly_message_count",
    "tg_messages_total": "telegram_total_message_count",
    
    # Челленджи (просто счетчик выполненных)
    "challenges_total": "completed_challenges_count"
}

@app.get("/api/v1/advent/state")
async def get_advent_state(telegram_id: int, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    # 1. Получаем настройки (чтобы узнать дату старта)
    settings = await get_admin_settings_async_global()
    
    # Определяем "текущий день ивента"
    now = datetime.now(timezone(timedelta(hours=3)))
    
    if settings.advent_start_date:
        try:
            start_dt = datetime.strptime(settings.advent_start_date, "%Y-%m-%d").replace(tzinfo=timezone(timedelta(hours=3)))
            # Разница в днях + 1 (если старт сегодня, то это День 1)
            current_event_day = (now.date() - start_dt.date()).days + 1
        except ValueError:
            current_event_day = now.day # Фолбек на календарный день
    else:
        current_event_day = now.day # По умолчанию - число месяца

    # Если ивент еще не начался
    if current_event_day < 1:
        current_event_day = 0 

    # 2. Получаем конфиг дней и прогресс
    days_resp = await supabase.get("/advent_calendar_days", params={"order": "day_id.asc"})
    progress_resp = await supabase.get("/user_advent_progress", params={"user_id": f"eq.{telegram_id}"})
    
    # 3. Статистика юзера
    user_stats_resp = await supabase.get("/users", params={"telegram_id": f"eq.{telegram_id}"})
    
    days_config = days_resp.json() if days_resp.status_code == 200 else []
    claimed_days = {item['day_id'] for item in (progress_resp.json() if progress_resp.status_code == 200 else [])}
    user_stats = user_stats_resp.json()[0] if user_stats_resp.json() else {}

    calendar = []
    
    for day in days_config:
        d_id = day['day_id']
        status = "locked"
        progress_val = 0
        target = day['task_target']
        t_type = day['task_type']
        
        # Скрываем описание награды, если день не активен и не забран
        description = day['description']
        is_secret = True 

        # --- ЛОГИКА СТАТУСОВ ---
        if d_id < current_event_day:
            if d_id in claimed_days:
                status = "claimed"
                is_secret = False # Уже забрал - видит
            else:
                status = "burned"
                # Сгорело - остается секретом!
        
        elif d_id == current_event_day:
            is_secret = False # Текущий день - видим задание
            if d_id in claimed_days:
                status = "claimed"
            else:
                # Проверка выполнения (копируем логику из прошлого ответа)
                col = STAT_MAPPING.get(t_type)
                if col:
                    val = int(user_stats.get(col, 0))
                    progress_val = min(val, target)
                    status = "ready" if val >= target else "active"
                elif t_type == 'challenge_daily':
                    # Логика челленджа...
                    last_comp = user_stats.get('last_challenge_completed_at')
                    is_done = False
                    if last_comp:
                        ld = datetime.fromisoformat(last_comp.replace('Z', '+00:00')).astimezone(timezone(timedelta(hours=3))).date()
                        if ld == now.date(): is_done = True
                    progress_val = 1 if is_done else 0
                    status = "ready" if is_done else "active"
                else:
                    status = "active"
        
        else:
            status = "locked" # Будущее - секрет

        # Если секрет - не отдаем описание задания (интрига)
        final_desc = "Секретное задание" if (is_secret and status != 'claimed') else description

        calendar.append({
            "day": d_id,
            "status": status,
            "description": final_desc,
            "progress": progress_val,
            "target": target,
            "task_type": t_type,
            "is_secret": is_secret
        })
        
    return {"calendar": calendar, "current_day": current_event_day}

@app.post("/api/v1/advent/claim")
async def claim_advent_day(
    request_data: AdventClaimRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info: raise HTTPException(status_code=401)
    telegram_id = user_info['id']
    day_id = request_data.day_id
    
    # 1. Проверки (день, повтор)
    now = datetime.now(timezone(timedelta(hours=3)))
    if day_id != now.day:
        raise HTTPException(status_code=400, detail="Этот день нельзя открыть сегодня.")
        
    check_dup = await supabase.get("/user_advent_progress", params={"user_id": f"eq.{telegram_id}", "day_id": f"eq.{day_id}"})
    if check_dup.json():
        raise HTTPException(status_code=400, detail="Уже получено.")

    # 2. Розыгрыш приза (Лутбокс)
    loot_resp = await supabase.get("/advent_loot_items", params={"is_active": "eq.true"})
    items = loot_resp.json()
    
    if not items:
        reward_name = "Секретный приз (обратитесь к админу)"
    else:
        # Взвешенный рандом
        weights = [item['chance_weight'] for item in items]
        winner_item = random.choices(items, weights=weights, k=1)[0]
        reward_name = winner_item['name']

    # 3. Сохранение
    # А) В прогресс (чтобы закрыть день)
    await supabase.post("/user_advent_progress", json={
        "user_id": telegram_id, "day_id": day_id, "reward_received": reward_name
    })
    
    # Б) В админку на выдачу (manual_rewards)
    # Используем source_type='advent', чтобы отловить в админке
    await supabase.post("/manual_rewards", json={
        "user_id": telegram_id,
        "status": "pending",
        "reward_details": reward_name,
        "source_type": "advent", 
        "source_description": f"Адвент: День {day_id}"
    })
    
    return {"message": "Награда получена!", "reward": reward_name}

# --- Админские ручки ---

@app.post("/api/v1/admin/advent/items/add")
async def add_advent_item(req: AdventLootItemCreate, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(req.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(403)
    await supabase.post("/advent_loot_items", json=req.dict(exclude={'initData'}))
    return {"success": True}

@app.post("/api/v1/admin/advent/items/delete")
async def delete_advent_item(req: AdventLootItemDelete, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(req.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(403)
    await supabase.delete("/advent_loot_items", params={"id": f"eq.{req.item_id}"})
    return {"success": True}

@app.post("/api/v1/admin/advent/days/update")
async def update_advent_day(req: AdventDayUpdate, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(req.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(403)
    await supabase.patch("/advent_calendar_days", params={"day_id": f"eq.{req.day_id}"}, json={
        "task_type": req.task_type, "task_target": req.task_target, "description": req.description
    })
    return {"success": True}
    
@app.post("/api/v1/admin/advent/items/list")
async def list_advent_items(req: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(req.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(403)
    r = await supabase.get("/advent_loot_items", params={"order": "id.desc"})
    return r.json()
    
@app.post("/api/v1/admin/advent/days/list")
async def list_advent_days(req: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(req.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(403)
    r = await supabase.get("/advent_calendar_days", params={"order": "day_id.asc"})
    return r.json()

# --- 🎄 ЛОГИКА НОВОГОДНЕГО ПОДАРКА 🎄 ---

@app.post("/api/v1/gift/check")
async def check_gift_availability(
    request_data: GiftCheckRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    telegram_id = user_info['id']
    
    # Получаем время последнего подарка
    resp = await supabase.get("/users", params={"telegram_id": f"eq.{telegram_id}", "select": "last_new_year_gift_at"})
    user_data = resp.json()
    
    available = True
    if user_data and user_data[0]['last_new_year_gift_at']:
        last_gift = datetime.fromisoformat(user_data[0]['last_new_year_gift_at'].replace('Z', '+00:00'))
        now = datetime.now(timezone.utc)
        # Если подарок был получен сегодня (по дате UTC), то недоступен
        if last_gift.date() == now.date():
            available = False
            
    return {"available": available}

@app.post("/api/v1/gift/claim")
async def claim_gift(
    request_data: GiftClaimRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    # --- 1. АВТОРИЗАЦИЯ ---
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    telegram_id = user_info['id']

    # Проверка: получал ли уже подарок (это блокируем жестко)
    check_resp = await check_gift_availability(GiftCheckRequest(initData=request_data.initData), supabase)
    if not check_resp['available']:
        raise HTTPException(status_code=400, detail="Подарок уже получен сегодня! Приходите завтра.")

    # --- 2. ПРОВЕРКА ПОДПИСКИ (МЯГКАЯ) ---
    REQUIRED_CHANNEL_ID = -1002144676097
    is_subscribed = False # По умолчанию считаем, что не подписан
    
    try:
        chat_member = await bot.get_chat_member(chat_id=REQUIRED_CHANNEL_ID, user_id=telegram_id)
        if chat_member.status in ["creator", "administrator", "member", "restricted"]:
             is_subscribed = True
    except Exception as e:
        logging.error(f"Ошибка проверки подписки: {e}")
        # Если ошибка API, можно дать поблажку, но для строгости оставим False
        pass

    # --- 3. РАСЧЕТ НАГРАДЫ (ВИЗУАЛЬНЫЙ) ---
    # Мы рассчитываем, что выпало, но НЕ ЗАПИСЫВАЕМ в базу, если нет подписки
    
    prize_type = "none"
    prize_value = 0
    prize_meta = {}

    # Получаем скины (для расчета вероятности)
    skins_resp = await supabase.get("/gift_skins", params={"is_active": "eq.true"})
    skins = skins_resp.json()
    
    won_skin = None
    # 35% шанс на скин
    if skins and random.random() < 0.35:
        total_chance = sum(s['chance'] for s in skins)
        if total_chance > 0:
            pick = random.uniform(0, total_chance)
            current = 0
            for skin in skins:
                current += skin['chance']
                if pick <= current:
                    won_skin = skin
                    break
    
    if won_skin:
        # === ВЫПАЛ СКИН ===
        prize_type = "skin"
        prize_meta = {"name": won_skin['name'], "image_url": won_skin['image_url']}
        
        # ЗАПИСЬ В БАЗУ ТОЛЬКО ЕСЛИ ПОДПИСАН
        if is_subscribed:
            await supabase.post("/manual_rewards", json={
                "user_id": telegram_id,
                "status": "pending",
                "reward_details": f"Скин: {won_skin['name']}",
                "source_type": "gift_skin",
                "source_description": "Новогодний Подарок"
            })
            logging.info(f"🎁 GIFT: Юзер {telegram_id} выиграл СКИН: {won_skin['name']}")

    else:
        # === БИЛЕТЫ ИЛИ МОНЕТЫ ===
        if random.random() < 0.5:
            # --- БИЛЕТЫ ---
            roll = random.random()
            if roll < 0.6: amount = random.randint(1, 10)
            elif roll < 0.9: amount = random.randint(11, 20)
            else: amount = random.randint(21, 30)
            
            prize_type = "tickets"
            prize_value = amount
            
            # ЗАПИСЬ В БАЗУ ТОЛЬКО ЕСЛИ ПОДПИСАН
            if is_subscribed:
                await supabase.post("/rpc/increment_tickets", json={"p_user_id": telegram_id, "p_amount": amount})
                logging.info(f"🎁 GIFT: Юзер {telegram_id} получил {amount} билетов.")
            
        else:
            # --- МОНЕТЫ ---
            prize_type = "coins"
            
            # Если ПОДПИСАН — берем реальный код из базы
            if is_subscribed:
                # 1. Ищем свободные коды <= 20
                response_codes = await supabase.get(
                    "/promocodes",
                    params={
                        "select": "id,code,reward_value",
                        "is_used": "eq.false",
                        "telegram_id": "is.null",
                        "reward_value": "lte.20",
                        "order": "reward_value.asc",
                        "limit": "50"
                    }
                )
                available_codes = response_codes.json()

                if not available_codes:
                    # Фолбэк на билеты, если коды кончились
                    prize_type = "tickets"
                    prize_value = 10
                    await supabase.post("/rpc/increment_tickets", json={"p_user_id": telegram_id, "p_amount": 10})
                    # Тут можно ретёрн сделать или просто продолжить, но логика понятна
                else:
                    count = len(available_codes)
                    random_index = int(random.triangular(0, count - 1, 0))
                    promo = available_codes[random_index]
                    
                    amount = promo.get('reward_value') or random.randint(1, 5)
                    prize_value = amount
                    code_str = promo['code']
                    
                    # Закрепляем код
                    await supabase.patch(
                        "/promocodes", 
                        params={"id": f"eq.{promo['id']}"}, 
                        json={
                            "is_used": True,
                            "telegram_id": telegram_id,
                            "reward_value": amount,
                            "description": f"Новогодний подарок ({amount} монеток)",
                            "claimed_at": datetime.now().isoformat()
                        }
                    )
                    prize_meta = {"code": code_str}
                    logging.info(f"🎁 GIFT: Юзер {telegram_id} забрал код {code_str} на {amount} монет.")

            else:
                # ЕСЛИ НЕ ПОДПИСАН — Генерируем "Фейк" для показа
                # Просто показываем юзеру "Ты мог выиграть X монет", но код не даем
                amount = random.randint(1, 20) 
                prize_value = amount
                # Код скрываем
                prize_meta = {"code": "🔒 ПОДПИШИСЬ"} 

    # --- 4. ФИНАЛ ---
    
    # Если НЕ ПОДПИСАН — возвращаем данные для тизера
    if not is_subscribed:
        return {
            "type": prize_type,
            "value": prize_value,
            "meta": prize_meta,
            "subscription_required": True,
            "message": "Подпишись, чтобы забрать награду!"
        }

    # 1. ВЫЧИСЛЯЕМ МОСКОВСКОЕ ВРЕМЯ (UTC + 3 часа)
    # Важно: убедитесь, что наверху файла есть: from datetime import timedelta
    moscow_now = datetime.utcnow() + timedelta(hours=3)
    claim_time_str = moscow_now.isoformat()

    # Если ПОДПИСАН — обновляем дату получения подарка в базе
    await supabase.patch("/users", params={"telegram_id": f"eq.{telegram_id}"}, json={
        "last_new_year_gift_at": datetime.now(timezone.utc).isoformat() # В базе лучше хранить UTC
    })

    # 2. ВОЗВРАЩАЕМ ВРЕМЯ НА ТЕЛЕФОН
    return {
        "type": prize_type,
        "value": prize_value,
        "meta": prize_meta,
        "subscription_required": False,
        "claimed_at": claim_time_str  # <--- ВОТ ЭТО ПОЛЕ НУЖНО ДОБАВИТЬ
    }

@app.post("/api/v1/admin/gift/skins/list")
async def list_gift_skins(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
        
    resp = await supabase.get("/gift_skins", params={"order": "created_at.desc"})
    return resp.json()

@app.post("/api/v1/admin/gift/skins/add")
async def add_gift_skin(
    request_data: GiftSkinCreateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
        
    await supabase.post("/gift_skins", json={
        "name": request_data.name,
        "image_url": request_data.image_url,
        "chance": request_data.chance
    })
    return {"message": "Скин добавлен"}

@app.post("/api/v1/admin/gift/skins/delete")
async def delete_gift_skin(
    request_data: GiftSkinDeleteRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
        
    await supabase.delete("/gift_skins", params={"id": f"eq.{request_data.skin_id}"})
    return {"message": "Скин удален"}

@app.post("/api/v1/admin/advent/pending_list")
async def get_advent_pending_list(req: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(req.initData, ALL_VALID_TOKENS)
    if not user_info or user_info['id'] not in ADMIN_IDS: raise HTTPException(403)
    
    # Получаем список из manual_rewards с типом 'advent'
    response = await supabase.get("/manual_rewards", params={
        "status": "eq.pending",
        "source_type": "eq.advent",
        "select": "*, users(full_name, username, trade_link)" # Подтягиваем данные юзера
    })
    
    data = response.json()
    # Форматируем под функцию renderCheckpointPrizes в JS
    formatted = []
    for item in data:
        user = item.get('users', {}) or {}
        formatted.append({
            "id": item['id'],
            "source_description": item.get('source_description', 'Адвент'),
            "reward_details": item.get('reward_details', 'Награда'),
            "user_full_name": user.get('full_name', 'Неизвестный'),
            "user_trade_link": user.get('trade_link'),
            "created_at": item['created_at']
        })
    return formatted

# ==========================================================
#        МОДУЛЬ TELEGRAM ИСПЫТАНИЙ (FULL FIXED)
# ==========================================================

# 1. Читаем настройки из Vercel (или берем по умолчанию)
TG_QUEST_CHANNEL_ID = int(os.getenv("TG_QUEST_CHANNEL_ID", "0")) 
TG_QUEST_SURNAME = os.getenv("TG_QUEST_SURNAME", "BotName")           
TG_QUEST_BIO_LINK = os.getenv("TG_QUEST_BIO_LINK", "t.me/MyBotLink")      
TG_REACTION_WEEKLY_LIMIT = 7  # Лимит реакций

# 2. Вспомогательная функция для парсинга initData
async def get_user_id_from_init_data(init_data: str) -> Optional[int]:
    try:
        if not init_data: return None
        parsed_data = dict(parse_qsl(init_data))
        if "user" not in parsed_data: return None
        return json.loads(parsed_data["user"]).get("id")
    except Exception:
        return None

# 3. Модель ответа
class TelegramQuestResponse(BaseModel):
    subscribed: bool
    vote_available: bool
    surname_ok: bool
    bio_ok: bool
    reactions_count: int
    reactions_target: int = TG_REACTION_WEEKLY_LIMIT

# --- ЭНДПОИНТЫ API ---

# --- Вспомогательная функция расчета награды ---
def calculate_daily_reward(total_amount, total_days, current_day):
    """
    Рассчитывает награду на текущий день, чтобы в сумме вышло ровно total_amount.
    Логика: Размазываем остаток по первым дням.
    Пример: 15 билетов, 7 дней.
    База = 2. Остаток = 1.
    День 1: 3 билета. Дни 2-7: 2 билета. Итого 15.
    """
    if current_day > total_days: return 0
    
    base_reward = total_amount // total_days
    remainder = total_amount % total_days
    
    # Если текущий день (1-based) попадает в остаток, даем +1
    if current_day <= remainder:
        return base_reward + 1
    return base_reward

@app.post("/api/v1/telegram/claim_daily")
async def claim_daily_task(
    request: Request, 
    data: dict = Body(...), 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    try:
        # === 1. ВАЛИДАЦИЯ ID ===
        try:
            user_id = int(data.get("user_id"))
        except (ValueError, TypeError):
            return JSONResponse({"success": False, "error": "Некорректный user_id"})

        task_key = data.get("task_key")
        
        # === 2. ПОЛУЧАЕМ ЗАДАНИЕ ===
        task_resp = await supabase.get(
            "/telegram_tasks", 
            params={"task_key": f"eq.{task_key}", "select": "*", "limit": 1}
        )
        task_data = task_resp.json()
        
        if not task_data:
             return JSONResponse({"success": False, "error": "Задание не найдено"})
        
        task = task_data[0]

        # === 3. ПОЛУЧАЕМ ПРОГРЕСС ===
        progress_resp = await supabase.get(
            "/user_telegram_progress", 
            params={"user_id": f"eq.{user_id}", "task_key": f"eq.{task_key}", "select": "*"}
        )
        progress_list = progress_resp.json()

        if progress_list:
            progress = progress_list[0]
        else:
            progress = {"user_id": user_id, "task_key": task_key, "current_day": 0, "completed": False}
            await supabase.post("/user_telegram_progress", json=progress)

        # === 4. БАЗОВЫЕ ПРОВЕРКИ (ВРЕМЯ / СТАТУС) ===
        if progress["completed"]:
            return JSONResponse({"success": False, "error": "Задание уже выполнено!"})

        if task.get("is_daily") and progress.get("last_claimed_at"):
            last_claim = parser.isoparse(progress["last_claimed_at"])
            if datetime.now(timezone.utc) - last_claim < timedelta(hours=20):
                return JSONResponse({"success": False, "error": "Награда уже получена сегодня. Приходи завтра!"})

        if task.get("is_daily") and progress["current_day"] >= task["total_days"]:
             return JSONResponse({"success": False, "error": "Цикл заданий завершен!"})

        # === 5. ЛОГИКА ПРОВЕРКИ (ИМЕННО ТУТ ОТКРЫВАЮТСЯ ОКНА) ===
        check_passed = False
        
        # А. Проверка подписки
        if task_key == "tg_sub":
            channel_id = os.getenv("TG_QUEST_CHANNEL_ID")
            try:
                member = await bot.get_chat_member(chat_id=channel_id, user_id=user_id)
                if member.status in ["creator", "administrator", "member", "restricted"]:
                    check_passed = True
                else:
                    return JSONResponse({"success": False, "error": "Вы не подписаны на канал!"})
            except Exception:
                return JSONResponse({"success": False, "error": "Не удалось проверить подписку."})

        # Б. Проверка бустов
        elif task_key == "tg_vote":
            channel_id = os.getenv("TG_QUEST_CHANNEL_ID")
            try:
                user_boosts = await bot.get_user_chat_boosts(chat_id=channel_id, user_id=user_id)
                if user_boosts.boosts:
                    check_passed = True
                else:
                    return JSONResponse({"success": False, "error": "Голос не найден!"})
            except Exception:
                 return JSONResponse({"success": False, "error": "Бот не может проверить голос."})

        # В. Текстовые проверки (Фамилия / Био) -> ТУТ КРАСИВЫЕ ОКНА
        else:
            try:
                user_chat = await bot.get_chat(user_id)
                phrase = (task.get("check_phrase") or "").lower().strip()
                check_type = task.get("check_type")

                if check_type == "surname":
                    # Ищем во всем имени (Name + Lastname), чтобы работало надежнее
                    full_name = (user_chat.full_name or "").lower()
                    if phrase and phrase in full_name:
                        check_passed = True
                        
                elif check_type == "bio":
                    bio = (user_chat.bio or "").lower()
                    if phrase and phrase in bio:
                        check_passed = True
                else:
                    check_passed = True # Обычный клик
                    
            except Exception as e:
                # Если настройки приватности скрывают данные
                return JSONResponse({"success": False, "error": "Не удалось проверить профиль. Проверьте настройки приватности."})

        if not check_passed:
            target = "фамилии" if task.get("check_type") == "surname" else "описании (BIO)"
            # ВАЖНО: Фраза "Условие не выполнено" триггерит твой JS на открытие красивого попапа
            return JSONResponse({
                "success": False, 
                "error": f"Условие не выполнено! Проверьте наличие '{task.get('check_phrase')}' в {target}."
            })


        # === 6. НАЧИСЛЕНИЕ НАГРАДЫ (ТВОЙ КОД) ===
        reward = task.get("reward_amount", 0)

        # 1. Получаем АКТУАЛЬНЫЙ баланс
        user_resp = await supabase.get("/users", params={"telegram_id": f"eq.{user_id}", "select": "tickets"})
        current_tickets = 0
        if user_resp.json():
            current_tickets = user_resp.json()[0].get("tickets", 0)
        
        new_balance = current_tickets + reward

        # 2. Обновляем баланс в базе
        await supabase.patch(
            "/users",
            params={"telegram_id": f"eq.{user_id}"},
            json={"tickets": new_balance}
        )

        # === 7. ОБНОВЛЕНИЕ ПРОГРЕССА И БАРОВ ===
        # Вычисляем следующий день
        next_day = progress["current_day"] + 1
        is_done = True if not task.get("is_daily") else (next_day >= task["total_days"])
        
        update_data = {
            "current_day": next_day,
            "last_claimed_at": datetime.now(timezone.utc).isoformat(),
            "completed": is_done
        }
        
        await supabase.patch(
            "/user_telegram_progress", 
            params={"user_id": f"eq.{user_id}", "task_key": f"eq.{task_key}"},
            json=update_data
        )

        return JSONResponse({
            "success": True, 
            "reward": reward,
            # ВОТ ЭТО ОБНОВЛЯЕТ НИЖНИЕ ЧЕРТОЧКИ (ПРОГРЕСС БАР):
            "day": next_day, 
            "total_days": task.get("total_days", 1),
            "is_completed": is_done, 
            "tickets": new_balance, 
            "message": f"Задание выполнено! +{reward} билетов"
        })

    except Exception as e:
        print(f"Global Error: {e}")
        return JSONResponse({"success": False, "error": f"Ошибка сервера: {str(e)}"})
        
@app.post("/api/v1/telegram/status")
async def get_telegram_status(
    request: Request,
    # Используем Depends, если get_supabase_client определен в index.py
    # Если нет - замените на глобальный supabase, если он AsyncClient
    supabase_client: httpx.AsyncClient = Depends(get_supabase_client) 
):
    """Отдает статус заданий для отрисовки интерфейса (1в1 Twitch)"""
    try:
        body = await request.json()
        user_id = await get_user_id_from_init_data(body.get("initData"))
        if not user_id: return JSONResponse({"error": "No user"}, status=401)
        
        # 1. Запрашиваем состояние из базы
        res = await supabase_client.get("/telegram_challenges", params={"user_id": f"eq.{user_id}"})
        
        # Если записи нет — создаем дефолтную
        if not res.json():
            record = {
                "user_id": user_id,
                "is_subscribed": False,
                "last_vote_date": None,
                "has_bot_surname": False,
                "has_ref_link": False,
                "reaction_count_weekly": 0,
                "last_reaction_reset": datetime.now(timezone.utc).isoformat()
            }
            await supabase_client.post("/telegram_challenges", json=record)
        else:
            record = res.json()[0]

        # 2. Авто-проверка подписки при открытии (если еще не выполнено)
        is_sub = record.get('is_subscribed', False)
        if not is_sub and TG_QUEST_CHANNEL_ID != 0:
            try:
                member = await bot.get_chat_member(chat_id=TG_QUEST_CHANNEL_ID, user_id=user_id)
                if member.status in ["member", "administrator", "creator", "restricted"]:
                    is_sub = True
                    # Фиксируем в базе
                    await supabase_client.patch("/telegram_challenges", params={"user_id": f"eq.{user_id}"}, json={"is_subscribed": True})
                    # Начисляем 5 билетов через RPC
                    await supabase_client.post("/rpc/increment_tickets", json={"p_user_id": user_id, "p_amount": 5})
            except Exception as e:
                logging.warning(f"[TG Quest] Sub check fail: {e}")

        # 3. Проверка доступности голосования (30 дней)
        vote_avail = True
        last_vote_str = record.get('last_vote_date')
        if last_vote_str:
            lv = datetime.fromisoformat(last_vote_str.replace('Z', '+00:00'))
            if datetime.now(timezone.utc) - lv < timedelta(days=30):
                vote_avail = False

        # 4. Визуальный сброс счетчика реакций, если неделя прошла
        r_count = record.get('reaction_count_weekly', 0)
        last_reset_str = record.get('last_reaction_reset')
        if last_reset_str:
            l_reset = datetime.fromisoformat(last_reset_str.replace('Z', '+00:00'))
            if datetime.now(timezone.utc) - l_reset > timedelta(days=7):
                r_count = 0

        return JSONResponse({
            "subscribed": is_sub,
            "vote_available": vote_avail,
            "surname_ok": record.get('has_bot_surname', False),
            "bio_ok": record.get('has_ref_link', False),
            "reactions_count": r_count,
            "reactions_target": TG_REACTION_WEEKLY_LIMIT
        })
    except Exception as e:
        logging.error(f"Telegram status error: {e}")
        return JSONResponse({"error": str(e)}, status=500)

@app.post("/api/v1/telegram/check_profile")
async def check_telegram_profile(
    request: Request,
    supabase_client: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Проверка Фамилии и Био по кнопке"""
    try:
        body = await request.json()
        user_id = await get_user_id_from_init_data(body.get("initData"))
        if not user_id:
            return JSONResponse({"error": "Auth failed"}, status=401)

        # Берем текущий статус
        db_res = await supabase_client.get("/telegram_challenges", params={"user_id": f"eq.{user_id}"})
        if not db_res.json():
            return JSONResponse({"error": "No record"}, status=404)
        curr = db_res.json()[0]

        # Проверяем реальный профиль через API бота
        try:
            chat = await bot.get_chat(user_id)
        except:
            return JSONResponse({"success": False, "message": "Бот не видит вас. Нажмите /start"}, status=400)
        
        last_name = chat.last_name or ""
        bio = chat.bio or ""

        # Сравниваем с переменными
        s_ok = TG_QUEST_SURNAME.lower() in last_name.lower() if TG_QUEST_SURNAME else False
        b_ok = TG_QUEST_BIO_LINK.lower() in bio.lower() if TG_QUEST_BIO_LINK else False
        
        updates = {}
        # Флаги, выдали ли мы награду ПРЯМО СЕЙЧАС
        s_rewarded = False
        b_rewarded = False

        # Начисляем, только если выполнено ВПЕРВЫЕ
        if s_ok and not curr.get('has_bot_surname'):
            updates['has_bot_surname'] = True
            await supabase_client.post("/rpc/increment_tickets", json={"p_user_id": user_id, "p_amount": 15})
            s_rewarded = True # <--- ЗАПОМИНАЕМ, ЧТО ВЫДАЛИ

        if b_ok and not curr.get('has_ref_link'):
            updates['has_ref_link'] = True
            await supabase_client.post("/rpc/increment_tickets", json={"p_user_id": user_id, "p_amount": 20})
            b_rewarded = True # <--- ЗАПОМИНАЕМ, ЧТО ВЫДАЛИ

        if updates:
            await supabase_client.patch("/telegram_challenges", params={"user_id": f"eq.{user_id}"}, json=updates)

        return JSONResponse({
            "success": True,
            "surname": s_ok or curr.get('has_bot_surname'),
            "bio": b_ok or curr.get('has_ref_link'),
            # Возвращаем информацию о факте выдачи награды
            "surname_rewarded": s_rewarded,
            "bio_rewarded": b_rewarded
        })

    except Exception as e:
        return JSONResponse({"error": str(e)}, status=500)

# --- СПЕЦИАЛЬНЫЙ ЭНДПОИНТ ДЛЯ ВКЛЮЧЕНИЯ РЕАКЦИЙ ---
@app.get("/api/v1/admin/fix_webhook")
async def fix_webhook_settings():
    """
    Запусти этот эндпоинт один раз в браузере, чтобы включить реакции.
    Пример: https://твоя-ссылка.vercel.app/api/v1/admin/fix_webhook
    """
    webhook_url = f"{WEB_APP_URL}/api/v1/webhook"
    
    # Указываем ВСЕ типы обновлений, включая реакции
    updates = [
        "message", 
        "callback_query", 
        "chat_member", 
        "my_chat_member", 
        "message_reaction",        # <--- ВОТ ОНО
        "message_reaction_count"
    ]
    
    try:
        # Сначала удаляем (на всякий случай)
        await bot.delete_webhook()
        # Ставим заново с правильными настройками
        await bot.set_webhook(url=webhook_url, allowed_updates=updates)
        return {"status": "ok", "message": "Вебхук обновлен! Реакции включены.", "url": webhook_url}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

# --- НАСТРОЙКИ ---
# ID канала для голосования/подписки (обязательно начинается с -100...)
VOTING_CHANNEL_ID = "-1002144676097"  # <--- ЗАМЕНИ НА СВОЙ ID

@app.post("/api/v1/telegram/vote")
async def telegram_vote(
    request: Request,
    supabase_client: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Голосование за канал (Boosts).
    Проверяет, отдал ли пользователь голос (буст) за канал.
    """
    try:
        body = await request.json()
        user_id = await get_user_id_from_init_data(body.get("initData"))
        if not user_id:
            return JSONResponse({"error": "Auth failed"}, status=401)

        # 1. Берем ID канала из настроек (или впиши вручную, например -100...)
        target_channel_id = TG_QUEST_CHANNEL_ID if TG_QUEST_CHANNEL_ID != 0 else -1001234567890 
        # ЗАМЕНИ -1001234567890 НА СВОЙ ID, ЕСЛИ ПЕРЕМЕННАЯ НЕ РАБОТАЕТ

        # 2. Проверяем Кулдаун (30 дней) в БД
        res = await supabase_client.get("/telegram_challenges", params={"user_id": f"eq.{user_id}"})
        if res.json():
            record = res.json()[0]
            if record.get('last_vote_date'):
                lv = datetime.fromisoformat(record['last_vote_date'].replace('Z', '+00:00'))
                # Если прошло меньше 30 дней
                if datetime.now(timezone.utc) - lv < timedelta(days=30):
                    days_left = 30 - (datetime.now(timezone.utc) - lv).days
                    return JSONResponse({
                        "success": False, 
                        "message": f"Вы уже голосовали. Следующий раз через {days_left} дн.",
                        "on_cooldown": True
                    })
        else:
            # Если записи нет, создаем
            await supabase_client.post("/telegram_challenges", json={"user_id": user_id})

        # 3. ПРОВЕРКА БУСТА (Голоса) ЧЕРЕЗ API TELEGRAM
        try:
            # Этот метод возвращает список бустов от конкретного юзера
            user_boosts = await bot.get_user_chat_boosts(chat_id=target_channel_id, user_id=user_id)
            
            # Если список пуст или равен None — значит голоса нет
            if not user_boosts.boosts:
                 return JSONResponse({
                    "success": False, 
                    "message": "⚠️ Вы не проголосовали за канал! Нажмите 'Голосовать' (Boost) в профиле канала."
                })
                
        except Exception as e:
            print(f"Ошибка проверки бустов: {e}")
            return JSONResponse({
                "success": False, 
                "message": "Бот не может проверить голоса. Убедитесь, что бот — админ канала."
            })

        # 4. Если голос есть — выдаем награду
        
        # Обновляем дату в БД
        await supabase_client.patch(
            "/telegram_challenges", 
            params={"user_id": f"eq.{user_id}"}, 
            json={"last_vote_date": datetime.now(timezone.utc).isoformat()}
        )
        
        # Начисляем билеты (10 штук)
        await supabase_client.post("/rpc/increment_tickets", json={"p_user_id": user_id, "p_amount": 10})

        return JSONResponse({"success": True})

    except Exception as e:
        return JSONResponse({"error": str(e)}, status=500)
# --- ХЕНДЛЕР РЕАКЦИЙ ---

# --- ХЕНДЛЕР РЕАКЦИЙ (ИСПРАВЛЕННЫЙ) ---
@router.message_reaction()
async def handle_reaction_update(reaction: MessageReactionUpdated):
    """
    Ловит реакции и обновляет еженедельный прогресс.
    """
    # 1. Проверки: тот ли чат, добавление ли это реакции
    if TG_QUEST_CHANNEL_ID == 0 or reaction.chat.id != TG_QUEST_CHANNEL_ID:
        return
    if not reaction.new_reaction: # Если реакцию сняли, игнорируем
        return

    user = reaction.user
    if not user: return
    user_id = user.id

    logging.info(f"❤️ REACT: User {user_id} reacted to msg {reaction.message_id}")

    try:
        # 2. Получаем данные (используем твою логику с run_in_threadpool)
        res = await run_in_threadpool(
            lambda: supabase.table("telegram_challenges").select("*").eq("user_id", user_id).execute()
        )
        
        # Если записи нет — создаем
        if not res.data:
            record = {
                "user_id": user_id,
                "reaction_count_weekly": 1,
                "last_reaction_reset": datetime.now(timezone.utc).isoformat()
            }
            await run_in_threadpool(
                lambda: supabase.table("telegram_challenges").insert(record).execute()
            )
            # Начисляем билет
            await run_in_threadpool(
                lambda: supabase.rpc("increment_tickets", {"p_user_id": user_id, "p_amount": 1}).execute()
            )
            return

        # Если запись есть — обновляем
        record = res.data[0]
        
        # Сброс недели
        now = datetime.now(timezone.utc)
        last_reset_str = record.get('last_reaction_reset') or now.isoformat()
        last_reset = datetime.fromisoformat(last_reset_str.replace('Z', '+00:00'))
        
        count = record.get('reaction_count_weekly', 0)
        
        if now - last_reset > timedelta(days=7):
            count = 0 # Новая неделя
            # Обновляем дату сброса
            await run_in_threadpool(
                lambda: supabase.table("telegram_challenges").update({
                    "last_reaction_reset": now.isoformat()
                }).eq("user_id", user_id).execute()
            )

        # Если лимит не достигнут — засчитываем
        if count < TG_REACTION_WEEKLY_LIMIT:
            new_count = count + 1
            await run_in_threadpool(
                lambda: supabase.table("telegram_challenges").update({
                    "reaction_count_weekly": new_count
                }).eq("user_id", user_id).execute()
            )
            # Награда
            await run_in_threadpool(
                lambda: supabase.rpc("increment_tickets", {"p_user_id": user_id, "p_amount": 1}).execute()
            )
            logging.info(f"✅ Билет выдан {user_id} ({new_count}/{TG_REACTION_WEEKLY_LIMIT})")

    except Exception as e:
        logging.error(f"Reaction handler error: {e}")


# --- НОВЫЙ ЭНДПОИНТ: ПРОВЕРКА ПОДПИСКИ (CHECK SUBSCRIPTION) ---

# --- HTML routes ---
# @app.get('/favicon.ico', include_in_schema=False)
# async def favicon(): return Response(status_code=204)
# @app.get("/menu")
# async def menu_page(request: Request): return FileResponse(f"{TEMPLATES_DIR}/menu.html")
# @app.get("/leaderboard")
# async def leaderboard_page(request: Request): return FileResponse(f"{TEMPLATES_DIR}/leaderboard.html")
# @app.get("/profile")
# async def profile_page(request: Request): return FileResponse(f"{TEMPLATES_DIR}/profile.html")
# @app.get("/admin")
# async def admin_page(request: Request): return FileResponse(f"{TEMPLATES_DIR}/admin.html")
# @app.get("/events")
# async def events_page(request: Request): return FileResponse(f"{TEMPLATES_DIR}/events.html")
# @app.get("/")
# async def read_root(): return FileResponse(f"{TEMPLATES_DIR}/index.html")
# @app.get("/checkpoint")
# async def checkpoint_page(request: Request): return FileResponse(f"{TEMPLATES_DIR}/checkpoint.html")
# @app.get("/roulette.html")
# async def roulette_page(request: Request): return FileResponse(f"{TEMPLATES_DIR}/roulette.html")
# @app.get("/halloween")
# async def halloween_page(request: Request): return FileResponse(f"{TEMPLATES_DIR}/halloween.html")



def fill_missing_quest_data(quests: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Дополняет отсутствующие поля в данных квестов значениями по умолчанию.

    Args:
        quests: Список словарей с данными квестов.

    Returns:
        Обновленный список словарей с заполненными данными.
    """
    default_values = {
        "description": "Описание отсутствует",
        "icon_url": "https://hatelavka-quest-nine.vercel.app/default_icon.png",  # Замените на URL вашей иконки по умолчанию
        "action_url": None,
        "category_id": None,
        "is_repeatable": False,
        "end_date": None,
        "target_value": 0,
        "reward_amount": 0
    }

    updated_quests = []
    for quest in quests:
        updated_quest = {**default_values, **quest}
        updated_quests.append(updated_quest)
        
    return updated_quests
