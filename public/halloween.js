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
        // rewardSectionTitle: document.getElementById('reward-section-title'), // <-- Этого ID нет в HTML, закомментировал
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
        flaskAnimation: document.getElementById('flask-animation'),

        // --- ДОБАВЛЕНЫ ЭЛЕМЕНТЫ ДЛЯ ДАТ ---
        eventDatesSection: document.getElementById('event-dates-section'),
        eventDatesDisplay: document.getElementById('event-dates-display'),
        eventStartDate: document.getElementById('event-start-date'),
        eventEndDate: document.getElementById('event-end-date'),
        adminDatesForm: document.getElementById('admin-dates-form'),
        adminStartDate: document.getElementById('admin-start-date'),
        adminEndDate: document.getElementById('admin-end-date'),
        adminDatesError: document.getElementById('admin-dates-error')
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

    // --- ФУНКЦИИ ФОРМАТИРОВАНИЯ ДАТ ---
    /** Преобразует ISO-строку (или Date) в формат 'YYYY-MM-DD' для <input type="date"> */
    function formatDateToInput(isoString) {
        if (!isoString) return '';
        try {
            return new Date(isoString).toISOString().split('T')[0];
        } catch (e) {
            console.warn(`[DATE] Не удалось отформатировать дату для input: ${isoString}`, e);
            return '';
        }
    }
    /** Преобразует ISO-строку (или Date) в формат 'DD.MM.YYYY' для отображения пользователю */
    function formatDateToDisplay(isoString) {
        if (!isoString) return '...';
        try {
            return new Date(isoString).toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        } catch (e) {
            console.warn(`[DATE] Не удалось отформатировать дату для display: ${isoString}`, e);
            return '...';
        }
    }
    // --- КОНЕЦ ФУНКЦИЙ ФОРМАТИРОВАНИЯ ДАТ ---

    // --- 👇👇👇 НАЧАЛО ИЗМЕНЕННОГО БЛОКА (ФИКС ТЕМ) 👇👇👇 ---
    function setTheme(themeName) {
        console.log(`[THEME] Устанавливаем тему: ${themeName}`);
        document.body.dataset.theme = themeName;
        // Обновляем "активную" кнопку на переключателе
        dom.themeSwitcher.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.themeSet === themeName);
        });

        // УДАЛЕНО: `localStorage.setItem`. Локальное хранилище админа
        // больше не используется, тема всегда берется с сервера.

        const currentThemeAssets = THEME_ASSETS[themeName] || THEME_ASSETS.classic;
        
        const { levels = {} } = currentEventData; // Убедимся, что currentEventData доступна
        const currentLevel = getCurrentLevel(currentEventData);
        const levelConfig = levels[`level_${currentLevel}`] || {};
        const defaultReward = levelConfig.default_reward || {};
        
        // Обновляем картинку награды по умолчанию, если она зависит от темы
        // (Мы проверяем, установлена ли картинка с сервера, и только если НЕТ, ставим картику из THEME_ASSETS)
        if (dom.rewardImage.src.includes('URL_ВАШЕЙ_НАГРАДЫ')) { // Проверяем, не установлена ли уже кастомная
             dom.rewardImage.src = defaultReward.image_url || currentThemeAssets.default_reward_image;
        }
        console.log(`[THEME] Тема ${themeName} применена.`);
    }
    // --- 👆👆👆 КОНЕЦ ИЗМЕНЕННОГО БЛОКА (ФИКС ТЕМ) 👆👆👆 ---
    
    function getCurrentLevel(eventData) {
        const { goals = {}, current_progress = 0 } = eventData;
        if (goals.level_3 && current_progress >= goals.level_3) return 4;
        if (goals.level_2 && current_progress >= goals.level_2) return 3;
        if (goals.level_1 && current_progress >= goals.level_1) return 2;
        return 1;
    }
    
    function renderPage(eventData, leaderboardData = {}) {
        console.log('[RENDER] Начинаем отрисовку страницы (renderPage).');
        
        // Стабильная сортировка (без изменений)
        if (leaderboardData.top20 && Array.isArray(leaderboardData.top20)) {
            leaderboardData.top20.sort((a, b) => {
                const contributionDiff = (b.total_contribution || 0) - (a.total_contribution || 0);
                if (contributionDiff !== 0) return contributionDiff;
                const nameA = a.full_name || '';
                const nameB = b.full_name || '';
                return nameA.localeCompare(nameB);
            });
        }
        
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

        // --- ЛОГИКА ДЛЯ ОТОБРАЖЕНИЯ/РЕДАКТИРОВАНИЯ ДАТ ---
        if (isAdmin) {
            dom.adminDatesForm.classList.remove('hidden');
            dom.eventDatesDisplay.classList.add('hidden');
            dom.adminStartDate.value = formatDateToInput(eventData.start_date);
            dom.adminEndDate.value = formatDateToInput(eventData.end_date);
        } else {
            dom.adminDatesForm.classList.add('hidden');
            dom.eventDatesDisplay.classList.remove('hidden');
            dom.eventStartDate.textContent = formatDateToDisplay(eventData.start_date);
            dom.eventEndDate.textContent = formatDateToDisplay(eventData.end_date);
        }
        // --- КОНЕЦ ЛОГИКИ ДАТ ---

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
        else if (currentLevel === 4) { currentGoal = goals.level_4 || goals.level_3; prevGoal = goals.level_3; }
        
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
        
        // if (dom.rewardSectionTitle) {
        //     dom.rewardSectionTitle.textContent = `Награды Уровня ${currentLevel}`;
        // }
        
        const defaultRewardName = defaultReward.name || 'Награда не настроена';
        dom.rewardName.textContent = defaultRewardName;
        const activeTheme = document.body.dataset.theme || 'halloween';
        // Устанавливаем картинку с сервера, если она есть, иначе - из ассетов темы
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

    // --- 👇👇👇 НАЧАЛО ИЗМЕНЕННОГО БЛОКА (ФИКС ТЕМ) 👇👇👇 ---
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

            // ДОБАВЛЯЕМ КЛАСС АДМИНА
            if (currentUserData.is_admin) {
                document.body.classList.add('is-admin');
            }
            
            // ИСПРАВЛЕНА ЛОГИКА ТЕМ:
            // Тема ВСЕГДА берется с сервера (`eventData.current_theme`).
            // `setTheme` просто применит ее (и для админа, и для юзера).
            const globalTheme = eventData.current_theme || 'halloween'; 
            setTheme(globalTheme);
            console.log(`[MAIN] Установлена глобальная тема с сервера: ${globalTheme}`);
            
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
    // --- 👆👆👆 КОНЕЦ ИЗМЕНЕННОГО БЛОКА (ФИКС ТЕМ) 👆👆👆 ---

    // --- ОБРАБОТЧИКИ СОБЫТИЙ ---

    // Обработчик вклада (без изменений)
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
            const result = await makeApiRequest('/api/v1/events/cauldron/contribute', { amount });
            
            tg.showAlert("Ваш вклад принят!"); 
            currentUserData.tickets = result.new_ticket_balance;
            dom.userTicketBalance.textContent = result.new_ticket_balance;
            dom.ticketsInput.value = '';
            console.log('[EVENT] Баланс пользователя мгновенно обновлен на странице.');

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

            setTimeout(() => {
                flask.classList.remove('animate');
                cauldron.classList.remove('pulse');
                
                // Обновляем прогресс-бар и лидерборд, чтобы увидеть изменения
                fetchDataAndRender();
            }, 1200);

        } catch(error) {
            if (error.message && error.message.includes("трейд-ссылку")) {
                tg.showConfirm(
                    "Пожалуйста, укажите вашу трейд-ссылку в профиле для участия. Перейти в профиль сейчас?",
                    (ok) => {
                        if (ok) {
                            window.location.href = '/profile';
                        }
                    }
                );
            } else {
                dom.errorMessage.textContent = error.message;
                dom.errorMessage.classList.remove('hidden');
            }
        } finally {
            setTimeout(() => {
                 submitButton.disabled = false;
            }, 1500);
        }
    });


    // --- 👇👇👇 НАЧАЛО ИЗМЕНЕННОГО БЛОКА (ФИКС ТЕМ) 👇👇👇 ---
    // Обработчик смены темы (теперь асинхронный и отправляет API)
    dom.themeSwitcher.addEventListener('click', async (e) => {
        const button = e.target.closest('.theme-btn');
        if (button && button.dataset.themeSet) {
            const themeName = button.dataset.themeSet;
            console.log(`[EVENT] Клик по переключателю тем. Новая тема: ${themeName}`);
            
            // 1. Сразу меняем тему локально для админа (для UI отклика)
            setTheme(themeName); 
            
            try {
                // 2. Отправляем изменение на сервер, чтобы оно стало глобальным
                await makeApiRequest('/api/v1/events/cauldron/admin/set-theme', { theme: themeName });
                console.log(`[API SUCCESS] Глобальная тема успешно обновлена на ${themeName}`);
            } catch (error) {
                console.error('[API ERROR] Не удалось обновить тему на сервере:', error);
                tg.showAlert('Ошибка при смене темы на сервере. Тема может не сохраниться для других пользователей.');
            }
        }
    });
    // --- 👆👆👆 КОНЕЦ ИЗМЕНЕННОГО БЛОКА (ФИКС ТЕМ) 👆👆👆 ---

    // --- 👇👇👇 НАЧАЛО НОВОГО БЛОКА (ФОРМА ДАТ) 👇👇👇 ---
    dom.adminDatesForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = dom.adminDatesForm.querySelector('button[type="submit"]');
        console.log('[EVENT] Админ сохраняет даты.');
        
        dom.adminDatesError.classList.add('hidden');
        submitButton.disabled = true;

        const startDate = dom.adminStartDate.value;
        const endDate = dom.adminEndDate.value;

        if (!startDate || !endDate) {
            dom.adminDatesError.textContent = 'Обе даты должны быть заполнены.';
            dom.adminDatesError.classList.remove('hidden');
            submitButton.disabled = false;
            return;
        }

        try {
            // Предполагаемый API эндпоинт. Замени, если он другой.
            const result = await makeApiRequest('/api/v1/events/cauldron/admin/update-details', {
                start_date: new Date(startDate).toISOString(),
                end_date: new Date(endDate).toISOString()
            });
            
            // Обновляем локальные данные, чтобы не перезагружать всю страницу
            currentEventData.start_date = result.event.start_date;
            currentEventData.end_date = result.event.end_date;
            
            tg.showAlert('Даты ивента успешно обновлены!');

        } catch (error) {
            dom.adminDatesError.textContent = `Ошибка: ${error.message}`;
            dom.adminDatesError.classList.remove('hidden');
        } finally {
            submitButton.disabled = false;
        }
    });
    // --- 👆👆👆 КОНЕЦ НОВОГО БЛОКА (ФОРМА ДАТ) 👆👆👆 ---


    // Обработчик модалки правил
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

    // Обработчики просмотра изображений (без изменений)
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

    dom.viewerCloseBtn.addEventListener('click', () => {
        dom.imageViewerModal.classList.add('hidden');
        dom.viewerImage.src = ''; 
        dom.viewerCaption.textContent = ''; 
    });

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
    fetchDataAndRender(); // Первый запуск

    const rulesViewed = localStorage.getItem('cauldronRulesViewed');
    if (!rulesViewed) {
        dom.rulesButton.classList.add('highlight');
        dom.tutorialOverlay.classList.remove('hidden');
    }
});
