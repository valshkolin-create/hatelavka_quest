// ================================================================
// 1. ИНИЦИАЛИЗАЦИЯ (Флаги уже установлены в HTML) 
// ================================================================
console.log("📡 [DETECTOR] Текущий режим:", window.isVk ? "ВКонтакте" : "Telegram/Web");

// 🔥 ЖЕЛЕЗОБЕТОННЫЙ ПЭЙЛОАД 🔥
function getAuthPayload() {
    if (window.isVk) {
        return { initData: window.vkParams || '', platform: 'vk' };
    }
    return { initData: window.Telegram?.WebApp?.initData || '', platform: 'tg' };
}

async function fetchVkParamsFromBridge() {
    return new Promise((resolve) => {
        if (typeof vkBridge !== 'undefined') {
            vkBridge.send("VKWebAppGetConfig").then(() => resolve()).catch(() => resolve());
        } else resolve();
    });
}

// Глобальные переменные
const dom = {
    loaderOverlay: document.getElementById('loader-overlay'),
    loadingText: document.getElementById('loading-text'),
    loadingBarFill: document.getElementById('loading-bar-fill'),
    mainContent: document.getElementById('main-content'),
    fullName: document.getElementById('fullName'),
    navAdmin: document.getElementById('nav-admin'),
    viewDashboard: document.getElementById('view-dashboard'),
    viewShop: document.getElementById('view-shop'),
    giftContainer: document.getElementById('gift-container'),
    giftIconBtn: document.getElementById('gift-icon-btn'),
    giftModalOverlay: document.getElementById('gift-modal-overlay'),
    giftOpenBtn: document.getElementById('gift-open-btn'),
    giftCloseBtn: document.getElementById('gift-close-btn'),
    giftContentInitial: document.getElementById('gift-content-initial'),
    giftContentResult: document.getElementById('gift-content-result'),
    giftResultTitle: document.getElementById('gift-result-title'),
    giftResultText: document.getElementById('gift-result-text'),
    giftResultIcon: document.getElementById('gift-result-icon'),
    giftPromoBlock: document.getElementById('gift-promo-block'),
    giftPromoCode: document.getElementById('gift-promo-code'),
    tutorialOverlay: document.getElementById('tutorial-overlay'),
    tutorialModal: document.getElementById('tutorial-modal'),
    tutorialTitle: document.getElementById('tutorial-title'),
    tutorialText: document.getElementById('tutorial-text'),
    tutorialStepCounter: document.getElementById('tutorial-step-counter'),
    tutorialNextBtn: document.getElementById('tutorial-next-btn'),
    tutorialSkipBtn: document.getElementById('tutorial-skip-btn'),
    weeklyGoalsContainer: document.getElementById('weekly-goals-container-placeholder'),
    weeklyGoalsTrigger: document.getElementById('weekly-goals-trigger'),
    weeklyGoalsBadge: document.getElementById('weekly-goals-badge'),    
    weeklyModalOverlay: document.getElementById('weekly-modal-overlay'),
    weeklyModalCloseBtn: document.getElementById('weekly-modal-close-btn'),
    weeklyGoalsListContainer: document.getElementById('weekly-goals-list-container'),
    weeklyModalCounter: document.getElementById('weekly-modal-counter')
};

let userData = {};
let allQuests = [];
let heartbeatInterval = null;
let bonusGiftEnabled = false;
let cachedP2PCases = [];
let itemsCache = {};
let isShopLoaded = false;
let currentSlideIndex = 0;
let slideInterval;
let sliderAbortController = null; 
let lastSliderSignature = '';

// Массив имен кейсов, которые сейчас бесплатны для юзера
window.activeFreeCases = [];
window.currentCategoryId = 2716312; // <--- ТЫКАЙ СЮДА (добавь эту строку)

async function syncMyPromos() {
    try {
        const auth = getAuthPayload(); 
        const response = await makeApiRequest('/api/cs/my_active_promos', {}, 'GET', true);
        
        if (response && response.active_cases) {
            window.activeFreeCases = response.active_cases;
            console.log("Синхронизация купонов: ", window.activeFreeCases);
            if (typeof currentCategoryId !== 'undefined') renderItems(itemsCache[currentCategoryId]); 
        }
    } catch (e) {
        console.error("Ошибка синхронизации промокодов:", e);
    }
}

// ================================================================
// ИСТОРИЯ УВЕДОМЛЕНИЙ (ЧЕРЕЗ ЛОГОТИП)
// ================================================================

// Быстрая смена визуала колокольчика без сетевых запросов
function updateNotificationBadgeUI(count) {
    const badge = document.getElementById('logo-notification-badge');
    const bellIcon = document.querySelector('.bell-wrapper i.fa-bell');
    
    if (!badge) return;
    
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
        if (bellIcon) {
            bellIcon.style.color = '#ffd700';
            bellIcon.style.textShadow = '0 0 8px rgba(255, 215, 0, 0.4)';
        }
    } else {
        badge.classList.add('hidden');
        if (bellIcon) {
            bellIcon.style.color = '';
            bellIcon.style.textShadow = 'none';
        }
    }
}

// 1. Фоновая проверка (Зажигает цифру на бейдже и красит сам колокольчик)
async function fetchNotificationsBadge() {
    const badge = document.getElementById('logo-notification-badge');
    if (!badge) return;

    // Ищем иконку колокольчика железобетонно по твоей верстке
    const bellIcon = document.querySelector('.bell-wrapper i.fa-bell');

    try {
        const res = await makeApiRequest('/api/v1/notifications', {}, 'GET', true);
        if (res && res.unread_count > 0) {
            // Вписываем количество в бейдж
            badge.textContent = res.unread_count > 99 ? '99+' : res.unread_count;
            badge.classList.remove('hidden');
            
            // Зажигаем саму иконку колокольчика (делаем золотой + свечение)
            if (bellIcon) {
                bellIcon.style.color = '#ffd700';
                bellIcon.style.textShadow = '0 0 8px rgba(255, 215, 0, 0.4)';
            }
        } else {
            badge.classList.add('hidden');
            
            // Гасим иконку (возвращаем дефолтный цвет)
            if (bellIcon) {
                bellIcon.style.color = '';
                bellIcon.style.textShadow = 'none';
            }
        }
    } catch (e) {
        console.warn("Не удалось загрузить бейдж", e);
    }
}

// 2. Функция удаления уведомления (Заложена на будущее)
window.deleteNotification = async function(event, notifId) {
    event.stopPropagation(); 
    
    // Находим карточку
    const notifCard = event.target.closest('.notif-item');
    if (!notifCard) return;

    // Плавно скрываем (Оптимистичный UI)
    notifCard.style.opacity = '0';
    notifCard.style.transform = 'scale(0.95)';
    
    setTimeout(() => {
        notifCard.style.display = 'none';
    }, 300);

    try {
        // Эндпоинт, который мы сделали на бэке
        await makeApiRequest('/api/v1/notifications/delete', { id: notifId }, 'POST', true);
        updateNotificationBadgeUI(hbData.unread_notifications || 0);
    } catch (e) {
        // Если ошибка — возвращаем карточку обратно
        notifCard.style.display = 'flex';
        setTimeout(() => {
            notifCard.style.opacity = '1';
            notifCard.style.transform = 'scale(1)';
        }, 50);
    }
};

// 3. Открытие истории (При клике на колокольчик)
window.openNotificationsHistory = async function() {
    const badge = document.getElementById('logo-notification-badge');
    if (badge) badge.classList.add('hidden'); 
    
    // Гасим колокольчик при открытии, железобетонно по твоей верстке
    const bellIcon = document.querySelector('.bell-wrapper i.fa-bell');
    if (bellIcon) {
        bellIcon.style.color = '';
        bellIcon.style.textShadow = 'none';
    }

    showShopModal({
        title: "🔔 Уведомления",
        subtitle: '<div style="text-align:center; padding:30px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px; color:#ffd700;"></i><br><br>Загрузка истории...</div>',
        confirmText: "Закрыть",
        confirmClass: "btn-cancel-modal",
        showCancel: false,
        onConfirm: (close) => close()
    });

    try {
        const res = await makeApiRequest('/api/v1/notifications', {}, 'GET', true);
        const notifs = res.notifications || [];

        let html = '<div style="max-height: 65vh; overflow-y: auto; padding-right: 6px; text-align: left; overflow-x: hidden; display: block; width: 100%; box-sizing: border-box;">';

        if (notifs.length === 0) {
            html += '<div style="text-align: center; color: #888; padding: 40px 10px;"><i class="fa-regular fa-bell-slash" style="font-size: 32px; margin-bottom: 12px; opacity: 0.4;"></i><br><span style="font-size: 12px; font-weight: 400;">Здесь пока пусто.</span><br><span style="font-size: 10px; opacity: 0.6;">Вся история начислений будет храниться тут.</span></div>';
        } else {
            notifs.forEach(n => {
                let icon = '<i class="fa-solid fa-bell" style="color: #8e8e93;"></i>';
                let iconBg = 'rgba(255, 255, 255, 0.05)';
                
                if (n.type === 'coins') { 
                    icon = '<i class="fa-solid fa-coins" style="color: #ffd700;"></i>'; 
                    iconBg = 'rgba(255, 215, 0, 0.1)'; 
                }
                if (n.type === 'tickets') { 
                    icon = '<i class="fa-solid fa-ticket" style="color: #9146ff;"></i>'; 
                    iconBg = 'rgba(145, 70, 255, 0.1)'; 
                }
                if (n.type === 'error') { 
                    icon = '<i class="fa-solid fa-circle-xmark" style="color: #ff3b30;"></i>'; 
                    iconBg = 'rgba(255, 59, 48, 0.1)'; 
                }
                if (n.type === 'system' || n.type === 'success') { 
                    icon = '<i class="fa-solid fa-check" style="color: #34c759;"></i>'; 
                    iconBg = 'rgba(52, 199, 89, 0.1)'; 
                }

                const dateObj = new Date(n.created_at);
                const timeStr = dateObj.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
                const dateStr = dateObj.toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit'});
                // Светящаяся золотая рамка для новых, тусклая для старых
                const unreadBorder = n.is_read ? 'rgba(255,255,255,0.03)' : 'rgba(255,215,0,0.3)';

                // ВЁРСТКА: Убраны пустые символы и переносы, чтобы карточки стояли ровно
                html += `<div class="notif-item" style="background: #232325; border-radius: 12px; padding: 10px 32px 20px 10px; margin-bottom: 2px; position: relative; border: 1px solid ${unreadBorder}; transition: opacity 0.3s, transform 0.3s; box-sizing: border-box; width: 100%; display: flex; align-items: flex-start; gap: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: ${iconBg}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 14px;">
                        ${icon}
                    </div>
                    <div style="flex-grow: 1; display: flex; flex-direction: column; min-width: 0; padding-bottom: 2px;">
                        <div style="font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">
                            ${escapeHTML(n.title)}
                        </div>
                        <div style="font-size: 11px; font-weight: 400; color: #aaa; line-height: 1.3; word-break: break-word; overflow-wrap: anywhere; white-space: normal; margin-bottom: 0;">
                            ${escapeHTML(n.message)}
                        </div>
                    </div>
                    <div style="position: absolute; bottom: -4px; right: 10px; font-size: 9px; font-weight: 500; color: #666;">
                        ${dateStr} в ${timeStr}
                    </div>
                    <div style="position: absolute; top: 10px; right: 10px; width: 24px; height: 24px; cursor: pointer; opacity: 0.5; transition: opacity 0.2s; display: flex; align-items: flex-start; justify-content: flex-end;" onclick="deleteNotification(event, '${n.id}')" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.5'">
                        <i class="fa-solid fa-trash" style="color: #ff3b30; font-size: 12px;"></i>
                    </div>
                </div>`;
            });
        }
        html += '</div>';

        const subtitleEl = document.querySelector('.custom-confirm-box .confirm-subtitle');
        if (subtitleEl) subtitleEl.innerHTML = html;

        if (notifs.some(n => !n.is_read)) {
            await makeApiRequest('/api/v1/notifications/read', { user_id: Telegram.WebApp.initDataUnsafe?.user?.id }, 'POST', true);
        }

    } catch (e) {
        const subtitleEl = document.querySelector('.custom-confirm-box .confirm-subtitle');
        if (subtitleEl) subtitleEl.innerHTML = '<div style="color:#ff3b30; text-align:center; padding:20px; font-size: 12px;">Не удалось загрузить историю.</div>';
    }
};
// ================================================================
// УТИЛИТЫ И API
// ================================================================
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, match => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[match]);
}

function lockAppScroll() { document.body.classList.add('no-scroll'); if (dom.mainContent) dom.mainContent.classList.add('no-scroll'); }
function unlockAppScroll() { document.body.classList.remove('no-scroll'); if (dom.mainContent) dom.mainContent.classList.remove('no-scroll'); }

function updateLoading(percent) {
    if (dom.loadingText) dom.loadingText.textContent = Math.floor(percent) + '%';
    if (dom.loadingBarFill) dom.loadingBarFill.style.width = Math.floor(percent) + '%';
}
       async function makeApiRequest(url, body = {}, method = 'POST', isSilent = false) {
    if (!isSilent && dom.loaderOverlay) dom.loaderOverlay.classList.remove('hidden');
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);
        const options = { method, headers: { 'Content-Type': 'application/json' }, signal: controller.signal };
        
        // 🔥 ИСПРАВЛЕНИЕ: Получаем payload один раз и передаем платформу даже в GET-запросах
        const authPayload = getAuthPayload();
        
        if (method !== 'GET') {
            options.body = JSON.stringify({ ...body, ...authPayload });
        } else {
            const separator = url.includes('?') ? '&' : '?';
            url += `${separator}initData=${encodeURIComponent(authPayload.initData)}&platform=${encodeURIComponent(authPayload.platform)}`;
        }

        const response = await fetch(url, options);
        clearTimeout(timeoutId); 

        if (response.status === 429) throw new Error('Cooldown active');
        if (response.status === 204) return null;
        
        const result = await response.json();

       if (!response.ok) {
            // Приводим ошибку к верхнему регистру для надежности (чтобы ловить BANNED, banned, BAN и т.д.)
            const errorDetail = result.detail ? result.detail.toUpperCase() : (result.message ? result.message.toUpperCase() : "");

            // 💀 1. ВЕЧНЫЙ ЭКРАН СМЕРТИ (403 BANNED)
            if (response.status === 403 && errorDetail.includes("BAN")) {
                document.body.innerHTML = `
                    <div style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #000; z-index: 2147483647; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #ff3b30; text-align: center; padding: 30px; box-sizing: border-box; font-family: -apple-system, system-ui, sans-serif;">
                        <i class="fa-solid fa-skull-crossbones" style="font-size: 100px; margin-bottom: 25px; filter: drop-shadow(0 0 20px rgba(255, 59, 48, 0.6)); animation: banPulse 2s infinite;"></i>
                        
                        <h1 style="font-size: 28px; font-weight: 900; margin-bottom: 10px; text-transform: uppercase; color: #fff; letter-spacing: 1px;">Доступ ограничен</h1>
                        
                        <p style="color: #fff; font-size: 16px; line-height: 1.5; margin-bottom: 30px; opacity: 0.9; max-width: 300px;">
                            Твой аккаунт заблокирован за нарушение правил системы.
                        </p>

                        <a href="https://t.me/hatelove_twitch" target="_blank" style="display: inline-flex; align-items: center; gap: 10px; background: #2AABEE; color: #fff; text-decoration: none; padding: 14px 24px; border-radius: 14px; font-weight: 800; font-size: 14px; transition: transform 0.2s; box-shadow: 0 4px 20px rgba(42, 171, 238, 0.3);">
                            <i class="fa-brands fa-telegram" style="font-size: 18px;"></i> СВЯЗАТЬСЯ СО МНОЙ
                        </a>

                        <p style="color: #555; font-size: 11px; margin-top: 25px; line-height: 1.4;">
                            Если ты считаешь, что это произошло по ошибке,<br>напиши в поддержку для разбора ситуации.
                        </p>
                    </div>
                    <style>
                        @keyframes banPulse {
                            0% { transform: scale(1); opacity: 1; }
                            50% { transform: scale(1.05); opacity: 0.8; }
                            100% { transform: scale(1); opacity: 1; }
                        }
                    </style>
                `;
                
                document.body.style.overflow = 'hidden';
                document.body.style.position = 'fixed';

                if (window.Telegram?.WebApp?.HapticFeedback) {
                    Telegram.WebApp.HapticFeedback.notificationOccurred('error');
                }
                
                throw new Error("USER_BANNED");
            }

            // 👇 ВОТ СЮДА ВСТАВЛЯЕМ НАШУ ПРОВЕРКУ БОТА 👇
            if (result.detail && (errorDetail.includes("НЕ НАЙДЕН ПОЛЬЗОВАТЕЛЬ") || errorDetail.includes("BOT_USER_NOT_FOUND"))) {
                window.showBotAuthWarning();
                throw new Error("Bot Auth Required");
            }
            // 👆 КОНЕЦ ВСТАВКИ 👆

            // 🛡️ 2. ДУБЛИКАТЫ (400 DUPLICATE_TRADE_LINK / DUPLICATE_TWITCH)
            if (response.status === 400) {
                if (errorDetail.includes("DUPLICATE_TRADE_LINK")) {
                    // Для трейд-ссылки вызываем окно с инпутом
                    window.showSecurityBlock("Эта Трейд-ссылка уже используется другим игроком! Мы удалили её. Укажите правильную ссылку ниже.");
                    throw new Error("Security Block");
                }
                if (errorDetail.includes("DUPLICATE_TWITCH")) {
                    // Для Твича вызываем обычный алерт, чтобы не просить трейд-ссылку
                    window.customAlert("Этот Twitch-аккаунт уже привязан к другому пользователю! Обратитесь в поддержку.");
                    throw new Error("Security Block");
                }
            }

            // Обычная проверка на 403 (другие ограничения)
            if (response.status === 403) {
                // Для обычных 403 тоже используем алерт, чтобы зря не блокировать экран трейд-ссылкой
                window.customAlert(result.detail || "Доступ ограничен.");
                throw new Error("Security Block");
            }
            
            throw new Error(result.detail || result.message || 'Ошибка сервера');
        }
        return result;
    } catch (e) {
        if (e.name === 'AbortError') e.message = "Превышено время ожидания ответа от сервера.";
        
        // 🔥 ВАЖНО: Если это Бан, Блок или Ошибка Бота, НЕ показываем стандартный customAlert поверх нашего окна
        const silentErrors = ['Cooldown active', 'Security Block', 'USER_BANNED', 'Bot Auth Required'];
        if (!silentErrors.includes(e.message) && !isSilent) {
             customAlert(`Ошибка: ${e.message}`);
        }
        throw e;
    } finally {
        if (!isSilent && dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
    }
}


// Предзагрузка массива картинок
function preloadImages(urls) {
    const promises = urls.map(url => {
        return new Promise((resolve, reject) => {
            if (!url) {
                resolve();
                return;
            }
            const img = new Image();
            img.src = url;
            // Если картинка загрузилась или произошла ошибка — идём дальше (чтобы не зависнуть)
            img.onload = resolve;
            img.onerror = resolve; 
        });
    });
    // Ждем загрузки всех переданных картинок
    return Promise.all(promises);
}

// ================================================================
// HEARTBEAT (ФОНОВОЕ ОБНОВЛЕНИЕ)
// ================================================================
async function refreshDataSilently() {
    if (!window.Telegram?.WebApp?.initData && !isVk) return;
    try {
        const hbData = await makeApiRequest("/api/v1/user/heartbeat", {}, 'POST', true);
        if (hbData) {
            // Если техработы включили прямо во время сессии — мгновенный редирект
            if (hbData.maintenance) {
                document.body.innerHTML = '<div style="display:flex; height:100vh; width:100vw; background:#141414; align-items:center; justify-content:center; color:#FFD700; font-weight:bold; font-size:14px;"><i class="fa-solid fa-gear fa-spin" style="margin-right:10px;"></i> Технические работы...</div>';
                window.location.replace('/');
                return;
            }

            if (hbData.is_active === false) return;
            if (hbData.tickets !== undefined) {
                userData.tickets = hbData.tickets;
                const tel = document.getElementById('ticketStats');
                if (tel) tel.textContent = hbData.tickets;
            }
            if (hbData.quest_id) {
                userData.active_quest_id = hbData.quest_id;
                userData.active_quest_progress = hbData.quest_progress;
            }
            if (hbData.has_active_challenge) {
                if (!userData.challenge) userData.challenge = {};
                userData.challenge.progress_value = hbData.challenge_progress;
                userData.challenge.target_value = hbData.challenge_target;
            }
            updateShortcutStatuses(userData, allQuests);
            if (hbData.active_trade_status !== undefined) updateShopTile(hbData.active_trade_status);
            
            const giftContainer = document.getElementById('gift-container');
            const giftBtn = document.getElementById('daily-gift-btn');
            if (giftContainer && giftBtn) {
                 const isEnabled = String(userData.bonus_gift_enabled) !== 'false' && userData.bonus_gift_enabled;
                 if (!isEnabled) { giftContainer.style.display = 'none'; giftBtn.style.display = 'none'; }
                 else if (!giftContainer.classList.contains('hidden')) { giftContainer.style.display = ''; }
            }

            // 👇 ДОБАВЛЯЕМ ВОТ ЭТУ СТРОЧКУ 👇
            fetchNotificationsBadge();
        }
    } catch (e) {}
}

