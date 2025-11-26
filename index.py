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
from aiogram.types import Update, WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.enums import ParseMode
from aiogram.client.bot import DefaultBotProperties
from aiogram.exceptions import TelegramForbiddenError
from fastapi import FastAPI, Request, HTTPException, Query, Depends, Body, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi import BackgroundTasks
from dotenv import load_dotenv
from pydantic import BaseModel, Field 
from contextlib import asynccontextmanager
from aiogram.utils.markdown import html_decoration

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

# --- Глобальный клиент для фоновых задач (ВСТАВИТЬ В НАЧАЛО ФАЙЛА) ---
_background_supabase_client: Optional[httpx.AsyncClient] = None

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

# --- Pydantic модели для Админки Аукциона ---
class AuctionCreateRequest(BaseModel):
    initData: str
    title: str
    image_url: Optional[str] = None
    bid_cooldown_hours: Optional[int] = 4 
    snipe_guard_minutes: int = 5
    is_active: Optional[bool] = False
    is_visible: Optional[bool] = False
    # ⬇️ ДОБАВИТЬ ЭТИ ДВЕ СТРОКИ ⬇️
    min_required_tickets: Optional[int] = 1 # Допустим, по умолчанию 1
    max_allowed_tickets: Optional[int] = None # По умолчанию - нет ограничения

class AuctionUpdateRequest(BaseModel):
    initData: str
    id: int
    title: Optional[str] = None 
    image_url: Optional[str] = None
    bid_cooldown_hours: Optional[int] = None 
    snipe_guard_minutes: Optional[int] = None
    is_active: Optional[bool] = None
    is_visible: Optional[bool] = None
    # ⬇️ ДОБАВИТЬ ЭТИ ДВЕ СТРОКИ ⬇️
    min_required_tickets: Optional[int] = None
    max_allowed_tickets: Optional[int] = None

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
    # --- 🔽 ВОТ ЭТУ СТРОКУ НУЖНО ДОБАВИТЬ 🔽 ---
    weekly_goals_enabled: bool = False # (Отступ 8 пробелов)
    quest_schedule_override_enabled: bool = False # (Отступ 8 пробелов)
    quest_schedule_active_type: str = 'twitch' # (Отступ 8 пробелов) 'twitch' или 'telegram'
    
    
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
# --- 🔼 КОНЕЦ НОВЫХ МОДЕЛЕЙ 🔼 ---



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

# --- Setup ---
load_dotenv()
warnings.filterwarnings("ignore", category=InsecureRequestWarning)
logging.basicConfig(level=logging.INFO)
# Отключаем информационные логи от библиотек запросов, оставляем только предупреждения и ошибки
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
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

# --- FastAPI app ---
asynccontextmanager
async def lifespan(app: FastAPI):
    # Объявляем, что используем глобальную переменную
    global global_http_client 
    
    logging.info("🚀 Приложение запускается...")
    
    # 1. Создаем быстрый HTTP-клиент один раз при старте
    # Мы увеличиваем лимиты соединений, чтобы Vercel не захлебнулся
    limits = httpx.Limits(max_keepalive_connections=20, max_connections=100)
    
    global_http_client = httpx.AsyncClient(
        base_url=f"{SUPABASE_URL}/rest/v1",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        timeout=30.0,
        limits=limits
    )
    
    yield # В этот момент приложение работает
    
    logging.info("👋 Приложение останавливается...")
    
    # 2. Правильно закрываем соединение при выключении
    if global_http_client:
        await global_http_client.aclose()

app = FastAPI(title="Quest Bot API")
# app.mount("/public", StaticFiles(directory=TEMPLATES_DIR), name="public")

# --- Middlewares ---
@app.middleware("http")
async def sleep_mode_check(request: Request, call_next):
    path = request.url.path
    
    # 1. БЫСТРЫЙ ВЫХОД: Пропускаем статику, админку, вебхуки и фавикон
    # Это экономит CPU, пропуская логику сна для служебных запросов
    if path.startswith(("/api/v1/admin", "/admin", "/api/v1/webhooks", "/public", "/favicon.ico")):
        return await call_next(request)

    # 2. Старая логика проверки кэша (только для обычных пользователей)
    if time.time() - sleep_cache["last_checked"] > CACHE_DURATION_SECONDS:
        # Логируем только реальные проверки базы, чтобы не засорять консоль
        # logging.info("--- 😴 Кеш режима сна истек, проверяем базу... ---") 
        try:
            # Используем глобальный клиент, если он уже настроен (или создаем временный, как было)
            # Для надежности пока оставим httpx.AsyncClient, но без yield
            async with httpx.AsyncClient(
                base_url=f"{os.getenv('SUPABASE_URL')}/rest/v1", 
                headers={"apikey": os.getenv('SUPABASE_SERVICE_ROLE_KEY')}
            ) as client:
                resp = await client.get("/settings", params={"key": "eq.sleep_mode", "select": "value"})
                settings = resp.json()
                if settings:
                    sleep_data = settings[0].get('value', {})
                    sleep_cache["is_sleeping"] = sleep_data.get('is_sleeping', False)
                    sleep_cache["wake_up_at"] = sleep_data.get('wake_up_at')
                else:
                    sleep_cache["is_sleeping"] = False 
                sleep_cache["last_checked"] = time.time() 
        except Exception as e:
            logging.error(f"Ошибка проверки режима сна: {e}")
            # Если ошибка БД, лучше пропустить пользователя, чем блокировать
            pass

    # 3. Проверка времени пробуждения
    is_sleeping = sleep_cache["is_sleeping"]
    wake_up_at_str = sleep_cache["wake_up_at"]

    if is_sleeping and wake_up_at_str:
        try:
            wake_up_time = datetime.fromisoformat(wake_up_at_str)
            if datetime.now(timezone.utc) > wake_up_time:
                is_sleeping = False 
                # Можно обновить кэш, чтобы не парсить дату каждый раз
                sleep_cache["is_sleeping"] = False
        except ValueError:
            pass # Если формат даты битый, игнорируем

    if is_sleeping:
        return JSONResponse(
            status_code=503,
            content={"detail": "Ботик спит, набирается сил"}
        )

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
        # 1. УБИРАЕМ unquote()! parse_qsl сам раскодирует проценты,
        # но корректно разделит параметры по основным амперсандам.
        parsed_data = dict(parse_qsl(init_data))
        
        if "hash" not in parsed_data:
            logging.error("❌ Validation Error: 'hash' not found in initData")
            return None
            
        received_hash = parsed_data.pop("hash")
        
        # 2. Сортируем ключи и собираем строку проверки
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed_data.items()))
        
        for token in valid_tokens:
            if not token: continue
            secret_key = hmac.new("WebAppData".encode(), token.encode(), hashlib.sha256).digest()
            calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
            
            if calculated_hash == received_hash:
                return json.loads(parsed_data.get("user", "{}"))
                
        logging.error("❌ HASH MISMATCH - initData validation FAILED.")
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
async def cmd_start(message: types.Message, command: CommandObject, background_tasks: BackgroundTasks, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    token = command.args or ""
    user_id = message.from_user.id
    if token:
        try:
            await supabase.patch(
                "/auth_tokens",
                params={"token": f"eq.{token}", "telegram_id": "is.null", "used": "is.false"},
                json={"telegram_id": user_id, "used": True}
            )
            keyboard = InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="🚀 Открыть приложение", web_app=WebAppInfo(url=WEB_APP_URL))
            ]])
            # Используем фоновую задачу для надежности
            background_tasks.add_task(safe_send_message, chat_id=user_id, text="✅ Авторизация завершена! Можете вернуться на сайт.", reply_markup=keyboard)
        except Exception as e:
            logging.error(f"Ошибка привязки токена {token}: {e}")
            background_tasks.add_task(safe_send_message, chat_id=user_id, text="⚠️ Произошла ошибка при авторизации.")
    else:
        keyboard = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="🚀 Открыть приложение", web_app=WebAppInfo(url=WEB_APP_URL))
        ]])
        # Используем фоновую задачу для надежности
        background_tasks.add_task(safe_send_message, chat_id=user_id, text="👋 Привет! Открой наше веб-приложение:", reply_markup=keyboard)

