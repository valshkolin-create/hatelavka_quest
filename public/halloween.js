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
        toggleEditBtn: document.getElementById('toggle-edit-btn'),
        // --- НОВЫЕ ЭЛЕМЕНТЫ ---
        rewardsListButton: document.getElementById('rewards-list-button'),
        rewardsListModal: document.getElementById('rewards-list-modal'),
        rewardsListContent: document.getElementById('rewards-list-content'),
        rewardsTabs: document.querySelectorAll('.rewards-tab-btn')
    };
    console.log('[INIT] DOM-элементы найдены и сохранены.');

    function formatNumber(num) {
        if (!num) return '0';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    }

    // --- БЫСТРАЯ ЗАГРУЗКА ТЕМЫ ИЗ ПАМЯТИ ---
    const savedTheme = localStorage.getItem('saved_theme');
    if (savedTheme) {
        console.log(`[INIT] Найдена сохраненная тема: ${savedTheme}. Применяем немедленно.`);
        document.body.dataset.theme = savedTheme;
        // Визуально подсвечиваем кнопку, если панель уже есть
        if (dom.themeSwitcher) {
            dom.themeSwitcher.querySelectorAll('.theme-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.themeSet === savedTheme);
            });
        }
    }

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
        
        // 1. Сохраняем и применяем тему
        localStorage.setItem('saved_theme', themeName);
        document.body.dataset.theme = themeName;
        
        // 2. Обновляем кнопки в админке
        if (dom.themeSwitcher) {
            dom.themeSwitcher.querySelectorAll('.theme-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.themeSet === themeName);
            });
        }

        // 3. --- СЛОВАРЬ ТЕРМИНОВ (С ПАДЕЖАМИ) ---
        const terms = {
            halloween: {
                title: 'Ведьминский Котел',    // Заголовок
                btnAction: 'Вложить в котел',  // Кнопка
                acc: 'котел',                  // (Куда?) В котел
                prep: 'котле'                  // (Где?) В котле
            },
            new_year: {
                title: '₊⁺🎄🎅 МЕШОК ЧУДЕС 🎅🎄⁺₊',
                btnAction: 'Положить в мешок',
                acc: 'мешок',
                prep: 'мешке'
            },
            classic: {
                title: 'Общий Банк',
                btnAction: 'Пополнить банк',
                acc: 'банк',
                prep: 'банке'
            }
        };

        // Выбираем словарь (или классику, если тема неизвестна)
        const t = terms[themeName] || terms.classic;

        // 4. --- ПРИМЕНЯЕМ ТЕКСТЫ ---
        
        // А. Заголовок и кнопка
        const headerTitle = document.getElementById('event-title');
        const submitBtn = document.querySelector('#contribution-form button');

        if (headerTitle) {
            // Меняем заголовок, только если он стандартный или пустой, чтобы не затереть кастомное название с сервера
            if (!currentEventData || !currentEventData.title || currentEventData.title === "Ивент-Котел" || currentEventData.title === "Ведьминский Котел" || currentEventData.title === "Новогодний Мешок" || currentEventData.title === "Общий Банк") {
                headerTitle.textContent = t.title;
            }
        }
        if (submitBtn) {
            submitBtn.textContent = t.btnAction;
        }

        // Б. Текст в правилах ("Как играть?")
        // Ищем все места, где нужно вставить слово в Винительном падеже ("в котел")
        document.querySelectorAll('.dynamic-word-acc').forEach(el => el.textContent = t.acc);
        
        // Ищем все места, где нужно вставить слово в Предложном падеже ("в котле")
        document.querySelectorAll('.dynamic-word-prep').forEach(el => el.textContent = t.prep);

        // 5. Логика обновления картинки награды (осталась прежней)
        if (currentUserData.is_admin) {
             currentEventData.current_theme = themeName;
        }
        if (dom.rewardImage) {
            const THEME_ASSETS = {
                halloween: { default_reward_image: 'URL_ВАШЕЙ_НАГРАДЫ_HALLOWEEN.png' }, // Замени на свои URL
                new_year: { default_reward_image: 'URL_ВАШЕЙ_НАГРАДЫ_NEW_YEAR.png' },
                classic: { default_reward_image: 'URL_ВАШЕЙ_НАГРАДЫ_CLASSIC.png' }
            };
            const currentThemeAssets = THEME_ASSETS[themeName] || THEME_ASSETS.classic;
            const currentLevel = getCurrentLevel(currentEventData);
            const levelConfig = (currentEventData.levels && currentEventData.levels[`level_${currentLevel}`]) || {};
            const defaultReward = levelConfig.default_reward || {};
            dom.rewardImage.src = defaultReward.image_url || currentThemeAssets.default_reward_image;
        }
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
                // Приоритет Twitch ника при сортировке
                const nameA = a.twitch_login || a.full_name || ''; 
                const nameB = b.twitch_login || b.full_name || '';
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
        
        // Получаем тиры или создаем объект с fallback-ом на дефолтную награду для 41+
        const tiers = levelConfig.tiers || { "41+": levelConfig.default_reward || {} };

        // 1. Отрисовка Топ-20
        dom.leaderboardRewardsList.innerHTML = top20.length === 0
            ? '<p style="text-align:center; padding: 20px; color: var(--text-color-muted);">Участников пока нет.</p>'
            : top20.map((p, index) => {
                const rank = index + 1;
                const contributionAmount = p.total_contribution || 0;
                let assignedReward = null;
                
                // Ищем награду в массиве top_places
                if (rank <= 20) assignedReward = topPlaceRewards.find(r => r.place === rank);
                // Если не нашли в топ-20, проверяем тиры (на всякий случай, хотя топ-20 это отдельный список)
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
                // --- НОВАЯ ЛОГИКА С ИКОНКАМИ ---
                const rowClass = rank <= 3 ? 'leaderboard-row is-top-3' : 'leaderboard-row';
                
                // 1. SVG Иконки (Twitch и Telegram)
                const twitchIconSvg = `<svg class="platform-icon icon-twitch" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2.149 0L.537 4.119v16.836h5.731V24h3.224l3.045-3.045h4.657l6.269-6.269V0H2.149zm19.164 13.612l-3.582 3.582H12l-3.045 3.045v-3.045H4.119V2.149h17.194v11.463zm-12.09-5.731h2.507v5.731H9.224V7.881zm5.731 0h2.507v5.731h-2.507V7.881z"/></svg>`;
                const telegramIconSvg = `<svg class="platform-icon icon-telegram" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21.928 3.52c.316-1.418-.963-2.489-2.284-1.934L2.57 9.265c-1.338.564-1.33 1.872.225 2.349l4.847 1.504 11.2-7.056c.536-.329 1.024.005.621.36l-9.08 8.184v4.167c0 .614.497.756.826.458l2.424-2.334 5.023 3.71c1.136.625 1.954.3 2.237-1.046l4.047-19.046z"/></svg>`;

                let playerName;
                let iconHtml;

                // 2. Логика выбора имени и иконки
                if (p.twitch_login) {
                    // Если есть Твич ник - берем его и иконку Твича
                    playerName = p.twitch_login;
                    iconHtml = twitchIconSvg;
                } else {
                    // Иначе берем Телеграм имя и иконку ТГ
                    playerName = p.full_name || 'Без имени';
                    iconHtml = telegramIconSvg;
                }
                
                // Обрезку JS можно оставить на всякий случай, хотя CSS text-overflow теперь тоже работает
                // if (playerName.length > 16) playerName = playerName.substring(0, 16) + '...';

                // 3. Возвращаем обновленную HTML структуру
                return `
                <div class="${rowClass}">
                    <div class="leaderboard-rank">${rank}</div>
                    
                    <div class="leaderboard-name">
                        <div class="player-name-container">
                            ${iconHtml}
                            <span class="player-name-text" title="${playerName}">${playerName}</span>
                        </div>
                    </div>
                    
                    <div class="leaderboard-score">${formatNumber(p.total_contribution)}</div>
                </div>
                `;
            }).join('');

        // 2. Статистика текущего пользователя
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
        // Ищем новый контейнер, который вы добавили в HTML
        const tierListContainer = document.getElementById('tier-rewards-list');
        
        if (tierListContainer) {
            const activeTheme = document.body.dataset.theme || 'halloween';
            const themeFallbackImg = THEME_ASSETS[activeTheme]?.default_reward_image;

            // Определяем данные для отображения 3 блоков
            const tierDisplayData = [
                { id: '21-30', label: 'Места 21-30', style: 'tier-gold' },
                { id: '31-40', label: 'Места 31-40', style: 'tier-silver' },
                { id: '41+',   label: 'Места 41+',   style: 'tier-bronze' }
            ];

            tierListContainer.innerHTML = tierDisplayData.map(tier => {
                // Пытаемся взять данные конкретного тира
                const data = tiers[tier.id] || {};
                
                // Если имя пустое — пишем заглушку или берем дефолт
                const name = data.name || (levelConfig.default_reward?.name) || 'Награда не настроена';
                
                // Если картинка пустая — берем дефолт уровня -> берем картинку темы
                const img = data.image_url || levelConfig.default_reward?.image_url || themeFallbackImg;

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
        } else {
            console.warn('[RENDER] Элемент tier-rewards-list не найден в HTML!');
        }

        console.log('[RENDER] Отрисовка страницы (renderPage) завершена.');
    }
    // --- НОВАЯ ФУНКЦИЯ: Рендер списка наград в модалке ---
    // [НОВОЕ] Вспомогательная функция для расчета % прогресса
    function calculateEventProgress(eventData) {
        const { goals = {}, current_progress = 0 } = eventData || {};
        const currentLevel = getCurrentLevel(eventData);
        
        let currentGoal = 1, prevGoal = 0;
        
        if (currentLevel === 1) { currentGoal = goals.level_1 || 1; prevGoal = 0; }
        else if (currentLevel === 2) { currentGoal = goals.level_2 || goals.level_1; prevGoal = goals.level_1; }
        else if (currentLevel === 3) { currentGoal = goals.level_3 || goals.level_2; prevGoal = goals.level_2; }
        else if (currentLevel === 4) { currentGoal = goals.level_4 || goals.level_3; prevGoal = goals.level_3; }

        const progressInLevel = Math.max(0, current_progress - prevGoal);
        const goalForLevel = currentGoal - prevGoal;
        // Считаем процент (0-100)
        const percentage = (goalForLevel > 0) ? Math.min((progressInLevel / goalForLevel) * 100, 100) : 0;
        
        return { currentLevel, percentage };
    }
    // --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: РАСЧЕТ ПРОГРЕССА ---
    function calculateEventProgress(eventData) {
        const { goals = {}, current_progress = 0 } = eventData || {};
        const currentLevel = getCurrentLevel(eventData);
        
        let currentGoal = 1, prevGoal = 0;
        
        if (currentLevel === 1) { currentGoal = goals.level_1 || 1; prevGoal = 0; }
        else if (currentLevel === 2) { currentGoal = goals.level_2 || goals.level_1; prevGoal = goals.level_1; }
        else if (currentLevel === 3) { currentGoal = goals.level_3 || goals.level_2; prevGoal = goals.level_2; }
        else if (currentLevel === 4) { currentGoal = goals.level_4 || goals.level_3; prevGoal = goals.level_3; }

        const progressInLevel = Math.max(0, current_progress - prevGoal);
        const goalForLevel = currentGoal - prevGoal;
        
        // Считаем чистый процент (0-100)
        const percentage = (goalForLevel > 0) ? Math.min((progressInLevel / goalForLevel) * 100, 100) : 0;
        
        return { currentLevel, percentage, currentGoal };
    }

    // --- ОБНОВЛЕННАЯ ФУНКЦИЯ: Рендер списка наград ---
    function renderRewardsModalContent(targetLevel) {
        const { currentLevel, percentage } = calculateEventProgress(currentEventData);
        
        // 1. ОПРЕДЕЛЯЕМ НАЗВАНИЕ ПРЕДМЕТА (Котел / Мешок / Сундук)
        // Берем тему из body (самый надежный способ, т.к. она там уже стоит)
        const activeTheme = document.body.dataset.theme || 'halloween';
        
        const containerNames = {
            halloween: { acc: 'котел', prep: 'котле' },   // Винительный / Предложный
            new_year:  { acc: 'мешок', prep: 'мешке' },
            classic:   { acc: 'сундук', prep: 'сундуке' } // Или 'банк', если нужно
        };
        // Если темы нет в словаре, берем классику
        const t = containerNames[activeTheme] || containerNames.classic;

        // 2. ЛОГИКА ОТКРЫТИЯ
        const isNextLevelUnlocked = percentage >= 70;
        const maxViewableLevel = isNextLevelUnlocked ? Math.min(currentLevel + 1, 4) : currentLevel;
        const isTargetLocked = targetLevel > maxViewableLevel;

        // Обновляем табы
        if (dom.rewardsTabs) {
            dom.rewardsTabs.forEach(btn => {
                const btnLevel = parseInt(btn.dataset.level);
                btn.classList.toggle('active', btnLevel === targetLevel);
                btn.classList.toggle('locked', btnLevel > maxViewableLevel);
            });
        }

        const content = dom.rewardsListContent;
        if (!content) return;
        content.innerHTML = '';

        // 3. ЕСЛИ УРОВЕНЬ ЗАКРЫТ
        if (isTargetLocked) {
            const currentPercentFixed = percentage.toFixed(0);
            
            // ЛОГИКА ОТОБРАЖЕНИЯ ПРОГРЕСС-БАРА
            // Бар показываем ТОЛЬКО если это следующий уровень (Current + 1).
            // Если это уровни дальше (например, мы на 1, а смотрим 3 или 4), бар скрываем.
            const showProgressBar = (targetLevel === currentLevel + 1);

            let lockDescription = '';
            
            if (showProgressBar) {
                // Текст для следующего уровня (с баром)
                lockDescription = `Заполните ${t.acc} на <strong>70%</strong>, чтобы увидеть награды этого этапа.`;
            } else {
                // Текст для далеких уровней (без бара)
                lockDescription = `Этот этап пока недоступен. Сначала полностью заполните ${t.acc} на предыдущих уровнях.`;
            }

            content.innerHTML = `
                <div class="locked-level-container">
                    <i class="fa-solid fa-lock lock-icon-large"></i>
                    <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px; color: #fff;">Этап закрыт</div>
                    
                    <div style="font-size: 14px; margin-bottom: 15px; line-height: 1.5;">
                        ${lockDescription}
                    </div>
                    
                    ${showProgressBar ? `
                        <div class="modal-progress-wrapper">
                            <div class="modal-progress-fill" style="width: ${percentage}%"></div>
                        </div>
                        <div style="font-size: 12px; color: var(--text-color-muted); margin-top: 5px;">
                            Прогресс в ${t.prep}: <span style="color: var(--primary-color); font-weight:bold;">${currentPercentFixed}%</span> / 70%
                        </div>
                    ` : ''}
                </div>
            `;
            return;
        }

        // 4. ЕСЛИ ОТКРЫТ -> РЕНДЕРИМ СПИСОК
        const levels = currentEventData.levels || {};
        const levelConfig = levels[`level_${targetLevel}`] || {};
        const topPlaces = levelConfig.top_places || [];
        const tiers = levelConfig.tiers || {};
        const defaultReward = levelConfig.default_reward || {};

        // Группа Топ-20
        let html = `<div class="modal-rewards-group"><div class="modal-rewards-title">Топ-20 Игроков</div>`;
        if (topPlaces.length === 0) {
            html += '<p style="font-size:12px; color:#777; padding:10px;">Награды не назначены</p>';
        } else {
            topPlaces.sort((a,b) => a.place - b.place).forEach(reward => {
                html += `
                    <div class="modal-reward-item">
                        <span class="modal-reward-place">#${reward.place}</span>
                        <img src="${escapeHTML(reward.image_url)}" class="modal-reward-img" data-full-name="${escapeHTML(reward.name)}">
                        <span class="modal-reward-name">${escapeHTML(reward.name)}</span>
                    </div>
                `;
            });
        }
        html += `</div>`;

        // Группа Остальные
        html += `<div class="modal-rewards-group"><div class="modal-rewards-title">Награды остальным</div>`;
        const tierData = [
            { id: '21-30', label: '21-30', data: tiers["21-30"] },
            { id: '31-40', label: '31-40', data: tiers["31-40"] },
            { id: '41+',   label: '41+',   data: tiers["41+"] || defaultReward }
        ];

        tierData.forEach(tier => {
            const name = tier.data?.name || '---';
            const img = tier.data?.image_url || '';
            html += `
                <div class="modal-reward-item">
                    <span class="modal-reward-place" style="font-size: 11px; width: 40px; opacity: 0.7;">${tier.label}</span>
                    ${img ? `<img src="${escapeHTML(img)}" class="modal-reward-img" data-full-name="${escapeHTML(name)}">` : '<div style="width:40px;"></div>'}
                    <span class="modal-reward-name">${escapeHTML(name)}</span>
                </div>
            `;
        });
        html += `</div>`;
        
        content.innerHTML = html;
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
    // Открытие модалки призов
    if (dom.rewardsListButton) {
        dom.rewardsListButton.addEventListener('click', () => {
            const currentLevel = getCurrentLevel(currentEventData);
            // При открытии показываем текущий активный уровень
            renderRewardsModalContent(currentLevel);
            showModal(dom.rewardsListModal);
        });
    }

    // Переключение табов внутри модалки
    if (dom.rewardsTabs) {
        dom.rewardsTabs.forEach(btn => {
            btn.addEventListener('click', () => {
                const level = parseInt(btn.dataset.level);
                renderRewardsModalContent(level);
            });
        });
    }

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
        document.body.classList.add('no-scroll');

        // --- ДОБАВЬ ЭТО: Скрываем баннер админа, пока открыто окно ---
        if (dom.adminNotice) dom.adminNotice.classList.add('hidden');
        
        // Скрываем кнопки админа (это у тебя уже было)
        if (dom.adminControls && !dom.adminControls.classList.contains('expanded')) {
             dom.adminControls.style.display = 'none';
        }
    }

    function hideModal(modalElement) {
        modalElement.classList.add('hidden');
        
        // Проверяем, есть ли еще открытые модалки (чтобы не включить скролл, если под картинкой еще открыт список)
        // Ищем элементы с классом modal-overlay или image-viewer-overlay, у которых НЕТ класса hidden
        const activeModals = document.querySelectorAll('.modal-overlay:not(.hidden), .image-viewer-overlay:not(.hidden)');
        
        // Если открытых окон больше нет — возвращаем скролл
        if (activeModals.length === 0) {
            document.body.classList.remove('no-scroll');
            
            // Возвращаем админ-кнопки (старая логика)
            if (currentUserData.is_admin && dom.adminControls) {
                dom.adminControls.style.display = 'flex';
            }
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
    // [НОВОЕ] Обработчик клика по наградам в модалке (Зум)
    if (dom.rewardsListContent) {
        dom.rewardsListContent.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-reward-img')) {
                const imgUrl = e.target.src;
                const name = e.target.dataset.fullName; // Берем имя из атрибута
                
                if (imgUrl) {
                    dom.viewerImage.src = imgUrl;
                    dom.viewerCaption.textContent = name || '';
                    showModal(dom.imageViewerModal);
                }
            }
        });
    }
});
