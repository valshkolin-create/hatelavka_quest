// ================================================================
// 1. ИНИЦИАЛИЗАЦИЯ И ПЛАТФОРМА (VK / TG)
// ================================================================
let isVk = false;
(function initVkParams() {
    window.vkParams = null;
    const isValid = (str) => str && str.includes('vk_user_id') && str.includes('sign');
    try {
        let s = window.location.search; if (s.startsWith('?')) s = s.slice(1);
        if (isValid(s)) { window.vkParams = s; isVk = true; return; }
        
        let h = window.location.hash; if (h.startsWith('#') || h.startsWith('?')) h = h.slice(1);
        if (isValid(h)) { window.vkParams = h; isVk = true; return; }
        
        if (isValid(window.name)) { window.vkParams = window.name; isVk = true; return; }
        
        const href = window.location.href; const match = href.match(/(vk_user_id=[^#]*)/);
        if (match && match[1] && match[1].includes('sign')) { window.vkParams = match[1]; isVk = true; return; }
    } catch (e) {}
})();

function getAuthPayload() {
    if (isVk) return { initData: window.vkParams || '', platform: 'vk' };
    return { initData: window.Telegram?.WebApp?.initData || '', platform: 'tg' };
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
        
        if (method !== 'GET') options.body = JSON.stringify({ ...body, ...getAuthPayload() });
        else {
            const separator = url.includes('?') ? '&' : '?';
            url += `${separator}initData=${encodeURIComponent(getAuthPayload().initData)}`;
        }

        const response = await fetch(url, options);
        clearTimeout(timeoutId); 

        if (response.status === 429) throw new Error('Cooldown active');
        if (response.status === 204) return null;
        
        const result = await response.json();

        if (!response.ok) {
            // 🔥 ПРОВЕРКА НА МУЛЬТИАККАУНТ (Status 403)
            if (response.status === 403) {
                const errorMsg = result.detail || "Использование мультиаккаунтов запрещено.";
                window.showSecurityBlock(errorMsg); // Показываем красное окно
                throw new Error("Security Block"); // Специальная метка для catch
            }
            
            throw new Error(result.detail || result.message || 'Ошибка сервера');
        }
        return result;
    } catch (e) {
        if (e.name === 'AbortError') e.message = "Превышено время ожидания ответа от сервера.";
        
        // Чтобы окно блокировки не перекрывалось обычным сервисным алертом:
        if (e.message !== 'Cooldown active' && e.message !== 'Security Block' && !isSilent) {
             customAlert(`Ошибка: ${e.message}`);
        }
        throw e;
    } finally {
        if (!isSilent && dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
    }
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

    return fetch('/api/v1/shop/smart_balance', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(getAuthPayload()) })
    .then(r => r.json())
    .then(data => {
        if (updateUI && data) {
            let coins = data.balance || 0; 
            // Это добавит красивые пробелы: 40000 -> 40 000
            let displayBalance = Number((coins / 100).toFixed(0)).toLocaleString('ru-RU');
            const balanceEl = document.getElementById('user-balance');
            if (balanceEl) { balanceEl.style.opacity = '0.5'; setTimeout(() => { balanceEl.textContent = displayBalance; balanceEl.style.opacity = '1'; }, 150); }

            let tickets = data.tickets || 0; 
            let displayTickets = Number(tickets).toLocaleString('ru-RU'); // Добавили эту переменную
            const ticketsEl = document.getElementById('ticketStats');
            if (ticketsEl) { ticketsEl.style.opacity = '0.5'; setTimeout(() => { ticketsEl.textContent = displayTickets; ticketsEl.style.opacity = '1'; }, 150); }
        }
    }).catch(err => {}).finally(() => { setTimeout(() => { isBalanceLoading = false; if (iconCoins) iconCoins.classList.remove('fa-spin'); }, 500); });
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

    async function runCheck() {
        if (!popup.classList.contains('visible')) return; 
        try {
            const fresh = await makeApiRequest('/api/v1/bootstrap', {}, 'POST', true);
            if (fresh && fresh.user) { userData = fresh.user; if (userData.twitch_id) renderTwitchSection(); }
            
            let tgOk = false;
            try { const tgRes = await makeApiRequest('/api/v1/user/check_subscription', { initData: Telegram.WebApp.initData }, 'POST', true); if (tgRes && tgRes.is_subscribed) tgOk = true; } catch(e) {}
            
            const twitchOk = !!userData.twitch_id;
            if (tgOk) { stepTg.style.border = '1px solid #34c759'; document.getElementById('icon-tg').className = 'fa-solid fa-circle-check'; document.getElementById('icon-tg').style.color = '#34c759'; }
            if (tgOk && twitchOk) {
                actionBtn.disabled = false; actionBtn.innerHTML = "ЗАБРАТЬ БОНУС 🎁"; actionBtn.style.background = "#FFD700"; actionBtn.style.color = "#000"; actionBtn.onclick = claimReward; 
            } else {
                actionBtn.disabled = false; actionBtn.textContent = "Проверить снова"; actionBtn.onclick = runCheck;
            }
        } catch (e) { actionBtn.disabled = false; actionBtn.textContent = "Ошибка проверки"; }
    }
    setTimeout(runCheck, 400);
}

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

function renderGiftResult(result) {
    dom.giftContentInitial.classList.add('hidden'); dom.giftContentResult.classList.remove('hidden');
    const giftBtn = document.getElementById('daily-gift-btn'); if (giftBtn) giftBtn.style.display = 'none'; 
    dom.giftContainer.classList.add('hidden'); dom.giftPromoBlock.classList.add('hidden'); 

    if (result.type === 'tickets') { dom.giftResultIcon.innerHTML = "🎟️"; dom.giftResultText.innerHTML = `Вы получили <b>${result.value}</b> билетов!`; } 
    else if (result.type === 'coins') { dom.giftResultIcon.innerHTML = "💰"; dom.giftResultText.innerHTML = `Вы получили <b>${result.value}</b> монет!`; dom.giftPromoBlock.classList.remove('hidden'); } 
    else if (result.type === 'skin') { dom.giftResultIcon.innerHTML = `<img src="${escapeHTML(result.meta.image_url)}" style="width:100px; height:100px; object-fit:contain;">`; dom.giftResultText.innerHTML = `<b>${escapeHTML(result.meta.name)}</b>`; }

    if (result.subscription_required) {
        if (giftBtn) giftBtn.style.display = 'flex'; 
        dom.giftResultTitle.textContent = "ПОЧТИ ТВОЁ!"; dom.giftResultTitle.style.color = "#ff3b30";
        if (result.type === 'coins') { dom.giftPromoCode.textContent = "🔒 ПОДПИШИСЬ"; dom.giftPromoCode.style.filter = "blur(5px)"; }
        dom.giftCloseBtn.textContent = "Подписаться и забрать"; dom.giftCloseBtn.style.background = "#0088cc";
        dom.giftCloseBtn.onclick = (e) => { e.preventDefault(); Telegram.WebApp.openTelegramLink("https://t.me/hatelovettv"); dom.giftModalOverlay.classList.add('hidden'); unlockAppScroll(); };
    } else {
        dom.giftResultTitle.textContent = "Поздравляем!"; dom.giftResultTitle.style.color = "#34c759";
        if (result.type === 'coins') { dom.giftPromoCode.textContent = result.meta.code; dom.giftPromoCode.style.filter = "none"; }
        dom.giftCloseBtn.textContent = "Круто!"; dom.giftCloseBtn.style.background = "#555";
        dom.giftCloseBtn.onclick = () => { dom.giftModalOverlay.classList.add('hidden'); unlockAppScroll(); };
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
async function initDynamicRaffleSlider() {
    const container = document.getElementById('mini-raffle-slider');
    if (!container) return;

    try {
        const data = await makeApiRequest('/api/v1/raffles/active', {}, 'POST', true);
        
        // БЕЗОПАСНО ИЩЕМ МАССИВ (на случай если API возвращает объект)
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

                // Создаем точки конкретно для этого слайда (они будут внутри info-блока)
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


            // Запуск таймеров
            const updateTimers = () => {
                container.querySelectorAll('.raffle-mini-timer-dyn').forEach(el => {
                    const diff = new Date(el.dataset.endtime) - new Date();
                    if (diff <= 0) { 
                        el.innerHTML = "<span style='color:#ff3b30; font-size:10px;'>ЗАВЕРШЕН</span>"; 
                        return; 
                    }
                    
                    // Высчитываем дни, часы, минуты и секунды
                    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
                    const m = Math.floor((diff / (1000 * 60)) % 60);
                    const s = Math.floor((diff / 1000) % 60);
                    
                    const spans = el.querySelectorAll('span');
                    if (spans.length === 3) {
                        // Если есть дни, добавляем их вместе с часами
                        spans[0].innerText = d > 0 ? `${d}д ${String(h).padStart(2, '0')}` : String(h).padStart(2, '0');
                        spans[1].innerText = String(m).padStart(2, '0');
                        spans[2].innerText = String(s).padStart(2, '0');
                    }
                });
            };
            updateTimers();
            setInterval(updateTimers, 1000);

            // Перелистывание слайдов
            const slides = container.querySelectorAll('.mini-raffle-slide');
            if (slides.length > 1) {
                let cur = 0;
                setInterval(() => {
                    slides[cur].classList.remove('active');
                    cur = (cur + 1) % slides.length;
                    slides[cur].classList.add('active');
                }, 4000); 
            }
        } else {
            container.innerHTML = '<span style="font-size:14px; font-weight:800; color:#fff; text-transform:uppercase;">РОЗЫГРЫШИ</span>';
        }
    } catch (e) {
        console.warn("Raffle mini-slider error:", e);
        container.innerHTML = '<span style="font-size:12px; font-weight:800; color:#ff3b30;">ОШИБКА</span>';
    }
}

async function renderFullInterface(data) {
    userData = data.user || {}; allQuests = data.quests || [];
    const menuContent = data.menu;

    if (document.getElementById('ticketStats')) document.getElementById('ticketStats').textContent = userData.tickets || 0;
    dom.fullName.textContent = userData.full_name || "Профиль";
    if (userData.is_admin) dom.navAdmin.classList.remove('hidden');

    // 👇 ВОТ ЭТОТ БЛОК ДЛЯ ФОТОГРАФИИ 👇
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) {
        if (userData.photo_url) {
            avatarEl.src = userData.photo_url; // Ставим фото из базы
        } else {
            // Если фото нет, ставим первую букву имени на темном фоне с желтым текстом
            const firstLetter = (userData.full_name || "U").charAt(0).toUpperCase();
            avatarEl.src = `https://placehold.co/64x64/2c2c2e/FFD700?text=${firstLetter}`;
        }
    }

    checkReferralAndWelcome(userData);

    if (menuContent) {
         if (menuContent.bonus_gift_enabled !== undefined) bonusGiftEnabled = menuContent.bonus_gift_enabled;
         const setupSlide = (id, enabled, url, link) => {
             const slide = document.querySelector(`[data-event="${id}"]`);
             if (slide) {
                 const show = enabled || userData.is_admin; slide.style.display = show ? '' : 'none';
                 if (show) { if (link) slide.href = link; if (url) { const img = slide.querySelector('img'); if (img) img.src = url; } }
             }
         };
         setupSlide('skin_race', menuContent.skin_race_enabled, menuContent.menu_banner_url);
         setupSlide('auction', menuContent.auction_enabled, menuContent.auction_banner_url || (menuContent.auction_slide_data ? menuContent.auction_slide_data.image_url : null), '/auction');
         setupSlide('checkpoint', menuContent.checkpoint_enabled, menuContent.checkpoint_banner_url);
    }
    const eventSlide = document.querySelector('[data-event="cauldron"]');
    if (eventSlide && data.cauldron) { const show = data.cauldron.is_visible_to_users || userData.is_admin; eventSlide.style.display = show ? '' : 'none'; if (show && data.cauldron.banner_image_url) eventSlide.querySelector('img').src = data.cauldron.banner_image_url; }

    updateShortcutStatuses(userData, allQuests);
    updateShopTile(userData.active_trade_status || 'none');
    setTimeout(() => { if (typeof checkGift === 'function') checkGift(); }, 1000);
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

async function loadCategory(catId) {
    const container = document.getElementById('shop-grid');
    if (!container) return;

    if (itemsCache[catId]) {
        renderItems(itemsCache[catId]);
        return;
    }

    container.innerHTML = Array(6).fill('<div class="shop-item skeleton" style="height: 180px; background: transparent; border-radius: 12px; animation: pulse 1.5s infinite;"></div>').join('');

    try {
        const items = await makeApiRequest('/api/v1/shop/goods', { category_id: catId }, 'POST', true);
        itemsCache[catId] = items;
        renderItems(items);
    } catch (e) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#ff3b30; padding: 20px;">Ошибка загрузки</div>';
    }
}

function renderItems(items) {
    const container = document.getElementById('shop-grid');
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#888; padding: 20px;">Пусто</div>';
        return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'shop-item';
        
        // Убираем фоны и рамки у самой карточки
        el.style.background = 'transparent'; 
        el.style.boxShadow = 'none';
        el.style.border = 'none';

        let buttonHtml = '';
        const upperName = (item.name || "").toUpperCase();
        const isCase = upperName.includes("КЕЙС |") || upperName.includes("CASE |");
        const safeName = item.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeImg = item.image_url || "";
        const cleanName = item.name.replace(/^(Кейс|Case)\s*\|\s*/i, '').trim();

        if (item.is_folder) {
            // ЕСЛИ ЭТО КАТЕГОРИЯ
            el.innerHTML = `
                <div class="item-image-wrapper" onclick="openFolder(${item.id})" style="width: 100%; padding-top: 100%; position: relative; background: transparent; cursor: pointer;">
                    <img src="${safeImg}" class="item-image" loading="lazy" onload="this.classList.add('loaded')" style="position: absolute; top: 10%; left: 10%; width: 80%; height: 80%; object-fit: contain; opacity: 0; transition: opacity 0.3s;">
                </div>
                <div class="item-info" style="padding: 10px; display: flex; flex-direction: column; flex-grow: 1; gap: 4px; text-align: center; z-index: 8;">
                    <div class="item-title" style="font-size: 13px; font-weight: 800; color: #fff;">${escapeHTML(cleanName)}</div>
                    <button class="action-btn btn-folder" onclick="openFolder(${item.id})" style="background: rgba(255, 255, 255, 0.1); color: #fff; width: 100%; height: 34px; border: none; border-radius: 8px; font-weight: 600; font-size: 11px;">Открыть <i class="fa-solid fa-chevron-right" style="font-size:10px; margin-left:3px;"></i></button>
                </div>
            `;
        } else if (isCase) {
            // ЕСЛИ ЭТО КЕЙС
            buttonHtml = `
                <div class="case-buttons-container" style="display:flex; flex-direction:column; gap:6px; width:100%;">
                    <button class="action-btn btn-buy" onclick="openCase(${item.id}, ${item.price}, '${safeName}', '${safeImg}', 'coins')" style="background: linear-gradient(135deg, #ffd700 0%, #ffaa00 100%); color: #000; box-shadow: 0 2px 10px rgba(255, 204, 0, 0.2); width: 100%; height: 34px; border: none; border-radius: 8px; font-weight: 600; font-size: 11px;">Открыть за ${item.price} 🟡</button>
                    <button class="action-btn btn-buy-tickets" onclick="openCase(${item.id}, ${item.price * 2}, '${safeName}', '${safeImg}', 'tickets')" style="background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%); color: #fff; box-shadow: 0 2px 10px rgba(37, 117, 252, 0.2); width: 100%; height: 34px; border: none; border-radius: 8px; font-weight: 600; font-size: 11px;">Открыть за ${item.price * 2} 🎟️</button>
                </div>
            `;
            
            el.innerHTML = `
                <div class="item-title case-top-title" style="font-size:13px; font-weight:800; color:#fff; text-align:center; white-space:nowrap; text-transform:uppercase;">${formatItemName(cleanName)}</div>
                <div class="item-image-wrapper case-img-wrap" onclick="openCaseContents(event, '${safeName}')" style="background: transparent; padding-top: 80%;">
                    <div class="case-info-overlay"><span>Посмотреть дроп</span></div>
                    <img src="${safeImg}" class="item-image case-zoom" loading="lazy" onload="this.classList.add('loaded')">
                </div>
                <div class="item-info" style="padding: 0 10px 10px 10px; flex-grow: 0;">${buttonHtml}</div>
            `;
        } else {
            // ЕСЛИ ЭТО ОБЫЧНЫЙ ПРЕДМЕТ
            let stockText = item.count === null ? '∞ шт.' : `${item.count} шт.`;
            let btnHtml = item.count === 0 
                ? `<button class="action-btn btn-disabled" disabled style="background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.3); width: 100%; height: 34px; border: none; border-radius: 8px; font-weight: 600; font-size: 11px;">Раскуплено</button>`
                : `<button class="action-btn btn-buy" onclick="buyItem(${item.id}, ${item.price}, '${safeName}', '${safeImg}')" style="background: linear-gradient(135deg, #ffd700 0%, #ffaa00 100%); color: #000; box-shadow: 0 2px 10px rgba(255, 204, 0, 0.2); width: 100%; height: 34px; border: none; border-radius: 8px; font-weight: 600; font-size: 11px;">Купить за ${item.price} 🟡</button>`;
            
            el.innerHTML = `
                <div class="item-image-wrapper" onclick="openCaseContents(event, '${safeName}')" style="width: 100%; padding-top: 100%; position: relative; background: transparent; cursor: pointer;">
                    <img src="${safeImg}" class="item-image" loading="lazy" onload="this.classList.add('loaded')" style="position: absolute; top: 10%; left: 10%; width: 80%; height: 80%; object-fit: contain; opacity: 0; transition: opacity 0.3s;">
                </div>
                <div class="item-info" style="padding: 10px; display: flex; flex-direction: column; flex-grow: 1; gap: 4px; text-align: center; z-index: 8;">
                    <div class="item-title" style="font-size: 11px; font-weight: 600; color: #fff; line-height: 1.2; min-height: 34px; display: flex; align-items: center; justify-content: center;">${formatItemName(cleanName)}</div>
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

    // Авто-уменьшение шрифта для длинных названий кейсов
    container.querySelectorAll('.case-top-title').forEach(title => {
        let fontSize = 13; 
        while (title.scrollWidth > title.offsetWidth && fontSize > 7) {
            fontSize -= 0.5;
            title.style.fontSize = fontSize + 'px';
        }
    });
}

async function validateUserTradeLink() {
    const loader = document.getElementById('purchase-loader');
    if (loader) { loader.querySelector('.loader-text').innerText = "Проверка профиля..."; loader.classList.add('active'); }
    try {
        const res = await makeApiRequest('/api/v1/user/me', {}, 'POST', true);
        const tLink = res?.trade_link || "";
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

    customConfirm(`Открыть "${name}" за ${price} ${currency === 'coins' ? '🟡' : '🎟️'}?`, async (ok) => {
        if (!ok) return;
        const loader = document.getElementById('purchase-loader');
        if (loader) { loader.querySelector('.loader-text').innerText = "Крутим барабан..."; loader.classList.add('active'); }

        try {
            const contentsResp = await makeApiRequest(`/api/v1/shop/case_contents?case_name=${encodeURIComponent(name)}`, {}, 'GET', true);
            const possibleItems = (contentsResp && contentsResp.length > 0) ? contentsResp : [{ name: "Mystery Item", image_url: imageUrl, rarity: "common" }];

            const resData = await makeApiRequest('/api/v1/shop/buy', { item_id: id, price: price, title: name, image_url: imageUrl, currency: currency }, 'POST');
            let winner = resData.winner || { name: "Ошибка", image_url: imageUrl, rarity: 'common' };

            let strip = [];
            for(let i=0; i<80; i++) strip.push(possibleItems[Math.floor(Math.random() * possibleItems.length)]);
            strip[60] = winner; 

            launchRoulette(strip, winner, resData.messages || [], resData.lacky, name);
            checkBalance(true);
        } catch (err) { } finally { if (loader) loader.classList.remove('active'); }
    });
};

function launchRoulette(items, winner, extraMessages, lacky, rawCaseName) {
    const modal = document.getElementById('r-modal');
    const area = document.getElementById('r-area');
    const track = document.getElementById('r-track');
    const winScreen = document.getElementById('r-win');
    
    document.getElementById('r-case-name').innerText = (rawCaseName || "").replace(/^(Кейс|Case)\s*\|\s*/i, '').trim();
    
    let currentLacky = lacky || 1; 
    const dots = document.querySelectorAll('#r-bottom-progress .r-progress-dot');
    dots.forEach((dot, index) => {
        dot.className = 'r-progress-dot'; 
        if (index < currentLacky) { dot.classList.add('active'); if (index === 4 && currentLacky === 5) dot.classList.add('guaranteed'); }
    });

    const progressTextEl = document.getElementById('r-progress-text');
    if (currentLacky === 5) progressTextEl.innerHTML = '<span style="color: #ffcc00; font-size: 11px;">🔥 ГАРАНТ АКТИВЕН 🔥</span>';
    else progressTextEl.innerHTML = `Осталось <span style="color: #fff; font-weight: 800;">${5 - currentLacky}</span> до гаранта`;

    document.getElementById('r-top-header').style.display = 'flex';
    document.getElementById('r-bottom-progress').style.display = 'flex';

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

window.claimItem = async function(itemId) {
    showShopModal({ title: "Вывести в Steam?", subtitle: "Ожидайте трейд в течение 24 часов.", confirmText: "ЗАБРАТЬ", confirmClass: "btn-yellow-modal", onConfirm: async (closeModal) => {
        const loader = document.getElementById('purchase-loader'); if (loader) { loader.classList.add('active'); loader.querySelector('.loader-text').innerText = "Создаем заявку..."; }
        try {
            const res = await makeApiRequest('/api/v1/user/inventory/withdraw', { history_id: itemId }, 'POST');
            if (res && res.status === 'offer_replacement') { closeModal(); if (loader) loader.classList.remove('active'); showReplacementChoice(res.options, itemId); return; }
            if (res) customAlert(`✅ Успешно! Ожидайте трейд.`);
            closeModal(); closeRoulette();
        } catch (e) { closeModal(); } finally { if (loader) loader.classList.remove('active'); }
    }});
}

window.sellForTickets = function(itemId, price) {
    showShopModal({ title: `Продать за ${price} 🎟️?`, subtitle: "Билеты начислятся моментально.", confirmText: "ПРОДАТЬ", confirmClass: "btn-purple-modal", onConfirm: async (closeModal) => {
        const loader = document.getElementById('purchase-loader'); if (loader) { loader.classList.add('active'); loader.querySelector('.loader-text').innerText = "Продаем..."; }
        try {
            await makeApiRequest('/api/v1/user/inventory/sell', { history_id: itemId }, 'POST');
            customAlert(`Успешно! +${price} билетов.`); closeModal(); closeRoulette(); checkBalance(true);
        } catch (e) { closeModal(); } finally { if (loader) loader.classList.remove('active'); }
    }});
}

window.openCaseContents = async function(event, caseName) {
    if (event) event.stopPropagation();
    const modal = document.getElementById('case-contents-modal'); const list = document.getElementById('case-items-list'); const loader = document.getElementById('contents-loader');
    modal.classList.remove('hidden'); loader.style.display = 'block'; list.innerHTML = '';
    try {
        const data = await makeApiRequest(`/api/v1/shop/case_contents?case_name=${encodeURIComponent(caseName)}`, {}, 'GET', true);
        data.sort((a,b) => (parseFloat(b.price)||0) - (parseFloat(a.price)||0));
        list.innerHTML = data.map(item => {
            let rClass = 'blue'; const r = (item.rarity || '').toLowerCase();
            if (r.includes('purple')) rClass = 'purple'; else if (r.includes('pink')) rClass = 'pink'; else if (r.includes('red')) rClass = 'red'; else if (r.includes('gold')) rClass = 'gold';
            return `<div class="content-item ${rClass}"><img src="${item.image_url}" loading="lazy"><div class="content-name">${item.name.split('|').pop().trim()}</div><div class="content-quality">${item.condition || 'FN'}</div></div>`;
        }).join('');
    } catch (e) { list.innerHTML = `<div style="text-align:center; grid-column:1/-1; color:#ff453a;">Ошибка</div>`; } finally { loader.style.display = 'none'; }
}
window.closeContentsModal = () => document.getElementById('case-contents-modal').classList.add('hidden');

window.showReplacementChoice = function(options, historyId) {
    const modal = document.getElementById('replacement-modal'); const container = document.getElementById('replacement-options-list');
    container.innerHTML = options.map(item => {
        let r = (item.rarity || '').toLowerCase(), rClass = 'blue';
        if (r.includes('purple')) rClass = 'purple'; else if (r.includes('pink')) rClass = 'pink'; else if (r.includes('red')) rClass = 'red'; else if (r.includes('gold')) rClass = 'gold';
        const isSticker = item.name_ru.toLowerCase().includes('наклейка') ? 'is-sticker' : '';
        return `<div class="replacement-card ${rClass} ${isSticker}" onclick="initiateReplacementConfirm(${historyId}, '${item.assetid}', '${item.name_ru.replace(/'/g, "")}')"><img src="${item.icon_url}" loading="lazy"><div class="replacement-text-zone"><div class="replacement-name">${escapeHTML(item.name_ru.split('|').pop().trim())}</div><div class="replacement-condition">${escapeHTML(item.condition || '-')}</div></div></div>`;
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

async function checkActiveTradesBackground() {
    try {
        const trades = await makeApiRequest('/api/v1/p2p/my_trades', {}, 'POST', true);
        const activeTrades = trades.filter(t => ['pending', 'active', 'review'].includes(t.status)).sort((a, b) => ({'active':1,'review':2,'pending':3}[a.status] - {'active':1,'review':2,'pending':3}[b.status]));
        const btn = document.getElementById('open-p2p-modal-btn'); if (!btn) return;
        if (activeTrades.length > 0) {
            btn.classList.add('has-active-trade'); const t = activeTrades[0];
            btn.querySelector('.p2p-title').innerText = t.status === 'active' ? "ТРЕБУЕТСЯ ДЕЙСТВИЕ" : t.status === 'review' ? "ПРОВЕРКА АДМИНОМ" : "ЗАЯВКА СОЗДАНА";
            btn.querySelector('.p2p-subtitle').innerText = t.status === 'active' ? "Передайте скин в Steam" : t.status === 'review' ? "Ожидайте начисления монет" : "Ожидание принятия...";
            btn.querySelector('.p2p-icon-box').innerHTML = t.status === 'active' ? '<i class="fa-solid fa-fire"></i>' : t.status === 'review' ? '<i class="fa-solid fa-hourglass-half"></i>' : '<i class="fa-regular fa-clock"></i>';
        } else {
            btn.classList.remove('has-active-trade'); btn.querySelector('.p2p-title').innerText = "Trade-In"; btn.querySelector('.p2p-subtitle').innerText = "Обмен кейсов на 🟡"; btn.querySelector('.p2p-icon-box').innerHTML = '<i class="fa-solid fa-arrow-right-arrow-left"></i>';
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


// ================================================================
// УНИВЕРСАЛЬНЫЕ КАСТОМНЫЕ ДИАЛОГИ (ВМЕСТО СИСТЕМНЫХ)
// ================================================================
// Специальное окно для блокировки абузеров
window.showSecurityBlock = function(message) {
    lockAppScroll(); // Блокируем скролл фона
    showShopModal({
        title: "🔒 Доступ ограничен",
        subtitle: `<div style="text-align:center;">
                      <i class="fa-solid fa-shield-halved" style="font-size:40px; color:#ff3b30; margin-bottom:15px; display:block;"></i>
                      ${message}
                   </div>`,
        confirmText: "ПОДДЕРЖКА",
        confirmClass: "btn-yellow-modal",
        showCancel: false, 
        onConfirm: (close) => {
            // Отправляем юзера к тебе в личку разбираться
            window.location.href = "https://t.me/hatelove_twitch"; 
        }
    });
};
window.customAlert = function(message) {
    showShopModal({
        title: "Внимание",
        subtitle: message,
        confirmText: "ПОНЯТНО",
        confirmClass: "btn-yellow-modal",
        showCancel: false, // Отключаем кнопку "Отмена" для обычных уведомлений
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

// Функция для FAQ
window.showFaq = function() {
    customAlert("Бот позволяет обменивать ненужные скины (Trade-In), участвовать в рулетках и ежедневных розыгрышах.\n\nДля получения призов обязательно привяжите Trade-ссылку в профиле!");
};


// ================================================================
// УНИВЕРСАЛЬНЫЕ КАСТОМНЫЕ ДИАЛОГИ И FAQ
// ================================================================

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
    overlay.querySelector('#modal-confirm').onclick = () => { onConfirm(close); };
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
    try {
        if (!isVk && window.Telegram && !Telegram.WebApp.initData) { 
            if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden'); 
            return; 
        }
        
        // 1. Показываем лоадер с самого начала
        if (dom.loaderOverlay) {
            dom.loaderOverlay.classList.remove('hidden');
            dom.loaderOverlay.style.opacity = '1';
        }
        updateLoading(10); 

        let bootstrapData = null, fakeP = 10;
        const timer = setInterval(() => { if(fakeP < 80) updateLoading(++fakeP); }, 50);
        
        // 2. Грузим базу
        try { 
            bootstrapData = await makeApiRequest("/api/v1/bootstrap", {}, 'POST', true); 
        } catch(apiError) {
            console.error("Ошибка загрузки данных", apiError);
            document.body.innerHTML = '<div style="display:flex; height:100vh; width:100vw; background:#121212; align-items:center; justify-content:center; flex-direction:column; color:#ff3b30; font-family:sans-serif;"><i class="fa-solid fa-triangle-exclamation" style="font-size:40px; margin-bottom:15px;"></i><b>Ошибка соединения</b><button onclick="window.location.reload()" style="margin-top:20px; padding:10px 20px; background:#FFD700; color:#000; border:none; border-radius:10px; font-weight:bold;">Перезагрузить</button></div>';
            return;
        } finally { 
            clearInterval(timer); 
        }
        
        if (!bootstrapData) throw new Error("Нет данных");

        // 🔥 МГНОВЕННАЯ И ЖЕЛЕЗОБЕТОННАЯ БЛОКИРОВКА ТЕХ. РАБОТ 🔥
        if (bootstrapData.maintenance) {
            document.body.innerHTML = '<div style="position:fixed; top:0; left:0; display:flex; height:100vh; width:100vw; background:#121212; align-items:center; justify-content:center; flex-direction:column; color:#FFD700; font-weight:900; font-size:18px; z-index:2147483647;"><i class="fa-solid fa-gear fa-spin" style="font-size:50px; margin-bottom:15px;"></i><span>Технические работы</span><span style="color:#888; font-size:12px; margin-top:5px; font-weight:normal;">Валька уже исправляет...</span></div>';
            return; 
        }

        // 3. Рендерим шапку
        await renderFullInterface(bootstrapData);
        updateLoading(50);

        // 4. Ждем розыгрыши
        await initDynamicRaffleSlider();
        setupSlider();
        updateLoading(70);

        // 5. ЖДЕМ КЕЙСЫ (По твоему ID) И P2P
        await loadCategory(2716312); 
        checkActiveTradesBackground();
        updateLoading(100);

        // 6. ВСЁ ГОТОВО - ПЛАВНО ОТКРЫВАЕМ ЭКРАН
        setTimeout(() => { 
            if (dom.loaderOverlay) {
                dom.loaderOverlay.style.opacity = '0';
                setTimeout(() => dom.loaderOverlay.classList.add('hidden'), 400); // Скрываем после затухания
            }
        }, 300);

    } catch(e) {
        console.error(e);
        // Если это не наша блокировка безопасности — показываем стандартный экран смерти
        if (e.message !== "Security Block") {
            if (dom.loadingText) dom.loadingText.textContent = "Критическая ошибка";
            setTimeout(() => { 
                if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden'); 
            }, 2000);
        }
// ================================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ================================================================
try {
    checkBalance(true); 

    if (window.Telegram?.WebApp) {
        Telegram.WebApp.ready();
        Telegram.WebApp.expand(); 
        
        // 🔥 ФИКС СВОРАЧИВАНИЯ ПРИЛОЖЕНИЯ: Запрещаем Telegram закрывать окно по свайпу вниз
        if (Telegram.WebApp.disableVerticalSwipes) {
            Telegram.WebApp.disableVerticalSwipes();
        }
        
        const isDesktop = ['tdesktop', 'web', 'macos'].includes(Telegram.WebApp.platform);
        if (!isDesktop && Telegram.WebApp.requestFullscreen) {
            Telegram.WebApp.requestFullscreen();
        }
    } 
    
    setupNewUI();
    initPullToRefresh();
    initSwipeTabs(); 
    main();

    clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => { if (!document.hidden) refreshDataSilently(); }, 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshDataSilently(); });
} catch (e) { console.error("Global init error", e); }
