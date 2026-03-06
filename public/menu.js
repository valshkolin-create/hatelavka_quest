// ================================================================
// 0. УМНЫЙ ПОИСК ПАРАМЕТРОВ VK
// ================================================================
(function initVkParams() {
    window.vkParams = null; // Сбрасываем

    // Функция проверки: строка похожа на параметры ВК?
    const isValid = (str) => str && str.includes('vk_user_id') && str.includes('sign');

    try {
        console.log("🔍 [VK Init] Начинаем поиск параметров...");

        // 1. Ищем в location.search (стандарт)
        let s = window.location.search;
        if (s.startsWith('?')) s = s.slice(1);
        if (isValid(s)) {
            window.vkParams = s;
            console.log("✅ Нашли в search");
            return;
        }

        // 2. Ищем в location.hash (часто бывает там)
        let h = window.location.hash;
        if (h.startsWith('#')) h = h.slice(1);
        // Иногда хеш начинается с ?, убираем его тоже
        if (h.startsWith('?')) h = h.slice(1);
        
        if (isValid(h)) {
            window.vkParams = h;
            console.log("✅ Нашли в hash");
            return;
        }

        // 3. Ищем в window.name (хранилище iframe)
        if (isValid(window.name)) {
            window.vkParams = window.name;
            console.log("✅ Нашли в window.name");
            return;
        }

        // 4. Пытаемся выдрать из href (последний шанс)
        // Ищем подстроку, начинающуюся с vk_user_id и до конца
        const href = window.location.href;
        const match = href.match(/(vk_user_id=[^#]*)/);
        if (match && match[1] && match[1].includes('sign')) {
             window.vkParams = match[1];
             console.log("✅ Выдрали из href через Regex");
             return;
        }

        console.warn("⚠️ Параметры VK не найдены в URL!");

    } catch (e) {
        console.error("VK Init Error:", e);
    }
})();

// ================================================================
// 1. ОПРЕДЕЛЕНИЕ ПЛАТФОРМЫ
// ================================================================

function getSearchParam(name) {
    try {
        const url = new URL(window.location.href);
        return url.searchParams.get(name);
    } catch(e) { return null; }
}

let isVk = !!(window.vkParams || getSearchParam('vk_app_id'));

// Принудительный режим для iframe
if (!isVk && window.self !== window.top && !window.Telegram?.WebApp?.initData) {
    console.log("⚠️ Iframe detected. Force VK mode.");
    isVk = true;
}

// Инициализация
if (isVk) {
    console.log("🚀 Запуск VK. Параметры:", window.vkParams ? "ЕСТЬ" : "НЕТ");
    // --- АДАПТАЦИЯ CSS: Добавляем класс только для VK ---

if (isVk) {

    document.documentElement.classList.add('vk-mode');

    console.log("🎨 Включен режим верстки для VK");

}
    if (typeof vkBridge !== 'undefined') {
        vkBridge.send('VKWebAppInit');
    }
} else {
    console.log("✈️ Запуск Telegram");
    try {
        window.Telegram?.WebApp?.ready();
        window.Telegram?.WebApp?.expand();
        setTimeout(() => window.Telegram?.WebApp?.expand(), 500);
    } catch (e) {}
}

// ================================================================
// 2. ФУНКЦИЯ АВТОРИЗАЦИИ (С ЗАПРОСОМ К BRIDGE)
// ================================================================
function getAuthPayload() {
    if (isVk) {
        // Если параметры нашли при старте — отдаем их
        if (window.vkParams) {
            return { initData: window.vkParams, platform: 'vk' };
        } 
        
        // 🔥 ЕСЛИ ПАРАМЕТРОВ НЕТ — ВОЗВРАЩАЕМ ПУСТОТУ (Бэкенд даст 401)
        // Но! Мы сейчас добавим логику в main(), чтобы перезапросить их.
        console.error("❌ [Critical] Отправляем пустой payload, так как params не найдены!");
        return { initData: '', platform: 'vk' };
    } else {
        return {
            initData: window.Telegram?.WebApp?.initData || '',
            platform: 'tg'
        };
    }
}

// --- ВАЖНО: Добавляем функцию получения параметров через Bridge ---
// Вставь это ПЕРЕД const dom = { ... }
async function fetchVkParamsFromBridge() {
    if (typeof vkBridge === 'undefined') return null;
    try {
        console.log("🔄 Запрашиваем параметры у VK Bridge...");
        const data = await vkBridge.send('VKWebAppGetLaunchParams');
        if (data && data.vk_user_id) {
            // Собираем строку запуска вручную
            const params = Object.keys(data)
                .map(key => `${key}=${encodeURIComponent(data[key])}`)
                .join('&');
            console.log("✅ VK Bridge вернул параметры!");
            window.vkParams = params;
            return params;
        }
    } catch (e) {
        console.error("Bridge GetParams Error:", e);
    }
    return null;
}

try {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
    
    // 👇 НОВОЕ: Официальная блокировка свайпа вниз от Telegram
    if (window.Telegram.WebApp.disableVerticalSwipes) {
        window.Telegram.WebApp.disableVerticalSwipes();
    }
    
    setTimeout(() => window.Telegram.WebApp.expand(), 100);
    setTimeout(() => window.Telegram.WebApp.expand(), 500);
} catch (e) {
    console.log('Telegram WebApp is not available');
}

// ================================================================
const dom = {
    loaderOverlay: document.getElementById('loader-overlay'),
    loadingText: document.getElementById('loading-text'),
    loadingBarFill: document.getElementById('loading-bar-fill'),
    mainContent: document.getElementById('main-content'),
    fullName: document.getElementById('fullName'),
    navAdmin: document.getElementById('nav-admin'),
    footerItems: document.querySelectorAll('.footer-item'),
    
    // Вьюхи
    viewDashboard: document.getElementById('view-dashboard'),
    viewQuests: document.getElementById('view-quests'),
    
    // Модалки бонусов и уведомлений
    promocodeOverlay: document.getElementById('promocode-overlay'),
    rewardClaimedOverlay: document.getElementById('reward-claimed-overlay'),
    rewardCloseBtn: document.getElementById('reward-close-btn'),
    ticketsClaimedOverlay: document.getElementById('tickets-claimed-overlay'),
    ticketsClaimCloseBtn: document.getElementById('tickets-claim-close-btn'),
    
    newPromoNotification: document.getElementById('new-promo-notification'),
    closePromoNotification: document.getElementById('close-promo-notification'),

    // Подарок
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

    // Туториал
    tutorialOverlay: document.getElementById('tutorial-overlay'),
    tutorialModal: document.getElementById('tutorial-modal'),
    tutorialTitle: document.getElementById('tutorial-title'),
    tutorialText: document.getElementById('tutorial-text'),
    tutorialStepCounter: document.getElementById('tutorial-step-counter'),
    tutorialNextBtn: document.getElementById('tutorial-next-btn'),
    tutorialSkipBtn: document.getElementById('tutorial-skip-btn'),
    startTutorialBtn: document.getElementById('start-tutorial-btn'),

    // Еженедельные цели
    weeklyGoalsContainer: document.getElementById('weekly-goals-container-placeholder'),
    weeklyGoalsTrigger: document.getElementById('weekly-goals-trigger'),
    weeklyGoalsBadge: document.getElementById('weekly-goals-badge'),    
    weeklyModalOverlay: document.getElementById('weekly-modal-overlay'),
    weeklyModalCloseBtn: document.getElementById('weekly-modal-close-btn'),
    weeklyGoalsListContainer: document.getElementById('weekly-goals-list-container'),
    weeklyModalCounter: document.getElementById('weekly-modal-counter'),
    weeklyGoalsAccordion: document.querySelector('.weekly-goals-accordion')
};

let lastShopStatus = null;
let originalShopHTML = null;
let bonusGiftEnabled = false;
let userData = {};
let allQuests = [];
let heartbeatInterval = null;

// --- СЛАЙДЕР ПЕРЕМЕННЫЕ ---
let currentSlideIndex = 0;
let slideInterval;
let sliderAbortController = null; 
let lastSliderSignature = '';
const slideDuration = 15000; 

// --- ФУНКЦИИ БЛОКИРОВКИ СКРОЛЛА ---
function lockAppScroll() {
    document.body.classList.add('no-scroll');
    const content = document.getElementById('main-content');
    if (content) content.classList.add('no-scroll');
}

function unlockAppScroll() {
    document.body.classList.remove('no-scroll');
    const content = document.getElementById('main-content');
    if (content) content.classList.remove('no-scroll');
}

// --- УТИЛИТЫ ---
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, match => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'})[match]);
}

function updateLoading(percent) {
    if (dom.loadingText) dom.loadingText.textContent = Math.floor(percent) + '%';
    if (dom.loadingBarFill) dom.loadingBarFill.style.width = Math.floor(percent) + '%';
}

function switchView(targetViewId) {
    // Скрываем все основные вкладки
    dom.viewDashboard.classList.add('hidden');
    dom.viewQuests.classList.add('hidden');
    const shopView = document.getElementById('view-shop');
    if(shopView) shopView.classList.add('hidden');
    
    // Показываем целевую
    const targetEl = document.getElementById(targetViewId);
    if (targetEl) targetEl.classList.remove('hidden');
    
    // Переключаем иконку в футере
    dom.footerItems.forEach(item => item.classList.remove('active'));
    
    // Вычисляем ID кнопки (view-quests -> nav-quests)
    const parts = targetViewId.split('-');
    if (parts.length > 1) {
        const navId = 'nav-' + parts[1];
        const navEl = document.getElementById(navId);
        if (navEl) navEl.classList.add('active');
    }
}

async function makeApiRequest(url, body = {}, method = 'POST', isSilent = false) {
    if (!isSilent && dom.loaderOverlay) dom.loaderOverlay.classList.remove('hidden');
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        const options = { 
            method, 
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal 
        };
        
        if (method !== 'GET') {
            // 👇 ИСПРАВЛЕНИЕ: Используем нашу универсальную функцию
            const auth = getAuthPayload();
            options.body = JSON.stringify({ ...body, ...auth }); 
        }
        
        const response = await fetch(url, options);
        clearTimeout(timeoutId); 

        if (response.status === 429) throw new Error('Cooldown active');
        if (response.status === 204) return null;
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || result.message || 'Ошибка сервера');
        return result;
    } catch (e) {
        if (e.name === 'AbortError') e.message = "Превышено время ожидания ответа от сервера.";
        // В ВК нет Telegram.WebApp.showAlert, используем alert или консоль
        if (e.message !== 'Cooldown active' && !isSilent) {
             if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showAlert) {
                 Telegram.WebApp.showAlert(`Ошибка: ${e.message}`);
             } else {
                 alert(`Ошибка: ${e.message}`); // Фолбек для ВК
             }
        }
        throw e;
    } finally {
        if (!isSilent && dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
    }
}

