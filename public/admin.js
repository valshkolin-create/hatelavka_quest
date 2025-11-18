// admin.js

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
        // --- Админ search ---  
        grantCheckpointStarsForm: document.getElementById('grant-checkpoint-stars-form'),
        grantCpUserName: document.getElementById('grant-cp-user-name'),
        openGrantCpSearchBtn: document.getElementById('open-grant-cp-search'),
        grantTicketsForm: document.getElementById('grant-tickets-form'),
        grantTicketsUserName: document.getElementById('grant-tickets-user-name'),
        openGrantTicketsSearchBtn: document.getElementById('open-grant-tickets-search'),
        freezeCpUserName: document.getElementById('freeze-cp-user-name'),
        openFreezeCpSearchBtn: document.getElementById('open-freeze-cp-search'),
        freezeTicketsUserName: document.getElementById('freeze-tickets-user-name'),
        openFreezeTicketsSearchBtn: document.getElementById('open-freeze-tickets-search'),
        // --- Завершение Админ search ---
        // Заморозка
        freezeCheckpointStarsForm: document.getElementById('freeze-checkpoint-stars-form'),
        freezeCpUserName: document.getElementById('freeze-cp-user-name'), // Новое
        openFreezeCpSearchBtn: document.getElementById('open-freeze-cp-search'), // Новое
        freezeTicketsForm: document.getElementById('freeze-tickets-form'),
        freezeTicketsUserName: document.getElementById('freeze-tickets-user-name'), // Новое
        openFreezeTicketsSearchBtn: document.getElementById('open-freeze-tickets-search'), // Новое
        // Очистка (новые элементы)
        resetCheckpointProgressForm: document.getElementById('reset-checkpoint-progress-form'),
        resetCpProgressUserName: document.getElementById('reset-cp-progress-user-name'), // Новое
        openResetCpProgressSearchBtn: document.getElementById('open-reset-cp-progress-search'), // Новое
        clearCheckpointStarsForm: document.getElementById('clear-checkpoint-stars-form'),
        clearCpStarsUserName: document.getElementById('clear-cp-stars-user-name'), // Новое
        openClearCpStarsSearchBtn: document.getElementById('open-clear-cp-stars-search'), // Новое
        // --- Завершение Админ search ---
        settingMenuBannerUrl: document.getElementById('setting-menu-banner-url'),
        settingCheckpointBannerUrl: document.getElementById('setting-checkpoint-banner-url'),
        settingAuctionBannerUrl: document.getElementById('setting-auction-banner-url'), // <-- 1. ДОБАВИТЬ ЭТУ СТРОКУ
        settingAuctionBannerUrl: document.getElementById('setting-auction-banner-url'), // <-- 1. ДОБАВИТЬ ЭТУ СТРОКУ
        settingWeeklyGoalsBannerUrl: document.getElementById('setting-weekly-goals-banner-url'), // <-- 🔽 ДОБАВИТЬ ЭТУ СТРОКУ
        saveSettingsBtn: document.getElementById('save-settings-btn'),
        settingQuestsEnabled: document.getElementById('setting-quests-enabled'),
        settingChallengesEnabled: document.getElementById('setting-challenges-enabled'),
        settingQuestRewardsEnabled: document.getElementById('setting-quest-rewards-enabled'),
        settingChallengeRewardsEnabled: document.getElementById('setting-challenge-rewards-enabled'),
        resetAllQuestsBtn: document.getElementById('reset-all-quests-btn'),
        resetAllCheckpointProgressBtn: document.getElementById('reset-all-checkpoint-progress-btn'),
        clearAllCheckpointStarsBtn: document.getElementById('clear-all-checkpoint-stars-btn'),
        settingCheckpointEnabled: document.getElementById('setting-checkpoint-enabled'),
        adminGrantLogList: document.getElementById('admin-grant-log-list'),
        // --- НОВЫЙ КОД ---       
        settingSkinRaceEnabled: document.getElementById('setting-skin-race-enabled'),
        // --- НОВЫЕ ЭЛЕМЕНТЫ ДЛЯ ПОИСКА ПОЛЬЗОВАТЕЛЯ ---
        // --- ↓↓↓ АУКЦИОН ↓↓↓ ---
        settingAuctionEnabled: document.getElementById('setting-auction-enabled'),
        // --- ↑↑↑ АУКЦИОН ↑↑↑ ---
        adminUserSearchModal: document.getElementById('admin-user-search-modal'),
        adminUserSearchTitle: document.getElementById('admin-user-search-title'),
        adminUserSearchInput: document.getElementById('admin-user-search-input'),
        adminUserSearchResults: document.getElementById('admin-user-search-results'),
        // --- КОНЕЦ НОВОГО КОДА ---
        // --- НОВЫЕ ЭЛЕМЕНТЫ ДЛЯ ВЫПОЛНЕНИЯ ---
        openForceCompleteSearchBtn: document.getElementById('open-force-complete-search'),
        adminEntitySelectModal: document.getElementById('admin-entity-select-modal'),
        adminEntitySelectTitle: document.getElementById('admin-entity-select-title'),
        adminEntityListQuest: document.getElementById('admin-entity-list-quest'),
        adminEntityListChallenge: document.getElementById('admin-entity-list-challenge'),
        // --- КОНЕЦ НОВОГО КОДА ---
        statisticsContent: document.getElementById('statistics-content'),
        sliderOrderManager: document.getElementById('slider-order-manager'),
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
        saveOrderButton: document.getElementById('save-order-button'),
        // --- ↓↓↓ НОВЫЙ КОД ↓↓↓ ---
        viewAdminAuctions: document.getElementById('view-admin-auctions'),
        createAuctionForm: document.getElementById('create-auction-form'),
        adminAuctionsList: document.getElementById('admin-auctions-list'),
        // --- ↑↑↑ КОНЕЦ НОВОГО КОДА ↑↑↑
        settingWeeklyGoalsEnabled: document.getElementById('setting-weekly-goals-enabled'),
        // Элементы "Недельного Забега"
        weeklyGoalsSettingsForm: document.getElementById('weekly-goals-settings-form'),
        weeklyGoalSuperPrizeType: document.getElementById('weekly-goal-super-prize-type'),
        weeklyGoalSuperPrizeValueWrapper: document.getElementById('weekly-goal-super-prize-value-wrapper'),
        
        weeklyGoalsCreateTaskForm: document.getElementById('weekly-goals-create-task-form'),
        weeklyGoalTaskRewardType: document.getElementById('weekly-goal-task-reward-type'),
        weeklyGoalTaskRewardValueWrapper: document.getElementById('weekly-goal-task-reward-value-wrapper'),
        
        weeklyGoalsList: document.getElementById('weekly-goals-list'),
        // --- 🔼 КОНЕЦ НОВОГО БЛОКА 🔼 ---
        // (v3) Элементы для "Выборщика"
        weeklyGoalTaskTypeSelect: document.getElementById('weekly-goal-task-type'),
        weeklyGoalEntityPickerWrapper: document.getElementById('weekly-goal-entity-picker-wrapper'),
        weeklyGoalEntityPickerLabel: document.getElementById('weekly-goal-entity-picker-label'),
        weeklyGoalEntityDisplay: document.getElementById('weekly-goal-entity-display'),
        weeklyGoalSelectEntityBtn: document.getElementById('weekly-goal-select-entity-btn'),
        weeklyGoalCancelEditBtn: document.getElementById('weekly-goal-cancel-edit-btn'),
        weeklyGoalTargetEntityId: document.getElementById('weekly-goal-target-entity-id'),
        weeklyGoalTargetEntityName: document.getElementById('weekly-goal-target-entity-name'),
        
        // (v3) Модальное окно "Выборщика"
        weeklyGoalEntitySelectModal: document.getElementById('weekly-goal-entity-select-modal'),
        weeklyGoalEntitySelectTitle: document.getElementById('weekly-goal-entity-select-title'),
        weeklyGoalEntitySelectList: document.getElementById('weekly-goal-entity-select-list'),
        // --- 🔼 КОНЕЦ НОВОГО БЛОКА 🔼 ---
        adminClearAllWeeklyProgressBtn: document.getElementById('admin-clear-all-weekly-progress-btn'),
        // --- 🔽 НОВЫЙ КОД 🔽 ---
        // --- 🔽 ДОБАВЬ ЭТУ СТРОКУ 🔽 ---
        saveWeeklySettingsBtn: document.getElementById('save-weekly-settings-btn'),
        // --- 🔼 КОНЕЦ ДОБАВЛЕНИЯ 🔼 ---
        adminResetUserWeeklyProgressForm: document.getElementById('admin-reset-user-weekly-progress-form'),
        adminResetUserWeeklyProgressUserName: document.getElementById('admin-reset-user-weekly-progress-user-name'),
        adminResetUserWeeklyProgressSearchBtn: document.getElementById('admin-reset-user-weekly-progress-search-btn'),
        // --- 🔼 КОНЕЦ НОВОГО КОДА 🔼 ---
        // --- 🔽 ДОБАВЬ ЭТИ ДВЕ СТРОКИ 🔽 ---
        adminCreateGoalModal: document.getElementById('admin-create-goal-modal'),
        openCreateGoalModalBtn: document.getElementById('open-create-goal-modal-btn'),
        // --- 🔼 КОНЕЦ ДОБАВЛЕНИЯ 🔼 ---
        viewAdminSchedule: document.getElementById('view-admin-schedule'),
        questScheduleForm: document.getElementById('quest-schedule-form'),
        settingQuestScheduleOverride: document.getElementById('setting-quest-schedule-override'),
        settingQuestScheduleWrapper: document.getElementById('setting-quest-schedule-type-wrapper'),
        settingQuestScheduleType: document.getElementById('setting-quest-schedule-type'),
        // --- 🔽 ВОТ СЮДА ДОБАВЬ НОВУЮ СТРОКУ 🔽 ---
        saveScheduleBtn: document.getElementById('save-schedule-btn')
        // --- 🔼 КОНЕЦ ДОБАВЛЕНИЯ 🔼 ---
        
    };

    let categoriesCache = [];
    let adminQuestsCache = []; // Кэш для "Ручных заданий" (Q1)
    let adminTwitchRewardsCache = []; // Кэш для "Twitch Наград" (Q3)
    let currentEditingCategoryId = null;
    let hasAdminAccess = false; // Станет true после ввода пароля 6971
    const ADMIN_PASSWORD = '6971'; // Пароль для админ-функций
    let currentCauldronData = {};
    // --- 🔽 ДОБАВЬТЕ ЭТОТ ОБЪЕКТ 🔽 ---
    const CONDITION_TO_COLUMN = {
        // Twitch
        "twitch_messages_session": "daily_message_count",
        "twitch_messages_week": "weekly_message_count",
        "twitch_messages_month": "monthly_message_count",
        "twitch_uptime_session": "daily_uptime_minutes",
        "twitch_uptime_week": "weekly_uptime_minutes",
        "twitch_uptime_month": "monthly_uptime_minutes",
        // Telegram (на всякий случай)
        "telegram_messages_session": "telegram_daily_message_count",
        "telegram_messages_week": "telegram_weekly_message_count",
        "telegram_messages_month": "telegram_monthly_message_count",
    };
    // --- 🔼 КОНЕЦ ОБЪЕКТА 🔼 ---
    let orderChanged = false;
    // --- НОВЫЕ ПЕРЕМЕННЫЕ ДЛЯ ПОИСКА ---
    let adminUserSearchDebounceTimer; // Таймер для задержки поиска
    let onAdminUserSelectCallback = null; // Функция, которая вызовется после выбора юзера
    let selectedAdminUser = null; // Хранит {id, name} выбранного юзера
    let afterPasswordCallback = null; // Функция для выполнения после ввода пароля 6971
    // --- КОНЕЦ НОВЫХ ПЕРЕМЕННЫХ ---

    function escapeHTML(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, match => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'})[match]);
    }
    /**
     * Открывает модальное окно для поиска и выбора пользователя.
     * @param {string} title - Заголовок модального окна (н.п., "Выдать билеты: ...")
     * @param {function} onSelectCallback - Функция, которая будет вызвана с объектом {id, name}
     * выбранного пользователя.
     */
    function openAdminUserSearchModal(title, onSelectCallback) {
        dom.adminUserSearchTitle.textContent = title;
        onAdminUserSelectCallback = onSelectCallback; // Сохраняем коллбэк
        dom.adminUserSearchInput.value = ''; // Очищаем инпут
        dom.adminUserSearchResults.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Начните вводить для поиска...</p>';
        dom.adminUserSearchModal.classList.remove('hidden');
        dom.adminUserSearchInput.focus();
    }

    /**
     * Рендерит список пользователей в модалке поиска
     * @param {Array} users - Массив пользователей от API
     */
    function renderAdminSearchResults(users) {
        if (!users || users.length === 0) {
            dom.adminUserSearchResults.innerHTML = '<p style="text-align: center;">Пользователи не найдены.</p>';
            return;
        }

        // Рендерим список
        dom.adminUserSearchResults.innerHTML = users.map(user => `
            <div class="submission-item" 
                 data-user-id="${user.telegram_id}" 
                 data-user-name="${escapeHTML(user.full_name || 'Без имени')}"
                 style="cursor: pointer; padding: 12px 5px;">
                <p style="margin: 0; font-weight: 500;">
                    ${escapeHTML(user.full_name || 'Без имени')}
                </p>
                <p style="margin: 4px 0 0; font-size: 12px; color: var(--text-color-muted);">
                    ID: ${user.telegram_id} | Twitch: ${escapeHTML(user.twitch_login || 'не привязан')}
                </p>
            </div>
        `).join('');
    }

    // --- Новые функции для "Котла" ---

// 👇 НАЧАЛО НОВОГО КОДА ДЛЯ ШАГА 1
    // Функция для определения текущего уровня наград (скопирована из halloween.js для консистентности)
function getCurrentLevel(eventData) {
        const { goals = {}, current_progress = 0 } = eventData;
        if (goals.level_3 > 0 && current_progress >= goals.level_3) return 4;
        if (goals.level_2 > 0 && current_progress >= goals.level_2) return 3;
        if (goals.level_1 > 0 && current_progress >= goals.level_1) return 2;
        return 1;
    }
    // 👆 КОНЕЦ НОВОГО КОДА ДЛЯ ШАГА 1

    // Создает HTML-строку для награды из топ-20
    function createTopRewardRow(reward = { place: '', name: '', image_url: '' }) {
        const wrapper = document.createElement('div');
        wrapper.className = 'top-reward-row admin-form';
        wrapper.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 10px; margin-bottom: 10px;';
        wrapper.innerHTML = `
            <input type="number" class="reward-place" placeholder="Место" value="${escapeHTML(reward.place)}" min="1" max="20" style="flex: 0 0 70px;">
            <input type="text" class="reward-name" placeholder="Название предмета" value="${escapeHTML(reward.name)}" style="flex: 1 1 auto;">
            <input type="text" class="reward-image" placeholder="URL изображения" value="${escapeHTML(reward.image_url)}" style="flex: 1 1 auto;">
            <button type="button" class="admin-action-btn reject remove-reward-btn" style="flex: 0 0 40px; padding: 8px;"><i class="fa-solid fa-trash-can"></i></button>
        `;
        return wrapper;
    }

    // Собирает все данные из формы "Котла" в один объект
function collectCauldronData() {
        const form = dom.cauldronSettingsForm;
        const content = {
            title: form.elements['title'].value,
            is_visible_to_users: form.elements['is_visible_to_users'].checked,
            goals: {
                level_1: parseInt(form.elements['goal_level_1'].value, 10) || 0,
                level_2: parseInt(form.elements['goal_level_2'].value, 10) || 0,
                level_3: parseInt(form.elements['goal_level_3'].value, 10) || 0,
                level_4: parseInt(form.elements['goal_level_4'].value, 10) || 0,
            },
            banner_image_url: form.elements['banner_image_url'].value,
            cauldron_image_url_1: form.elements['cauldron_image_url_1'].value,
            cauldron_image_url_2: form.elements['cauldron_image_url_2'].value,
            cauldron_image_url_3: form.elements['cauldron_image_url_3'].value,
            cauldron_image_url_4: form.elements['cauldron_image_url_4'].value,
            levels: {}
        };

        [1, 2, 3, 4].forEach(level => {
            const levelKey = `level_${level}`;
            content.levels[levelKey] = {
                top_places: [],
                default_reward: {
                    name: form.elements[`default_reward_name_${level}`].value,
                    image_url: form.elements[`default_reward_image_url_${level}`].value
                }
            };
            const container = document.getElementById(`top-rewards-container-${level}`);
            container.querySelectorAll('.top-reward-row').forEach(row => {
                const place = parseInt(row.querySelector('.reward-place').value, 10);
                const name = row.querySelector('.reward-name').value.trim();
                const image_url = row.querySelector('.reward-image').value.trim();
                if (place >= 1 && place <= 20 && name) {
                    content.levels[levelKey].top_places.push({ place, name, image_url });
                }
            });
        });

        return content;
    }

    // Загружает и отображает список участников
async function renderCauldronParticipants() {
        const container = document.getElementById('cauldron-distribution-list');
        if (!container) return;
        container.innerHTML = '<p style="text-align: center;">Загрузка участников...</p>';
        try {
            const participants = await makeApiRequest('/api/v1/admin/events/cauldron/participants', {}, 'POST', true);
            if (!participants || participants.length === 0) {
                container.innerHTML = '<p style="text-align: center;">Участников пока нет.</p>';
                return;
            }

            // --- НАЧАЛО ИЗМЕНЕНИЙ ---
            // Стабильная сортировка, чтобы избежать расхождений с клиентской частью
            participants.sort((a, b) => {
                const contributionDiff = (b.total_contribution || 0) - (a.total_contribution || 0);
                if (contributionDiff !== 0) {
                    return contributionDiff;
                }
                // Если вклады одинаковые, сортируем по имени для стабильности
                const nameA = a.full_name || '';
                const nameB = b.full_name || '';
                return nameA.localeCompare(nameB);
            });
            // Определяем, какой уровень наград сейчас активен
            let activeRewardLevel = null;
            if (currentCauldronData && currentCauldronData.levels) {
                const currentLevel = getCurrentLevel(currentCauldronData); // Используем функцию для определения текущего уровня
                activeRewardLevel = currentCauldronData.levels[`level_${currentLevel}`];
            }
            // --- КОНЕЦ ИЗМЕНЕНИЙ ---

            container.innerHTML = `
                <div class="distribution-header"><span>#</span><span>Участник</span><span>Вклад</span><span>Приз</span><span>Трейд</span></div>
                ${participants.map((p, index) => {
                    const place = index + 1;
                    let prize = null;

                    // --- НАЧАЛО ИЗМЕНЕНИЙ ---
                    if (activeRewardLevel) {
                        // Сначала ищем награду в топе (для мест с 1 по 20)
                        prize = activeRewardLevel.top_places?.find(r => r.place === place);

                        // Если для этого места нет награды в топе, назначаем награду по умолчанию
                        if (!prize) {
                            prize = activeRewardLevel.default_reward;
                        }
                    }
                    // --- КОНЕЦ ИЗМЕНЕНИЙ ---

                    const prizeHtml = prize && prize.name
                        ? `<div class="dist-prize">
                               <img src="${escapeHTML(prize.image_url || '')}" alt="Prize">
                               <span>${escapeHTML(prize.name)}</span>
                           </div>`
                        : '<span class="no-prize">Нет</span>';

                    return `
                        <div class="distribution-row">
                            <span class="dist-place">${place}</span>
                            <span class="dist-name">${escapeHTML(p.full_name || 'Без имени')}</span>
                            <span class="dist-amount">${p.total_contribution}</span>
                            ${prizeHtml}
                            <span class="dist-link">${p.trade_link ? `<a href="${escapeHTML(p.trade_link)}" target="_blank">Открыть</a>` : '<span class="no-link">Нет</span>'}</span>
                        </div>`;
                }).join('')}`;
        } catch (e) {
            container.innerHTML = `<p class="error-message">Не удалось загрузить: ${e.message}</p>`;
        }
    }
    // --- Конец новых функций для "Котла" ---

async function loadStatistics() {
        showLoader();
        try {
            // Запрашиваем только данные о складе
            const stats = await makeApiRequest("/api/v1/admin/stats", {}, 'POST', true);

            // Очищаем старую статистику
            dom.statisticsContent.innerHTML = '';

            // Отображаем новую статистику склада
            const totalStock = stats.total_skin_stock !== undefined ? stats.total_skin_stock : 0;

            dom.statisticsContent.innerHTML = `
                <h2 style="font-size: 20px; margin-bottom: 15px;">Склад Рулеток 📦</h2>
                <div class="stats-grid">
                    <div class="stat-card">
                         <div class="stat-card-header">
                            <h4>Всего скинов в наличии</h4>
                            <div class="tooltip">?<span class="tooltip-text">Общее количество всех скинов, доступных для выпадения во всех рулетках.</span></div>
                        </div>
                        <p id="stat-total-stock">${totalStock}</p>
                    </div>
                     <div class="stat-card">
                         <div class="stat-card-header">
                            <h4>Примерная стоимость</h4>
                            <div class="tooltip">?<span class="tooltip-text">Скоро... Ориентировочная суммарная стоимость всех скинов на складе.</span></div>
                        </div>
                        <p>Скоро...</p>
                    </div>
                </div>
            `;

        } catch (e) {
            dom.statisticsContent.innerHTML = `<p class="error-message" style="text-align: center;">Не удалось загрузить статистику склада: ${e.message}</p>`;
        } finally {
            hideLoader();
        }
    }

