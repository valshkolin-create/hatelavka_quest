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
CACHE_DURATION_SECONDS = 15 # Проверять базу данных только раз в 15 секунд

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

class CategoryReorderRequest(BaseModel):
    initData: str
    ordered_ids: List[int]

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

class EventParticipantsRequest(BaseModel):
    initData: str
    event_id: int

class QuestReorderRequest(BaseModel):
    initData: str
    quest_id: int
    category_id: Optional[int] = None
    direction: str

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
    user_id_to_freeze: int
    days: int

class AdminFreezeStarsRequest(BaseModel):
    initData: str
    user_id_to_freeze: int
    days: int

class AdminSettings(BaseModel):
    skin_race_enabled: bool = True
    slider_order: List[str] = Field(default_factory=lambda: ["skin_race", "cauldron"]) # <-- НОВОЕ ПОЛЕ
    challenge_promocodes_enabled: bool = True
    quest_promocodes_enabled: bool = True
    challenges_enabled: bool = True
    quests_enabled: bool = True
    checkpoint_enabled: bool = False
    menu_banner_url: Optional[str] = "https://i.postimg.cc/d0r554hc/1200-600.png?v=2"
    checkpoint_banner_url: Optional[str] = "https://i.postimg.cc/6p39wgzJ/1200-324.png"
    
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
    promocode_amount: Optional[int] = None
    show_user_input: Optional[bool] = None
    condition_type: Optional[str] = None # <-- ДОБАВЛЕНО
    target_value: Optional[int] = None   # <-- ДОБАВЛЕНО

class TwitchRewardIssueRequest(BaseModel):
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

class RoulettePrizeDeleteRequest(BaseModel):
    initData: str
    prize_id: int

class StatisticsRequest(BaseModel):
    initData: str

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

# --- FastAPI app ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.info("🚀 Приложение запускается...")
    yield
    logging.info("👋 Приложение останавливается...")
    # await bot.session.close() # <-- Просто удалите или закомментируйте эту строку

app = FastAPI(title="Quest Bot API")
# app.mount("/public", StaticFiles(directory=TEMPLATES_DIR), name="public")

# --- Middlewares ---
@app.middleware("http")
async def sleep_mode_check(request: Request, call_next):
    path = request.url.path
    # Пропускаем проверку для админки и самого переключателя
    if path.startswith("/api/v1/admin") or path == "/admin" or path == "/api/v1/admin/toggle_sleep_mode":
        return await call_next(request)

    # Проверяем, не истек ли срок действия кеша
    if time.time() - sleep_cache["last_checked"] > CACHE_DURATION_SECONDS:
        logging.info("--- 😴 Кеш режима сна истек, проверяем базу данных... ---")
        try:
            async with httpx.AsyncClient(base_url=f"{os.getenv('SUPABASE_URL')}/rest/v1", headers={"apikey": os.getenv('SUPABASE_SERVICE_ROLE_KEY')}) as client:
                resp = await client.get("/settings", params={"key": "eq.sleep_mode", "select": "value"})
                settings = resp.json()
                if settings:
                    sleep_data = settings[0].get('value', {})
                    sleep_cache["is_sleeping"] = sleep_data.get('is_sleeping', False)
                    sleep_cache["wake_up_at"] = sleep_data.get('wake_up_at')
                else:
                    sleep_cache["is_sleeping"] = False # Если настройки нет, считаем, что не спим
                sleep_cache["last_checked"] = time.time() # Обновляем время последней проверки
        except Exception as e:
            logging.error(f"Ошибка проверки режима сна: {e}")
            # В случае ошибки просто пропускаем запрос, чтобы не блокировать приложение
            pass

    # Теперь используем значения из кеша
    is_sleeping = sleep_cache["is_sleeping"]
    wake_up_at_str = sleep_cache["wake_up_at"]

    if is_sleeping and wake_up_at_str:
        wake_up_time = datetime.fromisoformat(wake_up_at_str)
        if datetime.now(timezone.utc) > wake_up_time:
            is_sleeping = False # Пора просыпаться, пропускаем запрос

    if is_sleeping:
        return JSONResponse(
            status_code=503,
            content={"detail": "Ботик спит, набирается сил"}
        )

    response = await call_next(request)
    return response
# --- Middlewares ---
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logging.info(f"🔹 Path: {request.url.path}")
    logging.info(f"🔹 Method: {request.method}")
    response = await call_next(request)
    logging.info(f"🔹 Response status: {response.status_code}")
    return response

# --- СИСТЕМА УПРАВЛЕНИЯ КЛИЕНТОМ (DEPENDENCY) ---
async def get_supabase_client():
    client = httpx.AsyncClient(
        base_url=f"{SUPABASE_URL}/rest/v1",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        timeout=30.0
    )
    try:
        yield client
    finally:
        await client.aclose()

# --- Utils ---
def encode_cookie(value: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(value).encode("utf-8")).decode("ascii")

def decode_cookie(value: str | None) -> dict | None:
    if not value: return None
    try: return json.loads(base64.urlsafe_b64decode(value.encode("ascii")).decode("utf-8"))
    except Exception: return None

def is_valid_init_data(init_data: str, valid_tokens: list[str]) -> dict | None:
    try:
        parsed_data = dict(parse_qsl(unquote(init_data)))
        if "hash" not in parsed_data: return None
        received_hash = parsed_data.pop("hash")
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed_data.items()))
        for token in valid_tokens:
            if not token: continue
            secret_key = hmac.new("WebAppData".encode(), token.encode(), hashlib.sha256).digest()
            calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
            if calculated_hash == received_hash:
                return json.loads(parsed_data.get("user", "{}"))
        logging.error("❌ HASH MISMATCH - initData validation FAILED.")
        return None
    except Exception:
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
        await supabase.post(
            "/rpc/handle_user_message",
            json={"p_telegram_id": user.id, "p_full_name": full_name}
        )
    except Exception as e:
        logging.error(f"Ошибка в handle_user_message для user_id={user.id}: {e}", exc_info=True)

async def get_admin_settings_async(supabase: httpx.AsyncClient) -> AdminSettings:
    """Вспомогательная функция для получения настроек админки."""
    try:
        resp = await supabase.get("/settings", params={"key": "eq.admin_controls", "select": "value"})
        resp.raise_for_status()
        data = resp.json()
        if data and data[0].get('value'):
            settings_data = data[0]['value']
            return AdminSettings(
                challenge_promocodes_enabled=settings_data.get('challenge_promocodes_enabled', True),
                quest_promocodes_enabled=settings_data.get('quest_promocodes_enabled', True),
                challenges_enabled=settings_data.get('challenges_enabled', True),
                quests_enabled=settings_data.get('quests_enabled', True),
                checkpoint_enabled=settings_data.get('checkpoint_enabled', False) # ✅ ДОБАВЬ ЭТУ СТРОКУ
            )
    except Exception as e:
        logging.error(f"Не удалось получить admin_settings, используются значения по умолчанию: {e}")
    # Возвращаем дефолтные настройки, если в базе ничего нет или произошла ошибка
    return AdminSettings()

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