// ================================================================
// БАЛАНС
// ================================================================
let isBalanceLoading = false;
async function checkBalance(updateUI = true) {
    if (isBalanceLoading) return Promise.resolve();
    isBalanceLoading = true;
    
    const iconCoins = document.getElementById('refresh-icon');
    if (iconCoins) iconCoins.classList.add('fa-spin');

    // ⚡ МГНОВЕННЫЙ РЕНДЕР ИЗ ВЫДЕЛЕННОГО КЭША
    if (updateUI) {
        try {
            const cached = JSON.parse(localStorage.getItem('smart_balance_cache'));
            if (cached) renderBalanceUI(cached.balance, cached.tickets);
        } catch(e) {}
    }

    try {
        const data = await makeApiRequest('/api/v1/shop/smart_balance', {}, 'POST', true);
        
        if (updateUI && data) {
            localStorage.setItem('smart_balance_cache', JSON.stringify(data));
            renderBalanceUI(data.balance, data.tickets);
        }
    } catch (err) {
        console.warn("[SHOP BALANCE] Фоновое обновление прервано:", err.message);
    } finally { 
        setTimeout(() => { 
            isBalanceLoading = false; 
            // 🔥 Ищем элемент заново перед снятием класса, чтобы не потерять ссылку
            const currentIcon = document.getElementById('refresh-icon');
            if (currentIcon) currentIcon.classList.remove('fa-spin'); 
        }, 500); 
    }
}

// Вынесли отрисовку в отдельную функцию (теперь без деления на 100)
function renderBalanceUI(coins, tickets) {
    if (coins !== undefined) {
        // Монеты оставляем с разделением (например, 1 000)
        let displayBalance = Number(coins).toLocaleString('ru-RU');
        const balanceEl = document.getElementById('user-balance');
        if (balanceEl && balanceEl.textContent !== displayBalance) { 
            balanceEl.style.opacity = '0.5'; 
            setTimeout(() => { 
                balanceEl.textContent = displayBalance; 
                balanceEl.style.opacity = '1'; 
            }, 150); 
        }
    }

    if (tickets !== undefined) {
        // 🔥 ИСПРАВЛЕНО: Билеты теперь БЕЗ разделения (например, 1000 вместо 1 000)
        let displayTickets = Math.floor(Number(tickets)).toString();
        
        const ticketsEl = document.getElementById('ticketStats');
        if (ticketsEl && ticketsEl.textContent !== displayTickets) { 
            ticketsEl.style.opacity = '0.5'; 
            setTimeout(() => { 
                ticketsEl.textContent = displayTickets; 
                ticketsEl.style.opacity = '1'; 
            }, 150); 
        }
    }
}
// ================================================================
// НОВЫЙ ИНТЕРФЕЙС (ПЕРЕКЛЮЧАТЕЛИ И МЕНЮ)
// ================================================================
function setupNewUI() {
    const menuBtn = document.getElementById('open-menu-btn');
    const closeMenuBtn = document.getElementById('close-menu-btn');
    const sideMenu = document.getElementById('side-menu-overlay');

    const toggleMenu = (show) => {
        if (show) { sideMenu.classList.add('active'); document.body.style.overflow = 'hidden'; } 
        else { sideMenu.classList.remove('active'); document.body.style.overflow = ''; }
    };
    if (menuBtn) menuBtn.addEventListener('click', () => toggleMenu(true));
    if (closeMenuBtn) closeMenuBtn.addEventListener('click', () => toggleMenu(false));
    if (sideMenu) sideMenu.addEventListener('click', (e) => { if (e.target === sideMenu) toggleMenu(false); });

    const toggleOptions = document.querySelectorAll('.toggle-option');
    const toggleSlider = document.querySelector('.toggle-slider');
    const viewSections = document.querySelectorAll('.view-section');

    toggleOptions.forEach((option, index) => {
        option.addEventListener('click', () => {
            toggleSlider.style.transform = `translateX(${index * 100}%)`;
            toggleOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');

            const targetId = option.getAttribute('data-target');
            viewSections.forEach(section => {
                if (section.id === targetId) section.classList.add('active');
                else section.classList.remove('active');
            });
            
            if (window.Telegram?.WebApp?.HapticFeedback) Telegram.WebApp.HapticFeedback.selectionChanged();

            // Динамическая подгрузка кейсов при первом клике
            if (targetId === 'view-shop' && !isShopLoaded) {
                loadCategory(2716312);
                isShopLoaded = true;
            }
        });
    });
}

// ================================================================
// СЛАЙДЕР С ПОЛНОЙ ФИЗИКОЙ ИЗ ОРИГИНАЛА
// ================================================================
function setupSlider() {
    const container = document.getElementById('main-slider-container');
    if (!container) return;

    // --- УМНАЯ ЗАГЛУШКА ---
    const realSlides = container.querySelectorAll('.slide:not(#default-banner-slide)');
    const placeholder = document.getElementById('default-banner-slide');
    const hasActiveEvents = Array.from(realSlides).some(s => s.style.display !== 'none');
    
    if (placeholder) {
        placeholder.style.display = hasActiveEvents ? 'none' : '';
    }
    // ----------------------

    const allSlides = container.querySelectorAll('.slide');
    const visibleSlides = Array.from(allSlides).filter(slide => slide.style.display !== 'none');

    const currentSignature = visibleSlides.map(s => s.dataset.event || s.href || s.src).join('|');
    if (currentSignature === lastSliderSignature && sliderAbortController) return;
    lastSliderSignature = currentSignature;

    if (slideInterval) clearInterval(slideInterval);
    if (sliderAbortController) sliderAbortController.abort();
    
    sliderAbortController = new AbortController();
    const signal = sliderAbortController.signal;

    const wrapper = container.querySelector('.slider-wrapper');
    const dotsContainer = container.querySelector('.slider-dots');
    
    let prevBtnOld = document.getElementById('slide-prev-btn');
    let nextBtnOld = document.getElementById('slide-next-btn');
    
    if (prevBtnOld && nextBtnOld) {
        let prevBtn = prevBtnOld.cloneNode(true);
        let nextBtn = nextBtnOld.cloneNode(true);
        prevBtnOld.parentNode.replaceChild(prevBtn, prevBtnOld);
        nextBtnOld.parentNode.replaceChild(nextBtn, nextBtnOld);
        prevBtnOld = prevBtn;
        nextBtnOld = nextBtn;
    }

    if (visibleSlides.length === 0) {
        container.style.display = 'none'; 
        return;
    } else {
        container.style.display = ''; 
    }

    if (visibleSlides.length === 1) {
        if (prevBtnOld) prevBtnOld.style.display = 'none'; 
        if (nextBtnOld) nextBtnOld.style.display = 'none';
        if (dotsContainer) dotsContainer.style.display = 'none';
        // Фикс улетающего слайдера, когда активен только 1 баннер
        if (wrapper) wrapper.style.transform = `translateX(0%)`;
        return;
    }
    
    if (prevBtnOld) prevBtnOld.style.display = 'flex'; 
    if (nextBtnOld) nextBtnOld.style.display = 'flex';
    if (dotsContainer) dotsContainer.style.display = 'flex';
    
    dotsContainer.innerHTML = '';
    visibleSlides.forEach((_, i) => {
        const dot = document.createElement('button'); dot.classList.add('dot');
        dot.onclick = () => { showSlide(i); resetSlideInterval(); };
        dotsContainer.appendChild(dot);
    });
    const dots = dotsContainer.querySelectorAll('.dot');

    function showSlide(index) {
        if (index >= visibleSlides.length) index = 0; if (index < 0) index = visibleSlides.length - 1;
        if (!wrapper || !dots[index]) return;
        wrapper.style.transform = `translateX(-${index * 100}%)`;
        dots.forEach(dot => dot.classList.remove('active'));
        dots[index].classList.add('active');
        currentSlideIndex = index;
    }
    
    function nextSlide() { showSlide(currentSlideIndex + 1); }
    function prevSlide() { showSlide(currentSlideIndex - 1); }
    function resetSlideInterval() { clearInterval(slideInterval); slideInterval = setInterval(nextSlide, 15000); }

    if (prevBtnOld) prevBtnOld.addEventListener('click', () => { prevSlide(); resetSlideInterval(); }, { signal });
    if (nextBtnOld) nextBtnOld.addEventListener('click', () => { nextSlide(); resetSlideInterval(); }, { signal });
    
    // Свайпы
    let touchStartX = 0, touchStartY = 0, touchEndX = 0, isSwiping = false;
    container.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; touchEndX = touchStartX; isSwiping = false;
    }, { passive: true, signal });

    container.addEventListener('touchmove', (e) => {
        if (touchStartX === 0 && touchStartY === 0) return;
        const diffX = touchStartX - e.touches[0].clientX; const diffY = touchStartY - e.touches[0].clientY;
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
            isSwiping = true; if (e.cancelable) { e.preventDefault(); e.stopPropagation(); }
        }
        touchEndX = e.touches[0].clientX;
    }, { passive: false, signal });

    container.addEventListener('touchend', (e) => {
        if (isSwiping) {
            e.stopPropagation(); const diff = touchStartX - touchEndX;
            if (Math.abs(diff) > 50) { if (diff > 0) nextSlide(); else prevSlide(); resetSlideInterval(); }
        }
        touchStartX = 0; touchStartY = 0; isSwiping = false;
    }, { passive: true, signal });
    
    allSlides.forEach(slide => {
        slide.onclick = (e) => { if (isSwiping) { e.preventDefault(); e.stopPropagation(); return false; } };
    });

    if (currentSlideIndex >= visibleSlides.length) currentSlideIndex = 0;
    showSlide(currentSlideIndex); resetSlideInterval();
}

function updateShortcutStatuses(userData, allQuests) {
    const chalStatus = document.getElementById('metro-challenge-status');
    const chalFill = document.getElementById('metro-challenge-fill');
    if (chalStatus && chalFill) {
        if (!userData.is_stream_online) {
            chalStatus.textContent = 'ОФФЛАЙН'; chalStatus.style.color = '#ff453a'; chalFill.style.width = '0%';
        } else if (userData.challenge) {
            const ch = userData.challenge;
            const prog = ch.progress_value || 0, target = ch.target_value || 1;
            if (ch.claimed_at) { chalStatus.textContent = "ПОЛУЧЕНО"; chalStatus.classList.add('metro-status-done'); chalFill.style.width = '100%'; }
            else if (prog >= target) { chalStatus.textContent = "ЗАБРАТЬ!"; chalStatus.classList.add('metro-status-done'); chalFill.style.width = '100%'; }
            else { chalStatus.textContent = `${prog} / ${target}`; chalStatus.classList.remove('metro-status-done'); chalStatus.style.color=''; chalFill.style.width = `${(prog/target)*100}%`; }
        } else {
            chalStatus.textContent = "Нет активного"; chalFill.style.width = '0%';
        }
    }

    const questStatus = document.getElementById('metro-quest-status');
    const questFill = document.getElementById('metro-quest-fill');
    if (questStatus && questFill) {
        if (!userData.active_quest_id) {
            questStatus.innerHTML = userData.is_stream_online ? '<i class="fa-brands fa-twitch"></i> Выбрать' : '<i class="fa-brands fa-telegram"></i> Выбрать';
            questFill.style.width = '0%'; questStatus.classList.remove('metro-status-done'); questStatus.style.color='';
        } else {
            const quest = allQuests.find(q => q.id === userData.active_quest_id);
            if (quest) {
                const prog = userData.active_quest_progress || 0, target = quest.target_value || 1;
                if (prog >= target) { questStatus.textContent = "ГОТОВО"; questStatus.classList.add('metro-status-done'); questFill.style.width = '100%'; }
                else { questStatus.textContent = `${prog} / ${target}`; questStatus.classList.remove('metro-status-done'); questStatus.style.color=''; questFill.style.width = `${(prog/target)*100}%`; }
            } else { questStatus.textContent = "..."; }
        }
    }
}

function updateShopTile(status) {
    const shopTile = document.getElementById('shortcut-shop');
    if (!shopTile) return;
    const safeStatus = status || 'none';
    shopTile.dataset.status = safeStatus;

    const stages = {
        'creating': { label: 'ЗАЯВКА СОЗДАНА', sub: 'Ожидание...', icon: '<i class="fa-regular fa-clock"></i>', bg: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)' },
        'sending': { label: 'ПРОВЕРКА АДМИНОМ', sub: 'Ожидайте...', icon: '<i class="fa-solid fa-hourglass-half fa-spin"></i>', bg: 'linear-gradient(135deg, #2AABEE, #229ED9)' },
        'confirming': { label: 'ТРЕБУЕТ ДЕЙСТВИЯ', sub: 'Передайте скин!', icon: '<i class="fa-solid fa-fire fa-beat"></i>', bg: 'linear-gradient(135deg, #ff3b30, #ff9500)' },
        'failed': { label: 'ОТМЕНЕНО', sub: 'Попробуйте снова', icon: '<i class="fa-solid fa-circle-xmark"></i>', bg: 'linear-gradient(135deg, #ff3b30 0%, #ff453a 100%)' }
    };

    const stage = stages[safeStatus];
    if (!stage) {
        shopTile.style.background = ''; shopTile.style.animation = '';
        shopTile.innerHTML = `<div class="metro-tile-bg-icon"><i class="fa-solid fa-cart-shopping"></i></div><div class="metro-content"><div class="metro-icon-main"><i class="fa-solid fa-cart-shopping"></i></div><span class="metro-label">Магазин</span><span class="metro-sublabel">Кейсы и предметы</span></div>`;
        return;
    }
    shopTile.style.background = stage.bg;
    shopTile.style.animation = safeStatus === 'confirming' ? 'statusPulse 2s infinite' : '';
    shopTile.innerHTML = `<div class="metro-tile-bg-icon" style="opacity:0.15">${stage.icon}</div><div class="metro-content"><div class="metro-icon-main" style="color:#fff;">${stage.icon}</div><span class="metro-label" style="color:#fff;">${stage.label}</span><span class="metro-sublabel" style="color: #fff;">${stage.sub}</span></div>`;
}

// Рефералка
async function checkReferralAndWelcome(userData) {
    const rawParam = (Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.start_param) || null;
    const bonusBtn = document.getElementById('open-bonus-btn');
    let validRefCode = null;
    if (rawParam && rawParam.startsWith('r_')) { validRefCode = rawParam; localStorage.setItem('cached_referral_code', validRefCode); }

    if (userData.referral_activated_at) {
        if (bonusBtn) bonusBtn.classList.add('hidden');
        localStorage.removeItem('openRefPopupOnLoad'); localStorage.removeItem('cached_referral_code'); localStorage.removeItem('pending_ref_code');
        return; 
    }

    const codeToPass = validRefCode || localStorage.getItem('cached_referral_code');
    const shouldShowBonus = userData.referrer_id || codeToPass;

    if (shouldShowBonus) {
        if (bonusBtn) { bonusBtn.classList.remove('hidden'); bonusBtn.onclick = () => openWelcomePopup(userData, codeToPass); }
        if (localStorage.getItem('openRefPopupOnLoad')) {
            openWelcomePopup(userData, localStorage.getItem('pending_ref_code') || codeToPass);
            localStorage.removeItem('openRefPopupOnLoad');
        } else if (!localStorage.getItem('bonusPopupDeferred')) {
            openWelcomePopup(userData, codeToPass);
        } 
    } else { if (bonusBtn) bonusBtn.classList.add('hidden'); }
}

