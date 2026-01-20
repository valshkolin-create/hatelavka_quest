// ================================================================
// OPTIMIZED MENU.JS (CLEAN VERSION)
// Handles: Dashboard, Shop Status, Gifts, Referrals, Weekly Goals
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
            options.body = JSON.stringify({ ...body, initData: Telegram.WebApp.initData });
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
        if (e.message !== 'Cooldown active' && !isSilent) Telegram.WebApp.showAlert(`Ошибка: ${e.message}`);
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
            body: JSON.stringify({ initData: window.Telegram.WebApp.initData || '' })
        });

        if (res.ok) {
            const data = await res.json();
            if (data.maintenance) {
                window.location.href = '/'; 
                return;
            }
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

// --- ЛОГИКА СЛАЙДЕРА (Полная, как просили) ---
function setupSlider() {
    const container = document.getElementById('main-slider-container');
    if (!container) return;

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
    let prevBtn = prevBtnOld.cloneNode(true);
    let nextBtn = nextBtnOld.cloneNode(true);
    prevBtnOld.parentNode.replaceChild(prevBtn, prevBtnOld);
    nextBtnOld.parentNode.replaceChild(nextBtn, nextBtnOld);

    if (visibleSlides.length === 0) return;
    else container.style.display = ''; 

    if (visibleSlides.length <= 1) {
        container.style.display = '';
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        if (dotsContainer) dotsContainer.style.display = 'none';
        const firstVisibleIndex = Array.from(allSlides).indexOf(visibleSlides[0]);
        if (wrapper) wrapper.style.transform = `translateX(-${firstVisibleIndex * 100}%)`;
        return;
    }
    
    prevBtn.style.display = 'flex';
    nextBtn.style.display = 'flex';
    if (dotsContainer) dotsContainer.style.display = 'flex';
    
    dotsContainer.innerHTML = '';
    visibleSlides.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.classList.add('dot');
        dot.onclick = () => { showSlide(i); resetSlideInterval(); };
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

    function nextSlide() { showSlide(currentSlideIndex + 1); }
    function prevSlide() { showSlide(currentSlideIndex - 1); }
    function resetSlideInterval() { clearInterval(slideInterval); slideInterval = setInterval(nextSlide, slideDuration); }

    prevBtn.addEventListener('click', () => { prevSlide(); resetSlideInterval(); }, { signal: signal });
    nextBtn.addEventListener('click', () => { nextSlide(); resetSlideInterval(); }, { signal: signal });
    
    let touchStartX = 0; let touchStartY = 0; let touchEndX = 0; let isSwiping = false;

    container.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; touchEndX = touchStartX; isSwiping = false;
    }, { passive: true, signal: signal });

    container.addEventListener('touchmove', (e) => {
        if (touchStartX === 0 && touchStartY === 0) return;
        const diffX = touchStartX - e.touches[0].clientX;
        const diffY = touchStartY - e.touches[0].clientY;
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
            isSwiping = true;
            if (e.cancelable) { e.preventDefault(); e.stopPropagation(); }
        }
        touchEndX = e.touches[0].clientX;
    }, { passive: false, signal: signal });

    container.addEventListener('touchend', (e) => {
        if (isSwiping) {
            e.stopPropagation();
            if (Math.abs(touchStartX - touchEndX) > 50) {
                if (touchStartX - touchEndX > 0) nextSlide(); else prevSlide();
                resetSlideInterval();
            }
        }
        touchStartX = 0; touchStartY = 0; isSwiping = false;
    }, { passive: true, signal: signal });
    
    if (currentSlideIndex >= visibleSlides.length) currentSlideIndex = 0;
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