@app.post("/api/v1/webhook")
async def telegram_webhook(update: dict, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    # --- НАЧАЛО ИСПРАВЛЕННОЙ ЛОГИКИ ---
    logging.info("--- ЗАПУЩЕНА ФИНАЛЬНАЯ ВЕРСЯ ОБРАБОТЧИКА webhook ---")
    
    # Список ID служебных аккаунтов Telegram, которые нужно игнорировать
    SERVICE_ACCOUNT_IDS = {
        777000,     # 'Telegram' (сообщения от имени канала)
        1087968824, # 'Anonymous Admin' / 'Group'
        136817688,  # 'Group' (более старый ID)
    }

    try:
        message = update.get("message")
        if not message:
            return JSONResponse(content={"status": "ignored", "reason": "no_message_field"})

        from_user = message.get("from", {})
        telegram_id = from_user.get("id")
        
        # Проверяем, не является ли отправитель служебным аккаунтом
        if not telegram_id or telegram_id in SERVICE_ACCOUNT_IDS:
            logging.info(f"Пропущено сообщение от служебного аккаунта: ID {telegram_id}")
            return JSONResponse(content={"status": "ignored", "reason": "service_account"})

        first_name = from_user.get("first_name", "")
        last_name = from_user.get("last_name", "")
        full_name = f"{first_name} {last_name}".strip() or "Без имени"

        logging.info(f"Получено сообщение от ID: {telegram_id}, Имя: '{full_name}'")

        # Вызываем основную рабочую функцию в Supabase
        await supabase.post(
            "/rpc/handle_user_message",
            json={
                "p_telegram_id": int(telegram_id),
                "p_full_name": full_name
            }
        )
        
        return JSONResponse(content={"status": "ok"})

    except Exception as e:
        logging.error(f"Ошибка в /api/v1/webhook: {e}", exc_info=True)
        # Возвращаем 200, чтобы не заставлять Telegram повторять запрос
        return JSONResponse(content={"status": "error", "message": str(e)})
    # --- КОНЕЦ ИСПРАВЛЕННОЙ ЛОГИКИ ---

@app.post("/api/v1/webhooks/twitch")
async def handle_twitch_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Принимает и обрабатывает вебхуки от Twitch EventSub."""
    body = await request.body()
    headers = request.headers
    message_id = headers.get("Twitch-Eventsub-Message-Id")
    timestamp = headers.get("Twitch-Eventsub-Message-Timestamp")
    signature = headers.get("Twitch-Eventsub-Message-Signature")

    if not all([message_id, timestamp, signature, TWITCH_WEBHOOK_SECRET]):
        raise HTTPException(status_code=403, detail="Отсутствуют заголовки подписи.")

    hmac_message = (message_id + timestamp).encode() + body
    expected_signature = "sha256=" + hmac.new(
        TWITCH_WEBHOOK_SECRET.encode(), hmac_message, hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, signature):
        raise HTTPException(status_code=403, detail="Неверная подпись.")

    message_type = headers.get("Twitch-Eventsub-Message-Type")
    data = json.loads(body)

    if message_type == "webhook_callback_verification":
        challenge = data.get("challenge")
        return Response(content=challenge, media_type="text/plain")

    if message_type == "notification":
        try:
            event_data = data.get("event", {})
            twitch_login = event_data.get("user_login", "unknown_user").lower()
            reward_data = event_data.get("reward", {})
            reward_title = reward_data.get("title", "Unknown Reward")
            user_input = event_data.get("user_input")

            # Ищем пользователя в нашей базе
            user_resp = await supabase.get("/users", params={"twitch_login": f"eq.{twitch_login}", "select": "telegram_id, full_name, trade_link"})
            user_data = user_resp.json()
            user_record = user_data[0] if user_data else None
            user_id = user_record.get("telegram_id") if user_record else None
            user_display_name = user_record.get("full_name") if user_record else twitch_login

            # --- ИСПРАВЛЕННАЯ ЛОГИКА ---
            # Получаем настройки ивента "Котел"
            cauldron_resp = await supabase.get(
                "/pages_content",
                params={"page_name": "eq.cauldron_event", "select": "content", "limit": 1}
            )
            cauldron_settings = cauldron_resp.json()[0]['content'] if cauldron_resp.json() and cauldron_resp.json()[0].get('content') else {}
            # Теперь получаем готовый список объектов [{title, value}]
            cauldron_triggers = cauldron_settings.get("twitch_reward_triggers", []) 

            # 1. ПРОВЕРКА НА ВКЛАД В КОТЕЛ
            # Ищем нужную награду в списке объектов
            found_trigger = next((trigger for trigger in cauldron_triggers if trigger.get("title") == reward_title), None)
            
            if cauldron_settings.get("is_visible_to_users", False) and found_trigger:
                contribution_value = found_trigger.get("value", 0)
                logging.info(f"🔥 Получен вклад в котел от {twitch_login} ценностью {contribution_value}.")

                response = await supabase.post(
                    "/rpc/contribute_to_cauldron",
                    json={
                        "p_user_id": user_id,
                        "p_amount": contribution_value,
                        "p_user_display_name": user_display_name,
                        "p_contribution_type": "twitch_points"
                    }
                )
                response.raise_for_status()
                result = response.json()

                await manager.broadcast(json.dumps({
                    "type": "cauldron_update",
                    "new_progress": result.get('new_progress'),
                    "last_contributor": { "name": user_display_name, "type": "twitch_points", "amount": contribution_value }
                }))
                
                return {"status": "cauldron_contribution_accepted"}

            # 2. ПРОВЕРКА НА РУЛЕТКУ (старая логика)
            prizes_resp = await supabase.get(
                "/roulette_prizes", 
                params={"reward_title": f"eq.{reward_title}", "select": "skin_name,image_url,chance_weight"}
            )
            prizes_resp.raise_for_status()
            roulette_prizes = prizes_resp.json()

            if roulette_prizes:
                logging.info(f"Запуск рулетки для '{reward_title}' от пользователя {twitch_login}")
                
                weights = [p['chance_weight'] for p in roulette_prizes]
                winner_prize = random.choices(roulette_prizes, weights=weights, k=1)[0]
                winner_skin_name = winner_prize.get('skin_name', 'Неизвестный скин')
                
                reward_settings_resp = await supabase.get("/twitch_rewards", params={"title": f"eq.{reward_title}", "select": "id,notify_admin"})
                reward_settings = reward_settings_resp.json()
                if not reward_settings:
                    reward_settings = (await supabase.post("/twitch_rewards", json={"title": reward_title}, headers={"Prefer": "return=representation"})).json()
                
                final_user_input = f"Выигрыш: {winner_skin_name}"
                if user_input:
                    final_user_input += f" | Сообщение: {user_input}"
                
                purchase_payload = {
                    "reward_id": reward_settings[0]["id"],
                    "username": user_record.get("full_name", twitch_login) if user_record else twitch_login,
                    "twitch_login": twitch_login,
                    "trade_link": user_record.get("trade_link") if user_record else user_input,
                    "status": "Привязан" if user_record else "Не привязан",
                    "user_input": final_user_input 
                }
                
                if user_record:
                    purchase_payload["user_id"] = user_record.get("telegram_id")
                else:
                    purchase_payload["user_id"] = None
                    
                await supabase.post("/twitch_reward_purchases", json=purchase_payload)

                if ADMIN_NOTIFY_CHAT_ID and reward_settings[0].get("notify_admin", True):
                    notification_text = (
                        f"🎰 <b>Выигрыш в рулетке!</b>\n\n"
                        f"<b>Пользователь:</b> {html_decoration.quote(user_record.get('full_name', twitch_login) if user_record else twitch_login)}\n"
                        f"<b>Рулетка:</b> «{html_decoration.quote(reward_title)}»\n"
                        f"<b>Выпал приз:</b> {html_decoration.quote(winner_skin_name)}\n"
                    )
                    
                    if purchase_payload["trade_link"]:
                        notification_text += f"<b>Трейд-ссылка:</b> <code>{html_decoration.quote(purchase_payload['trade_link'])}</code>\n\n"
                    
                    notification_text += "Информация добавлена в раздел 'Покупки' для этой награды."

                    background_tasks.add_task(safe_send_message, ADMIN_NOTIFY_CHAT_ID, notification_text)

                animation_payload = {
                    "prizes": roulette_prizes,
                    "winner": winner_prize,
                    "winner_index": next((i for i, prize in enumerate(roulette_prizes) if prize['skin_name'] == winner_skin_name), 0),
                    "user_name": twitch_login
                }
                await supabase.post("/roulette_triggers", json={"payload": animation_payload})
                
                logging.info(f"Победитель рулетки: {winner_skin_name}. Триггер для анимации отправлен через Supabase.")
                return {"status": "roulette_triggered"}

            # 3. ОБРАБОТКА ВСЕХ ОСТАЛЬНЫХ НАГРАД (старая логика)
            logging.info(f"Обычная награда '{reward_title}' от {twitch_login}.")
            
            payload_for_purchase = {}
            if user_record:
                telegram_id = user_record.get("telegram_id")
                payload_for_purchase = {
                    "user_id": telegram_id,
                    "username": user_record.get("full_name", twitch_login),
                    "trade_link": user_record.get("trade_link"),
                    "status": "Привязан"
                }
            else:
                payload_for_purchase = {
                    "user_id": None,
                    "username": twitch_login,
                    "trade_link": None,
                    "status": "Не привязан"
                }
            
            reward_settings_resp = await supabase.get(
                "/twitch_rewards",
                params={"title": f"eq.{reward_title}", "select": "id,is_active,notify_admin"}
            )
            reward_settings = reward_settings_resp.json()
            if not reward_settings:
                reward_settings = (await supabase.post(
                    "/twitch_rewards",
                    json={"title": reward_title, "is_active": True, "notify_admin": True},
                    headers={"Prefer": "return=representation"}
                )).json()

            if not reward_settings[0]["is_active"]:
                return {"status": "ok", "detail": "Эта награда отключена админом."}

            if user_record and telegram_id:
                try:
                    await supabase.post(
                        "/rpc/increment_tickets",
                        json={"p_user_id": telegram_id, "p_amount": 1}
                    )
                    logging.info(f"✅ Пользователю {telegram_id} ({twitch_login}) начислен 1 билет за награду Twitch.")
                except Exception as e:
                    logging.error(f"❌ Не удалось начислить билет за Twitch награду пользователю {telegram_id}: {e}")

            await supabase.post("/twitch_reward_purchases", json={
                "reward_id": reward_settings[0]["id"], "user_id": payload_for_purchase["user_id"],
                "username": payload_for_purchase["username"], "twitch_login": twitch_login,
                "trade_link": payload_for_purchase["trade_link"], "status": payload_for_purchase["status"],
                "user_input": user_input
            })

            if ADMIN_NOTIFY_CHAT_ID and reward_settings[0]["notify_admin"]:
                notification_text = (
                    f"🔔 <b>Новая награда за баллы Twitch!</b>\n\n"
                    f"<b>Пользователь:</b> {html_decoration.quote(payload_for_purchase['username'])} ({html_decoration.quote(twitch_login)})\n"
                    f"<b>Награда:</b> {html_decoration.quote(reward_title)}\n"
                    f"<b>Статус:</b> {payload_for_purchase['status']}"
                )
                if user_input:
                    notification_text += f"\n<b>Сообщение:</b> <code>{html_decoration.quote(user_input)}</code>"
                if payload_for_purchase.get("user_id"):
                    notification_text += "\n\n✅ Пользователю начислен 1 билет."
                notification_text += "\nИнформация добавлена в раздел 'Покупки'."
                background_tasks.add_task(safe_send_message, ADMIN_NOTIFY_CHAT_ID, notification_text)
            
            return {"status": "ok"}

        except Exception as e:
            logging.error(f"Ошибка обработки уведомления от Twitch: {e}", exc_info=True)
            return {"status": "error_processing"}

    return {"status": "ok", "detail": "Запрос обработан."}

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
    
@app.post("/api/v1/quests/manual")
async def get_manual_quests(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")
    
    telegram_id = user_info["id"]

    # 1. Получаем ID всех одобренных заявок для этого пользователя
    completed_resp = await supabase.get(
        "/quest_submissions",
        params={"user_id": f"eq.{telegram_id}", "status": "eq.approved", "select": "quest_id"}
    )
    completed_resp.raise_for_status()
    completed_quest_ids = {sub['quest_id'] for sub in completed_resp.json()}

    # 2. Получаем все активные квесты с ручной проверкой
    all_manual_quests_resp = await supabase.get(
        "/quests",
        params={
            "is_active": "eq.true", 
            "quest_type": "eq.manual_check", 
            "select": "*, quest_categories(name, sort_order)"
        }
    )
    all_manual_quests_resp.raise_for_status()
    all_manual_quests = all_manual_quests_resp.json()

    # 3. Фильтруем квесты, оставляя только те, которые не были выполнены
    # или являются многоразовыми (is_repeatable = true)
    available_quests = [
        quest for quest in all_manual_quests 
        # ИСПРАВЛЕНО: Используем .get() для безопасного доступа к полю
        if quest.get('is_repeatable') or quest.get('id') not in completed_quest_ids
    ]

    # Сортируем финальный список
    available_quests.sort(key=lambda q: (
        (q.get('quest_categories') or {}).get('sort_order', 999), 
        -q.get('id', 0)
    ))

    return available_quests

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
async def get_public_quests(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    telegram_id = user_info.get("id") if user_info else None

    if not telegram_id:
        return []

    user_resp = await supabase.get("users", params={"telegram_id": f"eq.{telegram_id}", "select": "active_quest_id"})
    user_resp.raise_for_status()
    user_data = user_resp.json()
    
    active_quest_id = user_data[0].get("active_quest_id") if user_data else None

    if active_quest_id:
        quest_check_resp = await supabase.get("/quests", params={"id": f"eq.{active_quest_id}", "select": "is_active"})
        quest_check_resp.raise_for_status()
        quest_check_data = quest_check_resp.json()

        if quest_check_data and quest_check_data[0].get("is_active"):
            full_quest_resp = await supabase.get("/quests", params={"id": f"eq.{active_quest_id}", "select": "*"})
            active_quest = full_quest_resp.json()
            if active_quest:
                active_quest[0]['is_completed'] = False
            return active_quest
        else:
            logging.warning(f"User {telegram_id} had an invalid active_quest_id ({active_quest_id}). Clearing it.")
            await supabase.patch("/users", params={"telegram_id": f"eq.{telegram_id}"}, json={"active_quest_id": None})

    completed_resp = await supabase.get(
        "/user_quest_progress",
        params={"user_id": f"eq.{telegram_id}", "claimed_at": "not.is.null", "select": "quest_id"}
    )
    completed_resp.raise_for_status()
    completed_quest_ids = {sub['quest_id'] for sub in completed_resp.json()}

    all_quests_resp = await supabase.get(
        "/quests",
        params={"is_active": "eq.true", "quest_type": "not.eq.manual_check", "select": "*", "order": "id.desc"}
    )
    all_quests_resp.raise_for_status()
    all_active_quests = all_quests_resp.json()
    
    # --- НОВЫЙ БЛОК: Фильтрация квестов по дню недели ---
    try:
        moscow_tz = ZoneInfo("Europe/Moscow")
        current_day = datetime.now(moscow_tz).weekday() # Понедельник = 0, Воскресенье = 6
    except Exception:
        current_day = datetime.now(timezone.utc).weekday() # Fallback to UTC

    filtered_quests = []
    if current_day == 6 or current_day == 0: # Воскресенье или Понедельник
        logging.info(f"День недели {current_day}: Выдаем Telegram задания.")
        for quest in all_active_quests:
            if quest.get("quest_type", "").startswith("automatic_telegram"):
                filtered_quests.append(quest)
    else: # Вторник - Суббота
        logging.info(f"День недели {current_day}: Выдаем Twitch задания.")
        for quest in all_active_quests:
            if quest.get("quest_type", "").startswith("automatic_twitch"):
                filtered_quests.append(quest)
    # --- КОНЕЦ НОВОГО БЛОКА ---

    available_quests = [
        quest for quest in filtered_quests # Работаем с уже отфильтрованным списком
        if quest.get('is_repeatable') or quest['id'] not in completed_quest_ids
    ]
    
    for q in available_quests:
        q['is_completed'] = False

    return fill_missing_quest_data(available_quests)

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

# --- Pydantic модели ---
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
class PromocodeAddRequest(BaseModel): initData: str; codes: str; reward_value: int; description: str
class PromocodeClaimRequest(BaseModel): initData: str; quest_id: int
class ChallengeAdminCreateRequest(BaseModel): initData: str; description: str; condition_type: str; target_value: int; duration_days: int; reward_amount: int; is_active: bool = True
class ChallengeAdminUpdateRequest(BaseModel): initData: str; challenge_id: int; description: str; condition_type: str; target_value: int; duration_days: int; reward_amount: int; is_active: bool
class ChallengeAdminDeleteRequest(BaseModel): initData: str; challenge_id: int
class QuestStartRequest(BaseModel):
    initData: str
    quest_id: int

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
    Универсальная и надежная функция для отправки сообщений,
    которая создает временную сессию бота для каждой отправки.
    """
    temp_bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    try:
        await temp_bot.send_message(chat_id=chat_id, text=text, **kwargs)
        logging.info(f"Безопасная отправка сообщения в чат {chat_id} выполнена.")
    except Exception as e:
        logging.error(f"ОШИБКА безопасной отправки в чат {chat_id}: {e}", exc_info=True)
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
    
# --- ПРАВИЛЬНО ---
@app.post("/api/v1/user/me")
async def get_current_user_data(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        return JSONResponse(content={"is_guest": True})

    telegram_id = user_info["id"]

    try:
        # Основной вызов RPC-функции
        response = await supabase.post(
            "/rpc/get_user_dashboard_data",
            json={"p_telegram_id": telegram_id}
        )
        response.raise_for_status()
        data = response.json()

        # Если профиль пустой, создаем его
        if not data.get('profile'):
            full_name_tg = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip() or "Без имени"
            await supabase.post(
                "/users",
                json={"telegram_id": telegram_id, "username": user_info.get("username"), "full_name": full_name_tg},
                headers={"Prefer": "resolution=merge-duplicates"}
            )
            # Повторно запрашиваем данные после создания
            response = await supabase.post("/rpc/get_user_dashboard_data", json={"p_telegram_id": telegram_id})
            data = response.json()

        # Собираем основной ответ
        final_response = data.get('profile', {})
        final_response['challenge'] = data.get('challenge')
        final_response['event_participations'] = data.get('event_participations', {})
        
        # Проверяем, является ли пользователь админом
        is_admin = telegram_id in ADMIN_IDS
        final_response['is_admin'] = is_admin

        # --- НАЧАЛО ИСПРАВЛЕНИЯ ---
        # Если это админ, и по какой-то причине RPC не вернула его баланс билетов,
        # делаем дополнительный надежный запрос.
        if is_admin and 'tickets' not in final_response:
            logging.warning(f"RPC не вернула баланс билетов для админа {telegram_id}. Делаю дополнительный запрос...")
            user_details_resp = await supabase.get("users", params={"telegram_id": f"eq.{telegram_id}", "select": "tickets"})
            user_details_resp.raise_for_status()
            user_details = user_details_resp.json()
            if user_details:
                final_response['tickets'] = user_details[0].get('tickets', 0)
        # --- КОНЕЦ ИСПРАВЛЕНИЯ ---

        admin_settings = await get_admin_settings_async(supabase)
        final_response['is_checkpoint_globally_enabled'] = admin_settings.checkpoint_enabled
        
        return JSONResponse(content=final_response)

    except Exception as e:
        logging.error(f"Критическая ошибка в /api/v1/user/me: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось получить данные профиля.")
        
# --- API ДЛЯ ИВЕНТА "ВЕДЬМИНСКИЙ КОТЕЛ" ---

@app.post("/api/v1/admin/events/cauldron/update")
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
    request_data: StatisticsRequest, # Убедитесь, что модель StatisticsRequest добавлена
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    (Админ) Собирает и возвращает ключевую статистику по активности пользователей и ивентам.
    """
    # 1. Проверка прав администратора
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # 2. Вызываем RPC-функцию в Supabase, которая соберет всю статистику за один раз
        response = await supabase.post("/rpc/get_project_pulse_stats")
        response.raise_for_status()
        
        # Функция вернет все данные в нужном формате
        stats_data = response.json()

        # 3. Дополнительно получаем статистику по активным розыгрышам
        events_stats_resp = await supabase.post("/rpc/get_active_events_stats")
        events_stats_resp.raise_for_status()
        
        # 4. Собираем финальный ответ
        final_response = {
            "pulse": stats_data,
            "events": events_stats_resp.json()
        }
        
        return final_response

    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Ошибка базы данных")
        logging.error(f"HTTP-ошибка при получении статистики: {error_details}")
        raise HTTPException(status_code=500, detail=f"Не удалось загрузить статистику: {error_details}")
    except Exception as e:
        logging.error(f"Критическая ошибка при получении статистики: {e}", exc_info=True)
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
async def get_quest_details(request_data: QuestDeleteRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
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

# --- API ДЛЯ ИВЕНТА "ВЕДЬМИНСКИЙ КОТЕЛ" ---

@app.get("/api/v1/events/cauldron/status")
async def get_cauldron_status(
    request: Request,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Отдает текущее состояние ивента 'Котел'. 
    Всегда возвращает полные данные; фронтенд решает, что показывать.
    """
    try:
        resp = await supabase.get(
            "/pages_content",
            params={"page_name": "eq.cauldron_event", "select": "content", "limit": 1}
        )
        resp.raise_for_status()
        data = resp.json()

        # Если в базе данных еще нет записи об ивенте, возвращаем пустой объект
        if not data or not data[0].get('content'):
            return {"is_visible_to_users": False}

        # Просто возвращаем все содержимое как есть
        return data[0]['content']

    except Exception as e:
        logging.error(f"Ошибка при получении статуса котла: {e}")
        # В случае ошибки также возвращаем "невидимый" статус
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
    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Ошибка на стороне базы данных.")
        raise HTTPException(status_code=400, detail=error_details)
    except Exception as e:
        logging.error(f"Критическая ошибка при вкладе в котел: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")

@app.get("/api/v1/admin/twitch_rewards/list")
async def list_twitch_rewards(supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    resp = await supabase.get("/twitch_rewards", params={"select": "*", "order": "id.desc"})
    resp.raise_for_status()
    return resp.json()


@app.post("/api/v1/admin/twitch_rewards/update")
async def update_twitch_reward(
    request_data: TwitchRewardUpdateRequest, # Используем новую модель
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    reward_id = request_data.id
    update_fields = request_data.dict(exclude={'initData', 'id'}, exclude_none=True)

    if not update_fields:
        raise HTTPException(status_code=400, detail="Нет полей для обновления")

    await supabase.patch(
        "/twitch_rewards",
        params={"id": f"eq.{reward_id}"},
        json=update_fields
    )
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
    (ОПТИМИЗИРОВАНО) Получает всю информацию о покупках и прогрессе одним запросом к базе данных.
    """
    try:
        # Делаем всего один вызов к нашей новой "умной" функции в Supabase
        response = await supabase.post(
            "/rpc/get_twitch_reward_purchases_for_admin",
            json={"p_reward_id": reward_id}
        )
        response.raise_for_status()
        
        # Функция в базе данных уже подготовила для нас идеальный JSON,
        # который мы просто возвращаем на фронтенд.
        return response.json()

    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Ошибка базы данных")
        logging.error(f"HTTP-ошибка при получении покупок (RPC): {error_details}")
        raise HTTPException(status_code=500, detail=f"Не удалось загрузить покупки: {error_details}")
    except Exception as e:
        logging.error(f"Критическая ошибка при получении покупок (RPC): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера при получении покупок.")

@app.post("/api/v1/promocode")
async def get_promocode(
    request_data: PromocodeClaimRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = user_info["id"]
    quest_id = request_data.quest_id

    try:
        # Просто вызываем нашу исправленную SQL-функцию
        response = await supabase.post(
            "/rpc/award_reward_and_get_promocode",
            json={
                "p_user_id": user_id,
                "p_source_type": "quest",
                "p_source_id": quest_id
            }
        )
        response.raise_for_status()
        
        promocode_data = response.json()
        return {
            "message": "Квест выполнен! Ваша награда добавлена в профиль.",
            "promocode": promocode_data
        }
    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Не удалось получить награду.")
        logging.error(f"Ошибка при получении награды за квест: {error_details}")
        raise HTTPException(status_code=400, detail=error_details)
    except Exception as e:
        logging.error(f"Ошибка при получении награды за квест: {e}")
        raise HTTPException(status_code=400, detail="Не удалось получить награду.")
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
    
# --- ФИНАЛЬНАЯ ВЕРСИЯ КОДА ДЛЯ VERCEL ---
@app.post("/api/v1/challenges/{challenge_id}/claim")
async def claim_challenge(
    challenge_id: int,
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")
    
    current_user_id = user_info["id"]

    try:
        logging.info(f"🔹 Пользователь {current_user_id} запрашивает награду за челлендж {challenge_id}")
        
        admin_settings = await get_admin_settings_async(supabase)

        promocode_text = None # Переменная для промокода
        
        # Проверяем, включены ли награды за челленджи
        if not admin_settings.challenge_promocodes_enabled:
            logging.info(f"Награды за челленджи отключены. Обработка для user {current_user_id}")
            # Вызываем SQL-функцию, которая просто завершает челлендж и ставит кулдаун
            await supabase.post(
                "/rpc/complete_challenge_and_set_cooldown",
                json={"p_user_id": current_user_id, "p_challenge_id": challenge_id}
            )
            message = "Челлендж выполнен! Выдача наград временно отключена."
        else:
            # Если награды включены, выполняем стандартную логику с выдачей промокода
            rpc_payload = {
                "p_user_id": current_user_id,
                "p_challenge_id": challenge_id
            }
            rpc_response = await supabase.post("/rpc/claim_challenge_and_get_reward", json=rpc_payload)
            
            if rpc_response.status_code != 200:
                error_details = rpc_response.json().get("message", "Не удалось получить награду.")
                raise HTTPException(status_code=400, detail=error_details)

            promocode_text = rpc_response.text.strip('"')
            message = "Награда получена!"
            
        # --- НАЧИСЛЯЕМ ВСЕГДА ПОСЛЕ УСПЕШНОГО ВЫПОЛНЕНИЯ ---
        
        # 1. Начисляем звезду Чекпоинта
        await supabase.post(
            "/rpc/increment_checkpoint_stars",
            json={"p_user_id": current_user_id, "p_amount": 1} 
        )
        logging.info(f"✅ Пользователю {current_user_id} начислена 1 звезда для Чекпоинта.")

        # 2. Начисляем билет (НОВОЕ)
        await supabase.post(
            "/rpc/increment_tickets",
            json={"p_user_id": current_user_id, "p_amount": 1}
        )
        logging.info(f"✅ Пользователю {current_user_id} начислен 1 билет за челлендж.")


        # Обновляем таймер последнего выполненного челленджа
        try:
            await supabase.post(
                "/rpc/update_last_challenge_time",
                json={"p_user_id": current_user_id}
            )
            logging.info(f"✅ Обновлена дата последнего челленджа для пользователя {current_user_id}.")
        except Exception as e:
            logging.error(f"Не удалось обновить last_challenge_completed_at для user {current_user_id}: {e}")

        return {
            "success": True,
            "message": message,
            "promocode": promocode_text 
        }

    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Ошибка при взаимодействии с базой данных.")
        logging.error(f"❌ Ошибка HTTP при выдаче награды за челлендж: {error_details}", exc_info=True)
        raise HTTPException(status_code=400, detail=error_details)
    except Exception as e:
        logging.error(f"❌ Неизвестная ошибка при выдаче награды: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")
        
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

# --- НОВАЯ ИСПРАВЛЕННАЯ ФУНКЦИЯ-ПОМОЩНИК ---
async def award_reward_and_notify(
    user_id: int, 
    quest_title: str, 
    promocode: dict
):
    """
    Эта функция выполняется в фоне и создает свои собственные подключения.
    """
    # Создаем собственное, свежее подключение к Supabase
    async with httpx.AsyncClient(
        base_url=f"{os.getenv('SUPABASE_URL')}/rest/v1",
        headers={"apikey": os.getenv('SUPABASE_SERVICE_ROLE_KEY'), "Authorization": f"Bearer {os.getenv('SUPABASE_SERVICE_ROLE_KEY')}"},
        timeout=30.0
    ) as supabase:
        # 1. Начисляем тикет
        try:
            await supabase.post(
                "/rpc/increment_tickets",
                json={"p_user_id": user_id, "p_amount": 1}
            )
            logging.info(f"ФОНОВАЯ ЗАДАЧА: Начислен 1 тикет пользователю {user_id}.")
        except Exception as e:
            logging.error(f"ФОНОВАЯ ОШИБКА: Не удалось начислить тикет: {e}")

    # Используем глобальный объект bot для отправки сообщения
    # 2. Отправляем уведомление
    try:
        promo_code = promocode['code']
        activation_url = f"https://t.me/HATElavka_bot?start={promo_code}"
        notification_text = (
            f"<b>Твоя награда за квест «{quest_title}»!</b>\n\n"
            f"Воспользуйся промокодом в @HATElavka_bot для пополнения звёзд.\n\n"
            f"Твой промокод:\n<code>{promo_code}</code>\n\n"
            f"<i>Нажми на код, чтобы скопировать.</i>"
        )
        keyboard = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="✅ Активировать в HATElavka", url=activation_url)]])
        await bot.send_message(user_id, text=notification_text, reply_markup=keyboard, parse_mode=ParseMode.HTML)
        logging.info(f"ФОНОВАЯ ЗАДАЧА: Уведомление отправлено пользователю {user_id}.")
    except Exception as e:
        logging.error(f"ФОНОВАЯ ОШИБКА: Не удалось отправить уведомление о промокоде: {e}")


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
    background_tasks: BackgroundTasks, # <-- Добавили это
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    submission_id = request_data.submission_id
    action = request_data.action

    submission_data_resp = await supabase.get(
        "/quest_submissions",
        params={"id": f"eq.{submission_id}", "select": "user_id, quest:quests(title, is_repeatable)"}
    )
    submission_data = submission_data_resp.json()
    if not submission_data:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    user_to_notify = submission_data[0]['user_id']
    quest_title = submission_data[0]['quest']['title']

    if action == 'rejected':
        await supabase.patch("/quest_submissions", params={"id": f"eq.{submission_id}"}, json={"status": "rejected"})
        # Можно и сюда добавить фоновую задачу для надежности
        background_tasks.add_task(bot.send_message, user_to_notify, f"❌ Увы, твоя заявка на квест «{quest_title}» была отклонена.")
        return {"message": "Заявка отклонена."}

    elif action == 'approved':
        try:
            response = await supabase.post(
                "/rpc/award_reward_and_get_promocode",
                json={ "p_user_id": user_to_notify, "p_source_type": "manual_submission", "p_source_id": submission_id }
            )
            response.raise_for_status()
            promo_code = response.text.strip('"')

            # Вместо await bot.send_message используем фоновую задачу
            background_tasks.add_task(send_approval_notification, user_to_notify, quest_title, promo_code)

            return {"message": "Заявка одобрена. Награда отправляется пользователю.", "promocode": promo_code}

        except httpx.HTTPStatusError as e:
            error_details = e.response.json().get("message", "Ошибка базы данных.")
            logging.error(f"Ошибка Supabase при одобрении заявки {submission_id}: {error_details}")
            raise HTTPException(status_code=400, detail=error_details)
        except Exception as e:
            logging.error(f"Критическая ошибка при одобрении заявки {submission_id}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Не удалось одобрить заявку и отправить награду.")
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
async def get_user_rewards(request_data: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info: raise HTTPException(status_code=401, detail="Доступ запрещен")
    rewards_resp = await supabase.get("/promocodes", params={"telegram_id": f"eq.{user_info['id']}", "select": "code,description,reward_value,claimed_at", "order": "claimed_at.desc"})
    return rewards_resp.json()

# --- ИСПРАВЛЕННЫЙ ЭНДПОИНТ ДЛЯ КВЕСТОВ ---
@app.post("/api/v1/promocode")
async def get_promocode(
    request_data: PromocodeClaimRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = user_info["id"]
    quest_id = request_data.quest_id

    try:
        # 1. Находим ID прогресса квеста, который можно забрать
        progress_resp = await supabase.get(
            "/user_quest_progress",
            params={
                "user_id": f"eq.{user_id}",
                "quest_id": f"eq.{quest_id}",
                "status": "eq.completed",
                "claimed_at": "is.null",
                "select": "id",
                "limit": 1
            }
        )
        progress_resp.raise_for_status()
        progress_data = progress_resp.json()

        if not progress_data:
            raise HTTPException(status_code=404, detail="Нет выполненных квестов для получения награды.")
        
        # 2. Получаем правильный ID для передачи в RPC
        progress_id_to_claim = progress_data[0]['id']

        # 3. Вызываем RPC-функцию с правильным ID
        response = await supabase.post(
            "/rpc/award_reward_and_get_promocode",
            json={
                "p_user_id": user_id,
                "p_source_type": "quest",
                "p_source_id": progress_id_to_claim # <-- Используем правильный ID
            }
        )
        response.raise_for_status()
        
        promocode_data = response.json()
        return {
            "message": "Квест выполнен! Ваша награда добавлена в профиль.",
            "promocode": promocode_data
        }
    except httpx.HTTPStatusError as e:
        error_details = e.response.json().get("message", "Не удалось получить награду.")
        logging.error(f"Ошибка при получении награды за квест: {error_details}")
        raise HTTPException(status_code=400, detail=error_details)
    except Exception as e:
        logging.error(f"Ошибка при получении награды за квест: {e}")
        raise HTTPException(status_code=400, detail="Не удалось получить награду.")
    
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
    Находит и закрывает истёкший челлендж пользователя, НЕ устанавливая кулдаун.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Доступ запрещен")
    
    telegram_id = user_info["id"]

    try:
        # Находим и обновляем статус только для истёкших челленджей
        await supabase.patch(
            "/user_challenges",
            params={
                "user_id": f"eq.{telegram_id}",
                "status": "eq.pending",
                "expires_at": f"lt.{datetime.now(timezone.utc).isoformat()}" # lt = less than
            },
            json={"status": "expired"}
        )
        return {"message": "Истёкший челлендж закрыт."}
    except Exception as e:
        logging.error(f"Ошибка при закрытии истёкшего челленджa для {telegram_id}: {e}")
        raise HTTPException(status_code=500, detail="Не удалось закрыть челлендж.")
    
@app.post("/api/v1/user/challenge")
async def get_or_assign_user_challenge(request_data: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Доступ запрещен")
    telegram_id = user_info["id"]

    # --- Проверка настроек админа ---
    admin_settings = await get_admin_settings_async(supabase)
    if not admin_settings.challenges_enabled:
        return JSONResponse(
            status_code=403,
            content={"message": "Система челленджей временно отключена."}
        )

    # --- Проверка кулдауна ---
    user_resp = await supabase.get(
        "/users",
        params={"telegram_id": f"eq.{telegram_id}", "select": "challenge_cooldown_until"}
    )
    user_data = user_resp.json()
    
    if user_data and user_data[0].get("challenge_cooldown_until"):
        cooldown_until_str = user_data[0]["challenge_cooldown_until"]
        cooldown_until_utc = datetime.fromisoformat(cooldown_until_str.replace('Z', '+00:00'))
        
        if cooldown_until_utc > datetime.now(timezone.utc):
            return JSONResponse(
                status_code=429, 
                content={
                    "detail": "Вы уже выполнили челлендж. Новый будет доступен позже.",
                    "cooldown_until": cooldown_until_utc.isoformat()
                }
            )

    # --- 1. Проверяем, есть ли уже активный (не истёкший) челлендж ---
    pending_resp = await supabase.get(
        "/user_challenges",
        params={"user_id": f"eq.{telegram_id}", "status": "eq.pending", "select": "*,challenges(*)"}
    )
    pending_challenges = pending_resp.json()
    if pending_challenges:
        current_challenge = pending_challenges[0]
        expires_at_str = current_challenge.get("expires_at")
        if expires_at_str:
            expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
            if expires_at < datetime.now(timezone.utc):
                # Если челлендж истёк, помечаем его и продолжаем, чтобы выдать новый
                await supabase.patch(
                    "/user_challenges",
                    params={"id": f"eq.{current_challenge['id']}"},
                    json={"status": "expired"}
                )
            else:
                # Если челлендж активен, возвращаем его
                return current_challenge

    # --- 2. Логика назначения нового челленджа ---
    user_resp = await supabase.get(
        "/users",
        params={"telegram_id": f"eq.{telegram_id}", "select": "*", "limit": 1}
    )
    user_resp.raise_for_status()
    user_stats = user_resp.json()[0] if user_resp.json() else {}

    user_has_twitch = user_stats.get("twitch_id") is not None
    completed_resp = await supabase.get(
        "/user_challenges",
        params={"user_id": f"eq.{telegram_id}", "status": "in.(claimed,expired)", "select": "challenge_id"}
    )
    completed_ids = {c['challenge_id'] for c in completed_resp.json()}
    
    available_resp = await supabase.get(
        "/challenges",
        params={"is_active": "eq.true", "select": "id,condition_type"}
    )
    all_available = [c for c in available_resp.json() if c['id'] not in completed_ids]

    # Фильтруем челленджи, если у пользователя не привязан Twitch
    final_available = [c for c in all_available if "twitch" not in c.get("condition_type", "")] if not user_has_twitch else all_available

    if not final_available:
        return JSONResponse(status_code=404, content={"message": "Для вас пока нет новых челленджей."})

    chosen_challenge_id = random.choice(final_available)['id']
    details_resp = await supabase.get("/challenges", params={"id": f"eq.{chosen_challenge_id}", "select": "*"})
    challenge_details = details_resp.json()[0]

    duration_in_hours = challenge_details['duration_days']
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=duration_in_hours)).isoformat()
    
    condition_type = challenge_details['condition_type']
    start_value = user_stats.get(CONDITION_TO_COLUMN.get(condition_type), 0)

    payload = {
        "user_id": telegram_id,
        "challenge_id": chosen_challenge_id,
        "status": "pending",
        "assigned_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at,
        "progress_value": 0,
        "start_value": start_value,
        "baseline_value": 0
    }
    
    logging.info(f"Отправка данных в Supabase для нового челленджа: {payload}")

    try:
        new_user_challenge_resp = await supabase.post(
            "/user_challenges",
            json=payload,
            headers={"Prefer": "return=representation"}
        )
        new_user_challenge_resp.raise_for_status()
        
        new_user_challenge = new_user_challenge_resp.json()[0]
        new_user_challenge['challenges'] = challenge_details

        return new_user_challenge

    except httpx.HTTPStatusError as e:
        logging.error(f"Ошибка при создании челленджа в Supabase: {e.response.text}")
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e.response.text}")
    except Exception as e:
        logging.error(f"Неизвестная ошибка: {e}")
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
    """(Админ) Помечает покупку Twitch как просмотренную."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    purchase_id = request_data.purchase_id
    
    await supabase.patch(
        "/twitch_reward_purchases",
        params={"id": f"eq.{purchase_id}"},
        json={"viewed_by_admin": True}
    )
    
    return {"status": "ok"}

@app.post("/api/v1/admin/categories")
async def get_categories(request_data: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """Получает список всех категорий квестов."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    resp = await supabase.get("/quest_categories", params={"select": "*", "order": "sort_order.asc"})
    resp.raise_for_status()
    return resp.json()

@app.post("/api/v1/admin/quests/reorder")
async def reorder_quests(
    request_data: QuestReorderRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Меняет местами два соседних квеста.
    Эта версия реализована полностью на Python для максимальной надежности.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    quest_id = request_data.quest_id
    category_id = request_data.category_id
    direction = request_data.direction

    try:
        # 1. Получаем все квесты в нужной категории (или без категории)
        query_params = {"select": "id,sort_order"}
        if category_id is None:
            query_params["category_id"] = "is.null"
        else:
            query_params["category_id"] = f"eq.{category_id}"
        
        quests_resp = await supabase.get("/quests", params=query_params)
        quests_resp.raise_for_status()
        quests = quests_resp.json()

        # 2. Нормализуем sort_order: если где-то его нет, проставляем всем по порядку
        if any(q.get('sort_order') is None for q in quests):
            quests.sort(key=lambda q: q.get('id')) # Сортируем по ID для стабильности
            for i, quest in enumerate(quests):
                quest['sort_order'] = i + 1
        
        # Сортируем по sort_order
        quests.sort(key=lambda q: q.get('sort_order'))

        # 3. Находим индекс текущего квеста
        current_index = -1
        for i, q in enumerate(quests):
            if q['id'] == quest_id:
                current_index = i
                break
        
        if current_index == -1:
            raise HTTPException(status_code=404, detail="Задание не найдено в этой категории.")

        # 4. Определяем, с каким квестом меняться
        if direction == "up":
            if current_index == 0: return {"message": "Задание уже на первом месте."}
            target_index = current_index - 1
        elif direction == "down":
            if current_index == len(quests) - 1: return {"message": "Задание уже на последнем месте."}
            target_index = current_index + 1
        else:
            raise HTTPException(status_code=400, detail="Неверное направление.")

        # 5. Меняем их sort_order местами
        current_sort_order = quests[current_index]['sort_order']
        target_sort_order = quests[target_index]['sort_order']
        
        # Обновляем в базе данных
        await supabase.patch("/quests", params={"id": f"eq.{quests[current_index]['id']}"}, json={"sort_order": target_sort_order})
        await supabase.patch("/quests", params={"id": f"eq.{quests[target_index]['id']}"}, json={"sort_order": current_sort_order})

        return {"message": "Порядок заданий успешно обновлен."}
    
    except Exception as e:
        logging.error(f"Ошибка при изменении порядка заданий: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера при сортировке.")
        
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
    
    # Запрашиваем все квесты из базы данных
    resp = await supabase.get("/quests", params={"select": "*", "order": "id.desc"})
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
async def get_event_winners_for_admin(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Возвращает список победителей и их трейд-ссылки для админа."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")
        
    content_resp = await supabase.get("/pages_content", params={"page_name": "eq.events", "select": "content", "limit": 1})
    content_resp.raise_for_status()
    content_data = content_resp.json()
    if not content_data:
        return []
    
    events = content_data[0].get("content", {}).get("events", [])
    winners_info = []
    
    # Собираем все ID победителей, чтобы сделать один запрос к базе
    winner_ids = [event['winner_id'] for event in events if 'winner_id' in event]
    if not winner_ids:
        return []

    users_resp = await supabase.get("users", params={"telegram_id": f"in.({','.join(map(str, winner_ids))})", "select": "telegram_id,trade_link"})
    users_data = {user['telegram_id']: user.get('trade_link', 'Не указана') for user in users_resp.json()}

    for event in events:
        if "winner_id" in event and "winner_name" in event:
            winners_info.append({
                "winner_name": event["winner_name"],
                "prize_title": event["title"],
                "prize_description": event.get("description", ""),
                "trade_link": users_data.get(event["winner_id"], "Не указана")
            })
            
    return winners_info

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
    Обрабатывает нажатие кнопки 'Подтвердить отправление' в админ-панели.
    Устанавливает флаг prize_sent_confirmed в true для конкретного ивента.
    """
    # 1. Проверяем, что запрос пришел от администратора
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    # 2. Получаем текущий JSON-контент страницы ивентов
    content_resp = await supabase.get("/pages_content", params={"page_name": "eq.events", "select": "content", "limit": 1})
    content_resp.raise_for_status()
    page_data = content_resp.json()
    if not page_data:
        raise HTTPException(status_code=404, detail="Контент для страницы ивентов не найден.")
    
    content = page_data[0]['content']
    
    # 3. Находим нужный ивент в списке и обновляем его
    event_found = False
    for event in content.get("events", []):
        # Ищем ивент по его уникальному ID
        if event.get("id") == request_data.event_id:
            event["prize_sent_confirmed"] = True
            event_found = True
            logging.info(f"Приз для ивента ID {request_data.event_id} помечен как отправленный.")
            break

    if not event_found:
         raise HTTPException(status_code=404, detail=f"Ивент с ID {request_data.event_id} не найден в списке.")

    # 4. Сохраняем обновленный JSON-контент обратно в базу данных
    await supabase.patch(
        "/pages_content",
        params={"page_name": "eq.events"},
        json={"content": content}
    )

    return {"message": "Отправка приза успешно подтверждена."}

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

@app.post("/api/v1/admin/settings")
async def get_admin_settings(
    request_data: InitDataRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """Получает текущие настройки админ-панели."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    resp = await supabase.get("/settings", params={"key": "eq.admin_controls", "select": "value"})
    resp.raise_for_status()
    data = resp.json()

    if not data or not data[0].get('value'):
        # Возвращаем настройки по умолчанию, если в базе ничего нет
        return AdminSettings().dict()
    
    return data[0]['value']

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
    return {"message": "Настройки успешно сохранены."}

@app.post("/api/v1/admin/users/grant-checkpoint-stars")
async def grant_checkpoint_stars_to_user(
    request_data: AdminGrantCheckpointStarsRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Вручную выдает звезды для Чекпоинта."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    user_id_to_grant = request_data.user_id_to_grant
    amount = request_data.amount

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Количество звезд должно быть положительным.")

    try:
        # Вызываем новую RPC функцию, которую мы создали
        await supabase.post(
            "/rpc/increment_checkpoint_stars",
            json={"p_user_id": user_id_to_grant, "p_amount": amount}
        )
        return {"message": f"{amount} звезд Чекпоинта успешно выдано пользователю {user_id_to_grant}."}
    except Exception as e:
        logging.error(f"Ошибка при выдаче звезд Чекпоинта: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось выдать звезды Чекпоинта.")


@app.post("/api/v1/admin/users/freeze-checkpoint-stars")
async def freeze_checkpoint_stars(
    request_data: AdminFreezeCheckpointStarsRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Замораживает звезды Чекпоинта пользователя на указанное количество дней."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    user_id_to_freeze = request_data.user_id_to_freeze
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

@app.post("/api/v1/admin/users/grant-stars")
async def grant_stars_to_user(
    request_data: AdminGrantStarsRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Вручную выдает указанное количество звезд (билетов) пользователю."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    user_id_to_grant = request_data.user_id_to_grant
    amount = request_data.amount

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Количество звезд должно быть положительным.")

    try:
        # Мы используем существующую RPC функцию для увеличения билетов (звезд)
        await supabase.post(
            "/rpc/increment_tickets",
            json={"p_user_id": user_id_to_grant, "p_amount": amount}
        )
        return {"message": f"{amount} звезд успешно выдано пользователю {user_id_to_grant}."}
    except Exception as e:
        logging.error(f"Ошибка при выдаче звезд пользователю {user_id_to_grant}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось выдать звезды.")


@app.post("/api/v1/admin/users/freeze-stars")
async def freeze_user_stars(
    request_data: AdminFreezeStarsRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Замораживает звезды пользователя на указанное количество дней."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    user_id_to_freeze = request_data.user_id_to_freeze
    days = request_data.days

    if days < 0:
        raise HTTPException(status_code=400, detail="Количество дней не может быть отрицательным.")

    try:
        # Это предполагает, что у вас есть колонка `stars_frozen_until` типа 'timestamptz' в таблице 'users'.
        # Если колонка не существует, вам нужно будет добавить ее в вашей панели Supabase.
        freeze_until_date = None
        if days > 0:
            freeze_until_date = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()

        await supabase.patch(
            "/users",
            params={"telegram_id": f"eq.{user_id_to_freeze}"},
            json={"stars_frozen_until": freeze_until_date}
        )
        
        message = f"Звезды пользователя {user_id_to_freeze} заморожены на {days} дней." if days > 0 else f"Заморозка звезд для пользователя {user_id_to_freeze} снята."
        return {"message": message}
    except Exception as e:
        logging.error(f"Ошибка при заморозке звезд для {user_id_to_freeze}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось выполнить заморозку.")

@app.get("/api/v1/content/menu")
async def get_menu_content(supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """Предоставляет динамический контент для главной страницы меню, например, URL баннера."""
    try:
        # Мы повторно используем настройки админа, так как это простое хранилище ключ-значение
        resp = await supabase.get("/settings", params={"key": "eq.admin_controls", "select": "value"})
        resp.raise_for_status()
        data = resp.json()

        # Значения по умолчанию
        defaults = {
            "menu_banner_url": "https://i.postimg.cc/d0r554hc/1200-600.png?v=2",
            "checkpoint_banner_url": "https://i.postimg.cc/6p39wgzJ/1200-324.png",
            "skin_race_enabled": True,
            "slider_order": ["skin_race", "cauldron"] # <-- НОВОЕ ПОЛЕ
        }

        if not data or not data[0].get('value'):
            # Возвращаем контент по умолчанию, если ничего не найдено
            return defaults
        
        settings = data[0]['value']
        return {
            "menu_banner_url": settings.get("menu_banner_url", defaults["menu_banner_url"]),
            "checkpoint_banner_url": settings.get("checkpoint_banner_url", defaults["checkpoint_banner_url"]),
            "skin_race_enabled": settings.get("skin_race_enabled", defaults["skin_race_enabled"]),
            "slider_order": settings.get("slider_order", defaults["slider_order"]) # <-- НОВОЕ ПОЛЕ
        }
    except Exception as e:
        logging.error(f"Ошибка при получении контента для меню: {e}")
        # Возвращаем контент по умолчанию при ошибке, чтобы не сломать клиент
        return defaults

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

@app.post("/api/v1/admin/pending_actions")
async def get_pending_actions(
    request_data: PendingActionRequest, 
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Собирает ТОЛЬКО заявки на ручные квесты (submissions).
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    try:
        submissions_resp = await supabase.post("/rpc/get_pending_submissions_with_details")
        submissions_resp.raise_for_status()
        submissions = submissions_resp.json()
        
        # Сортируем по дате создания, чтобы новые были сверху
        submissions.sort(key=lambda x: x.get('created_at', ''), reverse=True)

        return submissions

    except Exception as e:
        logging.error(f"Ошибка при получении pending_actions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить список действий.")

@app.post("/api/v1/admin/checkpoint_rewards")
async def get_checkpoint_rewards(
    request_data: PendingActionRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Получает ТОЛЬКО ручные награды из системы Чекпоинт.
    ФИНАЛЬНАЯ ВЕРСИЯ: Использует прямой запрос к таблицам для максимальной надежности.
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
            reward["user_full_name"] = user_details.get("full_name", "N/A")
            reward["user_trade_link"] = user_details.get("trade_link")
            final_rewards.append(reward)

        # Шаг 5: Сортируем и возвращаем
        final_rewards.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        return final_rewards

    except Exception as e:
        logging.error(f"Ошибка при получении наград из Чекпоинта: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось загрузить награды из Чекпоинта.")

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
    """(Админ) Выдает промокод за покупку на Twitch с проверкой условий."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    purchase_id = request_data.purchase_id

    try:
        # 1. Получаем детали покупки, включая ID пользователя и ID награды
        purchase_resp = await supabase.get(
            "/twitch_reward_purchases",
            params={"id": f"eq.{purchase_id}", "select": "user_id, reward_id"}
        )
        purchase_resp.raise_for_status()
        purchase_data = purchase_resp.json()
        if not purchase_data:
            raise HTTPException(status_code=404, detail="Покупка не найдена.")
        
        user_id = purchase_data[0].get("user_id")
        reward_id = purchase_data[0].get("reward_id")

        if not user_id:
            raise HTTPException(status_code=400, detail="Нельзя выдать награду непривязанному пользователю.")
        
        # 2. Получаем детали награды, включая ее условия
        reward_resp = await supabase.get(
            "/twitch_rewards",
            params={"id": f"eq.{reward_id}", "select": "title, condition_type, target_value"}
        )
        reward_resp.raise_for_status()
        reward_data = reward_resp.json()
        if not reward_data:
            raise HTTPException(status_code=404, detail="Награда не найдена.")

        condition_type = reward_data[0].get("condition_type")
        target_value = reward_data[0].get("target_value")

        # 3. ЕСЛИ есть условие, проверяем его выполнение через Wizebot
        if condition_type and target_value is not None and target_value > 0:
            # Достаём Twitch-логин пользователя из Supabase
            twitch_resp = await supabase.get(
                "/users",
                params={"telegram_id": f"eq.{user_id}", "select": "twitch_login"}
            )
            twitch_resp.raise_for_status()
            twitch_data = twitch_resp.json()
            if not twitch_data or not twitch_data[0].get("twitch_login"):
                raise HTTPException(status_code=400, detail="У пользователя нет привязанного Twitch аккаунта.")

            twitch_login = twitch_data[0]["twitch_login"]

            # Определяем период из condition_type (например, twitch_messages_week → week)
            period = condition_type.replace("twitch_messages_", "")

            try:
                # Делаем запрос напрямую в Wizebot API
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        f"https://wapi.wizebot.tv/api/ranking/{WIZEBOT_API_KEY}/top/message/{period}/100"
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    logging.info(f"WizeBot data: {data}")
            except Exception as e:
                logging.error(f"Ошибка обращения к Wizebot: {e}")
                raise HTTPException(status_code=500, detail="Не удалось проверить условие через Wizebot")

            # Ищем пользователя по логину в выдаче Wizebot
            current_progress = 0
            entries = data.get("list") or []
            if not entries:
                logging.warning("Список топ пользователей пуст. Возможно, стрим не активен или статистика ещё не собрана.")

            for entry in entries:
                user_name = entry.get("user_name")
                if user_name and user_name.lower() == twitch_login.lower():
                    current_progress = int(entry.get("value", 0))
                    break

            if current_progress < target_value:
                logging.warning(
                    f"Twitch награда не выдана: пользователь {twitch_login}, прогресс {current_progress}/{target_value}"
                )
                raise HTTPException(
                    status_code=400,
                    detail=f"Условие не выполнено! Прогресс пользователя: {current_progress} / {target_value}"
                )
                
        # 4. Если все проверки пройдены, вызываем RPC для выдачи промокода
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
    """(Админ) Удаляет одну конкретную покупку Twitch награды."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    purchase_id_to_delete = request_data.purchase_id

    await supabase.delete(
        "/twitch_reward_purchases",
        params={"id": f"eq.{purchase_id_to_delete}"}
    )
    
    return {"message": "Покупка успешно удалена."}

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
    request_data: RoulettePrizeCreateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """(Админ) Создает новый приз для рулетки."""
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    await supabase.post("/roulette_prizes", json={
        "reward_title": request_data.reward_title.strip(),
        "skin_name": request_data.skin_name.strip(),
        "image_url": request_data.image_url.strip(),
        "chance_weight": request_data.chance_weight
    })
    return {"message": "Приз успешно добавлен в рулетку."}

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
        "icon_url": "https://hatelavka-quest.vercel.app/default_icon.png",  # Замените на URL вашей иконки по умолчанию
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

def fill_missing_challenge_data(challenges: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Дополняет отсутствующие поля в данных челленджей значениями по умолчанию.

    Args:
        challenges: Список словарей с данными челленджей.

    Returns:
        Обновленный список словарей с заполненными данными.
    """
    default_values = {
        "description": "Описание отсутствует",
        "condition_type": "telegram_messages",
        "target_value": 0,
        "duration_days": 7,
        "reward_amount": 0
    }

    updated_challenges = []
    for challenge in challenges:
        updated_challenge = {**default_values, **challenge}
        updated_challenges.append(updated_challenge)
    
    return updated_challenges