// --- ПРОВЕРКА ТЕХ. РЕЖИМА И ПОДАРКА ---
async function checkMaintenance() {
    try {
        const res = await fetch('/api/v1/bootstrap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // 👇 ГЛАВНОЕ ИЗМЕНЕНИЕ: Используем нашу умную функцию авторизации
            body: JSON.stringify(getAuthPayload()) 
        });

        if (res.ok) {
            const data = await res.json();
            
            // Если включен тех. режим
            if (data.maintenance) {
                window.location.href = '/'; 
                return;
            }
            
            // Настройка отображения подарка
            if (dom.giftContainer && data.menu) {
                if (data.menu.bonus_gift_enabled) {
                    dom.giftContainer.classList.remove('hidden');
                } else {
                    dom.giftContainer.classList.add('hidden');
                }
            }
        }
    } catch (e) { console.error("Ошибка настроек:", e); }
}

// -------------------------------------------------------------
// 1. СЛАЙДЕР (1 в 1 как в рабочем меню)
// -------------------------------------------------------------
function setupSlider() {
        const container = document.getElementById('main-slider-container');
        if (!container) return;

        // Находим видимые слайды
        const allSlides = container.querySelectorAll('.slide');
        const visibleSlides = Array.from(allSlides).filter(slide => {
            return slide.style.display !== 'none';
        });

        // 1. ГЕНЕРИРУЕМ "ПОДПИСЬ" ТЕКУЩЕГО СОСТОЯНИЯ
        // (Собираем ID или ссылки слайдов в одну строку)
        const currentSignature = visibleSlides.map(s => s.dataset.event || s.href || s.src).join('|');

        // 2. ПРОВЕРКА: Если слайды те же самые, что и в прошлый раз — ВЫХОДИМ
        // Это предотвращает сброс кликов и лаги при загрузке картинок
        if (currentSignature === lastSliderSignature && sliderAbortController) {
            // Слайдер уже настроен и актуален, ничего не делаем
            return;
        }

        // Если что-то изменилось, запоминаем новую подпись и настраиваем заново
        lastSliderSignature = currentSignature;

        // 3. ОЧИСТКА (Только если реально меняем конфигурацию)
        if (slideInterval) clearInterval(slideInterval);
        if (sliderAbortController) sliderAbortController.abort();
        
        sliderAbortController = new AbortController();
        const signal = sliderAbortController.signal;

        const wrapper = container.querySelector('.slider-wrapper');
        const dotsContainer = container.querySelector('.slider-dots');
        
        // --- Очистка кнопок ---
        let prevBtnOld = document.getElementById('slide-prev-btn');
        let nextBtnOld = document.getElementById('slide-next-btn');
        
        // Клонируем, чтобы убрать старые (возможно дублирующиеся) слушатели
        let prevBtn = prevBtnOld.cloneNode(true);
        let nextBtn = nextBtnOld.cloneNode(true);
        
        prevBtnOld.parentNode.replaceChild(prevBtn, prevBtnOld);
        nextBtnOld.parentNode.replaceChild(nextBtn, nextBtnOld);
        // ------------------------------------------------------------

        // Если слайдов 0
        if (visibleSlides.length === 0) {
            return;
        } else {
             container.style.display = ''; 
        }

        // Если слайд 1
        if (visibleSlides.length <= 1) {
            container.style.display = '';
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
            if (dotsContainer) dotsContainer.style.display = 'none';
            const firstVisibleIndex = Array.from(allSlides).indexOf(visibleSlides[0]);
            if (wrapper) wrapper.style.transform = `translateX(-${firstVisibleIndex * 100}%)`;
            return;
        }
        
        // Если слайдов > 1
        prevBtn.style.display = 'flex';
        nextBtn.style.display = 'flex';
        if (dotsContainer) dotsContainer.style.display = 'flex';
        
        // Генерация точек
        dotsContainer.innerHTML = '';
        visibleSlides.forEach((_, i) => {
            const dot = document.createElement('button');
            dot.classList.add('dot');
            // Для точек используем signal не обязательно, но для чистоты можно
            dot.onclick = () => {
                showSlide(i);
                resetSlideInterval();
            };
            dotsContainer.appendChild(dot);
        });
        const dots = dotsContainer.querySelectorAll('.dot');

        function showSlide(index) {
            if (index >= visibleSlides.length) index = 0;
            if (index < 0) index = visibleSlides.length - 1;

            if (!wrapper || !dots[index]) return;
            
            wrapper.style.transform = `translateX(-${index * 100}%)`;
            dots.forEach(dot => dot.classList.remove('active'));
            dots[index].classList.add('active');
            currentSlideIndex = index;
        }

        function nextSlide() {
            showSlide(currentSlideIndex + 1);
        }

        function prevSlide() {
            showSlide(currentSlideIndex - 1);
        }

        function resetSlideInterval() {
            clearInterval(slideInterval);
            slideInterval = setInterval(nextSlide, slideDuration);
        }

        // Вешаем события на кнопки
        prevBtn.addEventListener('click', () => {
            prevSlide();
            resetSlideInterval();
        }, { signal: signal }); // Привязываем к контроллеру

        nextBtn.addEventListener('click', () => {
            nextSlide();
            resetSlideInterval();
        }, { signal: signal });
        
        // === ЛОГИКА СВАЙПА ===
        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let isSwiping = false;

        container.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchEndX = touchStartX;
            isSwiping = false;
        }, { passive: true, signal: signal });

        container.addEventListener('touchmove', (e) => {
            if (touchStartX === 0 && touchStartY === 0) return;

            const touchCurrentX = e.touches[0].clientX;
            const touchCurrentY = e.touches[0].clientY;
            
            const diffX = touchStartX - touchCurrentX;
            const diffY = touchStartY - touchCurrentY;

            // Если движение горизонтальное
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
                isSwiping = true;
                // Блокируем скролл страницы
                if (e.cancelable) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
            touchEndX = touchCurrentX;
        }, { passive: false, signal: signal });

        container.addEventListener('touchend', (e) => {
            if (isSwiping) {
                e.stopPropagation();
                const diff = touchStartX - touchEndX;
                const swipeThreshold = 50;

                if (Math.abs(diff) > swipeThreshold) {
                    if (diff > 0) nextSlide();
                    else prevSlide();
                    resetSlideInterval();
                }
            }
            // Сброс
            touchStartX = 0;
            touchStartY = 0;
            isSwiping = false;
        }, { passive: true, signal: signal });
        
        // Блокировка клика ТОЛЬКО если был свайп
        allSlides.forEach(slide => {
            slide.onclick = (e) => {
                if (isSwiping) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
            };
        });

        // Проверяем индекс и запускаем
        if (currentSlideIndex >= visibleSlides.length) {
            currentSlideIndex = 0;
        }

        showSlide(currentSlideIndex);
        resetSlideInterval();
    }

// --- ЕЖЕНЕДЕЛЬНЫЕ ЦЕЛИ (РЕНДЕР СВОДКИ) ---
function renderWeeklyGoals(data) {
    const listContainer = dom.weeklyGoalsListContainer;
    const triggerContainer = dom.weeklyGoalsTrigger;
    const badgeElement = dom.weeklyGoalsBadge;
    const counterElement = dom.weeklyModalCounter;

    const isAdmin = userData && userData.is_admin;
    const shouldShow = data && data.system_enabled;

    if (!data || (!shouldShow && !isAdmin) || !data.goals || data.goals.length === 0) {
        if (triggerContainer) triggerContainer.classList.add('hidden');
        return;
    }
    if (triggerContainer) triggerContainer.classList.remove('hidden');
    if (counterElement) counterElement.textContent = `${data.completed_goals} / ${data.total_goals}`;

    let hasUnclaimedReward = false;
    if (data.goals.some(g => g.is_complete && g.reward_type === 'tickets' && !g.small_reward_claimed)) hasUnclaimedReward = true;
    if (data.super_prize_ready_to_claim && !data.super_prize_claimed) hasUnclaimedReward = true;

    if (badgeElement) {
        if (hasUnclaimedReward) badgeElement.classList.remove('hidden');
        else badgeElement.classList.add('hidden');
    }

    if (!listContainer) return;

    const goalsHtml = data.goals.map(goal => {
        if (goal.small_reward_claimed) return ''; 
        const progress = goal.current_progress || 0;
        const target = goal.target_value || 1;
        const percent = target > 0 ? Math.min(100, (progress / target) * 100) : 0;
        const isCompleted = goal.is_complete || false;

        let buttonHtml = '';
        if (goal.reward_type === 'tickets' && goal.reward_value > 0) {
            if (isCompleted) {
                buttonHtml = `<button class="weekly-goal-reward-btn claim-task-reward-btn" data-goal-id="${goal.id}">Забрать (+${goal.reward_value})</button>`;
            } else {
                buttonHtml = `<button class="weekly-goal-reward-btn" disabled>+${goal.reward_value} 🎟️</button>`;
            }
        }

        let iconClass = 'fa-solid fa-star';
        if (goal.task_type === 'manual_quest_complete') iconClass = 'fa-solid fa-user-check';
        else if (goal.task_type.includes('twitch')) iconClass = 'fa-brands fa-twitch';
        
        return `
            <div class="weekly-goal-item ${isCompleted ? 'completed' : ''}">
                <div class="weekly-goal-icon"><i class="${iconClass}"></i></div>
                <div class="weekly-goal-info">
                    <h3 class="weekly-goal-title">${escapeHTML(goal.title)}</h3>
                    <div class="weekly-goal-progress-row">
                        <div class="weekly-goal-progress-bar">
                            <div class="weekly-goal-progress-fill" style="width: ${percent}%;"></div>
                            <div class="weekly-goal-progress-content">
                                <span class="weekly-goal-progress-text">${Math.floor(percent)}%</span>
                            </div>
                        </div>
                        ${buttonHtml}
                    </div>
                </div>
            </div>`;
    }).join('');

    let superPrizeHtml = '';
    if (data.total_goals > 0) {
        const prizeInfo = data.super_prize_info;
        let prizeButtonHtml = '';
        if (data.super_prize_claimed) prizeButtonHtml = `<button class="claim-reward-button" disabled>Суперприз получен!</button>`;
        else if (data.super_prize_ready_to_claim) prizeButtonHtml = `<button id="claim-super-prize-btn" class="claim-reward-button">Забрать Суперприз!</button>`;
        else prizeButtonHtml = `<button class="claim-reward-button" disabled>Выполните все задания</button>`;

        superPrizeHtml = `
            <div class="weekly-super-prize-card">
                <h2 class="quest-title">${escapeHTML(prizeInfo.super_prize_description || 'Главный приз')}</h2>
                ${prizeButtonHtml}
            </div>`;
    }

    listContainer.innerHTML = `<div class="weekly-goals-container">${goalsHtml}${superPrizeHtml}</div>`;
}