@router.message(F.text & ~F.command)
async def track_message(message: types.Message, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    # ✅ ДОБАВЬ ЭТУ СТРОЧКУ
    logging.info("--- ЗАПУЩЕНА ФИНАЛЬНАЯ ВЕРСИЯ ОБРАБОТЧИКА track_message ---")
    
    user = message.from_user
    full_name = f"{user.first_name} {user.last_name or ''}".strip()

    try:
        # Этот блок должен быть с отступом
        await supabase.rpc(
            "handle_user_message",
            {
                "p_telegram_id": user.id, # <-- Исправлено
                "p_full_name": full_name,
            }
        ).execute()
    except Exception as e:
        # Этот блок должен быть на том же уровне, что и 'try'
        logging.error(f"Ошибка в handle_user_message для user_id={user.id}: {e}", exc_info=True)

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
):
    """
    Загружает все необходимые данные для старта приложения одним запросом.
    Исправлена совместимость с синхронным клиентом Supabase.
    """
    # logging.info("--- [bootstrap] Старт запроса ---")
    
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")

    telegram_id = user_info["id"]

    try:
        # logging.info(f"[bootstrap] Пользователь: {telegram_id}")

        # Вспомогательная функция для запуска синхронных запросов в потоках (для скорости)
        def run_sync_rpc(method, params=None):
            if params:
                return supabase.rpc(method, params).execute()
            return supabase.rpc(method).execute()

        # 1. Настройки (async функция)
        task_settings = get_admin_settings_async_global()

        # 2. Запускаем запросы к БД параллельно в потоках
        # Это ускоряет загрузку, даже если клиент Supabase синхронный
        task_user = asyncio.to_thread(run_sync_rpc, "get_user_dashboard_data", {"p_telegram_id": telegram_id})
        task_quests = asyncio.to_thread(run_sync_rpc, "get_available_quests_for_user", {"p_telegram_id": telegram_id})
        task_goals = asyncio.to_thread(run_sync_rpc, "get_user_weekly_goals_status", {"p_user_id": telegram_id})

        # 3. Ожидаем все результаты
        # logging.info("[bootstrap] Ожидание выполнения задач...")
        results = await asyncio.gather(
            task_settings,
            task_user,
            task_quests,
            task_goals,
            return_exceptions=True
        )

        settings_res, user_res, quests_res, goals_res = results

        # 4. Обработка результатов
        
        # --- SETTINGS ---
        if isinstance(settings_res, Exception):
            logging.error(f"[bootstrap] Ошибка Settings: {settings_res}")
            menu_content = {}
        else:
            menu_content = settings_res.dict() if hasattr(settings_res, 'dict') else settings_res

        # --- USER ---
        user_data = {}
        if isinstance(user_res, Exception):
            logging.error(f"[bootstrap] Ошибка User RPC: {user_res}")
        elif user_res and hasattr(user_res, 'data') and user_res.data:
            data = user_res.data
            user_data = data.get('profile', {})
            user_data['challenge'] = data.get('challenge')
            user_data['is_admin'] = telegram_id in ADMIN_IDS
            
            user_data['is_checkpoint_globally_enabled'] = menu_content.get('checkpoint_enabled', False)
            user_data['quest_rewards_enabled'] = menu_content.get('quest_promocodes_enabled', False)

        # --- QUESTS ---
        quests_list = []
        if isinstance(quests_res, Exception):
            logging.error(f"[bootstrap] Ошибка Quests RPC: {quests_res}")
        elif quests_res and hasattr(quests_res, 'data') and quests_res.data:
            raw_quests = quests_res.data
            try:
                quests_list = fill_missing_quest_data(raw_quests)
            except NameError:
                quests_list = raw_quests 

        # --- GOALS ---
        goals_data = {"system_enabled": False, "goals": []}
        if isinstance(goals_res, Exception):
            logging.error(f"[bootstrap] Ошибка Goals RPC: {goals_res}")
        elif goals_res and hasattr(goals_res, 'data'):
            goals_data = goals_res.data or {}
            goals_data["system_enabled"] = menu_content.get('weekly_goals_enabled', False)

        # logging.info("[bootstrap] Успешно собраны данные.")

        return {
            "user": user_data,
            "menu": menu_content,
            "quests": quests_list,
            "weekly_goals": goals_data
        }

    except Exception as e:
        logging.error(f"🔥 КРИТИЧЕСКАЯ ОШИБКА BOOTSTRAP: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Bootstrap Error: {str(e)}")

