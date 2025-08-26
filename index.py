import os
import logging
import base64
import uuid
import json
import pathlib
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
from fastapi import FastAPI, Request, HTTPException, Query, Depends
from fastapi.responses import JSONResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi import BackgroundTasks
from dotenv import load_dotenv
from pydantic import BaseModel
from contextlib import asynccontextmanager

# --- Pydantic Models ---
class InitDataRequest(BaseModel):
    initData: str

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

class TradeLinkUpdateRequest(BaseModel):
    initData: str
    trade_link: str

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
ADMIN_IDS = [int(admin_id.strip()) for admin_id in ADMIN_TELEGRAM_IDS_STR.split(',') if admin_id.strip()]
ADMIN_NOTIFY_CHAT_ID = os.getenv("ADMIN_NOTIFY_CHAT_ID")
TWITCH_CLIENT_ID = os.getenv("TWITCH_CLIENT_ID")
TWITCH_CLIENT_SECRET = os.getenv("TWITCH_CLIENT_SECRET")
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
    await bot.session.close()

app = FastAPI(title="Quest Bot API")

# --- Middlewares ---
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logging.info(f"🔹 Path: {request.url.path}")
    logging.info(f"🔹 Method: {request.method}")
    response = await call_next(request)
    logging.info(f"🔹 Response status: {response.status_code}")
    return response

async def process_telegram_update(update: dict, supabase: httpx.AsyncClient):
    # Мы используем run_in_threadpool, чтобы безопасно выполнить наш асинхронный код
    # в фоновой задаче, которую предоставляет FastAPI
    await run_in_threadpool(dp.feed_update, bot=bot, update=Update(**update), supabase=supabase)

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

# --- Telegram Bot/Dispatcher ---
bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
router = Router()
dp = Dispatcher()
dp.include_router(router)

