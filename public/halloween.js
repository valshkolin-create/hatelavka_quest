document.addEventListener('DOMContentLoaded', () => {
    console.log('[INIT] DOMContentLoaded сработало. Начинаем инициализацию скрипта.');

    const tg = window.Telegram.WebApp;
    if (!tg) {
        console.error('[INIT] Объект window.Telegram.WebApp не найден! Скрипт не сможет работать.');
        document.body.innerHTML = '<h2>Ошибка: Не удалось инициализировать Telegram Web App.</h2>';
        return;
    }
    console.log('[INIT] Объект Telegram Web App успешно получен.');

    const dom = {
        loaderOverlay: document.getElementById('loader-overlay'),
        appContainer: document.getElementById('app-container'),
        adminNotice: document.getElementById('admin-notice'),
        themeSwitcher: document.getElementById('theme-switcher'),
        eventTitle: document.getElementById('event-title'),
        cauldronImage: document.getElementById('cauldron-image'),
        progressBarFill: document.getElementById('progress-bar-fill'),
        progressText: document.getElementById('progress-text'),
        rewardSectionTitle: document.getElementById('reward-section-title'),
        rewardImage: document.getElementById('reward-image'),
        rewardName: document.getElementById('reward-name'),
        leaderboardRewardsList: document.getElementById('leaderboard-rewards-list'),
        userTicketBalance: document.getElementById('user-ticket-balance'),
        contributionForm: document.getElementById('contribution-form'),
        ticketsInput: document.getElementById('tickets-input'),
        errorMessage: document.getElementById('error-message'),
        rulesButton: document.getElementById('rules-button'),
        rulesModal: document.getElementById('rules-modal'),
        tutorialOverlay: document.getElementById('tutorial-overlay'),
        imageViewerModal: document.getElementById('image-viewer-modal'),
        viewerImage: document.querySelector('.viewer-image'),
        viewerCloseBtn: document.querySelector('.viewer-close-btn'),
        viewerCaption: document.getElementById('viewer-caption'),
        defaultRewardZoomContainer: document.getElementById('default-reward-zoom-container'),
        // --- ДОБАВЛЕН ЭЛЕМЕНТ ФЛАСКИ ---
        flaskAnimation: document.getElementById('flask-animation')
    };
    console.log('[INIT] DOM-элементы найдены и сохранены.');

    const THEME_ASSETS = {
        halloween: { default_reward_image: 'URL_ВАШЕЙ_НАГРАДЫ_HALLOWEEN.png' },
        new_year: { default_reward_image: 'URL_ВАШЕЙ_НАГРАДЫ_NEW_YEAR.png' },
        classic: { default_reward_image: 'URL_ВАШЕЙ_НАГРАДЫ_CLASSIC.png' }
    };
    
    const FALLBACK_CAULDRON_URL = 'https://i.postimg.cc/d1G5DRk1/magic-pot.png';

    let currentUserData = {};
    let currentEventData = {};
    
    async function makeApiRequest(url, body = {}, method = 'POST') {
        console.log(`[API] Начинаем запрос на ${url} методом ${method}`);
        try {
            const options = { method, headers: { 'Content-Type': 'application/json' } };
            if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
                options.body = JSON.stringify({ ...body, initData: tg.initData });
            }
            const response = await fetch(url, options);
            console.log(`[API] Получен ответ от ${url}. Статус: ${response.status}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error(`[API ERROR] Ошибка от сервера (${url}):`, errorData);
                throw new Error(errorData.detail || 'Ошибка сервера');
            }
            
            const data = await response.json();
            console.log(`[API SUCCESS] Успешно получили и распарсили JSON от ${url}`, data);
            return data;
        } catch (e) {
            console.error(`[API FATAL] Критическая ошибка при запросе на ${url}:`, e);
            throw e;
        }
    }

    function escapeHTML(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, match => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'})[match]);
    }

    function setTheme(themeName) {
        console.log(`[THEME] Устанавливаем тему: ${themeName}`);
        document.body.dataset.theme = themeName;
        dom.themeSwitcher.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.themeSet === themeName);
        });

        if (currentUserData.is_admin) {
            console.log('[THEME] Пользователь - админ. Сохраняем тему в localStorage.');
            localStorage.setItem('adminSelectedTheme', themeName);
        }
        
        const currentThemeAssets = THEME_ASSETS[themeName] || THEME_ASSETS.classic;
        
        const { levels = {} } = currentEventData;
        const currentLevel = getCurrentLevel(currentEventData);
        const levelConfig = levels[`level_${currentLevel}`] || {};
        const defaultReward = levelConfig.default_reward || {};
        dom.rewardImage.src = defaultReward.image_url || currentThemeAssets.default_reward_image;
        console.log(`[THEME] Изображение награды по умолчанию обновлено.`);
    }
    
    function getCurrentLevel(eventData) {
        const { goals = {}, current_progress = 0 } = eventData;
        if (goals.level_2 && current_progress >= goals.level_2) return 3;
        if (goals.level_1 && current_progress >= goals.level_1) return 2;
        return 1;
    }
    
    function renderPage(eventData, leaderboardData = {}) {
        console.log('[RENDER] Начинаем отрисовку страницы (renderPage).');
        currentEventData = eventData;
        const isAdmin = currentUserData.is_admin;
        const canViewEvent = eventData && (eventData.is_visible_to_users || isAdmin);
        console.log(`[RENDER] isAdmin: ${isAdmin}, is_visible_to_users: ${eventData?.is_visible_to_users}, canViewEvent: ${canViewEvent}`);

        if (!canViewEvent) {
            console.warn('[RENDER] Ивент неактивен для пользователя. Показываем сообщение.');
            document.body.innerHTML = '<h2 style="text-align:center; padding-top: 50px;">Ивент пока неактивен.</h2>';
            return;
        }

        dom.adminNotice.classList.toggle('hidden', !(isAdmin && !eventData.is_visible_to_users));

        const { goals = {}, levels = {}, current_progress = 0 } = eventData || {};
        const top20 = leaderboardData.top20 || [];
        const currentLevel = getCurrentLevel(eventData);
        console.log(`[RENDER] Текущий прогресс: ${current_progress}, текущий уровень: ${currentLevel}`);

        const cauldronImageUrl = eventData[`cauldron_image_url_${currentLevel}`] 
                               || eventData.cauldron_image_url
                               || FALLBACK_CAULDRON_URL;
        dom.cauldronImage.src = cauldronImageUrl;
        console.log(`[RENDER] URL котла: ${cauldronImageUrl}`);
        
        let currentGoal = 1, prevGoal = 0;
        if (currentLevel === 1) { currentGoal = goals.level_1 || 1; prevGoal = 0; }
        else if (currentLevel === 2) { currentGoal = goals.level_2 || goals.level_1; prevGoal = goals.level_1; }
        else if (currentLevel === 3) { currentGoal = goals.level_3 || goals.level_2; prevGoal = goals.level_2; }
        
        const levelConfig = levels[`level_${currentLevel}`] || {};
        const topPlaceRewards = levelConfig.top_places || [];
        const defaultReward = levelConfig.default_reward || {};

        dom.eventTitle.textContent = eventData.title || "Ивент-Котел";
        const progressInLevel = current_progress - prevGoal;
        const goalForLevel = currentGoal - prevGoal;
        const progressPercentage = (goalForLevel > 0) ? Math.min((progressInLevel / goalForLevel) * 100, 100) : 0;
        dom.progressBarFill.style.width = `${progressPercentage}%`;
        dom.progressText.textContent = `${current_progress} / ${currentGoal}`;
        console.log(`[RENDER] Прогресс-бар обновлен: ${progressPercentage.toFixed(2)}%`);
        
        if (dom.rewardSectionTitle) {
            dom.rewardSectionTitle.textContent = `Награды Уровня ${currentLevel}`;
        }
        
        const defaultRewardName = defaultReward.name || 'Награда не настроена';
        dom.rewardName.textContent = defaultRewardName;
        const activeTheme = document.body.dataset.theme || 'halloween';
        dom.rewardImage.src = defaultReward.image_url || (THEME_ASSETS[activeTheme]?.default_reward_image);
        dom.defaultRewardZoomContainer.dataset.itemName = defaultRewardName;

        if (top20.length === 0) {
            dom.leaderboardRewardsList.innerHTML = '<p style="text-align:center; padding: 20px; color: var(--text-color-muted);">Участников пока нет.</p>';
        } else {
            dom.leaderboardRewardsList.innerHTML = top20.map((p, index) => {
                const rank = index + 1;
                const contributionAmount = p.total_contribution || 0;
                const assignedReward = topPlaceRewards.find(r => r.place === rank);
                const prizeName = escapeHTML(assignedReward?.name || '');
                
                const prizeImageHtml = assignedReward?.image_url 
                    ? `<div class="image-zoom-container" data-item-name="${prizeName}">
                           <img src="${escapeHTML(assignedReward.image_url)}" alt="Приз" class="prize-image">
                           <div class="zoom-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
                       </div>`
                    : `<span>-</span>`;
                
                const rowClass = rank <= 3 ? 'leaderboard-row is-top-3' : 'leaderboard-row';

                let playerName = p.full_name || 'Без имени';
                if (playerName.length > 16) {
                    playerName = playerName.substring(0, 16) + '...';
                }

                return `
                <div class="${rowClass}">
                    <span class="rank">#${rank}</span>
                    <span class="player">${escapeHTML(playerName)}</span>
                    <div class="prize-image-container">${prizeImageHtml}</div>
                    <span class="contribution align-right">${contributionAmount} 🎟️</span>
                </div>`;
            }).join('');
        }
        console.log('[RENDER] Отрисовка страницы (renderPage) завершена.');
    }

    async function fetchDataAndRender() {
        console.log('1. [MAIN] Вызвана функция fetchDataAndRender.');
        try {
            console.log('1.1. [MAIN] Начинаем Promise.all для загрузки всех данных.');
            const [eventData, leaderboardData, userData] = await Promise.all([
                makeApiRequest('/api/v1/events/cauldron/status', {}, 'GET'),
                makeApiRequest('/api/v1/events/cauldron/leaderboard', {}, 'GET'),
                makeApiRequest("/api/v1/user/me", {}, 'POST')
            ]);
            console.log('2. [MAIN] Все данные из Promise.all успешно получены.');
            
            currentUserData = userData;
            console.log('3. [MAIN] Данные пользователя сохранены.', currentUserData);

            if (currentUserData.is_admin) {
                document.body.classList.add('is-admin');
                const savedTheme = localStorage.getItem('adminSelectedTheme') || 'halloween';
                setTheme(savedTheme);
            } else {
                const globalTheme = eventData.current_theme || 'halloween'; 
                setTheme(globalTheme);
            }
            
            dom.userTicketBalance.textContent = currentUserData.tickets || 0;
            console.log('4. [MAIN] Баланс пользователя установлен. Вызываем renderPage.');
            renderPage(eventData, leaderboardData);
            console.log('5. [MAIN] renderPage успешно завершен.');

        } catch (e) {
            console.error('X. [MAIN CATCH] Перехвачена ошибка в fetchDataAndRender:', e);
            document.body.innerHTML = `<h2 style="text-align:center; padding-top: 50px;">Ошибка загрузки ивента: ${e.message}</h2>`;
        } finally {
            console.log('6. [MAIN FINALLY] Блок finally. Скрываем загрузчик.');
            dom.loaderOverlay.classList.add('hidden');
            dom.appContainer.classList.remove('hidden');
        }
    }

    // --- ОБРАБОТЧИКИ СОБЫТИЙ ---

    // --- 👇👇👇 НАЧАЛО ИЗМЕНЕННОГО БЛОКА 👇👇👇 ---
    dom.contributionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = dom.contributionForm.querySelector('button[type="submit"]');
        
        console.log('[EVENT] Форма вклада отправлена.');
        dom.errorMessage.classList.add('hidden');
        const amount = parseInt(dom.ticketsInput.value, 10);
        
        if (!amount || amount <= 0) {
            dom.errorMessage.textContent = 'Введите корректное количество билетов.';
            dom.errorMessage.classList.remove('hidden');
            return;
        }
        if (amount > (currentUserData.tickets || 0)) {
            dom.errorMessage.textContent = 'У вас недостаточно билетов.';
            dom.errorMessage.classList.remove('hidden');
            return;
        }
        
        submitButton.disabled = true;

        try {
            // Шаг 1: Отправляем запрос на сервер. В этот момент запускается и триггер для OBS.
            const result = await makeApiRequest('/api/v1/events/cauldron/contribute', { amount });
            
            // --- УЛУЧШЕНИЕ: Мгновенное обновление баланса ---
            // Сразу после успешного ответа от сервера, обновляем баланс на странице.
            tg.showAlert("Ваш вклад принят!"); // Показываем стандартное уведомление
            currentUserData.tickets = result.new_ticket_balance;
            dom.userTicketBalance.textContent = result.new_ticket_balance;
            dom.ticketsInput.value = '';
            console.log('[EVENT] Баланс пользователя мгновенно обновлен на странице.');
            // --- КОНЕЦ УЛУЧШЕНИЯ ---

            // Шаг 2: Запускаем ЛОКАЛЬНУЮ анимацию фласки на странице
            const flask = dom.flaskAnimation;
            const cauldron = dom.cauldronImage;

            const btnRect = submitButton.getBoundingClientRect();
            const cauldronRect = cauldron.getBoundingClientRect();

            const startX = btnRect.left + (btnRect.width / 2) - (flask.width / 2);
            const startY = btnRect.top + (btnRect.height / 2) - (flask.height / 2);

            const endX = cauldronRect.left + (cauldronRect.width / 2) - (flask.width / 2);
            const endY = cauldronRect.top + (cauldronRect.height / 2) - (flask.height / 2);
            
            flask.style.setProperty('--start-x', `${startX}px`);
            flask.style.setProperty('--start-y', `${startY}px`);
            flask.style.setProperty('--end-x', `${endX}px`);
            flask.style.setProperty('--end-y', `${endY}px`);

            flask.classList.add('animate');
            cauldron.classList.add('pulse');

            // Шаг 3: После завершения локальной анимации, обновляем остальную часть страницы
            setTimeout(() => {
                flask.classList.remove('animate');
                cauldron.classList.remove('pulse');
                
                // Обновляем прогресс-бар и лидерборд, чтобы увидеть изменения
                fetchDataAndRender();
            }, 1200);

        } catch(error) {
            // Проверяем, содержит ли сообщение об ошибке ключевую фразу
            if (error.message && error.message.includes("трейд-ссылку")) {
                // Если да, показываем диалоговое окно Telegram
                tg.showConfirm(
                    "Пожалуйста, укажите вашу трейд-ссылку в профиле для участия. Перейти в профиль сейчас?",
                    (ok) => {
                        if (ok) {
                            // Если пользователь нажал "ОК", перенаправляем его в профиль
                            window.location.href = '/profile';
                        }
                    }
                );
            } else {
                // Для всех остальных ошибок показываем стандартное сообщение
                dom.errorMessage.textContent = error.message;
                dom.errorMessage.classList.remove('hidden');
        }
        } finally {
            setTimeout(() => {
                 submitButton.disabled = false;
            }, 1500);
        }
    });
    // --- 👆👆👆 КОНЕЦ ИЗМЕНЕННОГО БЛОКА 👆👆👆 ---

    dom.themeSwitcher.addEventListener('click', (e) => {
        const button = e.target.closest('.theme-btn');
        if (button && button.dataset.themeSet) {
            console.log(`[EVENT] Клик по переключателю тем. Новая тема: ${button.dataset.themeSet}`);
            setTheme(button.dataset.themeSet);
        }
    });

    dom.rulesButton.addEventListener('click', () => {
        dom.rulesModal.classList.remove('hidden');
        dom.rulesButton.classList.remove('highlight');
        dom.tutorialOverlay.classList.add('hidden'); 
        localStorage.setItem('cauldronRulesViewed', 'true');
    });

    dom.rulesModal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-close-btn') || e.target.classList.contains('modal-overlay')) {
            dom.rulesModal.classList.add('hidden');
        }
    });

    // --- ОБНОВЛЕННЫЕ ОБРАБОТЧИКИ: ДЛЯ ПРОСМОТРА ИЗОБРАЖЕНИЙ ---
    
    // Открытие просмотрщика по клику на контейнер с изображением
    dom.appContainer.addEventListener('click', (e) => {
        const zoomContainer = e.target.closest('.image-zoom-container');
        if (!zoomContainer) return;

        const imageToZoom = zoomContainer.querySelector('img');
        const itemName = zoomContainer.dataset.itemName; 

        if (imageToZoom && imageToZoom.src) {
            dom.viewerImage.src = imageToZoom.src;
            dom.viewerCaption.textContent = itemName || ''; 
            dom.imageViewerModal.classList.remove('hidden');
        }
    });

    // Закрытие просмотрщика по клику на крестик
    dom.viewerCloseBtn.addEventListener('click', () => {
        dom.imageViewerModal.classList.add('hidden');
        dom.viewerImage.src = ''; 
        dom.viewerCaption.textContent = ''; 
    });

    // Закрытие просмотрщика по клику на оверлей (фон)
    dom.imageViewerModal.addEventListener('click', (e) => {
        if (e.target === dom.imageViewerModal) {
            dom.imageViewerModal.classList.add('hidden');
            dom.viewerImage.src = '';
            dom.viewerCaption.textContent = ''; 
        }
    });
    
    // --- ИНИЦИАЛИЗАЦИЯ ---
    console.log('[INIT] Добавляем обработчики событий.');
    tg.ready();
    console.log('[INIT] Telegram.WebApp.ready() вызван.');
    tg.expand();
    console.log('[INIT] Telegram.WebApp.expand() вызван.');
    fetchDataAndRender();

    const rulesViewed = localStorage.getItem('cauldronRulesViewed');
    if (!rulesViewed) {
        dom.rulesButton.classList.add('highlight');
        dom.tutorialOverlay.classList.remove('hidden');
    }
});