async function openWelcomePopup(currentUserData, referralCode = null) {
    const popup = document.getElementById('welcome-popup'); if (!popup) return;
    let userData = currentUserData;
    const stepTwitch = document.getElementById('step-twitch');
    const stepTg = document.getElementById('step-tg');
    const iconTg = document.getElementById('icon-tg');
    let iconTwitch = document.getElementById('icon-twitch'); 
    const actionBtn = document.getElementById('action-btn');

    actionBtn.disabled = false; actionBtn.textContent = "Проверка..."; actionBtn.style.background = ""; popup.classList.add('visible');

    const laterBtn = document.getElementById('later-btn');
    if (laterBtn) laterBtn.onclick = () => { popup.classList.remove('visible'); localStorage.setItem('bonusPopupDeferred', 'true'); };

    function renderTwitchSection() {
        if (!userData.twitch_id) {
            stepTwitch.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="fa-brands fa-twitch" style="font-size: 24px; color: #9146ff;"></i>
                        <div style="text-align: left;"><div style="font-weight: bold; font-size: 14px; color: #fff;">Привязка Twitch</div><div style="font-size: 11px; color: #aaa;">Обязательно для бонуса</div></div>
                    </div><i id="icon-twitch" class="fa-regular fa-circle" style="color: #aaa; font-size: 16px;"></i>
                </div>
                <button id="connect-twitch-btn-popup" style="background-color: #9146ff; color: white; border: none; border-radius: 8px; height: 36px; width: 100%; font-weight: 600; cursor: pointer;"><i class="fa-brands fa-twitch"></i> Привязать</button>`;
            const btnConnect = document.getElementById('connect-twitch-btn-popup');
            if (btnConnect) {
                btnConnect.onclick = async (e) => {
                    e.preventDefault(); e.stopPropagation();
                    if (referralCode) localStorage.setItem('pending_ref_code', referralCode);
                    btnConnect.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; 
                    try {
                        const response = await fetch(`/api/v1/auth/twitch_oauth?initData=${encodeURIComponent(Telegram.WebApp.initData)}&redirect=/`);
                        const data = await response.json();
                        if (data.url) { localStorage.setItem('openRefPopupOnLoad', 'true'); Telegram.WebApp.openLink(data.url); Telegram.WebApp.close(); }
                    } catch (err) { btnConnect.innerHTML = "Ошибка"; }
                };
            }
        } else {
            stepTwitch.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="fa-brands fa-twitch" style="font-size: 24px; color: #9146ff;"></i>
                        <div style="text-align: left;"><div style="font-weight: bold; font-size: 14px; color: #fff;">Twitch привязан</div><div style="font-size: 11px; color: #aaa;">Аккаунт подключен</div></div>
                    </div><i id="icon-twitch" class="fa-solid fa-circle-check" style="color: #34c759; font-size: 16px;"></i>
                </div>`;
            stepTwitch.style.border = '1px solid #34c759';
        }
    }
    renderTwitchSection();
    stepTg.onclick = () => { Telegram.WebApp.openTelegramLink('https://t.me/hatelove_ttv'); };

    async function claimReward() {
        actionBtn.disabled = true; actionBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Забираем...';
        const finalRefCode = referralCode || localStorage.getItem('pending_ref_code') || localStorage.getItem('cached_referral_code');
        try {
            const response = await fetch('/api/v1/user/referral/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: Telegram.WebApp.initData, referral_code: finalRefCode }) });
            if (response.ok) {
                Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                document.getElementById('open-bonus-btn')?.classList.add('hidden');
                localStorage.removeItem('openRefPopupOnLoad'); localStorage.removeItem('bonusPopupDeferred'); localStorage.removeItem('pending_ref_code'); localStorage.removeItem('cached_referral_code');
                popup.classList.remove('visible'); refreshDataSilently(); 
            } else { actionBtn.disabled = false; actionBtn.textContent = "Ошибка"; }
        } catch(e) { actionBtn.disabled = false; actionBtn.textContent = "Ошибка сети"; }
    }

    async function runCheck(isManualClick = false) {
        if (!popup.classList.contains('visible')) return; 
        
        try {
            // 🔥 Делаем запрос к серверу ТОЛЬКО если юзер нажал кнопку "Проверить снова" руками
            if (isManualClick) {
                actionBtn.disabled = true; 
                actionBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                const fresh = await makeApiRequest('/api/v1/bootstrap', {}, 'POST', true);
                if (fresh && fresh.user) { 
                    userData = fresh.user; 
                    if (userData.twitch_id) renderTwitchSection(); 
                }
            }
            
            // Проверку подписки ТГ оставляем (ее в бутстрапе нет)
            let tgOk = false;
            try { 
                const tgRes = await makeApiRequest('/api/v1/user/check_subscription', {}, 'POST', true); 
                if (tgRes && tgRes.is_subscribed) tgOk = true; 
            } catch(e) {}
            
            const twitchOk = !!userData.twitch_id;
            
            if (tgOk) { 
                stepTg.style.border = '1px solid #34c759'; 
                document.getElementById('icon-tg').className = 'fa-solid fa-circle-check'; 
                document.getElementById('icon-tg').style.color = '#34c759'; 
            }
            
            if (tgOk && twitchOk) {
                actionBtn.disabled = false; 
                actionBtn.innerHTML = "ЗАБРАТЬ БОНУС 🎁"; 
                actionBtn.style.background = "#FFD700"; 
                actionBtn.style.color = "#000"; 
                actionBtn.onclick = claimReward; 
            } else {
                actionBtn.disabled = false; 
                actionBtn.textContent = "Проверить снова"; 
                // Теперь при ручном клике передаем true
                actionBtn.onclick = () => runCheck(true);
            }
        } catch (e) { 
            actionBtn.disabled = false; 
            actionBtn.textContent = "Ошибка проверки"; 
            actionBtn.onclick = () => runCheck(true);
        }
    }
    
    // Запускаем автоматическую проверку при открытии окна (isManualClick = false)
    setTimeout(() => runCheck(false), 400);
} // <-- Это закрывающая скобка функции openWelcomePopup

// Подарки
async function checkGift() {
    if (!bonusGiftEnabled) {
        if(dom.giftContainer) dom.giftContainer.classList.add('hidden');
        return; 
    }
    try {
        const res = await makeApiRequest('/api/v1/gift/check', {}, 'POST', true);
        if (res && res.available) { if(dom.giftContainer) dom.giftContainer.classList.remove('hidden'); }
        else { if(dom.giftContainer) dom.giftContainer.classList.add('hidden'); }
    } catch (e) {}
}

// Вспомогательная функция для склонения слов
function declOfNum(number, titles) {
    const cases = [2, 0, 1, 1, 1, 2];
    return titles[ (number % 100 > 4 && number % 100 < 20) ? 2 : cases[(number % 10 < 5) ? number % 10 : 5] ];
}

function renderGiftResult(result) {
    // 1. Прячем начальный экран подарка и показываем экран результата
    dom.giftContentInitial.classList.add('hidden'); 
    dom.giftContentResult.classList.remove('hidden');
    
    // Прячем кнопку "Открыть", если она есть
    const giftBtn = document.getElementById('daily-gift-btn'); 
    if (giftBtn) giftBtn.style.display = 'none'; 
    
    // Прячем сам контейнер подарка на фоне и жестко скрываем блок с промокодом
    dom.giftContainer.classList.add('hidden'); 
    dom.giftPromoBlock.classList.add('hidden'); 

    // 2. ОТРИСОВКА ИКОНКИ И ТЕКСТА НАГРАДЫ (СЕРВЕРНОЙ!)
    if (result.type === 'tickets') { 
        dom.giftResultIcon.innerHTML = "🎟️"; 
        const ticketWord = declOfNum(result.value, ['билет', 'билета', 'билетов']);
        dom.giftResultText.innerHTML = `Вы получили <b>${result.value}</b>&nbsp;${ticketWord}!`; 
    } 
    else if (result.type === 'coins') { 
        dom.giftResultIcon.innerHTML = "💰"; 
        const coinWord = declOfNum(result.value, ['монету', 'монеты', 'монет']);
        dom.giftResultText.innerHTML = `Вы получили <b>${result.value}</b>&nbsp;${coinWord}!`; 
    } 
    else if (result.type === 'skin') { 
        // Если вдруг вернешь скины, логика останется рабочей
        dom.giftResultIcon.innerHTML = `<img src="${escapeHTML(result.meta?.image_url || '')}" style="width:100px; height:100px; object-fit:contain;">`; 
        dom.giftResultText.innerHTML = `<b>${escapeHTML(result.meta?.name || 'Скин')}</b>`; 
    }

    // 3. ОТРИСОВКА ЗАГОЛОВКА И КНОПКИ ЗАКРЫТИЯ (В зависимости от подписки)
    if (result.subscription_required) {
        // ЮЗЕР НЕ ПОДПИСАН (Дразнилка)
        
        // Возвращаем кнопку подарка, чтобы он мог нажать ее снова после подписки
        if (giftBtn) giftBtn.style.display = 'flex'; 
        
        dom.giftResultTitle.textContent = "ПОЧТИ ТВОЁ!"; 
        dom.giftResultTitle.style.color = "#ff3b30";
        
        dom.giftCloseBtn.textContent = "Подписаться и забрать"; 
        dom.giftCloseBtn.style.background = "#0088cc";
        
        // Кнопка ведет на канал
        dom.giftCloseBtn.onclick = (e) => { 
            e.preventDefault(); 
            Telegram.WebApp.openTelegramLink("https://t.me/hatelove_ttv"); 
            dom.giftModalOverlay.classList.add('hidden'); 
            unlockAppScroll(); 
        };
    } else {
        // ЮЗЕР ПОДПИСАН (Реальная награда)
        
        dom.giftResultTitle.textContent = "Поздравляем!"; 
        dom.giftResultTitle.style.color = "#34c759";
        
        dom.giftCloseBtn.textContent = "Круто!"; 
        dom.giftCloseBtn.style.background = "#555";
        
        // Кнопка просто закрывает модалку
        dom.giftCloseBtn.onclick = () => { 
            dom.giftModalOverlay.classList.add('hidden'); 
            unlockAppScroll(); 
        };
    }
}

// Туториал
const tutorialSteps = [
    { element: '.top-header', title: 'Ваш Профиль и Баланс', text: 'Сверху находится ваш профиль и баланс монет/билетов.' },
    { element: '#main-slider-container', title: 'Актуальные События', text: 'В этом слайдере находятся различные мероприятия!' },
    { element: '#shortcut-quests', title: 'Задания', text: 'Выполняйте задания и получайте награды.' },
    { element: '.toggle-container', title: 'Магазин Скинов', text: 'Переключайтесь на вкладку КЕЙСЫ, чтобы обменивать звезды на скины!' }
];
let currentTutorialStep = 0;

function showTutorialStep(stepIndex) {
    document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
    if (stepIndex >= tutorialSteps.length) { dom.tutorialOverlay.classList.add('hidden'); return; }
    
    let step = tutorialSteps[stepIndex];
    setTimeout(() => {
        const element = document.querySelector(step.element);
        if (element) {
            element.classList.add('tutorial-highlight');
            dom.tutorialTitle.textContent = step.title;
            dom.tutorialText.innerHTML = step.text;
            dom.tutorialStepCounter.textContent = `Шаг ${stepIndex + 1} из ${tutorialSteps.length}`;
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 150); 
}
function startTutorial() { currentTutorialStep = 0; dom.tutorialOverlay.classList.remove('hidden'); showTutorialStep(currentTutorialStep); }
if(dom.tutorialNextBtn) dom.tutorialNextBtn.onclick = () => { currentTutorialStep++; showTutorialStep(currentTutorialStep); };
if(dom.tutorialSkipBtn) dom.tutorialSkipBtn.onclick = () => { dom.tutorialOverlay.classList.add('hidden'); document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight')); };

// ================================================================
// ГЛАВНЫЙ РЕНДЕР 
// ================================================================
function hexToRgb(hex) { const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '255, 215, 0'; }

// ================================================================
// СОЧНЫЙ МИНИ-СЛАЙДЕР РОЗЫГРЫШЕЙ В ПРАВОЙ КНОПКЕ
// ================================================================
let raffleSlideInterval = null;
let raffleTimersInterval = null;

async function initDynamicRaffleSlider(preloadedData = null) {
    const container = document.getElementById('mini-raffle-slider');
    if (!container) return;

    // --- ВНУТРЕННЯЯ ФУНКЦИЯ ДЛЯ ОТРИСОВКИ ---
    const renderRaffles = (data) => {
        // БЕЗОПАСНО ИЩЕМ МАССИВ
        let arr = [];
        if (Array.isArray(data)) arr = data;
        else if (data && Array.isArray(data.raffles)) arr = data.raffles;
        else if (data && Array.isArray(data.data)) arr = data.data;

        // Берем до 5 активных розыгрышей
        const activeRaffles = arr.filter(r => r.status === 'active').slice(0, 5);

        if (activeRaffles.length > 0) {
            let slidesHTML = '';
            
            const hexToRgb = (hex) => {
                const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '255, 215, 0';
            };

            activeRaffles.forEach((raffle, index) => {
                const s = raffle.settings || {}; 
                const img = s.card_image || s.prize_image || ''; 
                const rarityColor = s.rarity_color || '#ffd700'; 
                const quality = s.skin_quality || 'FT';
                const pCount = raffle.participants_count || 0;

                // Создаем точки
                let dotsHTML = '<div class="mr-dots-container">';
                activeRaffles.forEach((_, dotIndex) => {
                    dotsHTML += `<div class="mr-dot ${dotIndex === index ? 'active' : ''}" style="width:6px; height:6px; border-radius:50%; background: ${dotIndex === index ? rarityColor : 'rgba(255,255,255,0.2)'}; transition: background 0.3s;"></div>`;
                });
                dotsHTML += '</div>';

                slidesHTML += `
                    <div class="mini-raffle-slide ${index === 0 ? 'active' : ''}" style="--rarity-rgb: ${hexToRgb(rarityColor)};">
                        <div class="mini-raffle-info" style="display: flex; flex-direction: column; justify-content: center;">
                            <div class="mini-raffle-name">${escapeHTML(s.prize_name || 'Секретный приз')}</div>
                            <div class="mini-raffle-stats" style="font-size: 10px; margin-bottom: 4px;">
                                <span style="color: ${rarityColor};">${escapeHTML(quality)}</span> • 
                                <span style="opacity:0.8;"><i class="fa-solid fa-users"></i> ${pCount}</span>
                            </div>
                            <div class="mini-raffle-timer raffle-mini-timer-dyn" data-endtime="${raffle.end_time}">
                                <span>00</span><div class="timer-sep">:</div>
                                <span>00</span><div class="timer-sep">:</div>
                                <span>00</span>
                            </div>
                            <div class="mini-raffle-cta" style="margin-top: 6px; font-weight: bold; font-size: 11px;">Участвовать <i class="fa-solid fa-arrow-right"></i></div>
                        </div> <img src="${img}" class="mini-raffle-img">
                        ${dotsHTML} </div>
                `;
            });
            
            container.innerHTML = slidesHTML;

            // Очищаем старые интервалы (защита при обновлении кэша)
            if (raffleTimersInterval) clearInterval(raffleTimersInterval);
            if (raffleSlideInterval) clearInterval(raffleSlideInterval);

            // Запуск таймеров
            const updateTimers = () => {
                container.querySelectorAll('.raffle-mini-timer-dyn').forEach(el => {
                    const diff = new Date(el.dataset.endtime) - new Date();
                    if (diff <= 0) { 
                        el.innerHTML = "<span style='color:#ff3b30; font-size:10px;'>ЗАВЕРШЕН</span>"; 
                        return; 
                    }
                    
                    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
                    const m = Math.floor((diff / (1000 * 60)) % 60);
                    const s = Math.floor((diff / 1000) % 60);
                    
                    const spans = el.querySelectorAll('span');
                    if (spans.length === 3) {
                        spans[0].innerText = d > 0 ? `${d}д ${String(h).padStart(2, '0')}` : String(h).padStart(2, '0');
                        spans[1].innerText = String(m).padStart(2, '0');
                        spans[2].innerText = String(s).padStart(2, '0');
                    }
                });
            };
            updateTimers();
            raffleTimersInterval = setInterval(updateTimers, 1000);

            // Перелистывание слайдов
            const slides = container.querySelectorAll('.mini-raffle-slide');
            if (slides.length > 1) {
                let cur = 0;
                raffleSlideInterval = setInterval(() => {
                    slides[cur].classList.remove('active');
                    cur = (cur + 1) % slides.length;
                    slides[cur].classList.add('active');
                }, 4000); 
            }
        } else {
            container.innerHTML = '<span style="font-size:14px; font-weight:800; color:#fff; text-transform:uppercase;">РОЗЫГРЫШИ</span>';
        }
    };
    // --- КОНЕЦ ВНУТРЕННЕЙ ФУНКЦИИ ---

    // Если данные переданы напрямую из нового bootstrap, рисуем сразу
    if (preloadedData) {
        renderRaffles(preloadedData);
        return;
    }

    // Иначе пытаемся моментально отрендерить из общего кэша бутстрапа
    try {
        const cachedBootstrap = JSON.parse(localStorage.getItem('cache_bootstrap') || '{}');
        if (cachedBootstrap && cachedBootstrap.raffles) {
            renderRaffles(cachedBootstrap.raffles);
        } else {
            // Если и кэша нет (юзер зашел впервые), просто показываем красивую заглушку
            container.innerHTML = '<span style="font-size:14px; font-weight:800; color:#fff; text-transform:uppercase;">РОЗЫГРЫШИ</span>';
        }
    } catch(e) {
        container.innerHTML = '<span style="font-size:12px; font-weight:800; color:#ff3b30;">ОШИБКА</span>';
    }
}

async function renderFullInterface(data) {
    userData = data.user || {}; 
    allQuests = data.quests || [];
    const menuContent = data.menu;

    window.activeFreeCases = data.my_active_cases || [];

    if (document.getElementById('ticketStats')) {
        document.getElementById('ticketStats').textContent = userData.tickets || 0;
    }
    dom.fullName.textContent = userData.full_name || "Профиль";
    if (userData.is_admin) dom.navAdmin.classList.remove('hidden');

    // 👇 БЕТОННЫЙ БЛОК ДЛЯ ФОТОГРАФИИ (С ЗАЩИТОЙ ОТ ERR_TIMED_OUT) 👇
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) {
        // Функция для моментальной установки заглушки
        const setAvatarPlaceholder = (el) => {
            const firstLetter = (userData.full_name || "U").charAt(0).toUpperCase();
            el.src = `https://placehold.co/64x64/2c2c2e/FFD700?text=${firstLetter}`;
            el.onerror = null; // Защита от бесконечного цикла
        };

        // 1. Если картинка не загрузится (ошибка сети или 404)
        avatarEl.onerror = function() {
            console.warn("Аватарка ТГ заблокирована или не найдена. Ставим заглушку.");
            setAvatarPlaceholder(this);
        };

        // 2. ЗАЩИТА ОТ ТАЙМАУТА: если за 4 секунды фото не пришло — рубим ожидание
        const imgTimeout = setTimeout(() => {
            if (!avatarEl.complete || avatarEl.naturalWidth === 0) {
                console.warn("Таймаут загрузки аватарки. Ставим заглушку.");
                setAvatarPlaceholder(avatarEl);
            }
        }, 4000);

        // Если загрузилось вовремя — отменяем таймер
        avatarEl.onload = () => clearTimeout(imgTimeout);

        // 3. Пытаемся загрузить фото
        if (userData.photo_url) {
            avatarEl.src = userData.photo_url;
        } else {
            setAvatarPlaceholder(avatarEl);
        }
    }

    checkReferralAndWelcome(userData);

    if (menuContent) {
        if (menuContent.bonus_gift_enabled !== undefined) bonusGiftEnabled = menuContent.bonus_gift_enabled;
        const setupSlide = (id, enabled, url, link) => {
            const slide = document.querySelector(`[data-event="${id}"]`);
            if (slide) {
                const show = enabled || userData.is_admin; 
                slide.style.display = show ? '' : 'none';
                if (show) { 
                    if (link) slide.href = link; 
                    if (url) { 
                        const img = slide.querySelector('img'); 
                        if (img) img.src = url; 
                    } 
                }
            }
        };
        setupSlide('skin_race', menuContent.skin_race_enabled, menuContent.menu_banner_url);
        setupSlide('auction', menuContent.auction_enabled, menuContent.auction_banner_url || (menuContent.auction_slide_data ? menuContent.auction_slide_data.image_url : null), '/auction');
        setupSlide('checkpoint', menuContent.checkpoint_enabled, menuContent.checkpoint_banner_url);
    }

    const eventSlide = document.querySelector('[data-event="cauldron"]');
    if (eventSlide && data.cauldron) { 
        const show = data.cauldron.is_visible_to_users || userData.is_admin; 
        eventSlide.style.display = show ? '' : 'none'; 
        if (show && data.cauldron.banner_image_url) {
            eventSlide.querySelector('img').src = data.cauldron.banner_image_url;
        }
    }

    updateShortcutStatuses(userData, allQuests);
    updateShopTile(userData.active_trade_status || 'none');
    }
    
// ================================================================
// 1В1 ЛОГИКА КЕЙСОВ ИЗ SHOP.HTML
// ================================================================

window.openFolder = function(id) {
    loadCategory(id);
};

function formatItemName(name) {
    const splitIndex = name.indexOf('(');
    if (splitIndex !== -1) {
        const mainPart = name.substring(0, splitIndex).trim();
        const subPart = name.substring(splitIndex).trim();
        return `${escapeHTML(mainPart)}<span class="item-subtitle" style="display:block; margin-top:2px; font-size:10px; color:var(--primary-color);">${escapeHTML(subPart)}</span>`;
    }
    return escapeHTML(name);
}

async function loadCategory(catId, preloadedData = null) {
    window.currentCategoryId = catId; // 🔥 ЗАПОМИНАЕМ, что сейчас открыто
    const container = document.getElementById('shop-grid');
    if (!container) return;

    let hasCachedData = false;

    // 1. МОМЕНТАЛЬНЫЙ РЕНДЕР: Ищем данные в оперативной памяти или localStorage
    if (preloadedData) {
        itemsCache[catId] = preloadedData;
        renderItems(preloadedData);
        hasCachedData = true;
    } else if (itemsCache[catId]) {
        renderItems(itemsCache[catId]);
        hasCachedData = true;
    } else {
        // Достаем из жесткого кэша браузера
        const localCache = JSON.parse(localStorage.getItem('shop_items_cache') || '{}');
        if (localCache[catId] && localCache[catId].length > 0) {
            itemsCache[catId] = localCache[catId];
            renderItems(localCache[catId]);
            hasCachedData = true;
        }
    }

    // 2. ПОКАЗЫВАЕМ СКЕЛЕТОНЫ (Только если юзер зашел вообще в первый раз в жизни)
    if (!hasCachedData) {
        container.innerHTML = Array(6).fill('<div class="shop-item skeleton" style="height: 180px; background: transparent; border-radius: 12px; animation: pulse 1.5s infinite;"></div>').join('');
    }

    // 3. ФОНОВОЕ ОБНОВЛЕНИЕ: Тихо идем на сервер за свежими ценами и наличием
    try {
        // isSilent = true, чтобы экран не перекрывался серым лоадером
        const items = await makeApiRequest(`/api/v1/shop/goods?category_id=${catId}`, {}, 'GET', true);
        
        // Если юзер еще не переключил вкладку, пока шел запрос
        if (window.currentCategoryId === catId) {
            itemsCache[catId] = items;
            
            // Записываем свежие данные в localStorage для следующего раза
            const newShopCache = JSON.parse(localStorage.getItem('shop_items_cache') || '{}');
            newShopCache[catId] = items;
            localStorage.setItem('shop_items_cache', JSON.stringify(newShopCache));

            // Перерисовываем актуальные данные (юзер этого почти не заметит, разве что изменится цена)
            renderItems(items); 
        }
    } catch (e) {
        console.warn("Фоновое обновление кейсов не удалось:", e);
        // Показываем ошибку только если у нас вообще нет никаких данных (даже кэша)
        if (!hasCachedData) {
            container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#ff3b30; padding: 20px;">Ошибка загрузки</div>';
        }
    }
}

// ================================================================
// ФУНКЦИЯ ДЛЯ КРАСИВОГО ДИАЛОГА КУПОННОГО КЕЙСА
// ================================================================
window.showCouponCaseInfo = function(caseName) {
    showShopModal({
        title: "🎟️ Купонный кейс",
        subtitle: `<b>"${caseName}"</b> невозможно купить за обычные монеты или билеты.<br><br>Он выдается <b>исключительно</b> во время стримов, на специальных ивентах, аукционах или лично от Валька в виде промокодов!<br><br>Следите за трансляциями, чтобы забрать его бесплатно.`,
        confirmText: "ПОНЯТНО",
        confirmClass: "btn-purple-modal", // Если такого класса нет, будет просто обычная кнопка
        showCancel: false,
        onConfirm: (close) => close()
    });
};

function renderItems(items) {
    const container = document.getElementById('shop-grid');
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#888; padding: 20px;">Пусто</div>';
        return;
    }

    // 🔥 ДОБАВЛЕНА СОРТИРОВКА
    // Проверяем, есть ли сейчас бесплатные купонные кейсы
    const hasFreeCoupon = items.some(i => parseFloat(i.price) === 9999 && window.activeFreeCases.includes(i.name));

    items.sort((a, b) => {
        if (a.is_folder && !b.is_folder) return -1;
        if (!a.is_folder && b.is_folder) return 1;
        const priceA = parseFloat(a.price) || 0;
        const priceB = parseFloat(b.price) || 0;
        
        // Если есть халява — кидаем 9999 наверх (-1), иначе вниз (1) как было раньше
        if (priceA === 9999 && priceB !== 9999) return hasFreeCoupon ? -1 : 1;
        if (priceA !== 9999 && priceB === 9999) return hasFreeCoupon ? 1 : -1;
        
        return priceA - priceB;
    });

    const fragment = document.createDocumentFragment();
    let couponHeaderAdded = false;
    let regularHeaderAdded = false; // 🔥 Флаг для разделителя основных кейсов

    // 🔥 РАСЧЕТ ТРАСТ-ФАКТОРА
    const trustLevel = userData.trust_level || 'gray';
    let trustMultiplier = 2;
    if (trustLevel === 'green') trustMultiplier = 1;
    else if (trustLevel === 'red') trustMultiplier = 3;

    const multiplierBadgeCoins = trustMultiplier > 1 
        ? `<span style="position: absolute; top: 3px; right: 3px; background: rgba(255,255,255,0.7); color: #000; padding: 1px 3px; border-radius: 3px; font-size: 8px; font-weight: 900; line-height: 1; border: 1px solid rgba(0,0,0,0.15);">x${trustMultiplier}</span>` 
        : '';
        
    const multiplierBadgeTickets = trustMultiplier > 1 
        ? `<span style="position: absolute; top: 3px; right: 3px; background: rgba(0,0,0,0.4); color: #fff; padding: 1px 3px; border-radius: 3px; font-size: 8px; font-weight: 900; line-height: 1; border: 1px solid rgba(255,255,255,0.1);">x${trustMultiplier}</span>` 
        : '';

    items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'shop-item';
        
        // ВОЗВРАЩАЕМ СТАРЫЙ ВИЗУАЛ
        el.style.background = 'transparent'; 
        el.style.boxShadow = 'none';
        el.style.border = 'none';
        
        // 🔥 ПОЧИНКА: Возвращаем скрытие лишнего (neat look) и бронируем место сверху
        el.style.paddingTop = '32px'; // Увеличили чуть-чуть, чтобы тексту было просторно
        el.style.position = 'relative';
        el.style.overflow = 'hidden'; // ВЕРНУЛИ HIDDEN: теперь края карточки снова четкие

        let buttonHtml = '';
        const upperName = (item.name || "").toUpperCase();
        const isCase = upperName.includes("КЕЙС |") || upperName.includes("CASE |");
        const safeName = item.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeImg = item.image_url || "";
        const cleanName = item.name.replace(/^(Кейс|Case)\s*\|\s*/i, '').trim();

        const originalPrice = parseFloat(item.price) || 0;
        const displayPrice = originalPrice * trustMultiplier;
        const displayPriceTickets = (originalPrice * 2) * trustMultiplier;

        // ЗАГОЛОВОК КУПОННЫХ КЕЙСОВ
        if (originalPrice === 9999 && !couponHeaderAdded && !item.is_folder) {
            const headerEl = document.createElement('div');
            headerEl.style.cssText = "grid-column: 1 / -1; margin: 25px 0 10px 0; display: flex; align-items: center; justify-content: center; gap: 15px;";
            headerEl.innerHTML = `
                <div style="flex-grow: 1; height: 1px; background: linear-gradient(to right, transparent, rgba(145, 70, 255, 0.5));"></div>
                <span style="font-size: 16px; font-weight: 900; color: #fff; text-transform: uppercase; letter-spacing: 1px; text-shadow: 0 0 15px rgba(145, 70, 255, 0.6);">🎟️ Купонные кейсы</span>
                <div style="flex-grow: 1; height: 1px; background: linear-gradient(to left, transparent, rgba(145, 70, 255, 0.5));"></div>
            `;
            fragment.appendChild(headerEl);
            couponHeaderAdded = true;
        }

        // 🔥 СТЕНА-РАЗДЕЛИТЕЛЬ ДЛЯ ОСНОВНЫХ КЕЙСОВ (без коробки)
        if (hasFreeCoupon && originalPrice !== 9999 && !item.is_folder && !regularHeaderAdded) {
            const sepEl = document.createElement('div');
            sepEl.style.cssText = "grid-column: 1 / -1; margin: 30px 0 10px 0; display: flex; align-items: center; justify-content: center; gap: 15px;";
            sepEl.innerHTML = `
                <div style="flex-grow: 1; height: 1px; background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.15));"></div>
                <span style="font-size: 14px; font-weight: 800; color: #8e8e93; text-transform: uppercase; letter-spacing: 1px;">Основные кейсы</span>
                <div style="flex-grow: 1; height: 1px; background: linear-gradient(to left, transparent, rgba(255, 255, 255, 0.15));"></div>
            `;
            fragment.appendChild(sepEl);
            regularHeaderAdded = true;
        }

        if (item.is_folder) {
            el.innerHTML = `
                <div class="item-title" style="position: absolute; top: -7px; left: 50%; transform: translateX(-50%); width: max-content; font-size: 13px; font-weight: 800; color: #fff; text-align: center; white-space: nowrap; z-index: 10;">${escapeHTML(cleanName)}</div>
                <div class="item-image-wrapper" onclick="openFolder(${item.id})" style="width: 100%; padding-top: 100%; position: relative; background: transparent; cursor: pointer;">
                    <img src="${safeImg}" class="item-image" loading="lazy" onload="this.classList.add('loaded')" style="position: absolute; top: 10%; left: 10%; width: 80%; height: 80%; object-fit: contain; opacity: 0; transition: opacity 0.3s;">
                </div>
                <div class="item-info" style="padding: 10px; display: flex; flex-direction: column; flex-grow: 1; gap: 4px; text-align: center; z-index: 8;">
                    <button class="action-btn btn-folder" onclick="openFolder(${item.id})" style="background: rgba(255, 255, 255, 0.1); color: #fff; width: 100%; height: 34px; min-height: 34px; flex-shrink: 0; margin-top: auto; border: none; border-radius: 8px; font-weight: 600; font-size: 11px;">Открыть <i class="fa-solid fa-chevron-right" style="font-size:10px; margin-left:3px;"></i></button>
                </div>
            `;
       } else if (isCase) {
            let showFreeButton = window.activeFreeCases.includes(item.name);
            
            if (showFreeButton) {
                buttonHtml = `<div class="case-buttons-container" style="display:flex; width:100%; height:35px; align-items:center; justify-content:center;">
                    <button class="action-btn btn-buy" onclick="openCase(${item.id}, ${originalPrice}, '${safeName}', '${safeImg}', 'coins')" style="background: transparent; color: #34c759; text-shadow: 0 0 10px rgba(52, 199, 89, 0.9), 0 0 20px rgba(52, 199, 89, 0.4); width: 100%; height: 100%; border: none; border-radius: 12px; font-weight: 900; font-size: 13px; display: flex; align-items: center; justify-content: center; text-transform: uppercase; cursor: pointer; outline: none; transition: transform 0.2s ease;">БЕСПЛАТНО</button>
                </div>`;
            } else if (originalPrice === 9999) {
                buttonHtml = `<div class="case-buttons-container" style="display:flex; width:100%; height:35px; align-items:center; justify-content:center;">
                    <button class="action-btn" onclick="showCouponCaseInfo('${safeName}')" style="background: rgba(145, 70, 255, 0.1); color: #9146FF; border: 1px solid rgba(145, 70, 255, 0.4); width: 100%; height: 100%; border-radius: 12px; font-weight: 900; font-size: 11px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-transform: uppercase; cursor: pointer; transition: 0.2s ease;"><i class="fa-solid fa-lock" style="font-size: 14px; margin-bottom: 2px;"></i>КУПОННЫЙ</button>
                </div>`;
            } else {
                buttonHtml = `<div class="case-buttons-container" style="display:flex; flex-direction:column; gap:6px; width:100%;">
                    <button class="action-btn btn-buy" onclick="openCase(${item.id}, ${originalPrice}, '${safeName}', '${safeImg}', 'coins')" style="position: relative; background: linear-gradient(135deg, #ffd700 0%, #ffaa00 100%); color: #000; box-shadow: 0 2px 10px rgba(255, 204, 0, 0.2); width: 100%; height: 32px; min-height: 32px; flex-shrink: 0; border: none; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 2px; transition: transform 0.1s;"><span style="font-size: 13px; font-weight: 900; margin-top: 1px;">${displayPrice}</span><i class="fa-solid fa-coins" style="font-size: 11px; color: #000 !important; filter: drop-shadow(0 1px 1px rgba(255,255,255,0.3));"></i>${multiplierBadgeCoins}</button>
                    <button class="action-btn btn-buy-tickets" onclick="openCase(${item.id}, ${originalPrice * 2}, '${safeName}', '${safeImg}', 'tickets')" style="position: relative; background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%); color: #fff; box-shadow: 0 2px 10px rgba(37, 117, 252, 0.2); width: 100%; height: 32px; min-height: 32px; flex-shrink: 0; border: none; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 2px; transition: transform 0.1s;"><span style="font-size: 13px; font-weight: 900; margin-top: 1px;">${displayPriceTickets}</span><i class="fa-solid fa-ticket" style="font-size: 11px; color: #fff; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.3));"></i>${multiplierBadgeTickets}</button>
                </div>`;
            }
            
            const contentsPriceParam = originalPrice === 9999 ? 'null' : displayPrice;

            el.innerHTML = `
                <div class="item-title case-top-title" style="position: absolute; top: 5px; left: 50%; transform: translateX(-50%); z-index: 1; white-space: nowrap; pointer-events: none; width: auto !important; max-width: 95% !important; padding: 2px 8px !important; font-weight: 800; color: #fff; text-align: center; text-transform: uppercase; background: transparent !important;">${formatItemName(cleanName)}</div>
                <div class="item-image-wrapper case-img-wrap" onclick="openCaseContents(event, '${safeName}', ${contentsPriceParam})" style="background: transparent; padding-top: 80%;">
                    <div class="case-info-overlay"><span>Посмотреть дроп</span></div>
                    <img src="${safeImg}" class="item-image case-zoom" loading="lazy" onload="this.classList.add('loaded')">
                </div>
                <div class="item-info" style="padding: 0 10px 10px 10px; flex-grow: 0;">${buttonHtml}</div>
            `;
        } else {
            let stockText = item.count === null ? '∞ шт.' : `${item.count} шт.`;
            let btnHtml = item.count === 0 
                ? `<button class="action-btn btn-disabled" disabled style="background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.3); width: 100%; height: 32px; min-height: 32px; flex-shrink: 0; margin-top: auto; border: none; border-radius: 8px; font-weight: 600; font-size: 11px;">Раскуплено</button>`
                : `<button class="action-btn btn-buy" onclick="buyItem(${item.id}, ${originalPrice}, '${safeName}', '${safeImg}')" style="position: relative; background: linear-gradient(135deg, #ffd700 0%, #ffaa00 100%); color: #000; box-shadow: 0 2px 10px rgba(255, 204, 0, 0.2); width: 100%; height: 32px; min-height: 32px; flex-shrink: 0; margin-top: auto; border: none; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 2px; transition: transform 0.1s;"><span style="font-size: 13px; font-weight: 900; margin-top: 1px;">${displayPrice}</span><i class="fa-solid fa-coins" style="font-size: 11px; color: #000 !important; filter: drop-shadow(0 1px 1px rgba(255,255,255,0.3));"></i>${multiplierBadgeCoins}</button>`;
            
            el.innerHTML = `
                <div class="item-title" style="position: absolute; top: 4px; left: 50%; transform: translateX(-50%); width: max-content; font-size: 11px; font-weight: 600; color: #fff; text-align: center; white-space: nowrap; z-index: 10;">${formatItemName(cleanName)}</div>
                <div class="item-image-wrapper" onclick="openCaseContents(event, '${safeName}')" style="width: 100%; padding-top: 100%; position: relative; background: transparent; cursor: pointer;">
                    <img src="${safeImg}" class="item-image" loading="lazy" onload="this.classList.add('loaded')" style="position: absolute; top: 10%; left: 10%; width: 80%; height: 80%; object-fit: contain; opacity: 0; transition: opacity 0.3s;">
                </div>
                <div class="item-info" style="padding: 10px; display: flex; flex-direction: column; flex-grow: 1; gap: 4px; text-align: center; z-index: 8;">
                    <div class="item-meta" style="display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 10px; margin-bottom: 6px;">
                        <div class="item-stock" style="color: #8E8E93;">${stockText}</div>
                    </div>
                    ${btnHtml}
                </div>
            `;
        }
        fragment.appendChild(el);
    });
    
    container.appendChild(fragment);

    // 🔥 ВОЗВРАЩАЕМ АВТО-УМЕНЬШЕНИЕ ТЕКСТА 🔥
    container.querySelectorAll('.case-top-title').forEach(title => {
        let fontSize = 10; // Начинаем с 10px (как у всех остальных)
        // Если текст не влезает, уменьшаем его вплоть до 5px
        while (title.scrollWidth > title.offsetWidth && fontSize > 5) {
            fontSize -= 0.5;
            title.style.fontSize = fontSize + 'px';
        }
    });
} // 🔥 <--- ДОБАВЬ ВОТ ЭТУ СКОБКУ! ОНА ЗАКРЫВАЕТ ФУНКЦИЮ renderItems