// -------------------------------------------------------------
// 2. ОБНОВЛЕНИЕ ЯРЛЫКОВ (Возвращаем логику Оффлайн-стрима 1 в 1)
// -------------------------------------------------------------
function updateShortcutStatuses(userData, allQuests) {
    const makeTileCentered = (el) => {
        if (!el) return;
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        el.style.alignItems = 'center';     
        el.style.justifyContent = 'center'; 
        el.style.textAlign = 'center';      
    };

    // 1. Обновляем Челлендж (shortcut-challenge)
    const chalStatus = document.getElementById('metro-challenge-status');
    const chalFill = document.getElementById('metro-challenge-fill');
    const shortcutChal = document.getElementById('shortcut-challenge');
    
    if (chalStatus && chalFill && shortcutChal) {
        makeTileCentered(shortcutChal); 

        // Удаляем старые элементы, чтобы не дублировались
        const oldWrapper = document.getElementById('offline-wrapper');
        if (oldWrapper) oldWrapper.remove();
        
        // Сброс видимости для онлайн-режима
        chalStatus.style.display = '';
        chalStatus.style.marginBottom = '5px'; 
        if (chalFill.parentElement) chalFill.parentElement.style.display = ''; 

        const isOnline = userData.is_stream_online === true;

        if (!isOnline) {
            // --- СТРИМ ОФФЛАЙН ---
            // Скрываем стандартные элементы
            chalStatus.style.display = 'none';
            if (chalFill.parentElement) chalFill.parentElement.style.display = 'none';

            // Создаем контейнер-обертку, чтобы всё было идеально по центру
            const wrapper = document.createElement('div');
            wrapper.id = 'offline-wrapper';
            Object.assign(wrapper.style, {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
            });

            // Текст "Стрим оффлайн"
            const offlineText = document.createElement('div');
            offlineText.textContent = 'Стрим оффлайн';
            Object.assign(offlineText.style, {
                color: '#ff453a',
                fontSize: '12px',
                fontWeight: '600',
                lineHeight: '1.2'
            });

            // Маленькая кнопка "Расписание"
            const btn = document.createElement('div');
            btn.innerHTML = '<i class="fa-regular fa-calendar-days"></i> Расписание';
            
            Object.assign(btn.style, {
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: '#fff',
                padding: '5px 10px',
                borderRadius: '8px',
                fontSize: '10px',
                fontWeight: '500',
                cursor: 'pointer',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
            });

            btn.onclick = (e) => {
                e.stopPropagation(); 
                const modal = document.getElementById('schedule-modal-overlay');
                if (modal) modal.classList.remove('hidden');
            };

            // Собираем всё вместе
            wrapper.appendChild(offlineText);
            wrapper.appendChild(btn);
            shortcutChal.appendChild(wrapper);

        } else {
            // --- СТРИМ ОНЛАЙН ---
            if (userData.challenge) {
                const ch = userData.challenge;
                const prog = ch.progress_value || 0;
                const target = ch.target_value || 1;
                const percent = Math.min(100, (prog / target) * 100);

                if (ch.claimed_at) {
                    chalStatus.textContent = "Награда получена";
                    chalStatus.classList.add('metro-status-done');
                    chalFill.style.width = '100%';
                    chalFill.classList.add('metro-fill-done');
                } else if (prog >= target) {
                    chalStatus.textContent = "ЗАБРАТЬ!";
                    chalStatus.classList.add('metro-status-done');
                    chalFill.style.width = '100%';
                    chalFill.classList.add('metro-fill-done');
                } else {
                    chalStatus.textContent = `${prog} / ${target}`;
                    chalStatus.classList.remove('metro-status-done');
                    chalFill.style.width = `${percent}%`;
                    chalFill.classList.remove('metro-fill-done');
                }
            } else {
                chalStatus.textContent = "Нет активного";
                chalFill.style.width = '0%';
            }
        }
    }

    // 2. Обновляем Испытание (shortcut-quests)
    const shortcutQuest = document.getElementById('shortcut-quests');
    const questStatus = document.getElementById('metro-quest-status');
    const questFill = document.getElementById('metro-quest-fill');

    if (shortcutQuest && questStatus && questFill) {
        makeTileCentered(shortcutQuest);
        questStatus.style.marginBottom = '5px';

        const activeId = userData.active_quest_id;
        const isOnline = userData.is_stream_online === true;

        if (!activeId) {
            // Если квест не выбран, пишем куда именно нажимать в зависимости от стрима
            if (isOnline) {
                questStatus.innerHTML = '<i class="fa-brands fa-twitch"></i> Выбрать Twitch';
            } else {
                questStatus.innerHTML = '<i class="fa-brands fa-telegram"></i> Выбрать TG';
            }
            questStatus.style.fontSize = "11px";
            questFill.style.width = '0%';
            questStatus.classList.remove('metro-status-done');
        } else {
            const quest = allQuests.find(q => q.id === activeId);
            if (quest) {
                const prog = userData.active_quest_progress || 0;
                const target = quest.target_value || 1;
                const percent = Math.min(100, (prog / target) * 100);
                
                if (prog >= target) {
                    questStatus.textContent = "ГОТОВО";
                    questStatus.classList.add('metro-status-done');
                    questFill.style.width = '100%';
                    questFill.classList.add('metro-fill-done');
                } else {
                    let suffix = "";
                    if(quest.quest_type && quest.quest_type.includes('uptime')) suffix = " мин.";
                    
                    questStatus.textContent = `${prog} / ${target}${suffix}`;
                    questStatus.classList.remove('metro-status-done');
                    questFill.style.width = `${percent}%`;
                    questFill.classList.remove('metro-fill-done');
                }
            } else {
                questStatus.textContent = "...";
            }
        }
    }
}

// --- ФОНОВОЕ ОБНОВЛЕНИЕ (HEARTBEAT) ---
async function refreshDataSilently() {
    if (!window.Telegram || !Telegram.WebApp || !Telegram.WebApp.initData) return;

    try {
        const hbData = await makeApiRequest("/api/v1/user/heartbeat", {}, 'POST', true);
        
        if (hbData) {
            if (hbData.is_active === false) return;

            // 1. Баланс
            if (hbData.tickets !== undefined) {
                userData.tickets = hbData.tickets;
                const ticketEl = document.getElementById('ticketStats');
                if (ticketEl) ticketEl.textContent = hbData.tickets;
            }
            
            // 2. Обновляем данные квеста в памяти (но не рендерим внутренности!)
            if (hbData.quest_id) {
                userData.active_quest_id = hbData.quest_id;
                userData.active_quest_progress = hbData.quest_progress;
            }

            // 3. Обновляем данные челленджа в памяти
            if (hbData.has_active_challenge) {
                if (!userData.challenge) userData.challenge = {};
                userData.challenge.progress_value = hbData.challenge_progress;
                userData.challenge.target_value = hbData.challenge_target;
            }

            // 4. 🔥 ГЛАВНОЕ: Обновляем только ЯРЛЫКИ на главной
            updateShortcutStatuses(userData, allQuests);

            // 5. Статус магазина
            if (hbData.active_trade_status !== undefined) {
                updateShopTile(hbData.active_trade_status);
            }

            // 6. Подарок (Проверка доступности)
            const giftContainer = document.getElementById('gift-container');
            const giftBtn = document.getElementById('daily-gift-btn');
            if (giftContainer && giftBtn) {
                 const isEnabled = String(userData.bonus_gift_enabled) !== 'false' && userData.bonus_gift_enabled;
                 if (!isEnabled) {
                     giftContainer.style.display = 'none';
                     giftBtn.style.display = 'none';
                 } else if (!giftContainer.classList.contains('hidden')) {
                     giftContainer.style.display = ''; 
                 }
            }
        }
    } catch (e) { console.warn("Heartbeat error:", e); }
}

// --- МАГАЗИН И ТРЕЙДЫ ---
function updateShopTile(status) {
    const shopTile = document.getElementById('shortcut-shop');
    if (!shopTile) return;

    // Логируем
    console.log('[ShopTile] Получен статус:', status);

    const safeStatus = status || 'none';
    shopTile.dataset.status = safeStatus;

    // --- НАСТРОЙКИ (ЦВЕТА КАК В SHOP.HTML) ---
    const stages = {
        // 1. ОЖИДАНИЕ (Pending) -> Как кнопка Trade-In (Фиолетовый)
        'creating': {
            label: 'ЗАЯВКА СОЗДАНА',
            sub: 'Ожидание принятия...',
            icon: '<i class="fa-regular fa-clock"></i>',
            // Градиент кнопки Trade-In из shop.html
            bg: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)', 
            border: 'rgba(255, 255, 255, 0.2)'
        },
        
        // 2. ПРОВЕРКА (Review) -> Голубой (как бейдж "Проверка")
        'sending': {
            label: 'ПРОВЕРКА АДМИНОМ',
            sub: 'Ожидайте монеты...',
            icon: '<i class="fa-solid fa-hourglass-half fa-spin"></i>',
            // Голубой (Telegram style)
            bg: 'linear-gradient(135deg, #2AABEE, #229ED9)', 
            border: 'rgba(255, 255, 255, 0.3)'
        },

        // 3. ДЕЙСТВУЙ (Active) -> Красно-Оранжевый (Pulse)
        'confirming': {
            label: 'ТРЕБУЕТ ДЕЙСТВИЯ',
            sub: 'Передайте скин!',
            icon: '<i class="fa-solid fa-fire fa-beat"></i>',
            // Яркий красно-оранжевый градиент (как пульсирующая кнопка)
            bg: 'linear-gradient(135deg, #ff3b30, #ff9500)', 
            border: '#fff' // Белая рамка для акцента
        },

        // 4. ОШИБКА
        'failed': {
            label: 'ОТМЕНЕНО',
            sub: 'Попробуйте снова',
            icon: '<i class="fa-solid fa-circle-xmark"></i>',
            bg: 'linear-gradient(135deg, #ff3b30 0%, #ff453a 100%)', // Просто красный
            border: 'rgba(255, 59, 48, 0.3)'
        }
    };

    const stage = stages[safeStatus];

    // Если статус "none" — стандартный вид "Магазин"
    if (!stage) {
        shopTile.style.background = '';
        shopTile.style.borderColor = '';
        shopTile.innerHTML = `
            <div class="metro-tile-bg-icon"><i class="fa-solid fa-cart-shopping"></i></div>
            <div class="metro-content">
                <div class="metro-icon-main"><i class="fa-solid fa-cart-shopping"></i></div>
                <span class="metro-label">Магазин</span>
                <span class="metro-sublabel">Кейсы, уселения</span>
            </div>
        `;
        // Убираем пульсацию, если она была
        shopTile.style.animation = '';
        return;
    }

    // Вид активного трейда
    shopTile.style.background = stage.bg;
    shopTile.style.borderColor = stage.border;
    shopTile.style.animation = safeStatus === 'confirming' ? 'statusPulse 2s infinite' : '';
    shopTile.innerHTML = `<div class="metro-tile-bg-icon" style="opacity:0.15">${stage.icon}</div><div class="metro-content"><div class="metro-icon-main" style="color:#fff; font-size: 26px; margin-bottom: 6px;">${stage.icon}</div><span class="metro-label" style="color:#fff; font-weight: 800; text-transform: uppercase; font-size: 11px;">${stage.label}</span><span class="metro-sublabel" style="opacity:0.95; color: #fff; font-weight: 500;">${stage.sub}</span></div>`;
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ СТИЛЕЙ (Нужны для попапа) ---
function markStepDone(el, icon) {
    if(el) { el.style.borderColor = "#34c759"; el.style.background = "rgba(52, 199, 89, 0.1)"; }
    if(icon) { icon.className = "fa-solid fa-circle-check"; icon.style.color = "#34c759"; }
}
function markStepError(el, icon) {
    if(el) el.style.borderColor = "#ff3b30";
    if(icon) { icon.className = "fa-solid fa-circle-xmark"; icon.style.color = "#ff3b30"; }
}
function markStepPending(el, icon) {
    if(el) { el.style.borderColor = "transparent"; if(el.id === 'step-twitch') el.style.background = "rgba(145, 70, 255, 0.15)"; if(el.id === 'step-tg') el.style.background = "rgba(0, 136, 204, 0.15)"; }
    if(icon) { icon.className = "fa-regular fa-circle"; icon.style.color = "#aaa"; }
}