const showLoader = () => {
        // Добавляем проверку перед доступом к classList
        if (dom.loaderOverlay && dom.loaderOverlay.classList) {
            dom.loaderOverlay.classList.remove('hidden');
        } else {
            console.warn("[showLoader] Элемент dom.loaderOverlay не найден или не имеет classList!");
        }
    };
    const hideLoader = () => {
        // Добавляем проверку перед доступом к classList
        if (dom.loaderOverlay && dom.loaderOverlay.classList) {
            dom.loaderOverlay.classList.add('hidden');
        } else {
            console.warn("[hideLoader] Элемент dom.loaderOverlay не найден или не имеет classList!");
        }
    };

    const switchView = async (targetViewId) => {
        console.log(`[switchView] Начинаем для targetViewId = ${targetViewId}`); // Лог входа

        // --- Логика скрытия кнопок сохранения при смене вида ---
        if (orderChanged) {
             console.log("[switchView] Обнаружены несохраненные изменения порядка квестов.");
        }
        if (dom.saveOrderButton) {
            dom.saveOrderButton.classList.add('hidden');
        } else {
             console.warn("[switchView] Элемент dom.saveOrderButton не найден!");
        }
        orderChanged = false; 
        
        console.log("[switchView] Начинаем скрывать все view...");
        try {
            dom.views.forEach((view, index) => {
                if (view && view.classList) { // Проверка перед доступом
                    // console.log(`[switchView] Скрываем view #${index}, ID: ${view.id}`); // Раскомментируй для детального лога
                    view.classList.add('hidden');
                } else {
                    // Эта ошибка критична, если произойдет
                    console.error(`[switchView] ОШИБКА: Не удалось скрыть view #${index}. Элемент или classList отсутствует. View:`, view);
                }
            });
        } catch(e) {
             console.error("[switchView] ИСКЛЮЧЕНИЕ при скрытии views:", e); // Ловим возможные исключения
        }
        console.log("[switchView] Все views скрыты.");


        const targetView = document.getElementById(targetViewId);
        console.log(`[switchView] Найден элемент для ID ${targetViewId}:`, targetView ? 'Да' : 'Нет'); // Лог найден ли элемент

        if (targetView && targetView.classList) { // Проверка перед доступом
            console.log(`[switchView] Показываем view ${targetViewId}...`);
            targetView.classList.remove('hidden');
            console.log(`[switchView] View ${targetViewId} показан.`);
        } else {
             // Эта ошибка критична
             console.error(`[switchView] ОШИБКА: Элемент targetView не найден или не имеет classList для ID ${targetViewId}!`);
             // Можно добавить return или throw, если без этого элемента продолжать нельзя
        }

        // --- Безопасная проверка для sleepModeToggle ---
        console.log("[switchView] Проверяем dom.sleepModeToggle...");
        if (dom.sleepModeToggle) {
            console.log("[switchView] dom.sleepModeToggle найден.");
            const isAdmin = document.body.dataset.isAdmin === 'true';
            if (dom.sleepModeToggle.classList) {
                 console.log("[switchView] dom.sleepModeToggle имеет classList, переключаем видимость...");
                 dom.sleepModeToggle.classList.toggle('hidden', targetViewId !== 'view-admin-main' || !isAdmin);
                 console.log("[switchView] Видимость dom.sleepModeToggle переключена.");
            } else {
                console.warn("[switchView] dom.sleepModeToggle найден, но classList отсутствует?");
            }
        } else {
             console.warn("[switchView] Элемент dom.sleepModeToggle не найден при переключении видимости!");
        }
        // --- Конец проверки ---

        console.log("[switchView] Показываем loader...");
        showLoader(); // Уже безопасно
        console.log("[switchView] Loader показан.");

        try {
            console.log(`[switchView] Входим в switch-блок для ${targetViewId}...`);
            // --- Блок switch остается без изменений ---
            switch (targetViewId) {
                case 'view-admin-quests': {
                    const allQuests = await makeApiRequest('/api/v1/admin/quests/all', {}, 'POST', true);
                    await fetchAndCacheCategories(true);
                    renderQuests(allQuests, categoriesCache);
                    break;
                }
                case 'view-admin-pending-actions': {
                    // Просто вызываем нашу новую функцию
                    await loadPendingActions();
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

                    // Заполняем основные настройки
                    form.elements['is_visible_to_users'].checked = currentCauldronData.is_visible_to_users || false;
                    form.elements['title'].value = currentCauldronData.title || '';
                    form.elements['banner_image_url'].value = currentCauldronData.banner_image_url || '';
                    form.elements['cauldron_image_url_1'].value = currentCauldronData.cauldron_image_url_1 || '';
                    form.elements['cauldron_image_url_2'].value = currentCauldronData.cauldron_image_url_2 || '';
                    form.elements['cauldron_image_url_3'].value = currentCauldronData.cauldron_image_url_3 || '';
                    form.elements['cauldron_image_url_4'].value = currentCauldronData.cauldron_image_url_4 || '';

                    const goals = currentCauldronData.goals || {};
                    form.elements['goal_level_1'].value = goals.level_1 || '';
                    form.elements['goal_level_2'].value = goals.level_2 || '';
                    form.elements['goal_level_3'].value = goals.level_3 || '';
                    form.elements['goal_level_4'].value = goals.level_4 || '';

                    // Заполняем награды для каждого уровня
                    const levels = currentCauldronData.levels || {};
                    [1, 2, 3, 4].forEach(level => {
                        const levelData = levels[`level_${level}`] || {};
                        const topPlaces = levelData.top_places || [];
                        const defaultReward = levelData.default_reward || {};

                        const container = document.getElementById(`top-rewards-container-${level}`);
                        if (container) { // Добавлена проверка на существование container
                           container.innerHTML = ''; // Очищаем перед заполнением
                           topPlaces.sort((a,b) => a.place - b.place).forEach(reward => {
                               container.appendChild(createTopRewardRow(reward));
                           });
                        } else {
                            console.warn(`[switchView] Контейнер top-rewards-container-${level} не найден!`);
                        }


                        // Добавляем проверки для элементов формы
                        const nameInput = form.elements[`default_reward_name_${level}`];
                        const imageInput = form.elements[`default_reward_image_url_${level}`];

                        if (nameInput) {
                            nameInput.value = defaultReward.name || '';
                        } else {
                             console.warn(`[switchView] Элемент default_reward_name_${level} не найден в форме!`);
                        }
                        if (imageInput) {
                            imageInput.value = defaultReward.image_url || '';
                        } else {
                             console.warn(`[switchView] Элемент default_reward_image_url_${level} не найден в форме!`);
                        }
                    });
                    break;
                }
                 case 'view-admin-main': {
                   console.log("[switchView] Выполнен case 'view-admin-main'."); // Лог выполнения case
                   break; // Этот case остается пустым
                }
                 // --- ДОБАВЬ ЭТОТ CASE ---
                 case 'view-admin-user-management': {
                    console.log("[switchView] Выполнен case 'view-admin-user-management'.");
                    // Сбрасываем видимость скрытых форм при переходе
                    [
                        dom.grantCheckpointStarsForm, dom.grantTicketsForm,
                        dom.freezeCheckpointStarsForm, dom.freezeTicketsForm,
                        dom.resetCheckpointProgressForm, dom.clearCheckpointStarsForm,
                        dom.adminResetUserWeeklyProgressForm // <-- 🔽 ДОБАВЬТЕ ЭТУ СТРОКУ 🔽
                    ].forEach(form => form?.classList.add('hidden'));
                    selectedAdminUser = null; // Сбрасываем выбранного юзера
                    
                    // --- 👇 ДОБАВЬТЕ ЭТУ СТРОКУ 👇 ---
                    loadAdminGrantLog(); 
                    // --- 👆 КОНЕЦ ДОБАВЛЕНИЯ 👆 ---

                    break;
                }
                // --- КОНЕЦ ДОБАВЛЕНИЯ ---
                 case 'view-admin-auctions': {
                await loadAdminAuctions();
                break;
            }
                // --- 🔽 ВОТ СЮДА ВСТАВЬ НОВЫЙ БЛОК 🔽 ---
                case 'view-admin-weekly-goals': {
                    // (Отступ 16 пробелов)
                    // Мы напишем эту функцию в следующем шаге
                    await loadWeeklyGoalsData(); 
                    break;
                }
                 // --- 🔽 ДОБАВЬ ЭТОТ БЛОК 🔽 ---
                case 'view-admin-schedule': {
                    await loadScheduleSettings();
                    break;
                }
            // --- 🔼 КОНЕЦ 🔼 ---
                    
                    
                // --- ДОБАВЬТЕ ЭТОТ БЛОК ---
                default: {
                    console.warn(`[switchView] Неизвестный targetViewId в switch-блоке: ${targetViewId}`);
                    break;
                }
                // --- КОНЕЦ БЛОКА ---
            }
            console.log(`[switchView] Выход из switch-блока для ${targetViewId}.`);
        } catch (e) {
            console.error(`[switchView] ИСКЛЮЧЕНИЕ внутри switch-блока для ${targetViewId}:`, e);
             // Убедимся, что loader скрывается даже при ошибке в switch
             hideLoader(); // Уже безопасно
             throw e; // Перебрасываем ошибку дальше, чтобы увидеть ее в main()
        } finally {
            console.log("[switchView] Входим в finally, скрываем loader...");
            hideLoader(); // Уже безопасно
            console.log("[switchView] Loader скрыт в finally.");
        }
        console.log(`[switchView] Завершаем для targetViewId = ${targetViewId}`); // Лог выхода
    };
async function makeApiRequest(url, body = {}, method = 'POST', isSilent = false) {
        if (!isSilent) showLoader();

        try {
            const options = {
                method: method,
                headers: { 'Content-Type': 'application/json' },
            };

            if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
                options.body = JSON.stringify({ ...body, initData: tg.initData });
                // --- >>> ДОБАВЬ ЭТУ СТРОКУ ЛОГИРОВАНИЯ <<< ---
                console.log(`Sending body to ${url}:`, options.body);
                // --- >>> КОНЕЦ ДОБАВЛЕНИЯ <<< ---
            }

            const response = await fetch(url, options);

            // ... (остальная часть функции без изменений) ...
             if (response.status === 204) {
                return null;
            }

            // --- НАЧАЛО ИЗМЕНЕНИЙ В ОБРАБОТКЕ ОТВЕТА ---
            let result;
            try {
                result = await response.json(); // Пытаемся распарсить JSON
            } catch (jsonError) {
                // Если не JSON, читаем как текст (на случай HTML-ошибки или простой строки)
                const textResponse = await response.text();
                console.error("Non-JSON response received:", textResponse);
                 // Если ответ не был успешным (не 2xx), бросаем ошибку с текстом ответа
                if (!response.ok) {
                    throw new Error(`Ошибка ${response.status}: ${textResponse || 'Не удалось получить детали ошибки'}`);
                }
                 // Если ответ успешный, но не JSON (маловероятно для FastAPI), возвращаем текст
                return textResponse;
            }
            // --- КОНЕЦ ИЗМЕНЕНИЙ В ОБРАБОТКЕ ОТВЕТА ---
            if (!response.ok) {
                // --- УЛУЧШЕННАЯ ОБРАБОТКА ОШИБОК FastAPI ---
                let detailMessage = 'Неизвестная ошибка сервера';
                if (result && result.detail) {
                    if (Array.isArray(result.detail)) {
                         try {
                            // Собираем сообщения для каждого невалидного поля
                            detailMessage = result.detail.map(err => {
                                const field = err.loc && Array.isArray(err.loc) ? err.loc.join(' -> ') : 'поле'; // Добавлена проверка на массив err.loc
                                return `${field}: ${err.msg}`;
                            }).join('; ');
                         } catch (parseError) {
                             console.error("Error parsing FastAPI detail array:", parseError);
                            detailMessage = JSON.stringify(result.detail); // Если структура не та, показываем как есть
                         }
                    } else if (typeof result.detail === 'string') {
                        detailMessage = result.detail; // Если просто строка
                    } else {
                         // Если detail не строка и не массив, пытаемся превратить в строку
                         detailMessage = JSON.stringify(result.detail);
                    }
                } else if (typeof result === 'string') {
                    detailMessage = result; // Если сам ответ - строка
                } else if (result && typeof result === 'object') {
                    // Если detail нет, но есть другие поля, показываем их
                    detailMessage = JSON.stringify(result);
                }
                 // Формируем сообщение для пользователя
                const userErrorMessage = `Ошибка ${response.status}: ${detailMessage}`;
                console.error("API Error Response:", result); // Логируем полный ответ для отладки
                throw new Error(userErrorMessage); // Бросаем ошибку с детальным сообщением
                 // --- КОНЕЦ УЛУЧШЕННОЙ ОБРАБОТКИ ---
            }
            return result;
        } catch (e) {
            // Теперь e.message должно быть строкой
            const errorMessage = e instanceof Error ? e.message : 'Произошла неизвестная ошибка';
            if (!isSilent) tg.showAlert(errorMessage);
            console.error(`Ошибка в makeApiRequest для ${url}:`, e); // Логируем исходную ошибку
            throw e; // Перебрасываем ошибку дальше
        } finally {
            if (!isSilent) hideLoader();
        }
    }