async function validateUserTradeLink() {
    const loader = document.getElementById('purchase-loader');
    if (loader) { loader.querySelector('.loader-text').innerText = "Проверка профиля..."; loader.classList.add('active'); }
    try {
        const res = await makeApiRequest('/api/v1/user/me', {}, 'POST', true);
        const tLink = (res && res.trade_link) ? res.trade_link : "";
        if (!tLink.includes("partner=") || !tLink.includes("token=")) {
            Telegram.WebApp.showPopup({ title: '❌ Нет трейд-ссылки', message: 'Зайдите в Профиль и привяжите Trade-ссылку Steam!', buttons: [{ id: 'ok', type: 'default', text: 'Понятно' }] });
            return false; 
        }
        return true; 
    } catch(e) { return false; } finally { if (loader) loader.classList.remove('active'); }
}

window.openCase = async function(id, price, name, imageUrl, currency = 'coins') {
    const isLinkValid = await validateUserTradeLink();
    if (!isLinkValid) return; 

    // 🔥 РАСЧЕТ НАЦЕНКИ ДЛЯ ДИАЛОГА И ВИЗУАЛЬНОГО СПИСАНИЯ 🔥
    const trustLevel = userData.trust_level || 'gray';
    let trustMultiplier = 2; // Дефолт (Серый)
    if (trustLevel === 'green') trustMultiplier = 1;
    else if (trustLevel === 'red') trustMultiplier = 3;

    // Итоговая цена для показа пользователю
    const displayPrice = price * trustMultiplier;

    // 1. ПРОВЕРКА ЧЕРЕЗ ГЛОБАЛЬНЫЙ МАССИВ (СИНХРОНИЗАЦИЯ С БД)
    let isFreeOpen = window.activeFreeCases.includes(name);
    
    // Флаг для бэкенда, чтобы он понял: код вводить не надо, чекай базу по ID
    let activeCoupon = isFreeOpen ? "FREE_BY_ID" : null;
    
    // Формируем сообщение (ПОКАЗЫВАЕМ УМНОЖЕННУЮ ЦЕНУ)
    let confirmMsg = isFreeOpen 
        ? `Использовать активный купон и открыть "${name}" БЕСПЛАТНО?`
        : `Открыть "${name}" за ${displayPrice} ${currency === 'coins' ? '🟡' : '🎟️'}?`;

    customConfirm(confirmMsg, async (ok) => {
        if (!ok) return;
        const loader = document.getElementById('purchase-loader');
        if (loader) { loader.querySelector('.loader-text').innerText = "Крутим барабан..."; loader.classList.add('active'); }

        // ⚡ ОПТИМИСТИЧНОЕ СПИСАНИЕ БАЛАНСА (С УЧЕТОМ НАЦЕНКИ)
        // Списываем баланс ТОЛЬКО если НЕТ КУПОНА
        if (!activeCoupon) {
            const balanceEl = currency === 'coins' ? document.getElementById('user-balance') : document.getElementById('ticketStats');
            let currentVisualBalance = 0;
            if (balanceEl) {
                // Убираем пробелы и парсим число
                currentVisualBalance = parseInt(balanceEl.textContent.replace(/\s/g, '')) || 0;
                
                // Если монет визуально не хватает — тормозим сразу
                if (currentVisualBalance < displayPrice) {
                    if (loader) loader.classList.remove('active');
                    return customAlert(`Недостаточно средств! Цена для вас: ${displayPrice}`);
                }

                // Списываем УМНОЖЕННУЮ сумму, чтобы не было визуальных скачков
                renderBalanceUI(
                    // Убрали умножение на 100!
                    currency === 'coins' ? (currentVisualBalance - displayPrice) : undefined, 
                    currency === 'tickets' ? (currentVisualBalance - displayPrice) : undefined
                );
            }
        }

        try {
            // Формируем нагрузку для покупки (ПЕРЕДАЕМ БАЗОВУЮ ЦЕНУ, БЭК УМНОЖИТ САМ)
            const buyPayload = { item_id: id, price: price, title: name, image_url: imageUrl, currency: currency };
            // Если есть купон — отправляем его на бэкенд
            if (activeCoupon) {
                buyPayload.coupon_code = activeCoupon;
            }

            // Параллельно запускаем запрос на содержимое кейса и покупку (ТУТ ТЕПЕРЬ V2)
            const contentsPromise = makeApiRequest(`/api/v1/shop/case_contents?case_name=${encodeURIComponent(name)}`, {}, 'GET', true);
            const buyPromise = makeApiRequest('/api/v1/shop/buy', buyPayload, 'POST');
            
            const [contentsResp, resData] = await Promise.all([contentsPromise, buyPromise]);
            const possibleItems = (contentsResp && contentsResp.length > 0) ? contentsResp : [{ name: "Mystery Item", image_url: imageUrl, rarity: "common" }];

            let winner = resData.winner || { name: "Ошибка", image_url: imageUrl, rarity: 'common' };

            let strip = [];
            for(let i=0; i<80; i++) strip.push(possibleItems[Math.floor(Math.random() * possibleItems.length)]);
            strip[60] = winner; 

            launchRoulette(strip, winner, resData.messages || [], resData.lacky, name);
             // 2. 🔥 ВОТ СЮДА СТАВИМ ЭТОТ БЛОК 🔥
            if (isFreeOpen) {
                // Удаляем кейс из локального списка "активных халяв", чтобы кнопка сразу поменялась
                window.activeFreeCases = window.activeFreeCases.filter(n => n !== name);
                
                // Перерисовываем визуал магазина (теперь кнопки станут платными)
                // Используем текущую категорию (у тебя это 2716312 или динамическая переменная)
                renderItems(itemsCache[currentCategoryId] || []); 
            }

            // Синхронизируем реальный баланс в фоне
            checkBalance(true);
        } catch (err) { 
            // ⚡ ЕСЛИ ОШИБКА
            checkBalance(true); 
            
            // Здесь тоже исправляем ключ, чтобы битый купон не висел в памяти
            if (activeCoupon && err.message && (err.message.includes('закончились') || err.message.includes('использовали') || err.message.includes('Неверный'))) {
                localStorage.removeItem('active_coupon_data'); // Исправлено!
                loadCategory(2716312);
            }
        } finally { 
            if (loader) loader.classList.remove('active'); 
        }
    });
};

function launchRoulette(items, winner, extraMessages, lacky, rawCaseName) {
    const modal = document.getElementById('r-modal');
    const area = document.getElementById('r-area');
    const track = document.getElementById('r-track');
    const winScreen = document.getElementById('r-win');
    
    document.getElementById('r-case-name').innerText = (rawCaseName || "").replace(/^(Кейс|Case)\s*\|\s*/i, '').trim();
    
    const bottomProgress = document.getElementById('r-bottom-progress');

    // 🔥 СКРЫВАЕМ ПОЛОСКУ ГАРАНТА, ЕСЛИ БЭКЕНД ПРИСЛАЛ LACKY = 0 🔥
    if (!lacky || lacky === 0) {
        bottomProgress.style.display = 'none';
    } else {
        bottomProgress.style.display = 'flex';
        let currentLacky = lacky; 
        const dots = document.querySelectorAll('#r-bottom-progress .r-progress-dot');
        dots.forEach((dot, index) => {
            dot.className = 'r-progress-dot'; 
            if (index < currentLacky) { dot.classList.add('active'); if (index === 4 && currentLacky === 5) dot.classList.add('guaranteed'); }
        });

        const progressTextEl = document.getElementById('r-progress-text');
        if (currentLacky === 5) progressTextEl.innerHTML = '<span style="color: #ffcc00; font-size: 11px;">🔥 ГАРАНТ АКТИВЕН 🔥</span>';
        else progressTextEl.innerHTML = `Осталось <span style="color: #fff; font-weight: 800;">${5 - currentLacky}</span> до гаранта`;
    }

    document.getElementById('r-top-header').style.display = 'flex';

    track.style.transition = 'none'; track.style.transform = 'translateX(0)';
    area.style.display = 'block'; winScreen.style.display = 'none'; modal.style.display = 'flex';

    track.innerHTML = items.map(item => {
        let rClass = 'r-common'; const r = (item.rarity || 'common').toLowerCase();
        if (r.includes('blue') || r.includes('rare')) rClass = 'r-blue';
        else if (r.includes('purple') || r.includes('mythical')) rClass = 'r-purple';
        else if (r.includes('pink') || r.includes('legendary')) rClass = 'r-pink';
        else if (r.includes('red') || r.includes('ancient')) rClass = 'r-red';
        else if (r.includes('gold')) rClass = 'r-gold';
        return `<div class="r-card ${rClass}"><img src="${item.image_url}"><div class="r-card-name">${item.name.split('|').pop().trim()}</div></div>`;
    }).join('');

    setTimeout(() => {
        const ANIMATION_TIME = 11000;
        const finalPosition = -((60 * 148) + 74 - (window.innerWidth / 2) + ((Math.random() * 100) - 50));
        track.style.transition = `transform ${ANIMATION_TIME}ms cubic-bezier(0.15, 0, 0.05, 1)`; 
        track.style.transform = `translateX(${finalPosition}px)`;
        
        let tickInterval = 50, timer = 0;
        const haptic = window.Telegram?.WebApp?.HapticFeedback;
        const ticker = () => {
            if (timer >= ANIMATION_TIME - 300) return; 
            if (haptic) haptic.selectionChanged();
            timer += tickInterval;
            if (timer < ANIMATION_TIME * 0.6) tickInterval = 50; else if (timer < ANIMATION_TIME * 0.8) tickInterval = 120; else tickInterval += 50; 
            setTimeout(ticker, tickInterval);
        };
        ticker();

        setTimeout(() => {
            if (haptic) { haptic.impactOccurred('heavy'); setTimeout(() => haptic.notificationOccurred('success'), 800); }
            area.style.display = 'none'; 
            winScreen.innerHTML = `
                <h2 style="color:#ffcc00; margin-bottom:10px; text-transform:uppercase; text-shadow:0 0 20px rgba(255,215,0,0.5);">ВЫПАЛО!</h2>
                <img src="${winner.image_url}" class="win-img">
                <h3 style="color:#fff; margin-top:15px; margin-bottom: 20px; font-weight: 700;">${winner.name}</h3>
                <button class="action-btn btn-buy" style="width: 220px; height: 48px; font-size: 14px; margin-bottom: 10px;" onclick="claimItem(${winner.id})">ЗАБРАТЬ В STEAM</button>
                <button class="action-btn" style="background: linear-gradient(135deg, #6a11cb, #2575fc); color: #fff; width: 220px; height: 44px; margin-bottom: 15px;" onclick="sellForTickets(${winner.id}, ${winner.price || 0})">ПРОДАТЬ ЗА ${winner.price || 0} 🎟️</button>
                <button class="action-btn btn-secondary-action" style="width: 220px;" onclick="closeRoulette()">Закрыть</button>
            `;
            winScreen.style.display = 'flex'; 
        }, ANIMATION_TIME); 
    }, 100);
}
window.closeRoulette = function() {
    document.getElementById('r-modal').style.display = 'none';
    document.getElementById('r-top-header').style.display = 'none';
    document.getElementById('r-bottom-progress').style.display = 'none';
    checkBalance(true);
}

// ================================================================
// ВЫВОД, ПРОДАЖА И ЗАМЕНА
// ================================================================

window.toggleCaseFaq = function() {
    const content = document.getElementById('case-faq-content');
    const icon = document.getElementById('case-faq-icon');
    if (content.style.display === 'none') {
        content.style.display = 'flex';
        icon.style.transform = 'rotate(180deg)';
    } else {
        content.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
    }
};

window.claimItem = async function(itemId) {
    showShopModal({ title: "Вывести в Steam?", subtitle: "Ожидайте трейд в течение 30 минут.", confirmText: "ЗАБРАТЬ", confirmClass: "btn-yellow-modal", onConfirm: async (closeModal) => {
        const loader = document.getElementById('purchase-loader'); 
        const loaderText = loader ? loader.querySelector('.loader-text') : null;
        
        if (loader && loaderText) { 
            loader.classList.add('active'); 
            loaderText.innerText = "Подключаемся к продавцу..."; 
            
            // 🔥 Делаем лоадер "живым" 🔥
            setTimeout(() => { if (loader.classList.contains('active')) loaderText.innerText = "Ищем лучшую цену..."; }, 4000);
            setTimeout(() => { if (loader.classList.contains('active')) loaderText.innerText = "Вспоминаем про промокод HATElove на сайте topskin..."; }, 9000);
            setTimeout(() => { if (loader.classList.contains('active')) loaderText.innerText = "Почти готово..."; }, 14000);
        }
        try {
            const res = await makeApiRequest('/api/v1/user/inventory/withdraw', { history_id: itemId }, 'POST');
            if (res && res.status === 'offer_replacement') { closeModal(); if (loader) loader.classList.remove('active'); showReplacementChoice(res.options, itemId); return; }
            if (res) customAlert(`✅ Успешно! Ожидайте трейд.`);
            closeModal(); closeRoulette();
        } catch (e) { closeModal(); } finally { if (loader) loader.classList.remove('active'); }
    }});
}