// --- РЕФЕРАЛКА И БОНУСЫ (WELCOME POPUP) ---

// 1. Функция проверки и запуска (Исправленная)
async function checkReferralAndWelcome(userData) {
    // 1. Получаем сырой параметр запуска
    const rawParam = (Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.start_param) || null;
    const bonusBtn = document.getElementById('open-bonus-btn');

    // 2. Проверяем: это точно реферальный код?
    let validRefCode = null;
    if (rawParam && rawParam.startsWith('r_')) {
        validRefCode = rawParam;
        console.log("Referral code cached:", validRefCode);
        localStorage.setItem('cached_referral_code', validRefCode);
    }

    // 3. Если бонус уже активирован — скрываем кнопку, чистим память и уходим
    if (userData.referral_activated_at) {
        if (bonusBtn) bonusBtn.classList.add('hidden');
        localStorage.removeItem('openRefPopupOnLoad');
        localStorage.removeItem('cached_referral_code');
        localStorage.removeItem('pending_ref_code');
        return; 
    }

    // 4. Достаем старый кэш
    const savedCode = localStorage.getItem('cached_referral_code');

    // 5. Определяем лучший код для передачи (Свежий > Сохраненный)
    // Используем validRefCode, а не rawParam, чтобы не передать мусор
    const codeToPass = validRefCode || savedCode;

    // 6. Условие показа:
    // - Либо юзер уже связан в базе (userData.referrer_id)
    // - Либо у нас есть валидный код на руках (codeToPass)
    const shouldShowBonus = userData.referrer_id || codeToPass;

    if (shouldShowBonus) {
        if (bonusBtn) {
            bonusBtn.classList.remove('hidden');
            // Передаем код в функцию открытия
            bonusBtn.onclick = () => openWelcomePopup(userData, codeToPass);
        }
        
        // 7. Логика авто-открытия
        if (localStorage.getItem('openRefPopupOnLoad')) {
            // Если вернулись с Twitch - берем код, который сохраняли перед уходом (pending)
            // или тот, который вычислили выше
            const autoCode = localStorage.getItem('pending_ref_code') || codeToPass;
            openWelcomePopup(userData, autoCode);
            localStorage.removeItem('openRefPopupOnLoad');
        } 
        else if (!localStorage.getItem('bonusPopupDeferred')) {
            // Если пользователь не нажимал "Позже" - открываем сразу
            openWelcomePopup(userData, codeToPass);
        } 
    } else {
        if (bonusBtn) bonusBtn.classList.add('hidden');
    }
}

