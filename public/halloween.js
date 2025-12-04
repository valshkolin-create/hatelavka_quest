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
        rewardImage: document.getElementById('reward-image'),
        rewardName: document.getElementById('reward-name'),
        leaderboardRewardsList: document.getElementById('leaderboard-rewards-list'),
        userTicketBalance: document.getElementById('user-ticket-balance'),
        userContributionTotal: document.getElementById('user-contribution-total'),
        userLeaderboardRank: document.getElementById('user-leaderboard-rank'),
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
        eventDatesDisplay: document.getElementById('event-dates-display'),
        adminControls: document.getElementById('admin-controls'),
        editBtn: document.getElementById('edit-btn'),
        saveBtn: document.getElementById('save-btn'),
        adminDatesModal: document.getElementById('admin-dates-modal'),
        adminDatesForm: document.getElementById('admin-dates-form'),
        adminStartDate: document.getElementById('admin-start-date'),
        adminEndDate: document.getElementById('admin-end-date'),
        toggleEditBtn: document.getElementById('toggle-edit-btn')
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

    async function handleApiError(error) {
        let errorMessage = 'Произошла неизвестная ошибка.';
        if (error.response && error.response.status) {
            const response = error.response;
             try {
                 const errorData = await response.json();
                 errorMessage = errorData.detail || `Ошибка ${response.status}`;
             } catch (e) {
                 errorMessage = `Ошибка ${response.status}: Не удалось прочитать ответ сервера.`;
             }
        } else if (error instanceof Error) {
            errorMessage = error.message;
        } else if (error.detail) { // Обработка нашей кастомной ошибки
             errorMessage = error.detail;
        }

        try { tg.showAlert(errorMessage); } catch(e) { alert(errorMessage); }
        console.error("ПОЛНЫЙ ОТВЕТ ОБ ОШИБКЕ:", error);
    }

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
                let errorData;
                try {
                    errorData = await response.json();
                } catch (jsonError) {
                    errorData = { detail: response.statusText || `Ошибка ${response.status}` };
                }
                console.error(`[API ERROR] Ошибка от сервера (${url}):`, errorData);
                throw { response, detail: errorData.detail };
            }

            const data = await response.json();
            console.log(`[API SUCCESS] Успешно получили и распарсили JSON от ${url}`, data);
            return data;
        } catch (e) {
            console.error(`[API FATAL] Критическая ошибка при запросе на ${url}:`, e);
            if (e.response) {
                throw e; // Пробрасываем кастомную ошибку
            }
            throw new Error(e.message || 'Сетевая ошибка'); // Создаем стандартную
        }
    }

    function escapeHTML(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, match => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'})[match]);
    }

    function formatDateToInput(isoString) {
        if (!isoString) return '';
        try {
            const date = new Date(isoString);
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            const hh = String(date.getHours()).padStart(2, '0');
            const min = String(date.getMinutes()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
        } catch (e) { console.warn(`[DATE] Input format error: ${isoString}`, e); return ''; }
    }
    function formatDateToDisplay(isoString) {
        if (!isoString) return '...';
        try {
            return new Date(isoString).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
        } catch (e) { console.warn(`[DATE] Display format error: ${isoString}`, e); return '...'; }
    }

    function setTheme(themeName) {
        console.log(`[THEME] Устанавливаем тему: ${themeName}`);
        document.body.dataset.theme = themeName;
        dom.themeSwitcher.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.themeSet === themeName);
        });
        if (currentUserData.is_admin) {
            console.log('[THEME] Режим админа: тема обновлена локально.');
            currentEventData.current_theme = themeName;
        }
        const currentThemeAssets = THEME_ASSETS[themeName] || THEME_ASSETS.classic;
        const { levels = {} } = currentEventData || {}; // Добавил || {}
        const currentLevel = getCurrentLevel(currentEventData);
        const levelConfig = levels[`level_${currentLevel}`] || {};
        const defaultReward = levelConfig.default_reward || {};
        dom.rewardImage.src = defaultReward.image_url || currentThemeAssets.default_reward_image;
        console.log(`[THEME] Изображение награды по умолчанию обновлено.`);
    }

    function getCurrentLevel(eventData) {
        const { goals = {}, current_progress = 0 } = eventData || {};
        if (goals.level_3 && current_progress >= goals.level_3) return 4;
        if (goals.level_2 && current_progress >= goals.level_2) return 3;
        if (goals.level_1 && current_progress >= goals.level_1) return 2;
        return 1;
    }