window.sellForTickets = function(itemId, price) {
    showShopModal({ 
        title: `Продать за ${price} 🎟️?`, 
        subtitle: "Билеты начислятся моментально.", 
        confirmText: "ПРОДАТЬ", 
        confirmClass: "btn-purple-modal", 
        onConfirm: async (closeModal) => {
            const loader = document.getElementById('purchase-loader'); 
            if (loader) { 
                loader.classList.add('active'); 
                loader.querySelector('.loader-text').innerText = "Продаем..."; 
            }
            
            // ⚡ ОПТИМИСТИЧНОЕ НАЧИСЛЕНИЕ БИЛЕТОВ (ДО ЗАПРОСА)
            const ticketsEl = document.getElementById('ticketStats');
            if (ticketsEl) {
                const currentTickets = parseInt(ticketsEl.textContent.replace(/\s/g, '')) || 0;
                renderBalanceUI(undefined, currentTickets + price);
            }

            try {
                await makeApiRequest('/api/v1/user/inventory/sell', { history_id: itemId }, 'POST');
                customAlert(`Успешно! +${price} билетов.`); 
                closeModal(); 
                closeRoulette(); 
                checkBalance(true); // Синхронизируем реальный баланс в фоне
            } catch (e) { 
                checkBalance(true); // Если ошибка - откатываем визуальный баланс назад
                closeModal(); 
            } finally { 
                if (loader) loader.classList.remove('active'); 
            }
        }
    });
}
window.openCaseContents = async function(event, caseName, casePriceCoins) {
    if (event) event.stopPropagation();
    
    const modal = document.getElementById('case-contents-modal'); 
    const list = document.getElementById('case-items-list'); 
    const loader = document.getElementById('contents-loader');
    
    let statsBlock = document.getElementById('case-stats-block');
    if (!statsBlock) {
        statsBlock = document.createElement('div');
        statsBlock.id = 'case-stats-block';
        list.parentNode.insertBefore(statsBlock, list);
    }

    modal.classList.remove('hidden'); 
    loader.style.display = 'block'; 
    list.innerHTML = '';
    statsBlock.innerHTML = '';

    try {
        const data = await makeApiRequest(`/api/v1/shop/case_contents?case_name=${encodeURIComponent(caseName)}`, {}, 'GET', true);
        
        data.sort((a,b) => (parseFloat(b.price_rub) || 0) - (parseFloat(a.price_rub) || 0));

        let totalWeight = 0;
        let goodDropWeight = 0;
        
        data.forEach(item => {
            const itemPriceRub = parseFloat(item.price_rub) || 0;
            const weight = parseFloat(item.chance_weight) || 0;
            totalWeight += weight;
            
            // Считаем хорошим скином тот, что дает хотя бы 40% от стоимости
            if (casePriceCoins && itemPriceRub >= (casePriceCoins * 0.4)) {
                goodDropWeight += weight;
            }
        });

        let profitChance = 0;
        if (totalWeight > 0) {
            profitChance = ((goodDropWeight / totalWeight) * 100).toFixed(1);
        }
        
        // 🔥 ДОБАВЛЯЕМ ЛОГИКУ ВИЗУАЛА ДЛЯ КУПОННЫХ КЕЙСОВ 🔥
        let priceDisplayHtml = casePriceCoins 
            ? `${casePriceCoins} <i class="fa-solid fa-coins" style="color: #ffd700; font-size: 15px;"></i>` 
            : `<span style="font-size: 14px; font-weight: 900; color: #9146FF; text-shadow: 0 0 10px rgba(145,70,255,0.4);"><i class="fa-solid fa-lock"></i> КУПОН</span>`;
            
        let chanceDisplayHtml = casePriceCoins
            ? `<div style="font-size: 18px; font-weight: 900; color: ${profitChance > 15 ? '#34c759' : '#ffcc00'};">${profitChance}%</div>`
            : `<div style="font-size: 18px; font-weight: 900; color: #8e8e93;">--</div>`;
        
        // Рендерим плашку с оптимизированным спойлером и премиальными иконками монет
        statsBlock.innerHTML = `
            <div style="background: rgba(255, 255, 255, 0.05); padding: 12px; border-radius: 12px; border: 1px solid rgba(255, 215, 0, 0.2); margin-bottom: 16px;">
                
                <div style="display: flex; justify-content: space-around; align-items: center;">
                    <div style="text-align: center;">
                        <div style="font-size: 10px; color: #8e8e93; text-transform: uppercase; margin-bottom: 4px;">Шанс на хороший скин</div>
                        ${chanceDisplayHtml}
                    </div>
                    <div style="width: 1px; height: 30px; background: rgba(255,255,255,0.1);"></div>
                    <div style="text-align: center;">
                        <div style="font-size: 10px; color: #8e8e93; text-transform: uppercase; margin-bottom: 4px;">Цена кейса</div>
                        <div style="font-size: 18px; font-weight: 900; color: #fff; display: flex; align-items: center; justify-content: center; gap: 5px;">
                            ${priceDisplayHtml}
                        </div>
                    </div>
                </div>

                <div style="margin-top: 12px; background: rgba(0, 0, 0, 0.25); border-radius: 8px; overflow: hidden;">
                    <div onclick="toggleCaseFaq()" style="padding: 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
                        <div style="font-size: 11px; font-weight: 800; color: #ffd700; text-transform: uppercase; letter-spacing: 0.5px;">
                            <i class="fa-solid fa-circle-info" style="margin-right: 4px;"></i> Важно знать
                        </div>
                        <i id="case-faq-icon" class="fa-solid fa-chevron-down" style="color: #8e8e93; font-size: 10px; transition: transform 0.2s;"></i>
                    </div>
                    
                    <div id="case-faq-content" style="display: none; flex-direction: column; gap: 8px; padding: 0 10px 10px 10px; font-size: 10px; color: #ccc; line-height: 1.4;">
                        <div style="display: flex; align-items: flex-start; gap: 6px;">
                            <i class="fa-solid fa-circle-exclamation" style="color: #ffd700; font-size: 10px; margin-top: 2px;"></i>
                            <span><b>Окупаемость:</b> Считается строго от цены кейса в монетах (<i class="fa-solid fa-coins" style="color: #ffd700;"></i>).</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; gap: 6px;">
                            <i class="fa-solid fa-ticket" style="color: #2AABEE; font-size: 10px; margin-top: 2px;"></i>
                            <span><b>Билеты (🎟️):</b> Валюта вашей активности. Скины на неё не равняются, и окуп по ним не считается.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; gap: 6px;">
                            <i class="fa-solid fa-shield-halved" style="color: #34c759; font-size: 10px; margin-top: 2px;"></i>
                            <span><b>Система Гаранта:</b> Работает <b>только</b> при открытии за монеты (<i class="fa-solid fa-coins" style="color: #ffd700;"></i>). На 5-е открытие убираются дешёвые предметы. При открытии за билеты гаранта нет!</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; gap: 6px;">
                            <i class="fa-solid fa-gift" style="color: #ff9500; font-size: 10px; margin-top: 2px;"></i>
                            <span><b>Бесплатный проект:</b> Вы не тратите реальные деньги. Баланс настроен так, чтобы проект мог существовать и радовать вас дальше.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; gap: 6px;">
                            <i class="fa-brands fa-steam" style="color: #8e8e93; font-size: 10px; margin-top: 2px;"></i>
                            <span><b>Цены:</b> Ориентировочные и могут незначительно отличаться от Торговой площадки Steam.</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Рендерим сами предметы (со "Светофором" и иконкой fa-coins)
        list.innerHTML = data.map(item => {
            let rClass = 'blue'; 
            const r = (item.rarity || '').toLowerCase();
            if (r.includes('purple')) rClass = 'purple'; 
            else if (r.includes('pink')) rClass = 'pink'; 
            else if (r.includes('red')) rClass = 'red'; 
            else if (r.includes('gold')) rClass = 'gold';

            const itemPriceRub = parseFloat(item.price_rub) || 0;
            
            // Логика "Светофора"
            let priceColor = '#ff3b30'; // Красный по умолчанию (Ширпотреб)
            let optStyle = '';

            if (casePriceCoins) {
                if (itemPriceRub > casePriceCoins) {
                    // Зеленый (Окуп)
                    priceColor = '#34c759';
                    optStyle = `border: 1px solid rgba(52, 199, 89, 0.4); background: rgba(52, 199, 89, 0.05);`;
                } else if (itemPriceRub >= (casePriceCoins * 0.5)) {
                    // Желтый (Нормальный возврат: от 50% стоимости кейса)
                    priceColor = '#ffcc00';
                    optStyle = `border: 1px solid rgba(255, 204, 0, 0.4); background: rgba(255, 204, 0, 0.05);`;
                }
            }

            return `
                <div class="content-item ${rClass}" style="position: relative; ${optStyle}">
                    <img src="${item.image_url}" loading="lazy">
                    <div class="content-name">${item.name.split('|').pop().trim()}</div>
                    <div class="content-quality">${item.condition || 'FN'}</div>
                    <div style="margin-top: 6px; font-size: 13px; font-weight: 800; color: ${priceColor}; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        ${itemPriceRub} <i class="fa-solid fa-coins" style="color: #ffd700; font-size: 12px;"></i>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (e) { 
        list.innerHTML = `<div style="text-align:center; grid-column:1/-1; color:#ff453a; padding: 20px;">Ошибка загрузки содержимого</div>`; 
    } finally { 
        loader.style.display = 'none'; 
    }
};

window.closeContentsModal = () => document.getElementById('case-contents-modal').classList.add('hidden');