// --- НОВАЯ ФУНКЦИЯ ДЛЯ РЕНДЕРИНГА СЕТКИ ИКОНОК ---
    function renderGroupedItemsGrid(containerId, groupedData) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Контейнер ${containerId} не найден!`);
            return;
        }
        const grid = container.querySelector('.pending-actions-grid');
        if (!grid) {
            console.error(`Внутренний grid в ${containerId} не найден!`);
            container.innerHTML = '<p class="error-message">Ошибка отображения: не найден grid.</p>'; // Сообщаем об ошибке
            return;
        }

        grid.innerHTML = ''; // Очищаем только grid

        if (!groupedData || groupedData.length === 0) {
            grid.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Здесь пока пусто.</p>';
            return;
        }

        groupedData.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'admin-icon-button'; // Используем существующий класс

            // Добавляем data-атрибуты
            if (item.quest_id) { // Это заявка на квест
                itemDiv.dataset.type = 'submission';
                itemDiv.dataset.questId = item.quest_id;
                itemDiv.dataset.title = item.quest_title || 'Задание'; // Сохраняем заголовок для модалки
            } else { // Это приз (розыгрыш или чекпоинт)
                itemDiv.dataset.type = item.type; // 'event_prizes' или 'checkpoint_prizes'
                itemDiv.dataset.title = item.title || 'Призы'; // Сохраняем заголовок
            }

            // Иконка: URL или FontAwesome класс
            const iconHtml = item.quest_icon_url
                ? `<img src="${escapeHTML(item.quest_icon_url)}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: cover;" alt="">`
                : `<i class="${escapeHTML(item.icon_class || 'fa-solid fa-question-circle')}"></i>`; // Убрали fa-xl

            // Бейдж со счетчиком
            const countBadge = (item.pending_count || 0) > 0
                ? `<span class="notification-badge">${item.pending_count}</span>`
                : '';

            itemDiv.innerHTML = `
                <div class="icon-wrapper">
                    ${iconHtml}
                    ${countBadge}
                </div>
                <span>${escapeHTML(item.quest_title || item.title)}</span>
            `;

            // Добавляем обработчик клика
            itemDiv.addEventListener('click', handleGridItemClick);

            grid.appendChild(itemDiv);
        });
    }
    // --- КОНЕЦ НОВОЙ ФУНКЦИИ ---

    // --- НОВЫЙ ОБРАБОТЧИК КЛИКА ПО ИКОНКЕ ---
    async function handleGridItemClick(event) {
        const itemDiv = event.currentTarget;
        const type = itemDiv.dataset.type;
        const questId = itemDiv.dataset.questId; // Будет undefined для призов
        const title = itemDiv.dataset.title || 'Детали'; // Заголовок для модалки

        showLoader();
        try {
            let detailedData = [];
            let renderFunction = null;

            if (type === 'submission' && questId) {
                detailedData = await makeApiRequest(`/api/v1/admin/pending_actions/quest/${questId}`);
                renderFunction = renderSubmissions; // Используем существующую функцию
            } else if (type === 'event_prizes') {
                // Запрашиваем ПОЛНЫЙ список победителей для отображения в модалке
                 detailedData = await makeApiRequest('/api/v1/admin/events/winners/details'); // <-- НУЖЕН НОВЫЙ БЭКЕНД ЭНДПОИНТ!
                renderFunction = renderWinners; // Используем существующую
            } else if (type === 'checkpoint_prizes') {
                // Запрашиваем ПОЛНЫЙ список призов чекпоинта для модалки
                 detailedData = await makeApiRequest('/api/v1/admin/checkpoint_rewards/details'); // <-- НУЖЕН НОВЫЙ БЭКЕНД ЭНДПОИНТ!
                renderFunction = renderCheckpointPrizes; // Используем существующую
            } else {
                throw new Error(`Неизвестный тип элемента: ${type}`);
            }

            if (renderFunction) {
                    // Убедимся, что dom.modalBody существует перед вызовом
                    if (dom.modalBody) {
                        // --- НОВЫЙ КОД (ЗАДАЧА 2) ---
                        // Сохраняем на модалке, какая иконка ее открыла
                        dom.submissionsModal.dataset.sourceType = type;
                        dom.submissionsModal.dataset.sourceId = questId || 'default'; // 'default' для призов (т.к. у них нет ID)
                        // --- КОНЕЦ НОВОГО КОДА ---
                    
                        renderFunction(detailedData, dom.modalBody); // Рендерим в тело модалки
                        if (dom.modalTitle) dom.modalTitle.textContent = title; // Устанавливаем заголовок
                        if (dom.submissionsModal) dom.submissionsModal.classList.remove('hidden'); // Показываем модалку
                    } else {
                    console.error("Элемент dom.modalBody не найден!");
                    tg.showAlert("Ошибка отображения деталей.");
                }
            } else {
                 tg.showAlert("Не удалось определить, как отобразить детали.");
            }

        } catch (e) {
            console.error("Ошибка при загрузке деталей:", e);
            tg.showAlert(`Не удалось загрузить детали: ${e.message}`);
        } finally {
            hideLoader();
        }
    }
    // --- КОНЕЦ НОВОГО ОБРАБОТЧИКА ---
    async function fetchAndCacheCategories(isSilent = false) {
        // --- >>> ДОБАВЬ ЭТОТ ЛОГ <<< ---
        console.log("[DEBUG] fetchAndCacheCategories function started. isSilent:", isSilent);
        // --- >>> КОНЕЦ ЛОГА <<< ---
        try {
            categoriesCache = await makeApiRequest('/api/v1/admin/categories', {}, 'POST', isSilent) || [];
            // --- >>> ДОБАВЬ ЭТОТ ЛОГ <<< ---
            console.log("[DEBUG] fetchAndCacheCategories function finished. categoriesCache:", categoriesCache);
            // --- >>> КОНЕЦ ЛОГА <<< ---
        } catch (e) {
            console.error("Не удалось загрузить категории", e);
             // --- >>> ДОБАВЬ ЭТОТ ЛОГ <<< ---
            console.log("[DEBUG] fetchAndCacheCategories function caught an error.");
             // --- >>> КОНЕЦ ЛОГА <<< ---
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

    // --- NEW Functions for Sort Order Update ---
    async function updateCategorySortOrder(categoryId, sortOrder) {
        try {
            await makeApiRequest('/api/v1/admin/categories/update_sort_order', {
                category_id: categoryId,
                sort_order: sortOrder
            }, 'POST', true); // true - silent mode
            console.log(`Category ${categoryId} sort order updated to ${sortOrder}`);
            // Не перезагружаем здесь, чтобы не прерывать ввод
        } catch (e) {
            console.error("Failed to update category sort order:", e);
            tg.showAlert(`Ошибка обновления порядка категории: ${e.message}`);
             // Можно добавить откат значения в input при ошибке
        }
    }

    async function updateQuestSortOrder(questId, sortOrder) {
        try {
            await makeApiRequest('/api/v1/admin/quests/update_sort_order', {
                quest_id: questId,
                sort_order: sortOrder
            }, 'POST', true); // true - silent mode
            console.log(`Quest ${questId} sort order updated to ${sortOrder}`);
            // Не перезагружаем здесь, чтобы не прерывать ввод
        } catch (e) {
            console.error("Failed to update quest sort order:", e);
            tg.showAlert(`Ошибка обновления порядка задания: ${e.message}`);
            // Можно добавить откат значения в input при ошибке
        }
    }
    // --- End NEW Functions ---

    // --- MODIFIED function: renderCategoriesList ---
    function renderCategoriesList() {
        dom.categoriesList.innerHTML = '';
        if (categoriesCache.length === 0) {
             dom.categoriesList.innerHTML = '<p style="text-align: center;">Категорий пока нет.</p>';
             return;
        }
        // Сортируем кэш перед отображением
        categoriesCache.sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.id - b.id);

        categoriesCache.forEach(cat => {
             // Добавляем input type="number" и убираем кнопки-стрелки
             dom.categoriesList.insertAdjacentHTML('beforeend', `
                 <div class="quest-card category-card" data-category-id="${cat.id}">
                     <input type="number"
                            class="sort-order-input category-sort-order"
                            data-category-id="${cat.id}"
                            value="${cat.sort_order ?? ''}"
                            placeholder="#"
                            min="1">
                     <span class="category-name">${escapeHTML(cat.name)}</span>
                     <div class="category-actions">
                         <button class="admin-edit-quest-btn edit-category-btn" data-id="${cat.id}" data-name="${escapeHTML(cat.name)}">Редакт.</button>
                         <button class="admin-delete-quest-btn delete-category-btn" data-id="${cat.id}">Удалить</button>
                     </div>
                 </div>
             `);
        });
    }
    // --- End MODIFIED function: renderCategoriesList ---

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

function renderSubmissions(submissions, targetElement) { // Добавлен второй аргумент targetElement
        if (!targetElement) {
             console.error("renderSubmissions: targetElement не передан!");
             return;
        }

        targetElement.innerHTML = ''; // Очищаем целевой элемент

        if (!submissions || submissions.length === 0) {
            targetElement.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Нет заданий на проверку.</p>';
            return;
        }

        submissions.forEach(action => {
            let submissionContentHtml = ''; // Переименовал для ясности
            const submittedData = action.submitted_data || '';
            const isUrl = submittedData.startsWith('http://') || submittedData.startsWith('https');

            // --- ИСПРАВЛЕНИЕ ОТОБРАЖЕНИЯ submitted_data ---
            // Возвращаемся к span, но всегда используем escapeHTML
            if (isUrl) {
                submissionContentHtml = `<a href="${escapeHTML(submittedData)}" target="_blank" rel="noopener noreferrer" style="color: var(--action-color); text-decoration: underline; word-break: break-all;">${escapeHTML(submittedData)}</a>`;
            } else {
                // Просто текст, экранированный
                submissionContentHtml = `<span>${escapeHTML(submittedData)}</span>`;
            }
            // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

            const actionLinkHtml = (action.quest_action_url && action.quest_action_url !== "")
                ? `<a href="${escapeHTML(action.quest_action_url)}" target="_blank" rel="noopener noreferrer" class="action-link-btn">Перейти</a>`
                : '';

            const isWizebotQuest = (action.title || "").toLowerCase().includes("сообщен");

            // --- ИСПРАВЛЕНИЕ: Добавляем описание квеста и проверяем данные ---
            // Убедимся, что все поля существуют перед использованием
            const questTitle = action.quest_title || action.title || 'Ручное задание'; // Берем quest_title, если есть
            const questDescription = action.quest_description || 'Описание отсутствует.';
            const rewardAmount = action.reward_amount || '?';
            const userFullName = action.user_full_name || 'Неизвестный';
            
            // --- 👇 ИЗМЕНЕНИЕ 1: Достаем username 👇 ---
            // (Предполагаем, что бэкенд отдает поле "user_username")
            const userUsername = action.username || ''; 
            // --- 👆 КОНЕЦ ИЗМЕНЕНИЯ 1 👆 ---

            const cardHtml = `
            <div class="quest-card admin-submission-card" id="submission-card-${action.id}">
                <h3 class="quest-title">${escapeHTML(questTitle)}</h3>

                <p style="font-size: 13px; color: var(--text-color-muted); line-height: 1.4; margin: 4px 0 10px; padding-bottom: 10px; border-bottom: 1px solid var(--divider-glass-color);">
                    <b>Описание задания:</b><br>${escapeHTML(questDescription)}
                </p>

                <p style="font-size: 13px; font-weight: 500; margin-bottom: 12px;">Награда: ${escapeHTML(rewardAmount)} ⭐</p>
                
                <div class="submission-user-header">
                    <p>Пользователь: <strong>${escapeHTML(userFullName)}</strong></p>
                    
                    <button type="button" 
                            class="admin-contact-btn admin-action-btn" 
                            data-user-id="${action.user_id}"
                            data-user-username="${escapeHTML(userUsername)}" 
                            style="background-color: #007aff; flex-shrink: 0;">
                        <i class="fa-solid fa-user"></i> Связаться
                    </button>
                    </div>
                <p style="margin-top: 10px; margin-bottom: 5px; font-weight: 600; font-size: 13px;">Данные для проверки:</p>
                <div class="submission-wrapper">
                    <div class="submission-data">${submissionContentHtml}</div>
                    ${actionLinkHtml}
                </div>

                ${isWizebotQuest ? `
                <div class="submission-actions" style="margin-top: 10px;">
                    <button class="admin-action-btn check-wizebot-btn" data-nickname="${escapeHTML(submittedData)}" style="background-color: #6441a5;">
                        <i class="fa-brands fa-twitch"></i> Проверить на Wizebot
                    </button>
                </div>
                <div class="wizebot-stats-result" style="margin-top: 10px; font-weight: 500;"></div>
                ` : ''}

                <div class="submission-actions">
                    <button class="admin-action-btn approve" data-id="${action.id}" data-action="approved">Одобрить</button>
                    <button class="admin-action-btn reject" data-id="${action.id}" data-action="rejected">Отклонить</button>

                    <button class="admin-action-btn reject-silent" data-id="${action.id}" data-action="rejected_silent" title="Отклонить без уведомления пользователя">
                        <i class="fa-solid fa-microphone-slash"></i>
                    </button>
                    </div>
            </div>`;
            targetElement.innerHTML += cardHtml;
        });
    }

    function renderCheckpointPrizes(prizes, targetElement) { // Добавлен второй аргумент targetElement
        // Заменяем dom.tabContentCheckpointPrizes на targetElement
        if (!targetElement) {
             console.error("renderCheckpointPrizes: targetElement не передан!");
             return; // Прекращаем выполнение, если целевой элемент не указан
        }

        targetElement.innerHTML = ''; // Очищаем целевой элемент

        if (!prizes || prizes.length === 0) {
            // Заменяем dom.tabContentCheckpointPrizes на targetElement
            targetElement.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Нет наград из Чекпоинта.</p>';
            return;
        }

        prizes.forEach(action => {
            // Используем escapeHTML для всех динамических данных action.*
            // Экранируем ссылку перед вставкой в href
            const safeTradeLink = action.user_trade_link ? escapeHTML(action.user_trade_link) : null;
            const tradeLinkHtml = safeTradeLink
                ? `<p>Ссылка: <a href="${safeTradeLink}" target="_blank" style="color: var(--action-color);">Проверить трейд-ссылку</a></p>`
                : '<p style="color:var(--warning-color);">Трейд-ссылка не указана!</p>';

            const cardHtml = `
            <div class="quest-card admin-submission-card" id="prize-card-${action.id}">
                <h3 class="quest-title">${escapeHTML(action.source_description || 'Выдача награды')}</h3>
                <p><b>Приз:</b> ${escapeHTML(action.reward_details || 'Не указан')}</p>
                <p>Пользователь: <strong>${escapeHTML(action.user_full_name || 'Неизвестный')}</strong></p>
                ${tradeLinkHtml}
                <div class="submission-actions">
                    <button class="admin-action-btn approve" data-id="${action.id}" data-action="approved">Одобрить</button>
                    <button class="admin-action-btn reject" data-id="${action.id}" data-action="rejected">Отклонить</button>
                    
                    <button class="admin-action-btn reject-silent" data-id="${action.id}" data-action="rejected_silent" title="Отклонить без уведомления пользователя">
                        <i class="fa-solid fa-microphone-slash"></i>
                    </button>
                    </div>
            </div>`;
            // Заменяем dom.tabContentCheckpointPrizes на targetElement
            targetElement.innerHTML += cardHtml;
        });
    }

    function renderWinners(winners, targetElement) { // Добавлен второй аргумент targetElement
        // Заменяем dom.tabContentEventPrizes на targetElement
        if (!targetElement) {
             console.error("renderWinners: targetElement не передан!");
             return; // Прекращаем выполнение, если целевой элемент не указан
        }

        targetElement.innerHTML = ''; // Очищаем целевой элемент

        if (!winners || winners.length === 0) {
            // Заменяем dom.tabContentEventPrizes на targetElement
            targetElement.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Нет победителей для отображения.</p>';
            return;
        }

        winners.forEach(winner => {
            // Проверяем трейд-ссылку, используем escapeHTML для безопасной вставки в href
            const hasValidTradeLink = winner.trade_link && winner.trade_link !== 'Не указана' && winner.trade_link.startsWith('http');
            const tradeLinkHref = hasValidTradeLink ? escapeHTML(winner.trade_link) : '#'; // Экранируем ссылку

            // HTML для кнопки подтверждения или статуса
            const confirmationHtml = winner.prize_sent_confirmed
                ? '<p style="text-align:center; color: var(--status-active-color); font-weight: 600;">✅ Приз выдан</p>'
                // Используем escapeHTML для data-event-id, хотя это число, на всякий случай
                : `<button class="admin-action-btn confirm confirm-winner-prize-btn" data-event-id="${escapeHTML(winner.event_id)}">Подтвердить выдачу</button>`;

            // Используем escapeHTML для всех динамических текстовых данных
            const cardHtml = `
                <div class="quest-card admin-submission-card" id="winner-card-${escapeHTML(winner.event_id)}">
                    <h3 class="quest-title">${escapeHTML(winner.prize_title || 'Без названия')}</h3>
                    <p>Победитель: <strong>${escapeHTML(winner.winner_name || 'Неизвестно')}</strong></p>
                    <p>Трейд-ссылка: ${hasValidTradeLink ? `<a href="${tradeLinkHref}" target="_blank" style="color: var(--action-color);">Открыть</a>` : '<span style="color:var(--warning-color);">Не указана</span>'}</p>
                    <div class="submission-actions">
                        ${confirmationHtml}
                    </div>
                </div>`;
            // Заменяем dom.tabContentEventPrizes на targetElement
            targetElement.innerHTML += cardHtml;
        });
    }

    async function loadAndRenderSettings() {
        try {
             const settings = await makeApiRequest('/api/v1/admin/settings', {}, 'POST', true);
            // --- ↓↓↓ ДОБАВЬТЕ ЭТУ СТРОКУ ↓↓↓ ---
             dom.settingAuctionEnabled.checked = settings.auction_enabled || false; // (false - значение по умолчанию)
             // --- ↑↑↑ КОНЕЦ ДОБАВЛЕНИЯ ↑↑↑ ---
             dom.settingSkinRaceEnabled.checked = settings.skin_race_enabled;
             dom.settingQuestsEnabled.checked = settings.quests_enabled;
             dom.settingChallengesEnabled.checked = settings.challenges_enabled;
             dom.settingQuestRewardsEnabled.checked = settings.quest_promocodes_enabled;
             dom.settingChallengeRewardsEnabled.checked = settings.challenge_promocodes_enabled;
             dom.settingCheckpointEnabled.checked = settings.checkpoint_enabled;
             dom.settingWeeklyGoalsEnabled.checked = settings.weekly_goals_enabled;
             dom.settingMenuBannerUrl.value = settings.menu_banner_url || '';
             dom.settingCheckpointBannerUrl.value = settings.checkpoint_banner_url || '';
            dom.settingAuctionBannerUrl.value = settings.auction_banner_url || ''; // <-- ВОТ ЭТА СТРОКА ПРОПУЩЕНА
             dom.settingWeeklyGoalsBannerUrl.value = settings.weekly_goals_banner_url || ''; // <-- 🔽 ДОБАВИТЬ ЭТУ СТРОКУ
             dom.settingAuctionBannerUrl.value = settings.auction_banner_url || ''; // <-- ВОТ ЭТА СТРОКА ПРОПУЩЕНА

             // --- НОВЫЙ КОД ДЛЯ УПРАВЛЕНИЯ СЛАЙДАМИ (v2 - БОЛЕЕ НАДЕЖНЫЙ) ---
            const defaultOrder = ['skin_race', 'cauldron', 'auction'];
            const loadedOrder = settings.slider_order || defaultOrder;
            
            // Гарантируем, что все элементы из defaultOrder присутствуют
            const orderSet = new Set(loadedOrder);
            defaultOrder.forEach(item => {
                if (!orderSet.has(item)) {
                    loadedOrder.push(item); // Добавляем недостающие в конец
                }
            });

            // Фильтруем, чтобы удалить элементы, которых больше нет
            const finalSliderOrder = loadedOrder.filter(id => defaultOrder.includes(id));

            const slideNames = {
                skin_race: 'Гонка за скинами',
                cauldron: 'Ивент "Котел"',
                auction: 'Аукцион',
                checkpoint: 'Марафон Чекпоинт'
            };

            dom.sliderOrderManager.innerHTML = '';
            finalSliderOrder.forEach(slideId => {
                if (slideNames[slideId]) {
                    const item = document.createElement('div');
                    item.className = 'slider-order-item';
                    item.draggable = true;
                    item.dataset.slideId = slideId;
                    item.innerHTML = `<i class="fa-solid fa-grip-vertical drag-handle"></i> ${slideNames[slideId]}`;
                    dom.sliderOrderManager.appendChild(item);
                }
            });
            
            // Drag and Drop логика
            let draggedItem = null;
            dom.sliderOrderManager.addEventListener('dragstart', (e) => {
                draggedItem = e.target;
                setTimeout(() => e.target.classList.add('dragging'), 0);
            });

            dom.sliderOrderManager.addEventListener('dragend', (e) => {
                setTimeout(() => {
                    draggedItem.classList.remove('dragging');
                    draggedItem = null;
                }, 0);
            });

            dom.sliderOrderManager.addEventListener('dragover', (e) => {
                e.preventDefault();
                const afterElement = getDragAfterElement(dom.sliderOrderManager, e.clientY);
                const currentElement = document.querySelector('.dragging');
                if (afterElement == null) {
                    dom.sliderOrderManager.appendChild(currentElement);
                } else {
                    dom.sliderOrderManager.insertBefore(currentElement, afterElement);
                }
            });

            function getDragAfterElement(container, y) {
                const draggableElements = [...container.querySelectorAll('.slider-order-item:not(.dragging)')];
                return draggableElements.reduce((closest, child) => {
                    const box = child.getBoundingClientRect();
                    const offset = y - box.top - box.height / 2;
                    if (offset < 0 && offset > closest.offset) {
                        return { offset: offset, element: child };
                    } else {
                        return closest;
                    }
                }, { offset: Number.NEGATIVE_INFINITY }).element;
            }
             // --- КОНЕЦ НОВОГО КОДА ---

        } catch (e) {
             console.error("Не удалось загрузить настройки:", e);
             tg.showAlert("Не удалось загрузить настройки.");
        }
    }
    async function loadScheduleSettings() {
    try {
        // Загружаем общие настройки, так как расписание теперь их часть
        const settings = await makeApiRequest('/api/v1/admin/settings', {}, 'POST', true);

        const overrideEnabled = settings.quest_schedule_override_enabled || false;
        const activeType = settings.quest_schedule_active_type || 'twitch';

        if (dom.settingQuestScheduleOverride) {
            dom.settingQuestScheduleOverride.checked = overrideEnabled;
        }
        if (dom.settingQuestScheduleType) {
            dom.settingQuestScheduleType.value = activeType;
        }
        if (dom.settingQuestScheduleWrapper) {
            // Используем 'flex' для .admin-form
            dom.settingQuestScheduleWrapper.style.display = overrideEnabled ? 'flex' : 'none';
        }

    } catch (e) {
        tg.showAlert(`Не удалось загрузить настройки расписания: ${e.message}`);
    }
}
// --- 🔼 КОНЕЦ НОВОЙ ФУНКЦИИ 🔼 ---
    

        async function loadTwitchRewards() {
        const container = document.getElementById('twitch-rewards-container');
        container.innerHTML = '';
        try {
            // Бэкенд (Изменение 3.2) теперь возвращает 'pending_count' и все поля
            const rewards = await makeApiRequest('/api/v1/admin/twitch_rewards/list', {}, 'GET', true); 
            
            if (!Array.isArray(rewards) || rewards.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Наград пока нет. Они создадутся автоматически, когда пользователь купит первую награду за баллы на Twitch.</p>';
                return;
            }

            // Бэкенд УЖЕ отсортировал их (nullslast)
            rewards.forEach((reward, index) => {

                // --- НАЧАЛО ИСПРАВЛЕНИЯ: Добавляем разделитель ---
                if (index === 9) {
                    const dividerHtml = `
                    <div class="quest-card" style="
                        grid-column: 1 / -1; /* Растягиваем на всю ширину сетки */
                        background-color: transparent; 
                        padding: 20px 5px 10px; 
                        backdrop-filter: none; 
                        box-shadow: none;
                        border-radius: 0;">
                        
                        <h3 style="
                            margin: 0; 
                            font-size: 14px; 
                            color: var(--text-color-muted); 
                            text-align: left; 
                            border-bottom: 1px solid var(--divider-glass-color); 
                            padding-bottom: 8px;
                            width: 100%;">
                            
                            <i class="fa-solid fa-box-archive" style="margin-right: 8px;"></i>
                            Дополнительные / Архивные
                        </h3>
                    </div>`;
                    container.insertAdjacentHTML('beforeend', dividerHtml);
                }
                // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

                const itemDiv = document.createElement('div');
                itemDiv.className = 'admin-icon-button';
                itemDiv.dataset.rewardId = reward.id;

                const pendingCount = reward.pending_count || 0;
                const badgeHtml = pendingCount > 0
                    ? `<span class="notification-badge">${pendingCount}</span>`
                    : '';
                
                // Иконка по умолчанию
                const iconUrl = reward.icon_url || 'https://static-cdn.jtvnw.net/custom-reward-images/default-4.png';
                
                // Скрываем инпут, если hasAdminAccess = false
                const adminDisplayStyle = hasAdminAccess ? 'block' : 'none';

                itemDiv.innerHTML = `
                    <div class="icon-wrapper">
                        <a href="#" class="reward-purchases-link" data-reward-id="${reward.id}" data-reward-title="${escapeHTML(reward.title)}">
                            <img src="${escapeHTML(iconUrl)}" alt="reward">
                        </a>
                        
                        <button class="reward-shortcut-btn reward-settings-btn" data-reward='${JSON.stringify(reward)}'>
                            <i class="fa-solid fa-gear"></i>
                        </button>
                        
                        ${badgeHtml}
                        
                    </div>
                    <span>${escapeHTML(reward.title)}</span>
                `;
                container.appendChild(itemDiv);
            }); // <--- ВОТ ЭТИ СТРОКИ БЫЛИ УДАЛЕНЫ
        } catch (e) {
            console.error('Ошибка загрузки Twitch наград:', e);
            container.innerHTML = `<p style="text-align: center; color: var(--danger-color);">Ошибка загрузки наград: ${e.message}</p>`;
        }
    }

// --- НОВАЯ ФУНКЦИЯ ЗАГРУЗКИ ОЖИДАЮЩИХ ДЕЙСТВИЙ ---
    // --- ⬇️⬇️⬇️ ЭТО ИЗМЕНЕННАЯ ФУНКЦИЯ ⬇️⬇️⬇️ ---
    async function loadPendingActions() {
        try {
            // Запрашиваем ВСЕ данные одновременно
            const [groupedSubmissions, allEventPrizes, allCheckpointPrizes] = await Promise.all([
                makeApiRequest('/api/v1/admin/pending_actions', {}, 'POST', true),      // Для вкладки "Проверки" (сетка иконок)
                makeApiRequest('/api/v1/admin/events/winners/details', {}, 'POST', true), // Для вкладки "Розыгрыши" (сразу список)
                makeApiRequest('/api/v1/admin/checkpoint_rewards/details', {}, 'POST', true) // Для вкладки "Чекпоинт" (сразу список)
            ]);
            
            // --- 1. Обновление индикаторов вкладок ---
            try {
                const eventPrizesTab = document.querySelector('#view-admin-pending-actions .tab-button[data-tab="event-prizes"]');
                const checkpointPrizesTab = document.querySelector('#view-admin-pending-actions .tab-button[data-tab="checkpoint-prizes"]');
                
                const updateTabText = (tabElement, baseText, hasData) => {
                    if (!tabElement) return;
                    const cleanText = baseText || tabElement.textContent.trim().replace(/<i.*<\/i>/, '').trim(); // Убираем старые иконки
                    if (!baseText) {
                        tabElement.dataset.baseText = cleanText;
                    }
                    if (hasData) {
                        tabElement.innerHTML = `${cleanText} <i class="fa-solid fa-circle-exclamation" style="font-size: 0.9em; vertical-align: middle; margin-left: 5px; color: var(--danger-color);"></i>`;
                    } else {
                        tabElement.innerHTML = cleanText;
                    }
                };
                
                updateTabText(eventPrizesTab, eventPrizesTab ? eventPrizesTab.dataset.baseText : null, allEventPrizes && allEventPrizes.length > 0);
                updateTabText(checkpointPrizesTab, checkpointPrizesTab ? checkpointPrizesTab.dataset.baseText : null, allCheckpointPrizes && allCheckpointPrizes.length > 0);

            } catch (e) {
                console.error("Ошибка при обновлении индикаторов вкладок:", e);
            }

            // --- 2. Рендеринг вкладок ---

            // Вкладка "Проверки" (submissions): Использует старую логику сетки иконок
            renderGroupedItemsGrid('tab-content-submissions', groupedSubmissions);
            
            // Вкладка "Розыгрыши" (event-prizes): Рендерим сразу список победителей
            // Нам больше не нужна сетка иконок, мы используем функцию renderWinners
            const eventPrizesContainer = document.getElementById('tab-content-event-prizes');
            if (eventPrizesContainer) {
                // Передаем данные в renderWinners, но указываем контейнер вкладки как цель
                renderWinners(allEventPrizes, eventPrizesContainer);
            }

            // Вкладка "Чекпоинт" (checkpoint-prizes): Рендерим сразу список наград
            const checkpointPrizesContainer = document.getElementById('tab-content-checkpoint-prizes');
            if (checkpointPrizesContainer) {
                // Передаем данные в renderCheckpointPrizes, указывая контейнер вкладки
                renderCheckpointPrizes(allCheckpointPrizes, checkpointPrizesContainer);
            }
        
        } catch (e) {
            console.error("Не удалось загрузить ожидающие действия:", e);
            const subContent = document.getElementById('tab-content-submissions');
            const eventContent = document.getElementById('tab-content-event-prizes');
            const cpContent = document.getElementById('tab-content-checkpoint-prizes');

            if(subContent) subContent.innerHTML = `<p class="error-message">Не удалось загрузить: ${e.message}</p>`;
            if(eventContent) eventContent.innerHTML = `<p class="error-message">Не удалось загрузить: ${e.message}</p>`;
            if(cpContent) cpContent.innerHTML = `<p class="error-message">Не удалось загрузить: ${e.message}</p>`;
        }
    }
    // --- ⬆️⬆️⬆️ КОНЕЦ ИЗМЕНЕННОЙ ФУНКЦИИ ⬆️⬆️⬆️ ---
    // --- КОНЕЦ НОВОЙ ФУНКЦИИ ---
    
    async function loadAdminGrantLog() {
        if (!dom.adminGrantLogList) return;
        
        dom.adminGrantLogList.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Загрузка журнала...</p>';
        try {
            const logs = await makeApiRequest('/api/v1/admin/grants/log', {}, 'POST', true);
            
            if (!logs || logs.length === 0) {
                dom.adminGrantLogList.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Записей о выдаче нет.</p>';
                return;
            }
            
            dom.adminGrantLogList.innerHTML = logs.map(log => {
                const date = new Date(log.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                const typeText = log.grant_type === 'tickets' ? 'билетов' : 'звёзд';
                const icon = log.grant_type === 'tickets' ? 'fa-ticket' : 'fa-star';
                
                return `
                    <div class="submission-item" style="padding-bottom: 8px;">
                        <p style="margin: 0; font-size: 13px;">
                            <i class="fa-solid ${icon}" style="color: var(--primary-color); width: 16px; text-align: center;"></i>
                            <strong>${log.amount} ${typeText}</strong> для <strong>${escapeHTML(log.user_name)}</strong>
                        </p>
                        <p style="margin: 4px 0 0; font-size: 11px; color: var(--text-color-muted);">
                            ${date} — (Админ: ${escapeHTML(log.admin_name)})
                        </p>
                    </div>
                `;
            }).join('');

        } catch (e) {
            dom.adminGrantLogList.innerHTML = `<p class="error-message">Не удалось загрузить лог: ${e.message}</p>`;
        }
    }

    function openTwitchRewardSettings(reward) { // 'reward' - это полный объект JSON
        const modal = document.getElementById('twitch-reward-settings-modal');
        const form = document.getElementById('twitch-reward-settings-form');
        document.getElementById('twitch-settings-title').textContent = `Настройки: ${reward.title}`;

        form.elements['reward_id'].value = reward.id;
        form.elements['is_active'].checked = reward.is_active;
        form.elements['notify_admin'].checked = reward.notify_admin;
        form.elements['show_user_input'].checked = reward.show_user_input;
        
        // Логика полей (старое/новое) в зависимости от пароля
        const legacyWrapper = document.getElementById('legacy-promocode-field-wrapper');
        const adminWrapper = modal.querySelector('.admin-feature-6971'); // Ищем внутри модалки
        
        if (hasAdminAccess) {
            // Админ 6971
            legacyWrapper.style.display = 'none';
            adminWrapper.style.display = 'block';
            
            // --- НАЧАЛО ИЗМЕНЕНИЯ ---
            const rewardType = reward.reward_type || 'promocode';
            form.elements['reward_type'].value = rewardType;
            form.elements['reward_amount'].value = reward.reward_amount ?? (reward.promocode_amount ?? 10); 
            
            // Находим инпут и лейбл для "Количество"
            const rewardAmountInput = document.getElementById('reward-amount-input');
            const rewardAmountLabel = rewardAmountInput ? rewardAmountInput.previousElementSibling : null; 
            const isNone = rewardType === 'none'; // Проверяем новый тип

            // Прячем/показываем поле "Количество"
            if (rewardAmountInput) {
                rewardAmountInput.required = !isNone;
                rewardAmountInput.style.display = isNone ? 'none' : 'block';
            }
            if (rewardAmountLabel && rewardAmountLabel.tagName === 'LABEL') {
                rewardAmountLabel.style.display = isNone ? 'none' : 'block';
            }
            // --- КОНЕЦ ИЗМЕНЕНИЯ ---

            // Убираем required со старого поля, ставим на новое (с учетом 'none')
            form.elements['promocode_amount'].required = false;

            // Заполняем новое поле сортировки
            form.elements['sort_order'].value = reward.sort_order ?? '';
            
        } else {
            // Обычный модератор
            legacyWrapper.style.display = 'block';
            adminWrapper.style.display = 'none';
            
            // Старое поле для звезд
            form.elements['promocode_amount'].value = reward.promocode_amount ?? (reward.reward_amount ?? 10);
            
            // Ставим required на старое поле, убираем с нового
            form.elements['promocode_amount'].required = true;
            if (form.elements['reward_amount']) { // Проверяем наличие
                form.elements['reward_amount'].required = false;
            }
        }

        form.elements['condition_type'].value = reward.condition_type || "";
        form.elements['target_value'].value = reward.target_value || "";

        modal.classList.remove('hidden');
    }

    // --- 🔽 ВСТАВЬТЕ ЭТОТ КОД ВМЕСТО СТАРОЙ openTwitchPurchases 🔽 ---
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
        body.innerHTML = '<i>Загрузка покупок...</i>';
        modal.classList.remove('hidden');

        const makeLinksClickable = (text) => {
            if (!text || typeof text !== 'string') return '';
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            return text.replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
        };

        const viewedPurchases = new Set(JSON.parse(localStorage.getItem('viewed_purchases') || '[]'));

        try {
            // 1. Получаем данные (покупки + настройки)
            // Бэкенд (после Этапа 1) теперь возвращает 'snapshot_...' в каждой покупке
            // и 'reward_type' / 'reward_amount' в настройках.
            const data = await makeApiRequest(`/api/v1/admin/twitch_rewards/${rewardId}/purchases`, {}, 'GET', true);
            let { purchases, reward_settings } = data;

            if (!purchases || purchases.length === 0) {
                body.innerHTML = '<p style="text-align: center;">Нет покупок для этой награды.</p>';
                deleteAllBtn.classList.add('hidden');
                return;
            }
            deleteAllBtn.classList.remove('hidden');

            // 2. Определяем настройки награды
            const rewardType = (reward_settings && reward_settings.reward_type) ? reward_settings.reward_type : 'promocode';
            const rewardAmount = reward_settings.reward_amount ?? (reward_settings.promocode_amount ?? 0);
            const targetValue = reward_settings.target_value || 0;
            const conditionType = reward_settings.condition_type || '';

            // 3. Рендерим список
            body.innerHTML = purchases.map(p => {
                const date = new Date(p.created_at).toLocaleString('ru-RU');

                // --- 🔽 НОВАЯ ЛОГИКА ОТОБРАЖЕНИЯ ПРОГРЕССА 🔽 ---
                let progressHtml = '';
                let warningHtml = '';
                let isConditionMet = true; // По умолчанию считаем, что выполнено (если targetValue = 0)

                if (targetValue > 0 && conditionType) {
                    // 1. Находим нужную колонку из "снимка"
                    const base_column_name = CONDITION_TO_COLUMN[conditionType]; // e.g., "daily_message_count"
                    
                    // 2. Преобразуем в ключ снимка
                    // (e.g., "daily_message_count" -> "snapshot_daily_messages")
                    const snapshot_key = 'snapshot_' + (base_column_name || '').replace('_message_count', '_messages').replace('_uptime_minutes', '_uptime');
                    
                    const snapshot_progress = p[snapshot_key] || 0;
                    isConditionMet = snapshot_progress >= targetValue;

                    const progressClass = isConditionMet ? 'progress-good' : 'progress-bad';
                    
                    // 3. HTML для прогресса
                    progressHtml = `
                        <p class="purchase-progress ${progressClass}">
                            Прогресс (на момент покупки): <strong>${snapshot_progress} / ${targetValue}</strong>
                        </p>`;
                    
                    // 4. HTML для предупреждения
                    if (!isConditionMet) {
                        warningHtml = `
                        <p class="purchase-warning">
                            <i class="fa-solid fa-triangle-exclamation"></i> Условие не выполнено!
                        </p>`;
                    }
                }
                // --- 🔼 КОНЕЦ НОВОЙ ЛОГИКИ 🔼 ---

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
                    // --- БЛОК 1: Награда УЖЕ выдана ---
                    actionButtonsHtml = `
                        <div class="rewarded-info" style="flex-grow: 1;"><i class="fa-solid fa-check-circle"></i> Награда выдана</div>
                        <button class="admin-action-btn reject delete-purchase-btn" data-purchase-id="${p.id}"><i class="fa-solid fa-trash"></i></button>`;
                
                } else {
                    // --- БЛОК 2: Награда ЕЩЕ НЕ выдана ---
                    let issueButtonHtml = '';

                    if (p.status !== 'Привязан') {
                        issueButtonHtml = `
                            <div class="rewarded-info" style="flex-grow: 1; color: var(--warning-color);">
                                <i class="fa-solid fa-link-slash"></i> Ожидает привязки
                            </div>`;
                    } else {
                        // Кнопки теперь всегда активны
                        if (rewardType === 'tickets') {
                            issueButtonHtml = `<button 
                                class="admin-action-btn issue-tickets-btn" 
                                data-purchase-id="${p.id}" 
                                data-amount="${rewardAmount}">
                                Выдать ${rewardAmount} 🎟️
                            </button>`;
                        } else if (rewardType === 'promocode') {
                            issueButtonHtml = `<button 
                                class="admin-action-btn issue-promo-btn" 
                                data-purchase-id="${p.id}" 
                                data-amount="${rewardAmount}">
                                Выдать ${rewardAmount} ⭐
                            </button>`;
                        } else {
                            issueButtonHtml = `<div class="rewarded-info" style="flex-grow: 1; color: var(--text-color-muted);">
                                <i class="fa-solid fa-file-invoice"></i> Выдача промокодов/билетов не требуется
                            </div>`;
                        }
                    } 

                    actionButtonsHtml = `
                        ${issueButtonHtml}
                        <button class="admin-action-btn reject delete-purchase-btn" data-purchase-id="${p.id}"><i class="fa-solid fa-trash"></i></button>`;
                }

                const telegramNameDisplay = p.status === 'Привязан'
                    ? `<span style="color: var(--text-color-muted); font-weight: normal; margin-left: 5px;">(${p.username || '...'})</span>`
                    : `<span style="color: var(--warning-color); font-weight: normal; margin-left: 5px;">(Не привязан)</span>`;

                return `
                <div class="purchase-item" id="purchase-item-${p.id}" data-purchase-id="${p.id}" data-condition-met="${isConditionMet}">
                    <div class="purchase-item-header">
                        <strong>${p.twitch_login || '???'}${telegramNameDisplay}</strong>
                        <span class="purchase-status-badge purchase-status-${p.status.replace(' ', '.')}">${p.status}</span>
                    </div>
                    <p>Дата: ${date}</p>
                    ${viewStatusHtml}
                    ${tradeLinkHtml}
                    ${progressHtml} 
                    ${warningHtml} 
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
// --- 🔼 КОНЕЦ БЛОКА ДЛЯ ЗАМЕНЫ 🔼 ---
    