// --- 🔥 ВАЖНО: ОПТИМИЗИРОВАННОЕ ОБНОВЛЕНИЕ ЯРЛЫКОВ ---
// Эта функция обновляет только текст на кнопках меню, не трогая остальной DOM
function updateShortcutStatuses(userData, allQuests) {
    const makeTileCentered = (el) => {
        if (!el) return;
        el.style.display = 'flex'; el.style.flexDirection = 'column';
        el.style.alignItems = 'center'; el.style.justifyContent = 'center'; el.style.textAlign = 'center';      
    };

    // 1. Челлендж (Ярлык)
    const chalStatus = document.getElementById('metro-challenge-status');
    const chalFill = document.getElementById('metro-challenge-fill');
    const shortcutChal = document.getElementById('shortcut-challenge');
    
    if (chalStatus && chalFill && shortcutChal) {
        makeTileCentered(shortcutChal); 
        const oldWrapper = document.getElementById('offline-wrapper');
        if (oldWrapper) oldWrapper.remove();
        
        chalStatus.style.display = ''; chalStatus.style.marginBottom = '5px'; 
        if (chalFill.parentElement) chalFill.parentElement.style.display = ''; 

        if (userData.is_stream_online === false) {
            // ОФФЛАЙН РЕЖИМ
            chalStatus.style.display = 'none';
            if (chalFill.parentElement) chalFill.parentElement.style.display = 'none';

            const wrapper = document.createElement('div');
            wrapper.id = 'offline-wrapper';
            wrapper.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:8px;';
            wrapper.innerHTML = `
                <div style="color:#ff453a; font-size:12px; fontWeight:600;">Стрим оффлайн</div>
                <div id="mini-schedule-btn" style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); color:#fff; padding:5px 10px; border-radius:8px; font-size:10px;">
                    <i class="fa-regular fa-calendar-days"></i> Расписание
                </div>`;
            shortcutChal.appendChild(wrapper);
            document.getElementById('mini-schedule-btn').onclick = (e) => {
                e.stopPropagation();
                document.getElementById('schedule-modal-overlay').classList.remove('hidden');
            };
        } else {
            // ОНЛАЙН РЕЖИМ
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

    // 2. Испытание (Ярлык)
    const shortcutQuest = document.getElementById('shortcut-quests');
    const questStatus = document.getElementById('metro-quest-status');
    const questFill = document.getElementById('metro-quest-fill');

    if (shortcutQuest && questStatus && questFill) {
        makeTileCentered(shortcutQuest);
        questStatus.style.marginBottom = '5px';

        const activeId = userData.active_quest_id;
        if (!activeId) {
            questStatus.textContent = "Нажмите для выбора";
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

    const safeStatus = status || 'none';
    const stages = {
        'creating': { label: 'ЗАЯВКА СОЗДАНА', sub: 'Ожидание...', icon: '<i class="fa-regular fa-clock"></i>', bg: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)', border: 'rgba(255, 255, 255, 0.2)' },
        'sending': { label: 'ПРОВЕРКА АДМИНОМ', sub: 'Ждите монеты...', icon: '<i class="fa-solid fa-hourglass-half fa-spin"></i>', bg: 'linear-gradient(135deg, #2AABEE, #229ED9)', border: 'rgba(255, 255, 255, 0.3)' },
        'confirming': { label: 'ТРЕБУЕТ ДЕЙСТВИЯ', sub: 'Передайте скин!', icon: '<i class="fa-solid fa-fire fa-beat"></i>', bg: 'linear-gradient(135deg, #ff3b30, #ff9500)', border: '#fff' },
        'failed': { label: 'ОТМЕНЕНО', sub: 'Повторите', icon: '<i class="fa-solid fa-circle-xmark"></i>', bg: 'linear-gradient(135deg, #ff3b30 0%, #ff453a 100%)', border: 'rgba(255, 59, 48, 0.3)' }
    };

    const stage = stages[safeStatus];
    if (!stage) {
        // Стандартный вид
        shopTile.style.background = ''; shopTile.style.borderColor = ''; shopTile.style.animation = '';
        if (originalShopHTML) shopTile.innerHTML = originalShopHTML;
        else shopTile.innerHTML = `<div class="metro-tile-bg-icon"><i class="fa-solid fa-cart-shopping"></i></div><div class="metro-content"><div class="metro-icon-main"><i class="fa-solid fa-cart-shopping"></i></div><span class="metro-label">Магазин</span><span class="metro-sublabel">Скины и предметы</span></div>`;
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
async function openWelcomePopup(currentUserData) {
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
        try {
            const response = await fetch('/api/v1/user/referral/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: Telegram.WebApp.initData })
            });
            const res = await response.json();
            if (response.ok) {
                Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                actionBtn.textContent = "Готово!";
                document.getElementById('open-bonus-btn')?.classList.add('hidden');
                localStorage.removeItem('openRefPopupOnLoad');
                localStorage.removeItem('bonusPopupDeferred');
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

async function checkReferralAndWelcome(userData) {
    const startParam = (Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.start_param) || null;
    const bonusBtn = document.getElementById('open-bonus-btn');

    if (userData.referral_activated_at) {
        if (bonusBtn) bonusBtn.classList.add('hidden');
        localStorage.removeItem('openRefPopupOnLoad');
        return; 
    }

    let potentialReferral = startParam && startParam.startsWith('r_');
    if (userData.referrer_id || potentialReferral) {
        if (bonusBtn) {
            bonusBtn.classList.remove('hidden');
            bonusBtn.onclick = () => openWelcomePopup(userData);
        }
        if (localStorage.getItem('openRefPopupOnLoad')) {
            openWelcomePopup(userData);
            localStorage.removeItem('openRefPopupOnLoad');
        } else if (!localStorage.getItem('bonusPopupDeferred')) {
            openWelcomePopup(userData);
        } 
    } else {
        if (bonusBtn) bonusBtn.classList.add('hidden');
    }
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

// --- ГЛАВНАЯ ФУНКЦИЯ (MAIN) ---
async function main() {
    try {
        Telegram.WebApp.ready();
        Telegram.WebApp.expand();
        
        // Хак для перенаправления с профиля
        if (window.location.pathname.includes('/profile')) {
            window.history.replaceState({}, document.title, "/");
        }

        if (!Telegram.WebApp.initData) {
            if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
            return;
        }

        // --- Загрузка ---
        let bootstrapData = null;
        const cachedJson = localStorage.getItem('app_bootstrap_cache');
        
        // 1. Сначала пробуем кэш для скорости
        if (cachedJson) {
            bootstrapData = JSON.parse(cachedJson);
            renderFullInterface(bootstrapData);
            if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
        }

        // 2. Параллельно грузим сеть
        const newData = await makeApiRequest("/api/v1/bootstrap", {}, 'POST', true);
        if (newData) {
            localStorage.setItem('app_bootstrap_cache', JSON.stringify(newData));
            // Рендерим свежее
            renderFullInterface(newData);
        }

        if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
        dom.mainContent.classList.add('visible');

        // Запуск Heartbeat
        clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => { if (!document.hidden) refreshDataSilently(); }, 30000);

    } catch (e) {
        console.error("Main error:", e);
        if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
        Telegram.WebApp.showAlert("Ошибка запуска. Обновите страницу.");
    }
}

// --- ФУНКЦИЯ РЕНДЕРА ИНТЕРФЕЙСА ---
async function renderFullInterface(data) {
    userData = data.user || {};
    allQuests = data.quests || [];
    const menuContent = data.menu;

    // Баланс
    if (document.getElementById('ticketStats')) document.getElementById('ticketStats').textContent = userData.tickets || 0;
    
    // Имя
    dom.fullName.textContent = userData.full_name || "Гость";
    if (userData.is_admin) dom.navAdmin.classList.remove('hidden');

    // Проверка рефералки
    checkReferralAndWelcome(userData);

    // Цели
    renderWeeklyGoals(data.weekly_goals);

    // Слайдер (Настройка)
    if (menuContent) {
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
         
         const setupSlide = (id, enabled, url, link) => {
            const slide = document.querySelector(`.slide[data-event="${id}"]`);
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
        setupSlide('auction', menuContent.auction_enabled, menuContent.auction_banner_url, '/auction');
        setupSlide('checkpoint', menuContent.checkpoint_enabled, menuContent.checkpoint_banner_url);
        
        setupSlider();
    }

    // 🔥 ОБНОВЛЕНИЕ ЯРЛЫКОВ (Вместо рендера карточек)
    updateShortcutStatuses(userData, allQuests);
    
    // Магазин
    if (userData.active_trade_status) updateShopTile(userData.active_trade_status);

    // Подарок
    setTimeout(() => { if (typeof checkGift === 'function') checkGift(); }, 1000);
}

// --- ОБРАБОТЧИКИ СОБЫТИЙ ---
function setupEventListeners() {
    // Вибрация
    const footer = document.querySelector('.app-footer');
    if (footer) footer.addEventListener('click', (e) => { if (e.target.closest('.footer-item')) try { Telegram.WebApp.HapticFeedback.impactOccurred('medium'); } catch(e){} });

    // КЛИК НА ЯРЛЫКИ -> ПЕРЕХОД НА СТРАНИЦУ КВЕСТОВ
    const chalShortcut = document.getElementById('shortcut-challenge');
    if (chalShortcut) {
        chalShortcut.onclick = () => { window.location.href = '/quests?open=twitch_only'; };
    }
    const questShortcut = document.getElementById('shortcut-quests');
    if (questShortcut) {
        questShortcut.onclick = () => {
             // Если квест активен -> просто идем в квесты
             if (userData.active_quest_id) window.location.href = '/quests';
             // Если нет -> открываем рулетку
             else window.location.href = '/quests?open=roulette';
        };
    }
    const shopShortcut = document.getElementById('shortcut-shop');
    if (shopShortcut) {
        shopShortcut.onclick = () => { window.location.href = '/shop'; };
    }

    // Еженедельные цели (модалка)
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
    if(dom.startTutorialBtn) dom.startTutorialBtn.onclick = startTutorial; 
    
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

// --- PULL TO REFRESH ---
function initPullToRefresh() {
    const content = document.getElementById('main-content');
    const ptrContainer = document.getElementById('pull-to-refresh'); 
    const icon = ptrContainer ? ptrContainer.querySelector('i') : null;
    if (!content || !ptrContainer || !icon) return;
    let startY = 0; let pulledDistance = 0; let isPulling = false;

    content.addEventListener('touchstart', (e) => {
        if (content.scrollTop <= 0) { startY = e.touches[0].clientY; isPulling = true; content.style.transition = 'none'; ptrContainer.style.transition = 'none'; }
    }, { passive: true });

    content.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        const diff = e.touches[0].clientY - startY;
        if (diff > 0 && content.scrollTop <= 0) {
            if (e.cancelable) e.preventDefault();
            pulledDistance = Math.min(Math.pow(diff, 0.85), 180);
            content.style.transform = `translateY(${pulledDistance}px)`;
            ptrContainer.style.transform = `translateY(${pulledDistance}px)`;
            icon.style.transform = `rotate(${pulledDistance * 2.5}deg)`;
            icon.style.color = pulledDistance > 80 ? "#34c759" : "#FFD700";
        }
    }, { passive: false });

    content.addEventListener('touchend', () => {
        if (!isPulling) return;
        isPulling = false;
        content.style.transition = 'transform 0.3s ease-out';
        ptrContainer.style.transition = 'transform 0.3s ease-out';
        if (pulledDistance > 80) {
            content.style.transform = `translateY(80px)`; ptrContainer.style.transform = `translateY(80px)`;
            icon.classList.add('fa-spin');
            setTimeout(() => window.location.reload(), 500);
        } else {
            content.style.transform = ''; ptrContainer.style.transform = '';
        }
        pulledDistance = 0;
    });
}

// --- ФУНКЦИИ ТУТОРИАЛА (СОКРАЩЕННО, НО ПОЛНОСТЬЮ РАБОЧИЕ) ---
let currentTutorialStep = 0;
const tutorialSteps = [
    { element: '.user-profile', title: 'Профиль', text: 'Слева ваш профиль, справа билеты.', view: 'view-dashboard' },
    { element: '#main-slider-container', title: 'События', text: 'Здесь актуальные ивенты.', view: 'view-dashboard' },
    { element: '#shortcut-quests', title: 'Задания', text: 'Здесь находятся челленджи.', view: 'view-dashboard', forceTop: true },
    { element: '#nav-leaderboard', title: 'Лидеры', text: 'Рейтинг игроков.', view: 'view-dashboard', forceTop: true }
];
function startTutorial() { currentTutorialStep = 0; dom.tutorialOverlay.classList.remove('hidden'); showTutorialStep(0); }
function showTutorialStep(index) {
    if (index >= tutorialSteps.length) { endTutorial(true); return; }
    const step = tutorialSteps[index];
    const el = document.querySelector(step.element);
    if(el) {
        dom.tutorialTitle.textContent = step.title;
        dom.tutorialText.textContent = step.text;
        dom.tutorialStepCounter.textContent = `${index+1}/${tutorialSteps.length}`;
        el.scrollIntoView({behavior:'smooth', block:'center'});
        const rect = el.getBoundingClientRect();
        dom.tutorialModal.style.top = step.forceTop ? `${rect.top - 150}px` : `${rect.bottom + 20}px`;
    }
}
function endTutorial() { dom.tutorialOverlay.classList.add('hidden'); localStorage.setItem('tutorialCompleted', 'true'); }
if(dom.tutorialNextBtn) dom.tutorialNextBtn.onclick = () => showTutorialStep(++currentTutorialStep);
if(dom.tutorialSkipBtn) dom.tutorialSkipBtn.onclick = () => endTutorial();


// ЗАПУСК
try {
    checkMaintenance();
    setupEventListeners();
    initPullToRefresh();
    main();
    // Обработка сворачивания
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refreshDataSilently();
    });
} catch (e) { console.error("Critical:", e); }