window.showReplacementChoice = function(options, historyId) {
    const modal = document.getElementById('replacement-modal'); 
    const container = document.getElementById('replacement-options-list');
    
    container.innerHTML = options.map(item => {
        let r = (item.rarity || '').toLowerCase(), rClass = 'blue';
        if (r.includes('purple')) rClass = 'purple'; 
        else if (r.includes('pink')) rClass = 'pink'; 
        else if (r.includes('red')) rClass = 'red'; 
        else if (r.includes('gold')) rClass = 'gold';
        
        // Разбиваем имя на Тип (Наклейка/Граффити) и Название
        const parts = item.name_ru.split('|');
        const itemType = parts.length > 1 ? parts[0].trim() : ''; 
        const itemName = parts.length > 1 ? parts[1].trim() : item.name_ru;
        const safeFullName = item.name_ru.replace(/'/g, "");

        return `<div class="replacement-card ${rClass}" onclick="initiateReplacementConfirm(${historyId}, '${item.assetid}', '${safeFullName}')">
            <div class="replacement-image-wrapper">
                <img src="${item.icon_url}" loading="lazy">
            </div>
            <div class="replacement-text-zone">
                ${itemType ? `<div class="replacement-type">${escapeHTML(itemType)}</div>` : ''}
                <div class="replacement-name">${escapeHTML(itemName)}</div>
                <div class="replacement-condition">${escapeHTML(item.condition || '-')}</div>
            </div>
        </div>`;
    }).join('');
    
    modal.classList.remove('hidden');
}

window.closeReplacementModal = () => document.getElementById('replacement-modal').classList.add('hidden');

window.initiateReplacementConfirm = (historyId, assetid, itemName) => {
    showShopModal({ title: "Подтвердить выбор?", subtitle: `Вы выбрали "${itemName}". Трейд отправится моментально.`, confirmText: "ЗАБРАТЬ", confirmClass: "btn-yellow-modal", onConfirm: async (closeConfirm) => {
        const loader = document.getElementById('purchase-loader'); if (loader) loader.classList.add('active');
        try {
            const res = await makeApiRequest('/api/v1/user/inventory/confirm_replacement', { history_id: historyId, assetid: assetid }, 'POST');
            if (res.success) { customAlert("✅ Успешно! Проверьте Steam Трейды."); closeConfirm(); closeReplacementModal(); closeRoulette(); } 
            else { customAlert("❌ " + res.message); closeConfirm(); }
        } catch (e) { closeConfirm(); } finally { if (loader) loader.classList.remove('active'); }
    }});
}

// ================================================================
// P2P TRADE-IN ОБМЕН
// ================================================================
window.openP2PModal = async () => {
    document.getElementById('p2p-modal').classList.remove('hidden');
    document.getElementById('p2p-quantity').value = 1; document.getElementById('p2p-total').innerText = '0';
    const select = document.getElementById('p2p-case-select'); select.innerHTML = '<option value="">Загрузка...</option>';
    try {
        cachedP2PCases = await makeApiRequest('/api/v1/p2p/cases', {}, 'GET', true) || [];
        select.innerHTML = '<option value="">-- Нажми, чтобы выбрать кейс --</option>' + cachedP2PCases.map(item => `<option value="${item.id}" data-price="${item.price_in_coins}" data-image="${item.image_url}" data-name="${item.case_name.replace(/"/g, '&quot;')}">${item.case_name}</option>`).join('');
    } catch(e) { select.innerHTML = '<option value="">Ошибка загрузки</option>'; }
    loadP2PHistoryData();
}
window.closeP2PModal = () => document.getElementById('p2p-modal').classList.add('hidden');

window.calculateP2P = () => {
    const select = document.getElementById('p2p-case-select'); const quantityInput = document.getElementById('p2p-quantity');
    const previewCard = document.getElementById('case-preview');
    if (!select.value) { previewCard.classList.remove('visible'); setTimeout(() => { if(!previewCard.classList.contains('visible')) previewCard.style.display = 'none'; }, 300); document.getElementById('p2p-price-per-item').innerText = 0; document.getElementById('p2p-total').innerText = 0; return; }
    const opt = select.options[select.selectedIndex]; const price = parseInt(opt.dataset.price) || 0; const q = parseInt(quantityInput.value) || 0;
    document.getElementById('p2p-price-per-item').innerText = price; document.getElementById('p2p-total').innerText = price * q;
    previewCard.style.display = 'flex'; requestAnimationFrame(() => previewCard.classList.add('visible'));
    document.getElementById('preview-img').src = opt.dataset.image; document.getElementById('preview-name').innerText = opt.dataset.name; document.getElementById('preview-price-text').innerText = price;
}

window.createP2PTrade = async () => {
    const select = document.getElementById('p2p-case-select'); const quantity = parseInt(document.getElementById('p2p-quantity').value);
    if (!select.value || quantity <= 0) return customAlert("Выберите кейс и количество!");
    try {
        await makeApiRequest('/api/v1/p2p/create', { case_id: parseInt(select.value), quantity: quantity }, 'POST');
        customAlert("✅ Заявка создана! Ждите подтверждения админа.");
        select.value = ""; document.getElementById('p2p-quantity').value = 1; window.calculateP2P(); loadP2PHistoryData(); checkActiveTradesBackground();
    } catch(e) {}
}

window.openHistoryModal = () => { document.getElementById('history-modal-window').classList.add('active'); loadP2PHistoryData(); }
window.closeHistoryModal = () => document.getElementById('history-modal-window').classList.remove('active');

async function loadP2PHistoryData() {
    const listContainer = document.getElementById('full-history-list'); const smartBtn = document.getElementById('smart-history-btn'); const smartBtnText = document.getElementById('smart-btn-text'); const smartBtnIcon = smartBtn.querySelector('.btn-icon');
    if (document.getElementById('history-modal-window').classList.contains('active')) listContainer.innerHTML = '<div style="text-align:center; padding:20px; color:#666;"><i class="fa-solid fa-circle-notch fa-spin"></i> Загрузка...</div>';
    try {
        const trades = await makeApiRequest('/api/v1/p2p/my_trades', {}, 'POST', true);
        const priority = { 'active': 1, 'review': 2, 'pending': 3, 'completed': 4, 'canceled': 5 };
        trades.sort((a, b) => priority[a.status] - priority[b.status]);
        const activeTrade = trades.find(t => ['active', 'review', 'pending'].includes(t.status));

        if (activeTrade) {
            smartBtn.classList.add('active-trade');
            if (activeTrade.status === 'active') { smartBtnText.innerText = `🔥 ТРЕБУЕТ ДЕЙСТВИЯ`; smartBtnIcon.innerHTML = '<i class="fa-solid fa-fire"></i>'; } 
            else if (activeTrade.status === 'review') { smartBtnText.innerText = `👀 ПРОВЕРКА АДМИНОМ`; smartBtnIcon.innerHTML = '<i class="fa-solid fa-hourglass-half"></i>'; } 
            else { smartBtnText.innerText = `⏳ ОЖИДАНИЕ ЗАЯВКИ`; smartBtnIcon.innerHTML = '<i class="fa-regular fa-clock"></i>'; }
        } else { smartBtn.classList.remove('active-trade'); smartBtnText.innerText = 'История сделок'; smartBtnIcon.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i>'; }

        if (!trades || trades.length === 0) { listContainer.innerHTML = '<div style="text-align:center; margin-top:50px; color:#666;">История пуста</div>'; return; }
        listContainer.innerHTML = trades.map(t => {
            let caseName = t.case_name || (cachedP2PCases.find(c => c.id == t.case_id)?.case_name) || "Кейс #" + t.case_id;
            let statusBadge = '', actionHtml = '';
            switch(t.status) {
                case 'pending': statusBadge = '<span style="color:#aaa; background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px; font-size:10px;">⏳ Ожидание</span>'; break;
                case 'active': statusBadge = '<span style="color:#000; background:#ffcc00; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:bold;">🔥 Действуй</span>'; actionHtml = `<div style="margin-top:10px; background:rgba(255,204,0,0.1); padding:10px; border-radius:8px; border:1px dashed #ffcc00;"><div style="font-size:11px; color:#ccc; margin-bottom:8px;">1. Отправь трейд: <a href="${t.trade_url_given}" target="_blank" style="color:#2AABEE; font-weight:bold;">Открыть Steam</a></div><button onclick="confirmP2PSent(${t.id})" class="action-btn" style="width:100%; height:36px; background:#ffcc00; color:#000; border-radius:8px;">✅ Я передал скин</button></div>`; break;
                case 'review': statusBadge = '<span style="color:#fff; background:#2AABEE; padding:2px 8px; border-radius:4px; font-size:10px;">👀 Проверка</span>'; break;
                case 'completed': statusBadge = '<span style="color:#fff; background:#34c759; padding:2px 8px; border-radius:4px; font-size:10px;">✅ Готово</span>'; break;
                case 'canceled': statusBadge = '<span style="color:#fff; background:#ff3b30; padding:2px 8px; border-radius:4px; font-size:10px;">❌ Отмена</span>'; break;
            }
            return `<div style="background:#2c2c2e; border-radius:14px; padding:12px; border:1px solid rgba(255,255,255,0.05); margin-bottom:10px;"><div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:5px;"><div><div style="font-weight:700; font-size:14px; color:#fff;">${caseName}</div><div style="font-size:11px; color:#8E8E93;">Кол-во: ${t.quantity} шт.</div></div><div style="text-align:right;"><div style="color:#ffcc00; font-weight:700; font-size:14px;">+${t.total_coins}</div><div style="font-size:10px; color:#666;">#${t.id}</div></div></div><div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">${statusBadge}<div style="font-size:10px; color:#666;">${new Date(t.created_at || Date.now()).toLocaleDateString()}</div></div>${actionHtml}</div>`;
        }).join('');
    } catch (e) { listContainer.innerHTML = `<div style="color:red; text-align:center;">Ошибка</div>`; }
}

window.confirmP2PSent = (tradeId) => {
    customConfirm("Вы точно передали предмет в Steam?", async (ok) => {
        if (!ok) return;
        try { await makeApiRequest('/api/v1/p2p/confirm_sent', { trade_id: parseInt(tradeId) }, 'POST'); customAlert("Отлично! Админ проверит поступление и начислит монеты."); loadP2PHistoryData(); checkActiveTradesBackground(); } catch (e) {}
    });
}

async function checkActiveTradesBackground(preloadedTrades = null) {
    try {
        let trades = preloadedTrades;
        if (!trades) {
            trades = await makeApiRequest('/api/v1/p2p/my_trades', {}, 'POST', true);
        }
        if(!trades) return;

        const activeTrades = trades.filter(t => ['pending', 'active', 'review'].includes(t.status)).sort((a, b) => ({'active':1,'review':2,'pending':3}[a.status] - {'active':1,'review':2,'pending':3}[b.status]));
        const btn = document.getElementById('open-p2p-modal-btn'); if (!btn) return;
        if (activeTrades.length > 0) {
            btn.classList.add('has-active-trade'); const t = activeTrades[0];
            btn.querySelector('.p2p-title').innerText = t.status === 'active' ? "ТРЕБУЕТСЯ ДЕЙСТВИЕ" : t.status === 'review' ? "ПРОВЕРКА АДМИНОМ" : "ЗАЯВКА СОЗДАНА";
            btn.querySelector('.p2p-subtitle').innerText = t.status === 'active' ? "Передайте скин в Steam" : t.status === 'review' ? "Ожидайте начисления монет" : "Ожидание принятия...";
            btn.querySelector('.p2p-icon-box').innerHTML = t.status === 'active' ? '<i class="fa-solid fa-fire"></i>' : t.status === 'review' ? '<i class="fa-solid fa-hourglass-half"></i>' : '<i class="fa-regular fa-clock"></i>';
        } else {
          btn.classList.remove('has-active-trade'); btn.querySelector('.p2p-title').innerText = "Trade-In"; btn.querySelector('.p2p-subtitle').innerHTML = `Обмен кейсов на <i class="fa-solid fa-coins" style="color: #ffd700;"></i>`; btn.querySelector('.p2p-icon-box').innerHTML = '<i class="fa-solid fa-arrow-right-arrow-left"></i>';
          }
    } catch(e) {}
}

// ================================================================
// АДМИНКА (СБРОС КЭША)
// ================================================================
window.toggleAdminMenu = () => { const btn = document.querySelector('.admin-fab-btn.toggle'); btn.classList.toggle('active'); document.getElementById('admin-menu-items').classList.toggle('show'); const i = btn.querySelector('i'); i.className = btn.classList.contains('active') ? 'fa-solid fa-xmark' : 'fa-solid fa-chevron-up'; }
window.openPassModal = () => { document.getElementById('password-modal').classList.remove('hidden'); document.getElementById('admin-pass-input').value = ''; }
window.closePassModal = () => { document.getElementById('password-modal').classList.add('hidden'); }
window.submitResetCache = () => {
    const pw = document.getElementById('admin-pass-input').value; if(!pw) return; closePassModal(); toggleAdminMenu();
    makeApiRequest('/api/v1/admin/shop/reset_cache', { password: pw }, 'POST').then(() => { customAlert("✅ Кэш очищен"); }).catch(()=>{});
}

// ================================================================
// СВАЙПЫ МЕЖДУ ВКЛАДКАМИ (ГЛАВНАЯ / КЕЙСЫ)
// ================================================================
function initSwipeTabs() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;
    
    let touchStartX = 0;
    let touchStartY = 0;

    mainContent.addEventListener('touchstart', (e) => {
        // Игнорируем свайпы на рулетке, слайдерах и горизонтальных списках
        if (e.target.closest('#main-slider-container') || e.target.closest('.r-game-area') || e.target.closest('.case-contents-grid')) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    mainContent.addEventListener('touchend', (e) => {
        if (touchStartX === 0) return;
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;

        const diffX = touchStartX - touchEndX;
        const diffY = touchStartY - touchEndY;

        // Если свайп горизонтальный и палец прошел больше 60 пикселей
        if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY)) {
            const toggleOptions = document.querySelectorAll('.toggle-option');
            
            if (diffX > 0) {
                // Свайп влево (палец идет ←) -> Открываем КЕЙСЫ
                if (toggleOptions[1]) toggleOptions[1].click();
            } else {
                // Свайп вправо (палец идет →) -> Открываем ГЛАВНУЮ
                if (toggleOptions[0]) toggleOptions[0].click();
            }
        }
        touchStartX = 0; 
        touchStartY = 0;
    }, { passive: true });
}

// ================================================================
// ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ (Свайп-защита, P2R, Ивенты кнопок)
// ================================================================

// 1. Свайп-защита
document.body.addEventListener('touchmove', (e) => {
    // Добавили .custom-confirm-box в исключения, чтобы FAQ можно было скроллить!
    const isScrollable = e.target.closest('.main-content-scrollable') || e.target.closest('.modal-content') || e.target.closest('.case-contents-grid') || e.target.closest('.custom-confirm-box');
    if (!isScrollable && e.cancelable) e.preventDefault();
}, { passive: false });

// 2. ВОТ ФУНКЦИЯ, КОТОРУЮ ТЫ СЛУЧАЙНО УДАЛИЛ:
function initPullToRefresh() {
    const content = document.getElementById('main-content'); const ptr = document.getElementById('pull-to-refresh');
    if (!content || !ptr) return;
    let startY = 0, distance = 0, isPulling = false;
    content.addEventListener('touchstart', (e) => { if (content.scrollTop <= 0) { startY = e.touches[0].clientY; isPulling = true; content.style.transition = 'none'; ptr.style.transition = 'none'; } }, { passive: true });
    content.addEventListener('touchmove', (e) => {
        if (!isPulling) return; const diff = e.touches[0].clientY - startY;
        if (diff > 0 && content.scrollTop <= 0) { if (e.cancelable) e.preventDefault(); distance = Math.pow(diff, 0.85); if (distance > 150) distance = 150; content.style.transform = `translateY(${distance}px)`; ptr.style.transform = `translateY(${distance}px)`; }
    }, { passive: false });
    content.addEventListener('touchend', () => {
        if (!isPulling) return; isPulling = false; content.style.transition = 'transform 0.3s ease-out'; ptr.style.transition = 'transform 0.3s ease-out';
        if (distance > 80) { ptr.querySelector('i').classList.add('fa-spin'); if (window.Telegram?.WebApp?.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred('success'); setTimeout(() => window.location.reload(), 500); } 
        else { content.style.transform = 'translateY(0)'; ptr.style.transform = 'translateY(0)'; } distance = 0;
    });
}

function initBottomSwipe() {
    const content = document.getElementById('main-content'); 
    if (!content) return;
    
    let startY = 0, isPullingBottom = false, wheelAccumulator = 0;
    let isAnimating = false; 

    const triggerThemeSwitch = () => {
        if (isAnimating) return;
        isAnimating = true; 
        isPullingBottom = false; 
        wheelAccumulator = 0;

        if (window.Telegram?.WebApp?.HapticFeedback) Telegram.WebApp.HapticFeedback.impactOccurred('heavy'); 
        
        const isLight = document.body.classList.toggle('light-theme');
        const darkWrap = document.getElementById('dark-wrapper');
        const lightWrap = document.getElementById('light-wrapper');

        // 🔥 ФИКС: Мгновенная смена без анимации (оставляем только это) 🔥
        const bPill = document.querySelector('.balance-pill');
        const bRow = document.querySelector('.balance-row');
        const burger = document.querySelector('.glass-burger');
        const burgerSpans = document.querySelectorAll('.glass-burger span');
        const logoTitle = document.querySelector('.top-header .logo-title');
        const logoSub = document.querySelector('.logo-subtitle');

        // 1. Убиваем все транзишены, чтобы цвета из CSS применились мгновенно
        const elementsToForce = [bPill, bRow, burger, logoTitle, logoSub, ...burgerSpans];
        elementsToForce.forEach(el => {
            if (el) el.style.transition = 'none';
        });

        // 2. Цвета теперь НЕ ставятся через JS. Они берутся из твоего CSS.
        // Блок принудительной установки цветов удален.

        // 3. Возвращаем родные анимации через 50мс
        setTimeout(() => {
            elementsToForce.forEach(el => {
                if (el) el.style.transition = '';
            });
        }, 50);

        // Плавно переключаем блоки контента (эта часть без изменений)
        if (darkWrap && lightWrap) {
            darkWrap.style.transition = 'opacity 0.2s ease-in-out';
            lightWrap.style.transition = 'opacity 0.2s ease-in-out';

            if (isLight) {
                darkWrap.style.opacity = '0';
                setTimeout(() => {
                    darkWrap.style.display = 'none';
                    lightWrap.style.display = 'block';
                    content.scrollTop = 0; 
                    setTimeout(() => {
                        lightWrap.style.opacity = '1';
                        setTimeout(() => isAnimating = false, 200);
                    }, 50); 
                }, 200);
            } else {
                lightWrap.style.opacity = '0';
                setTimeout(() => {
                    lightWrap.style.display = 'none';
                    darkWrap.style.display = 'block';
                    content.scrollTop = 0; 
                    setTimeout(() => {
                        darkWrap.style.opacity = '1';
                        setTimeout(() => isAnimating = false, 200);
                    }, 50);
                }, 200);
            }
        } else {
            isAnimating = false;
        }
    };

    const canSwipeBottom = () => {
        if (document.body.classList.contains('light-theme')) return true; 
        const dashboardView = document.getElementById('view-dashboard');
        return dashboardView && (dashboardView.classList.contains('active') || window.getComputedStyle(dashboardView).display !== 'none');
    };

    // ==========================================
    // 1. СЕНСОР (ТЕЛЕФОНЫ)
    // ==========================================
    content.addEventListener('touchmove', (e) => {
        if (isAnimating) return;
        
        const bottomDistance = content.scrollHeight - content.scrollTop - content.clientHeight;
        const isAtBottom = bottomDistance < 10; 
        
        if (isAtBottom) {
            if (!isPullingBottom) {
                startY = e.touches[0].clientY;
                isPullingBottom = true;
            }
            
            const diff = startY - e.touches[0].clientY; 
            
            if (diff > 0) { 
                if (canSwipeBottom()) {
                    if (e.cancelable) e.preventDefault(); 
                    if (diff > 40) triggerThemeSwitch();
                } else {
                    isPullingBottom = false; 
                }
            }
        } else {
            isPullingBottom = false;
        }
    }, { passive: false });
    
    content.addEventListener('touchend', () => { isPullingBottom = false; });

    // ==========================================
    // 2. ДЕСКТОП (КОЛЕСИКО ВНИЗ)
    // ==========================================
    let wheelTimeout;
    content.addEventListener('wheel', (e) => {
        if (isAnimating) return;
        const bottomDistance = content.scrollHeight - content.scrollTop - content.clientHeight;
        
        if (bottomDistance < 10 && e.deltaY > 0) {
            if (canSwipeBottom()) {
                if (e.cancelable) e.preventDefault();
                wheelAccumulator += e.deltaY;
                if (wheelAccumulator > 100) triggerThemeSwitch();
                
                clearTimeout(wheelTimeout);
                wheelTimeout = setTimeout(() => { wheelAccumulator = 0; }, 200);
            }
        }
    }, { passive: false });
}

// 3. Безопасный клик (из-за которого была прошлая проблема)
document.body.addEventListener('click', async (event) => {
    // Ищем кнопку безопасно при клике
    const claimSuperBtn = event.target.closest('#claim-super-prize-btn'); 
    if (claimSuperBtn && !claimSuperBtn.disabled) {
        claimSuperBtn.disabled = true; 
        claimSuperBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try { 
            const res = await makeApiRequest('/api/v1/user/weekly_goals/claim_super_prize', {}); 
            if (res.new_ticket_balance) document.getElementById('ticketStats').textContent = res.new_ticket_balance; 
            claimSuperBtn.textContent = 'Получено!'; 
            claimSuperBtn.classList.add('action-btn', 'btn-disabled'); 
            claimSuperBtn.disabled = true; 
            if(window.Telegram?.WebApp) customAlert("Суперприз получен!"); 
        } catch(e) { 
            claimSuperBtn.disabled = false; 
            claimSuperBtn.textContent = 'Забрать'; 
        }
    }
});

// Добавляем слушатели на кнопки подарков
document.getElementById('daily-gift-btn')?.addEventListener('click', () => { document.getElementById('gift-modal-overlay').classList.remove('hidden'); document.getElementById('gift-content-initial').classList.remove('hidden'); document.getElementById('gift-content-result').classList.add('hidden'); });
document.getElementById('gift-open-btn')?.addEventListener('click', async () => { try { document.getElementById('gift-open-btn').disabled = true; const res = await makeApiRequest('/api/v1/gift/claim', {}, 'POST'); renderGiftResult(res); checkBalance(true); } catch (e) { document.getElementById('gift-open-btn').disabled = false; } });
document.getElementById('gift-x-btn')?.addEventListener('click', () => document.getElementById('gift-modal-overlay').classList.add('hidden'));
document.getElementById('gift-close-btn')?.addEventListener('click', () => document.getElementById('gift-modal-overlay').classList.add('hidden'));


// 🔥 Глобальный флаг: запоминаем, показывали ли уже окно
window.hasShownBotAuthWarning = false;

window.showBotAuthWarning = function() {
    // Если окно уже открыто ИЛИ мы его уже показывали после загрузки страницы — блокируем
    if (window.hasShownBotAuthWarning || document.getElementById('bot-auth-modal')) return;

    // Ставим галочку, что мы предупредили юзера
    window.hasShownBotAuthWarning = true;

    const overlay = document.createElement('div');
    overlay.id = 'bot-auth-modal';
    
    // Делаем затемнение поверх всего
    overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 99999999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px); opacity: 0; transition: opacity 0.3s;";

    overlay.innerHTML = `
        <div class="custom-confirm-box" style="padding: 24px 20px; width: 90%; max-width: 350px; background: #1c1c1e; border-radius: 16px; border: 1px solid rgba(42, 171, 238, 0.3); text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
            <i class="fa-brands fa-telegram" style="font-size:44px; color:#2AABEE; margin-bottom:15px; display:block; filter: drop-shadow(0 0 10px rgba(42, 171, 238, 0.4));"></i>
            <h3 style="color: #fff; font-size: 18px; margin-bottom: 10px; font-weight: 800;">HATElavka тебя не знает((</h3>
            
            <div style="margin-bottom: 15px; font-size: 13px; color: #bbb; line-height: 1.4; text-align: left;">
                По правилам Telegram боты <b>не могут писать первыми</b> и проверять твой профиль, пока ты сам с ними не поздороваешься.<br><br>
                Чтобы баланс обновлялся и покупки работали как часы, запусти основного <b>или</b> альтернативного бота:
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; text-align: left;">
                
                <a href="https://t.me/HATElavka_bot" target="_blank" onclick="if(window.Telegram?.WebApp) { Telegram.WebApp.openTelegramLink('https://t.me/HATElavka_bot'); return false; }" style="display: flex; align-items: center; gap: 10px; background: rgba(42, 171, 238, 0.1); padding: 10px; border-radius: 10px; text-decoration: none; color: #fff; border: 1px solid rgba(42, 171, 238, 0.2); transition: background 0.2s;">
                    <i class="fa-solid fa-robot" style="color: #2AABEE; width: 24px; text-align: center; font-size: 16px;"></i>
                    <div style="flex-grow: 1;">
                        <div style="font-size: 13px; font-weight: 700;">Основной бот</div>
                        <div style="color: #888; font-size: 10px; margin-top: 2px;">Полный функционал проекта</div>
                    </div>
                </a>

                <a href="https://t.me/quest_hatelavka_bot" target="_blank" onclick="if(window.Telegram?.WebApp) { Telegram.WebApp.openTelegramLink('https://t.me/quest_hatelavka_bot'); return false; }" style="display: flex; align-items: center; gap: 10px; background: rgba(145, 70, 255, 0.1); padding: 10px; border-radius: 10px; text-decoration: none; color: #fff; border: 1px solid rgba(145, 70, 255, 0.2); transition: background 0.2s;">
                    <i class="fa-solid fa-user-ninja" style="color: #9146ff; width: 24px; text-align: center; font-size: 16px;"></i>
                    <div style="flex-grow: 1;">
                        <div style="font-size: 13px; font-weight: 700;">Альтернативный бот</div>
                        <div style="color: #888; font-size: 10px; margin-top: 2px; line-height: 1.2;">Никакой рекламы, только важные уведомления (можно выключить в профиле)</div>
                    </div>
                </a>
                
                <div style="width: 100%; height: 1px; background: rgba(255,255,255,0.05); margin: 4px 0;"></div>

                <a href="https://t.me/hatelove_ttv" target="_blank" onclick="if(window.Telegram?.WebApp) { Telegram.WebApp.openTelegramLink('https://t.me/hatelove_ttv'); return false; }" style="display: flex; align-items: center; gap: 10px; background: rgba(255, 215, 0, 0.05); padding: 10px; border-radius: 10px; text-decoration: none; color: #fff; border: 1px solid rgba(255, 215, 0, 0.1); transition: background 0.2s;">
                    <i class="fa-solid fa-bullhorn" style="color: #ffd700; width: 24px; text-align: center; font-size: 16px;"></i>
                    <div>
                        <div style="font-size: 13px; font-weight: 700;">Наш канал</div>
                        <div style="color: #888; font-size: 10px; margin-top: 2px;">@hatelove_ttv</div>
                    </div>
                </a>
                
                <a href="https://t.me/hatelovettv" target="_blank" onclick="if(window.Telegram?.WebApp) { Telegram.WebApp.openTelegramLink('https://t.me/hatelovettv'); return false; }" style="display: flex; align-items: center; gap: 10px; background: rgba(52, 199, 89, 0.05); padding: 10px; border-radius: 10px; text-decoration: none; color: #fff; border: 1px solid rgba(52, 199, 89, 0.1); transition: background 0.2s;">
                    <i class="fa-solid fa-comments" style="color: #34c759; width: 24px; text-align: center; font-size: 16px;"></i>
                    <div>
                        <div style="font-size: 13px; font-weight: 700;">Наш чат</div>
                        <div style="color: #888; font-size: 10px; margin-top: 2px;">@hatelovettv</div>
                    </div>
                </a>
            </div>

            <button id="close-bot-auth-btn" style="width: 100%; background: #333; color: #fff; border: none; border-radius: 10px; padding: 14px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.2s;">Я все понял, закрыть</button>
        </div>
    `;

    document.body.appendChild(overlay);
    
    // Плавное появление
    requestAnimationFrame(() => overlay.style.opacity = '1');

    // Кнопка закрытия
    overlay.querySelector('#close-bot-auth-btn').onclick = function() {
        this.innerHTML = 'Закрываем...';
        this.style.background = '#444';
        
        // Даем анимации прокрутиться и просто закрываем окно (без дергания API)
        setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.remove();
            }, 300);
        }, 300);
    };
};