function renderPage(eventData, leaderboardData = {}) {
        console.log('[RENDER] Начинаем отрисовку страницы (renderPage).');

        // ... (Код сортировки и проверок в начале функции renderPage оставляем без изменений) ...
        const allParticipants = leaderboardData.all || [];
        if (allParticipants.length > 0) {
            allParticipants.sort((a, b) => {
                const contributionDiff = (b.total_contribution || 0) - (a.total_contribution || 0);
                if (contributionDiff !== 0) return contributionDiff;
                const nameA = a.full_name || '';
                const nameB = b.full_name || '';
                return nameA.localeCompare(nameB);
            });
        }

        if (eventData) { currentEventData = eventData; }
        
        const isAdmin = currentUserData.is_admin;
        const canViewEvent = currentEventData && (currentEventData.is_visible_to_users || isAdmin);
        if (!canViewEvent) { document.body.innerHTML = '<h2 style="text-align:center; padding-top: 50px;">Ивент пока неактивен.</h2>'; return; }
        dom.adminNotice.classList.toggle('hidden', !(isAdmin && !currentEventData.is_visible_to_users));
        if (isAdmin && dom.adminControls) { dom.adminControls.classList.remove('hidden'); }
        if (currentEventData.start_date && currentEventData.end_date) {
            dom.eventDatesDisplay.innerHTML = `<i class="fa-solid fa-calendar-days"></i><span>${formatDateToDisplay(currentEventData.start_date)} - ${formatDateToDisplay(currentEventData.end_date)}</span>`;
        } else { dom.eventDatesDisplay.innerHTML = `<span>Сроки ивента не назначены</span>`; }

        const { goals = {}, levels = {}, current_progress = 0 } = currentEventData || {};
        const top20 = leaderboardData.top20 || [];
        const currentLevel = getCurrentLevel(currentEventData);

        const cauldronImageUrl = currentEventData[`cauldron_image_url_${currentLevel}`] || currentEventData.cauldron_image_url || FALLBACK_CAULDRON_URL;
        dom.cauldronImage.src = cauldronImageUrl;
        let currentGoal = 1, prevGoal = 0;
        if (currentLevel === 1) { currentGoal = goals.level_1 || 1; prevGoal = 0; }
        else if (currentLevel === 2) { currentGoal = goals.level_2 || goals.level_1; prevGoal = goals.level_1; }
        else if (currentLevel === 3) { currentGoal = goals.level_3 || goals.level_2; prevGoal = goals.level_2; }
        else if (currentLevel === 4) { currentGoal = goals.level_4 || goals.level_3; prevGoal = goals.level_3; }
        dom.eventTitle.textContent = currentEventData.title || "Ивент-Котел";
        const progressInLevel = current_progress - prevGoal;
        const goalForLevel = currentGoal - prevGoal;
        const progressPercentage = (goalForLevel > 0) ? Math.min((progressInLevel / goalForLevel) * 100, 100) : 0;
        dom.progressBarFill.style.width = `${progressPercentage}%`;
        dom.progressText.textContent = `${current_progress} / ${currentGoal}`;

        const levelConfig = levels[`level_${currentLevel}`] || {};
        const topPlaceRewards = levelConfig.top_places || [];
        const tiers = levelConfig.tiers || { "41+": levelConfig.default_reward || {} };

        // 1. Отрисовка Топ-20 (Без изменений)
        dom.leaderboardRewardsList.innerHTML = top20.length === 0
            ? '<p style="text-align:center; padding: 20px; color: var(--text-color-muted);">Участников пока нет.</p>'
            : top20.map((p, index) => {
                const rank = index + 1;
                const contributionAmount = p.total_contribution || 0;
                let assignedReward = null;
                if (rank <= 20) assignedReward = topPlaceRewards.find(r => r.place === rank);
                else if (rank <= 30) assignedReward = tiers["21-30"];
                else if (rank <= 40) assignedReward = tiers["31-40"];
                else assignedReward = tiers["41+"];

                const prizeName = escapeHTML(assignedReward?.name || '');
                const prizeImageHtml = assignedReward?.image_url
                    ? `<div class="image-zoom-container" data-item-name="${prizeName}">
                           <img src="${escapeHTML(assignedReward.image_url)}" alt="Приз" class="prize-image">
                           <div class="zoom-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
                       </div>`
                    : `<span>-</span>`;
                const rowClass = rank <= 3 ? 'leaderboard-row is-top-3' : 'leaderboard-row';
                let playerName = p.full_name || 'Без имени';
                if (playerName.length > 16) playerName = playerName.substring(0, 16) + '...';
                return `
                <div class="${rowClass}">
                    <span class="rank">#${rank}</span>
                    <span class="player">${escapeHTML(playerName)}</span>
                    <div class="prize-image-container">${prizeImageHtml}</div>
                    <span class="contribution align-right">${contributionAmount} 🎟️</span>
                </div>`;
            }).join('');

        // 2. Определение данных текущего пользователя (только для статистики вклада)
        let userRank = 'N/A';
        let userContribution = 0;
        const currentUserIndex = allParticipants.findIndex(p =>
             (currentUserData.id && p.user_id === currentUserData.id) ||
             (!currentUserData.id && p.full_name === currentUserData.full_name)
        );
        if (currentUserIndex !== -1) {
            userRank = `#${currentUserIndex + 1}`;
            userContribution = allParticipants[currentUserIndex].total_contribution || 0;
        }
        dom.userContributionTotal.textContent = userContribution;
        dom.userLeaderboardRank.textContent = userRank;

        // === НОВАЯ ЛОГИКА: Рендеринг списка тиров (Витрина наград) ===
        const tierListContainer = document.getElementById('tier-rewards-list');
        if (tierListContainer) {
            const activeTheme = document.body.dataset.theme || 'halloween';
            const defaultImg = THEME_ASSETS[activeTheme]?.default_reward_image;

            // Определяем массив для отображения
            const tierDisplayData = [
                { id: '21-30', label: 'Места 21-30', style: 'tier-gold' },
                { id: '31-40', label: 'Места 31-40', style: 'tier-silver' },
                { id: '41+',   label: 'Места 41+',   style: 'tier-bronze' }
            ];

            tierListContainer.innerHTML = tierDisplayData.map(tier => {
                const data = tiers[tier.id] || {};
                const name = data.name || 'Награда не настроена';
                const img = data.image_url || defaultImg;

                // Если картинки нет вообще, ставим заглушку
                const imgHtml = img 
                    ? `<div class="image-zoom-container" data-item-name="${escapeHTML(name)}">
                           <img src="${escapeHTML(img)}" class="tier-image">
                           <div class="zoom-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
                       </div>`
                    : '';

                return `
                <div class="tier-card ${tier.style}">
                    <div class="tier-range-badge">${tier.label}</div>
                    <div class="tier-info">
                        ${imgHtml}
                        <span class="tier-name">${escapeHTML(name)}</span>
                    </div>
                </div>
                `;
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

                currentEventData = eventData;
                currentUserData = userData;
                leaderboardData = lbData;
                console.log('3. [MAIN] Данные пользователя сохранены.', currentUserData);

                if (currentUserData.is_admin) {
                    document.body.classList.add('is-admin');
                }

                const globalTheme = currentEventData.current_theme || 'halloween';
                setTheme(globalTheme);
                console.log(`[MAIN] Установлена глобальная тема с сервера: ${globalTheme}`);

                dom.userTicketBalance.textContent = currentUserData.tickets || 0;
            } else {
                 console.log('1.1. [MAIN] Загрузка только лидерборда.');
                 leaderboardData = await makeApiRequest('/api/v1/events/cauldron/leaderboard', {}, 'GET');
            }

            console.log('4. [MAIN] Вызываем renderPage.');
            renderPage(leaderboardOnly ? null : currentEventData, leaderboardData);
            console.log('5. [MAIN] renderPage успешно завершен.');

        } catch (e) {
            console.error('X. [MAIN CATCH] Перехвачена ошибка в fetchDataAndRender:', e);
            handleApiError(e); // Используем handleApiError
        } finally {
            if (!leaderboardOnly) {
                console.log('6. [MAIN FINALLY] Блок finally. Скрываем загрузчик.');
                dom.loaderOverlay.classList.add('hidden');
                dom.appContainer.classList.remove('hidden');
            }
        }
    }

    // --- ОБРАБОТЧИКИ СОБЫТИЙ ---

    dom.contributionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = dom.contributionForm.querySelector('button[type="submit"]');
        dom.errorMessage.classList.add('hidden');
        const amount = parseInt(dom.ticketsInput.value, 10);

        if (!amount || amount <= 0 || amount > (currentUserData.tickets || 0)) {
             dom.errorMessage.textContent = amount > (currentUserData.tickets || 0) ? 'У вас недостаточно билетов.' : 'Введите корректное количество билетов.';
             dom.errorMessage.classList.remove('hidden');
             return;
        }
        submitButton.disabled = true;
        try {
            const result = await makeApiRequest('/api/v1/events/cauldron/contribute', { amount });
            tg.showAlert("Ваш вклад принят!");
            currentUserData.tickets = result.new_ticket_balance;
            dom.userTicketBalance.textContent = result.new_ticket_balance;

            // --- ИСПРАВЛЕНИЕ: ДОБАВЛЕН ЭТОТ БЛОК ---
            // Обновляем глобальный прогресс котла данными из ответа API
            if (result.new_progress !== undefined) {
                currentEventData.current_progress = result.new_progress;
            }
            // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

            dom.ticketsInput.value = '';

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
                fetchDataAndRender(true); // Эта функция теперь использует обновленный currentEventData.current_progress
            }, 1200);
        } catch(error) {
             if (error.detail && error.detail.includes("трейд-ссылку")) {
                 tg.showConfirm(
                     "Пожалуйста, укажите вашу трейд-ссылку в профиле для участия. Перейти в профиль сейчас?",
                     (ok) => { if (ok) window.location.href = '/profile'; }
                 );
             } else {
                 dom.errorMessage.textContent = error.detail || error.message;
                 dom.errorMessage.classList.remove('hidden');
             }
        } finally {
            setTimeout(() => { submitButton.disabled = false; }, 1500);
        }
    });

    // --- ЛОГИКА АДМИН-ПАНЕЛИ ---

    // Клик по кнопке-тогглу
    dom.toggleEditBtn.addEventListener('click', () => {
        const isAdminPanelExpanded = dom.adminControls.classList.toggle('expanded');
        // Если панель свернута и мы были в режиме редактирования, выходим из него
        if (!isAdminPanelExpanded && document.body.classList.contains('edit-mode')) {
             document.body.classList.remove('edit-mode');
             dom.adminControls.classList.remove('edit-mode-active');
        }
    });

    // Клик по кнопке "Редактировать"
    dom.editBtn.onclick = () => {
        document.body.classList.add('edit-mode');
        dom.adminControls.classList.add('edit-mode-active');
    };

    // Клик по кнопке "Сохранить"
    dom.saveBtn.onclick = async () => {
        dom.saveBtn.disabled = true;
        dom.saveBtn.textContent = 'Сохранение...';
        try {
            const response = await makeApiRequest(
                '/api/v1/admin/cauldron/update', // Убедись, что этот URL правильный на бэкенде!
                { content: currentEventData }
            );

            tg.showAlert('Изменения сохранены!');

            document.body.classList.remove('edit-mode');
            dom.adminControls.classList.remove('edit-mode-active');
            dom.adminControls.classList.remove('expanded'); // Сворачиваем панель

            if(response.updated_content) {
                 currentEventData = response.updated_content;
            }
            renderPage(null, {}); // Перерисовка

        } catch (e) {
            handleApiError(e);
        } finally {
            dom.saveBtn.disabled = false;
            dom.saveBtn.textContent = 'Сохранить';
        }
    };

    // Глобальный обработчик кликов
    document.body.addEventListener('click', async (e) => {
         // --- Логика для НЕ-админов (просмотр картинок) ---
        if (!document.body.classList.contains('edit-mode')) {
             const zoomContainer = e.target.closest('.image-zoom-container');
             if (zoomContainer) {
                 const imageToZoom = zoomContainer.querySelector('img');
                 const itemName = zoomContainer.dataset.itemName;
                 if (imageToZoom && imageToZoom.src) {
                     dom.viewerImage.src = imageToZoom.src;
                     dom.viewerCaption.textContent = itemName || '';
                     showModal(dom.imageViewerModal);
                 }
                 return; // Выходим
             }
        }

        // --- Логика ТОЛЬКО для админов в режиме редактирования ---
        if (document.body.classList.contains('edit-mode')) {
            // Клик по [data-editable="dates"]
            const editableText = e.target.closest('[data-editable="dates"]');
            if (editableText) {
                console.log('[ADMIN] Открываем модальное окно дат');
                dom.adminStartDate.value = formatDateToInput(currentEventData.start_date);
                dom.adminEndDate.value = formatDateToInput(currentEventData.end_date);
                showModal(dom.adminDatesModal);
            }

            // Клик по смене темы
            const themeButton = e.target.closest('.theme-btn');
            if (themeButton && themeButton.dataset.themeSet) {
                console.log(`[ADMIN] Тема изменена локально на: ${themeButton.dataset.themeSet}`);
                setTheme(themeButton.dataset.themeSet);
            }
        }
    });

    // Обработчик формы модального окна дат
    dom.adminDatesForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const startDateLocal = new Date(dom.adminStartDate.value);
        const endDateLocal = new Date(dom.adminEndDate.value);
        // Преобразуем в ISO строку (UTC) для сохранения
        currentEventData.start_date = startDateLocal.toISOString();
        currentEventData.end_date = endDateLocal.toISOString();

        console.log('[ADMIN] Даты сохранены локально:', currentEventData.start_date, currentEventData.end_date);

        hideModal(dom.adminDatesModal);
        renderPage(null, {}); // Перерисовываем страницу, используя currentEventData
    });
    // --- КОНЕЦ ЛОГИКИ АДМИН-ПАНЕЛИ ---


    // Обработчик модалки правил
    dom.rulesButton.addEventListener('click', () => {
        showModal(dom.rulesModal);
        dom.rulesButton.classList.remove('highlight');
        dom.tutorialOverlay.classList.add('hidden');
        localStorage.setItem('cauldronRulesViewed', 'true');
    });

    // Закрытие просмотрщика
    dom.viewerCloseBtn.addEventListener('click', () => hideModal(dom.imageViewerModal));

    // --- УНИВЕРСАЛЬНЫЕ ФУНКЦИИ МОДАЛОК ---
    function showModal(modalElement) {
        modalElement.classList.remove('hidden');
        if (dom.adminControls && !dom.adminControls.classList.contains('expanded')) {
             dom.adminControls.style.display = 'none';
        }
    }
    function hideModal(modalElement) {
        modalElement.classList.add('hidden');
        if (currentUserData.is_admin && dom.adminControls) {
            dom.adminControls.style.display = 'flex';
        }
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
    fetchDataAndRender();

    const rulesViewed = localStorage.getItem('cauldronRulesViewed');
    if (!rulesViewed) {
        dom.rulesButton.classList.add('highlight');
        dom.tutorialOverlay.classList.remove('hidden');
    }
});
