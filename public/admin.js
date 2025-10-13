try {
    const tg = window.Telegram.WebApp;
    
    const dom = {
        loaderOverlay: document.getElementById('loader-overlay'),
        appContainer: document.getElementById('app-container'),
        views: document.querySelectorAll('.view'),
        questsList: document.getElementById('quests-list'),
        createQuestForm: document.getElementById('create-quest-form'),
        editQuestForm: document.getElementById('edit-quest-form'),
        addPromocodesForm: document.getElementById('add-promocodes-form'),
        submissionsModal: document.getElementById('submissions-modal'),
        modalTitle: document.getElementById('modal-title'),
        modalBody: document.getElementById('modal-body'),
        modalCloseBtn: document.getElementById('modal-close-btn'),
        challengesList: document.getElementById('challenges-list'),
        challengeForm: document.getElementById('challenge-form'),
        challengeFormTitle: document.getElementById('challenge-form-title'),
        createCategoryForm: document.getElementById('create-category-form'),
        categoriesList: document.getElementById('categories-list'),
        genericPromptOverlay: document.getElementById('generic-prompt-overlay'),
        genericPromptTitle: document.getElementById('generic-prompt-title'),
        genericPromptInput: document.getElementById('generic-prompt-input'),
        genericPromptCancel: document.getElementById('generic-prompt-cancel'),
        genericPromptConfirm: document.getElementById('generic-prompt-confirm'),
        winnersModal: document.getElementById('winners-modal'),
        winnersModalBody: document.getElementById('winners-modal-body'),
        winnersModalCloseBtn: document.getElementById('winners-modal-close-btn'),
        sleepModeToggle: document.getElementById('sleep-mode-toggle'),
        sleepPromptOverlay: document.getElementById('sleep-prompt-overlay'),
        sleepMinutesInput: document.getElementById('sleep-minutes-input'),
        sleepPromptCancel: document.getElementById('sleep-prompt-cancel'),
        sleepPromptConfirm: document.getElementById('sleep-prompt-confirm'),
        tabContentSubmissions: document.getElementById('tab-content-submissions'),
        tabContentEventPrizes: document.getElementById('tab-content-event-prizes'),
        tabContentCheckpointPrizes: document.getElementById('tab-content-checkpoint-prizes'),
        grantCheckpointStarsForm: document.getElementById('grant-checkpoint-stars-form'),
        freezeCheckpointStarsForm: document.getElementById('freeze-checkpoint-stars-form'),
        grantTicketsForm: document.getElementById('grant-tickets-form'),
        freezeTicketsForm: document.getElementById('freeze-tickets-form'),
        resetCheckpointProgressForm: document.getElementById('reset-checkpoint-progress-form'),
        clearCheckpointStarsForm: document.getElementById('clear-checkpoint-stars-form'),
        settingMenuBannerUrl: document.getElementById('setting-menu-banner-url'),
        settingCheckpointBannerUrl: document.getElementById('setting-checkpoint-banner-url'),
        saveSettingsBtn: document.getElementById('save-settings-btn'),
        settingQuestsEnabled: document.getElementById('setting-quests-enabled'),
        settingChallengesEnabled: document.getElementById('setting-challenges-enabled'),
        settingQuestRewardsEnabled: document.getElementById('setting-quest-rewards-enabled'),
        settingChallengeRewardsEnabled: document.getElementById('setting-challenge-rewards-enabled'),
        resetAllQuestsBtn: document.getElementById('reset-all-quests-btn'),
        resetAllCheckpointProgressBtn: document.getElementById('reset-all-checkpoint-progress-btn'),
        clearAllCheckpointStarsBtn: document.getElementById('clear-all-checkpoint-stars-btn'),
        settingCheckpointEnabled: document.getElementById('setting-checkpoint-enabled'),
        statisticsContent: document.getElementById('statistics-content'),
        createRoulettePrizeForm: document.getElementById('create-roulette-prize-form'),
        roulettePrizesList: document.getElementById('roulette-prizes-list'),
        passwordPromptOverlay: document.getElementById('password-prompt-overlay'),
        passwordPromptInput: document.getElementById('password-prompt-input'),
        passwordPromptCancel: document.getElementById('password-prompt-cancel'),
        passwordPromptConfirm: document.getElementById('password-prompt-confirm'),
        cauldronSettingsForm: document.getElementById('cauldron-settings-form'),
        resetCauldronBtn: document.getElementById('reset-cauldron-btn'),
        distributeRewardsBtn: document.getElementById('distribute-rewards-btn'),
        addTopRewardBtn: document.getElementById('add-top-reward-btn'),
        topRewardsContainer: document.getElementById('top-rewards-container'),
        defaultRewardForm: document.getElementById('default-reward-form'),
    };

    let categoriesCache = [];
    let currentEditingCategoryId = null;
let hasAdminAccess = false;
    let currentCauldronData = {}; // Кэш для данных котла

    function escapeHTML(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, match => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'})[match]);
    }

    // --- НОВЫЕ ФУНКЦИИ ДЛЯ "КОТЛА" ---
    function createTopRewardRow(reward = { place: '', name: '', image_url: '' }) {
        const wrapper = document.createElement('div');
        wrapper.className = 'top-reward-row';
        wrapper.innerHTML = `
            <input type="number" class="reward-place" placeholder="Место" value="${escapeHTML(reward.place)}" min="1" max="20">
            <input type="text" class="reward-name" placeholder="Название предмета" value="${escapeHTML(reward.name)}">
            <input type="text" class="reward-image" placeholder="URL изображения" value="${escapeHTML(reward.image_url)}">
            <button type="button" class="remove-reward-btn"><i class="fa-solid fa-trash-can"></i></button>
        `;
        return wrapper;
    }

    function renderCauldronRewards(rewardsData = {}) {
        const container = dom.topRewardsContainer;
        if (!container) return;
        container.innerHTML = '';
        const topPlaces = rewardsData.top_places || [];
        topPlaces.sort((a, b) => a.place - b.place).forEach(reward => {
            container.appendChild(createTopRewardRow(reward));
        });

        const defaultReward = rewardsData.default_reward || {};
        if (dom.defaultRewardForm) {
            dom.defaultRewardForm.elements['default_reward_name'].value = defaultReward.name || '';
            dom.defaultRewardForm.elements['default_reward_image_url'].value = defaultReward.image_url || '';
        }
    }

    function collectCauldronData() {
        const content = {
            title: dom.cauldronSettingsForm.elements['title'].value,
            is_visible_to_users: dom.cauldronSettingsForm.elements['is_visible_to_users'].checked,
            goal: parseInt(dom.cauldronSettingsForm.elements['goal'].value, 10) || 0,
            banner_image_url: dom.cauldronSettingsForm.elements['banner_image_url'].value,
            cauldron_image_url: dom.cauldronSettingsForm.elements['cauldron_image_url'].value,
            rewards: {
                top_places: [],
                default_reward: {
                    name: dom.defaultRewardForm.elements['default_reward_name'].value,
                    image_url: dom.defaultRewardForm.elements['default_reward_image_url'].value
                }
            }
        };

        document.querySelectorAll('.top-reward-row').forEach(row => {
            const place = parseInt(row.querySelector('.reward-place').value, 10);
            const name = row.querySelector('.reward-name').value.trim();
            const image_url = row.querySelector('.reward-image').value.trim();
            if (place >= 1 && place <= 20 && name) {
                content.rewards.top_places.push({ place, name, image_url });
            }
        });
        
        return content;
    }

    async function loadCauldronParticipants() {
        const container = document.getElementById('cauldron-distribution-list');
        if (!container) return;
        container.innerHTML = '<p style="text-align: center;">Загрузка участников...</p>';
        try {
            const participants = await makeApiRequest('/api/v1/admin/events/cauldron/participants', {}, 'POST', true);
            if (!participants || participants.length === 0) {
                container.innerHTML = '<p style="text-align: center;">Участников пока нет.</p>';
                return;
            }
            container.innerHTML = `
                <div class="distribution-header"><span>#</span><span>Участник</span><span>Вклад</span><span>Трейд-ссылка</span></div>
                ${participants.map((p, index) => `
                    <div class="distribution-row">
                        <span>${index + 1}</span>
                        <span class="dist-name">${escapeHTML(p.full_name || 'Без имени')}</span>
                        <span class="dist-amount">${p.total_contribution}</span>
                        <span class="dist-link">${p.trade_link ? `<a href="${escapeHTML(p.trade_link)}" target="_blank">Открыть</a>` : '<span class="no-link">Нет</span>'}</span>
                    </div>`).join('')}`;
        } catch (e) {
            container.innerHTML = `<p class="error-message">Не удалось загрузить: ${e.message}</p>`;
        }
    }
    // --- Конец блока для "Котла" ---

    async function loadStatistics() {
        showLoader();
        try {
            const stats = await makeApiRequest("/api/v1/admin/stats", {}, 'POST', true);
            
            const pulse = stats.pulse || {};
            const dau = pulse.dau || 0;
            const wau = pulse.wau || 0;
            const mau = pulse.mau || 0;
            const newToday = pulse.new_users_today || 0;
            const newWeek = pulse.new_users_week || 0;

            document.getElementById('stat-dau').textContent = dau;
            document.getElementById('stat-wau').textContent = wau;
            document.getElementById('stat-mau').textContent = mau;
            document.getElementById('stat-new-today').textContent = newToday;
            document.getElementById('stat-new-week').textContent = newWeek;

            const stickiness = mau > 0 ? ((dau / mau) * 100).toFixed(1) : 0;
            document.getElementById('stat-stickiness').textContent = `${stickiness}%`;

            const eventsList = document.getElementById('events-stats-list');
            eventsList.innerHTML = '';
            if (stats.events && stats.events.length > 0) {
                stats.events.forEach(event => {
                    eventsList.insertAdjacentHTML('beforeend', `
                        <div class="event-stat-item">
                            <strong>${event.title}</strong>
                            <span>${event.participants} уч.</span>
                        </div>`);
                });
            } else {
                eventsList.innerHTML = '<p style="color: var(--text-color-muted); text-align: center;">Нет активных розыгрышей.</p>';
            }

        } catch (e) {
            dom.statisticsContent.innerHTML = `<p class="error-message" style="text-align: center;">Не удалось загрузить статистику: ${e.message}</p>`;
        } finally {
            hideLoader();
        }
    }

    const switchView = async (targetViewId) => {
        dom.views.forEach(view => view.classList.add('hidden'));
        const targetView = document.getElementById(targetViewId);
        if (targetView) targetView.classList.remove('hidden');

        if (dom.sleepModeToggle) {
            const isAdmin = document.body.dataset.isAdmin === 'true';
            dom.sleepModeToggle.classList.toggle('hidden', targetViewId !== 'view-admin-main' || !isAdmin);
        }
        
        showLoader();
        try {
            switch (targetViewId) {
                case 'view-admin-quests': {
                    const allQuests = await makeApiRequest('/api/v1/admin/quests/all', {}, 'POST', true);
                    await fetchAndCacheCategories(true);
                    renderQuests(allQuests, categoriesCache);
                    break;
                }
                case 'view-admin-pending-actions': {
                    const [submissions, winners, checkpointPrizes] = await Promise.all([
                        makeApiRequest('/api/v1/admin/pending_actions', {}, 'POST', true),
                        makeApiRequest('/api/v1/admin/events/winners', {}, 'POST', true),
                        makeApiRequest('/api/v1/admin/checkpoint_rewards', {}, 'POST', true)
                    ]);
                    renderSubmissions(submissions);
                    renderWinners(winners);
                    renderCheckpointPrizes(checkpointPrizes);
                    break;
                }
                case 'view-admin-challenges': {
                    renderChallenges(await makeApiRequest('/api/v1/admin/challenges', {}, 'POST', true));
                    break;
                }
                case 'view-admin-categories': {
                    await fetchAndCacheCategories(true);
                    renderCategoriesList();
                    break;
                }
                case 'view-admin-settings': {
                    await loadAndRenderSettings();
                    break;
                }
                case 'view-admin-statistics': {
                    await loadStatistics();
                    break;
                }
                case 'view-admin-twitch-rewards': {
                    await loadTwitchRewards();
                    break;
                }
                case 'view-admin-roulette': {
                    const prizes = await makeApiRequest('/api/v1/admin/roulette/prizes', {}, 'POST', true);
                    renderRoulettePrizes(prizes);
                    break;
                }
                case 'view-admin-create': {
                    await fetchAndCacheCategories(true);
                    populateCategorySelects();
                    dom.createQuestForm.reset();
                    updateQuestFormUI(dom.createQuestForm);
                    break;
                }
                case 'view-admin-cauldron': {
                    currentCauldronData = await makeApiRequest('/api/v1/events/cauldron/status', {}, 'GET', true).catch(() => ({}));
                    const form = dom.cauldronSettingsForm;
                    form.elements['is_visible_to_users'].checked = currentCauldronData.is_visible_to_users || false;
                    form.elements['title'].value = currentCauldronData.title || '';
                    form.elements['goal'].value = currentCauldronData.goal || '';
                    form.elements['banner_image_url'].value = currentCauldronData.banner_image_url || '';
                    form.elements['cauldron_image_url'].value = currentCauldronData.cauldron_image_url || '';
                    renderCauldronRewards(currentCauldronData.rewards);
                    break;
                }
            }
        } finally {
            hideLoader();
        }
    };

    const showLoader = () => dom.loaderOverlay.classList.remove('hidden');
    const hideLoader = () => dom.loaderOverlay.classList.add('hidden');

    async function makeApiRequest(url, body = {}, method = 'POST', isSilent = false) {
        if (!isSilent) showLoader();
        
        // --- ЛОГИРОВАНИЕ ---
        console.log(`[API Request] -> ${method} ${url}`, body);
        // --------------------

        try {
            const options = {
                method: method,
                headers: { 'Content-Type': 'application/json' },
            };

            if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
                options.body = JSON.stringify({ ...body, initData: tg.initData });
            }

            const response = await fetch(url, options);
            if (response.status === 204) return null;
            
            const result = await response.json();

            // --- ЛОГИРОВАНИЕ ---
            console.log(`[API Response] <- ${url}`, { status: response.status, ok: response.ok, body: result });
            // --------------------

            if (!response.ok) {
                throw new Error(result.detail || 'Ошибка сервера');
            }
            return result;
        } catch (e) {
            // --- ЛОГИРОВАНИЕ ---
            console.error(`[API Error] Ошибка в запросе ${method} ${url}:`, e);
            // --------------------
            if (!isSilent) tg.showAlert(`Ошибка: ${e.message}`);
            throw e;
        } finally {
            if (!isSilent) hideLoader();
        }
    }
    
    async function fetchAndCacheCategories(isSilent = false) {
        try {
            categoriesCache = await makeApiRequest('/api/v1/admin/categories', {}, 'POST', isSilent) || [];
        } catch (e) {
            console.error("Не удалось загрузить категории", e);
            categoriesCache = [];
        }
    }
    
    function populateCategorySelects(selectedId = null) {
        const selects = document.querySelectorAll('select[name="category_id"]');
        selects.forEach(select => {
            select.innerHTML = '<option value="">Без категории</option>';
            categoriesCache.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.name;
                if (selectedId && parseInt(selectedId) === cat.id) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
        });
    }
    
    function renderCategoriesList() {
        dom.categoriesList.innerHTML = '';
        if (categoriesCache.length === 0) {
             dom.categoriesList.innerHTML = '<p style="text-align: center;">Категорий пока нет.</p>';
             return;
        }
        categoriesCache.forEach((cat, index) => {
             dom.categoriesList.insertAdjacentHTML('beforeend', `
                 <div class="quest-card category-card" data-category-id="${cat.id}">
                     <span class="category-name">${cat.name}</span>
                     <div class="category-actions">
                         <button class="admin-edit-quest-btn sort-btn" data-index="${index}" data-direction="up" ${index === 0 ? 'disabled' : ''}>▲</button>
                         <button class="admin-edit-quest-btn sort-btn" data-index="${index}" data-direction="down" ${index === categoriesCache.length - 1 ? 'disabled' : ''}>▼</button>
                         <button class="admin-edit-quest-btn edit-category-btn" data-id="${cat.id}" data-name="${cat.name}">Редакт.</button>
                         <button class="admin-delete-quest-btn delete-category-btn" data-id="${cat.id}">Удалить</button>
                     </div>
                 </div>
             `);
        });
    }
    
    function renderChallenges(challenges) {
        dom.challengesList.innerHTML = '';
        if (!challenges || challenges.length === 0) {
            dom.challengesList.innerHTML = `<p style="text-align: center;">Созданных челленджей нет.</p>`;
            return;
        }
        const conditionTypes = {
            'telegram_messages': 'Сообщения TG', 'twitch_points': 'Ранг/PTS Twitch',
            'twitch_messages_session': 'Сообщения Twitch (сессия)', 'twitch_messages_week': 'Сообщения Twitch (неделя)', 'twitch_messages_month': 'Сообщения Twitch (месяц)',
            'twitch_uptime_session': 'Время Twitch (сессия)', 'twitch_uptime_week': 'Время Twitch (неделя)', 'twitch_uptime_month': 'Время Twitch (месяц)'
        };
        challenges.forEach(c => {
            const statusClass = c.is_active ? 'status-active' : 'status-inactive';
            const cardHtml = `
            <div class="quest-card manage-quest-card">
                <div class="quest-admin-meta"><span class="quest-status-badge ${statusClass}">${c.is_active ? 'Активен' : 'Неактивен'}</span></div>
                <div class="manage-quest-info">
                    <span>${c.description}</span><br>
                    <small style="color: var(--text-color-muted);">Тип: ${conditionTypes[c.condition_type] || c.condition_type} | Цель: ${c.target_value} | Срок: ${c.duration_days} ч. | Награда: ${c.reward_amount} ⭐</small>
                </div>
                <div class="admin-buttons-wrapper">
                    <button class="admin-edit-challenge-btn" data-challenge='${JSON.stringify(c)}'>Редактировать</button>
                    <button class="admin-delete-challenge-btn" data-id="${c.id}">Удалить</button>
                </div>
            </div>`;
            dom.challengesList.insertAdjacentHTML('beforeend', cardHtml);
        });
    }
    
    function updateChallengeFormUI(form) {
        const conditionType = form.querySelector('select[name="condition_type"]').value;
        const periodWrapper = form.querySelector('.challenge-period-wrapper');
        if (periodWrapper) {
            const showPeriod = conditionType === 'twitch_messages' || conditionType === 'twitch_uptime';
            periodWrapper.classList.toggle('hidden', !showPeriod);
        }
    }
    
    function updateQuestFormUI(form) {
        const questType = form.querySelector('select[name="quest_type"]').value;
        const isManual = questType === 'manual_check';
        form.querySelector('.manual-options-wrapper').classList.toggle('hidden', !isManual);
        form.querySelector('.automatic-options-wrapper').classList.toggle('hidden', isManual);
        if (!isManual) {
            const twitchPeriodWrapper = form.querySelector('.twitch-period-wrapper');
            const showPeriodSelector = questType === 'automatic_twitch_messages' || questType === 'automatic_twitch_uptime';
            twitchPeriodWrapper.classList.toggle('hidden', !showPeriodSelector);
        }
    }
    
    function showGenericPrompt(title, value, id) {
        currentEditingCategoryId = id;
        dom.genericPromptTitle.textContent = title;
        dom.genericPromptInput.value = value;
        dom.genericPromptOverlay.classList.remove('hidden');
        dom.genericPromptInput.focus();
    }
    
    function hideGenericPrompt() {
        dom.genericPromptOverlay.classList.add('hidden');
        currentEditingCategoryId = null;
    }

    function renderSubmissions(submissions) {
        dom.tabContentSubmissions.innerHTML = '';
        if (!submissions || submissions.length === 0) {
            dom.tabContentSubmissions.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Нет заданий на проверку.</p>';
            return;
        }

        submissions.forEach(action => {
            let submissionContent = '';
            const data = action.submitted_data || '';
            const isUrl = data.startsWith('http://') || data.startsWith('https');

            if (action.type === 'twitch_message') {
                const cardHtml = `
                <div class="pending-action-card admin-submission-card" data-action-id="${action.id}" data-action-type="twitch_message">
                    <div class="pending-action-header">
                        <div class="pending-action-type-badge type-twitch">Twitch</div>
                        <div class="submission-user">
                            <i class="fa-brands fa-twitch"></i>
                            <strong>${action.user_full_name}</strong>
                        </div>
                    </div>
                    <p>${action.submitted_data}</p>
                    <div class="submission-actions">
                        <button class="admin-action-btn approve" data-id="${action.id}" data-action="approved">Одобрить</button>
                    </div>
                </div>
                `;
                dom.tabContentSubmissions.innerHTML += cardHtml;
            } else {
                if (isUrl) {
                    submissionContent = `<a href="${data}" target="_blank" rel="noopener noreferrer" style="color: var(--action-color); text-decoration: underline; word-break: break-all;">${data}</a>`;
                } else {
                    submissionContent = `<span>${data}</span>`;
                }
                const actionLinkHtml = (action.quest_action_url && action.quest_action_url !== "")
                    ? `<a href="${action.quest_action_url}" target="_blank" rel="noopener noreferrer" class="action-link-btn">Перейти</a>`
                    : '';
                    
                const isWizebotQuest = (action.title || "").toLowerCase().includes("сообщен");

                const cardHtml = `
                <div class="quest-card admin-submission-card" id="submission-card-${action.id}">
                    <h3 class="quest-title">${action.title || 'Ручное задание'}</h3>
                    <p style="font-size: 14px; color: var(--text-color-muted); line-height: 1.4; margin: 4px 0 12px;">${action.quest_description || 'Описание отсутствует.'}</p>
                    <p style="font-size: 13px; font-weight: 500; margin-bottom: 12px;">Награда: ${action.reward_amount || '?'} ⭐</p>
                    <p>Пользователь: <strong>${action.user_full_name || 'Неизвестный'}</strong></p>
                    <p style="margin-top: 10px; margin-bottom: 5px; font-weight: 600; font-size: 13px;">Данные для проверки:</p>
                    <div class="submission-wrapper">
                        <div class="submission-data">${submissionContent}</div>
                        ${actionLinkHtml}
                    </div>

                    ${isWizebotQuest ? `
                    <div class="submission-actions" style="margin-top: 10px;">
                        <button class="admin-action-btn check-wizebot-btn" data-nickname="${data}" style="background-color: #6441a5;">
                            <i class="fa-brands fa-twitch"></i> Проверить на Wizebot
                        </button>
                    </div>
                    <div class="wizebot-stats-result" style="margin-top: 10px; font-weight: 500;"></div>
                    ` : ''}

                    <div class="submission-actions">
                        <button class="admin-action-btn approve" data-id="${action.id}" data-action="approved">Одобрить</button>
                        <button class="admin-action-btn reject" data-id="${action.id}" data-action="rejected">Отклонить</button>
                    </div>
                </div>`;
                dom.tabContentSubmissions.innerHTML += cardHtml;
            }
        });
    }

    function renderCheckpointPrizes(prizes) {
        dom.tabContentCheckpointPrizes.innerHTML = '';
        if (!prizes || prizes.length === 0) {
            dom.tabContentCheckpointPrizes.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Нет наград из Чекпоинта.</p>';
            return;
        }

        prizes.forEach(action => {
            const cardHtml = `
            <div class="quest-card admin-submission-card" id="prize-card-${action.id}">
                <h3 class="quest-title">${action.source_description || 'Выдача награды'}</h3>
                <p><b>Приз:</b> ${action.reward_details || 'Не указан'}</p>
                <p>Пользователь: <strong>${action.user_full_name || 'Неизвестный'}</strong></p>
                ${action.user_trade_link ? `<p>Ссылка: <a href="${action.user_trade_link}" target="_blank" style="color: var(--action-color);">Проверить трейд-ссылку</a></p>` : '<p style="color:var(--warning-color);">Трейд-ссылка не указана!</p>'}
                <div class="submission-actions">
                    <button class="admin-action-btn confirm" data-id="${action.id}" data-action="confirm_prize">✅ Подтвердить выдачу</button>
                </div>
            </div>`;
            dom.tabContentCheckpointPrizes.innerHTML += cardHtml;
        });
    }
    
    function renderWinners(winners) {
        dom.tabContentEventPrizes.innerHTML = '';
        if (!winners || winners.length === 0) {
            dom.tabContentEventPrizes.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Нет победителей для отображения.</p>';
            return;
        }
        
        winners.forEach(winner => {
            const hasValidTradeLink = winner.trade_link && winner.trade_link !== 'Не указана' && winner.trade_link.startsWith('http');
            const tradeLinkClass = hasValidTradeLink ? '' : 'disabled';
            const tradeLinkHref = hasValidTradeLink ? winner.trade_link : '#';
            
            const confirmationHtml = winner.prize_sent_confirmed
                ? '<p style="text-align:center; color: var(--status-active-color); font-weight: 600;">✅ Приз выдан</p>'
                : `<button class="admin-action-btn confirm confirm-winner-prize-btn" data-event-id="${winner.event_id}">Подтвердить выдачу</button>`;

            const cardHtml = `
                <div class="quest-card admin-submission-card" id="winner-card-${winner.event_id}">
                    <h3 class="quest-title">${winner.prize_title || 'Без названия'}</h3>
                    <p>Победитель: <strong>${winner.winner_name || 'Неизвестно'}</strong></p>
                    <p>Трейд-ссылка: ${hasValidTradeLink ? `<a href="${tradeLinkHref}" target="_blank" style="color: var(--action-color);">Открыть</a>` : '<span style="color:var(--warning-color);">Не указана</span>'}</p>
                    <div class="submission-actions">
                        ${confirmationHtml}
                    </div>
                </div>`;
            dom.tabContentEventPrizes.innerHTML += cardHtml;
        });
    }
    
    async function loadAndRenderSettings() {
        try {
             const settings = await makeApiRequest('/api/v1/admin/settings', {}, 'POST', true);
             dom.settingQuestsEnabled.checked = settings.quests_enabled;
             dom.settingChallengesEnabled.checked = settings.challenges_enabled;
             dom.settingQuestRewardsEnabled.checked = settings.quest_promocodes_enabled;
             dom.settingChallengeRewardsEnabled.checked = settings.challenge_promocodes_enabled;
             dom.settingCheckpointEnabled.checked = settings.checkpoint_enabled;
             dom.settingMenuBannerUrl.value = settings.menu_banner_url || '';
             dom.settingCheckpointBannerUrl.value = settings.checkpoint_banner_url || '';
        } catch (e) {
             console.error("Не удалось загрузить настройки:", e);
             tg.showAlert("Не удалось загрузить настройки.");
        }
    }

    async function loadTwitchRewards() {
        const container = document.getElementById('twitch-rewards-container');
        container.innerHTML = '';
        try {
            const rewards = await makeApiRequest('/api/v1/admin/twitch_rewards/list', {}, 'GET', true);
            if (!Array.isArray(rewards) || rewards.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Наград пока нет. Они создадутся автоматически, когда пользователь купит первую награду за баллы на Twitch.</p>';
                return;
            }

            rewards.forEach(reward => {
                const cardHtml = `
                    <div class="quest-card twitch-reward-card" data-reward-id="${reward.id}">
                        <h3 class="quest-title">${reward.title}</h3>
                        <div class="admin-buttons-wrapper">
                            <button class="admin-action-btn settings-btn" data-reward='${JSON.stringify(reward)}'>
                                <i class="fa-solid fa-gear"></i> Настройки
                            </button>
                            <button class="admin-action-btn purchases-btn" data-reward-id="${reward.id}" data-reward-title="${reward.title}">
                                <i class="fa-solid fa-receipt"></i> Покупки
                            </button>
                        </div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', cardHtml);
            });
        } catch (e) {
            console.error('Ошибка загрузки Twitch наград:', e);
            container.innerHTML = `<p style="text-align: center; color: var(--danger-color);">Ошибка загрузки наград: ${e.message}</p>`;
        }
    }

    function openTwitchRewardSettings(reward) {
        const modal = document.getElementById('twitch-reward-settings-modal');
        const form = document.getElementById('twitch-reward-settings-form');
        document.getElementById('twitch-settings-title').textContent = `Настройки: ${reward.title}`;
        
        form.elements['reward_id'].value = reward.id;
        form.elements['is_active'].checked = reward.is_active;
        form.elements['notify_admin'].checked = reward.notify_admin;
        form.elements['show_user_input'].checked = reward.show_user_input;
        form.elements['promocode_amount'].value = reward.promocode_amount;
        form.elements['condition_type'].value = reward.condition_type || "";
        form.elements['target_value'].value = reward.target_value || "";

        modal.classList.remove('hidden');
    }

    async function openTwitchPurchases(rewardId, rewardTitle) {
        const modal = document.getElementById('twitch-purchases-modal');
        const body = document.getElementById('twitch-purchases-body');
        const titleEl = document.getElementById('twitch-purchases-title');
        const headerEl = titleEl.parentElement;
        const refreshBtn = document.getElementById('refresh-purchases-btn');

        refreshBtn.dataset.rewardId = rewardId;
        refreshBtn.dataset.rewardTitle = rewardTitle;

        let deleteAllBtn = headerEl.querySelector('#delete-all-purchases-btn');
        if (!deleteAllBtn) {
            deleteAllBtn = document.createElement('button');
            deleteAllBtn.id = 'delete-all-purchases-btn';
            deleteAllBtn.className = 'admin-action-btn reject';
            deleteAllBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Удалить все';
            headerEl.insertBefore(deleteAllBtn, refreshBtn);
        }
        deleteAllBtn.dataset.rewardId = rewardId;
        
        titleEl.textContent = `Покупки: ${rewardTitle}`;
        body.innerHTML = '<i>Загрузка покупок и проверка прогресса...</i>';
        modal.classList.remove('hidden');

        const makeLinksClickable = (text) => {
            if (!text || typeof text !== 'string') return '';
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            return text.replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
        };

        const viewedPurchases = new Set(JSON.parse(localStorage.getItem('viewed_purchases') || '[]'));

        try {
            const data = await makeApiRequest(`/api/v1/admin/twitch_rewards/${rewardId}/purchases`, {}, 'GET', true);
            let { purchases, reward_settings } = data;

            if (!purchases || purchases.length === 0) {
                body.innerHTML = '<p style="text-align: center;">Нет покупок для этой награды.</p>';
                deleteAllBtn.classList.add('hidden');
                return;
            }
            deleteAllBtn.classList.remove('hidden');
            
            const targetValue = reward_settings.target_value;
            const conditionType = reward_settings.condition_type || '';
            const period = conditionType.split('_').pop();

            if (targetValue > 0) {
                const progressPromises = purchases.map(p => {
                    if (p.status === 'Привязан' && p.twitch_login) {
                        return makeApiRequest(
                            '/api/v1/admin/wizebot/check_user',
                            { twitch_username: p.twitch_login, period },
                            'POST',
                            true
                        ).then(stats => {
                            p.progress_value = (stats && stats.found) ? stats.messages : 0;
                        }).catch(err => {
                            console.error(`Ошибка Wizebot для ${p.twitch_login}:`, err);
                            p.progress_value = 0;
                        });
                    }
                    return Promise.resolve();
                });
                await Promise.all(progressPromises);
            }


            body.innerHTML = purchases.map(p => {
                const date = new Date(p.created_at).toLocaleString('ru-RU');
                const progress = p.progress_value === null || typeof p.progress_value === 'undefined' ? 0 : p.progress_value;
                const isLocked = targetValue > 0 && progress < targetValue;
                
                const isViewed = viewedPurchases.has(p.id);
                const viewedStatusClass = isViewed ? 'status-viewed' : 'status-not-viewed';
                const viewedStatusText = isViewed ? 'Просмотрено' : 'Не просмотрено';
                const viewStatusHtml = `<p class="purchase-view-status ${viewedStatusClass}">${viewedStatusText}</p>`;
                
                let userInputHtml = '';
                let rouletteWinHtml = '';
                if (reward_settings.show_user_input && p.user_input) {
                    let userInputContent = p.user_input;
                    if (userInputContent.startsWith("Выигрыш:")) {
                        const parts = userInputContent.split("| Сообщение:");
                        rouletteWinHtml = `<p class="purchase-win-info">${parts[0].trim()}</p>`;
                        userInputContent = (parts.length > 1) ? parts[1].trim() : ''; 
                    }
                    if (userInputContent) {
                       userInputHtml = `<div class="purchase-user-input">${makeLinksClickable(userInputContent)}</div>`;
                    }
                }

                const tradeLinkHtml = p.trade_link ? `<p>Трейд: <a href="${p.trade_link}" target="_blank" rel="noopener noreferrer" style="color: var(--action-color);">Открыть</a></p>` : '';
                
                let actionButtonsHtml;
                if (p.rewarded_at) {
                    actionButtonsHtml = `
                        <div class="rewarded-info" style="flex-grow: 1;"><i class="fa-solid fa-check-circle"></i> Награда выдана</div>
                        <button class="admin-action-btn reject delete-purchase-btn" data-purchase-id="${p.id}"><i class="fa-solid fa-trash"></i></button>`;
                } else if (p.status === 'Привязан') {
                    actionButtonsHtml = `
                        <button class="admin-action-btn issue-promo-btn" data-purchase-id="${p.id}" ${isLocked ? 'disabled' : ''}>Выдать промокод</button>
                        <button class="admin-action-btn reject delete-purchase-btn" data-purchase-id="${p.id}"><i class="fa-solid fa-trash"></i></button>`;
                } else {
                    actionButtonsHtml = `
                        <div class="rewarded-info" style="flex-grow: 1; color: var(--text-color-muted);">Ожидает привязки</div>
                        <button class="admin-action-btn reject delete-purchase-btn" data-purchase-id="${p.id}"><i class="fa-solid fa-trash"></i></button>`;
                }

                const lockedOverlayHtml = isLocked ? `
                    <div class="locked-overlay">
                        <span class="locked-overlay-text">
                            Условие не выполнено<br>
                            Прогресс: ${progress} / ${targetValue}
                        </span>
                    </div>
                ` : '';

                const telegramNameDisplay = p.status === 'Привязан' 
                    ? `<span style="color: var(--text-color-muted); font-weight: normal; margin-left: 5px;">(${p.username || '...'})</span>`
                    : `<span style="color: var(--warning-color); font-weight: normal; margin-left: 5px;">(Не привязан)</span>`;

                return `
                <div class="purchase-item ${isLocked ? 'is-locked' : ''}" id="purchase-item-${p.id}" data-purchase-id="${p.id}">
                    ${lockedOverlayHtml} 
                    <div class="purchase-item-header">
                        <strong>${p.twitch_login || '???'}${telegramNameDisplay}</strong>
                        <span class="purchase-status-badge purchase-status-${p.status.replace(' ', '.')}">${p.status}</span>
                    </div>
                    <p>Дата: ${date}</p>
                    ${viewStatusHtml}
                    ${tradeLinkHtml}
                    ${rouletteWinHtml}
                    ${userInputHtml}
                    <div class="purchase-actions">${actionButtonsHtml}</div>
                </div>
                `;
            }).join('');

        } catch(e) {
            body.innerHTML = `<p style='color: var(--danger-color);'>Ошибка загрузки покупок: ${e.message}</p>`;
        }
    }

    function renderRoulettePrizes(prizes) {
        dom.roulettePrizesList.innerHTML = '';
        if (!prizes || prizes.length === 0) {
            dom.roulettePrizesList.innerHTML = '<p style="text-align: center;">Призов для рулеток пока нет.</p>';
            return;
        }

        const groupedPrizes = prizes.reduce((acc, prize) => {
            if (!acc[prize.reward_title]) {
                acc[prize.reward_title] = [];
            }
            acc[prize.reward_title].push(prize);
            return acc;
        }, {});

        for (const rewardTitle in groupedPrizes) {
            const prizesHtml = groupedPrizes[rewardTitle].map(prize => `
                <div class="quest-card" style="flex-direction: row; align-items: center; gap: 15px;">
                    <img src="${prize.image_url}" alt="skin" style="width: 56px; height: 56px; object-fit: contain; border-radius: 8px;">
                    <div style="flex-grow: 1;">
                        <p style="margin: 0; font-weight: 600;">${prize.skin_name}</p>
                        <small style="color: var(--text-color-muted);">Вес шанса: ${prize.chance_weight}</small>
                    </div>
                    <button class="admin-delete-quest-btn delete-roulette-prize-btn" data-id="${prize.id}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `).join('');

            const groupHtml = `
                <details class="quest-category-accordion" open>
                    <summary class="quest-category-header">
                       ${rewardTitle}
                    </summary>
                    <div class="quest-category-body">
                        ${prizesHtml}
                    </div>
                </details>
            `;
            dom.roulettePrizesList.insertAdjacentHTML('beforeend', groupHtml);
        }
    }

    function renderQuests(quests, categories) {
        dom.questsList.innerHTML = '';
        if (!quests || quests.length === 0) {
             dom.questsList.innerHTML = `<p style="text-align: center;">Созданных заданий нет.</p>`;
             return;
        }
        const questTypeMap = {
            'manual_check': { name: 'Ручная проверка', color: '#5856d6' },
            'automatic_telegram_messages': { name: 'Авто: Telegram', color: '#007aff' },
            'automatic_twitch_points': { name: 'Авто: Twitch Ранг', color: '#6441a5' },
            'automatic_twitch_messages': { name: 'Авто: Twitch Сообщения', color: '#6441a5' },
            'automatic_twitch_uptime': { name: 'Авто: Twitch Время', color: '#6441a5' },
        };
        const getQuestTypeDetails = (type) => {
            const baseType = Object.keys(questTypeMap).find(key => type.startsWith(key));
            return baseType ? questTypeMap[baseType] : { name: type, color: '#98989d' };
        };

        const groupedQuests = quests.reduce((acc, quest) => {
            const categoryId = quest.category_id || 'no_category';
            if (!acc[categoryId]) acc[categoryId] = [];
            acc[categoryId].push(quest);
            return acc;
        }, {});
        const allCategories = [{ id: 'no_category', name: 'Автоматические и без категории' }, ...categories];
        allCategories.forEach(cat => {
            const questsInCategory = (groupedQuests[cat.id] || []).sort((a, b) => (a.sort_order || 999) - (b.sort_order || 999));
            if (questsInCategory.length === 0) return;
            const questsHtml = questsInCategory.map((quest, index) => {
                const statusClass = quest.is_active ? 'status-active' : 'status-inactive';
                const typeDetails = getQuestTypeDetails(quest.quest_type);
                return `
                <div class="quest-card manage-quest-card" data-quest-id="${quest.id}">
                    <div class="quest-admin-meta">
                        <span class="quest-status-badge ${statusClass}">${quest.is_active ? 'Активен' : 'Неактивен'}</span>
                        <span class="quest-status-badge" style="background-color: ${typeDetails.color}20; color: ${typeDetails.color};">${typeDetails.name}</span>
                        <button class="admin-edit-quest-btn sort-quest-btn" data-quest-id="${quest.id}" data-category-id="${cat.id === 'no_category' ? '' : cat.id}" data-index="${index}" data-direction="up" ${index === 0 ? 'disabled' : ''}>▲</button>
                        <button class="admin-edit-quest-btn sort-quest-btn" data-quest-id="${quest.id}" data-category-id="${cat.id === 'no_category' ? '' : cat.id}" data-index="${index}" data-direction="down" ${index === questsInCategory.length - 1 ? 'disabled' : ''}>▼</button>
                    </div>
                    <div class="manage-quest-info">
                        <span>${quest.title}</span><br>
                        <small style="color: var(--text-color-muted);">ID: ${quest.id} | Награда: ${quest.reward_amount || 'нет'} ⭐</small>
                    </div>
                    <div class="admin-buttons-wrapper">
                        ${quest.quest_type === 'manual_check' ? `<button class="admin-view-subs-btn" data-id="${quest.id}" data-title="${quest.title}">Заявки</button>` : ''}
                        <button class="admin-edit-quest-btn" data-id="${quest.id}">Редактировать</button>
                        <button class="admin-delete-quest-btn" data-id="${quest.id}">Удалить</button>
                    </div>
                </div>`;
            }).join('');
            const accordionHtml = `
                <details class="quest-category-accordion" ${cat.id === 'no_category' ? 'open' : ''}>
                    <summary class="quest-category-header">
                        <div class="category-info">${cat.name}</div>
                    </summary>
                    <div class="quest-category-body">${questsHtml}</div>
                </details>`;
            dom.questsList.insertAdjacentHTML('beforeend', accordionHtml);
        });
    }
    
    function renderSubmissionsInModal(submissions, questTitle) {
        dom.modalTitle.textContent = `Заявки: ${questTitle}`;
        dom.modalBody.innerHTML = (!submissions || submissions.length === 0) ? '<p style="text-align: center;">Для этого квеста нет заявок.</p>' :
            submissions.map(sub => `
            <div class="submission-item">
                <p><strong>${sub.user_full_name || 'Неизвестный пользователь'}</strong> <span class="submission-status-badge status-${sub.status}">${sub.status === 'pending' ? 'Ожидает' : 'Одобрена'}</span></p>
                <p><small>${new Date(sub.created_at).toLocaleString('ru-RU')}</small></p>
            </div>`).join('');
    }

    function getQuestFormData(form) {
        const data = Object.fromEntries(new FormData(form));
        let questType = data.quest_type;
        if (questType === 'automatic_twitch_messages' || questType === 'automatic_twitch_uptime') {
            questType = `${questType}_${data.twitch_period}`;
        }
        const finalData = {
            title: data.title, icon_url: data.icon_url, description: data.description,
            reward_amount: parseInt(data.reward_amount, 10), quest_type: questType,
            target_value: data.target_value ? parseInt(data.target_value, 10) : null,
            duration_hours: data.duration_hours ? parseInt(data.duration_hours, 10) : 0,
        };
        if (data.quest_type === 'manual_check') {
            finalData.category_id = data.category_id ? parseInt(data.category_id, 10) : null;
            finalData.is_repeatable = data.is_repeatable === 'true';
            finalData.action_url = data.action_url;
        }
        return finalData;
    }

    function updateSleepButton(status) {
        if (status.is_sleeping) {
            dom.sleepModeToggle.classList.add('is-sleeping');
            dom.sleepModeToggle.title = "Разбудить бота";
        } else {
            dom.sleepModeToggle.classList.remove('is-sleeping');
            dom.sleepModeToggle.title = "Уложить бота спать";
        }
    }

function setupEventListeners() {
        // --- ОБРАБОТЧИКИ ДЛЯ ФОРМ И ОТДЕЛЬНЫХ ЭЛЕМЕНТОВ (НЕ ДЕЛЕГИРОВАННЫЕ) ---

        if (document.getElementById('refresh-purchases-btn')) {
            document.getElementById('refresh-purchases-btn').addEventListener('click', (e) => {
                const btn = e.currentTarget;
                const { rewardId, rewardTitle } = btn.dataset;
                if (rewardId && rewardTitle) {
                    openTwitchPurchases(rewardId, rewardTitle);
                }
            });
        }

        if (dom.addTopRewardBtn) {
            dom.addTopRewardBtn.addEventListener('click', () => {
                dom.topRewardsContainer.appendChild(createTopRewardRow());
            });
        }

        if (dom.topRewardsContainer) {
            dom.topRewardsContainer.addEventListener('click', (e) => {
                if (e.target.closest('.remove-reward-btn')) {
                    e.target.closest('.top-reward-row').remove();
                }
            });
        }

        if (dom.cauldronSettingsForm) {
            dom.cauldronSettingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                tg.showConfirm('Сохранить все настройки для ивента? Это действие обновит все награды.', async (ok) => {
                    if (ok) {
                        try {
                            const content = collectCauldronData();
                            content.current_progress = currentCauldronData.current_progress || 0;
                            await makeApiRequest('/api/v1/admin/events/cauldron/update', { content });
                            tg.showAlert('Настройки ивента сохранены!');
                        } catch (error) {
                            tg.showAlert(`Ошибка сохранения: ${error.message}`);
                        }
                    }
                });
            });
        }

        if (dom.resetCauldronBtn) {
            dom.resetCauldronBtn.addEventListener('click', () => {
                tg.showConfirm('Вы уверены, что хотите сбросить ВЕСЬ прогресс и удалить всех участников? Это действие необратимо.', async (ok) => {
                    if (ok) {
                        const result = await makeApiRequest('/api/v1/admin/events/cauldron/reset');
                        tg.showAlert(result.message);
                        await switchView('view-admin-cauldron');
                    }
                });
            });
        }

        if (dom.distributeRewardsBtn) {
            dom.distributeRewardsBtn.addEventListener('click', () => {
                tg.showConfirm('ВНИМАНИЕ! Это действие завершит ивент, создаст заявки на выдачу наград и выключит его видимость для пользователей. Отменить будет нельзя. Продолжить?', async (ok) => {
                    if (ok) {
                        const result = await makeApiRequest('/api/v1/admin/events/cauldron/distribute');
                        tg.showAlert(result.message);
                        await switchView('view-admin-cauldron');
                    }
                });
            });
        }

        const cauldronTabs = document.getElementById('cauldron-tabs');
        if (cauldronTabs) {
            cauldronTabs.addEventListener('click', (e) => {
                const button = e.target.closest('.tab-button');
                if (button && button.dataset.tab === 'cauldron-distribution') {
                    loadCauldronParticipants();
                }
            });
        }

        if (dom.twitchSettingsForm) {
            dom.twitchSettingsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                const payload = {
                    id: parseInt(form.elements['reward_id'].value),
                    is_active: form.elements['is_active'].checked,
                    notify_admin: form.elements['notify_admin'].checked,
                    show_user_input: form.elements['show_user_input'].checked,
                    promocode_amount: parseInt(form.elements['promocode_amount'].value),
                    condition_type: form.elements['condition_type'].value || null,
                    target_value: form.elements['target_value'].value ? parseInt(form.elements['target_value'].value) : null
                };
                await makeApiRequest('/api/v1/admin/twitch_rewards/update', payload);
                document.getElementById('twitch-reward-settings-modal').classList.add('hidden');
                tg.showAlert('Настройки сохранены!');
                await loadTwitchRewards();
            });
        }

        if (document.getElementById('delete-twitch-reward-btn')) {
            document.getElementById('delete-twitch-reward-btn').addEventListener('click', async () => {
                const form = document.getElementById('twitch-reward-settings-form');
                const rewardId = parseInt(form.elements['reward_id'].value);
                if (!rewardId) {
                    tg.showAlert('Ошибка: ID награды не найден.');
                    return;
                }
                tg.showConfirm('Вы уверены, что хотите удалить эту награду? Это действие удалит ВСЕ связанные с ней покупки.', async (ok) => {
                    if (ok) {
                        try {
                            await makeApiRequest('/api/v1/admin/twitch_rewards/delete', { reward_id: rewardId });
                            tg.showAlert('Награда успешно удалена.');
                            document.getElementById('twitch-reward-settings-modal').classList.add('hidden');
                            await loadTwitchRewards();
                        } catch (e) {
                            tg.showAlert(`Ошибка при удалении: ${e.message}`);
                        }
                    }
                });
            });
        }

        document.querySelectorAll('.tabs-container').forEach(container => {
            container.addEventListener('click', (e) => {
                const button = e.target.closest('.tab-button');
                if (!button || button.classList.contains('active')) return;
                const tabId = button.dataset.tab;
                if (container.classList.contains('main-tabs')) {
                    if (tabId === 'admin' && !hasAdminAccess) {
                        dom.passwordPromptOverlay.classList.remove('hidden');
                        dom.passwordPromptInput.focus();
                        return;
                    }
                }
                container.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                const parentElement = container.closest('.view');
                if (container.classList.contains('main-tabs')) {
                    document.getElementById('tab-content-main').classList.toggle('hidden', tabId !== 'main');
                    document.getElementById('tab-content-admin').classList.toggle('hidden', tabId !== 'admin');
                } else if (parentElement) {
                    parentElement.querySelectorAll('.tab-content').forEach(content => {
                        content.classList.toggle('hidden', content.id !== `tab-content-${tabId}`);
                    });
                }
            });
        });

        if (dom.passwordPromptCancel) {
            dom.passwordPromptCancel.addEventListener('click', () => dom.passwordPromptOverlay.classList.add('hidden'));
        }

        if (dom.passwordPromptConfirm) {
            dom.passwordPromptConfirm.addEventListener('click', async () => {
                const password = dom.passwordPromptInput.value;
                if (!password) return;
                try {
                    const result = await makeApiRequest('/api/v1/admin/verify_password', { password });
                    if (result.success) {
                        hasAdminAccess = true;
                        dom.passwordPromptOverlay.classList.add('hidden');
                        dom.passwordPromptInput.value = '';
                        const adminTabButton = document.querySelector('.tabs-container.main-tabs .tab-button[data-tab="admin"]');
                        if (adminTabButton) adminTabButton.click();
                    } else {
                        tg.showAlert('Неверный пароль!');
                    }
                } catch (error) {
                    tg.showAlert('Ошибка проверки пароля.');
                }
            });
        }

        if (dom.sleepModeToggle) {
            dom.sleepModeToggle.addEventListener('click', () => {
                const isSleeping = dom.sleepModeToggle.classList.contains('is-sleeping');
                if (isSleeping) {
                    tg.showConfirm('Разбудить бота?', async (ok) => {
                        if (ok) {
                            const result = await makeApiRequest('/api/v1/admin/toggle_sleep_mode');
                            updateSleepButton(result.new_status);
                            tg.showAlert(result.message);
                        }
                    });
                } else {
                    dom.sleepPromptOverlay.classList.remove('hidden');
                }
            });
        }

        if (dom.sleepPromptCancel) dom.sleepPromptCancel.addEventListener('click', () => dom.sleepPromptOverlay.classList.add('hidden'));
        
        if (dom.sleepPromptConfirm) {
            dom.sleepPromptConfirm.addEventListener('click', async () => {
                const minutes = parseInt(dom.sleepMinutesInput.value) || 0;
                dom.sleepPromptOverlay.classList.add('hidden');
                const result = await makeApiRequest('/api/v1/admin/toggle_sleep_mode', { minutes: minutes });
                updateSleepButton(result.new_status);
                tg.showAlert(result.message);
            });
        }

        if (dom.saveSettingsBtn) {
            dom.saveSettingsBtn.addEventListener('click', async () => {
                const payload = {
                    quests_enabled: dom.settingQuestsEnabled.checked,
                    challenges_enabled: dom.settingChallengesEnabled.checked,
                    quest_promocodes_enabled: dom.settingQuestRewardsEnabled.checked,
                    challenge_promocodes_enabled: dom.settingChallengeRewardsEnabled.checked,
                    checkpoint_enabled: dom.settingCheckpointEnabled.checked,
                    menu_banner_url: dom.settingMenuBannerUrl.value.trim(),
                    checkpoint_banner_url: dom.settingCheckpointBannerUrl.value.trim()
                };
                await makeApiRequest('/api/v1/admin/settings/update', { settings: payload });
                tg.showAlert('Настройки сохранены!');
            });
        }
        
        if (dom.resetAllQuestsBtn) {
            dom.resetAllQuestsBtn.addEventListener('click', () => {
                 tg.showConfirm('Вы уверены, что хотите сбросить ВСЕ активные квесты у ВСЕХ пользователей?', async (ok) => {
                    if (ok) {
                        await makeApiRequest('/api/v1/admin/quests/reset-all-active');
                        tg.showAlert('Все активные квесты успешно сброшены.');
                    }
                 });
            });
        }

        if (dom.resetAllCheckpointProgressBtn) {
            dom.resetAllCheckpointProgressBtn.addEventListener('click', () => {
                 tg.showConfirm('ЭТО ДЕЙСТВИЕ НЕОБРАТИМО! Вы уверены, что хотите сбросить ТОЛЬКО СПИСОК НАГРАД Чекпоинта у ВСЕХ пользователей? Их звёзды останутся.', async (ok) => {
                    if (ok) {
                        await makeApiRequest('/api/v1/admin/users/reset-all-checkpoint-progress');
                        tg.showAlert('Список наград Чекпоинта сброшен у всех пользователей.');
                    }
                 });
            });
        }
        
        if (dom.clearAllCheckpointStarsBtn) {
            dom.clearAllCheckpointStarsBtn.addEventListener('click', () => {
                 tg.showConfirm('ЭТО ДЕЙСТВИЕ НЕОБРАТИМО! Вы уверены, что хотите ОБНУЛИТЬ БАЛАНС ЗВЁЗД Чекпоинта у ВСЕХ пользователей? Их полученные награды останутся.', async (ok) => {
                    if (ok) {
                        await makeApiRequest('/api/v1/admin/users/clear-all-checkpoint-stars');
                        tg.showAlert('Баланс звёзд Чекпоинта обнулён у всех пользователей.');
                    }
                 });
            });
        }

        // --- ЕДИНЫЙ ОБРАБОТЧИК КЛИКОВ НА BODY ---
        document.body.addEventListener('click', async (event) => {
            const target = event.target;

            const closeBtn = target.closest('[data-close-modal]');
            if (closeBtn) {
                const modalId = closeBtn.dataset.closeModal;
                if (document.getElementById(modalId)) {
                    document.getElementById(modalId).classList.add('hidden');
                }
                return;
            }

            const deleteAllBtn = target.closest('#delete-all-purchases-btn');
            if (deleteAllBtn) {
                const rewardId = parseInt(deleteAllBtn.dataset.rewardId);
                if (!rewardId) return;
                tg.showConfirm(`Удалить ВСЕ покупки для этой награды?`, async (ok) => {
                    if (ok) {
                        try {
                            await makeApiRequest('/api/v1/admin/twitch_rewards/purchases/delete_all', { reward_id: rewardId });
                            tg.showAlert('Все покупки были удалены.');
                            document.getElementById('twitch-purchases-body').innerHTML = '<p>Нет покупок.</p>';
                            deleteAllBtn.classList.add('hidden');
                        } catch (err) {
                            tg.showAlert(`Ошибка: ${err.message}`);
                        }
                    }
                });
                return;
            }

            const buttonTarget = target.closest('button');
            if (!buttonTarget) return;

            const navButton = buttonTarget.closest('.admin-icon-button, .back-button, #go-create-quest, #go-create-challenge');
            if (navButton && navButton.tagName.toLowerCase() !== 'a') {
                event.preventDefault();
                const view = navButton.dataset.view;
                if (view) await switchView(view);
                else if (navButton.id === 'go-create-quest') await switchView('view-admin-create');
                else if (navButton.id === 'go-create-challenge') {
                    dom.challengeForm.reset();
                    dom.challengeForm.elements['challenge_id'].value = '';
                    updateChallengeFormUI(dom.challengeForm);
                    dom.challengeFormTitle.textContent = 'Новый челлендж';
                    await switchView('view-admin-challenge-form');
                }
                return;
            }
            
            const settingsBtn = buttonTarget.closest('.settings-btn');
            if (settingsBtn) {
                const rewardData = JSON.parse(settingsBtn.dataset.reward);
                openTwitchRewardSettings(rewardData);
                return;
            }

            const purchasesBtn = buttonTarget.closest('.purchases-btn');
            if (purchasesBtn) {
                const { rewardId, rewardTitle } = purchasesBtn.dataset;
                await openTwitchPurchases(rewardId, rewardTitle);
                return;
            }
            
            const issuePromoBtn = buttonTarget.closest('.issue-promo-btn');
            if (issuePromoBtn) {
                const purchaseId = issuePromoBtn.dataset.purchaseId;
                tg.showConfirm('Выдать промокод этому пользователю?', async (ok) => {
                    if (ok) {
                        try {
                            const result = await makeApiRequest('/api/v1/admin/twitch_rewards/issue_promocode', { purchase_id: parseInt(purchaseId) });
                            tg.showAlert(result.message);
                            const itemDiv = document.getElementById(`purchase-item-${purchaseId}`);
                            if (itemDiv) {
                                const actionDiv = itemDiv.querySelector('.purchase-actions');
                                actionDiv.innerHTML = `<div class="rewarded-info" style="flex-grow: 1;"><i class="fa-solid fa-check-circle"></i> Награда выдана</div><button class="admin-action-btn reject delete-purchase-btn" data-purchase-id="${purchaseId}"><i class="fa-solid fa-trash"></i></button>`;
                            }
                        } catch (e) {
                            tg.showAlert(`Ошибка: ${e.message}`);
                        }
                    }
                });
                return;
            }
            
            const deletePurchaseBtn = buttonTarget.closest('.delete-purchase-btn');
            if (deletePurchaseBtn) {
                const purchaseId = deletePurchaseBtn.dataset.purchaseId;
                tg.showConfirm('Удалить эту покупку?', async (ok) => {
                    if (ok) {
                        try {
                            await makeApiRequest('/api/v1/admin/twitch_rewards/purchase/delete', { purchase_id: parseInt(purchaseId) });
                            document.getElementById(`purchase-item-${purchaseId}`)?.remove();
                            tg.showAlert('Покупка удалена.');
                        } catch (e) {
                            tg.showAlert(`Ошибка: ${e.message}`);
                        }
                    }
                });
                return;
            }

            const checkBtn = buttonTarget.closest('.check-wizebot-btn, .wizebot-check-btn');
            if (checkBtn) {
                const nickname = checkBtn.dataset.nickname;
                const period = checkBtn.dataset.period || 'session';
                const card = checkBtn.closest('.admin-submission-card, .purchase-item');
                let resultDiv = card.querySelector('.wizebot-stats-result');
                if (checkBtn.classList.contains('wizebot-check-btn')) {
                   const purchaseId = card.id.split('-')[2];
                   resultDiv = card.querySelector(`#wizebot-result-${purchaseId}`);
                }
                if (!nickname) { resultDiv.innerHTML = `<p style="color: var(--danger-color);">Никнейм не найден.</p>`; return; }
                resultDiv.innerHTML = '<i>Проверяем...</i>';
                checkBtn.disabled = true;
                try {
                    const stats = await makeApiRequest('/api/v1/admin/wizebot/check_user', { twitch_username: nickname, period: period }, 'POST', true);
                    if (stats.found) resultDiv.innerHTML = `<p style="color: var(--primary-color);">✅ ${stats.messages} сообщений (ранг ${stats.rank})</p>`;
                    else resultDiv.innerHTML = `<p style="color: var(--warning-color);">⚠️ Не найден в топ-100</p>`;
                } catch (e) { 
                    resultDiv.innerHTML = `<p style="color: var(--danger-color);">Ошибка: ${e.message}</p>`; 
                } finally { 
                    checkBtn.disabled = false; 
                }
                return;
            }

            const confirmWinnerBtn = buttonTarget.closest('.confirm-winner-prize-btn');
            if (confirmWinnerBtn) {
                const eventId = confirmWinnerBtn.dataset.eventId;
                tg.showConfirm('Вы уверены, что выдали этот приз победителю?', async (ok) => {
                    if (ok) {
                        await makeApiRequest('/api/v1/admin/events/confirm_sent', { event_id: parseInt(eventId) });
                        tg.showAlert('Выдача приза подтверждена.');
                        confirmWinnerBtn.closest('.admin-submission-card')?.remove();
                    }
                });
                return;
            }
            
            const actionButton = buttonTarget.closest('.admin-edit-quest-btn, .admin-delete-quest-btn, .admin-view-subs-btn, .admin-action-btn, .admin-edit-challenge-btn, .admin-delete-challenge-btn, .edit-category-btn, .delete-category-btn, .sort-btn, .sort-quest-btn');
            if (!actionButton) return;
            
            const id = actionButton.dataset.id;

            if (actionButton.matches('.edit-category-btn')) {
                showGenericPrompt('Редактировать категорию', actionButton.dataset.name, id);
            } else if (actionButton.matches('.delete-category-btn')) {
                tg.showConfirm('Удалить эту категорию?', async (ok) => {
                    if (ok) {
                        await makeApiRequest('/api/v1/admin/categories/delete', { category_id: parseInt(id) });
                        await switchView('view-admin-categories');
                    }
                });
            } else if (actionButton.matches('.admin-edit-challenge-btn')) {
                const c = JSON.parse(actionButton.dataset.challenge);
                const form = dom.challengeForm;
                let condType = c.condition_type, period = 'session';
                const parts = c.condition_type.split('_');
                if (['twitch_messages', 'twitch_uptime'].includes(parts.slice(0, 2).join('_'))) {
                    condType = parts.slice(0, 2).join('_');
                    period = parts[parts.length - 1];
                }
                form.elements['challenge_id'].value = c.id;
                form.elements['description'].value = c.description;
                form.elements['condition_type'].value = condType;
                form.elements['challenge_period'].value = period;
                form.elements['target_value'].value = c.target_value;
                form.elements['reward_amount'].value = c.reward_amount;
                form.elements['duration_days'].value = c.duration_days;
                form.elements['is_active'].value = c.is_active.toString();
                updateChallengeFormUI(form);
                dom.challengeFormTitle.textContent = 'Редактирование';
                await switchView('view-admin-challenge-form');
            } else if (actionButton.matches('.admin-delete-challenge-btn')) {
                 tg.showConfirm(`Удалить челлендж ID ${id}?`, async (ok) => {
                    if (ok) {
                        await makeApiRequest('/api/v1/admin/challenges/delete', { challenge_id: parseInt(id) });
                        await switchView('view-admin-challenges');
                    }
                });
            } else if (actionButton.matches('.admin-edit-quest-btn') && !actionButton.matches('.sort-quest-btn')) {
                const quest = await makeApiRequest('/api/v1/admin/quest/details', { quest_id: parseInt(id) });
                await fetchAndCacheCategories(true);
                populateCategorySelects(quest.category_id);
                const form = dom.editQuestForm;
                let questType = quest.quest_type, twitchPeriod = 'session';
                if (quest.quest_type.startsWith('automatic_twitch_')) {
                    const parts = quest.quest_type.split('_');
                    if (parts.length > 3) { questType = parts.slice(0, 3).join('_'); twitchPeriod = parts[3]; }
                }
                form.elements['quest_id'].value = quest.id;
                form.elements['title'].value = quest.title;
                form.elements['icon_url'].value = quest.icon_url || '';
                form.elements['description'].value = quest.description || '';
                form.elements['reward_amount'].value = quest.reward_amount;
                form.elements['category_id'].value = quest.category_id || '';
                form.elements['quest_type'].value = questType;
                form.elements['action_url'].value = quest.action_url || '';
                form.elements['twitch_period'].value = twitchPeriod;
                form.elements['target_value'].value = quest.target_value || '';
                form.elements['duration_hours'].value = quest.duration_hours || 0;
                form.elements['is_active'].value = quest.is_active.toString();
                form.elements['is_repeatable'].value = quest.is_repeatable.toString();
                updateQuestFormUI(form);
                await switchView('view-admin-edit');
            } else if (actionButton.matches('.admin-delete-quest-btn') && !actionButton.matches('.delete-category-btn')) {
                tg.showConfirm(`Удалить задание ID ${id}?`, async (ok) => {
                    if (ok) {
                        await makeApiRequest('/api/v1/admin/quest/delete', { quest_id: parseInt(id) });
                        await switchView('view-admin-quests'); 
                    }
                });
            } else if (actionButton.matches('.admin-view-subs-btn')) {
                const submissions = await makeApiRequest('/api/v1/admin/quest/submissions', { quest_id: parseInt(id) });
                renderSubmissionsInModal(submissions, actionButton.dataset.title);
                dom.submissionsModal.classList.remove('hidden');
            } else if (actionButton.matches('.admin-action-btn')) {
                const action = actionButton.dataset.action;
                const card = actionButton.closest('.admin-submission-card');
                if (action === 'approved' || action === 'rejected') {
                     await makeApiRequest('/api/v1/admin/submission/update', { submission_id: parseInt(id), action });
                     tg.showAlert(`Заявка ${action === 'approved' ? 'одобрена' : 'отклонена'}.`);
                     card?.remove();
                } else if (action === 'confirm_prize') {
                    tg.showConfirm('Вы уверены, что выдали этот приз?', async (ok) => {
                         if(ok) {
                            await makeApiRequest('/api/v1/admin/manual_rewards/complete', { reward_id: parseInt(id) });
                            tg.showAlert('Выдача приза подтверждена.');
                            card?.remove();
                         }
                    });
                }
            } else if (actionButton.matches('.sort-btn')) {
                const index = parseInt(actionButton.dataset.index);
                const direction = actionButton.dataset.direction;
                const newIndex = direction === 'up' ? index - 1 : index + 1;
                if (newIndex >= 0 && newIndex < categoriesCache.length) {
                    [categoriesCache[index], categoriesCache[newIndex]] = [categoriesCache[newIndex], categoriesCache[index]];
                    renderCategoriesList();
                    makeApiRequest('/api/v1/admin/categories/reorder', { ordered_ids: categoriesCache.map(c => c.id) }, 'POST', true);
                }
            } else if (actionButton.matches('.sort-quest-btn')) {
                const questId = parseInt(actionButton.dataset.questId);
                const categoryId = actionButton.dataset.categoryId ? parseInt(actionButton.dataset.categoryId) : null;
                const direction = actionButton.dataset.direction;
                await makeApiRequest('/api/v1/admin/quests/reorder', { quest_id: questId, category_id: categoryId, direction: direction });
                await switchView('view-admin-quests');
            }
        });
        
        if(dom.createQuestForm) dom.createQuestForm.addEventListener('change', () => updateQuestFormUI(dom.createQuestForm));
        if(dom.editQuestForm) dom.editQuestForm.addEventListener('change', () => updateQuestFormUI(dom.editQuestForm));
        if(dom.challengeForm) dom.challengeForm.addEventListener('change', () => updateChallengeFormUI(dom.challengeForm));

        if(dom.challengeForm) {
            dom.challengeForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                let conditionType = form.elements['condition_type'].value;
                if (conditionType === 'twitch_messages' || conditionType === 'twitch_uptime') {
                    conditionType = `${conditionType}_${form.elements['challenge_period'].value}`;
                }
                const data = {
                    description: form.elements['description'].value, condition_type: conditionType,
                    target_value: parseInt(form.elements['target_value'].value), reward_amount: parseInt(form.elements['reward_amount'].value),
                    duration_days: parseInt(form.elements['duration_days'].value), is_active: form.elements['is_active'].value === 'true',
                };
                const challengeId = form.elements['challenge_id'].value;
                if (challengeId) await makeApiRequest('/api/v1/admin/challenges/update', { ...data, challenge_id: parseInt(challengeId) });
                else await makeApiRequest('/api/v1/admin/challenges/create', data);
                await switchView('view-admin-challenges');
            });
        }
        
        if(dom.createQuestForm) {
            dom.createQuestForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const questData = getQuestFormData(e.target);
                await makeApiRequest('/api/v1/admin/quests', questData);
                await switchView('view-admin-quests');
            });
        }
        
        if(dom.editQuestForm) {
            dom.editQuestForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                try {
                    const questData = getQuestFormData(form);
                    const finalData = { 
                        ...questData, 
                        quest_id: parseInt(form.elements['quest_id'].value, 10), 
                        is_active: form.elements['is_active'].value === 'true' 
                    };
                    await makeApiRequest('/api/v1/admin/quest/update', finalData);
                    tg.showAlert('Задание успешно обновлено!');
                    await switchView('view-admin-quests');
                } catch (error) {
                    tg.showAlert(`Не удалось обновить задание: ${error.message}`);
                }
            });
        }
        
        if(dom.createCategoryForm) {
            dom.createCategoryForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                const categoryName = form.elements['name'].value;
                if (!categoryName) return;
                await makeApiRequest('/api/v1/admin/categories/create', { name: categoryName });
                form.reset();
                tg.showAlert('Категория создана!');
                await switchView('view-admin-categories');
            });
        }
        
        if(dom.addPromocodesForm) {
            dom.addPromocodesForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = Object.fromEntries(new FormData(e.target));
                const body = {
                    codes: formData.codes,
                    reward_value: parseInt(formData.reward_value, 10),
                    description: formData.description
                };
                const result = await makeApiRequest('/api/v1/admin/promocodes', body);
                tg.showAlert(result.message);
                e.target.reset();
            });
        }
        
        if(dom.grantCheckpointStarsForm) {
            dom.grantCheckpointStarsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                const userId = parseInt(form.elements['user_id_to_grant_cp'].value);
                const amount = parseInt(form.elements['amount_cp'].value);
                if (!userId || !amount) return;
                const result = await makeApiRequest('/api/v1/admin/users/grant-checkpoint-stars', { user_id_to_grant: userId, amount: amount });
                tg.showAlert(result.message);
                form.reset();
            });
        }
        
        if(dom.freezeCheckpointStarsForm) {
            dom.freezeCheckpointStarsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                const userId = parseInt(form.elements['user_id_to_freeze_cp'].value);
                const days = parseInt(form.elements['days_cp'].value);
                if (!userId || isNaN(days)) return;
                const result = await makeApiRequest('/api/v1/admin/users/freeze-checkpoint-stars', { user_id_to_freeze: userId, days: days });
                tg.showAlert(result.message);
                form.reset();
            });
        }

        if(dom.grantTicketsForm) {
            dom.grantTicketsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                const userId = parseInt(form.elements['user_id_to_grant_tickets'].value);
                const amount = parseInt(form.elements['amount_tickets'].value);
                if (!userId || !amount) return;
                const result = await makeApiRequest('/api/v1/admin/users/grant-stars', { user_id_to_grant: userId, amount: amount });
                tg.showAlert(result.message);
                form.reset();
            });
        }
        
        if(dom.freezeTicketsForm) {
            dom.freezeTicketsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                const userId = parseInt(form.elements['user_id_to_freeze_tickets'].value);
                const days = parseInt(form.elements['days_tickets'].value);
                if (!userId || isNaN(days)) return;
                const result = await makeApiRequest('/api/v1/admin/users/freeze-stars', { user_id_to_freeze: userId, days: days });
                tg.showAlert(result.message);
                form.reset();
            });
        }

        if(dom.resetCheckpointProgressForm) {
            dom.resetCheckpointProgressForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                const userId = parseInt(form.elements['user_id_to_reset'].value);
                if (!userId) return;
                tg.showConfirm(`Сбросить НАГРАДЫ Чекпоинта для ${userId}?`, async (ok) => {
                    if (ok) {
                        const result = await makeApiRequest('/api/v1/admin/users/reset-checkpoint-progress', { user_id: userId });
                        tg.showAlert(result.message);
                        form.reset();
                    }
                });
            });
        }
        
        if(dom.clearCheckpointStarsForm) {
            dom.clearCheckpointStarsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                const userId = parseInt(form.elements['user_id_to_clear'].value);
                if (!userId) return;
                tg.showConfirm(`Обнулить ЗВЁЗДЫ Чекпоинта для ${userId}?`, async (ok) => {
                    if (ok) {
                        const result = await makeApiRequest('/api/v1/admin/users/clear-checkpoint-stars', { user_id: userId });
                        tg.showAlert(result.message);
                        form.reset();
                    }
                });
            });
        }
      
        if(dom.modalCloseBtn) dom.modalCloseBtn.addEventListener('click', () => dom.submissionsModal.classList.add('hidden'));
        if(dom.submissionsModal) dom.submissionsModal.addEventListener('click', (e) => { if (e.target === dom.submissionsModal) dom.submissionsModal.classList.add('hidden'); });

        if(dom.genericPromptCancel) dom.genericPromptCancel.addEventListener('click', hideGenericPrompt);
        if(dom.genericPromptOverlay) dom.genericPromptOverlay.addEventListener('click', (e) => { if (e.target === dom.genericPromptOverlay) hideGenericPrompt(); });
        if(dom.genericPromptConfirm) {
            dom.genericPromptConfirm.addEventListener('click', async () => {
                const newName = dom.genericPromptInput.value.trim();
                if (!newName || !currentEditingCategoryId) return;
                await makeApiRequest('/api/v1/admin/categories/update', {
                    category_id: parseInt(currentEditingCategoryId),
                    name: newName
                });
                hideGenericPrompt();
                await switchView('view-admin-categories');
            });
        }
        
        if(dom.createRoulettePrizeForm) {
            dom.createRoulettePrizeForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                const data = {
                    reward_title: form.elements['reward_title'].value,
                    skin_name: form.elements['skin_name'].value,
                    image_url: form.elements['image_url'].value,
                    chance_weight: parseInt(form.elements['chance_weight'].value),
                };

                await makeApiRequest('/api/v1/admin/roulette/create', data);
                tg.showAlert('Приз добавлен!');
                form.reset();
                form.elements['skin_name'].focus();
                
                const prizes = await makeApiRequest('/api/v1/admin/roulette/prizes', {}, 'POST', true);
                renderRoulettePrizes(prizes);
            });
        }
        
        if(dom.roulettePrizesList) {
            dom.roulettePrizesList.addEventListener('click', async (e) => {
                const deleteBtn = e.target.closest('.delete-roulette-prize-btn');
                if (deleteBtn) {
                    const prizeId = parseInt(deleteBtn.dataset.id);
                    tg.showConfirm('Удалить этот приз?', async (ok) => {
                        if (ok) {
                            await makeApiRequest('/api/v1/admin/roulette/delete', { prize_id: prizeId });
                            const prizes = await makeApiRequest('/api/v1/admin/roulette/prizes', {}, 'POST', true);
                            renderRoulettePrizes(prizes);
                        }
                    });
                }
            });
        }
    }

    async function main() {
        try {
            tg.expand();
            if (!tg.initData) throw new Error("Требуется авторизация в Telegram.");
            
            showLoader();
            const [userData, sleepStatus] = await Promise.all([
                makeApiRequest("/api/v1/user/me", {}, 'POST', true),
                makeApiRequest("/api/v1/admin/sleep_mode_status", {}, 'POST', true)
            ]);
            
            if (!userData.is_admin) throw new Error("Доступ запрещен.");
            
            document.body.dataset.isAdmin = 'true';
            updateSleepButton(sleepStatus);

            await switchView('view-admin-main');
        } catch (e) {
            document.body.dataset.isAdmin = 'false';
            if(dom.sleepModeToggle) dom.sleepModeToggle.classList.add('hidden');
            if(dom.appContainer) dom.appContainer.innerHTML = `<div style="padding:20px; text-align:center;"><h1>${e.message}</h1><p>Убедитесь, что вы являетесь администратором.</p></div>`;
        } finally {
            hideLoader();
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        tg.ready();
        setupEventListeners();
        main();
    });
} catch (e) {
    console.error(`Критическая ошибка на старте: ${e.message}`);
    alert(`Критическая ошибка: ${e.message}`);
}