function renderRoulettePrizes(prizes) {
        dom.roulettePrizesList.innerHTML = '';
        if (!prizes || prizes.length === 0) {
            dom.roulettePrizesList.innerHTML = '<p style="text-align: center;">Призов для рулеток пока нет.</p>';
            return;
        }

        // 1. Группируем призы по названию рулетки (reward_title)
        const groupedPrizes = prizes.reduce((acc, prize) => {
            if (!acc[prize.reward_title]) {
                acc[prize.reward_title] = [];
            }
            acc[prize.reward_title].push(prize);
            return acc;
        }, {});

        // 2. Рассчитываем шансы для каждой группы отдельно
        for (const rewardTitle in groupedPrizes) {
            const group = groupedPrizes[rewardTitle];

            // Считаем сумму БАЗОВЫХ весов (для "Расчетного шанса")
            const totalBaseWeight = group.reduce((sum, p) => sum + (p.chance_weight || 0), 0);

            // Считаем сумму ЭФФЕКТИВНЫХ весов (для "Текущего шанса")
            const totalEffectiveWeight = group.reduce((sum, p) => sum + ((p.chance_weight || 0) * (p.quantity || 0)), 0);

            // Сортируем призы внутри группы (например, по названию скина)
            group.sort((a, b) => a.skin_name.localeCompare(b.skin_name));

            const prizesHtml = group.map(prize => {
                const baseWeight = prize.chance_weight || 0;
                const quantity = prize.quantity || 0;
                const effectiveWeight = baseWeight * quantity;

                // Рассчитываем проценты, проверяем деление на ноль
                const startChancePercent = totalBaseWeight > 0 ? ((baseWeight / totalBaseWeight) * 100).toFixed(1) : '0.0';
                const smartChancePercent = totalEffectiveWeight > 0 ? ((effectiveWeight / totalEffectiveWeight) * 100).toFixed(1) : '0.0';

                // Формируем HTML для отображения
                return `
                <div class="quest-card" style="flex-direction: row; align-items: center; gap: 15px;">
                    <img src="${escapeHTML(prize.image_url)}" alt="skin" style="width: 50px; height: 50px; object-fit: contain; border-radius: 8px; flex-shrink: 0;">
                    <div style="flex-grow: 1; min-width: 0;">
                        <p style="margin: 0 0 5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(prize.skin_name)}">
                            ${escapeHTML(prize.skin_name)}
                        </p>
                        <small style="color: var(--text-color-muted); display: block; line-height: 1.6;">
                            1. Кол-во: ${quantity}<br>
                            2. Текущий шанс <div class="tooltip" style="display: inline-flex;">?<span class="tooltip-text">Актуальный % выпадения, учитывающий кол-во: (Баз. шанс × Кол-во) / Сумма (Баз. шанс × Кол-во) для всех призов в этой рулетке.</span></div>: ${smartChancePercent}%<br>
                            3. Базовый шанс <div class="tooltip" style="display: inline-flex;">?<span class="tooltip-text">Начальный шанс шанса предмета, заданный администратором. Определяет относительную редкость.</span></div>: ${baseWeight}<br>
                            4. Расчетный шанс <div class="tooltip" style="display: inline-flex;">?<span class="tooltip-text">% выпадения, если бы кол-во не влияло: Баз. шанс / Сумма всех Баз. шансов в этой рулетке.</span></div>: ${startChancePercent}%
                        </small>
                    </div>
                    <div style="display: flex; gap: 8px; flex-shrink: 0;">
                         <button class="admin-edit-quest-btn edit-roulette-prize-btn" data-prize='${JSON.stringify(prize)}'>
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="admin-delete-quest-btn delete-roulette-prize-btn" data-id="${prize.id}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            }).join('');

            // Аккордеон по умолчанию закрыт (без 'open')
            const groupHtml = `
                <details class="quest-category-accordion">
                    <summary class="quest-category-header">
                       ${escapeHTML(rewardTitle)}
                    </summary>
                    <div class="quest-category-body">
                        ${prizesHtml}
                    </div>
                </details>
            `;
            dom.roulettePrizesList.insertAdjacentHTML('beforeend', groupHtml);
        } // Конец цикла for по группам
    }

// --- ↓↓↓ НОВЫЙ КОД ДЛЯ АУКЦИОНОВ ↓↓↓ ---
async function loadAdminAuctions() {
    showLoader();
    try {
        const auctions = await makeApiRequest('/api/v1/admin/auctions/list', {}, 'POST', true);
        renderAdminAuctions(auctions);
    } catch (e) {
        dom.adminAuctionsList.innerHTML = `<p class="error-message">Не удалось загрузить аукционы.</p>`;
    } finally {
        hideLoader();
    }
}

function renderAdminAuctions(auctions) {
    dom.adminAuctionsList.innerHTML = '';
    if (!auctions || auctions.length === 0) {
        dom.adminAuctionsList.innerHTML = '<p style="text-align: center;">Аукционов пока нет.</p>';
        return;
    }

    auctions.forEach(auction => {
        let statusBadge = '';
        if (auction.ended_at) {
            statusBadge = `<span class="quest-status-badge status-inactive">Завершен</span>`;
        } else if (auction.is_active) {
            statusBadge = `<span class="quest-status-badge status-active">Активен</span>`;
        } else {
            statusBadge = `<span class="quest-status-badge" style="background-color: #555;">Остановлен</span>`;
        }

        const cardHtml = `
        <div class="quest-card manage-quest-card">
            <div class="quest-admin-meta">
                ${statusBadge}
                <span class="quest-status-badge" style="background-color: #007aff20; color: #007aff;">
                    Таймер: ${auction.bid_cooldown_hours}ч
                </span>
            </div>
            <div class="manage-quest-info">
                <span>${escapeHTML(auction.title)}</span><br>
                <small style="color: var(--text-color-muted);">
                    Ставка: ${auction.current_highest_bid} 🎟️<br>
                    Лидер: ${escapeHTML(auction.current_highest_bidder_name || '...')}
                </small>
            </div>
            <div class="admin-buttons-wrapper">
                <button class="admin-edit-quest-btn toggle-active-btn" data-id="${auction.id}" data-active="${auction.is_active}">
                    ${auction.is_active ? 'Остановить' : 'Запустить'}
                </button>
                <button class="admin-edit-quest-btn toggle-visible-btn" data-id="${auction.id}" data-visible="${auction.is_visible}" style="background-color: var(--warning-color);">
                    ${auction.is_visible ? 'Скрыть' : 'Показать'}
                </button>
                <button class="admin-delete-quest-btn delete-auction-btn" data-id="${auction.id}">Удалить</button>
            </div>
        </div>`;
        dom.adminAuctionsList.insertAdjacentHTML('beforeend', cardHtml);
    });
}

// Добавить обработчики в `setupEventListeners`
if (dom.createAuctionForm) {
    dom.createAuctionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            title: formData.get('title'),
            image_url: formData.get('image_url'),
            bid_cooldown_hours: parseInt(formData.get('bid_cooldown_hours'), 10)
        };
        await makeApiRequest('/api/v1/admin/auctions/create', data);
        tg.showAlert('Лот создан!');
        e.target.reset();
        await loadAdminAuctions();
    });
}

if (dom.adminAuctionsList) {
    dom.adminAuctionsList.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const id = btn.dataset.id;

        if (btn.classList.contains('toggle-active-btn')) {
            const newStatus = !(btn.dataset.active === 'true');
            await makeApiRequest('/api/v1/admin/auctions/update', { id: id, is_active: newStatus });
            await loadAdminAuctions();
        } else if (btn.classList.contains('toggle-visible-btn')) {
            const newStatus = !(btn.dataset.visible === 'true');
            await makeApiRequest('/api/v1/admin/auctions/update', { id: id, is_visible: newStatus });
            await loadAdminAuctions();
        } else if (btn.classList.contains('delete-auction-btn')) {
            tg.showConfirm('Удалить этот лот и всю историю ставок? (Нельзя отменить)', async (ok) => {
                if (ok) {
                    await makeApiRequest('/api/v1/admin/auctions/delete', { id: id });
                    await loadAdminAuctions();
                }
            });
        }
    });
}
// --- ↑↑↑ КОНЕЦ НОВОГО КОДА ДЛЯ АУКЦИОНОВ ↑↑↑
    
    
    // --- MODIFIED function: renderQuests ---
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

        // Сортируем категории по sort_order перед группировкой
        const sortedCategories = [...categories].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.id - b.id);

        const groupedQuests = quests.reduce((acc, quest) => {
            const categoryId = quest.category_id || 'no_category';
            if (!acc[categoryId]) acc[categoryId] = [];
            acc[categoryId].push(quest);
            return acc;
        }, {});

        // Добавляем "Без категории" в начало списка для отображения
        const allCategoriesForDisplay = [{ id: 'no_category', name: 'Автоматические и без категории' }, ...sortedCategories];

        allCategoriesForDisplay.forEach(cat => {
            // Сортируем квесты ВНУТРИ категории по sort_order
            const questsInCategory = (groupedQuests[cat.id] || []).sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.id - b.id);

            if (questsInCategory.length === 0 && cat.id !== 'no_category') return; // Не отображаем пустые реальные категории

            const questsHtml = questsInCategory.map(quest => {
                const statusClass = quest.is_active ? 'status-active' : 'status-inactive';
                const typeDetails = getQuestTypeDetails(quest.quest_type);
                // Добавляем input type="number" и убираем кнопки-стрелки
                return `
                <div class="quest-card manage-quest-card" data-quest-id="${quest.id}">
                    <div class="quest-admin-meta">
                        <input type="number"
                               class="sort-order-input quest-sort-order"
                               data-quest-id="${quest.id}"
                               value="${quest.sort_order ?? ''}"
                               placeholder="#"
                               min="1">
                        <span class="quest-status-badge ${statusClass}">${quest.is_active ? 'Активен' : 'Неактивен'}</span>
                        <span class="quest-status-badge" style="background-color: ${typeDetails.color}20; color: ${typeDetails.color};">${typeDetails.name}</span>
                    </div>
                    <div class="manage-quest-info">
                        <span>${escapeHTML(quest.title)}</span><br>
                        <small style="color: var(--text-color-muted);">ID: ${quest.id} | Награда: ${quest.reward_amount || 'нет'} ⭐</small>
                    </div>
                    <div class="admin-buttons-wrapper">
                        ${quest.quest_type === 'manual_check' ? `<button class="admin-view-subs-btn" data-id="${quest.id}" data-title="${escapeHTML(quest.title)}">Заявки</button>` : ''}
                        <button class="admin-edit-quest-btn" data-id="${quest.id}">Редактировать</button>
                        <button class="admin-delete-quest-btn" data-id="${quest.id}">Удалить</button>
                    </div>
                </div>`;
            }).join('');

            // Отображаем аккордеон, даже если в "Без категории" нет квестов
            if (questsInCategory.length > 0 || cat.id === 'no_category') {
                const accordionHtml = `
                    <details class="quest-category-accordion">
                        <summary class="quest-category-header">
                            <div class="category-info">${escapeHTML(cat.name)}</div>
                        </summary>
                        <div class="quest-category-body">${questsHtml || '<p style="font-size: 12px; color: var(--text-color-muted); text-align: center;">В этой категории пока нет заданий.</p>'}</div>
                    </details>`;
                dom.questsList.insertAdjacentHTML('beforeend', accordionHtml);
            }
        });
    }
    // --- End MODIFIED function: renderQuests ---

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
        // --- СТАЛО ---
        if (dom.sleepModeToggle) { // <-- ДОБАВЛЕНА ПРОВЕРКА
            if (status.is_sleeping) {
                dom.sleepModeToggle.classList.add('is-sleeping');
                dom.sleepModeToggle.title = "Разбудить бота";
            } else {
                dom.sleepModeToggle.classList.remove('is-sleeping');
                dom.sleepModeToggle.title = "Уложить бота спать";
            }
        } else {
            console.warn("updateSleepButton: Элемент dom.sleepModeToggle не найден!"); // Добавим лог на всякий случай
        }
    }

    function renderSubmissions(submissions, targetElement) { // Добавлен второй аргумент targetElement
        if (!targetElement) {
             console.error("renderSubmissions: targetElement не передан!");
             return;
        }

        targetElement.innerHTML = ''; // Очищаем целевой элемент

        if (!submissions || submissions.length === 0) {
            targetElement.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Нет заданий на проверку.</p>';
            return;
        }

        submissions.forEach(action => {
            let submissionContentHtml = ''; // Переименовал для ясности
            const submittedData = action.submitted_data || '';
            const isUrl = submittedData.startsWith('http://') || submittedData.startsWith('https');

            // --- ИСПРАВЛЕНИЕ ОТОБРАЖЕНИЯ submitted_data ---
            // Возвращаемся к span, но всегда используем escapeHTML
            if (isUrl) {
                submissionContentHtml = `<a href="${escapeHTML(submittedData)}" target="_blank" rel="noopener noreferrer" style="color: var(--action-color); text-decoration: underline; word-break: break-all;">${escapeHTML(submittedData)}</a>`;
            } else {
                // Просто текст, экранированный
                submissionContentHtml = `<span>${escapeHTML(submittedData)}</span>`;
            }
            // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

            const actionLinkHtml = (action.quest_action_url && action.quest_action_url !== "")
                ? `<a href="${escapeHTML(action.quest_action_url)}" target="_blank" rel="noopener noreferrer" class="action-link-btn">Перейти</a>`
                : '';

            const isWizebotQuest = (action.title || "").toLowerCase().includes("сообщен");

            // --- ИСПРАВЛЕНИЕ: Добавляем описание квеста и проверяем данные ---
            // Убедимся, что все поля существуют перед использованием
            const questTitle = action.quest_title || action.title || 'Ручное задание'; // Берем quest_title, если есть
            const questDescription = action.quest_description || 'Описание отсутствует.';
            const rewardAmount = action.reward_amount || '?';
            const userFullName = action.user_full_name || 'Неизвестный';
            
            // --- 👇 ИЗМЕНЕНИЕ 1: Достаем username 👇 ---
            // (Предполагаем, что бэкенд отдает поле "user_username")
            const userUsername = action.username || '';
            // --- 👆 КОНЕЦ ИЗМЕНЕНИЯ 1 👆 ---

            const cardHtml = `
            <div class="quest-card admin-submission-card" id="submission-card-${action.id}">
                <h3 class="quest-title">${escapeHTML(questTitle)}</h3>

                <p style="font-size: 13px; color: var(--text-color-muted); line-height: 1.4; margin: 4px 0 10px; padding-bottom: 10px; border-bottom: 1px solid var(--divider-glass-color);">
                    <b>Описание задания:</b><br>${escapeHTML(questDescription)}
                </p>

                <p style="font-size: 13px; font-weight: 500; margin-bottom: 12px;">Награда: ${escapeHTML(rewardAmount)} ⭐</p>
                
                <div class="submission-user-header">
                    <p>Пользователь: <strong>${escapeHTML(userFullName)}</strong></p>
                    
                    <button type="button" 
                            class="admin-contact-btn admin-action-btn" 
                            data-user-id="${action.user_id}"
                            data-user-username="${escapeHTML(userUsername)}" 
                            style="background-color: #007aff; flex-shrink: 0;">
                        <i class="fa-solid fa-user"></i> Связаться
                    </button>
                    </div>
                <p style="margin-top: 10px; margin-bottom: 5px; font-weight: 600; font-size: 13px;">Данные для проверки:</p>
                <div class="submission-wrapper">
                    <div class="submission-data">${submissionContentHtml}</div>
                    ${actionLinkHtml}
                </div>

                ${isWizebotQuest ? `
                <div class="submission-actions" style="margin-top: 10px;">
                    <button class="admin-action-btn check-wizebot-btn" data-nickname="${escapeHTML(submittedData)}" style="background-color: #6441a5;">
                        <i class="fa-brands fa-twitch"></i> Проверить на Wizebot
                    </button>
                </div>
                <div class="wizebot-stats-result" style="margin-top: 10px; font-weight: 500;"></div>
                ` : ''}

                <div class="submission-actions">
                    <button class="admin-action-btn approve" data-id="${action.id}" data-action="approved">Одобрить</button>
                    <button class="admin-action-btn reject" data-id="${action.id}" data-action="rejected">Отклонить</button>

                    <button class="admin-action-btn reject-silent" data-id="${action.id}" data-action="rejected_silent" title="Отклонить без уведомления пользователя">
                        <i class="fa-solid fa-microphone-slash"></i>
                    </button>
                    </div>
            </div>`;
            targetElement.innerHTML += cardHtml;
        });
    }
    async function loadWeeklyGoalsData() {
    showLoader();
    try {
        // 1. Запрашиваем ВСЕ данные одновременно
        const [settings, goals, adminQuests, twitchRewards] = await Promise.all([
            makeApiRequest('/api/v1/admin/settings', {}, 'POST', true),
            api_loadWeeklyGoals(),
            makeApiRequest('/api/v1/admin/actions/list_entities', { entity_type: 'quest' }, 'POST', true),
            makeApiRequest('/api/v1/admin/twitch_rewards/list', {}, 'GET', true)
        ]);
        
        // 2. Кэшируем списки для "Выборщика"
        adminQuestsCache = adminQuests || [];
        adminTwitchRewardsCache = twitchRewards || [];

        // 3. Отображаем настройки
        if (dom.weeklyGoalsSettingsForm) {
            dom.weeklyGoalsSettingsForm.elements['is_enabled'].checked = settings.weekly_goals_enabled || false;
            dom.weeklyGoalsSettingsForm.elements['week_id'].value = settings.weekly_run_settings?.week_id || '';
            dom.weeklyGoalsSettingsForm.elements['super_prize_type'].value = settings.weekly_run_settings?.super_prize_type || 'none';
            dom.weeklyGoalsSettingsForm.elements['super_prize_value'].value = settings.weekly_run_settings?.super_prize_value || 0;
            dom.weeklyGoalsSettingsForm.elements['super_prize_description'].value = settings.weekly_run_settings?.super_prize_description || '';
            
            // Показываем/скрываем поле "Кол-во" для суперприза
            const prizeType = dom.weeklyGoalsSettingsForm.elements['super_prize_type'].value;
            dom.weeklyGoalSuperPrizeValueWrapper.classList.toggle('hidden', prizeType === 'none');
        }
        
        // 4. Отображаем список задач
        // ❗️❗️❗️ ИЗМЕНЕНИЕ ЗДЕСЬ ❗️❗️❗️
        renderWeeklyGoalsList(goals, settings.weekly_goals_enabled);
        
    } catch (e) {
        tg.showAlert(`Ошибка загрузки данных "Забега": ${e.message}`);
    } finally {
        hideLoader();
    }
}

/**
 * (v3) ОТРИСОВКА: Рендерит список созданных задач
 */
function renderWeeklyGoalsList(goals, is_system_enabled) { // ❗️❗️❗️ ИЗМЕНЕНИЕ ЗДЕСЬ ❗️❗️❗️
    if (!dom.weeklyGoalsList) return;
    dom.weeklyGoalsList.innerHTML = '';
    
    if (!goals || goals.length === 0) {
        dom.weeklyGoalsList.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Задач на эту неделю еще нет.</p>';
        return;
    }
    
    // Сортируем по sort_order
    goals.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    
    goals.forEach(goal => {
        const card = document.createElement('div');
        card.className = 'quest-card weekly-goal-card';
        
        // 🔽🔽🔽 НОВЫЙ БЛОК ДЛЯ СТАТУСА 🔽🔽🔽
        let statusHtml = '';
        if (goal.is_active && is_system_enabled) {
            statusHtml = '<span class="quest-status-badge status-active">Активна</span>';
        } else if (goal.is_active && !is_system_enabled) {
            statusHtml = '<span class="quest-status-badge" style="background-color: #555;">Вкл (Система выкл)</span>';
        } else {
            statusHtml = '<span class="quest-status-badge status-inactive">Выключена</span>';
        }
        // 🔼🔼🔼 КОНЕЦ НОВОГО БЛОКА 🔼🔼🔼

        // (v3) Форматируем "Цель"
        let targetText = '';
        if (goal.target_entity_id) {
            targetText = ` (ID: ${goal.target_entity_id})`;
        } else if (goal.target_entity_name) {
            targetText = ` (Имя: ${escapeHTML(goal.target_entity_name)})`;
        }

        card.innerHTML = `
            <div class="weekly-goal-header">
                <span class="weekly-goal-title">${escapeHTML(goal.title)}</span>
                ${statusHtml} <div class="weekly-goal-actions">
                    <button class="admin-edit-quest-btn edit-weekly-goal-btn" data-goal-id="${goal.id}">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="admin-delete-quest-btn delete-weekly-goal-btn" data-goal-id="${goal.id}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="weekly-goal-details">
                <p style="margin: 0;"><strong>Тип:</strong> ${escapeHTML(goal.task_type)}${targetText}</p>
                <p style="margin: 4px 0;"><strong>Прим:</strong> ${escapeHTML(goal.description || 'Нет')}</p>
                <p style="margin: 4px 0;"><strong>Цель:</strong> ${goal.target_value} раз(а)</p>
                <p style="margin: 4px 0;"><strong>Награда:</strong> ${goal.reward_type === 'tickets' ? `${goal.reward_value} билетов` : 'Нет'}</p>
                <p style="margin: 4px 0 0;"><strong>Порядок:</strong> ${goal.sort_order || 0}</p>
            </div>
        `;
        dom.weeklyGoalsList.appendChild(card);
    });
}

/**
 * (v3) API-Функции (для вызова из обработчиков)
 */
async function api_loadWeeklyGoals() {
    return makeApiRequest('/api/v1/admin/weekly_goals/list', {}, 'GET', true);
}
async function api_createWeeklyGoal(data) {
    return makeApiRequest('/api/v1/admin/weekly_goals/create', data);
}
async function api_deleteWeeklyGoal(goalId) {
    return makeApiRequest('/api/v1/admin/weekly_goals/delete', { goal_id: goalId });
}
async function api_saveWeeklyGoalSettings(settingsData) {
    // Используем эндпоинт v3
    return makeApiRequest('/api/v1/admin/weekly_goals/settings/update', { settings: settingsData }, 'POST', true);
}
async function api_getWeeklyGoalDetails(goalId) {
    // В v3 мы "читаем" из кэша (adminQuestsCache), а не делаем API-запрос
    const goals = await api_loadWeeklyGoals();
    const goal = goals.find(g => g.id === goalId);
    if (!goal) throw new Error('Задача не найдена');
    return goal;
}
async function api_updateWeeklyGoal(data) {
    return makeApiRequest('/api/v1/admin/weekly_goals/update', data);
}

/**
 * (v3) Сбрасывает форму "Новая Задача" в исходное состояние
 */
function resetWeeklyGoalForm() {
    const form = dom.weeklyGoalsCreateTaskForm;
    if (!form) return;
    
    form.reset();
    form.elements['description'].value = ''; // <-- 🔽 ДОБАВЬ ЭТУ СТРОКУ
    form.dataset.editingGoalId = '';
    
    // Сбрасываем v3-поля
    dom.weeklyGoalTargetEntityId.value = '';
    dom.weeklyGoalTargetEntityName.value = '';
    
    // Обновляем текст кнопки "Добавить Задачу"
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Добавить Задачу';
    
    // Прячем все опциональные блоки
    dom.weeklyGoalTaskRewardValueWrapper.classList.add('hidden');
    dom.weeklyGoalEntityPickerWrapper.classList.add('hidden');
    
    // Прячем кнопку "Отмена"
    dom.weeklyGoalCancelEditBtn.classList.add('hidden');
}

/**
 * (v3) Открывает модальное окно для выбора сущности (Квеста, Награды, Челленджа)
 */
function openEntityPickerModal(taskType) {
    let title = 'Выберите...';
    let dataList = [];
    
    // 1. Готовим данные в зависимости от task_type
    if (taskType === 'manual_quest_complete') {
        title = 'Выберите ручное задание';
        dataList = adminQuestsCache.map(q => ({
            id: q.id,
            name: q.title
        }));
        
    } else if (taskType === 'twitch_purchase') {
        title = 'Выберите награду Twitch';
        dataList = adminTwitchRewardsCache.map(r => ({
            id: r.id,
            name: r.title
        }));
        
    } else if (taskType === 'wizebot_challenge_complete') {
        title = 'Выберите Wizebot-челлендж';
        // (Мы не кэшируем челленджи, можно их загрузить при необходимости,
        // но пока оставим пустым, т.к. ты их не кэшировал)
        // dataList = ... 
        
        // Пока просто оставим заглушку
        dom.weeklyGoalEntitySelectList.innerHTML = '<p style="text-align: center;">Выбор челленджей пока не поддерживается.</p>';
        dom.weeklyGoalEntitySelectTitle.textContent = title;
        dom.weeklyGoalEntitySelectModal.classList.remove('hidden');
        return;
    }
    
    // 2. Рендерим список
    if (!dataList || dataList.length === 0) {
        dom.weeklyGoalEntitySelectList.innerHTML = `<p style="text-align: center;">Список (для ${taskType}) пуст.</p>`;
    } else {
        dom.weeklyGoalEntitySelectList.innerHTML = dataList.map(item => `
            <div class="submission-item" 
                 data-entity-id="${item.id}" 
                 data-entity-name="${escapeHTML(item.name)}"
                 style="cursor: pointer;">
                <p>${escapeHTML(item.name)}</p>
                <small>ID: ${item.id}</small>
            </div>
        `).join('');
    }
    
    // 3. Показываем модалку
    dom.weeklyGoalEntitySelectTitle.textContent = title;
    dom.weeklyGoalEntitySelectModal.classList.remove('hidden');
}


/**
 * (v3) ОБРАБОТЧИКИ: Подключаем кнопки
 */

// 1. Показать/скрыть поле "Кол-во" для СУПЕРПРИЗА
if (dom.weeklyGoalSuperPrizeType) {
    dom.weeklyGoalSuperPrizeType.addEventListener('change', (e) => {
        const type = e.target.value;
        dom.weeklyGoalSuperPrizeValueWrapper.classList.toggle('hidden', type === 'none');
    });
}

// 2. Показать/скрыть поле "Кол-во" для ОПЦИОНАЛЬНОЙ НАГРАДЫ
if (dom.weeklyGoalTaskRewardType) {
    dom.weeklyGoalTaskRewardType.addEventListener('change', (e) => {
        const type = e.target.value;
        dom.weeklyGoalTaskRewardValueWrapper.classList.toggle('hidden', type === 'none');
    });
}

// 3. (v3) Показать/скрыть "Выборщик" (Picker) при смене ТИПА ЗАДАЧИ
if (dom.weeklyGoalTaskTypeSelect) {
    dom.weeklyGoalTaskTypeSelect.addEventListener('change', (e) => {
        const taskType = e.target.value;
        
        // Задачи, требующие выбора (Q1, Q3)
        const needsPicker = [
            'manual_quest_complete',
            'twitch_purchase',
            'wizebot_challenge_complete'
        ];
        
        // Задачи, требующие ввода цели (статистика)
        const needsTargetInput = taskType.startsWith('stat_');

        if (needsPicker.includes(taskType)) {
            // Показываем "Выборщик"
            dom.weeklyGoalEntityPickerWrapper.classList.remove('hidden');
            
            // Сбрасываем старый выбор
            dom.weeklyGoalTargetEntityId.value = '';
            dom.weeklyGoalTargetEntityName.value = '';
            dom.weeklyGoalEntityDisplay.classList.remove('selected');
            dom.weeklyGoalEntityDisplay.querySelector('span').textContent = 'Ничего не выбрано';
            
            // Меняем текст кнопки
            if (taskType === 'manual_quest_complete') {
                dom.weeklyGoalSelectEntityBtn.textContent = 'Выбрать ручное задание...';
            } else if (taskType === 'twitch_purchase') {
                dom.weeklyGoalSelectEntityBtn.textContent = 'Выбрать награду Twitch...';
            } else if (taskType === 'wizebot_challenge_complete') {
                dom.weeklyGoalSelectEntityBtn.textContent = 'Выбрать Wizebot-челлендж...';
            }
            
        } else if (needsTargetInput) {
            // (Q2) Это пассивная задача (статистика)
            dom.weeklyGoalEntityPickerWrapper.classList.add('hidden');
            // Убедимся, что ID/Имя сброшены
            dom.weeklyGoalTargetEntityId.value = '';
            dom.weeklyGoalTargetEntityName.value = '';
            
        } else {
            // Это простая задача (ставка, котел)
            dom.weeklyGoalEntityPickerWrapper.classList.add('hidden');
            dom.weeklyGoalTargetEntityId.value = '';
            dom.weeklyGoalTargetEntityName.value = '';
        }
    });
}

// 4. (v3) Клик по кнопке "Выбрать..." (открывает модалку)
if (dom.weeklyGoalSelectEntityBtn) {
    dom.weeklyGoalSelectEntityBtn.addEventListener('click', () => {
        const taskType = dom.weeklyGoalTaskTypeSelect.value;
        openEntityPickerModal(taskType);
    });
}

// 5. (v3) Клик по элементу в модальном окне "Выборщика"
if (dom.weeklyGoalEntitySelectList) {
    dom.weeklyGoalEntitySelectList.addEventListener('click', (e) => {
        const item = e.target.closest('.submission-item');
        if (!item) return;
        
        const entityId = item.dataset.entityId;
        const entityName = item.dataset.entityName;
        const taskType = dom.weeklyGoalTaskTypeSelect.value;
        
        // 1. Заполняем скрытые поля
        dom.weeklyGoalTargetEntityId.value = entityId;
        dom.weeklyGoalTargetEntityName.value = entityName;
        
        // 2. Обновляем дисплей
        dom.weeklyGoalEntityDisplay.classList.add('selected');
        let displayText = '';
        if (taskType === 'twitch_purchase') {
            displayText = `[ИМЯ] ${entityName}`; // (Q3) Используем Имя
        } else {
            displayText = `[ID: ${entityId}] ${entityName}`; // (Q1) Используем ID
        }
        dom.weeklyGoalEntityDisplay.querySelector('span').textContent = displayText;
        
        // 3. Закрываем модалку
        dom.weeklyGoalEntitySelectModal.classList.add('hidden');
    });
}


// 6. Сохранение НАСТРОЕК (Суперприз и Вкл/Выкл)
if (dom.saveWeeklySettingsBtn) {
    console.log('[DEBUG] setupEventListeners() - Кнопка dom.saveWeeklySettingsBtn НАЙДЕНА. Привязываем "click"...');
    
    dom.saveWeeklySettingsBtn.addEventListener('click', async () => {
        console.log('[DEBUG] "Сохранить Настройки" (Недельный Забег) - КЛИК');
        
        // Вручную находим форму, так как 'e.target' - это кнопка
        const form = dom.weeklyGoalsSettingsForm; 
        if (!form) {
            console.error('[DEBUG] Кнопка нажата, но форма weeklyGoalsSettingsForm не найдена!');
            tg.showAlert('Критическая ошибка: Форма настроек не найдена.');
            return;
        }

        // 1. Собираем СПЕЦИАЛЬНЫЕ настройки "Забега" (ID недели, Суперприз)
        const weeklySettingsData = {
            week_id: form.elements['week_id'].value.trim(),
            super_prize_type: form.elements['super_prize_type'].value,
            super_prize_value: parseInt(form.elements['super_prize_value'].value, 10) || 0,
            super_prize_description: form.elements['super_prize_description'].value.trim()
        };
        console.log('[DEBUG] 1. Собраны данные Недельного Забега (SuperPrize, WeekID):', weeklySettingsData);

        // 2. Получаем ОДНО значение, которое мы меняем (Вкл/Выкл "Забег")
        const isEnabled = form.elements['is_enabled'].checked;
        console.log('[DEBUG] 2. Собраны данные Глобального Переключателя (isEnabled):', isEnabled);

        try {
            // Показываем лоадер НА ВСЮ ОПЕРАЦИЮ
            console.log('[DEBUG] 3. Показываем Loader...');
            showLoader();

            // 3. Загружаем ТЕКУЩИЕ глобальные настройки с сервера
            console.log('[DEBUG] 4. Запрашиваем /api/v1/admin/settings (POST)...');
            const currentGlobalSettings = await makeApiRequest('/api/v1/admin/settings', {}, 'POST', true);
            console.log('[DEBUG] 5. Получены Глобальные Настройки:', currentGlobalSettings);
            
            // 4. Модифицируем в них ТОЛЬКО ОДНО поле
            currentGlobalSettings.weekly_goals_enabled = isEnabled;
            console.log('[DEBUG] 6. Модифицированы Глобальные Настройки (установлено weekly_goals_enabled).');

            // 5. Отправляем ДВА запроса
            
            // Запрос 1: Сохраняем ОБНОВЛЕННЫЕ ГЛОБАЛЬНЫЕ настройки
            console.log('[DEBUG] 7. Отправляем /api/v1/admin/settings/update (POST) с Глобальными Настройками...');
            await makeApiRequest('/api/v1/admin/settings/update', { 
                settings: currentGlobalSettings 
            }, 'POST', true); // true = "тихо"
            console.log('[DEBUG] 8. /api/v1/admin/settings/update - УСПЕХ.');
            
            // Запрос 2: Сохраняем СПЕЦИАЛЬНЫЕ настройки "Забега" (Суперприз, ID недели)
            console.log('[DEBUG] 9. Отправляем /api/v1/admin/weekly_goals/settings/update (POST) с Настройками Забега...');
            await api_saveWeeklyGoalSettings(weeklySettingsData); 
            console.log('[DEBUG] 10. /api/v1/admin/weekly_goals/settings/update - УСПЕХ.');
            
            tg.showAlert('Настройки "Недельного Забега" сохранены!');
            console.log('[DEBUG] 11. Показан Alert.');
            
            // 6. (Важно!) Синхронизируем переключатель на главной стр. настроек
            if (dom.settingWeeklyGoalsEnabled) { // Проверяем, что элемент существует
                dom.settingWeeklyGoalsEnabled.checked = isEnabled;
                console.log('[DEBUG] 12. Синхронизирован главный переключатель (settingWeeklyGoalsEnabled).');
            }
            
        } catch (err) {
            console.error('[DEBUG] ОШИБКА в блоке try:', err);
            tg.showAlert(`Ошибка сохранения: ${err.message}`);
        } finally {
            // Прячем лоадер в любом случае
            console.log('[DEBUG] 13. Блок finally, прячем Loader.');
            hideLoader();
        }
    });
} else { 
     console.error('[DEBUG] setupEventListeners() - КРИТИЧЕСКАЯ ОШИБКА: Элемент dom.saveWeeklySettingsBtn (id: "save-weekly-settings-btn") НЕ НАЙДЕН. Кнопка работать не будет.');
}

// 7. Создание или Редактирование ЗАДАЧИ
if (dom.weeklyGoalsCreateTaskForm) {
    dom.weeklyGoalsCreateTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const goalId = form.dataset.editingGoalId; // Проверяем, в режиме ли мы редактирования
        
        const data = {
            title: form.elements['title'].value.trim(),
            description: form.elements['description'].value.trim(), // <-- 🔽 ДОБАВЬ ЭТУ СТРОКУ
            task_type: form.elements['task_type'].value,
            week_id: document.getElementById('weekly-goal-week-id').value.trim(),
            target_value: parseInt(form.elements['target_value'].value, 10) || 1,
            reward_type: form.elements['reward_type'].value,
            reward_value: parseInt(form.elements['reward_value'].value, 10) || 0,
            sort_order: parseInt(form.elements['sort_order'].value, 10) || 0,
            is_active: form.elements['is_active'].checked, // 👈 ❗️❗️❗️ ДОБАВЬ ЭТУ СТРОКУ ❗️❗️❗️
            
            // 🔽 v3: Добавляем ID и Имя 🔽
            target_entity_id: form.elements['target_entity_id'].value ? parseInt(form.elements['target_entity_id'].value, 10) : null,
            target_entity_name: form.elements['target_entity_name'].value || null
        };
        
        // (v3) Валидация: если это стат-задача, ID/Имя должны быть NULL
        if (data.task_type.startsWith('stat_')) {
            data.target_entity_id = null;
            data.target_entity_name = null;
        }

        try {
            if (goalId) {
                // РЕЖИМ РЕДАКТИРОВАНИЯ
                await api_updateWeeklyGoal({ ...data, goal_id: goalId });
                tg.showAlert('Задача обновлена!');
            } else {
                // РЕЖИМ СОЗДАНИЯ
                await api_createWeeklyGoal(data);
                tg.showPopup({ message: 'Задача создана!' });
            }
            
            // Сбрасываем форму (v3)
            resetWeeklyGoalForm();
            
            const goals = await api_loadWeeklyGoals();
            renderWeeklyGoalsList(goals);
            
        } catch (err) {
            tg.showAlert(`Ошибка: ${err.message}`);
        }
    });
}

// 8. (v3) Кнопка "Отмена" (сброс формы)
if (dom.weeklyGoalCancelEditBtn) {
    dom.weeklyGoalCancelEditBtn.addEventListener('click', () => {
        resetWeeklyGoalForm();
    });
}

// 9. Обработка кнопок "Редактировать" / "Удалить" в списке
if (dom.weeklyGoalsList) {
    dom.weeklyGoalsList.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-weekly-goal-btn');
        const editBtn = e.target.closest('.edit-weekly-goal-btn');
        
        if (deleteBtn) {
            // УДАЛЕНИЕ
            const goalId = deleteBtn.dataset.goalId;
            tg.showConfirm('Удалить эту задачу?', async (ok) => {
                if (ok) {
                    try {
                        await api_deleteWeeklyGoal(goalId);
                        tg.showPopup({ message: 'Задача удалена' });
                        const goals = await api_loadWeeklyGoals();
                        renderWeeklyGoalsList(goals);
                    } catch (err) {
                        tg.showAlert(`Ошибка удаления: ${err.message}`);
                    }
                }
            });
            
        } else if (editBtn) {
            // РЕДАКТИРОВАНИЕ
            const goalId = editBtn.dataset.goalId;
            try {
                showLoader();
                const goal = await api_getWeeklyGoalDetails(goalId);
                const form = dom.weeklyGoalsCreateTaskForm;
                
                // Заполняем форму
                form.elements['title'].value = goal.title;
                form.elements['description'].value = goal.description || ''; // <-- 🔽 ДОБАВЬ ЭТУ СТРОКУ
                form.elements['task_type'].value = goal.task_type;
                form.elements['week_id_hidden_for_edit'].value = document.getElementById('weekly-goal-week-id').value.trim();
                form.elements['target_value'].value = goal.target_value;
                form.elements['reward_type'].value = goal.reward_type;
                form.elements['reward_value'].value = goal.reward_value || 0;
                form.elements['sort_order'].value = goal.sort_order || 0;
                form.elements['is_active'].checked = goal.is_active;
                
                // (v3) Заполняем ID и Имя
                form.elements['target_entity_id'].value = goal.target_entity_id || '';
                form.elements['target_entity_name'].value = goal.target_entity_name || '';
                
                // (v3) Показываем/скрываем нужные поля
                // 1. Поле "Кол-во" (награда)
                dom.weeklyGoalTaskRewardValueWrapper.classList.toggle('hidden', goal.reward_type === 'none');
                
                // 2. "Выборщик"
                const needsPicker = ['manual_quest_complete', 'twitch_purchase', 'wizebot_challenge_complete'].includes(goal.task_type);
                dom.weeklyGoalEntityPickerWrapper.classList.toggle('hidden', !needsPicker);
                
                if (needsPicker) {
                    // Обновляем дисплей "Выборщика"
                    dom.weeklyGoalEntityDisplay.classList.add('selected');
                    let displayText = '';
                    if (goal.task_type === 'twitch_purchase') {
                        displayText = `[ИМЯ] ${goal.target_entity_name || '???'}`;
                    } else {
                        displayText = `[ID: ${goal.target_entity_id || '???'}] ${goal.title}`; // (Тут можно улучшить, но пока так)
                    }
                    dom.weeklyGoalEntityDisplay.querySelector('span').textContent = displayText;
                }
                
                // Меняем режим формы
                form.dataset.editingGoalId = goalId;
                
                // --- 🔽 ИЗМЕНЕННЫЙ БЛОК 🔽 ---
                // 1. Меняем заголовок в шапке МОДАЛЬНОГО ОКНА
                const modalTitle = document.getElementById('admin-create-goal-modal-title');
                if (modalTitle) modalTitle.textContent = 'Редактирование Задачи';
                
                // 2. Меняем текст кнопки
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.textContent = 'Сохранить Изменения';
                
                dom.weeklyGoalCancelEditBtn.classList.remove('hidden'); // Показываем кнопку "Отмена"
                
                // 3. Показываем модальное окно для редактирования
                if (dom.adminCreateGoalModal) {
                    dom.adminCreateGoalModal.classList.remove('hidden');
                }
                // --- 🔼 КОНЕЦ ИЗМЕНЕНИЙ 🔼 ---
                
                // Скроллим к форме
                form.scrollIntoView({ behavior: 'smooth' });
                form.elements['title'].focus();
                
            } catch (err) {
                tg.showAlert(`Ошибка: ${err.message}`);
            } finally {
                hideLoader();
            }
        }
    });
}
    
    function setupEventListeners() {
        // [НАЧАЛО] ВСТАВЬ ЭТОТ ЛОГ
        console.log('[DEBUG] setupEventListeners() - ФУНКЦИЯ ЗАПУЩЕНА. Начинаем привязку...');
        // [КОНЕЦ] ВСТАВЬ ЭТОТ ЛОГ
        if(document.getElementById('refresh-purchases-btn')) {
            document.getElementById('refresh-purchases-btn').addEventListener('click', (e) => {
                const btn = e.currentTarget;
                const { rewardId, rewardTitle } = btn.dataset;
                if (rewardId && rewardTitle) {
                    openTwitchPurchases(rewardId, rewardTitle);
                }
            });
        }

        const cauldronTriggersContainer = document.getElementById('cauldron-triggers-container');
        if(cauldronTriggersContainer) {
            cauldronTriggersContainer.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('.remove-trigger-btn');
                if (removeBtn) {
                    removeBtn.closest('.cauldron-trigger-row').remove();
                }
            });
        }
        // --- 👇👇👇 ДОБАВЬТЕ ЭТОТ БЛОК 👇👇👇 ---
        const reloadPendingBtn = document.getElementById('reload-pending-actions-btn');
        if (reloadPendingBtn) {
            reloadPendingBtn.addEventListener('click', async () => {
                showLoader(); // Показываем лоадер
                await loadPendingActions(); // Вызываем функцию загрузки
                hideLoader(); // Прячем лоадер
            });
        }
        // --- НАЧАЛО НОВОГО КОДА ---
        const reloadTwitchBtn = document.getElementById('reload-twitch-rewards-btn');
        if (reloadTwitchBtn) {
            reloadTwitchBtn.addEventListener('click', async () => {
                // tg.showPopup({message: 'Обновление...'}); // <-- УБИРАЕМ ЭТУ СТРОКУ
                showLoader(); // Показываем лоадер
                await loadTwitchRewards(); // Вызываем функцию загрузки
                hideLoader(); // Прячем лоадер
            });
        }
        // --- КОНЕЦ НОВОГО КОДА ---
        if(document.getElementById('twitch-purchases-body')) {
            document.getElementById('twitch-purchases-body').addEventListener('click', (e) => {
                const link = e.target.closest('a');
                if (!link) return;

                const purchaseItem = link.closest('.purchase-item');
                if (!purchaseItem) return;

                const purchaseId = parseInt(purchaseItem.dataset.purchaseId);
                if (!purchaseId) return;

                const statusEl = purchaseItem.querySelector('.purchase-view-status');
                if (statusEl && !statusEl.classList.contains('status-viewed')) {
                    statusEl.textContent = 'Просмотрено';
                    statusEl.classList.remove('status-not-viewed');
                    statusEl.classList.add('status-viewed');

                    try {
                        const viewedRaw = localStorage.getItem('viewed_purchases') || '[]';
                        const viewedArray = JSON.parse(viewedRaw);
                        const viewedSet = new Set(viewedArray);
                        viewedSet.add(purchaseId);
                        localStorage.setItem('viewed_purchases', JSON.stringify([...viewedSet]));
                    } catch (err) {
                        console.error("Failed to update viewed status in localStorage:", err);
                    }
                }
            });
        }
        // --- 🔽 НОВЫЙ КОД ДЛЯ СБРОСА ПРОГРЕССА 1 ЮЗЕРА 🔽 ---
    if (dom.adminResetUserWeeklyProgressSearchBtn) {
        // 1. Клик по кнопке "Найти пользователя"
        dom.adminResetUserWeeklyProgressSearchBtn.addEventListener('click', () => {
            dom.adminResetUserWeeklyProgressForm.classList.add('hidden'); // Прячем форму
            openAdminUserSearchModal('Сбросить "Забег" для...', (user) => {
                // Коллбэк после выбора пользователя
                dom.adminResetUserWeeklyProgressForm.elements['user_id_to_reset_weekly'].value = user.id;
                dom.adminResetUserWeeklyProgressUserName.textContent = `${user.name} (ID: ${user.id})`;
                dom.adminResetUserWeeklyProgressForm.classList.remove('hidden'); // Показываем форму
            });
        });
    }

    if (dom.adminResetUserWeeklyProgressForm) {
        // 2. Отправка самой формы (после выбора пользователя)
        dom.adminResetUserWeeklyProgressForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const btn = form.querySelector('button[type="submit"]'); // <-- ДОБАВЛЕНО
            const userId = parseInt(form.elements['user_id_to_reset_weekly'].value);
            const userName = dom.adminResetUserWeeklyProgressUserName.textContent;

            if (!userId) {
                tg.showAlert('Пользователь не выбран.');
                return;
            }

            tg.showConfirm(`Точно сбросить ВЕСЬ прогресс "Забега" для ${userName}?`, async (ok) => {
                if (ok) {
                    btn.disabled = true; // <-- ДОБАВЛЕНО
                    btn.textContent = 'Сброс...'; // <-- ДОБАВЛЕНО
                    try {
                        // Вызываем новый эндпоинт
                        const result = await makeApiRequest('/api/v1/admin/weekly_goals/clear_user_progress', {
                            user_id_to_clear: userId
                        });
                        tg.showAlert(result.message);
                        form.reset();
                        form.classList.add('hidden');
                        selectedAdminUser = null; // Сброс
                    } catch (err) {
                        tg.showAlert(`Ошибка: ${err.message}`);
                    } finally {
                        btn.disabled = false; // <-- ДОБАВЛЕНО
                        btn.textContent = 'Подтвердить сброс'; // <-- ДОБАВЛЕНО
                    }
                }
            });
        });
    }
    // --- 🔼 КОНЕЦ НОВОГО КОДА 🔼 ---
        // --- 🔽🔽🔽 ВСТАВЬ НЕДОСТАЮЩИЙ БЛОК СЮДА 🔽🔽🔽 ---
    if (dom.adminClearAllWeeklyProgressBtn) {
        dom.adminClearAllWeeklyProgressBtn.addEventListener('click', (e) => { // Добавили (e)
            const btn = e.currentTarget; // <-- ДОБАВЛЕНО
            tg.showConfirm('ВНИМАНИЕ! Это действие необратимо. ...', async (ok) => {
                if (ok) {
                    btn.disabled = true; // <-- ДОБАВЛЕНО
                    btn.textContent = 'Очистка...'; // <-- ДОБАВЛЕНО (Опционально)
                    try {
                        // (тут твой код вызова makeApiRequest)
                        const result = await makeApiRequest('/api/v1/admin/weekly_goals/clear_all_progress');
                        tg.showAlert(result.message);
                        
                        if(document.getElementById('view-admin-weekly-goals').classList.contains('hidden') === false) {
                           await loadWeeklyGoalsData(); 
                        }
                    } catch (err) {
                        tg.showAlert(`Ошибка очистки: ${err.message}`);
                    } finally {
                        btn.disabled = false; // <-- ДОБАВЛЕНО
                        btn.textContent = 'Очистить ВЕСЬ прогресс забега'; // <-- ДОБАВЛЕНО
                    }
                }
            });
        });
    }
    // --- 🔼🔼🔼 КОНЕЦ НОВОГО БЛОКА 🔼🔼🔼 ---
        // --- 👇👇👇 ВОТ НОВЫЙ БЛОК (Логика №3) 👇👇👇 ---
        // Динамически прячем поле "Количество" при выборе
        const rewardTypeSelect = document.getElementById('reward-type-select');
        if (rewardTypeSelect) {
            rewardTypeSelect.addEventListener('change', () => {
                const rewardAmountInput = document.getElementById('reward-amount-input');
                // Ищем <label> перед инпутом
                const rewardAmountLabel = rewardAmountInput ? rewardAmountInput.previousElementSibling : null;
                
                const isNone = rewardTypeSelect.value === 'none';
                
                if (rewardAmountInput) {
                    rewardAmountInput.required = !isNone;
                    rewardAmountInput.style.display = isNone ? 'none' : 'block';
                }
                if (rewardAmountLabel && rewardAmountLabel.tagName === 'LABEL') {
                    rewardAmountLabel.style.display = isNone ? 'none' : 'block';
                }
            });
        }
        // --- 👆👆👆 КОНЕЦ НОВОГО БЛОКА 👆👆👆 ---
      
        const twitchRewardSettingsForm = document.getElementById('twitch-reward-settings-form');
        if(twitchRewardSettingsForm) {
            twitchRewardSettingsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                // Базовый payload
                const payload = {
                    id: parseInt(form.elements['reward_id'].value),
                    is_active: form.elements['is_active'].checked,
                    notify_admin: form.elements['notify_admin'].checked,
                    show_user_input: form.elements['show_user_input'].checked,
                    condition_type: form.elements['condition_type'].value || null,
                    target_value: form.elements['target_value'].value ? parseInt(form.elements['target_value'].value) : null
                };

                if (hasAdminAccess) {
                    // Админ 6971 сохраняет новые поля
                    payload.reward_type = form.elements['reward_type'].value;

                    // --- 👇👇👇 ВОТ ИЗМЕНЕНИЕ (Логика №4) 👇👇👇 ---
                    // Сохраняем 0, если тип "none"
                    if (payload.reward_type === 'none') {
                        payload.reward_amount = 0;
                    } else {
                        // Иначе берем значение из инпута (или 10 по умолчанию)
                        const amountVal = form.elements['reward_amount'].value;
                        payload.reward_amount = (amountVal && !isNaN(parseInt(amountVal))) ? parseInt(amountVal) : 10;
                    }
                    // --- 👆👆👆 КОНЕЦ ИЗМЕНЕНИЯ 👆👆👆 ---
                    
                    // Также обновляем старое поле, чтобы модераторы видели актуальное
                    payload.promocode_amount = payload.reward_amount;
                    
                    // Добавляем сохранение sort_order
                    const sortOrderVal = form.elements['sort_order'].value;
                    payload.sort_order = sortOrderVal.trim() === '' ? null : parseInt(sortOrderVal, 10);

                } else {
                    // Модератор сохраняет только старое поле
                    payload.promocode_amount = parseInt(form.elements['promocode_amount'].value);
                    // Убедимся, что тип 'promocode', если модератор сохраняет
                    payload.reward_type = 'promocode'; 
                    payload.reward_amount = payload.promocode_amount;
                }

                await makeApiRequest('/api/v1/admin/twitch_rewards/update', payload);
                document.getElementById('twitch-reward-settings-modal').classList.add('hidden');
                tg.showAlert('Настройки сохранены!');
                await loadTwitchRewards();
            });
        }

        if(document.getElementById('delete-twitch-reward-btn')) {
            document.getElementById('delete-twitch-reward-btn').addEventListener('click', async () => {
                const form = document.getElementById('twitch-reward-settings-form');
                const rewardId = parseInt(form.elements['reward_id'].value);
                if (!rewardId) {
                    tg.showAlert('Ошибка: ID награды не найден.');
                    return;
                }

                tg.showConfirm('Вы уверены, что хотите удалить эту награду? Это действие необратимо и удалит ВСЕ связанные с ней покупки.', async (ok) => {
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
                console.log('--- ✅ 1. КЛИК ПО TABS-CONTAINER ---');

                // Лог для проверки, какой CSS файл загружен
                try {
                    const cssLink = document.querySelector('link[href="admin.css"]');
                    if (cssLink) {
                        console.log('--- ℹ️ 0. CSS-файл <link href="admin.css"> найден на странице.');
                    } else {
                        console.warn('--- ⚠️ 0. ВНИМАНИЕ: <link href="admin.css"> НЕ НАЙДЕН! Проверьте HTML.');
                    }
                } catch (e) {}

                const button = e.target.closest('.tab-button');

                if (!button) {
                    console.log('--- 🛑 2. ОСТАНОВКА: Клик был, но не по кнопке.');
                    return;
                }
                console.log('--- ✅ 2. Button найден:', button.textContent.trim());

                if (button.classList.contains('active')) {
                    console.log('--- 🛑 3. ОСТАНОВКА: Кнопка уже активна.');
                    return;
                }
                console.log('--- ✅ 3. Кнопка не активна, продолжаем.');

                const tabId = button.dataset.tab;
                console.log('--- ✅ 4. Получен data-tab:', tabId);

                if (container.classList.contains('main-tabs')) {
                    console.log('--- ✅ 5. Это главный .main-tabs контейнер.');

                    if (tabId === 'admin') {
                        console.log('--- ✅ 6. Клик по вкладке "admin".');
                        console.log('--- ❓ 7. Проверяем hasAdminAccess. Текущее значение:', hasAdminAccess);

                        if (!hasAdminAccess) {
                            console.log('--- 🚀 8. hasAdminAccess = false. ПЫТАЕМСЯ ПОКАЗАТЬ ОКНО ПАРОЛЯ...');
                            
                            if (dom.passwordPromptOverlay) {
                                // === ГЛАВНОЕ ДЕЙСТВИЕ ===
                                dom.passwordPromptOverlay.classList.remove('hidden');
                                // ========================
                                
                                console.log('--- ✅ 9. Класс .hidden УДАЛЕН. classList:', dom.passwordPromptOverlay.classList);

                                // === НОВЫЕ УГЛУБЛЕННЫЕ ЛОГИ ===
                                const computedStyle = window.getComputedStyle(dom.passwordPromptOverlay);
                                console.log('--- 🔍 10. Проверка CSS (Computed Style):');
                                console.log(`---    > display: [${computedStyle.display}]`);
                                console.log(`---    > visibility: [${computedStyle.visibility}]`);
                                console.log(`---    > opacity: [${computedStyle.opacity}]`);
                                console.log(`---    > z-index: [${computedStyle.zIndex}]`);

                                if (computedStyle.display === 'none') {
                                    console.error('--- 🚨 ПРОБЛЕМА: CSS все еще говорит "display: none". Это !important в .hidden или конфликт CSS.');
                                } else if (computedStyle.visibility === 'hidden') {
                                    console.error('--- 🚨 ПРОБЛЕМА: CSS говорит "visibility: hidden".');
                                } else if (parseFloat(computedStyle.opacity) === 0) {
                                    console.warn('--- ⚠️ ПРОБЛЕМА?: Окно видимо, но полностью прозрачно (opacity: 0).');
                                } else {
                                    console.log('--- ✅ 11. Судя по CSS, окно должно быть видно.');
                                }
                                // === КОНЕЦ НОВЫХ ЛОГОВ ===

                                dom.passwordPromptInput.focus();
                                
                                e.stopPropagation(); // <--- ВОТ ИСПРАВЛЕНИЕ

                            } else {
                                console.error('--- 🚨 9. КРИТИЧЕСКАЯ ОШИБКА: dom.passwordPromptOverlay НЕ НАЙДЕН!');
                            }
                            return; 
                        } else {
                            console.log('--- ℹ️ 8. hasAdminAccess = true. Окно пароля не нужно.');
                        }
                    }
                } else {
                    console.log('--- ℹ️ 5. Это не .main-tabs, а другой контейнер.');
                }

                // --- (Остальная логика переключения вкладок) ---
                console.log(`--- 🔄 Переключаем вкладку на ${tabId}...`);
                container.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                const parentElement = container.closest('.view');

                if (container.classList.contains('main-tabs')) {
                    document.getElementById('tab-content-main').classList.toggle('hidden', tabId !== 'main');
                    document.getElementById('tab-content-admin').classList.toggle('hidden', tabId !== 'admin');
                } else if (parentElement) {
                     if (container.id === 'cauldron-tabs') {
                         parentElement.querySelectorAll('.tab-content').forEach(content => {
                            if(content.id.startsWith('tab-content-cauldron-')) {
                                content.classList.toggle('hidden', content.id !== `tab-content-${tabId}`);
                            }
                        });
                    } else {
                        parentElement.querySelectorAll('.tab-content').forEach(content => {
                            content.classList.toggle('hidden', content.id !== `tab-content-${tabId}`);
                        });
                    }
                }
                console.log('--- ✅ 12. КОНЕЦ ОБРАБОТЧИКА КЛИКА ---');
            });
        });

    const editPrizeModal = document.getElementById('edit-roulette-prize-modal');
    const editPrizeForm = document.getElementById('edit-roulette-prize-form');

    // Открытие модального окна при клике на кнопку "Редактировать"
    if (dom.roulettePrizesList) {
        dom.roulettePrizesList.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-roulette-prize-btn');
            if (editBtn && editPrizeModal && editPrizeForm) {
                const prizeData = JSON.parse(editBtn.dataset.prize);
                editPrizeForm.elements['prize_id'].value = prizeData.id;
                editPrizeForm.elements['reward_title'].value = prizeData.reward_title;
                editPrizeForm.elements['skin_name'].value = prizeData.skin_name;
                editPrizeForm.elements['image_url'].value = prizeData.image_url;
                editPrizeForm.elements['chance_weight'].value = prizeData.chance_weight;
                editPrizeForm.elements['quantity'].value = prizeData.quantity;
                editPrizeModal.classList.remove('hidden');
            }
        });
    }

    // Сохранение изменений при отправке формы редактирования
    if (editPrizeForm) {
        editPrizeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const prizeId = parseInt(form.elements['prize_id'].value);
            const quantity = parseInt(form.elements['quantity'].value);

            if (isNaN(quantity) || quantity < 0) {
                 tg.showAlert('Количество должно быть 0 или больше.');
                 return;
            }

            const data = {
                prize_id: prizeId,
                reward_title: form.elements['reward_title'].value,
                skin_name: form.elements['skin_name'].value,
                image_url: form.elements['image_url'].value,
                chance_weight: parseFloat(form.elements['chance_weight'].value),
                quantity: quantity
            };

            await makeApiRequest('/api/v1/admin/roulette/update', data);
            tg.showAlert('Приз обновлен!');
            if (editPrizeModal) editPrizeModal.classList.add('hidden');

            // Перезагружаем список призов
            const prizes = await makeApiRequest('/api/v1/admin/roulette/prizes', {}, 'POST', true);
            renderRoulettePrizes(prizes);
        });
    }

    // Закрытие модального окна (убедись, что этот код уже есть или добавь его)
    document.body.addEventListener('click', (event) => {
        const target = event.target;
        const closeButton = target.closest('[data-close-modal]');
        if (closeButton) {
            const modalId = closeButton.dataset.closeModal;
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.add('hidden');
            }
        } else if (target.classList.contains('modal-overlay') && target.id !== 'admin-create-goal-modal') { // <-- ВОТ ИЗМЕНЕНИЕ
             target.classList.add('hidden'); // Закрытие по клику на фон
        }
    });

        if(dom.passwordPromptCancel) {
            dom.passwordPromptCancel.addEventListener('click', () => {
                dom.passwordPromptOverlay.classList.add('hidden');
            });
        }

        if(dom.passwordPromptConfirm) {
            dom.passwordPromptConfirm.addEventListener('click', async () => {
                const password = dom.passwordPromptInput.value;
                if (!password) return;

                // Новая проверка пароля 6971
                if (password === ADMIN_PASSWORD) {
                    hasAdminAccess = true; // <-- Устанавливаем флаг админа
                    dom.passwordPromptOverlay.classList.add('hidden');
                    dom.passwordPromptInput.value = '';

                    // Показываем все скрытые элементы админа
                    document.querySelectorAll('.admin-feature-6971').forEach(el => {
                        el.style.display = 'block'; // или 'flex'
                    });
                    
                    // Показываем инпуты сортировки на уже загруженных страницах (если они есть)
                    document.querySelectorAll('.reward-sort-order-input').forEach(el => {
                        el.style.display = 'block';
                    });

                    const adminTabButton = document.querySelector('.tabs-container.main-tabs .tab-button[data-tab="admin"]');
                    // Переключаем вкладку, только если мы не выполняем другое действие
                    if(adminTabButton && !afterPasswordCallback) { 
                         adminTabButton.click();
                    }

                    // Выполняем отложенное действие, если оно есть
                    if (typeof afterPasswordCallback === 'function') {
                        afterPasswordCallback();
                        afterPasswordCallback = null; // Сбрасываем
                    }

                } else {
                    // Старая проверка (на случай, если у модераторов другой пароль)
                    try {
                        const result = await makeApiRequest('/api/v1/admin/verify_password', { password });
                        if (result.success) {
                            // hasAdminAccess остается false, это просто модератор
                            dom.passwordPromptOverlay.classList.add('hidden');
                            dom.passwordPromptInput.value = '';
                            const adminTabButton = document.querySelector('.tabs-container.main-tabs .tab-button[data-tab="admin"]');
                            if(adminTabButton) adminTabButton.click();
                        } else {
                            tg.showAlert('Неверный пароль!');
                        }
                    } catch (error) {
                        tg.showAlert('Ошибка проверки пароля.');
                        console.error('Ошибка верификации пароля:', error);
                    }
                }
            });
        }

        if (dom.cauldronSettingsForm) {
            dom.cauldronSettingsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                tg.showConfirm('Сохранить все настройки для ивента "Котел"?', async (ok) => {
                    if (ok) {
                        try {
                            const eventData = collectCauldronData();
                            const currentStatus = await makeApiRequest('/api/v1/events/cauldron/status', {}, 'GET', true).catch(() => ({}));
                            eventData.current_progress = currentStatus.current_progress || 0; // Сохраняем текущий прогресс

                            await makeApiRequest('/api/v1/admin/cauldron/update', { content: eventData });
                            tg.showAlert('Настройки ивента "Котел" успешно сохранены!');
                        } catch (error) {
                            tg.showAlert(`Ошибка сохранения: ${error.message}`);
                        }
                    }
                });
            });
        }

        if (dom.resetCauldronBtn) {
            dom.resetCauldronBtn.addEventListener('click', () => {
                tg.showConfirm('Вы уверены, что хотите полностью сбросить весь прогресс и удалить всех участников ивента "Котел"? Это действие необратимо.', async (ok) => {
                    if (ok) {
                        await makeApiRequest('/api/v1/admin/events/cauldron/reset');
                        tg.showAlert('Прогресс ивента "Котел" был полностью сброшен.');
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
                    renderCauldronParticipants();
                }
            });
        }
// --- UPDATED Event Listener for Save Order Button (Квесты) ---
            if (dom.saveOrderButton) {
                dom.saveOrderButton.addEventListener('click', async () => {
                    showLoader(); 
                    try {
                        // Определяем активную вкладку
                        const categoriesView = document.getElementById('view-admin-categories');
                        const questsView = document.getElementById('view-admin-quests');

                        if (categoriesView && !categoriesView.classList.contains('hidden')) {
                            await fetchAndCacheCategories(true);
                            renderCategoriesList(); 
                        } else if (questsView && !questsView.classList.contains('hidden')) {
                            await switchView('view-admin-quests');
                        }
                        
                        tg.showPopup({message: 'Порядок успешно сохранен!'});
                    } catch (e) {
                        console.error("Ошибка при сохранении порядка:", e);
                        tg.showAlert("Не удалось сохранить порядок: " + e.message);
                    } finally {
                        dom.saveOrderButton.classList.add('hidden'); 
                        orderChanged = false; 
                        hideLoader(); 
                    }
                });
            }
            // --- End UPDATED Event Listener ---

        if(dom.sleepModeToggle) {
            dom.sleepModeToggle.addEventListener('click', async () => {
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

        if(dom.sleepPromptCancel) dom.sleepPromptCancel.addEventListener('click', () => dom.sleepPromptOverlay.classList.add('hidden'));
        if(dom.sleepPromptConfirm) {
            dom.sleepPromptConfirm.addEventListener('click', async () => {
                const minutes = parseInt(dom.sleepMinutesInput.value) || 0;
                dom.sleepPromptOverlay.classList.add('hidden');
                const result = await makeApiRequest('/api/v1/admin/toggle_sleep_mode', { minutes: minutes });
                updateSleepButton(result.new_status);
                tg.showAlert(result.message);
            });
        }
        // --- 🔽 ДОБАВЬ ЭТОТ БЛОК (Логика страницы "Расписание") 🔽 ---

// Показываем/скрываем выпадающий список при клике на тумблер
if (dom.settingQuestScheduleOverride) {
    dom.settingQuestScheduleOverride.addEventListener('change', (e) => {
        if (dom.settingQuestScheduleWrapper) {
            dom.settingQuestScheduleWrapper.style.display = e.target.checked ? 'flex' : 'none';
        }
    });
}
        if(dom.saveSettingsBtn) {
    dom.saveSettingsBtn.addEventListener('click', async () => {

        // --- 🔽 НАЧАЛО ЗАМЕНЫ 🔽 ---

        const newSliderOrder = Array.from(dom.sliderOrderManager.querySelectorAll('.slider-order-item'))
                                     .map(item => item.dataset.slideId);

        try {
            // 1. СНАЧАЛА получаем текущие настройки (включая расписание)
            const currentSettings = await makeApiRequest('/api/v1/admin/settings', {}, 'POST', true);

            // 2. СОЗДАЕМ payload на их основе
            const payload = { ...currentSettings }; // Копируем все, что есть

            // 3. ОБНОВЛЯЕМ поля с этой страницы
            payload.skin_race_enabled = dom.settingSkinRaceEnabled.checked;
            payload.slider_order = newSliderOrder;
            payload.auction_enabled = dom.settingAuctionEnabled.checked;
            payload.quests_enabled = dom.settingQuestsEnabled.checked;
            payload.challenges_enabled = dom.settingChallengesEnabled.checked;
            payload.quest_promocodes_enabled = dom.settingQuestRewardsEnabled.checked;
            payload.challenge_promocodes_enabled = dom.settingChallengeRewardsEnabled.checked;
            payload.checkpoint_enabled = dom.settingCheckpointEnabled.checked;
            payload.menu_banner_url = dom.settingMenuBannerUrl.value.trim();
            payload.checkpoint_banner_url = dom.settingCheckpointBannerUrl.value.trim();
            payload.auction_banner_url = dom.settingAuctionBannerUrl.value.trim();
            payload.weekly_goals_banner_url = dom.settingWeeklyGoalsBannerUrl.value.trim();
            payload.weekly_goals_enabled = dom.settingWeeklyGoalsEnabled.checked;
            // --- 🔽 ВОТ СЮДА ДОБАВЬ ЭТИ ДВЕ СТРОКИ 🔽 ---
            payload.quest_schedule_override_enabled = dom.settingQuestScheduleOverride.checked;
            payload.quest_schedule_active_type = dom.settingQuestScheduleType.value;
            // --- 🔼 КОНЕЦ ДОБАВЛЕНИЯ 🔼 ---

            // 4. ОТПРАВЛЯЕМ обновленный payload
            await makeApiRequest('/api/v1/admin/settings/update', { settings: payload });
            tg.showAlert('Настройки сохранены!');

        } catch (err) {
             tg.showAlert(`Ошибка сохранения: ${err.message}`);
        }
        // --- 🔼 КОНЕЦ ЗАМЕНЫ 🔼 ---
    });
}

        if(dom.resetAllQuestsBtn) {
            dom.resetAllQuestsBtn.addEventListener('click', () => {
                 tg.showConfirm('Вы уверены, что хотите сбросить ВСЕ активные квесты у ВСЕХ пользователей?', async (ok) => {
                    if (ok) {
                        await makeApiRequest('/api/v1/admin/quests/reset-all-active');
                        tg.showAlert('Все активные квесты успешно сброшены.');
                    }
                 });
            });
        }

        if(dom.resetAllCheckpointProgressBtn) {
            dom.resetAllCheckpointProgressBtn.addEventListener('click', () => {
                 tg.showConfirm('ЭТО ДЕЙСТВИЕ НЕОБРАТИМО! Вы уверены, что хотите сбросить ТОЛЬКО СПИСОК НАГРАД Чекпоинта у ВСЕХ пользователей? Их звёзды останутся.', async (ok) => {
                    if (ok) {
                        await makeApiRequest('/api/v1/admin/users/reset-all-checkpoint-progress');
                        tg.showAlert('Список наград Чекпоинта сброшен у всех пользователей.');
                    }
                 });
            });
        }

        if(dom.clearAllCheckpointStarsBtn) {
            dom.clearAllCheckpointStarsBtn.addEventListener('click', () => {
                 tg.showConfirm('ЭТО ДЕЙСТВИЕ НЕОБРАТИМО! Вы уверены, что хотите ОБНУЛИТЬ БАЛАНС ЗВЁЗД Чекпоинта у ВСЕХ пользователей? Их полученные награды останутся.', async (ok) => {
                    if (ok) {
                        await makeApiRequest('/api/v1/admin/users/clear-all-checkpoint-stars');
                        tg.showAlert('Баланс звёзд Чекпоинта обнулён у всех пользователей.');
                    }
                 });
            });
        }
        // --- НОВЫЕ ОБРАБОТЧИКИ ДЛЯ ПОИСКА ПОЛЬЗОВАТЕЛЯ ---
        if (dom.adminUserSearchInput) {
            // Поиск при вводе текста
            dom.adminUserSearchInput.addEventListener('input', () => {
                clearTimeout(adminUserSearchDebounceTimer);
                const searchTerm = dom.adminUserSearchInput.value.trim();

                if (searchTerm.length < 2) {
                    dom.adminUserSearchResults.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Введите минимум 2 символа...</p>';
                    return;
                }

                dom.adminUserSearchResults.innerHTML = '<i>Идет поиск...</i>';

                adminUserSearchDebounceTimer = setTimeout(async () => {
                    try {
                        const users = await makeApiRequest('/api/v1/admin/users/search', { search_term: searchTerm }, 'POST', true);
                        renderAdminSearchResults(users); // Используем новую функцию
                    } catch (e) {
                        dom.adminUserSearchResults.innerHTML = `<p class="error-message">Ошибка поиска: ${e.message}</p>`;
                    }
                }, 400); // Задержка 400мс
            });
        }

        if (dom.adminUserSearchResults) {
            // Клик по результату поиска
            dom.adminUserSearchResults.addEventListener('click', (e) => {
                const item = e.target.closest('.submission-item');
                if (!item) return;

                const userId = item.dataset.userId;
                const userName = item.dataset.userName;

                if (userId && userName) {
                    selectedAdminUser = { id: parseInt(userId), name: userName };
                    
                    // Если есть коллбэк (старый флоу), вызываем его
                    if (onAdminUserSelectCallback) {
                        onAdminUserSelectCallback(selectedAdminUser);
                        onAdminUserSelectCallback = null;
                    }
                    
                    dom.adminUserSearchModal.classList.add('hidden');
                }
            });
        }
        // --- КОНЕЦ НОВЫХ ОБРАБОТЧИКОВ ---
        // --- НОВЫЙ ОБРАБОТЧИК ДЛЯ КНОПКИ "ПРИНУДИТЕЛЬНО ВЫПОЛНИТЬ" ---
        if (dom.openForceCompleteSearchBtn) {
            dom.openForceCompleteSearchBtn.addEventListener('click', () => {
                openAdminUserSearchModal('Принудительно выполнить для...', (user) => {
                    selectedAdminUser = user;

                    const modalElement = document.getElementById('admin-entity-select-modal');
                    const titleElement = document.getElementById('admin-entity-select-title');
                    const tabsContainer = modalElement?.querySelector('.tabs-container'); // Находим контейнер вкладок
                    const firstTabButton = tabsContainer?.querySelector('.tab-button[data-tab="quest"]'); // Находим кнопку "Квест"

                    console.log("[ForceComplete] User selected, preparing modal.");

                    if (titleElement && modalElement && firstTabButton) { // Проверяем все элементы
                        titleElement.textContent = `Выполнить для: ${user.name}`;
                        modalElement.classList.remove('hidden');

                        // --- ИЗМЕНЕНИЕ ЗДЕСЬ ---
                        // 1. Активируем первую вкладку (Квест)
                        tabsContainer.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                        firstTabButton.classList.add('active');
                        dom.adminEntityListQuest.classList.remove('hidden'); // Показываем контент квестов
                        dom.adminEntityListChallenge.classList.add('hidden'); // Прячем контент челленджей

                        // 2. СРАЗУ ЗАГРУЖАЕМ СПИСОК КВЕСТОВ
                        console.log("[ForceComplete] Modal opened, calling loadEntitiesForForceComplete('quest')...");
                        loadEntitiesForForceComplete('quest'); // <-- ВЫЗЫВАЕМ ЗАГРУЗКУ
                        // --- КОНЕЦ ИЗМЕНЕНИЯ ---

                    } else {
                        console.error("[ForceComplete] Entity select modal elements NOT FOUND!");
                        tg.showAlert("Критическая ошибка: Не найдены элементы окна выбора квеста/челленджа.");
                    }
                });
            });
        }

                // --- ОБНОВЛЕННЫЙ ОБРАБОТЧИК ДЛЯ МОДАЛКИ ВЫБОРА КВЕСТА/ЧЕЛЛЕНДЖА ---
        if (dom.adminEntitySelectModal) {
            const tabsContainer = dom.adminEntitySelectModal.querySelector('.tabs-container');

            // Переключение вкладок
            tabsContainer.addEventListener('click', (e) => {
                e.stopPropagation(); // Предотвращаем всплытие до контейнера списка
                const button = e.target.closest('.tab-button');
                if (!button || button.classList.contains('active')) return;

                const tabId = button.dataset.tab; // 'quest' или 'challenge'

                // Обновляем активную вкладку
                tabsContainer.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // Показываем/скрываем нужный контейнер
                dom.adminEntityListQuest.classList.toggle('hidden', tabId !== 'quest');
                dom.adminEntityListChallenge.classList.toggle('hidden', tabId !== 'challenge');

                // --- ИЗМЕНЕНИЕ ЗДЕСЬ (v2) ---
                // Загружаем данные для АКТИВНОЙ вкладки, если они еще не загружены
                const container = (tabId === 'quest') ? dom.adminEntityListQuest : dom.adminEntityListChallenge;
                // Проверяем, есть ли уже элементы списка или только сообщение "Загрузка..."/"Ошибка..."/"Не найдено"
                const needsLoading = !container.querySelector('.entity-list-item');

                if (needsLoading) {
                    console.log(`[ForceComplete Tabs] Switched to '${tabId}', calling loadEntitiesForForceComplete('${tabId}')...`);
                    loadEntitiesForForceComplete(tabId); // Вызываем загрузку для нужного типа
                } else {
                    console.log(`[ForceComplete Tabs] Switched to '${tabId}', content already loaded.`);
                }
                // --- КОНЕЦ ИЗМЕНЕНИЯ (v2) ---
            });

            // Клик по элементу списка (делегирование на оба контейнера)
            [dom.adminEntityListQuest, dom.adminEntityListChallenge].forEach(container => {
                 container.addEventListener('click', async (e) => {
                    // Останавливаем всплытие
                    e.stopPropagation();

                    const item = e.target.closest('.entity-list-item');
                    if (!item || !selectedAdminUser) return;

                    const entityId = parseInt(item.dataset.entityId);
                    const entityType = item.dataset.entityType;
                    const entityName = item.dataset.entityName;

                    tg.showConfirm(`Принудительно выполнить "${escapeHTML(entityName)}" для ${selectedAdminUser.name}?`, async (ok) => {
                        if (ok) {
                            try {
                                // --- ЛОГ: Перед вызовом API ---
                                console.log(`[ForceComplete API] Calling /force_complete with:`, { user_id: selectedAdminUser.id, entity_type: entityType, entity_id: entityId });
                                const result = await makeApiRequest('/api/v1/admin/actions/force_complete', { user_id: selectedAdminUser.id, entity_type: entityType, entity_id: entityId });
                                // --- ЛОГ: Успешный ответ ---
                                console.log(`[ForceComplete API] Success response:`, result);
                                tg.showAlert(result.message); // Показываем сообщение от бэкенда

                                // --- Добавлено обновление данных (v2) ---
                                tg.showPopup({message: 'Обновляем данные пользователя... Попросите его перезайти в профиль или список квестов/челленджей.'});
                                // --- Конец добавления ---

                                dom.adminEntitySelectModal.classList.add('hidden'); // Закрываем модалку
                                selectedAdminUser = null; // Сбрасываем юзера
                            } catch (err) {
                                // --- ЛОГ: Ошибка API ---
                                console.error(`[ForceComplete API] Error response:`, err);
                                // Теперь err.message содержит ошибку от Supabase благодаря исправлению в Python
                                tg.showAlert(`Ошибка принудительного выполнения: ${err.message}`);
                            }
                        }
                    });
                });
            });
        }
        

        document.body.addEventListener('click', async (event) => {
            const target = event.target;

            // --- 👇 ИЗМЕНЕНИЕ 3: Добавляем новый обработчик "Связаться" 👇 ---
            const contactBtn = target.closest('.admin-contact-btn');
            if (contactBtn) {
                const userId = contactBtn.dataset.userId;
                const userUsername = contactBtn.dataset.userUsername; // Получаем username
                
                if (userId && window.Telegram && window.Telegram.WebApp) {
                    try {
                        let textToCopy = '';
                        let message = '';

                        if (userUsername && userUsername !== 'null' && userUsername !== 'undefined' && userUsername.trim() !== '') {
                            // Если есть @username, копируем его
                            textToCopy = `@${userUsername}`;
                            message = 'Username @' + userUsername + ' скопирован!';
                        } else {
                            // Если нет @username, копируем ID (как запасной вариант)
                            textToCopy = userId;
                            message = 'Username не найден. ID пользователя скопирован!';
                        }
                        
                        // --- 👇 ВОТ ИСПРАВЛЕНИЕ (v6) 👇 ---
                        // Используем стандартный Web API для буфера обмена
                        await navigator.clipboard.writeText(textToCopy);
                        // --- 👆 КОНЕЦ ИСПРАВЛЕНИЯ 👆 ---
                        // Показываем всплывающее уведомление
                        tg.showPopup({message: message});

                    } catch (e) {
                        console.error('Ошибка копирования в буфер:', e);
                        tg.showAlert('Не удалось скопировать. Ошибка в консоли.');
                    }
                }
                return; // Останавливаем выполнение
            }
            // --- 👆 КОНЕЦ НОВОГО БЛОКА 👆 ---
            
            // --- Новые обработчики для Котла ---
            const addRewardBtn = target.closest('[id^="add-top-reward-btn-"]');
            if (addRewardBtn) {
                const level = addRewardBtn.dataset.level;
                const container = document.getElementById(`top-rewards-container-${level}`);
                if (container) {
                    container.appendChild(createTopRewardRow());
                }
                return;
            }

            const removeRewardBtn = target.closest('.remove-reward-btn');
            if (removeRewardBtn) {
                removeRewardBtn.closest('.top-reward-row').remove();
                return;
            }
            // --- Конец новых обработчиков ---

            const closeButton = target.closest('[data-close-modal]');
            if (closeButton) {
                const modalId = closeButton.dataset.closeModal;
                const modal = document.getElementById(modalId);
                if (modal) {
                    modal.classList.add('hidden');
                }
                return;
            }
            
            // --- ИСПРАВЛЕННЫЙ ПОРЯДОК ---

            // Клик по шестеренке (Настройки)
            const settingsBtn = target.closest('.reward-settings-btn');
            if (settingsBtn) {
                const rewardData = JSON.parse(settingsBtn.dataset.reward);
                
                if (hasAdminAccess) {
                    // 1. Пароль уже введен, просто открываем
                    openTwitchRewardSettings(rewardData);
                } else {
                    // 2. Пароль не введен. Запрашиваем его.
                    // Сохраняем действие, которое нужно выполнить ПОСЛЕ ввода пароля
                    afterPasswordCallback = () => {
                        openTwitchRewardSettings(rewardData);
                    };
                    // Показываем окно ввода пароля
                    dom.passwordPromptOverlay.classList.remove('hidden');
                    dom.passwordPromptInput.focus();
                }
                return;
            }
            // Клик по иконке (Покупки)
            const purchasesLink = target.closest('.reward-purchases-link');
            if (purchasesLink) {
                event.preventDefault(); // Предотвратить переход по ссылке #
                const { rewardId, rewardTitle } = purchasesLink.dataset;
                await openTwitchPurchases(rewardId, rewardTitle);
                return;
            }
            
            // Общий клик по иконке (Навигация) - должен быть ПОСЛЕ кнопок
            const navButton = target.closest('.admin-icon-button, .back-button, #go-create-quest, #go-create-challenge');
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

            const deletePurchaseBtn = target.closest('.delete-purchase-btn');
            if (deletePurchaseBtn) {
                deletePurchaseBtn.disabled = true;
                const purchaseId = deletePurchaseBtn.dataset.purchaseId;
                tg.showConfirm('Вы уверены, что хотите удалить эту покупку? Действие необратимо.', async (ok) => {
                    if (ok) {
                        try {
                            await makeApiRequest('/api/v1/admin/twitch_rewards/purchase/delete', { purchase_id: parseInt(purchaseId) });
                            const itemDiv = document.getElementById(`purchase-item-${purchaseId}`);
                            if (itemDiv) itemDiv.remove();
                            tg.showAlert('Покупка успешно удалена.');

                            // --- ДОБАВЬТЕ ЭТУ СТРОКУ ---
                            updateTwitchBadgeCount(); 
                            // --- КОНЕЦ ИЗМЕНЕНИЯ ---

                        } catch (e) {
                            console.error('Ошибка при удалении покупки:', e);
                            tg.showAlert(`Ошибка при удалении: ${e.message}`);
                            deletePurchaseBtn.disabled = false;
                        }
                    }
                    // --- 👇 ДОБАВЬ ЭТОТ БЛОК 'else' 👇 ---
                    else {
                        deletePurchaseBtn.disabled = false;
                    }
                    // --- 👆 КОНЕЦ 👆 ---
                });
                return;
            }

            const deleteAllBtn = target.closest('#delete-all-purchases-btn');
            if (deleteAllBtn) {
                deleteAllBtn.disabled = true; // Немедленно отключаем кнопку
                const rewardId = parseInt(deleteAllBtn.dataset.rewardId);
                if (!rewardId) return;

                tg.showConfirm(`Вы уверены, что хотите удалить ВСЕ покупки для этой награды? Это действие необратимо.`, async (ok) => {
                    if (ok) {
                        try {
                            await makeApiRequest('/api/v1/admin/twitch_rewards/purchases/delete_all', { reward_id: rewardId });
                            tg.showAlert('Все покупки были успешно удалены.');
                            document.getElementById('twitch-purchases-body').innerHTML = '<p style="text-align: center;">Нет покупок для этой награды.</p>';
                            deleteAllBtn.classList.add('hidden');
                        } catch (err) {
                            tg.showAlert(`Ошибка при удалении: ${err.message}`);
                        }
                    }
                });
                return;
            }

            // --- 🔽 НАЧАЛО НОВОГО БЛОКА (issue-promo-btn) 🔽 ---
        const issuePromoBtn = target.closest('.issue-promo-btn');
        if (issuePromoBtn) {
            const purchaseId = issuePromoBtn.dataset.purchaseId;
            if (!purchaseId) return;

            const purchaseItem = issuePromoBtn.closest('.purchase-item');
            // Считываем, было ли выполнено условие, из data-атрибута
            const isConditionMet = purchaseItem.dataset.conditionMet === 'true';

            let confirmMessage = 'Вы уверены, что хотите выдать эту награду?';
            if (!isConditionMet) {
                confirmMessage = "ВНИМАНИЕ: Условие не выполнено! Вы уверены, что хотите выдать награду вручную?";
            }
            
            issuePromoBtn.disabled = true;
            
            tg.showConfirm(confirmMessage, async (ok) => {
                // --- 👇 ИЗМЕНИ ЭТОТ БЛОК 'if' 👇 ---
                if (!ok) {
                    issuePromoBtn.disabled = false; // Включаем обратно
                    return; // Выходим
                }
                // --- 👆 КОНЕЦ 👆 -- 

                issuePromoBtn.disabled = true; 
                issuePromoBtn.innerHTML = '<i>Выдача...</i>';
                let hasError = false; 

                try {
                    // Вызываем бэкенд, который (после Этапа 2.2) больше не проверяет Wizebot
                    const result = await makeApiRequest('/api/v1/admin/twitch_rewards/issue_promocode', {
                        purchase_id: parseInt(purchaseId)
                    });

                    tg.showAlert(result.message); 

                    const itemDiv = document.getElementById(`purchase-item-${purchaseId}`);
                    if (itemDiv) itemDiv.remove();

                    // updateTwitchBadgeCount(); // (Мы удалили эту функцию, можно вернуть, если нужна)

                } catch (e) {
                    hasError = true; 
                    console.error('Ошибка при выдаче промокода:', e);
                    tg.showAlert(`Ошибка: ${e.message}`); 
                } finally {
                    if (hasError && document.getElementById(`purchase-item-${purchaseId}`)) {
                        issuePromoBtn.disabled = false;
                        // Восстанавливаем текст кнопки (у вас может быть иконка звезды)
                        const amount = issuePromoBtn.dataset.amount || 0;
                        issuePromoBtn.innerHTML = `Выдать ${amount} ⭐`; 
                    }
                }
            }); 

            return; 
        }
// --- 🔼 КОНЕЦ НОВОГО БЛОКА (issue-promo-btn) 🔼 ---

            // --- ↓↓↓ ВСТАВЬ НОВЫЙ БЛОК СЮДА ↓↓↓ ---
        // --- 🔽 НАЧАЛО НОВОГО БЛОКА (issue-tickets-btn) 🔽 ---
    const issueTicketsBtn = target.closest('.issue-tickets-btn');
    if (issueTicketsBtn) {
        const purchaseId = issueTicketsBtn.dataset.purchaseId;
        const amount = issueTicketsBtn.dataset.amount || 0;
        if (!purchaseId) return;

        const purchaseItem = issueTicketsBtn.closest('.purchase-item');
        // Считываем, было ли выполнено условие, из data-атрибута
        const isConditionMet = purchaseItem.dataset.conditionMet === 'true';

        let confirmMessage = `Вы уверены, что хотите выдать ${amount} 🎟️ билетов?`;
        if (!isConditionMet) {
            confirmMessage = `ВНИМАНИЕ: Условие не выполнено! Вы уверены, что хотите выдать ${amount} 🎟️ билетов вручную?`;
        }
        
        issueTicketsBtn.disabled = true;
        
        tg.showConfirm(confirmMessage, async (ok) => {
            // --- 👇 ИЗМЕНИ ЭТОТ БЛОК 'if' 👇 ---
            if (!ok) {
                issueTicketsBtn.disabled = false; // Включаем обратно
                return; // Выходим
            }
            // --- 👆 КОНЕЦ 👆 ---

            issueTicketsBtn.disabled = true;
            issueTicketsBtn.innerHTML = '<i>Выдача...</i>';
            let hasError = false;

            try {
                const result = await makeApiRequest('/api/v1/admin/twitch_rewards/issue_tickets', {
                    purchase_id: parseInt(purchaseId)
                });

                tg.showAlert(result.message); 

                const itemDiv = document.getElementById(`purchase-item-${purchaseId}`);
                if (itemDiv) itemDiv.remove();

                // updateTwitchBadgeCount(); // (Мы удалили эту функцию, можно вернуть, если нужна)

            } catch (e) {
                hasError = true;
                console.error('Ошибка при выдаче билетов:', e);
                tg.showAlert(`Ошибка: ${e.message}`);
            } finally {
                if (hasError && document.getElementById(`purchase-item-${purchaseId}`)) {
                    issueTicketsBtn.disabled = false;
                    issueTicketsBtn.innerHTML = `Выдать ${amount} 🎟️`;
                }
            }
        });

        return;
    }
// --- 🔼 КОНЕЦ НОВОГО БЛОКА (issue-tickets-btn) 🔼 ---
            
            const checkBtn = target.closest('.check-wizebot-btn, .wizebot-check-btn');
            if (checkBtn) {
                const nickname = checkBtn.dataset.nickname;
                const period = checkBtn.dataset.period || 'session';

                const card = checkBtn.closest('.admin-submission-card, .purchase-item');
                let resultDiv;
                if(checkBtn.classList.contains('wizebot-check-btn')){
                   const purchaseId = card.id.split('-')[2];
                   resultDiv = card.querySelector(`#wizebot-result-${purchaseId}`);
                } else {
                   resultDiv = card.querySelector('.wizebot-stats-result');
                }

                if (!nickname) { resultDiv.innerHTML = `<p style="color: var(--danger-color);">Никнейм не найден.</p>`; return; }

                resultDiv.innerHTML = '<i>Проверяем...</i>';
                checkBtn.disabled = true;
                try {
                    const stats = await makeApiRequest('/api/v1/admin/wizebot/check_user', { twitch_username: nickname, period: period }, 'POST', true);
                    if (stats.found) resultDiv.innerHTML = `<p style="color: var(--primary-color);">✅ ${stats.messages} сообщений (ранг ${stats.rank})</p>`;
                    else resultDiv.innerHTML = `<p style="color: var(--warning-color);">⚠️ Не найден в топ-100</p>`;
                } catch (e) {
                    console.error('Ошибка Wizebot:', e);
                    resultDiv.innerHTML = `<p style="color: var(--danger-color);">Ошибка: ${e.message}</p>`;
                }
                finally { checkBtn.disabled = false; }
                return;
            }

            const confirmWinnerBtn = target.closest('.confirm-winner-prize-btn');
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

            const actionButton = target.closest('.admin-edit-quest-btn, .admin-delete-quest-btn, .admin-view-subs-btn, .admin-action-btn, .admin-edit-challenge-btn, .admin-delete-challenge-btn, .edit-category-btn, .delete-category-btn'); // REMOVED: .sort-btn, .sort-quest-btn
            if (!actionButton) return;

            const id = actionButton.dataset.id;

            if (actionButton.matches('.edit-category-btn')) {
                showGenericPrompt('Редактировать категорию', actionButton.dataset.name, id);

            } else if (actionButton.matches('.delete-category-btn')) {
                tg.showConfirm('Вы уверены, что хотите удалить эту категорию?', async (ok) => {
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

} else if (actionButton.matches('.edit-roulette-prize-btn')) {
                // Твой код для открытия модального окна редактирования приза рулетки
                // (тот, что мы добавляли раньше, использует data-prize)
                if (editPrizeModal && editPrizeForm) {
                    const prizeData = JSON.parse(actionButton.dataset.prize);
                    editPrizeForm.elements['prize_id'].value = prizeData.id;
                    editPrizeForm.elements['reward_title'].value = prizeData.reward_title;
                    editPrizeForm.elements['skin_name'].value = prizeData.skin_name;
                    editPrizeForm.elements['image_url'].value = prizeData.image_url;
                    editPrizeForm.elements['chance_weight'].value = prizeData.chance_weight;
                    editPrizeForm.elements['quantity'].value = prizeData.quantity;
                    editPrizeModal.classList.remove('hidden');
                }

} else if (actionButton.matches('.admin-edit-quest-btn') && !actionButton.matches('.edit-category-btn') && !actionButton.matches('.edit-weekly-goal-btn')) {
                 const idStr = actionButton.dataset.id;
                 // --- >>> ДОБАВЛЕНО ЛОГИРОВАНИЕ <<< ---
                 console.log("[DEBUG] Raw data-id from button:", idStr, "(type:", typeof idStr, ")");

                 // Более строгая проверка: idStr должен существовать и быть парсибельным в конечное число
                 const potentialId = parseInt(idStr);
                 if (idStr === null || idStr === undefined || idStr.trim() === '' || isNaN(potentialId) || !isFinite(potentialId)) {
                     console.error("[DEBUG] Invalid or missing quest ID found:", idStr);
                     tg.showAlert("Ошибка: Неверный или отсутствующий ID квеста.");
                     return; // Прерываем, если ID плохой
                 }
                 const questIdInt = potentialId; // Используем уже распарсенное значение
                 console.log("[DEBUG] Parsed quest_id:", questIdInt, "(type:", typeof questIdInt, ")");
                 // --- >>> КОНЕЦ ЛОГИРОВАНИЯ <<< ---

                 // Используем questIdInt при вызове makeApiRequest
                 const quest = await makeApiRequest('/api/v1/admin/quest/details', { quest_id: questIdInt });

                 // --- >>> Проверка ответа от API <<<---
                  if (!quest) {
                      console.error("[DEBUG] API returned null/undefined for quest details");
                      tg.showAlert("Ошибка: Не удалось получить детали квеста от сервера.");
                      return;
                  }
                  console.log("[DEBUG] Received quest details:", quest);
                  // --- >>> Конец проверки ответа <<<---


                 await fetchAndCacheCategories(true);
                 populateCategorySelects(quest.category_id);
                 const form = dom.editQuestForm;
                 let questType = quest.quest_type, twitchPeriod = 'session';
                 if (quest.quest_type && quest.quest_type.startsWith('automatic_twitch_')) { // Добавлена проверка quest.quest_type
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

            // --- 👇 ИЗМЕНЕНИЕ 4: Возвращаем эту строку к оригиналу 👇 ---
            } else if (actionButton.matches('.admin-action-btn')) {
            // --- 👆 КОНЕЦ ИЗМЕНЕНИЯ 4 👆 ---
                actionButton.disabled = true;
                const action = actionButton.dataset.action;
                const card = actionButton.closest('.admin-submission-card');
                const id = actionButton.dataset.id; // Получаем ID

                if (!id) return; // Прерываем, если ID не найден

                // --- Общая функция для обновления и закрытия, если нужно (ВЕРСЯ 3) ---
                const handleCompletion = async () => {
                    // Проверяем наличие карточки перед действиями
                    if (!card) {
                        console.warn("handleCompletion: card element not found.");
                        // Попробуем обновить главный счетчик и вид в любом случае
                        try {
                            const counts = await makeApiRequest("/api/v1/admin/pending_counts", {}, 'POST', true);
                            const totalPending = (counts.submissions || 0) + (counts.event_prizes || 0) + (counts.checkpoint_prizes || 0);
                            const mainBadge = document.getElementById('main-pending-count');
                            if (mainBadge) {
                                mainBadge.textContent = totalPending;
                                mainBadge.classList.toggle('hidden', totalPending === 0);
                            }
                            // Если модалка открыта, но карточки нет (странно), закроем
                            if (!dom.submissionsModal.classList.contains('hidden')) {
                                dom.submissionsModal.classList.add('hidden');
                            }
                            await switchView('view-admin-pending-actions');
                        } catch (err) {
                             console.error("Error during fallback refresh in handleCompletion:", err);
                        }
                        return;
                    }

                    card.remove(); // Удаляем карточку из модального окна
                    const remainingCards = dom.modalBody.querySelectorAll('.admin-submission-card');

                    if (remainingCards.length === 0) {
                        // Если карточек не осталось
                        dom.submissionsModal.classList.add('hidden'); // Закрываем модалку
                        tg.showPopup({message: 'Обработка завершена. Обновление...'});

                        // Ставим небольшую задержку
                        await new Promise(resolve => setTimeout(resolve, 300));

                        // Обновляем главный счетчик
                        try {
                            console.log("Updating main count...");
                            const counts = await makeApiRequest("/api/v1/admin/pending_counts", {}, 'POST', true);
                            const totalPending = (counts.submissions || 0) + (counts.event_prizes || 0) + (counts.checkpoint_prizes || 0);
                            const mainBadge = document.getElementById('main-pending-count');
                            if (mainBadge) {
                                mainBadge.textContent = totalPending;
                                mainBadge.classList.toggle('hidden', totalPending === 0);
                                console.log("Main count updated:", totalPending);
                            }
                        } catch (countError) {
                            console.error("Не удалось обновить главный счетчик после проверки:", countError);
                        }

                        // Перезагружаем вид (сетку иконок)
                        console.log("Calling switchView('view-admin-pending-actions')...");
                        try {
                             await switchView('view-admin-pending-actions');
                             console.log("switchView call finished successfully.");
                        } catch (switchError) {
                             console.error("Error during switchView call:", switchError);
                             tg.showAlert("Не удалось обновить список.");
                        }

                    } else {
                         // Если карточки еще остались, обновляем главный счетчик И счетчик на иконке
                         try {
                            console.log("Updating main count (cards remaining)...");
                            const counts = await makeApiRequest("/api/v1/admin/pending_counts", {}, 'POST', true);
                            const totalPending = (counts.submissions || 0) + (counts.event_prizes || 0) + (counts.checkpoint_prizes || 0);
                            const mainBadge = document.getElementById('main-pending-count');
                            if (mainBadge) {
                                mainBadge.textContent = totalPending;
                                mainBadge.classList.toggle('hidden', totalPending === 0);
                            }
                            
                            // --- НОВЫЙ КОД (ЗАДАЧА 2) ---
                            // Обновляем бейдж на конкретной иконке
                            const { sourceType, sourceId } = dom.submissionsModal.dataset;
                            let iconToUpdate;
                            if (sourceType === 'submission') {
                                iconToUpdate = document.querySelector(`.admin-icon-button[data-type="submission"][data-quest-id="${sourceId}"]`);
                            } else {
                                iconToUpdate = document.querySelector(`.admin-icon-button[data-type="${sourceType}"]`);
                            }
                            
                            if (iconToUpdate) {
                                const badge = iconToUpdate.querySelector('.notification-badge');
                                if (badge) {
                                    let count = parseInt(badge.textContent || '1') - 1;
                                    badge.textContent = count;
                                    badge.classList.toggle('hidden', count <= 0);
                                    console.log(`Icon badge ${sourceType} updated to ${count}`);
                                }
                            }
                            // --- КОНЕЦ НОВОГО КОДА ---

                        } catch (countError) {
                            console.error("Не удалось обновить счетчики (карточки остались):", countError);
                        }
                    }
                };
                // --- Конец общей функции (ВЕРСИЯ 3) --

                // --- 👇👇👇 НАЧАЛО ИСПРАВЛЕНИЯ ---
                try {
                    const parsedId = parseInt(id); // ID нам нужен как число
                    
                    // --- Логика для ЗАЯВОК (submissions) ---
                    if (card && card.id.startsWith('submission-card-')) {
                        // Используем эндпоинт из admin (7).js
                        await makeApiRequest('/api/v1/admin/submission/update', { 
                            submission_id: parsedId, 
                            action: action // action - это 'approved', 'rejected' или 'rejected_silent'
                        });
                    } 
                    // --- Логика для ПРИЗОВ ЧЕКПОИНТА (prizes) ---
                    else if (card && card.id.startsWith('prize-card-')) {
                        
                        if (action === 'approved') {
                            // 'approved' - это то же, что 'confirm_prize' в admin (7).js
                            await makeApiRequest('/api/v1/admin/manual_rewards/complete', { 
                                reward_id: parsedId 
                            });
                        } 
                        else if (action === 'rejected' || action === 'rejected_silent') {
                            // ВНИМАНИЕ: В файле admin (7).js НЕ БЫЛО логики для
                            // отклонения призов чекпоинта.
                            // Я предполагаю, что эндпоинт называется '/reject'.
                            // Пожалуйста, проверьте это на своем бэкенде.
                            
                            // ⚠️ ПРОВЕРЬТЕ, СУЩЕСТВУЕТ ЛИ ЭТОТ ЭНДПОИНТ НА БЭКЕНДЕ ⚠️
                            await makeApiRequest('/api/v1/admin/manual_rewards/reject', { 
                                reward_id: parsedId, 
                                is_silent: (action === 'rejected_silent') 
                            });
                        } else {
                            throw new Error(`Неизвестное действие '${action}' для приза.`);
                        }
                    } 
                    else {
                        throw new Error("Не удалось определить тип карточки для действия.");
                    }

                    // Если все API вызовы прошли успешно, обновляем UI
                    await handleCompletion();

                } catch (e) {
                    console.error('Ошибка при обработке действия:', e);
                    tg.showAlert(`Ошибка: ${e.message}`);
                    if(actionButton) {
                        actionButton.disabled = false;
                    }
                }
                // --- 👆👆👆 КОНЕЦ ИСПРАВЛЕНИЯ ---
                
                }
        });

// --- NEW Event Listener for Sort Order Inputs ---
        let sortOrderDebounceTimer;
        document.body.addEventListener('change', async (event) => {
            const input = event.target;
            if (input.classList.contains('sort-order-input')) {
                clearTimeout(sortOrderDebounceTimer);

                const value = input.value.trim();
                // Пустое значение отправляем как null, иначе парсим как число
                const sortOrder = value === '' ? null : parseInt(value, 10);

                // Доп. проверка: если не пусто и не число, или < 1, сбрасываем
                if (value !== '' && (isNaN(sortOrder) || sortOrder < 1)) {
                    input.value = ''; // Очищаем поле при невалидном вводе
                    console.warn("Invalid sort order input, cleared.");
                    return; // Не отправляем невалидное значение
                }

                if (input.classList.contains('category-sort-order')) {
                    const categoryId = parseInt(input.dataset.categoryId);
                    if (categoryId) {
                        // Используем debounce для отправки API запроса
                        sortOrderDebounceTimer = setTimeout(async () => {
                            await updateCategorySortOrder(categoryId, sortOrder);
                            // НЕ перезагружаем список здесь
                            orderChanged = true; // Ставим флаг, что были изменения
                            dom.saveOrderButton.classList.remove('hidden'); // Показываем кнопку
                        }, 500); // Уменьшили задержку debounce
                    }
                } else if (input.classList.contains('quest-sort-order')) {
                    const questId = parseInt(input.dataset.questId);
                    if (questId) {
                         sortOrderDebounceTimer = setTimeout(async () => {
                            await updateQuestSortOrder(questId, sortOrder);
                            orderChanged = true; 
                            dom.saveOrderButton.classList.remove('hidden');
                        }, 500);
                    }
                }
            }
        });


        if(dom.createQuestForm) dom.createQuestForm.querySelector('select[name="quest_type"]').addEventListener('change', () => updateQuestFormUI(dom.createQuestForm));
        if(dom.editQuestForm) dom.editQuestForm.querySelector('select[name="quest_type"]').addEventListener('change', () => updateQuestFormUI(dom.editQuestForm));
        if(dom.challengeForm) dom.challengeForm.querySelector('select[name="condition_type"]').addEventListener('change', () => updateChallengeFormUI(dom.challengeForm));

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
                    console.error('Ошибка при обновлении задания:', error);
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
            // --- 🔽 НОВЫЙ КОД: Генератор ID недели 🔽 ---
        const generateWeekIdBtn = document.getElementById('generate-new-week-id-btn');
        if (generateWeekIdBtn) {
            generateWeekIdBtn.addEventListener('click', () => {
                const weekIdInput = document.getElementById('weekly-goal-week-id');
                if (weekIdInput) {
                    try {
                        // Функция для получения номера недели
                        const getWeekNumber = (d) => {
                            d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                            d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
                            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
                            const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
                            return weekNo;
                        };
                        const now = new Date();
                        const year = now.getUTCFullYear();
                        const week = getWeekNumber(now);
                        weekIdInput.value = `${year}-W${week}`;
                        tg.showPopup({message: 'Сгенерирован новый ID недели!'});
                    } catch (e) {
                        console.error("Failed to generate week ID:", e);
                        tg.showAlert('Не удалось сгенерировать ID.');
                    }
                }
            });
        }
        // --- 🔽 ФИНАЛЬНЫЙ ВАРИАНТ ДЛЯ КНОПКИ РАСПИСАНИЯ 🔽 ---
    // 1. Ищем кнопку напрямую по ID (минуя объект dom, чтобы исключить ошибки)
    const safeScheduleBtn = document.getElementById('save-schedule-btn');

    if (safeScheduleBtn) {
        // Удаляем старые обработчики через клонирование
        const newBtn = safeScheduleBtn.cloneNode(true);
        safeScheduleBtn.parentNode.replaceChild(newBtn, safeScheduleBtn);

        newBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            const originalText = newBtn.textContent;
            newBtn.textContent = 'Сохранение...';
            newBtn.disabled = true;

            try {
                // 1. Получаем АКТУАЛЬНЫЕ настройки с сервера (баннеры, тумблеры и т.д.)
                const currentSettings = await makeApiRequest('/api/v1/admin/settings', {}, 'POST', true);

                // 2. Создаем копию объекта настроек
                const payload = { ...currentSettings }; 

                // 3. ВАЖНО: Мы НЕ трогаем dom.settingSkinRaceEnabled и другие общие настройки.
                // Мы доверяем тому, что пришло с сервера в `currentSettings`.
                // Если мы попытаемся прочитать их из DOM здесь, они могут быть пустыми, 
                // так как вкладка "Настройки" скрыта и могла не прогрузиться.

                // 4. Обновляем ТОЛЬКО поля расписания (то, что мы видим на экране)
                const overrideEl = document.getElementById('setting-quest-schedule-override');
                const typeEl = document.getElementById('setting-quest-schedule-type');

                if (overrideEl) payload.quest_schedule_override_enabled = overrideEl.checked;
                if (typeEl) payload.quest_schedule_active_type = typeEl.value;

                console.log("Сохраняем расписание. Итоговый payload:", payload);

                // 5. Отправляем обновленный объект
                await makeApiRequest('/api/v1/admin/settings/update', { 
                    settings: payload 
                });

                tg.showAlert('Настройки расписания сохранены!');

            } catch (err) {
                console.error("Ошибка сохранения:", err);
                tg.showAlert(`Ошибка: ${err.message}`);
            } finally {
                newBtn.textContent = originalText;
                newBtn.disabled = false;
            }
        });
    } else {
        console.error("КРИТИЧЕСКАЯ ОШИБКА: Кнопка save-schedule-btn не найдена в HTML!");
    }
    // --- 🔼 КОНЕЦ ИСПРАВЛЕННОГО ВАРИАНТА 🔼 ---
        // --- 🔽 ДОБАВЬ ЭТОТ БЛОК ДЛЯ НОВОГО МОДАЛЬНОГО ОКНА 🔽 ---
        if (dom.openCreateGoalModalBtn) {
            dom.openCreateGoalModalBtn.addEventListener('click', () => {
                // Сбрасываем форму в режим "Создания" каждый раз при открытии
                resetWeeklyGoalForm(); 
                // Обновляем заголовок, т.к. resetWeeklyGoalForm его тоже сбрасывает
                const modalTitle = document.getElementById('admin-create-goal-modal-title');
                if (modalTitle) modalTitle.textContent = 'Новая Задача';
                
                // Показываем модальное окно
                if (dom.adminCreateGoalModal) {
                    dom.adminCreateGoalModal.classList.remove('hidden');
                }
            });
        }
            
        }
        