# --- Telegram handlers ---
@router.message(Command("start"))
async def cmd_start(message: types.Message, command: CommandObject, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
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
            await message.answer("✅ Авторизация завершена! Можете вернуться на сайт.", reply_markup=keyboard)
        except Exception as e:
            logging.error(f"Ошибка привязки токена {token}: {e}")
            await message.answer("⚠️ Произошла ошибка при авторизации.")
    else:
        keyboard = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="🚀 Открыть приложение", web_app=WebAppInfo(url=WEB_APP_URL))
        ]])
        await message.answer("👋 Привет! Открой наше веб-приложение:", reply_markup=keyboard)

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

    # 1. Проверяем, есть ли у пользователя активный квест
    user_resp = await supabase.get("users", params={"telegram_id": f"eq.{telegram_id}", "select": "active_quest_id"})
    user_resp.raise_for_status()
    user_data = user_resp.json()
    
    active_quest_id = user_data[0].get("active_quest_id") if user_data else None

    # ✅ НАЧАЛО ИСПРАВЛЕННОЙ ЛОГИКИ
    if active_quest_id:
        # Сначала просто ищем квест по ID, чтобы проверить, существует ли он и активен ли
        quest_check_resp = await supabase.get(
            "/quests",
            params={"id": f"eq.{active_quest_id}", "select": "is_active"}
        )
        quest_check_resp.raise_for_status()
        quest_check_data = quest_check_resp.json()

        # Если квест найден и он активен, то показываем его
        if quest_check_data and quest_check_data[0].get("is_active"):
            full_quest_resp = await supabase.get("/quests", params={"id": f"eq.{active_quest_id}", "select": "*"})
            active_quest = full_quest_resp.json()
            if active_quest:
                active_quest[0]['is_completed'] = False
            return active_quest
        else:
            # Если квест не найден или неактивен, "сбрасываем" его для пользователя
            logging.warning(f"User {telegram_id} had an invalid active_quest_id ({active_quest_id}). Clearing it.")
            await supabase.patch("/users", params={"telegram_id": f"eq.{telegram_id}"}, json={"active_quest_id": None})
            # После сброса, код продолжит выполняться и покажет список доступных квестов
    # ✅ КОНЕЦ ИСПРАВЛЕННОЙ ЛОГИКИ

    # 3. Если активного квеста нет (или он был только что сброшен), показываем все доступные для старта
    completed_resp = await supabase.get(
        "/user_quest_progress",
        params={
            "user_id": f"eq.{telegram_id}",
            "claimed_at": "not.is.null",  # Проверяем, что награда получена (поле не пустое)
            "select": "quest_id"
        }
    )
    completed_resp.raise_for_status()
    completed_quest_ids = {sub['quest_id'] for sub in completed_resp.json()}

    all_quests_resp = await supabase.get(
        "/quests",
        params={"is_active": "eq.true", "quest_type": "not.eq.manual_check", "select": "*", "order": "id.desc"}
    )
    all_quests_resp.raise_for_status()
    all_active_quests = all_quests_resp.json()

    available_quests = [
        quest for quest in all_active_quests
        # ИСПРАВЛЕНИЕ: Добавлена проверка на is_repeatable
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
class QuestSubmission(BaseModel): initData: str; submittedData: str
class QuestSubmissionRequest(BaseModel): initData: str; submittedData: str    
class QuestCreateRequest(BaseModel): 
    initData: str
    title: str
    description: Optional[str] = ""
    reward_amount: int
    quest_type: str
    target_value: Optional[int] = None
    icon_url: Optional[str] = None
    duration_days: Optional[int] = None
    action_url: Optional[str] = None
    category_id: Optional[int] = None # <-- ВОТ ЭТА СТРОКА БЫЛА ПРОПУЩЕНА
    is_repeatable: bool = False

class QuestUpdateRequest(BaseModel): 
    initData: str
    quest_id: int
    title: str
    description: Optional[str] = ""
    reward_amount: int
    quest_type: str
    target_value: Optional[int] = None
    icon_url: Optional[str] = None
    is_active: bool
    duration_days: Optional[int] = None
    action_url: Optional[str] = None
    category_id: Optional[int] = None
    is_repeatable: bool

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

# --- Main API Endpoints ---
@app.post("/api/v1/quests/{quest_id}/submit")
async def submit_for_quest(quest_id: int, request_data: QuestSubmissionRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """
    Принимает заявку от пользователя на квест с ручной проверкой.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации.")
    
    telegram_id = user_info["id"]

    # ✅ НАЧАЛО ИСПРАВЛЕННОГО БЛОКА
    # 1. Проверяем, существует ли такой квест и является ли он многоразовым
    quest_resp = await supabase.get("/quests", params={"id": f"eq.{quest_id}", "select": "title, is_repeatable"})
    if not quest_resp.json():
        raise HTTPException(status_code=404, detail="Задание не найдено.")
    
    quest_data = quest_resp.json()[0]
    quest_title = quest_data['title']
    is_quest_repeatable = quest_data['is_repeatable']

    # 2. Проверяем предыдущие заявки, ТОЛЬКО если квест НЕ многоразовый
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
    # ✅ КОНЕЦ ИСПРАВЛЕННОГО БЛОКА

    # 3. Создаем новую заявку
    await supabase.post("/quest_submissions", json={
        "quest_id": quest_id,
        "user_id": telegram_id,
        "status": "pending",
        "submitted_data": request_data.submittedData
    })

    # 4. (Опционально) Уведомляем админа о новой заявке
    if ADMIN_NOTIFY_CHAT_ID:
        try:
            user_name = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip()
            message_text = (
                f"🔔 Новая заявка на проверку!\n\n"
                f"<b>Задание:</b> «{quest_title}»\n"
                f"<b>Пользователь:</b> {user_name} (ID: {telegram_id})\n"
                f"<b>Данные:</b>\n<code>{request_data.submittedData}</code>"
            )
            await bot.send_message(ADMIN_NOTIFY_CHAT_ID, message_text, parse_mode=ParseMode.HTML)
        except Exception as e:
            logging.error(f"Не удалось отправить уведомление админу: {e}")

    return {"message": "Ваша заявка принята и отправлена на проверку!"}
    
# --- НОВЫЙ ЭНДПОИНТ ДЛЯ ЗАПУСКА КВЕСТА ---
@app.post("/api/v1/quests/start")
async def start_quest(request_data: QuestStartRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    # 🟢 INFO: Запрос принят
    logging.info("Принят запрос на старт квеста.")

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
    logging.info(f"Пользователь: {telegram_id}, ID квеста: {quest_id}")

    try:
        # 🟢 INFO: Отправка запроса в Supabase
        logging.info(f"Отправка запроса в Supabase RPC start_quest_atomic с параметрами: p_user_id={telegram_id}, p_quest_id={quest_id}")

        await supabase.post(
            "/rpc/start_quest_atomic",
            json={"p_user_id": telegram_id, "p_quest_id": quest_id}
        )

        # 🟢 INFO: Запрос в Supabase успешен
        logging.info("Квест успешно активирован в Supabase.")
        return {"message": "Квест успешно активирован."}
    except Exception as e:
        # ❌ ERROR: Ошибка при активации
        logging.error(f"Ошибка при активации квеста {quest_id} для пользователя {telegram_id}: {e}")
        raise HTTPException(status_code=500, detail="Не удалось активировать квест.")
        
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
    is_admin = telegram_id in ADMIN_IDS

    try:
        # 1. Получаем основной профиль пользователя НАПРЯМУЮ из таблицы users
        user_resp = await supabase.get(
            "/users",
            params={"telegram_id": f"eq.{telegram_id}", "select": "*", "limit": 1}
        )
        user_resp.raise_for_status()
        user_data = user_resp.json()

        # 2. Если пользователя нет, создаём его и запрашиваем снова
        if not user_data:
            full_name_tg = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip() or "Без имени"
            await supabase.post(
                "/users",
                json={"telegram_id": telegram_id, "username": user_info.get("username"), "full_name": full_name_tg},
                headers={"Prefer": "resolution=merge-duplicates"}
            )
            user_resp = await supabase.get("/users", params={"telegram_id": f"eq.{telegram_id}", "select": "*", "limit": 1})
            user_data = user_resp.json()

        if not user_data:
            return JSONResponse(content={"is_guest": True, "is_admin": is_admin})

        profile_data = user_data[0]
        
        # 3. Получаем прогресс квеста
        active_quest_id = profile_data.get("active_quest_id")
        active_progress = 0
        if active_quest_id:
            progress_resp = await supabase.get(
                "/user_quest_progress",
                params={"user_id": f"eq.{telegram_id}", "quest_id": f"eq.{active_quest_id}", "select": "current_progress"}
            )
            progress_data = progress_resp.json()
            if progress_data:
                active_progress = progress_data[0].get("current_progress", 0)

        # 4. Получаем ставки
        entries_resp = await supabase.get(
            "/event_entries",
            params={"user_id": f"eq.{telegram_id}", "select": "event_id, tickets_spent"}
        )
        entries_data = entries_resp.json()
        event_participations = {}
        for entry in entries_data:
            event_id = entry.get("event_id")
            tickets_spent = entry.get("tickets_spent", 0)
            if event_id is not None:
                event_participations[event_id] = event_participations.get(event_id, 0) + tickets_spent

        # 5. Собираем финальный ответ, используя данные из profile_data
        final_response_data = {
            "is_guest": False,
            "full_name": profile_data.get("full_name"),
            "twitch_id": profile_data.get("twitch_id"),
            "twitch_login": profile_data.get("twitch_login"),
            "is_admin": is_admin,
            "active_quest_id": active_quest_id,
            "active_quest_progress": active_progress,
            "tickets": profile_data.get("tickets", 0),
            "trade_link": profile_data.get("trade_link"), # <-- Теперь это будет работать
            "event_participations": event_participations,
            "twitch_stats": {
                "messages": profile_data.get("total_message_count", 0),
                "daily_messages": profile_data.get("daily_message_count", 0),
                "weekly_messages": profile_data.get("weekly_message_count", 0),
                "monthly_messages": profile_data.get("monthly_message_count", 0),
                "uptime": profile_data.get("total_uptime_minutes", 0),
                "daily_uptime": profile_data.get("daily_uptime_minutes", 0),
                "weekly_uptime": profile_data.get("weekly_uptime_minutes", 0),
                "monthly_uptime": profile_data.get("monthly_uptime_minutes", 0),
            }
        }
        return JSONResponse(content=final_response_data)

    except Exception as e:
        logging.error(f"Критическая ошибка в /api/v1/user/me: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось получить данные профиля.")

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

@app.post("/api/v1/admin/quest/update")
async def update_quest(request_data: QuestUpdateRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS: 
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    quest_id = request_data.quest_id
    quest_data_to_update = request_data.dict(exclude={'initData', 'quest_id'})
    
    duration = quest_data_to_update.pop('duration_days', None)
    
    if duration is not None:
        if duration > 0:
            quest_data_to_update['end_date'] = (datetime.now(timezone.utc) + timedelta(days=duration)).isoformat()
            quest_data_to_update['start_date'] = datetime.now(timezone.utc).isoformat()
        else: 
            quest_data_to_update['end_date'] = None
            
    await supabase.patch("/quests", params={"id": f"eq.{quest_id}"}, json=quest_data_to_update)
    
    return {"message": f"Квест '{request_data.title}' успешно обновлен!"}

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
        "is_repeatable": request_data.is_repeatable
    }
    
    # ✅✅✅ ВОТ ЭТО И ЕСТЬ ЗАМЕНА / ДОПОЛНЕНИЕ ✅✅✅
    # Это правило гарантирует, что автоматические квесты (Twitch/Telegram)
    # никогда не будут сохранены с категорией, даже если она была выбрана по ошибке.
    if quest_to_create.get('quest_type') != 'manual_check':
        quest_to_create['category_id'] = None

    duration = request_data.duration_days
    if duration and duration > 0:
        quest_to_create['end_date'] = (datetime.now(timezone.utc) + timedelta(days=duration)).isoformat()
    else:
        quest_to_create['end_date'] = None
    
    await supabase.post("/quests", json=quest_to_create)
    return {"message": f"Квест '{request_data.title}' успешно создан!"}

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
    if quest.get('end_date') and quest.get('start_date'):
        try:
            end = datetime.fromisoformat(quest['end_date'].replace('Z', '+00:00')); start = datetime.fromisoformat(quest['start_date'].replace('Z', '+00:00'))
            quest['duration_days'] = (end - start).days
        except (ValueError, TypeError): quest['duration_days'] = 0
    else: quest['duration_days'] = 0
    return quest

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
    """
    Проверяет все активные ивенты. Если время розыгрыша истекло и победитель
    еще не определен, запускает розыгрыш для этого ивента.
    Защищено секретным ключом в заголовке Authorization.
    """
    cron_secret = os.getenv("CRON_SECRET")
    auth_header = request.headers.get("Authorization")
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

        # --- НАЧАЛО ИСПРАВЛЕННОЙ ЛОГИКИ ВРЕМЕНИ ---
        
        # 1. Получаем текущее время в UTC (как работает сервер)
        now_utc = datetime.now(timezone.utc)
        
        # 2. Парсим время из базы и говорим коду, что это МОСКОВСКОЕ время (UTC+3)
        naive_end_time = datetime.fromisoformat(raffle_end_time_str)
        end_time_moscow = naive_end_time.replace(tzinfo=ZoneInfo("Europe/Moscow"))
        
        # 3. Теперь сравнение будет корректным
        if now_utc < end_time_moscow:
            logging.info(f"CRON: Время розыгрыша ({end_time_moscow}) еще не наступило. Текущее время UTC: {now_utc}.")
            return {"message": "Raffle time has not yet come."}
            
        # --- КОНЕЦ ИСПРАВЛЕННОЙ ЛОГИКИ ВРЕМЕНИ ---

        logging.info("CRON: Время розыгрыша наступило. Поиск ивентов без победителя...")
        
        events_to_draw = [e for e in content.get("events", []) if "winner_name" not in e]
        
        if not events_to_draw:
            logging.info("CRON: Нет ивентов для розыгрыша (у всех уже есть победители).")
            return {"message": "No events to draw."}
        
        updated = False
        for event in events_to_draw:
            event_id = event["id"]
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

        # Ищем user_challenge, который выполнен, но еще не востребован
        response = await supabase.get(
            "/user_challenges",
            params={
                "user_id": f"eq.{current_user_id}",
                "challenge_id": f"eq.{challenge_id}",
                "status": "eq.completed",
                "claimed_at": "is.null",
                "select": "*",
                "limit": 1
            }
        )
        response.raise_for_status()
        user_challenges_data = response.json()

        if not user_challenges_data:
            raise HTTPException(status_code=404, detail="Нет выполненных челленджей для получения награды.")

        user_challenge = user_challenges_data[0]
        user_challenge_id = user_challenge["id"]

        logging.info(f"🔹 Найден user_challenge с ID: {user_challenge_id}. Статус: {user_challenge['status']}, claimed_at: {user_challenge['claimed_at']}")

        # Эта проверка дублируется с SQL, но для надежности можно оставить
        if user_challenge["claimed_at"] is not None:
            raise HTTPException(status_code=400, detail="Награда уже была получена.")

        if user_challenge["status"] != "completed":
            raise HTTPException(status_code=400, detail="Челлендж еще не выполнен.")

        rpc_payload = {
            "p_user_id": current_user_id,
            "p_source_type": "challenge",
            "p_source_id": user_challenge_id
        }

        logging.info(f"🔹 Вызов RPC с параметрами: {rpc_payload}")

        rpc_response = await supabase.post("/rpc/award_reward_and_get_promocode", json=rpc_payload)
        
        logging.info(f"🔹 RPC статус: {rpc_response.status_code}")
        logging.info(f"🔹 RPC тело: {rpc_response.text}")
        
        if rpc_response.status_code != 200:
            try:
                error_detail = rpc_response.json().get("message", "Не удалось выдать промокод.")
            except:
                error_detail = "Не удалось выдать промокод. Проверьте логи Supabase."
            raise HTTPException(status_code=400, detail=error_detail)

        promocode = rpc_response.json()

        return {
            "success": True,
            "show_reward_modal": True,
            "message": "Награда получена!",
            "promocode": promocode
        }

    except httpx.HTTPStatusError as e:
        logging.error(f"❌ Ошибка HTTP при взаимодействии с Supabase: {e.response.text}", exc_info=True)
        raise HTTPException(status_code=e.response.status_code, detail="Ошибка при взаимодействии с базой данных.")
    except Exception as e:
        logging.error(f"❌ Неизвестная ошибка при выдаче награды: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Внутренняя ошибка сервера: {str(e)}")
        
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

# Эта функция уже есть в вашем файле, нужно лишь добавить вызов recalculate_twitch_progress
@app.post("/api/v1/cron/sync_wizebot")
async def sync_wizebot_stats(request: Request, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    # --- НАЧАЛО ПРОВЕРКИ СЕКРЕТА (универсальная версия) ---
    # Получаем наш секрет из переменных окружения
    cron_secret = os.getenv("CRON_SECRET")

    # Получаем заголовок Authorization, который пришлет cron-job.org
    auth_header = request.headers.get("Authorization")
    expected_header = f"Bearer {cron_secret}"

    # Проверяем, что секрет на месте и он правильный
    if not cron_secret or auth_header != expected_header:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid secret")
    # --- КОНЕЦ ПРОВЕРКИ СЕКРЕТА ---
    
    logging.info("🚀 Запуск синхронизации статистики Wizebot...")
    
    # 1. Получаем всех пользователей с привязанным Twitch
    users_resp = await supabase.get("/users", params={"twitch_login": "not.is.null", "select": "twitch_login"})
    if not users_resp.is_success:
        raise HTTPException(status_code=500, detail="Не удалось получить пользователей из Supabase")
    
    users_to_sync = users_resp.json()
    
    if not users_to_sync:
        logging.info("Нет пользователей с привязанным Twitch для синхронизации.")
        return {"message": "No users to sync."}

    synced_count = 0
    # 2. Проходим по каждому пользователю
    for user in users_to_sync:
        twitch_login = user.get("twitch_login")
        if not twitch_login:
            continue

        try:
            # 3. Делаем запрос к Wizebot для получения данных пользователя
            wizebot_url = f"https://wapi.wizebot.tv/api/user/{WIZEBOT_API_KEY}/{twitch_login}/info"
            async with httpx.AsyncClient() as client:
                wizebot_resp = await client.get(wizebot_url, timeout=10.0)
            
            if wizebot_resp.status_code == 200:
                wizebot_data = wizebot_resp.json()
                if "data" in wizebot_data and wizebot_data["data"]:
                    user_data = wizebot_data["data"][0]
                    message_count = int(user_data.get("nb_messages", 0))
                    
                    # 4. Вызываем нашу НОВУЮ "умную" RPC функцию в Supabase
                    await supabase.post(
                        "/rpc/sync_twitch_stats", 
                        json={
                            "p_metric_type": metric_type_db,
                            "p_period": "session",  # <-- Добавьте эту строку
                            "p_stats": stats_payload
                        }
                    )
                    logging.info(f"✅ Успешно синхронизирован {twitch_login}: {message_count} сообщений.")
                    synced_count += 1
                else:
                    logging.warning(f"⚠️ Wizebot не вернул данные для пользователя {twitch_login}")
            else:
                 logging.error(f"❌ Ошибка от Wizebot для {twitch_login}: {wizebot_resp.status_code}")

        except Exception as e:
            logging.error(f"❌ Критическая ошибка при синхронизации {twitch_login}: {e}")

    logging.info(f"🎉 Синхронизация завершена. Обновлено пользователей: {synced_count}/{len(users_to_sync)}")
    return {"message": f"Sync completed. Updated {synced_count} users."}
    
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
        await bot.send_message(user_id, text=notification_text, reply_markup=keyboard, parse_mode=ParseMode.HTML)
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

    pending_resp = await supabase.get("/user_challenges", params={"user_id": f"eq.{telegram_id}", "status": "eq.pending", "select": "id"})
    if pending_resp.json(): raise HTTPException(status_code=409, detail="У вас уже есть активный челлендж.")

    # 🔥 ИСПРАВЛЕНИЕ 1: Проверяем, привязан ли Twitch у пользователя
    user_resp = await supabase.get("/users", params={"telegram_id": f"eq.{telegram_id}", "select": "twitch_id"})
    user_has_twitch = user_resp.json() and user_resp.json()[0].get("twitch_id") is not None

    completed_resp = await supabase.get("/user_challenges", params={"user_id": f"eq.{telegram_id}", "status": "in.(claimed,expired)", "select": "challenge_id"})
    completed_ids = {c['challenge_id'] for c in completed_resp.json()}
    
    # 🔥 ИСПРАВЛЕНИЕ 2: Запрашиваем тип квеста (condition_type), чтобы его отфильтровать
    available_resp = await supabase.get("/challenges", params={"is_active": "eq.true", "select": "id,description,reward_amount,condition_type"})
    all_available = [c for c in available_resp.json() if c['id'] not in completed_ids]

    # 🔥 ИСПРАВЛЕНИЕ 3: Фильтруем квесты, если нет Twitch
    if not user_has_twitch:
        final_available = [c for c in all_available if c.get("condition_type") != 'twitch_points']
    else:
        final_available = all_available

    return final_available
    
@app.post("/api/v1/user/challenge")
async def get_or_assign_user_challenge(request_data: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Доступ запрещен")
    telegram_id = user_info["id"]

    # 1. Проверяем, есть ли уже активный челлендж
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
                await supabase.patch(
                    "/user_challenges",
                    params={"id": f"eq.{current_challenge['id']}"},
                    json={"status": "expired"}
                )
            else:
                return current_challenge

    # 2. Получаем все данные пользователя и доступные челленджи
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

    if not user_has_twitch:
        final_available = [c for c in all_available if c.get("condition_type") != 'twitch_points']
    else:
        final_available = all_available

    if not final_available:
        return JSONResponse(status_code=404, content={"message": "Для вас пока нет новых челленджей."})

    # 3. Выбираем случайный челлендж и получаем детали
    chosen_challenge_id = random.choice(final_available)['id']
    details_resp = await supabase.get("/challenges", params={"id": f"eq.{chosen_challenge_id}", "select": "*"})
    challenge_details = details_resp.json()[0]

    duration = challenge_details['duration_days']
    expires_at = (datetime.now(timezone.utc) + timedelta(days=duration)).isoformat()
    
    # 🔥 НОВОЕ: Рассчитываем start_value прямо в FastAPI
    condition_type = challenge_details['condition_type']
    start_value = user_stats.get(CONDITION_TO_COLUMN.get(condition_type), 0)

    # 4. Создаем новый челлендж
    payload = {
        "user_id": telegram_id,
        "challenge_id": chosen_challenge_id,
        "status": "pending",
        "assigned_at": datetime.now(timezone.utc).isoformat(), # Добавлено: дата назначения
        "expires_at": expires_at,
        "progress_value": 0,
        "start_value": start_value,
        "baseline_value": 0
    }
    
    # 🔥 НОВОЕ: Добавляем логирование перед отправкой
    logging.info(f"Отправка данных в Supabase для нового челленджа: {payload}")

    try:
        new_user_challenge_resp = await supabase.post(
            "/user_challenges",
            json=payload,
            headers={"Prefer": "return=representation"}
        )
        # 🔥 НОВОЕ: Проверяем статус-код ответа
        new_user_challenge_resp.raise_for_status()
        
        new_user_challenge = new_user_challenge_resp.json()[0]
        new_user_challenge['challenges'] = challenge_details

        return new_user_challenge

    except httpx.HTTPStatusError as e:
        # Теперь вы получите детальную ошибку
        logging.error(f"Ошибка при создании челленджа в Supabase: {e.response.text}")
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e.response.text}")
    except Exception as e:
        logging.error(f"Неизвестная ошибка: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")

    # 2. Получаем все данные пользователя и доступные челленджи
    user_resp = await supabase.post("/rpc/get_user_profile_and_stats", json={"p_telegram_id": telegram_id})
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

    if not user_has_twitch:
        final_available = [c for c in all_available if c.get("condition_type") != 'twitch_points']
    else:
        final_available = all_available

    if not final_available:
        return JSONResponse(status_code=404, content={"message": "Для вас пока нет новых челленджей."})

    # 3. Выбираем случайный челлендж и получаем детали
    chosen_challenge_id = random.choice(final_available)['id']
    details_resp = await supabase.get("/challenges", params={"id": f"eq.{chosen_challenge_id}", "select": "*"})
    challenge_details = details_resp.json()[0]

    duration = challenge_details['duration_days']
    expires_at = (datetime.now(timezone.utc) + timedelta(days=duration)).isoformat()
    
    # 🔥 НОВОЕ: Рассчитываем start_value прямо в FastAPI
    condition_type = challenge_details['condition_type']
    start_value = user_stats.get(CONDITION_TO_COLUMN.get(condition_type), 0)

    # 4. Создаем новый челлендж
    new_user_challenge_resp = await supabase.post(
        "/user_challenges",
        json={
            "user_id": telegram_id,
            "challenge_id": chosen_challenge_id,
            "status": "pending",
            "expires_at": expires_at,
            "start_value": start_value,  # Теперь это правильное значение
            "progress_value": 0,         # Сбрасываем прогресс
            "baseline_value": 0          # Оставляем, как было
        },
        headers={"Prefer": "return=representation"}
    )
    new_user_challenge_resp.raise_for_status() # Добавлена проверка на ошибку!
    new_user_challenge = new_user_challenge_resp.json()[0]
    new_user_challenge['challenges'] = challenge_details

    return new_user_challenge
    
@app.post("/api/v1/user/challenge/status")
async def get_user_challenge_status(request_data: InitDataRequest, supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """
    Проверяет статус челленджа. Сначала ищет активный, если нет - ищет выполненный, но не полученный.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or "id" not in user_info:
        raise HTTPException(status_code=401, detail="Доступ запрещен")
    telegram_id = user_info["id"]

    # 1. Сначала ищем активный (pending) челлендж
    pending_resp = await supabase.get(
        "/user_challenges",
        params={
            "user_id": f"eq.{telegram_id}",
            "status": "eq.pending",
            "select": "*,challenges(*)"
        }
    )
    pending_challenges = pending_resp.json()
    if pending_challenges:
        # Проверяем, не истёк ли срок
        current_challenge = pending_challenges[0]
        expires_at_str = current_challenge.get("expires_at")
        if expires_at_str and datetime.fromisoformat(expires_at_str.replace('Z', '+00:00')) < datetime.now(timezone.utc):
            await supabase.patch("/user_challenges", params={"id": f"eq.{current_challenge['id']}"}, json={"status": "expired"})
        else:
            return current_challenge

    # 2. Если активных нет, ищем выполненный, за который ещё не забрали награду
    completed_resp = await supabase.get(
        "/user_challenges",
        params={
            "user_id": f"eq.{telegram_id}",
            "status": "eq.completed",
            "claimed_at": "is.null", # Ключевое условие: награда не получена
            "select": "*,challenges(*)",
            "limit": 1
        }
    )
    completed_challenges = completed_resp.json()
    if completed_challenges:
        return completed_challenges[0]
    
    # 3. Если ничего не найдено, возвращаем пустой ответ
    return Response(status_code=204)
    
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
        
# --- Админские эндпоинты ---
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
# --- Pydantic модели для контента страницы ивентов ---
class EventItem(BaseModel):
    id: int
    title: str
    image_url: str
    tickets_cost: int

class EventsPageContent(BaseModel):
    mainTitle: str
    raffleEndTime: Optional[str] = None # <-- ВОТ ИСПРАВЛЕНИЕ
    infoBlock1Title: str
    infoBlock1Desc: str
    infoBlock2Title: str
    infoBlock2Desc: str
    infoBlock3Title: str
    infoBlock3Desc: str
    events: List[EventItem]

class EventsPageUpdateRequest(BaseModel):
    initData: str
    content: EventsPageContent

# --- API для страницы ивентов ---

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
async def get_events_page_content(supabase: httpx.AsyncClient = Depends(get_supabase_client)):
    """
    Отдает JSON с контентом для страницы ивентов, запрещая кэширование.
    """
    try:
        resp = await supabase.get(
            "/pages_content",
            params={"page_name": "eq.events", "select": "content", "limit": 1}
        )
        resp.raise_for_status()
        data = resp.json()
        if not data:
            raise HTTPException(status_code=404, detail="Контент для страницы ивентов не найден.")
        
        # ИЗМЕНЕНИЕ: Добавляем заголовки для отключения кэша
        headers = {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
        return JSONResponse(content=data[0]['content'], headers=headers)

    except Exception as e:
        logging.error(f"Ошибка при получении контента страницы ивентов: {e}")
        raise HTTPException(status_code=500, detail="Не удалось загрузить контент страницы.")

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

    # 1. Получаем минимальную ставку для ивента
    event_resp = await supabase.get(
        "/pages_content",
        params={"page_name": "eq.events", "select": "content"}
    )
    event_data = event_resp.json()[0]['content']['events']
    event_min_tickets = next((e['tickets_cost'] for e in event_data if e['id'] == request_data.event_id), 1)

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

@app.post("/api/v1/admin/events/update")
async def update_events_page_content(
    request_data: EventsPageUpdateRequest,
    supabase: httpx.AsyncClient = Depends(get_supabase_client)
):
    """
    Обновляет контент страницы ивентов (только для админов).
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        # ИЗМЕНЕНИЕ: Используем PATCH для обновления конкретной записи
        await supabase.patch(
            "/pages_content",
            params={"page_name": "eq.events"}, # Находим нужную строку
            json={"content": request_data.content.dict()} # И обновляем только поле content
        )
        return {"message": "Контент страницы успешно обновлен."}
    except Exception as e:
        logging.error(f"Ошибка при обновлении контента страницы ивентов: {e}")
        raise HTTPException(status_code=500, detail="Не удалось сохранить контент страницы.")
        
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
    Удаляет всех участников (записи) для конкретного ивента.
    """
    user_info = is_valid_init_data(request_data.initData, ALL_VALID_TOKENS)
    if not user_info or user_info.get("id") not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")

    try:
        await supabase.delete(
            "/event_entries",
            params={"event_id": f"eq.{request_data.event_id}"}
        )
        return {"message": f"Все участники для ивента {request_data.event_id} были удалены."}
    except Exception as e:
        logging.error(f"Ошибка при удалении участников ивента: {e}")
        raise HTTPException(status_code=500, detail="Не удалось очистить список участников.")
        
# --- HTML routes ---
@app.get('/favicon.ico', include_in_schema=False)
async def favicon(): return Response(status_code=204)
@app.get("/menu")
async def menu_page(request: Request): return FileResponse(f"{TEMPLATES_DIR}/menu.html")
@app.get("/leaderboard")
async def leaderboard_page(request: Request): return FileResponse(f"{TEMPLATES_DIR}/leaderboard.html")
@app.get("/profile")
async def profile_page(request: Request): return FileResponse(f"{TEMPLATES_DIR}/profile.html")
@app.get("/admin")
async def admin_page(request: Request): return FileResponse(f"{TEMPLATES_DIR}/admin.html")
@app.get("/events")
async def events_page(request: Request): return FileResponse(f"{TEMPLATES_DIR}/events.html")
@app.get("/")
async def read_root(): return FileResponse(f"{TEMPLATES_DIR}/index.html")

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
        "icon_url": "https://hatelavka-quest-lilac.vercel.app/default_icon.png",  # Замените на URL вашей иконки по умолчанию
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