// Специальное окно для блокировки абузеров (с возможностью смены Trade-ссылки)
window.showSecurityBlock = function(message) {
    lockAppScroll(); 
    
    const old = document.getElementById('security-trade-modal');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'security-trade-modal';
    
    // 🔥 ЖЕСТКО ЗАДАЕМ Z-INDEX ПОВЕРХ ВСЕГО МИРА 🔥
    overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.95); z-index: 9999999999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(15px); opacity: 0; transition: opacity 0.3s;";
    
    overlay.innerHTML = `
        <div class="custom-confirm-box" style="padding: 24px 20px; width: 90%; max-width: 340px; background: #1c1c1e; border-radius: 16px; border: 1px solid rgba(255,59,48,0.3); text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
            <i class="fa-solid fa-shield-halved" style="font-size:44px; color:#ff3b30; margin-bottom:15px; display:block; filter: drop-shadow(0 0 10px rgba(255, 59, 48, 0.4));"></i>
            <h3 class="confirm-title" style="color: #ff3b30; font-size: 20px; margin-bottom: 10px; font-weight: 800;">Доступ ограничен</h3>
            <div class="confirm-subtitle" style="margin-bottom: 20px; font-size: 13px; color: #ddd; line-height: 1.4;">${message}</div>
            
            <div style="text-align: left; margin-bottom: 20px; background: rgba(0,0,0,0.4); padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                <label style="font-size: 11px; color: #8e8e93; font-weight: 600; margin-bottom: 8px; display: block;">Обновите Trade-ссылку для разблокировки:</label>
                <input type="url" id="security-trade-input" placeholder="https://steamcommunity.com/tradeoffer/new/..." style="width: 100%; background: #2c2c2e; border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 12px; border-radius: 10px; font-size: 12px; outline: none; box-sizing: border-box; transition: border-color 0.2s;">
                <div style="text-align: right; margin-top: 6px;">
                    <a href="https://steamcommunity.com/id/me/tradeoffers/privacy#trade_offer_access_url" target="_blank" style="font-size: 11px; color: #2AABEE; text-decoration: none; font-weight: 500;"><i class="fa-solid fa-circle-question"></i> Где найти?</a>
                </div>
            </div>

            <div class="confirm-buttons" style="display: flex; flex-direction: column; gap: 10px;">
                <button class="confirm-btn btn-yellow-modal" id="security-save-btn" style="width: 100%; padding: 14px; font-size: 14px; background: #ffcc00; color: #000; border: none; border-radius: 10px; font-weight: 700;">Сохранить и продолжить</button>
                <button class="confirm-btn btn-cancel-modal" id="security-support-btn" style="width: 100%; background: rgba(255,255,255,0.05); color: #8e8e93; border: none; border-radius: 10px; padding: 14px; font-size: 13px; font-weight: 600;">Написать в поддержку</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.style.opacity = '1');

    const saveBtn = overlay.querySelector('#security-save-btn');
    const input = overlay.querySelector('#security-trade-input');
    
    input.addEventListener('input', (e) => {
        let val = e.target.value.trim();
        if (val.includes("https://") && !val.startsWith("https://")) {
            val = val.substring(val.indexOf("https://"));
            input.value = val;
        }
        
        if (val.length > 20 && (!val.startsWith("https://steamcommunity.com") || !val.includes("partner=") || !val.includes("token="))) {
            input.style.borderColor = '#ff3b30';
        } else {
            input.style.borderColor = 'rgba(255,255,255,0.1)';
        }
    });

    saveBtn.onclick = async () => {
        const v = input.value.trim();
        if (!v.startsWith("https://steamcommunity.com/tradeoffer/new") || !v.includes("partner=") || !v.includes("token=")) {
            input.style.borderColor = '#ff3b30';
            const originalText = saveBtn.innerHTML;
            saveBtn.innerText = "Неверный формат ссылки!";
            saveBtn.style.background = "#ff3b30";
            saveBtn.style.color = "#fff";
            
            setTimeout(() => {
                saveBtn.innerHTML = originalText;
                saveBtn.style.background = "#ffcc00";
                saveBtn.style.color = "#000";
            }, 2000);
            return;
        }

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Сохранение...';

        try {
            const payload = getAuthPayload();
            const response = await fetch('/api/v1/user/trade_link/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trade_link: v, ...payload })
            });

            if (!response.ok) throw new Error("Save failed");
            
            saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Сохранено!';
            saveBtn.style.background = "#34c759";
            saveBtn.style.color = "#fff";
            
            // Если сохранили успешно - перезагружаем бота. Блок спадет сам.
            setTimeout(() => {
                window.location.reload();
            }, 1000);

        } catch (e) {
            saveBtn.disabled = false;
            saveBtn.innerText = "Ошибка сохранения";
            saveBtn.style.background = "#ff3b30";
            saveBtn.style.color = "#fff";
            
            setTimeout(() => {
                saveBtn.innerText = "Сохранить и продолжить";
                saveBtn.style.background = "#ffcc00";
                saveBtn.style.color = "#000";
            }, 2000);
        }
    };

    overlay.querySelector('#security-support-btn').onclick = () => {
        if (window.Telegram && Telegram.WebApp) {
            Telegram.WebApp.openTelegramLink("https://t.me/hatelove_twitch");
        } else {
            window.location.href = "https://t.me/hatelove_twitch";
        }
    };
};

// ================================================================
// УНИВЕРСАЛЬНЫЕ КАСТОМНЫЕ ДИАЛОГИ И FAQ
// ================================================================

// ================================================================
// ЛОГИКА РАСПИСАНИЯ СТРИМОВ
// ================================================================
const dayNames = {
    monday: "Понедельник", tuesday: "Вторник", wednesday: "Среда",
    thursday: "Четверг", friday: "Пятница", saturday: "Суббота", sunday: "Воскресенье"
};
let currentSchedule = {};
let isScheduleEditMode = false;

window.openScheduleModal = async () => {
    document.getElementById('modal-schedule').classList.add('modal-active');
    const container = document.getElementById('schedule-container');
    const btnEdit = document.getElementById('btn-edit-schedule');
    const btnSave = document.getElementById('btn-save-schedule');
    
    // Сброс состояния
    isScheduleEditMode = false;
    btnEdit.style.display = 'none';
    btnSave.style.display = 'none';
    btnEdit.style.color = "var(--text-sec)";
    container.innerHTML = '<div style="text-align:center; color:#888;"><i class="fa-solid fa-circle-notch fa-spin"></i> Загрузка...</div>';
    
    if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }

    try {
        const res = await makeApiRequest('/api/v1/schedule/get', {}, 'POST', true);
        if (res) {
            currentSchedule = res.schedule;
            
            // Если бэкенд сказал, что это админ - показываем "скрытую" кнопку-карандаш
            if (res.is_admin) {
                btnEdit.style.display = 'block';
            }
            
            window.renderSchedule();
        } else {
            container.innerHTML = '<div style="text-align:center; color:var(--danger);">Ошибка загрузки расписания</div>';
        }
    } catch (e) {
        container.innerHTML = '<div style="text-align:center; color:var(--danger);">Ошибка сети</div>';
    }
};

window.closeScheduleModal = () => {
    document.getElementById('modal-schedule').classList.remove('modal-active');
};

window.renderSchedule = () => {
    const container = document.getElementById('schedule-container');
    container.innerHTML = '';

    Object.keys(dayNames).forEach(dayKey => {
        const dayText = dayNames[dayKey];
        const timeText = currentSchedule[dayKey] || "Выходной";

        const row = document.createElement('div');
        row.className = 'schedule-row';
        
        row.innerHTML = `
            <div class="schedule-day">${dayText}</div>
            <div class="schedule-time" id="text-${dayKey}">${escapeHTML(timeText)}</div>
            <input type="text" class="schedule-input" id="input-${dayKey}" value="${escapeHTML(timeText)}">
        `;
        container.appendChild(row);
    });
};

window.toggleScheduleEdit = () => {
    isScheduleEditMode = !isScheduleEditMode;
    const btnEdit = document.getElementById('btn-edit-schedule');
    const btnSave = document.getElementById('btn-save-schedule');
    
    if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    }

    Object.keys(dayNames).forEach(dayKey => {
        const textEl = document.getElementById(`text-${dayKey}`);
        const inputEl = document.getElementById(`input-${dayKey}`);
        
        if (isScheduleEditMode) {
            textEl.style.display = 'none';
            inputEl.style.display = 'block';
        } else {
            // Если отменили редактирование, возвращаем старые значения
            inputEl.value = currentSchedule[dayKey];
            textEl.style.display = 'block';
            inputEl.style.display = 'none';
        }
    });

    if (isScheduleEditMode) {
        btnEdit.style.color = "var(--action)"; // Карандаш зеленеет
        btnSave.style.display = 'block';
    } else {
        btnEdit.style.color = "var(--text-sec)";
        btnSave.style.display = 'none';
    }
};

window.saveSchedule = async () => {
    const btnSave = document.getElementById('btn-save-schedule');
    const originalText = btnSave.innerHTML;
    btnSave.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> СОХРАНЕНИЕ...';
    btnSave.disabled = true;

    // Собираем новые данные из инпутов
    const newSchedule = {};
    Object.keys(dayNames).forEach(dayKey => {
        newSchedule[dayKey] = document.getElementById(`input-${dayKey}`).value.trim() || "Выходной";
    });

    try {
        const res = await makeApiRequest('/api/v1/admin/schedule/update', { schedule: newSchedule }, 'POST');
        if (res && res.success) {
            if (window.Telegram?.WebApp?.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            customAlert("✅ Расписание успешно обновлено!");
            currentSchedule = newSchedule;
            window.toggleScheduleEdit(); 
            window.renderSchedule(); 
        }
    } catch(e) {
        // Ошибка уже покажется через customAlert внутри твоего makeApiRequest
    } finally {
        btnSave.innerHTML = originalText;
        btnSave.disabled = false;
    }
};

// ================================================================
// ЛОГИКА КУПОНОВ
// ================================================================
window.openCouponModal = () => {
    document.getElementById('coupon-modal').classList.remove('hidden');
    document.getElementById('coupon-input').value = '';
};

window.closeCouponModal = () => {
    document.getElementById('coupon-modal').classList.add('hidden');
};

window.pasteCoupon = async () => {
    try {
        const text = await navigator.clipboard.readText();
        document.getElementById('coupon-input').value = text;
        if (window.Telegram?.WebApp?.HapticFeedback) Telegram.WebApp.HapticFeedback.selectionChanged();
    } catch (err) {
        customAlert('Не удалось вставить текст. Проверьте разрешения браузера.');
    }
};

window.activateCouponSubmit = async () => {
    const input = document.getElementById('coupon-input');
    const code = input.value.trim().toUpperCase();
    if (!code) return customAlert("Введите промокод!");

    const btn = document.getElementById('activate-coupon-btn');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Проверка...';

    try {
        const res = await makeApiRequest('/api/cs/check_code', { code: code }, 'POST');
        
        if (res.valid) {
            customAlert("✅ " + res.message);
            closeCouponModal();
            
            // Добавляем в массив для моментального визуала
            if (res.target_case_name && !window.activeFreeCases.includes(res.target_case_name)) {
                window.activeFreeCases.push(res.target_case_name);
            }
            
            // Переходим в магазин
            const shopTab = document.querySelector('.toggle-option[data-target="view-shop"]');
            if (shopTab) shopTab.click();
            
            // Перерисовываем ту категорию, которая сейчас открыта
            loadCategory(window.currentCategoryId); 

        } else {
            customAlert("❌ " + res.message);
        }
    } catch (e) {
        console.error("Ошибка активации:", e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
};

// Обновленный showShopModal (умеет скрывать кнопку отмены и закрываться по клику вне окна)
function showShopModal({ title, subtitle, confirmText, confirmClass, showCancel = true, onConfirm }) {
    const old = document.querySelector('.custom-confirm-overlay'); if (old) old.remove();
    const overlay = document.createElement('div'); overlay.className = 'custom-confirm-overlay';
    
    let cancelBtnHtml = showCancel ? `<button class="confirm-btn btn-cancel-modal" id="modal-cancel">Отмена</button>` : '';

    overlay.innerHTML = `
        <div class="custom-confirm-box">
            <h3 class="confirm-title">${title}</h3>
            <div class="confirm-subtitle" style="white-space: pre-wrap;">${subtitle}</div>
            <div class="confirm-buttons">
                ${cancelBtnHtml}
                <button class="confirm-btn ${confirmClass}" id="modal-confirm">${confirmText}</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    
    const close = () => { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 200); };
    
    if (showCancel) overlay.querySelector('#modal-cancel').onclick = close;
    
    // --- ВОТ ЭТО НОВАЯ ЛОГИКА КНОПКИ ПОДТВЕРЖДЕНИЯ ---
    const confirmBtn = overlay.querySelector('#modal-confirm');
    confirmBtn.onclick = () => { 
        if (confirmBtn.dataset.clicked) return; // Если уже нажали — игнорируем второй клик
        confirmBtn.dataset.clicked = "true";    // Ставим метку, что кнопка нажата
        confirmBtn.style.opacity = "0.7";       // Делаем кнопку чуть прозрачной для визуала
        onConfirm(close);                       // Запускаем сам вывод/обмен
    };
    // --------------------------------------------------

    overlay.onclick = (e) => { if(e.target === overlay && showCancel) close(); };
}

window.customAlert = function(message) {
    showShopModal({
        title: "Внимание",
        subtitle: message,
        confirmText: "ПОНЯТНО",
        confirmClass: "btn-yellow-modal",
        showCancel: false, 
        onConfirm: (close) => close()
    });
};

window.customConfirm = function(message, callback) {
    showShopModal({
        title: "Подтверждение",
        subtitle: message,
        confirmText: "ДА",
        confirmClass: "btn-yellow-modal",
        showCancel: true,
        onConfirm: (close) => {
            close();
            if (callback) callback(true);
        }
    });
};

// ================================================================
// FAQ БОТА
// ================================================================
window.showFaq = function() {
    const faqHtml = '<div style="text-align: left; font-size: 13px; line-height: 1.35; color: #ddd; max-height: 60vh; overflow-y: auto; padding-right: 5px;">' +
        '<div>Добро пожаловать в <b>HATElavka</b>! Чтобы ты не запутался, вот краткий путеводитель:</div><br>' +
        
        '<div><b style="color: #fff;">💰 Валюта и прогресс</b><br>' +
        '<span style="color: #ffd700;">•</span> <b>Монетки:</b> Твоя основная валюта, с помощью них ты можешь открывать кейсы и участвовать в платных ивентах.<br>' +
        '<span style="color: #2AABEE;">•</span> <b>Билеты:</b> Это монета активности, открывает возможность пользоваться аукционом и розыгрышами.</div><br>' +
        
        '<div><b style="color: #fff;">📋 Как зарабатывать</b><br>' +
        '• <b>Задания и Челленджи:</b> Проявляй активность в TG/Twitch.<br>' +
        '• <b>Недельные испытания:</b> Выполняй цели за неделю и получай приз недели.</div><br>' +
        
        '<div><b style="color: #fff;">🎁 Активности и Ивенты</b><br>' +
        'Участвуй в различных <b>Ивентах</b>, делай ставки на <b>Аукционах</b> и крути <b>Рулетки</b> за скины.</div><br>' +
        
        '<div><b style="color: #fff;">🛒 TRADE IT</b><br>' +
        'Продавай кейсы в разделе кейсы.<br>' +
        '⚠️ <span style="color: #ff3b30; font-weight: 700;">Обязательно укажи актуальную Trade Link Steam в профиле для вывода скинов!</span></div>' +
        
        '<div style="background: rgba(255, 215, 0, 0.1); border-left: 3px solid #ffd700; padding: 6px 10px; border-radius: 4px; margin: 8px 0;">' +
        '⚠️ <b style="color: #ffd700;">Помним, что Валя — соло-разработчик, баги это нормально! 😉</b></div>' +
        
        '<div><b style="color: #fff;">🔗 Важно:</b> Для работы авто-заданий привяжи аккаунт Telegram к Twitch. Если что-то не считается — пиши Валентину!</div>' +
    '</div>';

    showShopModal({
        title: "📖 Как работает бот?",
        subtitle: faqHtml,
        confirmText: "Спасибо!",
        confirmClass: "btn-yellow-modal",
        showCancel: false,
        onConfirm: (close) => close()
    });
};

// ================================================================
// ГЛАВНЫЙ ЗАПУСК (СИНХРОННАЯ ЗАГРУЗКА ВСЕГО ЭКРАНА)
// ================================================================
async function main() {
    // Если мы в ВК, сначала пытаемся догрузить конфиг из моста
    if (window.isVk && !window.vkParams) {
        await fetchVkParamsFromBridge();
    }

    // 🔥 ИСПРАВЛЕННАЯ ПРОВЕРКА ТЕЛЕГРАМА 🔥
    if (!window.isVk && window.Telegram?.WebApp) {
        console.log("🤖 Режим Телеграм: ожидание initData...");
        let attempts = 0;
        while (!window.Telegram.WebApp.initData && attempts < 15) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }
    }

    // Если это НЕ ВК и ТГ не дал данные — рубим
    if (!window.isVk && window.Telegram && !Telegram.WebApp.initData) { 
        console.error("💀 Telegram не отдал initData, прерываем запуск.");
        if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden'); 
        return; 
    }

    // Если это ВК и нет параметров — рубим
    if (window.isVk && !window.vkParams) {
        console.error("💀 ВК не отдал параметры, прерываем запуск.");
        if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden'); 
        return;
    }

    console.log("✅ Авторизация пройдена успешно. Платформа:", window.isVk ? 'VK' : 'TG');
    
    // 3. ТЕПЕРЬ БЕЗОПАСНО ЗАПУСКАЕМ ЗАПРОСЫ
    // 🔥 syncMyPromos УДАЛЕН, ОН БОЛЬШЕ НЕ НУЖЕН 🔥
    // УБРАНО: checkBalance(true); — теперь баланс приходит в bootstrap

    try {
        if (!isVk && window.Telegram && !Telegram.WebApp.initData) { 
            if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden'); 
            return; 
        }
        
        let isCached = false;
        
        // 1. Читаем ВЕСЬ кэш
        const cachedBootstrap = JSON.parse(localStorage.getItem('cache_bootstrap') || 'null');
        const cachedShopRaw = JSON.parse(localStorage.getItem('shop_items_cache') || '{}');
        const cachedShop = cachedShopRaw[2716312];

        // Если ВСЁ есть в кэше — рисуем мгновенно (Stale-While-Revalidate)
        if (cachedBootstrap && !cachedBootstrap.maintenance && cachedShop) {
            await renderFullInterface(cachedBootstrap);
            initDynamicRaffleSlider(cachedBootstrap.raffles || []); // 🔥 Берем из бутстрапа
            loadCategory(2716312, cachedShop);
            
            // Берем P2P из кэшированного бутстрапа, если есть
            if (cachedBootstrap.p2p_trades) checkActiveTradesBackground(cachedBootstrap.p2p_trades);
            
            setupSlider();
            
            isCached = true;
            if (dom.loaderOverlay) {
                dom.loaderOverlay.style.opacity = '0';
                dom.loaderOverlay.classList.add('hidden');
            }
        } else {
            // Иначе показываем лоадер
            if (dom.loaderOverlay) {
                dom.loaderOverlay.classList.remove('hidden');
                dom.loaderOverlay.style.opacity = '1';
            }
            updateLoading(10); 
        }      
        
        // 2. ЗАПРАШИВАЕМ ТОЛЬКО 2 ВЕЩИ ПАРАЛЛЕЛЬНО (Бутстрап и Магазин)
        let bootstrapData, shopData;
        
        [bootstrapData, shopData] = await Promise.all([
            makeApiRequest("/api/v1/bootstrap", {}, 'POST', true),
            makeApiRequest('/api/v1/shop/goods?category_id=2716312', {}, 'GET', true).catch(e => { console.warn('Shop error', e); return null; })
        ]);

        if (!isCached) updateLoading(60);

        // Мгновенный блок техработ
        if (bootstrapData && bootstrapData.maintenance) {
            document.body.innerHTML = '<div style="position:fixed; top:0; left:0; display:flex; height:100vh; width:100vw; background:#121212; align-items:center; justify-content:center; flex-direction:column; color:#FFD700; font-weight:900; font-size:18px; z-index:2147483647;"><i class="fa-solid fa-gear fa-spin" style="font-size:50px; margin-bottom:15px;"></i><span>Технические работы</span><span style="color:#888; font-size:12px; margin-top:5px; font-weight:normal;">Валька уже исправляет...</span></div>';
            return; 
        }

        // === 🔥 ПРЕДЗАГРУЗКА КАРТИНОК 🔥 ===
        if (!isCached) {
            let imagesToLoad = [];
            if (bootstrapData && bootstrapData.menu) {
                if (bootstrapData.menu.skin_race_enabled && bootstrapData.menu.menu_banner_url) imagesToLoad.push(bootstrapData.menu.menu_banner_url);
                if (bootstrapData.menu.auction_enabled && bootstrapData.menu.auction_banner_url) imagesToLoad.push(bootstrapData.menu.auction_banner_url);
                if (bootstrapData.menu.checkpoint_enabled && bootstrapData.menu.checkpoint_banner_url) imagesToLoad.push(bootstrapData.menu.checkpoint_banner_url);
            }
            if (shopData && Array.isArray(shopData)) {
                shopData.slice(0, 4).forEach(item => { if (item.image_url) imagesToLoad.push(item.image_url); });
            }
            await Promise.race([ preloadImages(imagesToLoad), new Promise(resolve => setTimeout(resolve, 2000)) ]);
            updateLoading(90);
        }

        // Сохраняем свежий кэш
        if (bootstrapData) localStorage.setItem('cache_bootstrap', JSON.stringify(bootstrapData));
        if (shopData) {
            const newShopCache = JSON.parse(localStorage.getItem('shop_items_cache') || '{}');
            newShopCache[2716312] = shopData;
            localStorage.setItem('shop_items_cache', JSON.stringify(newShopCache));
        }

       // 3. РЕНДЕРИМ ВСЁ СИНХРОННО ЗА ОДИН ПРОХОД ИЗ FAT PAYLOAD
        if (bootstrapData) {
            // 1. Основной интерфейс
            await renderFullInterface(bootstrapData);
            initDynamicRaffleSlider(bootstrapData.raffles || []);
            
            // 2. Баланс (из бутстрапа)
            if (bootstrapData.user) {
                renderBalanceUI(bootstrapData.user.balance, bootstrapData.user.tickets);
                
                // 🔥 ТОРМОЗИМ ИКОНКУ ПОСЛЕ ПЕРВОЙ ЗАГРУЗКИ 🔥
                const refreshIcon = document.getElementById('refresh-icon');
                if (refreshIcon) refreshIcon.classList.remove('fa-spin');
            }

            // 3. Уведомления (из бутстрапа)
            if (bootstrapData.unread_notifications !== undefined) {
                updateNotificationBadgeUI(bootstrapData.unread_notifications);
            }

            // 4. Подарки (из бутстрапа)
            if (bootstrapData.gift_available && dom.giftContainer) {
                dom.giftContainer.classList.remove('hidden');
            }

            // 5. P2P трейды (из бутстрапа)
            if (bootstrapData.p2p_trades) {
                checkActiveTradesBackground(bootstrapData.p2p_trades);
            }
        }
        
        if (shopData) loadCategory(2716312, shopData);
        setupSlider();

        // УБРАНО: fetchNotificationsBadge(); — теперь бейджик ставится из бутстрапа выше

        if (!isCached) updateLoading(100);

        if (!isCached && dom.loaderOverlay) {
            setTimeout(() => { 
                dom.loaderOverlay.style.opacity = '0';
                setTimeout(() => dom.loaderOverlay.classList.add('hidden'), 400); 
            }, 300);
        }

    } catch (e) {
        console.error("Critical error in main:", e);
        
        // 🔥 БЕТОННЫЙ ФИКС: Если это блок ИЛИ бан — мгновенно выходим и ничего не рисуем поверх!
        if (e.message === "Security Block" || e.message === "USER_BANNED" || e.message === "Bot Auth Required") {
            if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
            return; 
        }

        // Если это обычная ошибка сети (и интерфейс не загружен)
        if (!document.querySelector('.shop-item')) { 
            if (dom.loadingText) dom.loadingText.textContent = "Критическая ошибка";
            document.body.innerHTML = `
                <div style="display:flex; height:100vh; width:100vw; background:#121212; align-items:center; justify-content:center; flex-direction:column; color:#ff3b30; font-family:sans-serif; text-align:center; padding:20px;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size:40px; margin-bottom:15px;"></i>
                    <b style="font-size:18px;">Ошибка соединения</b>
                    <p style="color:#888; margin-top:10px;">Проверьте интернет и попробуйте снова</p>
                    <button onclick="window.location.reload()" style="margin-top:25px; padding:12px 24px; background:#FFD700; color:#000; border:none; border-radius:12px; font-weight:900; text-transform:uppercase;">Перезагрузить</button>
                </div>
            `;
        }
    }
} // 🔥 <--- ДОБАВЬ ВОТ ЭТУ СКОБКУ СЮДА! ОНА ЗАКРЫВАЕТ ФУНКЦИЮ main()
// ================================================================
// SWAP (TRADE-UP КОНТРАКТ) 3 ЭТАПА
// ================================================================
let swapGivenItems = new Map(); // historyId -> { price, name, image_url }
let swapTargetItem = null; // { name, price, image_url }
let globalMarketItems = []; // Кэш витрины
let currentSwapStep = 1;

window.openSwapModal = async () => {
    const msgCount = userData.monthly_message_count || 0;
    const requiredMsgs = 300;
    
    document.getElementById('swap-modal').classList.remove('hidden');

    if (msgCount < requiredMsgs) {
        document.getElementById('swap-loader').style.display = 'none';
        document.getElementById('swap-content-area').classList.add('hidden');
        document.getElementById('swap-footer').style.display = 'none';
        
        const lockedArea = document.getElementById('swap-locked-area');
        if (lockedArea) {
            lockedArea.classList.remove('hidden');
            const p = lockedArea.querySelector('p');
            if (p) p.innerHTML = `Обменник доступен только активным зрителям. Для разблокировки нужно написать <b>300 сообщений</b> за месяц на Twitch.`;
        }
        
        const progressText = document.getElementById('swap-msg-progress');
        if (progressText) progressText.textContent = msgCount;
        
        const percent = Math.min((msgCount / requiredMsgs) * 100, 100);
        setTimeout(() => {
            const bar = document.getElementById('swap-msg-bar');
            if (bar) bar.style.width = percent + '%';
        }, 100);
        return; 
    }

    document.getElementById('swap-locked-area').classList.add('hidden');
    document.getElementById('swap-footer').style.display = 'block';
    document.getElementById('swap-content-area').classList.add('hidden');
    document.getElementById('swap-loader').style.display = 'flex';
    
    swapGivenItems.clear();
    swapTargetItem = null;
    currentSwapStep = 1;

    try {
        let marketRes = [];
        let inventoryRes = [];

        try {
            inventoryRes = await makeApiRequest('/api/v1/user/inventory', {}, 'POST', true);
            let rawMarket = await makeApiRequest('/api/v1/shop/market_cache', {}, 'GET', true).catch(() => null);
            if (!rawMarket) rawMarket = await makeApiRequest('/api/v1/shop/market_cache', {}, 'POST', true).catch(() => []);
            
            if (Array.isArray(rawMarket)) marketRes = rawMarket;
            else if (rawMarket && Array.isArray(rawMarket.items)) marketRes = rawMarket.items;
            else if (rawMarket && Array.isArray(rawMarket.data)) marketRes = rawMarket.data;
        } catch (err) {
            console.warn("Свап: ошибка загрузки API", err);
        }

        // 🔥 ФИЛЬТР МАРКЕТА (Только с картинками) + Сортировка
        globalMarketItems = marketRes
            .filter(m => m.is_available !== false && m.image_url && m.image_url.startsWith('http'))
            .sort((a, b) => parseFloat(b.price_rub) - parseFloat(a.price_rub));
        
        // 🔥 ФИЛЬТР ИНВЕНТАРЯ (Только с картинками)
        const availableItems = (Array.isArray(inventoryRes) ? inventoryRes : [])
            .filter(item => 
                ['pending', 'available'].includes(item.status) && 
                item.is_swapped !== true && 
                item.image_url && item.image_url.startsWith('http')
            );

        renderSwapInventory(availableItems);
        renderSwapMarket();
        
        document.getElementById('swap-loader').style.display = 'none';
        document.getElementById('swap-content-area').classList.remove('hidden');
        
        goToSwapStep(1);

    } catch (e) {
        document.getElementById('swap-loader').innerHTML = '<span style="color:#ff3b30;">Ошибка загрузки</span>';
    }
};