// 2. Функция открытия попапа (Исправленная)
async function openWelcomePopup(currentUserData, referralCode = null) {
    const popup = document.getElementById('welcome-popup');
    const successModal = document.getElementById('subscription-success-modal');
    const sosOverlay = document.getElementById('sos-modal-overlay');
    const sosCloseBtn = document.getElementById('sos-close-btn');
    const sosAdminBtn = document.getElementById('sos-admin-btn');
    const laterBtn = document.getElementById('later-btn');

    if (!popup) return;
    let userData = currentUserData;

    const stepTwitch = document.getElementById('step-twitch');
    const stepTg = document.getElementById('step-tg');
    const iconTg = document.getElementById('icon-tg');
    let iconTwitch = document.getElementById('icon-twitch'); 
    const actionBtn = document.getElementById('action-btn');

    actionBtn.disabled = false;
    actionBtn.textContent = "Проверка..."; 
    actionBtn.style.background = ""; 
    popup.classList.add('visible');

    if (laterBtn) {
        const newLaterBtn = laterBtn.cloneNode(true);
        laterBtn.parentNode.replaceChild(newLaterBtn, laterBtn);
        newLaterBtn.onclick = () => {
            popup.classList.remove('visible');
            localStorage.setItem('bonusPopupDeferred', 'true');
            localStorage.removeItem('openRefPopupOnLoad');
            const mainTriggerBtn = document.getElementById('open-bonus-btn');
            if (mainTriggerBtn) mainTriggerBtn.classList.add('hidden');
        };
    }

    function renderTwitchSection() {
        if (!userData.twitch_id) {
            stepTwitch.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="fa-brands fa-twitch" style="font-size: 20px; color: #9146ff; width: 24px; text-align: center;"></i>
                        <div style="text-align: left;">
                            <div style="font-weight: 500; font-size: 14px; color: #fff;">Привязка Twitch</div>
                            <div style="font-size: 11px; color: #aaa;">Обязательно для бонуса</div>
                        </div>
                    </div>
                    <i id="icon-twitch" class="fa-regular fa-circle" style="color: #aaa; font-size: 16px;"></i>
                </div>
                <div style="display: flex; gap: 8px; width: 100%;">
                    <button id="twitch-help-btn-popup" style="background-color: rgba(145, 70, 255, 0.2); color: #9146ff; border: 1px solid rgba(145, 70, 255, 0.4); border-radius: 8px; width: 42px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;"><i class="fa-solid fa-question" style="font-size: 16px;"></i></button>
                    <button id="connect-twitch-btn-popup" style="background-color: #9146ff; color: white; border: none; border-radius: 8px; height: 36px; flex-grow: 1; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px;"><i class="fa-brands fa-twitch"></i> Привязать</button>
                </div>`;
            stepTwitch.onclick = null;
            stepTwitch.style.cursor = 'default';
            stepTwitch.style.display = 'block';
            stepTwitch.style.padding = '12px';

            const btnConnect = document.getElementById('connect-twitch-btn-popup');
            const btnHelp = document.getElementById('twitch-help-btn-popup');
            iconTwitch = document.getElementById('icon-twitch'); 

            if (btnConnect) {
                btnConnect.onclick = async (e) => {
                    e.preventDefault(); e.stopPropagation();
                    const originalText = btnConnect.innerHTML;
                    
                    // 🔥 СОХРАНЯЕМ КОД ПЕРЕД УХОДОМ НА TWITCH
                    if (referralCode) localStorage.setItem('pending_ref_code', referralCode);
                    else {
                        // Если кода нет в аргументе, попробуем кэш
                        const cached = localStorage.getItem('cached_referral_code');
                        if (cached) localStorage.setItem('pending_ref_code', cached);
                    }

                    btnConnect.style.opacity = '0.7';
                    btnConnect.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; 
                    try {
                        if (!Telegram.WebApp.initData) return;
                        localStorage.setItem('auth_source', 'menu');
                        const response = await fetch(`/api/v1/auth/twitch_oauth?initData=${encodeURIComponent(Telegram.WebApp.initData)}&redirect=/`);
                        if (!response.ok) throw new Error("Ошибка сервера");
                        const data = await response.json();
                        if (data.url) {
                            localStorage.setItem('openRefPopupOnLoad', 'true');
                            Telegram.WebApp.openLink(data.url);
                            Telegram.WebApp.close(); 
                        }
                    } catch (err) {
                        Telegram.WebApp.showAlert("Ошибка: " + err.message);
                        btnConnect.style.opacity = '1';
                        btnConnect.innerHTML = originalText;
                    }
                };
            }
            if (btnHelp) {
                btnHelp.onclick = (e) => { e.stopPropagation(); popup.classList.remove('visible'); if (sosOverlay) sosOverlay.classList.remove('hidden'); };
            }
        } else {
            stepTwitch.innerHTML = `
                 <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="fa-brands fa-twitch" style="font-size: 20px; color: #9146ff; width: 24px; text-align: center;"></i>
                        <div style="text-align: left;">
                            <div style="font-weight: 500; font-size: 14px; color: #fff;">Twitch привязан</div>
                            <div style="font-size: 11px; color: #aaa;">Аккаунт подключен</div>
                        </div>
                    </div>
                    <i id="icon-twitch" class="fa-solid fa-circle-check" style="color: #34c759; font-size: 16px;"></i>
                </div>`;
            stepTwitch.style.cursor = 'pointer';
            stepTwitch.style.display = 'flex'; 
            stepTwitch.style.padding = '16px';
            stepTwitch.onclick = () => { Telegram.WebApp.HapticFeedback.notificationOccurred('success'); };
            iconTwitch = document.getElementById('icon-twitch'); 
            markStepDone(stepTwitch, iconTwitch);
        }
    }

    renderTwitchSection();
    stepTg.onclick = () => { Telegram.WebApp.openTelegramLink('https://t.me/hatelove_ttv'); };
    if (sosCloseBtn) sosCloseBtn.onclick = () => { sosOverlay.classList.add('hidden'); popup.classList.add('visible'); };
    if (sosAdminBtn) sosAdminBtn.onclick = () => { Telegram.WebApp.openTelegramLink('https://t.me/hatelove_twitch'); };

    async function claimReward() {
        actionBtn.disabled = true;
        actionBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Забираем...';
        
        // 🔥 ФИКС: Собираем код из всех источников (аргумент -> временный -> постоянный кэш)
        const finalRefCode = referralCode || localStorage.getItem('pending_ref_code') || localStorage.getItem('cached_referral_code');
        
        console.log("Activating with code:", finalRefCode);

        try {
            const response = await fetch('/api/v1/user/referral/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    initData: Telegram.WebApp.initData,
                    referral_code: finalRefCode // Явно отправляем!
                })
            });
            const res = await response.json();
            if (response.ok) {
                Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                actionBtn.textContent = "Готово!";
                document.getElementById('open-bonus-btn')?.classList.add('hidden');
                
                // Чистим кэши
                localStorage.removeItem('openRefPopupOnLoad');
                localStorage.removeItem('bonusPopupDeferred');
                localStorage.removeItem('pending_ref_code');
                localStorage.removeItem('cached_referral_code');
                
                setTimeout(() => {
                    popup.classList.remove('visible');
                    if (successModal) { successModal.classList.remove('hidden'); successModal.classList.add('visible'); }
                    refreshDataSilently(); 
                }, 500);
            } else {
                Telegram.WebApp.showAlert(res.detail || "Ошибка");
                actionBtn.disabled = false;
                actionBtn.textContent = "ЗАБРАТЬ БОНУС 🎁";
            }
        } catch(e) {
            Telegram.WebApp.showAlert("Ошибка сети");
            actionBtn.disabled = false;
            actionBtn.textContent = "ЗАБРАТЬ БОНУС 🎁";
        }
    }

    async function runCheck() {
        if (!popup.classList.contains('visible')) return; 
        if (actionBtn.textContent.includes("ЗАБРАТЬ")) return;

        actionBtn.disabled = true;
        actionBtn.textContent = "Проверка...";
        actionBtn.style.background = "#3a3a3c"; 
        if (iconTg && !iconTg.classList.contains('fa-circle-check')) iconTg.className = "fa-solid fa-spinner fa-spin";
        if (iconTwitch && !iconTwitch.classList.contains('fa-circle-check')) iconTwitch.className = "fa-solid fa-spinner fa-spin";

        try {
            try {
                const fresh = await makeApiRequest('/api/v1/bootstrap', {}, 'POST', true);
                if (fresh && fresh.user) {
                    userData = fresh.user; 
                    if (window.userData) window.userData = fresh.user;
                    if (userData.twitch_id) renderTwitchSection();
                }
            } catch (e) { console.warn("Bootstrap refresh failed", e); }

            let tgOk = false;
            let checkFailed = false;
            try {
                const tgRes = await makeApiRequest('/api/v1/user/check_subscription', { initData: Telegram.WebApp.initData }, 'POST', true);
                if (tgRes && tgRes.is_subscribed) tgOk = true;
                else tgOk = false;
            } catch(e) { checkFailed = true; }

            const twitchOk = !!userData.twitch_id;
            if (!popup.classList.contains('visible')) return;

            if (!checkFailed) {
                if (tgOk) markStepDone(stepTg, iconTg); else markStepError(stepTg, iconTg);
            } else {
                markStepPending(stepTg, iconTg);
            }

            const curIconTwitch = document.getElementById('icon-twitch');
            if (twitchOk) markStepDone(stepTwitch, curIconTwitch); else markStepError(stepTwitch, curIconTwitch);

            if (tgOk && twitchOk) {
                Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                actionBtn.disabled = false;
                actionBtn.innerHTML = "ЗАБРАТЬ БОНУС 🎁";
                actionBtn.style.background = "#FFD700";
                actionBtn.style.color = "#000";
                actionBtn.style.fontWeight = "800";
                actionBtn.onclick = claimReward; 
            } else {
                if(!checkFailed) Telegram.WebApp.HapticFeedback.notificationOccurred('error');
                actionBtn.disabled = false;
                actionBtn.textContent = "Проверить снова";
            }
        } catch (e) {
            actionBtn.disabled = false;
            actionBtn.textContent = "Ошибка проверки";
        }
    }
    setTimeout(() => { runCheck(); }, 400);
}
// --- ЕЖЕДНЕВНЫЙ ПОДАРОК ---
async function checkGift() {
    if (!bonusGiftEnabled) {
        if(dom.giftContainer) dom.giftContainer.classList.add('hidden');
        const btn = document.getElementById('daily-gift-btn');
        if(btn) btn.style.display = 'none';
        return; 
    }
    try {
        const res = await makeApiRequest('/api/v1/gift/check', {}, 'POST', true);
        if (res && res.available) {
            if(dom.giftContainer) dom.giftContainer.classList.remove('hidden');
            const randomRight = Math.floor(Math.random() * 40) + 10; 
            if(dom.giftContainer) dom.giftContainer.style.right = `${randomRight}px`;
        } else {
            if(dom.giftContainer) dom.giftContainer.classList.add('hidden');
        }
    } catch (e) { console.error("Gift check error:", e); }
}

function renderGiftResult(result) {
    dom.giftContentInitial.classList.add('hidden');
    dom.giftContentResult.classList.remove('hidden');
    const giftBtn = document.getElementById('daily-gift-btn');
    if (giftBtn) giftBtn.style.display = 'none'; 
    dom.giftContainer.classList.add('hidden');   
    dom.giftPromoBlock.classList.add('hidden'); 

    if (result.type === 'tickets') {
        dom.giftResultIcon.innerHTML = "🎟️";
        dom.giftResultText.innerHTML = `Вы получили <b>${result.value}</b> билетов!`;
    } else if (result.type === 'coins') {
        dom.giftResultIcon.innerHTML = "💰";
        dom.giftResultText.innerHTML = `Вы получили <b>${result.value}</b> монет!`;
        dom.giftPromoBlock.classList.remove('hidden');
    } else if (result.type === 'skin') {
        dom.giftResultIcon.innerHTML = `<img src="${escapeHTML(result.meta.image_url)}" style="width:100px; height:100px; object-fit:contain;">`;
        dom.giftResultText.innerHTML = `<b>${escapeHTML(result.meta.name)}</b><br><small style="color:#aaa;">Скин будет выдан администратором.</small>`;
    }

    if (result.subscription_required) {
        if (giftBtn) giftBtn.style.display = 'flex'; 
        dom.giftResultTitle.textContent = "ПОЧТИ ТВОЁ!";
        dom.giftResultTitle.style.color = "#ff3b30";
        if (result.type === 'coins') {
            dom.giftPromoCode.textContent = "🔒 ПОДПИШИСЬ";
            dom.giftPromoCode.style.filter = "blur(5px)";
            dom.giftPromoCode.style.userSelect = "none";
        }
        dom.giftCloseBtn.textContent = "Подписаться и забрать";
        dom.giftCloseBtn.style.background = "#0088cc";
        dom.giftCloseBtn.onclick = (e) => {
            e.preventDefault();
            Telegram.WebApp.openTelegramLink("https://t.me/hatelovettv");
            dom.giftModalOverlay.classList.add('hidden');
            unlockAppScroll(); 
            setTimeout(() => {
                dom.giftContentInitial.classList.remove('hidden');
                dom.giftContentResult.classList.add('hidden');
                dom.giftOpenBtn.disabled = false;
                dom.giftOpenBtn.textContent = "Открыть";
            }, 500);
        };
    } else {
        dom.giftResultTitle.textContent = "Поздравляем!";
        dom.giftResultTitle.style.color = "#34c759";
        if (result.type === 'coins') {
            dom.giftPromoCode.textContent = result.meta.code;
            dom.giftPromoCode.style.filter = "none";
            dom.giftPromoCode.style.userSelect = "all";
        }
        dom.giftCloseBtn.textContent = "Круто!";
        dom.giftCloseBtn.style.background = "#555";
        dom.giftCloseBtn.onclick = () => {
            dom.giftModalOverlay.classList.add('hidden');
            unlockAppScroll(); 
        };
    }
}

// -------------------------------------------------------------
// 3. ТУТОРИАЛ (1 в 1 как в рабочем меню)
// -------------------------------------------------------------
    const tutorialSteps = [
    {
        element: '.user-profile',
        title: 'Ваш Профиль и Билеты',
        text: 'Слева находится <b>Ваш профиль</b>. Там можно привязать Twitch. <br><br>Справа - <b>Ваши билеты</b> для участия в розыгрышах.',
        view: 'view-dashboard'
    },
    {
        element: '#main-slider-container',
        title: 'Актуальные События',
        text: 'В этом слайдере находятся различные мероприятия. Они постоянно актуальные и всегда обновляются!',
        view: 'view-dashboard'
    },
    {
        element: '#challenge-container', 
        title: 'Ежедневный Челлендж', // <-- Этот шаг перекинет на вкладку Квестов
        text: 'Челленджи переехали во вкладку <b>Задания</b>! <br>Заходите сюда каждый день, выполняйте задания и получайте награды.',
        view: 'view-quests', // 🔥 ВАЖНО: Указана целевая вкладка
        forceTop: true 
    },
    {
        element: '#nav-leaderboard', 
        title: 'Лидерборд',
        text: 'Здесь можно посмотреть список лучших игроков. Соревнуйтесь по количеству билетов!',
        view: 'view-dashboard', // Возвращаем на главную, чтобы показать футер
        forceTop: true 
    },
    {
        element: '#nav-shop', 
        title: 'Магазин Скинов',
        text: 'А здесь находится <b>Магазин</b>. <br>Обменивайте заработанные звезды на уникальные скины CS2!',
        view: 'view-dashboard',
        forceTop: true
    }
];

let currentTutorialStep = 0;
let tutorialCountdownInterval = null; 

function positionTutorialModal(element, forceTop = false) {
    const rect = element.getBoundingClientRect();
    const modal = dom.tutorialModal;
    const margin = 15; 
    
    modal.style.display = 'block';
    modal.style.top = '';
    modal.style.bottom = '';
    modal.style.transform = '';
    modal.style.left = '5%';
    modal.style.width = '90%';

    const modalHeight = modal.offsetHeight;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    if (forceTop && spaceAbove >= (modalHeight + margin)) {
        modal.style.top = `${rect.top - modalHeight - margin}px`;
        return;
    }
    if (!forceTop && spaceBelow >= (modalHeight + margin)) {
        modal.style.top = `${rect.bottom + margin}px`;
        return;
    }
    if (spaceAbove >= (modalHeight + margin)) {
        modal.style.top = `${rect.top - modalHeight - margin}px`;
        return;
    }
    modal.style.top = '20px';
}

function showTutorialStep(stepIndex) {
    if (tutorialCountdownInterval) {
        clearInterval(tutorialCountdownInterval);
        tutorialCountdownInterval = null;
    }
    const footer = document.querySelector('.app-footer');
    if (footer) footer.classList.remove('tutorial-footer-active');
    document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
    
    if (stepIndex >= tutorialSteps.length) {
        endTutorial(true);
        return;
    }
    
    let step = { ...tutorialSteps[stepIndex] };

    // 🔥 АВТО-ПЕРЕКЛЮЧЕНИЕ ВКЛАДКИ 🔥
    if (step.view) {
        const currentView = document.querySelector('.view:not(.hidden)');
        // Переключаем только если мы не на той вкладке
        if (!currentView || currentView.id !== step.view) {
            switchView(step.view);
        }
    }
    
    setTimeout(() => {
        const element = document.querySelector(step.element);
        
        if (element) {
            if (element.closest('.app-footer') && footer) {
                footer.classList.add('tutorial-footer-active');
            }
            
            element.classList.add('tutorial-highlight');
            dom.tutorialTitle.textContent = step.title;
            dom.tutorialText.innerHTML = step.text;
            dom.tutorialStepCounter.textContent = `Шаг ${stepIndex + 1} из ${tutorialSteps.length}`;
            
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => positionTutorialModal(element, step.forceTop), 350);

            // Таймер кнопки
            const originalButtonText = (stepIndex === tutorialSteps.length - 1) ? 'Завершить' : 'Далее';
            dom.tutorialNextBtn.textContent = originalButtonText;
            const nextBtn = dom.tutorialNextBtn;
            nextBtn.disabled = true;
            let countdown = 2; // (Поставил 2 сек, чтобы быстрее было)
            nextBtn.textContent = `${originalButtonText} (${countdown})`;
            
            tutorialCountdownInterval = setInterval(() => {
                countdown--;
                if (countdown > 0) {
                    nextBtn.textContent = `${originalButtonText} (${countdown})`;
                } else {
                    clearInterval(tutorialCountdownInterval);
                    tutorialCountdownInterval = null;
                    nextBtn.disabled = false;
                    nextBtn.textContent = originalButtonText;
                }
            }, 1000);
        } else {
            console.warn(`Tutorial element not found: ${step.element}. Skipping.`);
            currentTutorialStep++;
            showTutorialStep(currentTutorialStep);
        }
    }, 150); 
}

function startTutorial() {
    currentTutorialStep = 0;
    // Блокируем CSS эффекты для корректного отображения (см. menu.css)
    document.body.classList.add('tutorial-active');
    dom.tutorialOverlay.classList.remove('hidden');
    showTutorialStep(currentTutorialStep);
}

function endTutorial(completed = false) {
    if (tutorialCountdownInterval) {
        clearInterval(tutorialCountdownInterval);
        tutorialCountdownInterval = null;
    }
    const footer = document.querySelector('.app-footer');
    if (footer) footer.classList.remove('tutorial-footer-active');
    document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
    
    // Снимаем блокировку CSS
    document.body.classList.remove('tutorial-active');

    if (completed) {
        // Возвращаемся на ГЛАВНУЮ после завершения
        switchView('view-dashboard');

        dom.tutorialTitle.textContent = 'Готово!';
        dom.tutorialText.innerHTML = 'Теперь вы знаете всё необходимое. <br><br><b>Важно:</b> все задания и розыгрыши в этом боте абсолютно бесплатны. Удачи!';
        dom.tutorialStepCounter.textContent = '';
        
        dom.tutorialModal.style.top = '50%';
        dom.tutorialModal.style.left = '5%';
        dom.tutorialModal.style.width = '90%';
        // Центровка с учетом твоего сдвига влево
        dom.tutorialModal.style.transform = 'translate(calc(-15px - 50%), -50%)'; 

        dom.tutorialSkipBtn.classList.add('hidden');
        dom.tutorialNextBtn.textContent = 'Отлично!';
        dom.tutorialNextBtn.disabled = false;
        
        dom.tutorialNextBtn.onclick = () => {
            dom.tutorialOverlay.classList.add('hidden');
            dom.tutorialModal.style.top = ''; 
            dom.tutorialModal.style.transform = '';
            dom.tutorialNextBtn.onclick = tutorialNextHandler;
            dom.tutorialSkipBtn.classList.remove('hidden');
        };
    } else {
         dom.tutorialOverlay.classList.add('hidden');
         dom.tutorialModal.style.top = ''; 
         dom.tutorialModal.style.transform = '';
    }
    localStorage.setItem('tutorialCompleted', 'true');
}

function tutorialNextHandler() {
    currentTutorialStep++;
    showTutorialStep(currentTutorialStep);
};


// --- ФУНКЦИЯ РЕНДЕРА ИНТЕРФЕЙСА (ДЛЯ MAIN) ---
async function renderFullInterface(data) {
    userData = data.user || {};
    allQuests = data.quests || [];
    const menuContent = data.menu;
    const weeklyGoalsData = data.weekly_goals;
    const cauldronData = data.cauldron;

    // Баланс
    if (document.getElementById('ticketStats')) document.getElementById('ticketStats').textContent = userData.tickets || 0;
    
    // Имя
    dom.fullName.textContent = userData.full_name || "Гость";
    if (userData.is_admin) dom.navAdmin.classList.remove('hidden');

    // Проверка рефералки
    checkReferralAndWelcome(userData);

    // Цели
    renderWeeklyGoals(data.weekly_goals);
    if (dom.weeklyGoalsAccordion && localStorage.getItem('weeklyAccordionOpen') === 'true') {
        dom.weeklyGoalsAccordion.open = true;
    }

    // Слайдер (Настройка)
    if (menuContent) {
         // 1. Управление Подарком
         if (menuContent.bonus_gift_enabled !== undefined) {
             const giftBtn = document.getElementById('daily-gift-btn');
             if (!menuContent.bonus_gift_enabled) {
                 if (dom.giftContainer) dom.giftContainer.classList.add('hidden');
                 if (giftBtn) giftBtn.style.display = 'none';
                 bonusGiftEnabled = false;
             } else {
                 if (giftBtn) giftBtn.style.display = '';
                 bonusGiftEnabled = true;
             }
         }

         // 2. Баннер Еженедельных целей (БЫЛО ПРОПУЩЕНО)
         if (menuContent.weekly_goals_banner_url) {
            const wImg = document.getElementById('weekly-goals-banner-img');
            if (wImg) wImg.src = menuContent.weekly_goals_banner_url;
         }

         // 3. Сортировка слайдов из Админки (БЫЛО ПРОПУЩЕНО)
         const sliderWrapper = document.querySelector('.slider-wrapper');
         if (sliderWrapper && menuContent.slider_order) {
            menuContent.slider_order.forEach(slideId => {
                const slide = document.querySelector(`.slide[data-event="${slideId}"]`);
                if (slide) sliderWrapper.appendChild(slide);
            });
         }
         
         const setupSlide = (id, enabled, url, link) => {
    // Ищем любой элемент с data-event, чтобы работало и для слайдера, и для боковых баннеров
         const slide = document.querySelector(`[data-event="${id}"]`);
            if (slide) {
                const show = enabled || userData.is_admin;
                slide.style.display = show ? '' : 'none';
                if (show) {
                    if (link) slide.href = link;
                    if (url) {
                         const img = document.getElementById(`${id}-banner-img`) || slide.querySelector('img');
                         if (img && img.src !== url) img.src = url;
                    }
                }
            }
        };

        setupSlide('skin_race', menuContent.skin_race_enabled, menuContent.menu_banner_url);
        
        // Логика картинки аукциона (проверка slide_data)
        var auctionImg = menuContent.auction_banner_url;
        if (!auctionImg && menuContent.auction_slide_data && menuContent.auction_slide_data.image_url) {
            auctionImg = menuContent.auction_slide_data.image_url;
        }
        setupSlide('auction', menuContent.auction_enabled, auctionImg, '/auction');
        setupSlide('checkpoint', menuContent.checkpoint_enabled, menuContent.checkpoint_banner_url);
        
        // 4. Темы кнопки квестов (Twitch/Telegram) (БЫЛО ПРОПУЩЕНО)
        let activeQuestType = 'twitch';
        const day = new Date().getDay();
        if (menuContent.quest_schedule_override_enabled) {
            activeQuestType = menuContent.quest_schedule_active_type || 'twitch';
        } else if (day === 0 || day === 1) {
            activeQuestType = 'telegram';
        }

        const questButton = dom.questChooseBtn || document.getElementById("quest-choose-btn");
        if (questButton) {
            if (activeQuestType === 'telegram') {
                questButton.classList.remove('twitch-theme');
                questButton.classList.add('telegram-theme');
                questButton.innerHTML = '<i class="fa-brands fa-telegram"></i> TELEGRAM ИСПЫТАНИЯ';
            } else {
                questButton.classList.remove('telegram-theme');
                questButton.classList.add('twitch-theme');
                questButton.innerHTML = '<i class="fa-brands fa-twitch"></i> TWITCH ИСПЫТАНИЯ';
            }
        }
    }

    // Котел (БЫЛО ПРОПУЩЕНО)
    const eventSlide = document.querySelector('[data-event="cauldron"]');
    if (eventSlide) {
        const show = (cauldronData && cauldronData.is_visible_to_users) || (userData && userData.is_admin);
        eventSlide.style.display = show ? '' : 'none';
        if (show) {
            eventSlide.href = cauldronData.event_page_url || '/halloween';
            const img = eventSlide.querySelector('img');
            if (img && cauldronData.banner_image_url && img.src !== cauldronData.banner_image_url) {
                img.src = cauldronData.banner_image_url;
            }
        }
    }

    // Запуск слайдера (несколько раз для надежности, как в рабочем меню)
    setupSlider();
    setTimeout(() => setupSlider(), 100);
    setTimeout(() => setupSlider(), 500);

    // Ярлыки
    updateShortcutStatuses(userData, allQuests);
    
    // Магазин
    if (userData.active_trade_status) updateShopTile(userData.active_trade_status);
    else updateShopTile('none');

    // Подарок
    setTimeout(() => { if (typeof checkGift === 'function') checkGift(); }, 1000);
}
// -------------------------------------------------------------
// 4. ЗАГРУЗКА MAIN (1 в 1 как в рабочем меню с полоской)
// -------------------------------------------------------------
function extractImageUrls(data) {
    const urls = [];
    if (!data) return urls;
    if (data.menu) {
        if (data.menu.menu_banner_url) urls.push(data.menu.menu_banner_url);
        if (data.menu.checkpoint_banner_url) urls.push(data.menu.checkpoint_banner_url);
        if (data.menu.auction_banner_url) urls.push(data.menu.auction_banner_url);
        if (data.menu.weekly_goals_banner_url) urls.push(data.menu.weekly_goals_banner_url);
        if (data.menu.auction_slide_data && data.menu.auction_slide_data.image_url) {
            urls.push(data.menu.auction_slide_data.image_url);
        }
    }
    if (data.cauldron && data.cauldron.banner_image_url) urls.push(data.cauldron.banner_image_url);
    if (data.quests) {
        data.quests.forEach(q => { if (q.icon_url) urls.push(q.icon_url); });
    }
    return urls;
}

function preloadImages(urls, onProgress) {
    if (!urls || urls.length === 0) {
        if (onProgress) onProgress(100);
        return Promise.resolve();
    }
    let loadedCount = 0;
    const total = urls.length;
    const imagePromises = urls.map(url => {
        return new Promise((resolve) => {
            if (!url) {
                loadedCount++;
                if (onProgress) onProgress(Math.floor((loadedCount / total) * 100));
                return resolve();
            }
            const img = new Image();
            img.src = url;
            img.onload = () => {
                loadedCount++;
                if (onProgress) onProgress(Math.floor((loadedCount / total) * 100));
                resolve();
            };
            img.onerror = () => {
                loadedCount++; 
                if (onProgress) onProgress(Math.floor((loadedCount / total) * 100));
                resolve();
            };
        });
    });
    const timeoutPromise = new Promise((resolve) => { setTimeout(() => { resolve(); }, 3500); });
    return Promise.race([Promise.all(imagePromises), timeoutPromise]);
}

async function updateBootstrapSilently() {
    try {
        const data = await makeApiRequest("/api/v1/bootstrap", {}, 'POST', true);
        if (data) {
            const imgs = extractImageUrls(data);
            await preloadImages(imgs); 
            await renderFullInterface(data);
            localStorage.setItem('app_bootstrap_cache', JSON.stringify(data));
        }
    } catch (e) { console.error("Ошибка тихого обновления:", e); }
}

// Убедись, что функция hexToRgb есть в коде (она у тебя была)
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '255, 215, 0';
}

async function initDynamicRaffleSlider() {
    const wrapper = document.querySelector('.slider-wrapper');
    if (!wrapper) return;

    const placeholder = wrapper.querySelector('.slide[href="/raffles"], .slide[data-event="skin_race"]');
    if (!placeholder) return;

    try {
        const res = await fetch('/api/v1/raffles/active', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: window.Telegram.WebApp.initData })
        });
        
        const data = await res.json();
        const activeRaffles = data.filter(r => r.status === 'active').slice(0, 3);

        if (activeRaffles.length > 0) {
            activeRaffles.forEach(raffle => {
                const s = raffle.settings || {};
                const img = s.card_image || s.prize_image || '';
                
                const rarityColor = s.rarity_color || '#ffd700'; 
                const quality = s.skin_quality || 'FT'; 
                const pCount = raffle.participants_count || 0;
                
                const newSlide = document.createElement('a');
                newSlide.href = "/raffles";
                newSlide.className = "slide";
                
                newSlide.style.setProperty('--rarity-color', rarityColor);
                newSlide.style.setProperty('--rarity-rgb', hexToRgb(rarityColor));

                newSlide.innerHTML = `
                    <div class="premium-slide-box">
                        <div class="raffle-badge-top-right">
                            <i class="fa-solid fa-gift"></i> Розыгрыш
                        </div>

                        <div class="slide-content-left">
                            <div class="raffle-quality-tag-top">
                                <span>${escapeHTML(quality)}</span>
                                <span style="opacity:0.4; font-size: 8px;">●</span>
                                <i class="fa-solid fa-users"></i> ${pCount}
                            </div>
                            
                            <div class="raffle-item-name-new">${escapeHTML(s.prize_name)}</div>
                            
                            <div class="raffle-timer-box-new raffle-full-timer" data-endtime="${raffle.end_time}">
                                <div class="timer-unit-new"><span class="timer-val-new d-v">00</span><span class="timer-lbl-new">Д</span></div>
                                <div class="timer-sep">:</div>
                                <div class="timer-unit-new"><span class="timer-val-new h-v">00</span><span class="timer-lbl-new">Ч</span></div>
                                <div class="timer-sep">:</div>
                                <div class="timer-unit-new"><span class="timer-val-new m-v">00</span><span class="timer-lbl-new">М</span></div>
                            </div>
                        </div>

                        <img src="${img}" class="raffle-item-img-new" alt="Skin">
                    </div>
                `;
                placeholder.before(newSlide);
            });

            placeholder.remove();
            startSliderTick();
        }
    } catch (e) {
        console.warn("Slider dynamic failed", e);
    }
}

function startDynTimers() {
    const update = () => {
        document.querySelectorAll('.dyn-timer').forEach(el => {
            const end = new Date(el.dataset.endtime);
            const diff = end - new Date();
            if (diff <= 0) { el.innerText = "ЗАВЕРШАЕТСЯ"; return; }
            const h = Math.floor(diff / (1000 * 60 * 60));
            const m = Math.floor((diff / (1000 * 60)) % 60);
            const s = Math.floor((diff / 1000) % 60);
            el.innerText = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        });
    };
    update();
    setInterval(update, 1000);
}

function startGlobalSliderCycle(count) {
    let current = 0;
    const wrapper = document.querySelector('.slider-wrapper');
    // Очищаем старые интервалы если были (опционально)
    if (window.raffleSliderInterval) clearInterval(window.raffleSliderInterval);
    
    window.raffleSliderInterval = setInterval(() => {
        current = (current + 1) % count;
        wrapper.style.transform = `translateX(-${current * 100}%)`;
    }, 5000);
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
function getPlural(n, titles) {
    return titles[(n % 10 === 1 && n % 100 !== 11) ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];
}

function startSliderTick() {
    const update = () => {
        document.querySelectorAll('.raffle-full-timer').forEach(el => {
            const end = new Date(el.dataset.endtime);
            const diff = end - new Date();
            if (diff <= 0) { el.innerHTML = "<span style='font-weight:800; color:#ff453a;'>ЗАВЕРШАЕТСЯ</span>"; return; }
            
            const d = Math.floor(diff / (1000 * 60 * 60 * 24));
            const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const m = Math.floor((diff / (1000 * 60)) % 60);
            const s = Math.floor((diff / 1000) % 60);

            if(el.querySelector('.d-v')) el.querySelector('.d-v').innerText = d;
            if(el.querySelector('.h-v')) el.querySelector('.h-v').innerText = h;
            if(el.querySelector('.m-v')) el.querySelector('.m-v').innerText = m;
            if(el.querySelector('.s-v')) el.querySelector('.s-v').innerText = s;
        });
    };
    update();
    setInterval(update, 1000);
}

async function main() {
    // --- ВСТАВКА ДЛЯ VK: Если параметров нет, просим Bridge ---
    if (isVk && !window.vkParams) {
        console.log("⏳ Параметров нет. Ждем VK Bridge...");
        // Эта функция fetchVkParamsFromBridge должна быть выше в коде
        if (typeof fetchVkParamsFromBridge === 'function') {
            await fetchVkParamsFromBridge();
        }
        if (!window.vkParams) console.error("💀 Не удалось получить параметры VK ниоткуда.");
    }
    // -----------------------------------------------------------

    // Хак для перенаправления с профиля
    if (window.location.pathname.includes('/profile') || window.location.href.includes('profile')) {
        window.history.replaceState({}, document.title, "/");
        dom.viewDashboard.classList.remove('hidden');
        dom.viewQuests.classList.add('hidden');
    }

    try {
        // 🔥 ФИКС: Добавил !isVk, чтобы эта проверка не убивала приложение в ВК
        if (!isVk && window.Telegram && !Telegram.WebApp.initData) {
            if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
            return; 
        }

        const isAppVisible = dom.mainContent && dom.mainContent.classList.contains('visible');

        // --- СЦЕНАРИЙ 1: ПЕРВАЯ ЗАГРУЗКА ---
        if (!isAppVisible) {
            if (dom.loaderOverlay) dom.loaderOverlay.classList.remove('hidden');
            updateLoading(1);

            let bootstrapData = null;
            let usedCache = false;

            // А. Кэш
            try {
                const cachedJson = localStorage.getItem('app_bootstrap_cache');
                if (cachedJson) {
                    bootstrapData = JSON.parse(cachedJson);
                    usedCache = true;
                }
            } catch (e) { console.warn(e); }

            // Б. Сеть
            if (!bootstrapData) {
                let fakeP = 1;
                const timer = setInterval(() => { if(fakeP < 30) updateLoading(++fakeP); }, 50);
                try {
                    bootstrapData = await makeApiRequest("/api/v1/bootstrap", {}, 'POST', true); 
                } finally {
                    clearInterval(timer);
                }
            }

            if (!bootstrapData) throw new Error("Нет данных (bootstrap)");

            // В. Картинки
            const startP = usedCache ? 5 : 35;
            updateLoading(startP);
            const imageUrls = extractImageUrls(bootstrapData);
            if (imageUrls.length > 0) {
                await preloadImages(imageUrls, (p) => {
                    const range = 100 - startP;
                    const val = startP + Math.floor((p * range) / 100);
                    updateLoading(val);
                });
            } else { updateLoading(95); }

            // Г. Рендер интерфейса (твои старые слайды появятся тут)
            await renderFullInterface(bootstrapData);
            
            // Д. 🔥 ХИРУРГИЧЕСКАЯ ВСТАВКА: Оживляем розыгрыши
            // Мы меняем 1 слайд-заглушку на живые розыгрыши
            await initDynamicRaffleSlider();

            // Е. Финальный запуск логики слайдера
            // Теперь он увидит новые слайды и правильно настроит точки/свайпы
            setupSlider();

            // Ж. Финиш
            updateLoading(100);
            setTimeout(() => {
                if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
                if (dom.mainContent) dom.mainContent.classList.add('visible');
                if (usedCache) {
                    updateBootstrapSilently().catch(console.error); 
                }
            }, 300);
            
        } 
        // --- СЦЕНАРИЙ 2: ПОВТОРНЫЙ ВЫЗОВ (Обновление) ---
        else {
            await updateBootstrapSilently();
            await initDynamicRaffleSlider();
            setupSlider(); // Пересобираем слайдер при обновлении данных
        }

    } catch (e) {
        console.error("Error inside main:", e);
        if (dom.loaderOverlay) {
            dom.loadingText.textContent = "Ошибка запуска";
            dom.loadingText.style.color = "#ff453a";
            setTimeout(() => {
                 dom.loaderOverlay.classList.add('hidden');
                 dom.mainContent.classList.add('visible');
            }, 2000);
        }
    }
}
// -------------------------------------------------------------
// 5. PULL TO REFRESH (1 в 1 старая логика)
// -------------------------------------------------------------
function initPullToRefresh() {
    const content = document.getElementById('main-content');
    const ptrContainer = document.getElementById('pull-to-refresh'); 
    const icon = ptrContainer ? ptrContainer.querySelector('i') : null; 
    
    if (!content || !ptrContainer || !icon) return;

    let startY = 0;
    let pulledDistance = 0;
    let isPulling = false;
    const triggerThreshold = 80;

    content.addEventListener('touchstart', (e) => {
        if (content.scrollTop <= 0) {
            startY = e.touches[0].clientY;
            isPulling = true;
            content.style.transition = 'none'; 
            ptrContainer.style.transition = 'none'; 
            icon.style.transition = 'none';
        } else {
            isPulling = false;
        }
    }, { passive: true });

    content.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        const diff = e.touches[0].clientY - startY;
        if (diff > 0 && content.scrollTop <= 0) {
            if (e.cancelable) e.preventDefault();
            pulledDistance = Math.pow(diff, 0.85); 
            if (pulledDistance > 180) pulledDistance = 180;
            content.style.transform = `translateY(${pulledDistance}px)`;
            ptrContainer.style.transform = `translateY(${pulledDistance}px)`;
            icon.style.transform = `rotate(${pulledDistance * 2.5}deg)`;
            
            if (pulledDistance > triggerThreshold) {
                icon.style.color = "#34c759";
            } else {
                icon.style.color = "#FFD700";
            }
        }
    }, { passive: false });

    content.addEventListener('touchend', () => {
        if (!isPulling) return;
        isPulling = false;
        content.style.transition = 'transform 0.3s ease-out';
        ptrContainer.style.transition = 'transform 0.3s ease-out';

        if (pulledDistance > triggerThreshold) {
            console.log("🔄 Обновление...");
            content.style.transform = `translateY(80px)`;
            ptrContainer.style.transform = `translateY(80px)`; 
            icon.classList.add('fa-spin'); 
            if (window.Telegram && Telegram.WebApp.HapticFeedback) {
                Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
            setTimeout(() => {
                window.location.reload();
            }, 500);

        } else {
            content.style.transform = 'translateY(0px)';
            ptrContainer.style.transform = 'translateY(0px)'; 
            icon.style.transform = 'rotate(0deg)';
        }
        pulledDistance = 0;
    });
}

// --- ОБРАБОТЧИКИ СОБЫТИЙ ---
function setupEventListeners() {
    const footer = document.querySelector('.app-footer');
    if (footer) footer.addEventListener('click', (e) => { if (e.target.closest('.footer-item')) try { Telegram.WebApp.HapticFeedback.impactOccurred('medium'); } catch(e){} });

    // -------------------------------------------------------------
    // ГЕОМЕТРИЯ: РАВНЫЕ БЛОКИ (Возвращаем старый код)
    // -------------------------------------------------------------
    const challengeBtn = document.getElementById('shortcut-challenge');
    const questsBtn = document.getElementById('shortcut-quests');
    const shortcutShop = document.getElementById('shortcut-shop');

    if (challengeBtn && questsBtn && shortcutShop) {
        if (!originalShopHTML) {
            originalShopHTML = shortcutShop.innerHTML;
        }
        const container = challengeBtn.parentElement;
        if (container) {
            Object.assign(container.style, {
                display: 'grid',
                gridTemplateColumns: '0.85fr 1.15fr', 
                gridTemplateRows: '1fr 1fr',  
                gap: '10px',
                padding: '0 12px',
                width: '100%',
                boxSizing: 'border-box',
                alignItems: 'stretch'
            });

            // 1. МАГАЗИН (СЛЕВА)
            Object.assign(shortcutShop.style, {
                gridColumn: '1',
                gridRow: '1 / span 2',
                width: '100%',
                height: '100%',
                margin: '0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                boxSizing: 'border-box'
            });

            // 2. ЧЕЛЛЕНДЖ (СПРАВА, ВЕРХ)
            Object.assign(challengeBtn.style, {
                gridColumn: '2',
                gridRow: '1',
                width: '100%',
                height: '100%',
                margin: '0',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden',
                boxSizing: 'border-box',
                minHeight: '80px'
            });

            // 3. ИСПЫТАНИЯ (СПРАВА, НИЗ)
            Object.assign(questsBtn.style, {
                gridColumn: '2',
                gridRow: '2',
                width: '100%',
                height: '100%',
                margin: '0',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden',
                boxSizing: 'border-box',
                minHeight: '80px'
            });
        }
    }
    // -------------------------------------------------------------

    // Клик на Ярлыки
    const chalShortcut = document.getElementById('shortcut-challenge');
    if (chalShortcut) {
        chalShortcut.onclick = () => { window.location.href = '/quests?view=twitch'; };
    }
    const questShortcut = document.getElementById('shortcut-quests');
    if (questShortcut) {
        questShortcut.onclick = () => {
            const activeId = userData.active_quest_id;
            const isOnline = userData.is_stream_online === true;

            // 1. Если квест уже взят
            if (activeId) {
                const quest = allQuests.find(q => q.id === activeId);
                // Если в типе квеста есть twitch — отправляем на twitch, иначе на общую (тг)
                if (quest && quest.quest_type && quest.quest_type.includes('twitch')) {
                    window.location.href = '/quests?view=twitch'; 
                } else {
                    window.location.href = '/quests?view=telegram';
                }
                return;
            }

            // 2. Если квест НЕ взят — выбираем что открыть по статусу стрима
            if (isOnline) {
                // Стрим есть -> открываем выбор Twitch испытаний
                window.location.href = '/quests?open=twitch_only';
            } else {
                // Стрима нет -> открываем выбор Telegram испытаний
                window.location.href = '/quests?open=roulette'; // Предполагаю, что roulette — это выбор ТГ квестов
            }
        };
    }
    if (shortcutShop) {
        shortcutShop.onclick = () => {
            window.location.href = '/shop';
        };
    }

    // Еженедельные цели
    document.addEventListener('click', (e) => {
        if (e.target.closest('#weekly-goals-trigger')) dom.weeklyModalOverlay.classList.remove('hidden');
    });
    if (dom.weeklyModalCloseBtn) dom.weeklyModalCloseBtn.onclick = () => dom.weeklyModalOverlay.classList.add('hidden');

    // Кнопки еженедельных задач
    document.body.addEventListener('click', async (event) => {
        const claimTaskBtn = event.target.closest('.claim-task-reward-btn');
        const claimSuperBtn = event.target.closest('#claim-super-prize-btn');

        if (claimTaskBtn) {
            claimTaskBtn.disabled = true; claimTaskBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            try {
                const result = await makeApiRequest('/api/v1/user/weekly_goals/claim_task', { goal_id: claimTaskBtn.dataset.goalId });
                if (dom.ticketsClaimedOverlay) dom.ticketsClaimedOverlay.classList.remove('hidden');
                if (result.new_ticket_balance !== undefined) document.getElementById('ticketStats').textContent = result.new_ticket_balance;
                
                const goalItem = claimTaskBtn.closest('.weekly-goal-item');
                if (goalItem) { goalItem.style.opacity = '0'; setTimeout(() => goalItem.remove(), 500); }
            } catch(e) { Telegram.WebApp.showAlert(e.message); claimTaskBtn.disabled = false; claimTaskBtn.textContent = 'Ошибка'; }
        }

        if (claimSuperBtn) {
             claimSuperBtn.disabled = true; claimSuperBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
             try {
                const result = await makeApiRequest('/api/v1/user/weekly_goals/claim_super_prize', {});
                if (result.promocode || result.new_ticket_balance) {
                    if (result.new_ticket_balance) document.getElementById('ticketStats').textContent = result.new_ticket_balance;
                    dom.rewardClaimedOverlay.classList.remove('hidden');
                    claimSuperBtn.textContent = 'Получено!';
                    claimSuperBtn.classList.add('claimed');
                }
             } catch(e) { Telegram.WebApp.showAlert(e.message); claimSuperBtn.disabled = false; claimSuperBtn.textContent = 'Забрать'; }
        }
    });

    // Обработчики подарочных модалок
    if(dom.rewardCloseBtn) dom.rewardCloseBtn.onclick = () => { dom.rewardClaimedOverlay.classList.add('hidden'); };
    if(dom.ticketsClaimCloseBtn) dom.ticketsClaimCloseBtn.onclick = () => { dom.ticketsClaimedOverlay.classList.add('hidden'); };
    
    // Туториал
        dom.startTutorialBtn.addEventListener('click', startTutorial);
        dom.tutorialNextBtn.onclick = tutorialNextHandler;
        dom.tutorialSkipBtn.addEventListener('click', () => endTutorial(false));

    // Логика расписания (ЗАКРЫТИЕ)
    const scheduleModal = document.getElementById('schedule-modal-overlay');
    const scheduleCloseBtn = document.getElementById('schedule-modal-close-btn');
    if (scheduleCloseBtn && scheduleModal) {
        scheduleCloseBtn.addEventListener('click', () => {
            scheduleModal.classList.add('hidden');
        });
        scheduleModal.addEventListener('click', (e) => {
            if (e.target === scheduleModal) {
                scheduleModal.classList.add('hidden');
            }
        });
    }

    // Подарок
    if (dom.giftIconBtn) dom.giftIconBtn.addEventListener('click', () => {
         dom.giftModalOverlay.classList.remove('hidden');
         dom.giftContentInitial.classList.remove('hidden');
         dom.giftContentResult.classList.add('hidden');
         lockAppScroll();
    });
    const giftFloatingBtn = document.getElementById('daily-gift-btn');
    if (giftFloatingBtn) giftFloatingBtn.addEventListener('click', () => {
         dom.giftModalOverlay.classList.remove('hidden');
         dom.giftContentInitial.classList.remove('hidden');
         dom.giftContentResult.classList.add('hidden');
    });
    if (dom.giftOpenBtn) dom.giftOpenBtn.addEventListener('click', async () => {
         try {
             dom.giftOpenBtn.disabled = true;
             dom.giftOpenBtn.textContent = "Проверяем...";
             const result = await makeApiRequest('/api/v1/gift/claim', {});
             if (!result.subscription_required) {
                 if (result.type === 'tickets') {
                     const current = parseInt(document.getElementById('ticketStats').textContent) || 0;
                     document.getElementById('ticketStats').textContent = current + result.value;
                 }
             }
             renderGiftResult(result);
         } catch (e) {
             Telegram.WebApp.showAlert(e.message || "Ошибка");
             dom.giftOpenBtn.disabled = false;
             dom.giftOpenBtn.textContent = "Открыть";
         }
    });
    const giftXBtn = document.getElementById('gift-x-btn');
    if (giftXBtn) giftXBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); dom.giftModalOverlay.classList.add('hidden'); unlockAppScroll(); };
}

// ================================================================
// ГЛОБАЛЬНАЯ ЗАЩИТА ОТ СВОРАЧИВАНИЯ (СВАЙПА ВНИЗ)
// ================================================================
document.body.addEventListener('touchmove', function(e) {
    // Проверяем, находится ли палец внутри областей, которые РАЗРЕШЕНО скроллить
    const isInsideMainContent = e.target.closest('#main-content');
    const isInsideWeeklyScroll = e.target.closest('.weekly-goals-scroll-area');
    
    // Если пользователь тянет за шапку, футер или фон (вне скролл-зон) - жестко блокируем!
    if (!isInsideMainContent && !isInsideWeeklyScroll) {
        if (e.cancelable) {
            e.preventDefault();
        }
    }
}, { passive: false });

// ЗАПУСК
try {
    // 1. Настраиваем слушатели событий (кнопки, свайпы)
    setupEventListeners();
    
    // 2. Настраиваем "потяни, чтобы обновить"
    initPullToRefresh();
    
    // 3. Запускаем ГЛАВНУЮ логику (она сама получит ключи и проверит тех. режим)
    main();

    // СТАРТ УМНОГО HEARTBEAT (30 сек)
    clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => { 
        if (!document.hidden) refreshDataSilently(); 
    }, 30000);

    // Обработка сворачивания
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refreshDataSilently();
    });
} catch (e) { 
    console.error("Critical:", e); 
    if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
}