/**
     * Загружает и отображает список квестов или челленджей в модальное окно.
     * Отмечает и сортирует активный для выбранного пользователя.
     * @param {string} entityType - 'quest' или 'challenge'
     */
    async function loadEntitiesForForceComplete(entityType) {
        // --- ЛОГ 1 ---
        console.log(`[ForceComplete] START: entityType = ${entityType}`);

        const container = (entityType === 'quest') ? dom.adminEntityListQuest : dom.adminEntityListChallenge;
        // Добавил (v4) для уверенности
        container.innerHTML = '<i>Загрузка... (JS v4)</i>';

        let activeUserEntities = { quest_id: null, challenge_id: null };

        if (!selectedAdminUser) {
            // --- ЛОГ 2 ---
            console.error("[ForceComplete] FATAL: selectedAdminUser is null!");
            container.innerHTML = '<p class="error-message">Ошибка: Пользователь не выбран.</p>';
            return;
        }

        // --- ЛОГ 3 ---
        console.log(`[ForceComplete] User selected: ID=${selectedAdminUser.id}, Name=${selectedAdminUser.name}`);

        try {
            // --- ЛОГ 4 ---
            console.log("[ForceComplete] Starting Promise.allSettled...");
            const [activeDataResult, entitiesResult] = await Promise.allSettled([
                makeApiRequest(`/api/v1/admin/users/${selectedAdminUser.id}/active_entities?initData=${encodeURIComponent(tg.initData)}`, {}, 'GET', true),
                makeApiRequest('/api/v1/admin/actions/list_entities', { entity_type: entityType }, 'POST', true)
            ]);

            // --- ЛОГ 5 ---
            console.log("[ForceComplete] Promise.allSettled FINISHED.");
            console.log("[ForceComplete] activeDataResult:", JSON.stringify(activeDataResult, null, 2));
            console.log("[ForceComplete] entitiesResult:", JSON.stringify(entitiesResult, null, 2));

            // Обработка результата активных сущностей
            if (activeDataResult.status === 'fulfilled' && activeDataResult.value) {
                activeUserEntities.quest_id = activeDataResult.value.active_quest_id;
                activeUserEntities.challenge_id = activeDataResult.value.active_challenge_id;
                // --- ЛОГ 6 ---
                console.log("[ForceComplete] Active entities parsed:", activeUserEntities);
            } else if (activeDataResult.status === 'rejected') {
                // --- ЛОГ 7 ---
                console.warn("[ForceComplete] Failed to get active entities:", activeDataResult.reason?.message || activeDataResult.reason);
            }

            // Обработка результата списка сущностей
            if (entitiesResult.status === 'rejected') {
                 // --- ЛОГ 8 ---
                 console.error("[ForceComplete] Failed to list entities:", entitiesResult.reason);
                 throw entitiesResult.reason; // Перебрасываем ошибку загрузки списка
            }

            let entities = entitiesResult.value; // Используем let, так как будем сортировать

            // --- ЛОГ 9 ---
            console.log(`[ForceComplete] Entities list received. Count: ${entities ? entities.length : 'null'}`);


            if (!entities || entities.length === 0) {
                container.innerHTML = `<p style="text-align: center;">Активных ${entityType === 'quest' ? 'квестов' : 'челленджей'} не найдено.</p>`;
                return;
            }

            // --- СОРТИРОВКА ---
            const activeEntityId = (entityType === 'quest') ? activeUserEntities.quest_id : activeUserEntities.challenge_id;
            entities.sort((a, b) => {
                const aIsActive = a.id === activeEntityId;
                const bIsActive = b.id === activeEntityId;
                if (aIsActive && !bIsActive) return -1; // Активный элемент идет первым
                if (!aIsActive && bIsActive) return 1;  // Активный элемент идет первым
                // Если оба активны/неактивны, сортируем по ID или названию (опционально)
                return (a.title || '').localeCompare(b.title || ''); // Сортировка по названию
                // return a.id - b.id; // Или сортировка по ID
            });
            console.log("[ForceComplete] Entities sorted.");
            // --- КОНЕЦ СОРТИРОВКИ ---

            // --- ЛОГ 10 ---
            console.log("[ForceComplete] Rendering list...");

            // 3. Рендерим отсортированный список
            container.innerHTML = entities.map(entity => {
                const isActive = entity.id === activeEntityId; // Перепроверяем после сортировки
                const activeClass = isActive ? 'active' : ''; // Класс для подсветки

                return `
                <div class="submission-item entity-list-item ${activeClass}"
                     data-entity-id="${entity.id}"
                     data-entity-type="${entityType}"
                     data-entity-name="${escapeHTML(entity.title)}"
                     style="cursor: pointer;">
                    <p style="margin: 0; font-weight: 500;">
                        ${isActive ? '⭐ ' : ''}${escapeHTML(entity.title)} (ID: ${entity.id})
                    </p>
                </div>
            `;
            }).join('');

            // --- ЛОГ 11 ---
            console.log("[ForceComplete] Rendering FINISHED.");

        } catch (e) {
            // --- ЛОГ 12 ---
            console.error("[ForceComplete] CATCH block triggered:", e);
            container.innerHTML = `<p class="error-message">Ошибка загрузки (v4): ${e.message}</p>`;
        }
    }

        // --- НОВЫЙ ОБРАБОТЧИК ВЫДАЧИ ЗВЕЗД ЧЕКПОИНТА ---
        if (dom.openGrantCpSearchBtn) {
            // 1. Клик по кнопке "Найти пользователя"
            dom.openGrantCpSearchBtn.addEventListener('click', () => {
                dom.grantCheckpointStarsForm.classList.add('hidden');
                // Открываем модалку и передаем коллбэк
                openAdminUserSearchModal('Выдать звезды Чекпоинта', (user) => {
                    // Этот код выполнится, когда админ выбрал пользователя
                    dom.grantCheckpointStarsForm.elements['user_id_to_grant_cp'].value = user.id;
                    dom.grantCpUserName.textContent = `${user.name} (ID: ${user.id})`;
                    dom.grantCheckpointStarsForm.classList.remove('hidden');
                    dom.grantCheckpointStarsForm.elements['amount_cp'].focus();
                });
            });
        }
        if(dom.grantCheckpointStarsForm) {
            // 2. Отправка самой формы (после выбора пользователя)
            dom.grantCheckpointStarsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                // ... (логика submit, как в твоем файле) ...
                const form = e.target;
                const userId = parseInt(form.elements['user_id_to_grant_cp'].value);
                const amount = parseInt(form.elements['amount_cp'].value);
                if (!userId || !amount || amount <= 0) return;

                const result = await makeApiRequest('/api/v1/admin/users/grant-checkpoint-stars', {
                    user_id_to_grant: userId,
                    amount: amount
                });
                tg.showAlert(result.message);
                form.reset();
                form.classList.add('hidden'); // Снова прячем форму
            });
        }

        // --- НОВЫЙ ОБРАБОТЧИК ЗАМОРОЗКИ ЗВЕЗД ЧЕКПОИНТА ---
        if (dom.openFreezeCpSearchBtn) {
            // 1. Клик по кнопке "Найти пользователя"
            dom.openFreezeCpSearchBtn.addEventListener('click', () => {
                dom.freezeCheckpointStarsForm.classList.add('hidden');
                openAdminUserSearchModal('Заморозить/разморозить звезды Чекпоинта', (user) => {
                    dom.freezeCheckpointStarsForm.elements['user_id_to_freeze_cp'].value = user.id;
                    dom.freezeCpUserName.textContent = `${user.name} (ID: ${user.id})`;
                    dom.freezeCheckpointStarsForm.classList.remove('hidden');
                    dom.freezeCheckpointStarsForm.elements['days_cp'].focus();
                });
            });
        }
        
        // --- ОБНОВЛЕННЫЙ ОБРАБОТЧИК ЗАМОРОЗКИ ЗВЕЗД ЧЕКПОИНТА ---
        if (dom.openFreezeCpSearchBtn) {
            // 1. Клик по кнопке "Найти пользователя"
            dom.openFreezeCpSearchBtn.addEventListener('click', () => {
                dom.freezeCheckpointStarsForm.classList.add('hidden'); // Прячем форму подтверждения
                openAdminUserSearchModal('Заморозить/разморозить звезды Чекпоинта', (user) => {
                    // Коллбэк после выбора пользователя
                    dom.freezeCheckpointStarsForm.elements['user_id_to_freeze_cp'].value = user.id;
                    dom.freezeCpUserName.textContent = `${user.name} (ID: ${user.id})`;
                    dom.freezeCheckpointStarsForm.classList.remove('hidden'); // Показываем форму
                    dom.freezeCheckpointStarsForm.elements['days_cp'].focus();
                });
            });
        }
        if(dom.freezeCheckpointStarsForm) {
            // 2. Отправка самой формы (после выбора пользователя)
            dom.freezeCheckpointStarsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                const userId = parseInt(form.elements['user_id_to_freeze_cp'].value);
                const days = parseInt(form.elements['days_cp'].value);
                if (!userId || isNaN(days)) { // days может быть 0
                     tg.showAlert('Выберите пользователя и укажите количество дней.');
                     return;
                }
                try {
                    // Используем user_id из Pydantic модели
                    const result = await makeApiRequest('/api/v1/admin/users/freeze-checkpoint-stars', { user_id: userId, days: days });
                    tg.showAlert(result.message);
                    form.reset(); form.classList.add('hidden'); selectedAdminUser = null; // Сброс
                } catch (err) { tg.showAlert(`Ошибка: ${err.message}`); }
            });
        }
        // --- НОВЫЙ ОБРАБОТЧИК ВЫДАЧИ БИЛЕТОВ ---
        if (dom.openGrantTicketsSearchBtn) {
            // 1. Клик по кнопке "Найти пользователя"
            dom.openGrantTicketsSearchBtn.addEventListener('click', () => {
                dom.grantTicketsForm.classList.add('hidden');
                // Открываем модалку и передаем коллбэк
                openAdminUserSearchModal('Выдать билеты', (user) => {
                    // Этот код выполнится, когда админ выбрал пользователя
                    dom.grantTicketsForm.elements['user_id_to_grant_tickets'].value = user.id;
                    dom.grantTicketsUserName.textContent = `${user.name} (ID: ${user.id})`;
                    dom.grantTicketsForm.classList.remove('hidden');
                    dom.grantTicketsForm.elements['amount_tickets'].focus();
                });
            });
        }
        if(dom.grantTicketsForm) {
            // 2. Отправка самой формы (после выбора пользователя)
            dom.grantTicketsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                // ... (логика submit, как в твоем файле) ...
                const form = e.target;
                const userId = parseInt(form.elements['user_id_to_grant_tickets'].value);
                const amount = parseInt(form.elements['amount_tickets'].value);
                if (!userId || !amount || amount <= 0) return;

                const result = await makeApiRequest('/api/v1/admin/users/grant-stars', { // Используем /grant-stars, как в твоем коде
                    user_id_to_grant: userId,
                    amount: amount
                });
                tg.showAlert(result.message);
                form.reset();
                form.classList.add('hidden'); // Снова прячем форму
            });
        }

        // --- НОВЫЙ ОБРАБОТЧИК ЗАМОРОЗКИ БИЛЕТОВ ---
        if (dom.openFreezeTicketsSearchBtn) {
            // 1. Клик по кнопке "Найти пользователя"
            dom.openFreezeTicketsSearchBtn.addEventListener('click', () => {
                dom.freezeTicketsForm.classList.add('hidden');
                openAdminUserSearchModal('Заморозить/разморозить билеты', (user) => {
                    dom.freezeTicketsForm.elements['user_id_to_freeze_tickets'].value = user.id;
                    dom.freezeTicketsUserName.textContent = `${user.name} (ID: ${user.id})`;
                    dom.freezeTicketsForm.classList.remove('hidden');
                    dom.freezeTicketsForm.elements['days_tickets'].focus();
                });
            });
        }
        // --- ОБНОВЛЕННЫЙ ОБРАБОТЧИК ЗАМОРОЗКИ БИЛЕТОВ ---
        if (dom.openFreezeTicketsSearchBtn) {
            // 1. Клик по кнопке "Найти пользователя"
            dom.openFreezeTicketsSearchBtn.addEventListener('click', () => {
                dom.freezeTicketsForm.classList.add('hidden');
                openAdminUserSearchModal('Заморозить/разморозить билеты', (user) => {
                    dom.freezeTicketsForm.elements['user_id_to_freeze_tickets'].value = user.id;
                    dom.freezeTicketsUserName.textContent = `${user.name} (ID: ${user.id})`;
                    dom.freezeTicketsForm.classList.remove('hidden');
                    dom.freezeTicketsForm.elements['days_tickets'].focus();
                });
            });
        }
        if(dom.freezeTicketsForm) {
            // 2. Отправка самой формы
            dom.freezeTicketsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                const userId = parseInt(form.elements['user_id_to_freeze_tickets'].value);
                const days = parseInt(form.elements['days_tickets'].value);
                 if (!userId || isNaN(days)) {
                     tg.showAlert('Выберите пользователя и укажите количество дней.');
                     return;
                 }
                try {
                    // Используем user_id из Pydantic модели
                    const result = await makeApiRequest('/api/v1/admin/users/freeze-stars', { user_id: userId, days: days });
                    tg.showAlert(result.message);
                    form.reset(); form.classList.add('hidden'); selectedAdminUser = null; // Сброс
                } catch (err) { tg.showAlert(`Ошибка: ${err.message}`); }
            });
        }
        
        // --- ОБНОВЛЕННЫЙ ОБРАБОТЧИК СБРОСА НАГРАД ЧЕКПОИНТА ---
        if (dom.openResetCpProgressSearchBtn) {
            // 1. Клик по кнопке "Найти пользователя"
            dom.openResetCpProgressSearchBtn.addEventListener('click', () => {
                dom.resetCheckpointProgressForm.classList.add('hidden');
                openAdminUserSearchModal('Сбросить награды Чекпоинта', (user) => {
                    dom.resetCheckpointProgressForm.elements['user_id_to_reset'].value = user.id;
                    dom.resetCpProgressUserName.textContent = `${user.name} (ID: ${user.id})`;
                    dom.resetCheckpointProgressForm.classList.remove('hidden');
                });
            });
        }
        if (dom.resetCheckpointProgressForm) {
            // 2. Отправка самой формы
            dom.resetCheckpointProgressForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                const userId = parseInt(form.elements['user_id_to_reset'].value);
                if (!userId) return;

                tg.showConfirm(`Точно сбросить ВСЕ награды Чекпоинта для пользователя ${dom.resetCpProgressUserName.textContent}? Звёзды останутся.`, async (ok) => {
                    if (ok) {
                         try {
                            // Эндпоинт остается тот же, но теперь ID берется из скрытого поля
                            const result = await makeApiRequest('/api/v1/admin/users/reset-checkpoint-progress', { user_id: userId });
                            tg.showAlert(result.message);
                            form.reset(); form.classList.add('hidden'); selectedAdminUser = null;
                        } catch (err) { tg.showAlert(`Ошибка: ${err.message}`); }
                    }
                });
            });
        }

        // --- ОБНОВЛЕННЫЙ ОБРАБОТЧИК ОБНУЛЕНИЯ ЗВЕЗД ЧЕКПОИНТА ---
        if (dom.openClearCpStarsSearchBtn) {
            // 1. Клик по кнопке "Найти пользователя"
            dom.openClearCpStarsSearchBtn.addEventListener('click', () => {
                dom.clearCheckpointStarsForm.classList.add('hidden');
                openAdminUserSearchModal('Обнулить звёзды Чекпоинта', (user) => {
                    dom.clearCheckpointStarsForm.elements['user_id_to_clear'].value = user.id;
                    dom.clearCpStarsUserName.textContent = `${user.name} (ID: ${user.id})`;
                    dom.clearCheckpointStarsForm.classList.remove('hidden');
                });
            });
        }
        if (dom.clearCheckpointStarsForm) {
            // 2. Отправка самой формы
            dom.clearCheckpointStarsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                const userId = parseInt(form.elements['user_id_to_clear'].value);
                if (!userId) return;

                tg.showConfirm(`Точно обнулить БАЛАНС звёзд Чекпоинта для ${dom.clearCpStarsUserName.textContent}? Полученные награды останутся.`, async (ok) => {
                     if (ok) {
                         try {
                             // Эндпоинт остается тот же
                             const result = await makeApiRequest('/api/v1/admin/users/clear-checkpoint-stars', { user_id: userId });
                             tg.showAlert(result.message);
                             form.reset(); form.classList.add('hidden'); selectedAdminUser = null;
                         } catch (err) { tg.showAlert(`Ошибка: ${err.message}`); }
                     }
                });
            });
        }

        if(dom.modalCloseBtn) dom.modalCloseBtn.addEventListener('click', () => {
            dom.submissionsModal.classList.add('hidden');
            dom.submissionsModal.dataset.sourceType = ''; // Очистка
            dom.submissionsModal.dataset.sourceId = '';   // Очистка
        });
        if(dom.submissionsModal) dom.submissionsModal.addEventListener('click', (e) => { 
            if (e.target === dom.submissionsModal) {
                dom.submissionsModal.classList.add('hidden'); 
                dom.submissionsModal.dataset.sourceType = ''; // Очистка
                dom.submissionsModal.dataset.sourceId = '';   // Очистка
            }
        });

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
            const quantity = parseInt(form.elements['quantity'].value);

            if (isNaN(quantity) || quantity < 0) {
                 tg.showAlert('Количество должно быть 0 или больше.');
                 return;
            }

            const data = {
                reward_title: form.elements['reward_title'].value,
                skin_name: form.elements['skin_name'].value,
                image_url: form.elements['image_url'].value,
                chance_weight: parseFloat(form.elements['chance_weight'].value),
                quantity: quantity // <-- Убедись, что это поле добавлено
            };

            await makeApiRequest('/api/v1/admin/roulette/create', data);
            tg.showAlert('Приз добавлен!');
            // Очищаем только поля скина, оставляем название рулетки
            form.elements['skin_name'].value = '';
            form.elements['image_url'].value = '';
            form.elements['chance_weight'].value = 10;
            form.elements['quantity'].value = 0; // Сбрасываем количество
            form.elements['skin_name'].focus();

            // Перезагружаем список призов
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
            // --- ЛОГ 1: Проверяем initData ---
            console.log("main(): Проверка tg.initData:", tg.initData);
            if (!tg.initData) {
                console.error("main(): tg.initData отсутствует!"); // <-- Добавлено
                throw new Error("Требуется авторизация в Telegram.");
            }

            showLoader();
            const [userData, sleepStatus] = await Promise.all([
                makeApiRequest("/api/v1/user/me", {}, 'POST', true),
                makeApiRequest("/api/v1/admin/sleep_mode_status", {}, 'POST', true)
            ]);

            // --- ЛОГ 2: Проверяем ответ от /user/me ---
            console.log("main(): Ответ от /api/v1/user/me:", JSON.stringify(userData));
            // --- ЛОГ 3: Проверяем результат проверки админа ---
            console.log(`main(): Проверка userData.is_admin. Значение: ${userData?.is_admin}. Результат проверки (!userData.is_admin): ${!userData?.is_admin}`);

            if (!userData.is_admin) {
                // --- ЛОГ 4: Фиксируем момент выбрасывания ошибки ---
                console.error("main(): ОШИБКА ДОСТУПА! userData.is_admin НЕ true. Выбрасываем ошибку.");
                throw new Error("Доступ запрещен.");
            }
            // ЗАПРОС СЧЕТЧИКОВ ПЕРЕД ПОКАЗОМ ГЛАВНОГО ЭКРАНА
            try {
                const counts = await makeApiRequest("/api/v1/admin/pending_counts", {}, 'POST', true);
                const totalPending = (counts.submissions || 0) + (counts.event_prizes || 0) + (counts.checkpoint_prizes || 0);
                const mainBadge = document.getElementById('main-pending-count');
                if (mainBadge) {
                    mainBadge.textContent = totalPending;
                    mainBadge.classList.toggle('hidden', totalPending === 0);
                }
            } catch (countError) {
                console.error("Не удалось загрузить счетчики:", countError);
                // Можно скрыть бейдж или показать ошибку
                const mainBadge = document.getElementById('main-pending-count');
                if (mainBadge) mainBadge.classList.add('hidden');
            }
            // Этот код не должен выполниться, если нет доступа
            console.log("main(): Доступ разрешен. Установка isAdmin=true и переключение вида."); // <-- Добавлено
            document.body.dataset.isAdmin = 'true';
            
            // Проверяем, был ли введен пароль 6971
            if (hasAdminAccess) {
                 // Показываем все скрытые элементы админа
                 document.querySelectorAll('.admin-feature-6971').forEach(el => {
                    el.style.display = 'block'; // или 'flex'
                 });
            }

            updateSleepButton(sleepStatus);
            await switchView('view-admin-main');

        } catch (e) {
            // --- ЛОГ 5: Фиксируем ошибку в блоке catch ---
            console.error("main(): Ошибка поймана в блоке catch:", e.message);
            document.body.dataset.isAdmin = 'false';
            if(dom.sleepModeToggle) dom.sleepModeToggle.classList.add('hidden');
            if(dom.appContainer) dom.appContainer.innerHTML = `<div style="padding:20px; text-align:center;"><h1>${e.message}</h1><p>Убедитесь, что вы являетесь администратором.</p></div>`;
        } finally {
            // --- ЛОГ 6: Фиксируем выполнение finally ---
            console.log("main(): Блок finally выполняется.");
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