# --- НОВЫЙ ЭНДПОИНТ: Получение списка всех квестов или челленджей ---
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
    Эта функция содержит ВАШУ логику и безопасно выполняется в фоне.
    """
    # --- НАЧАЛО ВАШЕЙ ЛОГИКИ ---
    logging.info("--- ЗАПУЩЕНА ФОНОВАЯ ОБРАБОТКА webhook ---")
    
    SERVICE_ACCOUNT_IDS = {777000, 1087968824, 136817688}

    try:
        message = update.get("message")
        if not message:
            logging.info("Фоновая задача: пропущено, нет поля 'message'")
            return

        from_user = message.get("from", {})
        telegram_id = from_user.get("id")
        
        if not telegram_id or telegram_id in SERVICE_ACCOUNT_IDS:
            logging.info(f"Фоновая задача: пропущено сообщение от служебного аккаунта ID {telegram_id}")
            return

        first_name = from_user.get("first_name", "")
        last_name = from_user.get("last_name", "")
        full_name = f"{first_name} {last_name}".strip() or "Без имени"

        logging.info(f"Фоновая задача: получено сообщение от ID: {telegram_id}, Имя: '{full_name}'")

        # ИСПОЛЬЗУЕМ ГЛОБАЛЬНЫЙ КЛИЕНТ `supabase`
        supabase.rpc(
            "handle_user_message",
            {
                "p_telegram_id": int(telegram_id),
                "p_full_name": full_name,
            }
        ).execute()
        
        logging.info(f"Фоновая задача для ID {telegram_id} успешно завершена.")

    except Exception as e:
        logging.error(f"Ошибка в фоновой задаче process_webhook_in_background: {e}", exc_info=True)
    # --- КОНЕЦ ВАШЕЙ ЛОГИКИ ---

@app.post("/api/v1/webhook")
async def telegram_webhook(
    update: dict,
    background_tasks: BackgroundTasks
    # Можно даже убрать `Depends`, если он больше нигде не нужен в этой функции
):
    """
    Этот вебхук принимает запрос, запускает вашу логику в фоне и отвечает мгновенно.
    """
    # Вызываем фоновую задачу БЕЗ передачи клиента
    background_tasks.add_task(process_webhook_in_background, update=update)
    
    # Сразу же возвращаем ответ
    return JSONResponse(content={"status": "ok", "processed_in_background": True})

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

# --- 1. ФУНКЦИЯ ФОНОВОЙ ОБРАБОТКИ (Вставляетcя ПЕРЕД эндпоинтом) ---
async def process_twitch_notification_background(data: dict, message_id: str):
    # print(f"🔄 [START] Обработка Twitch ID: {message_id}") 
    
    if not message_id: return

    # Используем глобальный клиент
    async with httpx.AsyncClient(
        base_url=f"{SUPABASE_URL}/rest/v1",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        timeout=30.0
    ) as supabase:
        
        # 1. ЗАЩИТА ОТ ДУБЛЕЙ
        try:
            dup_resp = await supabase.post(
                "/processed_webhooks", 
                json={"id": message_id},
                headers={"Prefer": "return=minimal"}
            )
            if dup_resp.status_code == 409: return # Дубликат
            if dup_resp.status_code not in (200, 201, 204): return # Ошибка БД
        except Exception: return

        # 2. 🔥 ОПТИМИЗАЦИЯ: Обновляем и читаем кэш
        await ensure_twitch_cache(supabase)
        
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
                return # <--- ВЫХОДИМ ТУТ, ЭКОНОМИМ ВРЕМЯ

        # ==========================================
        # Только если проверка прошла, грузим юзера (это тяжелый запрос)
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
                             # Создаем, если нет (хотя если is_roulette=True, она должна быть, но на всякий случай)
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
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Принимает ставку от пользователя, проверяет трейд-ссылку,
    вызывает RPC-функцию и отправляет триггер для OBS. (ИСПРАВЛЕНО)
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")

    telegram_id = user_info["id"]
    # Имя из TG используется как фоллбэк
    user_name = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip() or user_info.get("username", "Пользователь")

    try:
        # --- 1. ПРОВЕРКА ТРЕЙД-ССЫЛКИ ---
        user_resp = await supabase.get("/users", params={"telegram_id": f"eq.{telegram_id}", "select": "trade_link"})
        user_resp.raise_for_status()
        user_data = user_resp.json()

        if not user_data or not user_data[0].get("trade_link"):
             raise HTTPException(status_code=400, detail="Пожалуйста, укажите вашу трейд-ссылку в профиле для участия.")
        # --- КОНЕЦ ПРОВЕРКИ ---

        # 2. Вызываем "мозг" (RPC-функцию)
        response = await supabase.post(
            "/rpc/place_auction_bid",
            json={
                "p_auction_id": request_data.auction_id,
                "p_user_id": telegram_id,
                "p_user_name": user_name, # RPC использует это имя, если в `users` нет twitch_login
                "p_bid_amount": request_data.bid_amount
            }
        )
        response.raise_for_status() 

        # --- 3. ОТПРАВКА ТРИГГЕРА ДЛЯ OBS (ИСПРАВЛЕННАЯ ЛОГИКА) ---
        try:
            # Получаем свежие данные аукциона
            auction_resp = await supabase.get(
                "/auctions",
                params={"id": f"eq.{request_data.auction_id}", "select": "*"},
                headers={"Prefer": "count=exact"} 
            )
            auction_data = auction_resp.json()[0] if auction_resp.json() else {}

            # --- ИСПРАВЛЕНИЕ ЗАПРОСА ---
            # Получаем топ-10 ставок, чтобы найти 3 уникальных (с user_id и twitch_login)
            history_resp = await supabase.get(
                "/auction_bids",
                params={
                    "auction_id": f"eq.{request_data.auction_id}",
                    "select": "bid_amount, user_id, user:users(telegram_id, full_name, twitch_login)", # <-- РЕШЕНИЕ
                    "order": "created_at.desc",
                    "limit": 10 # Берем 10, чтобы найти 3 уникальных
                }
            )
            history_data = history_resp.json()
            
            # --- ИСПРАВЛЕНИЕ ЛОГИКИ ---
            # Формируем топ-3 для OBS (с приоритетом Twitch)
            top_bidders = []
            last_bidder_display_name = user_name # Fallback to TG name
            
            if history_data:
                seen_user_ids = set()
                
                # Функция-хелпер для выбора имени
                def get_display_name(user_data):
                    if not user_data:
                        return "Аноним"
                    # ПРИОРИТЕТ: Twitch, затем TG
                    return user_data.get("twitch_login") or user_data.get("full_name") or "Аноним"

                # Имя последнего (текущего) биддера (history_data[0])
                if history_data[0].get("user"):
                     last_bidder_display_name = get_display_name(history_data[0]["user"])
                
                for bid in history_data:
                    if len(top_bidders) >= 3:
                        break
                    
                    user_id = bid.get("user_id")
                    if user_id and user_id not in seen_user_ids:
                        display_name = get_display_name(bid.get("user"))
                        top_bidders.append({"name": display_name, "amount": bid["bid_amount"]})
                        seen_user_ids.add(user_id)
            
            # Формируем payload для OBS
            trigger_payload = {
                "auction_data": auction_data,
                "last_bidder_name": last_bidder_display_name, # <-- РЕШЕНИЕ
                "top_bidders": top_bidders 
            }
            # --- КОНЕЦ ИСПРАВЛЕНИЯ ЛОГИКИ ---
            
            # Вставляем в новую таблицу 
            await supabase.post("/auction_triggers", json={"payload": trigger_payload})
            logging.info(f"✅ Триггер для OBS (Аукцион {request_data.auction_id}) успешно отправлен.")

        except Exception as obs_e:
            logging.error(f"❌ Не удалось отправить триггер для OBS: {obs_e}", exc_info=True)
            # Не прерываем основной запрос из-за ошибки OBS
        # --- КОНЕЦ ТРИГГЕРА OBS ---

        return {"message": "Ваша ставка принята!"}

    except httpx.HTTPStatusError as e:
        error_details = "Ошибка базы данных."
        try:
            error_json = e.response.json()
            error_details = error_json.get("message", e.response.text)
        except Exception:
            error_details = e.response.text
            
        # --- ИСПРАВЛЕНИЕ: Перехват ошибки удаленного аукциона ---
        if "violates foreign key constraint" in error_details and "auction_bids_auction_id_fkey" in error_details:
             error_details = "Лот был перезапущен или удален администратором. Пожалуйста, обновите страницу."
        # -------------------------------------------------------
            
        logging.warning(f"Ошибка RPC place_auction_bid: {error_details}")
        raise HTTPException(status_code=400, detail=error_details)

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
        
# --- НОВЫЕ ЭНДПОИНТЫ: АДМИНКА АУКЦИОНА ---



@app.post("/api/v1/admin/auctions/finish_manual")
async def admin_finish_auction(
    request_data: AdminAuctionFinishRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (Админ) Принудительно завершает аукцион и отправляет уведомления.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    auction_id = request_data.id
    logging.info(f"АДМИН: Принудительное завершение аукциона ID {auction_id}...")
    
    try:
        # 1. Вызываем RPC-функцию, которая завершает аукцион и возвращает победителя
        rpc_resp = await supabase.post(
            "/rpc/finish_auction",
            json={"p_auction_id": auction_id}
        )
        rpc_resp.raise_for_status()
        
        winner_data_list = rpc_resp.json()
        if not winner_data_list:
            logging.warning(f"АДМИН: RPC-функция для {auction_id} вернула пустой ответ.")
            return {"message": "Аукцион завершен, победитель не определен (нет ставок)."}

        winner_data = winner_data_list[0]
        
       # 2. Проверяем, есть ли победитель, и отправляем уведомления
        if winner_data.get('winner_id'):
            winner_id = winner_data['winner_id']
            winner_name = winner_data['winner_name']
            
            # --- ИСПРАВЛЕНИЕ: Безопасное получение названия ---
            # Пробуем 'auction_title', если нет - пробуем 'title', если нет - ставим 'Лот'
            auction_title = winner_data.get('auction_title') or winner_data.get('title') or "Лот"
            # --------------------------------------------------
            
            winning_bid = winner_data['winning_bid']
            
            # Уведомление победителю
            await safe_send_message(
                winner_id,
                f"🎉 Поздравляем, {html_decoration.quote(winner_name)}!\n\n"
                f"Вы победили в аукционе за лот «{html_decoration.quote(auction_title)}» со ставкой {winning_bid} 🎟️.\n\n"
                f"Билеты были списаны с вашего баланса. Администратор скоро свяжется с вами для выдачи приза!"
            )
            
            # Уведомление админу
            if ADMIN_NOTIFY_CHAT_ID:
                await safe_send_message(
                    ADMIN_NOTIFY_CHAT_ID,
                    f"🏆 <b>Аукцион завершен! (Вручную)</b>\n\n"
                    f"<b>Лот:</b> {html_decoration.quote(auction_title)}\n"
                    f"<b>Победитель:</b> {html_decoration.quote(winner_name)} (ID: <code>{winner_id}</code>)\n"
                    f"<b>Ставка:</b> {winning_bid} билетов\n\n"
                    f"Билеты списаны. Пожалуйста, свяжитесь с победителем для выдачи приза."
                )
            return {"message": f"Аукцион {auction_id} завершен, победитель {winner_id}."}
        else:
            # Случай, когда нет победителя
            return {"message": f"Аукцион {auction_id} завершен, победитель не определен."}
    
    except httpx.HTTPStatusError as e:
        # По умолчанию ставим общее сообщение
        error_details = "Не удалось забрать награду." 
        try:
            # Пытаемся достать детальную ошибку из Supabase
            error_details = e.response.json().get("message", "Не удалось забрать награду.")
        except Exception:
            pass # Если не получилось, оставляем сообщение по умолчанию
        
        # Логируем ПОЛНУЮ ошибку, чтобы вы ее видели
        logging.error(f"--- [claim_weekly_task_reward] ОШИБКА RPC: {error_details} ---")
        
        # --- 🔽🔽🔽 ВОТ ИСПРАВЛЕНИЕ 🔽🔽🔽 ---
        # Проверяем, является ли это той самой ошибкой
        if "invalid input syntax for type integer" in error_details:
            # Если да, заменяем ее на понятное сообщение для пользователя
            user_friendly_error = "Ошибка данных задачи (неверное кол-во награды). Свяжитесь с админом."
            logging.error(f"--- [claim_weekly_task_reward] Перехвачена ошибка integer. Отправка клиенту: {user_friendly_error} ---")
            raise HTTPException(status_code=400, detail=user_friendly_error)
        else:
            # Если это другая ошибка (например, "Награда уже получена"), показываем ее
            raise HTTPException(status_code=400, detail=error_details)
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
        
@app.get("/api/v1/auth/twitch_oauth")
async def twitch_oauth_start(initData: str):
    if not initData:
        raise HTTPException(status_code=400, detail="initData is required")
    state = create_twitch_state(initData)
    twitch_auth_url = (
        "https://id.twitch.tv/oauth2/authorize"
        f"?response_type=code"
        f"&client_id={TWITCH_CLIENT_ID}"
        f"&redirect_uri={TWITCH_REDIRECT_URI}"
        f"&scope=user:read:email+channel:read:redemptions"  # <--- ДОБАВИЛИ ПРАВА
        f"&scope=user:read:email"
        f"&state={state}"
    )
    response = Response(status_code=307)
    response.headers['Location'] = twitch_auth_url
    response.set_cookie(key="twitch_oauth_init_data", value=initData, max_age=300, path="/", samesite="None", secure=True)
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
        token_response = await client.post(
            "https://id.twitch.tv/oauth2/token",
            data={
                "client_id": TWITCH_CLIENT_ID, "client_secret": TWITCH_CLIENT_SECRET,
                "code": code, "grant_type": "authorization_code", "redirect_uri": TWITCH_REDIRECT_URI,
            }
        )
        token_data = token_response.json()
        if "access_token" not in token_data:
            raise HTTPException(status_code=500, detail="Failed to get access token from Twitch")
        access_token = token_data["access_token"]
        headers = {"Authorization": f"Bearer {access_token}", "Client-Id": TWITCH_CLIENT_ID}
        user_response = await client.get("https://api.twitch.tv/helix/users", headers=headers)
        user_data = user_response.json()
        if not user_data.get("data"):
            raise HTTPException(status_code=500, detail="Failed to get user info from Twitch")
        twitch_user = user_data["data"][0]
        twitch_id = twitch_user["id"]
        twitch_login = twitch_user["login"] 
        user_info = is_valid_init_data(init_data, ALL_VALID_TOKENS)
        if not user_info or "id" not in user_info:
            raise HTTPException(status_code=401, detail="Invalid Telegram initData")
        telegram_id = user_info["id"]
        await supabase.patch(
            "/users",
            params={"telegram_id": f"eq.{telegram_id}"},
            json={"twitch_id": twitch_id, "twitch_login": twitch_login}
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
                auction_enabled=settings_data.get('auction_enabled', False), # <-- ДОБАВЛЕНО
                auction_banner_url=settings_data.get('auction_banner_url', "https://i.postimg.cc/6qpWq0dW/aukcion.png"), # <-- ДОБАВЛЕНО
                weekly_goals_banner_url=settings_data.get('weekly_goals_banner_url', "https://i.postimg.cc/T1j6hQGP/1200-324.png"), # <-- 🔽 ДОБАВИТЬ
                weekly_goals_enabled=settings_data.get('weekly_goals_enabled', False),
               # --- 🔽 ДОБАВЛЯЕМ СЮДА 🔽 ---
                quest_schedule_override_enabled=settings_data.get('quest_schedule_override_enabled', False),
                quest_schedule_active_type=settings_data.get('quest_schedule_active_type', 'twitch')
                # --- 🔼 БЕЗ ЭТОГО ФРОНТЕНД НЕ ВИДИТ НАСТРОЙКИ 🔼 ---
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
    
# --- ПРАВИЛЬНО ---
@app.post("/api/v1/user/me")
async def get_current_user_data(request_data: InitDataRequest): # <<< Убрали Depends(get_supabase_client)
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        return JSONResponse(content={"is_guest": True})

    telegram_id = user_info["id"]

    try:
        # --- ИЗМЕНЕНИЕ: Используем глобальный supabase и .rpc().execute() без await ---
        response = supabase.rpc(
            "get_user_dashboard_data",
            {"p_telegram_id": telegram_id}
        ).execute()
        # raise_for_status() не нужен, execute() выбросит исключение при ошибке API
        data = response.data # Данные теперь в response.data

        # Если профиль пустой, создаем его
        # Проверяем data перед доступом к .get()
        if not data or not data.get('profile'):
            full_name_tg = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip() or "Без имени"

            # --- ИЗМЕНЕНИЕ: Используем глобальный supabase и .table().insert().execute() без await ---
            insert_response = supabase.table("users").insert(
                 {"telegram_id": telegram_id, "username": user_info.get("username"), "full_name": full_name_tg},
                 # Используем upsert вместо resolution=merge-duplicates для большей надежности
                 # (если вдруг пользователь создастся между двумя вызовами rpc)
                 # count='exact' # Можно добавить count, если нужно знать, была ли вставка
                 returning='minimal' # Нам не нужны возвращаемые данные
            ).execute()
            # Проверка ошибок вставки (опционально, execute выбросит исключение)
            # if insert_response.error: ...

            # Повторно запрашиваем данные после создания
            # --- ИЗМЕНЕНИЕ: Используем глобальный supabase и .rpc().execute() без await ---
            response = supabase.rpc(
                "get_user_dashboard_data",
                {"p_telegram_id": telegram_id}
            ).execute()
            data = response.data

        # --- Проверка на случай, если data все еще пустые после попытки создания ---
        if not data:
             logging.error(f"Не удалось получить или создать данные для пользователя {telegram_id}")
             raise HTTPException(status_code=500, detail="Не удалось получить данные профиля.")

        # Собираем основной ответ (проверяем наличие 'profile' перед доступом)
        final_response = data.get('profile', {})
        if not final_response: # Если профиль пуст даже после создания, возвращаем ошибку
             logging.error(f"RPC get_user_dashboard_data вернула пустой профиль для {telegram_id} после создания.")
             # Можно вернуть пустой объект или ошибку, в зависимости от логики фронтенда
             raise HTTPException(status_code=500, detail="Ошибка получения данных профиля.")

        final_response['challenge'] = data.get('challenge') # .get() безопасен
        final_response['event_participations'] = data.get('event_participations', {}) # .get() с default безопасен

        # Проверяем, является ли пользователь админом
        is_admin = telegram_id in ADMIN_IDS
        final_response['is_admin'] = is_admin

        # --- Логика для админа, если RPC не вернула билеты ---
        if is_admin and 'tickets' not in final_response:
            logging.warning(f"RPC не вернула баланс билетов для админа {telegram_id}. Делаю доп. запрос...")
            # --- ИЗМЕНЕНИЕ: Используем глобальный supabase и .table().select().execute() без await ---
            user_details_resp = supabase.table("users").select("tickets").eq("telegram_id", telegram_id).execute()

            # Данные в user_details_resp.data (это список)
            if user_details_resp.data:
                final_response['tickets'] = user_details_resp.data[0].get('tickets', 0)
            else:
                 # Если админ не найден (маловероятно), оставляем tickets=0 или логируем ошибку
                 final_response['tickets'] = 0
                 logging.error(f"Не удалось найти админа {telegram_id} в таблице users для получения билетов.")

        # --- ИЗМЕНЕНИЕ: Вызываем вспомогательную функцию, адаптированную под глобальный клиент ---
        # Убедись, что такая функция существует и использует глобальный supabase
        admin_settings = await get_admin_settings_async_global()
        final_response['is_checkpoint_globally_enabled'] = admin_settings.checkpoint_enabled
        final_response['quest_rewards_enabled'] = admin_settings.quest_promocodes_enabled

        return JSONResponse(content=final_response)

    # except PostgrestAPIError as e: # Можно ловить специфичные ошибки supabase-py
    #     logging.error(f"Ошибка Supabase API в /api/v1/user/me: {e}", exc_info=True)
    #     raise HTTPException(status_code=getattr(e, 'status_code', 500), detail=str(e))
    except Exception as e:
        logging.error(f"Критическая ошибка в /api/v1/user/me для {telegram_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось получить данные профиля.")
        
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
async def get_cauldron_participants_for_admin(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Возвращает список всех участников ивента 'Котел' с их суммарным вкладом и трейд-ссылками."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # Вызываем RPC функцию, которая сделает всю сложную работу
        response = await supabase.post("/rpc/get_cauldron_leaderboard_admin")
        response.raise_for_status()
        
        # Просто возвращаем результат как есть
        return response.json()

    except Exception as e:
        logging.error(f"Ошибка при получении участников котла для админа: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось получить список участников.")

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
    # Bot-t может присылать данные как Form Data, а не JSON, поэтому читаем так:
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    try:
        # Bot-t часто шлет данные как форму (x-www-form-urlencoded)
        form_data = await request.form()
        data = dict(form_data)
        
        logging.info(f"💰 Bot-t Webhook data: {data}")

        # 1. Проверка статуса (зависит от Bot-t, обычно '1' это успех)
        # Если статус не '1' и не 'success', игнорируем
        status = str(data.get('status_id', ''))
        if status not in ['1', 'success', 'paid']:
            return {"status": "ignored"}

        # 2. Получаем ID юзера
        custom_fields = data.get('custom_fields')
        if not custom_fields:
            logging.error("Нет custom_fields (user_id) в вебхуке Bot-t")
            return {"status": "error", "message": "No user ID"}
        
        user_id = int(custom_fields)
        amount = float(data.get('amount', 0))

        # 3. НАЧИСЛЯЕМ НАГРАДУ
        # Пример: 1 рубль = 10 монет Grind
        coins = int(amount * 10) 

        # Вызываем твою функцию в БД
        await supabase.rpc("increment_coins", {"p_user_id": user_id, "p_amount": coins}).execute()
        
        # Уведомляем (фоном)
        await safe_send_message(user_id, f"✅ Оплата {amount}р прошла! Начислено {coins} монет.")

        return "OK"

    except Exception as e:
        logging.error(f"Ошибка вебхука Bot-t: {e}", exc_info=True)
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
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    duration_hours = request_data.bid_cooldown_hours
    end_time = datetime.now(timezone.utc) + timedelta(hours=duration_hours)

    # --- НАЧАЛО ИСПРАВЛЕНИЯ ---
    
    # 1. Формируем JSON для отправки
    payload = {
        "title": request_data.title,
        "image_url": request_data.image_url,
        "bid_cooldown_hours": duration_hours,
        "snipe_guard_minutes": request_data.snipe_guard_minutes,
        "bid_cooldown_ends_at": end_time.isoformat(),
        "is_active": request_data.is_active,
        "is_visible": request_data.is_visible,
        
        # ⬇️ ИСПРАВЛЕННАЯ ЛОГИКА ⬇️
        # Если пришел 0, делаем его None, чтобы Supabase сохранил NULL
        "min_required_tickets": request_data.min_required_tickets,
        "max_allowed_tickets": request_data.max_allowed_tickets if request_data.max_allowed_tickets and request_data.max_allowed_tickets > 0 else None
        # ⬆️ КОНЕЦ ИСПРАВЛЕНИЯ ⬆️
    }

    try:
        # 2. Отправляем запрос и СОХРАНЯЕМ ответ в переменную
        response = await supabase.post("/auctions", json=payload)
        
        # 3. ПРОВЕРЯЕМ ответ. Если была ошибка (4xx или 5xx), эта строка "выбросит" исключение
        response.raise_for_status() 
        
    except httpx.HTTPStatusError as e:
        # 4. Если raise_for_status() поймал ошибку, логируем ее и возвращаем клиенту
        error_details = e.response.json().get("message", e.response.text)
        logging.error(f"❌ ОШИБКА SUPABASE при создании лота: {error_details}")
        logging.error(f"❌ Payload, который не понравился Supabase: {payload}")
        raise HTTPException(status_code=400, detail=f"Ошибка Supabase: {error_details}")
    except Exception as e:
        # 5. Ловим любые другие непредвиденные ошибки
        logging.error(f"❌ Неизвестная ошибка при создании лота: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")

    # --- КОНЕЦ ИСПРАВЛЕНИЯ ---
    
    # Эта строка выполнится, ТОЛЬКО если response.raise_for_status() прошел успешно
    return {"message": "Лот создан."}

@app.post("/api/v1/admin/auctions/update")
async def admin_update_auction(
    request_data: AuctionUpdateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    # Собираем все, что пришло от админа (например, title, image_url, is_active...)
    update_data = request_data.dict(exclude={'initData', 'id'}, exclude_unset=True)

    # ⬇️ ИСПРАВЛЕННАЯ ЛОГИКА ⬇️
    # Обрабатываем max_allowed_tickets, если он был отправлен
    if 'max_allowed_tickets' in update_data:
        max_val = update_data['max_allowed_tickets']
        update_data['max_allowed_tickets'] = max_val if max_val and max_val > 0 else None
    # ⬆️ КОНЕЦ ИСПРАВЛЕНИЯ ⬆️

    # (!!!) ВОТ ПРАВИЛЬНАЯ ЛОГИКА (!!!)
    # Если админ поменял длительность в ЧАСАХ...
    if 'bid_cooldown_hours' in update_data:
        # ...мы берем эти часы
        duration_hours = update_data['bid_cooldown_hours']
        
        # ...и СБРАСЫВАЕМ таймер на (СЕЙЧАС + новая длительность)
        end_time = datetime.now(timezone.utc) + timedelta(hours=duration_hours)
        
        # ...обновляя ТОЛЬКО bid_cooldown_ends_at.
        update_data['bid_cooldown_ends_at'] = end_time.isoformat()
    # (!!!) КОНЕЦ ИСПРАВЛЕНИЯ (!!!)

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
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    # 1. Защита, как в trigger_draws
    cron_secret = os.getenv("CRON_SECRET")
    auth_header = request.headers.get("Authorization")
    if not cron_secret or auth_header != f"Bearer {cron_secret}":
        raise HTTPException(status_code=403, detail="Forbidden: Invalid secret")

    logging.info("🚀 CRON (Аукцион): Проверка аукционов для завершения...")

    try:
        # 2. Находим все аукционы, у которых 4-часовой таймер истек
        now_utc_iso = datetime.now(timezone.utc).isoformat()
        
        resp = await supabase.get(
            "/auctions",
            params={
                "is_active": "eq.true",
                "ended_at": "is.null",
                "bid_cooldown_ends_at": "not.is.null", # Убедимся, что таймер был запущен
                "bid_cooldown_ends_at": f"lt.{now_utc_iso}", # 'lt' = less than (меньше чем)
                "select": "id, title" # Нам нужны только ID и title
            }
        )
        resp.raise_for_status()
        auctions_to_finish = resp.json()

        if not auctions_to_finish:
            logging.info("CRON (Аукцион): Нет аукционов для завершения.")
            return {"message": "No auctions to finish."}
        
        logging.info(f"CRON (Аукцион): Найдено {len(auctions_to_finish)} аукцион(ов) для завершения.")
        
        results = []
        
        # 3. Завершаем каждый аукцион, вызывая нашу SQL-функцию
        for auction in auctions_to_finish:
            auction_id = auction['id']
            logging.info(f"CRON (Аукцион): Завершаем аукцион ID {auction_id}...")
            
            # Вызываем "мозг" (SQL-функцию), который атомарно все сделает
            rpc_resp = await supabase.post(
                "/rpc/finish_auction",
                json={"p_auction_id": auction_id}
            )
            rpc_resp.raise_for_status()
            
            winner_data_list = rpc_resp.json()
            if not winner_data_list:
                logging.warning(f"CRON (Аукцион): RPC-функция для {auction_id} вернула пустой ответ.")
                continue

            winner_data = winner_data_list[0] # RPC возвращает TABLE, берем первую строку
            
            # 4. Отправляем уведомления
            if winner_data.get('winner_id'):
                winner_id = winner_data['winner_id']
                winner_name = winner_data['winner_name']
                auction_title = winner_data.get('auction_title') or winner_data.get('title') or "Лот"
                winning_bid = winner_data['winning_bid']
                
                # Уведомление победителю
                # (Используем вашу функцию safe_send_message)
                await safe_send_message(
                    winner_id,
                    f"🎉 Поздравляем, {html_decoration.quote(winner_name)}!\n\n"
                    f"Вы победили в аукционе за лот «{html_decoration.quote(auction_title)}» со ставкой {winning_bid} 🎟️.\n\n"
                    f"Билеты были списаны с вашего баланса. Администратор скоро свяжется с вами для выдачи приза!"
                )
                
                # Уведомление админу
                # (Используем ваши переменные ADMIN_NOTIFY_CHAT_ID и safe_send_message)
                if ADMIN_NOTIFY_CHAT_ID:
                    await safe_send_message(
                        ADMIN_NOTIFY_CHAT_ID,
                        f"🏆 <b>Аукцион завершен!</b>\n\n"
                        f"<b>Лот:</b> {html_decoration.quote(auction_title)}\n"
                        f"<b>Победитель:</b> {html_decoration.quote(winner_name)} (ID: <code>{winner_id}</code>)\n"
                        f"<b>Ставка:</b> {winning_bid} билетов\n\n"
                        f"Билеты списаны. Пожалуйста, свяжитесь с победителем для выдачи приза."
                    )
                results.append(f"Auction {auction_id} finished, winner {winner_id}.")
            else:
                # Случай, когда нет победителя
                logging.info(f"CRON (Аукцион): Аукцион {auction['title']} (ID: {auction_id}) завершен без ставок.")
                results.append(f"Auction {auction_id} finished, no winner.")

        return {"message": "Auction check completed.", "results": results}

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
    """Начисляет бонусы (звезды, билеты, таймер) в фоне."""
    try:
        # Используем того же быстрого клиента, что и для Twitch
        client = await get_background_client()

        # 1. Начисляем звезду Чекпоинта
        await client.post("/rpc/increment_checkpoint_stars", json={"p_user_id": user_id, "p_amount": 1})

        # 2. Начисляем билеты (получаем кол-во и начисляем)
        # (Логика get_ticket_reward_amount_global на httpx)
        rules_resp = await client.get("/reward_rules", params={"action_type": "eq.challenge_completion", "select": "ticket_amount"})
        rules_data = rules_resp.json()
        ticket_amount = rules_data[0]['ticket_amount'] if rules_data else 1
        
        if ticket_amount > 0:
            await client.post("/rpc/increment_tickets", json={"p_user_id": user_id, "p_amount": ticket_amount})

        # 3. Обновляем таймер
        await client.post("/rpc/update_last_challenge_time", json={"p_user_id": user_id})
        
        logging.info(f"✅ [BG] Бонусы челленджа начислены для {user_id}")

    except Exception as e:
        logging.error(f"❌ [BG] Ошибка начисления бонусов челленджа: {e}")
    
@app.post("/api/v1/challenges/{challenge_id}/claim")
async def claim_challenge(
    challenge_id: int,
    request_data: InitDataRequest,
    background_tasks: BackgroundTasks, # <--- Добавили
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

    # Если награды выключены
    if not admin_settings.challenge_promocodes_enabled:
        await supabase.post(
            "/rpc/complete_challenge_and_set_cooldown",
            json={"p_user_id": current_user_id, "p_challenge_id": challenge_id}
        )
        return {"success": True, "message": "Челлендж выполнен! Награды временно отключены.", "promocode": None}

    # 2. Пробуем забрать награду
    try:
        # Попытка 1: Штатный режим
        rpc_response = await supabase.post(
            "/rpc/claim_challenge_and_get_reward", 
            json={"p_user_id": current_user_id, "p_challenge_id": challenge_id}
        )
        rpc_response.raise_for_status()
        promocode_text = rpc_response.text.strip('"')
        message = "Награда получена!"

    except httpx.HTTPStatusError as e:
        # Попытка 2: Обработка сбоев / повторов (Fallback)
        error_details = e.response.json().get("message", e.response.text) if e.response.headers.get("content-type") == "application/json" else e.response.text
        
        # Если челлендж "уже выполнен", но награда не забрана
        is_already_done = e.response.status_code == 400 and any(x in error_details for x in ['уже выполнен', 'completed', 'expired'])
        
        if is_already_done:
            try:
                award_resp = await supabase.post(
                    "/rpc/award_reward_and_get_promocode",
                    json={"p_user_id": current_user_id, "p_source_type": "challenge", "p_source_id": challenge_id}
                )
                award_resp.raise_for_status()
                
                # Парсим ответ (может быть JSON {"code": "..."} или просто строка)
                try:
                    award_json = award_resp.json()
                    promocode_text = award_json.get("code") if isinstance(award_json, dict) else str(award_json).strip('"')
                except:
                    promocode_text = award_resp.text.strip('"')
                    
                message = "Награда получена (восстановлена)!"
            except Exception:
                # Если и тут ошибка — значит реально нельзя
                raise HTTPException(status_code=409, detail=error_details)
        else:
            raise HTTPException(status_code=400, detail=error_details)

    # 3. 🔥 ВСЕ БОНУСЫ УХОДЯТ В ФОН 🔥
    # Мы не ждем их выполнения. Ответ улетает пользователю мгновенно.
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
            f"<b>🎉 Твоя награда за квест «{quest_title}»!</b>\n\n"
            f"Скопируй промокод и используй его в @HATElavka_bot, чтобы получить свои звёзды.\n\n"
            f"Твой промокод:\n<code>{promo_code}</code>\n\n"
            f"<i>Нажми на кнопку ниже, чтобы активировать.</i>"
        )
        keyboard = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="✅ Активировать в HATElavka", url=activation_url)]])
        await safe_send_message(user_id, text=notification_text, reply_markup=keyboard, parse_mode=ParseMode.HTML)
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
                "select": "created_at, grant_type, amount"
            }
        )
        grants = grants_resp.json()
        for grant in grants:
            all_rewards.append({
                "type": "grant",
                "date": grant['created_at'],
                "data": grant
            })
            
        # 3. Сортируем все награды по дате (новые сверху)
        all_rewards.sort(key=lambda x: x['date'], reverse=True)
        
        return all_rewards

    except Exception as e:
        logging.error(f"Ошибка при получении объединенных наград для {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить список наград.")

# --- ИСПРАВЛЕННЫЙ ЭНДПОИНТ ДЛЯ КВЕСТОВ ---
# --- ИСПРАВЛЕННАЯ ВЕРСИЯ ФУНКЦИИ (УДАЛЕНА ПРОВЕРКА .error) ---

class GrantDeleteRequest(BaseModel):
    initData: str
    id: int

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
        # Вызываем RPC-функцию для атомарного получения билета
        response = await supabase.post("/rpc/claim_daily_ticket", json={"p_user_id": telegram_id})
        response.raise_for_status()

        new_balance = response.json()
        return {
            "message": "✅ Бесплатный билет успешно получен!",
            "new_ticket_balance": new_balance
        }
    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Не удалось получить билет.")
        logging.error(f"Ошибка RPC при получении билета для user {telegram_id}: {error_details}")
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
                quest_schedule_active_type=settings_data.get('quest_schedule_active_type', 'twitch')
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
            f"⭐ Вам начислено <b>{amount} звёзд</b> Чекпоинта!\n\n"
            f"Награда выдана администратором и уже доступна на вашем балансе в профиле."
        )
        background_tasks.add_task(safe_send_message, user_id_to_grant, notification_text)

        return {"message": f"{amount} звезд Чекпоинта успешно выдано пользователю {user_name}."}
    except Exception as e:
        logging.error(f"Ошибка при выдаче звезд Чекпоинта: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось выдать звезды Чекпоинта.")


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

@app.post("/api/v1/admin/manual_rewards/complete")
async def complete_manual_reward(
    request_data: ManualRewardCompleteRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Помечает ручную награду как выданную."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    await supabase.patch(
        "/manual_rewards",
        params={"id": f"eq.{request_data.reward_id}"},
        json={"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}
    )
    return {"message": "Награда помечена как выданная."}

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
    """(Админ) Удаляет одну покупку. Пишет логи только при ошибках."""
    
    # Проверка прав
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # Просто отправляем запрос
        response = await supabase.delete(
            "/twitch_reward_purchases",
            params={"id": f"eq.{request_data.purchase_id}"}
        )
        
        # Если статус не 2xx — это ошибка, её надо записать
        if response.status_code not in range(200, 300):
            logging.error(f"❌ Ошибка удаления ID {request_data.purchase_id}: {response.status_code} - {response.text}")
            raise HTTPException(status_code=response.status_code, detail=f"DB Error: {response.text}")

        # При успехе — тишина и покой 🤫
        return {"message": "Покупка успешно удалена."}

    except Exception as e:
        # Критические ошибки (падение кода) записываем
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
    """Пользователь забирает ежедневную награду (монеты)."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        # Вызываем RPC
        response = await supabase.post(
            "/rpc/claim_grind_reward",
            json={"p_user_id": user_info["id"]}
        )
        response.raise_for_status()
        return response.json()

    except httpx.HTTPStatusError as e:
        # Обработка ошибок от RPC (например, кулдаун)
        error_msg = e.response.json().get("message", e.response.text)
        raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        logging.error(f"Grind claim error: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


class ExchangeRequest(BaseModel):
    initData: str
    cost: float
    tickets_reward: int

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

@app.post("/api/v1/shop/goods")
async def get_bott_goods_proxy(
    request_data: ShopCategoryRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    url = "https://api.bot-t.com/v1/shoppublic/category/view"
    
    payload = {
        "bot_id": str(BOTT_BOT_ID),
        "public_key": BOTT_PUBLIC_KEY,
        "category_id": request_data.category_id 
    }

    headers = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, headers=headers)
            
        if resp.status_code != 200:
            logging.error(f"[SHOP] Ошибка API: {resp.status_code}")
            return []

        data = resp.json().get("data", [])
        mapped_items = []

        for item in data:
            is_folder = (item.get("type") == 0)

            image_url = "https://placehold.co/150?text=No+Image"
            if item.get("design") and item["design"].get("image"):
                image_url = item["design"]["image"]
            elif item.get("photo") and item["photo"].get("abs_path"):
                image_url = item["photo"]["abs_path"]

            # ЦЕНЫ: Bot-t отдает в копейках. Делим на 100
            price = 0
            if item.get("price"):
                amount = item["price"].get("amount", 0)
                price = int(amount / 100) if amount else 0

            name = "Без названия"
            if item.get("design"):
                name = item["design"].get("title", "Без названия")

            # --- 👇 НОВАЯ ЛОГИКА: ПОЛУЧАЕМ ОСТАТОК 👇 ---
            count = None # None означает "бесконечно" или "не указано"
            if item.get("setting"):
                # API может вернуть null, строку или число. Приводим безопасно.
                raw_count = item["setting"].get("count")
                if raw_count is not None:
                    count = int(raw_count)
            # ---------------------------------------------

            mapped_items.append({
                "id": item.get("id"),
                "name": name,
                "price": price,
                "image_url": image_url,
                "is_folder": is_folder,
                "count": count # Передаем остаток
            })

        return mapped_items

    except Exception as e:
        logging.error(f"[SHOP] Ошибка: {e}", exc_info=True)
        return []


# --- [2] ДОБАВЛЯЕМ НОВЫЙ ЭНДПОИНТ СИНХРОНИЗАЦИИ БАЛАНСА ---
# Вставь это где-то рядом с другими эндпоинтами магазина
@app.post("/api/v1/user/sync_bott_balance")
async def sync_bott_balance(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    telegram_id = user_info["id"]
    
    # Публичный метод для получения данных
    url = "https://api.bot-t.com/v1/module/bot/check-hash"
    
    payload = {
        "bot_id": int(BOTT_BOT_ID),
        "userData": request_data.initData 
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload)
        
        if resp.status_code != 200:
            return {"bot_t_coins": 0}

        data = resp.json()
        response_data = data.get("data", {})
        
        if not response_data:
             return {"bot_t_coins": 0}

        # 1. Баланс
        money_raw = response_data.get("money", 0)
        current_balance = int(float(money_raw))

        # 2. Внутренний ID
        internal_id = response_data.get("id")

        # 3. Секретный ключ (Самое важное!)
        secret_key = response_data.get("secret_user_key")

        # Сохраняем всё в базу
        update_data = {"bot_t_coins": current_balance}
        if internal_id:
            update_data["bott_internal_id"] = internal_id
        if secret_key:
            update_data["bott_secret_key"] = secret_key # Сохраняем ключ

        await supabase.patch(
            "/users",
            params={"telegram_id": f"eq.{telegram_id}"},
            json=update_data
        )
        
        return {"bot_t_coins": current_balance}

    except Exception as e:
        logging.error(f"[SYNC] Ошибка: {e}", exc_info=True)
        return {"bot_t_coins": 0}
        
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

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=payload)
        
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Ошибка магазина: {resp.text}")

        resp_json = resp.json()
        
        if resp_json.get("result") is False:
            err_msg = resp_json.get("message", "Неизвестная ошибка")
            raise HTTPException(status_code=400, detail=f"Магазин отклонил покупку: {err_msg}")

        # Получаем ID заказа из ответа Bot-t
        # Ответ API: {"result": true, "data": {"id": 12345, ...}}
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
            
            # Если ID заказа вдруг нет, ставим 0, чтобы не ломать формат строки
            safe_order_id = bott_order_id if bott_order_id else 0
            
            # Формируем строку: Название | Картинка | ID заказа
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

# --- 🛠️ РЕМОНТ ПОДПИСОК TWITCH ---
@app.get("/api/v1/debug/fix_twitch_subs")
async def fix_twitch_subs(
    request: Request,
    # Используем ваши переменные окружения
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Удаляет старые подписки и создает новую на ТЕКУЩИЙ адрес приложения.
    """
    # 1. Получаем токен приложения (App Access Token)
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://id.twitch.tv/oauth2/token",
            data={
                "client_id": TWITCH_CLIENT_ID,
                "client_secret": TWITCH_CLIENT_SECRET,
                "grant_type": "client_credentials"
            }
        )
        if token_resp.status_code != 200:
            return {"error": "Не удалось получить токен Twitch", "details": token_resp.json()}
        
        access_token = token_resp.json()["access_token"]
        headers = {
            "Client-ID": TWITCH_CLIENT_ID,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

        # 2. Получаем текущий ID канала (Broadcaster ID) из базы или хардкода
        # ВАЖНО: Twitch требует ID стримера (число), а не логин. 
        # Если он есть в базе users - берем оттуда. Если нет - нужно указать вручную.
        # Попробуем найти админа:
        admin_user = None
        for admin_id in ADMIN_IDS:
            u_resp = await supabase.get("/users", params={"telegram_id": f"eq.{admin_id}", "select": "twitch_id"})
            if u_resp.json() and u_resp.json()[0].get("twitch_id"):
                admin_user = u_resp.json()[0]
                break
        
        if not admin_user:
            return {"error": "Не найден Twitch ID администратора в базе. Войдите через Twitch в боте."}
        
        broadcaster_id = admin_user["twitch_id"]

        # 3. Удаляем ВСЕ старые подписки (чтобы очистить мусор на старых хостах)
        subs_resp = await client.get("https://api.twitch.tv/helix/eventsub/subscriptions", headers=headers)
        if subs_resp.status_code == 200:
            for sub in subs_resp.json().get("data", []):
                if sub["status"] != "enabled" or "quest" in sub["transport"]["callback"]: # Удаляем все или по критерию
                    print(f"Удаляю подписку {sub['id']} -> {sub['transport']['callback']}")
                    await client.delete(f"https://api.twitch.tv/helix/eventsub/subscriptions?id={sub['id']}", headers=headers)

        # 4. Создаем НОВУЮ подписку на правильный адрес
        # Ваш новый адрес (берем из WEB_APP_URL или собираем сами)
        # ВАЖНО: Убедитесь, что WEB_APP_URL в .env правильный (https://hatelavka-quest-nine.vercel.app)
        callback_url = f"{WEB_APP_URL}/api/v1/webhooks/twitch" 
        
        sub_payload = {
            "type": "channel.channel_points_custom_reward_redemption.add",
            "version": "1",
            "condition": {
                "broadcaster_user_id": broadcaster_id
            },
            "transport": {
                "method": "webhook",
                "callback": callback_url,
                "secret": TWITCH_WEBHOOK_SECRET
            }
        }

        create_resp = await client.post("https://api.twitch.tv/helix/eventsub/subscriptions", headers=headers, json=sub_payload)
        
        return {
            "message": "Переподписка выполнена!",
            "deleted_old": True,
            "new_subscription": create_resp.json(),
            "target_url": callback_url
        }

#### https://hatelavka-quest-nine.vercel.app/api/v1/debug/fix_twitch_subs <- ссылка для фикса

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
