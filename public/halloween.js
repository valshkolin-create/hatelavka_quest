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
        // rewardSectionTitle: document.getElementById('reward-section-title'), // Убрано, т.к. нет в HTML
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

        // --- НОВЫЕ ЭЛЕМЕНТЫ ДЛЯ ДАТ И РЕЖИМА РЕДАКТИРОВАНИЯ ---
        eventDatesDisplay: document.getElementById('event-dates-display'),
        adminControls: document.getElementById('admin-controls'),
        editBtn: document.getElementById('edit-btn'),
        saveBtn: document.getElementById('save-btn'),
        adminDatesModal: document.getElementById('admin-dates-modal'),
        adminDatesForm: document.getElementById('admin-dates-form'),
        adminStartDate: document.getElementById('admin-start-date'),
        adminEndDate: document.getElementById('admin-end-date')
    };
    console.log('[INIT] DOM-элементы найдены и сохранены.');

    const THEME_ASSETS = {
        halloween: { default_reward_image: 'URL_ВАШЕЙ_НАГРАДЫ_HALLOWEEN.png' },
        new_year: { default_reward_image: 'URL_ВАШЕЙ_НАГРАДЫ_NEW_YEAR.png' },
        classic: { default_reward_image: 'URL_ВАШЕЙ_НАГРАДЫ_CLASSIC.png' }
    };
    
    const FALLBACK_CAULDRON_URL = 'https://i.postimg.cc/d1G5DRk1/magic-pot.png';

    let currentUserData = {};
    // currentEventData будет хранить *все* данные страницы, которые админ может редактировать
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
                throw new Error(errorData.detail || `Ошибка ${response.status}`);
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

    // --- ФУНКЦИИ ФОРМАТИРОВАНИЯ ДАТ (для модального окна и дисплея) ---
    function formatDateToInput(isoString) {
        if (!isoString) return '';
        try {
            const date = new Date(isoString);
            // Форматируем в YYYY-MM-DDTHH:MM
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            const hh = String(date.getHours()).padStart(2, '0');
            const min = String(date.getMinutes()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
        } catch (e) {
            console.warn(`[DATE] Не удалось отформатировать дату для input: ${isoString}`, e);
            return '';
        }
    }
    function formatDateToDisplay(isoString) {
        if (!isoString) return '...';
        try {
            return new Date(isoString).toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            console.warn(`[DATE] Не удалось отформатировать дату для display: ${isoString}`, e);
            return '...';
        }
    }
    // --- КОНЕЦ ФУНКЦИЙ ФОРМАТИРОВАНИЯ ДАТ ---

    
    // --- ЛОГИКА СМЕНЫ ТЕМ (теперь без API вызова) ---
    function setTheme(themeName) {
        console.log(`[THEME] Устанавливаем тему: ${themeName}`);
        document.body.dataset.theme = themeName;
        dom.themeSwitcher.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.themeSet === themeName);
        });

        // НЕ отправляем API запрос, просто обновляем локальные данные, если мы админ
        if (currentUserData.is_admin) {
            console.log('[THEME] Режим админа: тема обновлена локально.');
            currentEventData.current_theme = themeName;
        }
        
        const currentThemeAssets = THEME_ASSETS[themeName] || THEME_ASSETS.classic;
        
        const { levels = {} } = currentEventData;
        const currentLevel = getCurrentLevel(currentEventData);
        const levelConfig = levels[`level_${currentLevel}`] || {};
        const defaultReward = levelConfig.default_reward || {};
        
        // Проверяем, есть ли у награды своя картинка, если нет - ставим из темы
        dom.rewardImage.src = defaultReward.image_url || currentThemeAssets.default_reward_image;
        console.log(`[THEME] Изображение награды по умолчанию обновлено.`);
    }
    
    function getCurrentLevel(eventData) {
        const { goals = {}, current_progress = 0 } = eventData;
        if (goals.level_3 && current_progress >= goals.level_3) return 4;
        if (goals.level_2 && current_progress >= goals.level_2) return 3;
        if (goals.level_1 && current_progress >= goals.level_1) return 2;
        return 1;
    }
    
    function renderPage(eventData, leaderboardData = {}) {
        console.log('[RENDER] Начинаем отрисовку страницы (renderPage).');
        
        if (leaderboardData.top20 && Array.isArray(leaderboardData.top20)) {
            leaderboardData.top20.sort((a, b) => {
                const contributionDiff = (b.total_contribution || 0) - (a.total_contribution || 0);
                if (contributionDiff !== 0) return contributionDiff;
                const nameA = a.full_name || '';
                const nameB = b.full_name || '';
                return nameA.localeCompare(nameB);
            });
        }
        
        // Только обновляем currentEventData, если это не просто перерисовка (т.е. eventData передан)
        if (eventData) {
            currentEventData = eventData;
        }
        
        const isAdmin = currentUserData.is_admin;
        const canViewEvent = currentEventData && (currentEventData.is_visible_to_users || isAdmin);
        console.log(`[RENDER] isAdmin: ${isAdmin}, is_visible_to_users: ${currentEventData?.is_visible_to_users}, canViewEvent: ${canViewEvent}`);

        if (!canViewEvent) {
            console.warn('[RENDER] Ивент неактивен для пользователя. Показываем сообщение.');
            document.body.innerHTML = '<h2 style="text-align:center; padding-top: 50px;">Ивент пока неактивен.</h2>';
            return;
        }

        dom.adminNotice.classList.toggle('hidden', !(isAdmin && !currentEventData.is_visible_to_users));
        if (isAdmin) {
            dom.adminControls.classList.remove('hidden');
        }

        // --- ЛОГИКА ДЛЯ МИНИМАЛИСТИЧНОГО ОТОБРАЖЕНИЯ ДАТ ---
        if (currentEventData.start_date && currentEventData.end_date) {
            dom.eventDatesDisplay.innerHTML = `
                <i class="fa-solid fa-calendar-days"></i>
                <span>${formatDateToDisplay(currentEventData.start_date)} - ${formatDateToDisplay(currentEventData.end_date)}</span>
            `;
        } else {
            dom.eventDatesDisplay.innerHTML = `<span>Сроки ивента не назначены</span>`;
        }
        // --- КОНЕЦ ЛОГИКИ ДАТ ---

        const { goals = {}, levels = {}, current_progress = 0 } = currentEventData || {};
        const top20 = leaderboardData.top20 || [];
        const currentLevel = getCurrentLevel(currentEventData);
        console.log(`[RENDER] Текущий прогресс: ${current_progress}, текущий уровень: ${currentLevel}`);

        const cauldronImageUrl = currentEventData[`cauldron_image_url_${currentLevel}`] 
                               || currentEventData.cauldron_image_url
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

        dom.eventTitle.textContent = currentEventData.title || "Ивент-Котел";
        const progressInLevel = current_progress - prevGoal;
        const goalForLevel = currentGoal - prevGoal;
        const progressPercentage = (goalForLevel > 0) ? Math.min((progressInLevel / goalForLevel) * 100, 100) : 0;
        dom.progressBarFill.style.width = `${progressPercentage}%`;
        dom.progressText.textContent = `${current_progress} / ${currentGoal}`;
        
        // if (dom.rewardSectionTitle) {
        //     dom.rewardSectionTitle.textContent = `Награды Уровня ${currentLevel}`;
        // }
        
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

    async function fetchDataAndRender(leaderboardOnly = false) {
        console.log(`1. [MAIN] Вызвана функция fetchDataAndRender. leaderboardOnly: ${leaderboardOnly}`);
        try {
            let leaderboardData;
            
            if (!leaderboardOnly) {
                console.log('1.1. [MAIN] Полная загрузка (Promise.all).');
                const [eventData, lbData, userData] = await Promise.all([
                    makeApiRequest('/api/v1/events/cauldron/status', {}, 'GET'),
                    makeApiRequest('/api/v1/events/cauldron/leaderboard', {}, 'GET'),
                    makeApiRequest("/api/v1/user/me", {}, 'POST')
                ]);
                console.log('2. [MAIN] Все данные из Promise.all успешно получены.');
                
                currentEventData = eventData; // Сохраняем как глобальные данные
                currentUserData = userData;
                leaderboardData = lbData;
                console.log('3. [MAIN] Данные пользователя сохранены.', currentUserData);

                if (currentUserData.is_admin) {
                    document.body.classList.add('is-admin');
                }
                
                // Тема ВСЕГДА берется с сервера (из currentEventData)
                const globalTheme = currentEventData.current_theme || 'halloween'; 
                setTheme(globalTheme);
                console.log(`[MAIN] Установлена глобальная тема с сервера: ${globalTheme}`);
                
                dom.userTicketBalance.textContent = currentUserData.tickets || 0;
            } else {
                 console.log('1.1. [MAIN] Загрузка только лидерборда.');
                 leaderboardData = await makeApiRequest('/api/v1/events/cauldron/leaderboard', {}, 'GET');
            }

            console.log('4. [MAIN] Вызываем renderPage.');
            // Передаем null для eventData, чтобы renderPage использовал уже сохраненный currentEventData
            renderPage(leaderboardOnly ? null : currentEventData, leaderboardData);
            console.log('5. [MAIN] renderPage успешно завершен.');

        } catch (e) {
            console.error('X. [MAIN CATCH] Перехвачена ошибка в fetchDataAndRender:', e);
            document.body.innerHTML = `<h2 style="text-align:center; padding-top: 50px;">Ошибка загрузки ивента: ${e.message}</h2>`;
        } finally {
            if (!leaderboardOnly) {
                console.log('6. [MAIN FINALLY] Блок finally. Скрываем загрузчик.');
                dom.loaderOverlay.classList.add('hidden');
                dom.appContainer.classList.remove('hidden');
            }
        }
    }

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
                // Загружаем только лидерборд, т.к. eventData (уровни) не изменились
                fetchDataAndRender(true); 
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

    // --- ЛОГИКА АДМИН-ПАНЕЛИ (СКОПИРОВАНА ИЗ EVENTS.HTML) ---

    dom.editBtn.onclick = () => {
        document.body.classList.add('edit-mode');
        dom.adminControls.classList.add('edit-mode-active');
        // renderPage(); // Перерисовка, чтобы показать [data-editable]
    };
    
    dom.saveBtn.onclick = async () => {
        dom.saveBtn.disabled = true;
        dom.saveBtn.textContent = 'Сохранение...';
        try {
            // Используем АНАЛОГИЧНЫЙ эндпоинт, как в events.html
            // events.html -> /api/v1/admin/events/update
            // halloween.html -> /api/v1/admin/cauldron/update (НАША ДОГАДКА)
            const response = await makeApiRequest(
                '/api/v1/admin/cauldron/update', 
                { content: currentEventData } // Отправляем ВЕСЬ объект, как в events.html
            );
            
            tg.showAlert('Изменения сохранены!');
            document.body.classList.remove('edit-mode');
            dom.adminControls.classList.remove('edit-mode-active');
            
            // Обновляем currentEventData данными с сервера
            // (на случай, если сервер что-то изменил/добавил)
            if(response.updated_content) {
                 currentEventData = response.updated_content;
            }
            renderPage(null, {}); // Перерисовка с новыми данными

        } catch (e) {
            handleApiError(e);
        } finally {
            dom.saveBtn.disabled = false;
            dom.saveBtn.textContent = 'Сохранить';
        }
    };

    // Глобальный обработчик кликов (для режима редактирования)
    document.body.addEventListener('click', async (e) => {
        if (!document.body.classList.contains('edit-mode')) return;

        // Клик по элементу [data-editable]
        const editableText = e.target.closest('[data-editable="dates"]');
        if (editableText) {
            console.log('[ADMIN] Открываем модальное окно дат');
            // Заполняем модальное окно текущими датами из currentEventData
            dom.adminStartDate.value = formatDateToInput(currentEventData.start_date);
            dom.adminEndDate.value = formatDateToInput(currentEventData.end_date);
            showModal(dom.adminDatesModal);
        }

        // Клик по смене темы (только в режиме edit-mode)
        const themeButton = e.target.closest('.theme-btn');
        if (themeButton && themeButton.dataset.themeSet) {
            console.log(`[ADMIN] Тема изменена локально на: ${themeButton.dataset.themeSet}`);
            // Просто обновляем тему локально. Сохранение будет по кнопке "Сохранить"
            setTheme(themeButton.dataset.themeSet);
        }
    });

    // Обработчик формы модального окна дат
    dom.adminDatesForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Преобразуем локальное время из инпута в ISO строку (UTC)
        // (Предполагаем, что админ вводит время по МСК (UTC+3))
        const startDateLocal = new Date(dom.adminStartDate.value);
        const endDateLocal = new Date(dom.adminEndDate.value);

        // Сохраняем как ISO
        currentEventData.start_date = startDateLocal.toISOString();
        currentEventData.end_date = endDateLocal.toISOString();
        
        console.log('[ADMIN] Даты сохранены локально:', currentEventData.start_date);
        
        hideModal(dom.adminDatesModal);
        renderPage(null, {}); // Перерисовка (null значит "использовать
    });

    // --- КОНЕЦ ЛОГИКИ АДМИН-ПАНЕЛИ ---


    // Обработчик модалки правил
    dom.rulesButton.addEventListener('click', () => {
        dom.rulesModal.classList.remove('hidden');
        dom.rulesButton.classList.remove('highlight');
        dom.tutorialOverlay.classList.add('hidden'); 
        localStorage.setItem('cauldronRulesViewed', 'true');
    });

    // Обработчики просмотра изображений
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

    // --- УНИВЕРСАЛЬНЫЕ ФУНКЦИИ МОДАЛОК ---
    function showModal(modalElement) {
        modalElement.classList.remove('hidden');
        if (dom.adminControls) dom.adminControls.style.display = 'none'; // Прячем кнопки админа
    }

    function hideModal(modalElement) {
        modalElement.classList.add('hidden');
        // Показываем кнопки админа обратно, если он админ
        if (currentUserData.is_admin) dom.adminControls.style.display = 'block'; 
    }

    // Закрытие всех модалок по клику на фон или крестик
    document.querySelectorAll('.modal-overlay').forEach(modalOverlay => {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay') || e.target.closest('.modal-close-btn')) {
                hideModal(modalOverlay);
            }
        });
    });
    
    // --- ИНИЦИАЛИЗАЦИЯ ---
    console.log('[INIT] Добавляем обработчики событий.');
    tg.ready();
    console.log('[INIT] Telegram.WebApp.ready() вызван.');
    tg.expand();
    console.log('[INIT] Telegram.WebApp.expand() вызван.');
    fetchDataAndRender(); // Первый полный запуск

    const rulesViewed = localStorage.getItem('cauldronRulesViewed');
    if (!rulesViewed) {
        dom.rulesButton.classList.add('highlight');
        dom.tutorialOverlay.classList.remove('hidden');
    }
});