window.closeSwapModal = () => document.getElementById('swap-modal').classList.add('hidden');

function goToSwapStep(step) {
    currentSwapStep = step;
    
    document.getElementById('swap-step-1').classList.add('hidden');
    document.getElementById('swap-step-2').classList.add('hidden');
    document.getElementById('swap-step-3').classList.add('hidden');
    
    document.getElementById(`swap-step-${step}`).classList.remove('hidden');
    
    const backBtn = document.getElementById('swap-back-btn');
    const mainBtn = document.getElementById('swap-main-btn');

    if (step === 1) {
        backBtn.classList.add('hidden');
        updateSwapBtnStep1();
    } else if (step === 2) {
        backBtn.classList.remove('hidden');
        renderSwapMarket(); 
        updateSwapBtnStep2();
    } else if (step === 3) {
        backBtn.classList.remove('hidden');
        renderSwapConfirmation();
        mainBtn.disabled = false;
        mainBtn.innerText = "ПОДТВЕРДИТЬ СВАП";
    }
}

window.swapGoBack = () => {
    if (currentSwapStep > 1) goToSwapStep(currentSwapStep - 1);
};

window.handleSwapMainBtn = () => {
    if (currentSwapStep === 1) goToSwapStep(2);
    else if (currentSwapStep === 2) goToSwapStep(3);
    else if (currentSwapStep === 3) executeSwap();
};

function renderSwapInventory(items) {
    const grid = document.getElementById('swap-inventory-grid');
    if (items.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888; font-size: 12px; margin-top: 20px;">Нет предметов для обмена</div>';
        return;
    }

    grid.innerHTML = items.map(item => {
        const price = (parseFloat(item.replaced_price) > 0) ? parseFloat(item.replaced_price) : (parseFloat(item.price) || 0);
        const shortName = (item.name || "Скин").split('|').pop().trim();
        const isSelected = swapGivenItems.has(item.history_id);
        const border = isSelected ? '#34c759' : 'transparent';

        return `
            <div class="swap-card-inv" id="swap-inv-${item.history_id}" onclick="toggleGiveItem(${item.history_id}, ${price}, '${item.name.replace(/'/g, "\\'")}', '${item.image_url}')" 
                 style="background: #232325; border: 1px solid ${border}; border-radius: 10px; padding: 8px; text-align: center; cursor: pointer; position: relative; display: flex; flex-direction: column; align-items: center; height: 115px; justify-content: space-between; box-sizing: border-box; transition: 0.2s;">
                <img src="${item.image_url}" style="width: 100%; height: 50px; object-fit: contain;">
                <div style="font-size: 9px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; margin-top: 4px;">${shortName}</div>
                <div style="font-size: 11px; color: #FFD700; font-weight: bold; display: flex; align-items: center; gap: 4px;">
                    ${price} <div style="width: 10px; height: 10px; background: #ffd700; border-radius: 50%;"></div>
                </div>
                <div class="swap-check ${isSelected ? '' : 'hidden'}" style="position: absolute; top: 4px; right: 4px; background: #34c759; color: #fff; width: 14px; height: 14px; border-radius: 50%; font-size: 8px; display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-check"></i></div>
            </div>
        `;
    }).join('');
}

window.toggleGiveItem = (historyId, price, name, imageUrl) => {
    const card = document.getElementById(`swap-inv-${historyId}`);
    if (!card) return;

    if (swapGivenItems.has(historyId)) {
        swapGivenItems.delete(historyId);
        card.style.borderColor = 'transparent';
        card.style.background = '#232325';
        card.querySelector('.swap-check').classList.add('hidden');
    } else {
        if (swapGivenItems.size >= 4) return customAlert("Максимум 4 предмета!");
        swapGivenItems.set(historyId, { price, name, image_url: imageUrl });
        card.style.borderColor = '#34c759';
        card.style.background = 'rgba(52,199,89,0.05)';
        card.querySelector('.swap-check').classList.remove('hidden');
    }
    
    const totalSum = Array.from(swapGivenItems.values()).reduce((sum, item) => sum + item.price, 0);
    if (swapTargetItem && swapTargetItem.price > totalSum) {
        swapTargetItem = null;
    }

    document.getElementById('swap-give-sum').innerText = totalSum;
    updateSwapBtnStep1();
    if (window.Telegram?.WebApp?.HapticFeedback) Telegram.WebApp.HapticFeedback.selectionChanged();
};

function updateSwapBtnStep1() {
    const btn = document.getElementById('swap-main-btn');
    if (swapGivenItems.size === 0) {
        btn.disabled = true;
        btn.innerText = "ВЫБЕРИТЕ СВОИ ПРЕДМЕТЫ";
    } else {
        btn.disabled = false;
        btn.innerText = "ВЫБРАТЬ СКИН НА ЗАМЕНУ";
    }
}

// ЭТАП 2: Выбор с маркета
function renderSwapMarket() {
    const grid = document.getElementById('swap-market-grid');
    const totalSum = Array.from(swapGivenItems.values()).reduce((sum, item) => sum + item.price, 0);

    const availableMarketItems = globalMarketItems.filter(item => parseFloat(item.price_rub) <= totalSum && totalSum > 0);

    if (availableMarketItems.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888; font-size: 12px; margin-top: 20px;">Нет скинов под вашу сумму.</div>';
        return;
    }

    grid.innerHTML = availableMarketItems.map(item => {
        const priceRub = parseFloat(item.price_rub) || 0;
        const isSelected = swapTargetItem && swapTargetItem.name === item.market_hash_name;
        const border = isSelected ? '#ff9500' : 'transparent';
        const shortName = item.market_hash_name.split('|').pop().trim();

        // 🔥 ДОБАВЛЕНО: min-width: 0, overflow: hidden, width: 100% чтобы текст обрезался, а не ломал сетку
        return `
            <div class="swap-card-inv" onclick="selectTargetItem('${item.market_hash_name.replace(/'/g, "\\'")}', ${priceRub}, '${item.image_url}')"
                 style="background: #232325; border: 1px solid ${border}; border-radius: 10px; padding: 8px; text-align: center; cursor: pointer; position: relative; display: flex; flex-direction: column; align-items: center; height: 115px; justify-content: space-between; box-sizing: border-box; transition: 0.2s; min-width: 0; overflow: hidden; width: 100%;">
                <img src="${item.image_url}" style="width: 100%; height: 50px; object-fit: contain; flex-shrink: 0;">
                <div style="font-size: 9px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; margin-top: 4px;">${shortName}</div>
                <div style="font-size: 11px; color: #ffcc00; font-weight: bold; display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                    ${priceRub} <div style="width: 10px; height: 10px; background: #ffd700; border-radius: 50%;"></div>
                </div>
                <div class="swap-check ${isSelected ? '' : 'hidden'}" style="position: absolute; top: 4px; right: 4px; background: #ff9500; color: #fff; width: 14px; height: 14px; border-radius: 50%; font-size: 8px; display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-check"></i></div>
            </div>
        `;
    }).join('');
}

window.selectTargetItem = (name, price, imageUrl) => {
    if (swapTargetItem && swapTargetItem.name === name) swapTargetItem = null;
    else swapTargetItem = { name, price, image_url: imageUrl };
    
    document.getElementById('swap-take-price').innerText = swapTargetItem ? swapTargetItem.price : 0;
    renderSwapMarket();
    updateSwapBtnStep2();
    if (window.Telegram?.WebApp?.HapticFeedback) Telegram.WebApp.HapticFeedback.selectionChanged();
};

function updateSwapBtnStep2() {
    const btn = document.getElementById('swap-main-btn');
    if (!swapTargetItem) {
        btn.disabled = true;
        btn.innerText = "ВЫБЕРИТЕ СКИН С МАРКЕТА";
    } else {
        btn.disabled = false;
        btn.innerText = "ПЕРЕЙТИ К ОБМЕНУ";
    }
}

// ЭТАП 3: Подтверждение
function renderSwapConfirmation() {
    const totalSum = Array.from(swapGivenItems.values()).reduce((sum, item) => sum + item.price, 0);
    document.getElementById('swap-confirm-sum').innerText = totalSum;
    
    const giveGrid = document.getElementById('swap-confirm-give-grid');
    giveGrid.innerHTML = Array.from(swapGivenItems.values()).map(item => `
        <div style="background: rgba(0,0,0,0.3); border-radius: 6px; padding: 2px; text-align: center;">
            <img src="${item.image_url}" style="width: 30px; height: 30px; object-fit: contain;">
        </div>
    `).join('');

    if (swapTargetItem) {
        document.getElementById('swap-confirm-take-img').src = swapTargetItem.image_url;
        document.getElementById('swap-confirm-take-name').innerText = swapTargetItem.name.split('|').pop();
        document.getElementById('swap-confirm-take-price').innerText = swapTargetItem.price;
    }
}

window.executeSwap = async () => {
    if (swapGivenItems.size === 0 || !swapTargetItem) return;

    const btn = document.getElementById('swap-main-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Выполняем...';

    try {
        const payload = {
            history_ids: Array.from(swapGivenItems.keys()),
            target_market_name: swapTargetItem.name
        };

        // Делаем запрос. Бэкенд теперь вернет { success: true, item: { id, name, image_url, price } }
        const res = await makeApiRequest('/api/v1/swap/execute', payload, 'POST');
        
        // Закрываем окно самого обменника
        closeSwapModal();
        
        // ПОКАЗЫВАЕМ ПОПАП ПОБЕДЫ (Как в рулетке)
        const modal = document.getElementById('r-modal');
        const area = document.getElementById('r-area');
        const winScreen = document.getElementById('r-win');
        const topHeader = document.getElementById('r-top-header');
        const bottomProgress = document.getElementById('r-bottom-progress');

        if (modal && winScreen && res.item) {
            // Прячем элементы от обычной рулетки (ленту, гарант, заголовок кейса)
            if(topHeader) topHeader.style.display = 'none';
            if(bottomProgress) bottomProgress.style.display = 'none';
            if(area) area.style.display = 'none';

            // Генерируем экран со скином и правильными функциями магазина: claimItem и sellForTickets
            winScreen.innerHTML = `
                <h2 style="color:#ffcc00; margin-bottom:10px; text-transform:uppercase; text-shadow:0 0 20px rgba(255,215,0,0.5);">ОБМЕН УСПЕШЕН!</h2>
                <img src="${res.item.image_url}" class="win-img" style="width: 150px; height: 150px; object-fit: contain;">
                <h3 style="color:#fff; margin-top:15px; margin-bottom: 20px; font-weight: 700; text-align: center; padding: 0 10px;">${res.item.name}</h3>
                
                <button class="action-btn btn-buy" style="width: 220px; height: 48px; font-size: 14px; margin-bottom: 10px; box-shadow: 0 0 15px rgba(52, 199, 89, 0.4); background: #34c759; color: #000; border: none; font-weight: 800; border-radius: 8px;" 
                        onclick="closeRoulette(); claimItem(${res.item.id})">
                    ЗАБРАТЬ В STEAM
                </button>
                
                <button class="action-btn" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: #ccc; width: 220px; height: 44px; margin-bottom: 15px; border-radius: 8px;" 
                        onclick="closeRoulette(); sellForTickets(${res.item.id}, ${res.item.price})">
                    ПРОДАТЬ ЗА ${res.item.price} 🎟️
                </button>
                
                <button class="action-btn btn-secondary-action" style="width: 220px; background: transparent; border: none; color: #888;" 
                        onclick="closeRoulette();">
                    Закрыть
                </button>
            `;
            
            winScreen.style.display = 'flex';
            modal.style.display = 'flex';
        } else {
            // Резервный вариант, если HTML рулетки почему-то не найден
            customAlert(`✅ Успешно! Вы получили:\n${swapTargetItem.name}`);
        }
        
        // Синхронизируем визуальный баланс
        checkBalance(true); 
        
        // Обновляем данные, если функция существует
        if (typeof loadData === 'function') loadData(true); 
        
    } catch (e) {
        // Ошибка сама покажется через customAlert из твоего makeApiRequest
        console.error("Ошибка свапа:", e);
    } finally {
        // Возвращаем кнопку в исходное состояние
        btn.disabled = false;
        btn.innerText = "ПОДТВЕРДИТЬ СВАП";
    }
};

// ================================================================
// ОКНО ТРАСТ-ФАКТОРА (ПРЕМИУМ ВЕРСИЯ - ИДЕАЛЬНАЯ ИЕРАРХИЯ)
// ================================================================
window.openTrustModal = () => {
    // Получаем баллы пользователя (если нет - ставим дефолт 30)
    const score = userData.trust_score ? parseFloat(userData.trust_score) : 30.0;
    const percent = Math.max(0, Math.min(100, score)); 
    
    // Статусы
    let levelText = 'Базовый';
    let levelColor = '#8e8e93';
    let multiplierText = 'Цены x2 🪙';
    
    if (score < 30) { 
        levelText = 'Пониженный'; 
        levelColor = '#ff3b30'; 
        multiplierText = 'Цены x3 💸';
    } else if (score >= 80) { 
        levelText = 'Повышенный'; 
        levelColor = '#34c759'; 
        multiplierText = 'Цены x1 💎';
    }

    const html = `
        <div style="max-height: 60vh; overflow-y: auto; overflow-x: hidden; padding: 0 5px; text-align: center; color: #ddd; font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; box-sizing: border-box;">
            
            <div style="font-size: 11px; color: #888; line-height: 1.3; width: 100%; text-align: center;">
Система поощряет активных зрителей.<br>Ваш уровень траста напрямую влияет на цены в магазине.
            </div>

            <div style="display: flex; justify-content: center; align-items: center; gap: 6px; font-size: 10px; line-height: 1; width: 100%;">
                <span style="color: #777; font-weight: 600;">СТАТУС:</span>
                <span style="color: ${levelColor}; font-weight: 800; text-transform: uppercase; background: ${levelColor}15; padding: 3px 6px; border-radius: 4px; border: 1px solid ${levelColor}40; letter-spacing: 0.5px;">${levelText}</span>
                <span style="color: #555;">•</span>
                <span style="color: #aaa; font-weight: 600;">${multiplierText}</span>
            </div>

            <div style="display: flex; align-items: flex-end; justify-content: center; line-height: 0.8;">
                <span style="font-size: 34px; font-weight: 900; color: ${levelColor}; font-family: 'SF Mono', Consolas, monospace; text-shadow: 0 0 12px ${levelColor}40; letter-spacing: -1px; margin: 0;">${score.toFixed(1)}</span>
                <span style="font-size: 11px; color: #666; font-weight: 700; margin-left: 3px; margin-bottom: 3px;">/ 100</span>
            </div>

            <div style="position: relative; width: 85%; margin-top: -20px; margin-bottom: 0;">
                
            <div style="position: absolute; top: 45px; left: ${percent}%; transform: translateX(-50%); color: #fff; font-size: 16px; z-index: 2; transition: left 0.4s ease; display: flex; justify-content: center; align-items: center; line-height: 1;">
                <i class="fa-solid fa-caret-down"></i>
            </div>
                
                <div style="width: 100%; height: 6px; border-radius: 3px; background: linear-gradient(to right, #ff3b30 0%, #3a3a3c 30%, #3a3a3c 80%, #34c759 100%); box-shadow: 0 0 10px ${levelColor}40;"></div>
                
                <div style="position: relative; width: 100%; height: 10px; margin-top: -35px;">
                    <span style="position: absolute; top: 0; left: 0%; transform: translateX(-50%); color: #666; font-size: 10px; font-weight: 800; line-height: 1;">0</span>
                    <span style="position: absolute; top: 0; left: 30%; transform: translateX(-50%); color: #8e8e93; font-size: 10px; font-weight: 800; line-height: 1;">30</span>
                    <span style="position: absolute; top: 0; left: 80%; transform: translateX(-50%); color: #34c759; font-size: 10px; font-weight: 800; line-height: 1;">80</span>
                    <span style="position: absolute; top: 0; left: 100%; transform: translateX(-50%); color: #666; font-size: 10px; font-weight: 800; line-height: 1;">100</span>
                </div>
            </div>

           <details class="trust-faq-accordion" style="background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); text-align: left; width: 100%; box-sizing: border-box; display: block;"><summary style="padding: 10px 12px; font-weight: 700; font-size: 11px; color: #ccc; cursor: pointer; user-select: none; outline: none; list-style: none; display: flex; justify-content: space-between; align-items: center; background: rgba(255,215,0,0.05); line-height: 1; border-radius: 8px; margin: 0;"><span style="display: flex; align-items: center; gap: 8px; text-transform: uppercase; letter-spacing: 0.5px;"><i class="fa-solid fa-circle-info" style="color: #FFD700; font-size: 14px;"></i> Как работает система?</span><i class="fa-solid fa-chevron-down accordion-arrow" style="font-size: 12px; color: #888; transition: transform 0.2s;"></i></summary><div style="padding: 10px 12px; font-size: 10px; color: #aaa; background: rgba(0,0,0,0.2); border-radius: 0 0 8px 8px; margin: 0; display: flex; flex-direction: column; gap: 6px;"><div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin: 0;"><span>Twitch (Сообщения + Просмотр)</span> <b style="color: #34c759; font-family: 'SF Mono', monospace;">Макс. 80 баллов</b></div><div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin: 0;"><span>Telegram (Общение в чате)</span> <b style="color: #34c759; font-family: 'SF Mono', monospace;">Макс. 80 баллов</b></div><div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin: 0;"><span>Ежедневный Гринд (Стрик)</span> <b style="color: #34c759; font-family: 'SF Mono', monospace;">+0.5 балла/день</b></div><div style="padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); color: #ff3b30; font-weight: 600; line-height: 1.3; margin-top: 2px;">* Механика выхода: Для «Пониженных» нормы активности снижены в 2 раза, чтобы быстрее вернуться в «Базовый» статус.</div></div></details>            
            <style>
                .trust-faq-accordion > summary::-webkit-details-marker { display: none; }
                .trust-faq-accordion[open] .accordion-arrow { transform: rotate(180deg); }
                .trust-faq-accordion[open] > summary { border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
            </style>
        </div>
    `;
    
    showShopModal({
        title: `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; font-size:15px; font-weight: 900; color: #fff; line-height: 1; letter-spacing: 0.5px;">
                ТРАСТ-ФАКТОР
                <i class="fa-solid fa-xmark" style="color:#8e8e93; font-size:16px; cursor:pointer; padding: 0 5px; transition: color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#8e8e93'" onclick="document.querySelector('.custom-confirm-overlay').remove();"></i>
            </div>
        `,
        subtitle: html,
        confirmText: "ПОНЯТНО",
        confirmClass: "btn-yellow-modal", 
        showCancel: false,
        onConfirm: (close) => close()
    });
};
// ================================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ (УНИВЕРСАЛЬНАЯ БРОНЯ)
// ================================================================
try {
    // 1. ИНИЦИАЛИЗАЦИЯ TELEGRAM (только если это НЕ ВК)
    if (!window.isVk && window.Telegram?.WebApp) {
        console.log("🤖 Инициализация Telegram SDK...");
        const tg = Telegram.WebApp;
        tg.ready();
        tg.expand(); 
        
        if (typeof tg.disableVerticalSwipes === 'function') {
            try { tg.disableVerticalSwipes(); } catch(e) {}
        }
        
        const platform = tg.platform || 'unknown';
        if (platform === 'ios') document.body.classList.add('ios-mode');
        else if (platform === 'android') document.body.classList.add('android-mode');
        else document.body.classList.add('desktop-mode');

        if (!document.body.classList.contains('desktop-mode') && tg.isVersionAtLeast && tg.isVersionAtLeast('6.1')) {
            if (typeof tg.requestFullscreen === 'function') {
                try { tg.requestFullscreen(); } catch (e) {}
            }
        }
    } 
    // 2. ИНИЦИАЛИЗАЦИЯ VK (только если флаг ВК активен)
    else if (window.isVk) {
        console.log("🚀 Инициализация VK SDK...");
        document.body.classList.add('vk-mode'); 
        if (typeof vkBridge !== 'undefined') {
            try { vkBridge.send('VKWebAppInit'); } catch(e) {}
        }
    }
    
    // 3. ОБЩИЙ ЗАПУСК ИНТЕРФЕЙСА (Работает везде)
    setupNewUI();
    initPullToRefresh();
    initBottomSwipe(); // Запускаем наш нижний свайп
    initSwipeTabs(); 

    // Запускаем основную логику загрузки данных
    main();

    // 4. ФОНОВЫЕ ПРОЦЕССЫ
    clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => { if (!document.hidden) refreshDataSilently(); }, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshDataSilently(); });

} catch (e) { 
    console.error("Global init error", e); 
    
    // 🔥 БЕТОННЫЙ ЩИТ
    if (e.message === "Security Block" || e.message === "USER_BANNED") {
        if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
    } else {
        customAlert("Критическая ошибка при запуске. Попробуйте перезагрузить приложение.");
    }
}
