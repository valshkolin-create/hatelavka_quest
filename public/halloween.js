function formatNumber(num) {
        if (!num) return '0';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    }

document.addEventListener('DOMContentLoaded', () => {
    console.log('[INIT] DOMContentLoaded сработало. Начинаем инициализацию скрипта.');
        
    checkEventStatus();

    const RARITY_COLORS = {
        common: '#b0c3d9',      // Ширпотреб
        uncommon: '#5e98d9',    // Промышленное
        rare: '#4b69ff',        // Армейское
        mythical: '#8847ff',    // Запрещенное
        legendary: '#d32ce6',   // Засекреченное
        ancient: '#eb4b4b',     // Тайное
        immortal: '#e4ae39'     // Нож
    };

    const WEAR_NAMES = {
        'Factory New': 'Прямо с завода',
        'Minimal Wear': 'Немного поношенное',
        'Field-Tested': 'После полевых',
        'Well-Worn': 'Поношенное',
        'Battle-Scarred': 'Закаленное в боях'
    }; 

// ==========================================
// 🎃 НОВАЯ ЛОГИКА: ПРОВЕРКА СТАТУСА ИВЕНТА
// ==========================================
window.isEventPaused = false; // Глобальный флаг

// ==========================================
// 🛡️ ЗАЩИТА: ПРОВЕРКА ТЕХ. РЕЖИМА (КЛИЕНТ)
// ==========================================
async function checkMaintenance() {
    try {
        // Проверяем статус сервера
        const res = await fetch('/api/v1/bootstrap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: window.Telegram?.WebApp?.initData || '' })
        });

        if (res.ok) {
            const data = await res.json();
            
            // Если включен режим сна (maintenance: true)
            if (data.maintenance) {
                console.warn("⛔ Тех. режим включен. Редирект на главную.");
                // Убираем всё содержимое, чтобы пользователь не видел интерфейс
                document.body.innerHTML = ""; 
                // Перекидываем на заглушку
                window.location.href = '/'; 
                return; // Останавливаем выполнение скрипта
            }
        }
    } catch (e) {
        console.error("Ошибка проверки статуса:", e);
    }
}

// Запускаем проверку ПЕРВЫМ ДЕЛОМ
checkMaintenance();
// ==========================================

async function checkEventStatus() {
    try {
        const response = await fetch('/api/event/status');
        const data = await response.json();

        // 1. ИВЕНТ ВЫКЛЮЧЕН (Глобальная заглушка)
        if (!data.visible) {
            document.body.innerHTML = `
                <div style="height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#000; color:white; font-family:sans-serif; text-align:center; padding:20px;">
                    <i class="fa-solid fa-door-closed" style="font-size: 50px; color: #555; margin-bottom: 20px;"></i>
                    <h1 style="margin:0;">Ивент завершен</h1>
                    <p style="color:#888;">Спасибо за участие!</p>
                    <a href="/menu" style="margin-top:20px; color:#ff9500; text-decoration:none; border:1px solid #333; padding:10px 20px; border-radius:10px;">В главное меню</a>
                </div>
            `;
            return;
        }

        // 2. ПАУЗА (Красивый оверлей)
        if (data.paused) {
            window.isEventPaused = true;
            console.log("Ивент на паузе. Активируем оверлей.");
            
            const btn = document.getElementById('contribute-btn');
            if (btn) btn.disabled = true;

            // Ищем контейнер формы для перекрытия
            let controlsContainer = document.getElementById('contribution-form');
            if (!controlsContainer && btn) {
                controlsContainer = btn.parentNode; // Запасной вариант
            }

            if (controlsContainer) {
                controlsContainer.style.position = 'relative'; // Важно для позиционирования
                
                // Если оверлея еще нет — создаем его
                if (!controlsContainer.querySelector('.pause-overlay')) {
                    const overlay = document.createElement('div');
                    overlay.className = 'pause-overlay';
                    
                    overlay.innerHTML = `
                        <div class="pause-content">
                            <div class="pause-icon-wrapper">
                                <i class="fa-solid fa-lock pause-icon"></i>
                            </div>
                            <div class="pause-title">Прием закрыт</div>
                            <div class="pause-subtitle">Подсчет итогов...</div>
                        </div>
                    `;
                    controlsContainer.appendChild(overlay);
                }
            }
        } else {
            // ИВЕНТ АКТИВЕН
            window.isEventPaused = false;
            
            // Удаляем оверлей, если он есть
            const overlay = document.querySelector('.pause-overlay');
            if (overlay) {
                overlay.style.opacity = '0'; // Плавное исчезновение
                setTimeout(() => overlay.remove(), 300);
            }
            
            const btn = document.getElementById('contribute-btn');
            if (btn) btn.disabled = false;
        }

    } catch (e) {
        console.error("Ошибка статуса:", e);
    }
}



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
        // --- ДОБАВЬ ВОТ ЭТИ СТРОКИ ---
        activeGameInterface: document.getElementById('active-game-interface'),
        subscriptionLockInterface: document.getElementById('subscription-lock-interface'),
        checkSubBtn: document.getElementById('check-sub-btn'),
        // -----------------------------
        // --- НОВЫЕ ЭЛЕМЕНТЫ ---
        rewardsListButton: document.getElementById('rewards-list-button'),
        rewardsListModal: document.getElementById('rewards-list-modal'),
        rewardsListContent: document.getElementById('rewards-list-content'),
        rewardsTabs: document.querySelectorAll('.rewards-tab-btn')
    };
    console.log('[INIT] DOM-элементы найдены и сохранены.');

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
        classic: { default_reward_image: 'URL_ВАШЕЙ_НАГРАДЫ_CLASSIC.png' }, // <--- ОБЯЗАТЕЛЬНО ЗАПЯТАЯ ЗДЕСЬ
        runcase: { default_reward_image: 'URL_ВАШЕЙ_НАГРАДЫ_RUNCASE.png' }
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

    // --- [НОВОЕ] Функция для сбора всех картинок наград ---
function getAllRewardImages(eventData) {
    const images = [];
    // Картинка-заглушка (Подарок), если наград нет
    const FALLBACK_GIFT = 'https://img.icons8.com/?size=100&id=wuSvVpkmKrXV&format=png&color=000000'; 

    if (!eventData || !eventData.levels) return [FALLBACK_GIFT];

    // Пробегаемся по всем уровням (1-4)
    for (let i = 1; i <= 4; i++) {
        const level = eventData.levels[`level_${i}`];
        if (!level) continue;

        // 1. Берем из Топ-20
        if (level.top_places && Array.isArray(level.top_places)) {
            level.top_places.forEach(r => {
                if (r.image_url) images.push(r.image_url);
            });
        }
        // 2. Берем из Тиров (остальные)
        if (level.tiers) {
            Object.values(level.tiers).forEach(t => {
                if (t.image_url) images.push(t.image_url);
            });
        }
        // 3. Берем дефолтную награду
        if (level.default_reward && level.default_reward.image_url) {
            images.push(level.default_reward.image_url);
        }
    }

    // Если список пуст, возвращаем только подарок
    return images.length > 0 ? images : [FALLBACK_GIFT];
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
            },
    // <-- ДОБАВЛЯЕМ НОВУЮ ТЕМУ -->
            runcase: {
                title: 'RUNCASE x HATELOVE', // Как на скрине, или "Ранговый Кейс"
                btnAction: 'СЗАЛУТАТЬ ДРОП', // У Runcase кнопки капсом
                acc: 'дроп',
                prep: 'дропе'
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
            if (!currentEventData || !currentEventData.title || currentEventData.title === "Ивент-Котел" || currentEventData.title === "Ведьминский Котел" || currentEventData.title === "Новогодний Мешок" || currentEventData.title === "Общий Банк" || currentEventData.title === "RUNCASE x HATELOVE") {
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
                
                // Ищем награду (старая логика)
                if (rank <= 20) assignedReward = topPlaceRewards.find(r => r.place === rank);
                else if (rank <= 30) assignedReward = tiers["21-30"];
                else if (rank <= 40) assignedReward = tiers["31-40"];
                else assignedReward = tiers["41+"];

                const prizeName = escapeHTML(assignedReward?.name || '');
                
                // --- ИСПРАВЛЕНИЕ: ДОБАВЛЯЕМ ЛОГИКУ СВЕЧЕНИЯ И ИЗНОСА ДЛЯ ТОПОВ ---
                const rarityKey = assignedReward?.rarity;
                const rarityColor = RARITY_COLORS[rarityKey] || null;
                const wearKey = assignedReward?.wear;
                const wearText = WEAR_NAMES[wearKey] || ''; // Текст износа

                // Если есть цвет редкости -> добавляем тень
                const glowStyle = rarityColor 
                    ? `style="filter: drop-shadow(0 0 6px ${rarityColor}80);"` 
                    : '';

                // Добавляем data-wear в контейнер и glowStyle в картинку
                const prizeImageHtml = assignedReward?.image_url
                    ? `<div class="image-zoom-container" data-item-name="${prizeName}" data-wear="${escapeHTML(wearText)}">
                           <img src="${escapeHTML(assignedReward.image_url)}" alt="Приз" class="prize-image" ${glowStyle}>
                           <div class="zoom-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
                       </div>`
                    : `<span>-</span>`;

                const rowClass = rank <= 3 ? 'leaderboard-row is-top-3' : 'leaderboard-row';
                
                // --- ЛОГИКА ИМЕН И ИКОНОК ---
                const twitchIconSvg = `<svg class="platform-icon icon-twitch" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:16px; height:16px; margin-right:5px; flex-shrink:0; fill:#9146FF;"><path d="M2.149 0L.537 4.119v16.836h5.731V24h3.224l3.045-3.045h4.657l6.269-6.269V0H2.149zm19.164 13.612l-3.582 3.582H12l-3.045 3.045v-3.045H4.119V2.149h17.194v11.463zm-12.09-5.731h2.507v5.731H9.224V7.881zm5.731 0h2.507v5.731h-2.507V7.881z"/></svg>`;
                const telegramIconSvg = `<svg class="platform-icon icon-telegram" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:16px; height:16px; margin-right:5px; flex-shrink:0; fill:#24A1DE;"><path d="M21.928 3.52c.316-1.418-.963-2.489-2.284-1.934L2.57 9.265c-1.338.564-1.33 1.872.225 2.349l4.847 1.504 11.2-7.056c.536-.329 1.024.005.621.36l-9.08 8.184v4.167c0 .614.497.756.826.458l2.424-2.334 5.023 3.71c1.136.625 1.954.3 2.237-1.046l4.047-19.046z"/></svg>`;

                let playerName;
                let iconHtml;

                if (p.twitch_login) {
                    playerName = p.twitch_login;
                    iconHtml = twitchIconSvg;
                } else {
                    playerName = p.full_name || 'Без имени';
                    iconHtml = telegramIconSvg;
                }
                // --- ОЧИСТКА НИКА ОТ РЕКЛАМЫ ---
                if (playerName) {
                    playerName = playerName
                        .replace(/@cs_shot_bot/gi, '') // Убирает @cs_shot_bot (независимо от регистра)
                        .trim(); // Убирает лишние пробелы по краям
                }

                // Определяем иконку валюты в зависимости от режима
                const currencyIcon = currentEventData.is_manual_tasks_only ? '🔵' : '🎟️';

                // --- ВЕРНУЛИ СТАРУЮ СТРУКТУРУ ВЕРСТКИ (4 элемента), НО ОБНОВИЛИ SPAN.PLAYER ---
                return `
                <div class="${rowClass}">
                    <span class="rank">#${rank}</span>
                    
                    <span class="player" style="display: flex; align-items: center; overflow: hidden;">
                        ${iconHtml}
                        <span style="font-weight: 700; font-size: 0.7em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${escapeHTML(playerName)}
                        </span>
                    </span>

                    <div class="prize-image-container">${prizeImageHtml}</div>
                    <span class="contribution align-right">${formatNumber(contributionAmount)} ${currencyIcon}</span>
                </div>`;
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

// ==========================================
        // 🔥 НОВЫЙ БЛОК: РЕЖИМ ПОДДЕРЖКИ КАНАЛА 🔥
        // ==========================================
        // Сохраняем оригинальные правила один раз в память, чтобы уметь их возвращать
        if (dom.rulesModal && !window.originalRulesHtml) {
            window.originalRulesHtml = dom.rulesModal.innerHTML;
        }

        if (currentEventData.is_manual_tasks_only) {
            // 1. Прячем форму ввода билетов и ВСЮ ЕЁ СЕКЦИЮ (убираем ту самую линию/фон)
            if (dom.contributionForm) {
                dom.contributionForm.style.display = 'none';
                // Находим родительскую секцию .contribution-section и скрываем её целиком
                const contributionSection = dom.contributionForm.closest('.contribution-section');
                if (contributionSection) {
                    contributionSection.style.display = 'none';
                }
            }
            
            // 2. Прячем статистику (Баланс, Ранг, Твой вклад)
            if (dom.userTicketBalance) {
                const statsWrapper = dom.userTicketBalance.closest('.user-stats-container, .stats-row, .info-panel, .user-stats, .stats-wrapper');
                if (statsWrapper) statsWrapper.style.display = 'none';
                else dom.userTicketBalance.parentElement.style.display = 'none';
            }
            if (dom.userContributionTotal) {
                 const contribWrapper = dom.userContributionTotal.closest('.user-stats-container, .stats-row, .info-panel, .user-stats, .stats-wrapper');
                 if (contribWrapper) contribWrapper.style.display = 'none';
                 else dom.userContributionTotal.parentElement.style.display = 'none';
            }
            if (dom.userLeaderboardRank) {
                 const rankWrapper = dom.userLeaderboardRank.closest('.user-stats-container, .stats-row, .info-panel, .user-stats, .stats-wrapper');
                 if (rankWrapper) rankWrapper.style.display = 'none';
                 else dom.userLeaderboardRank.parentElement.style.display = 'none';
            }

            // 3. ПРЯЧЕМ ШКАЛУ ПРОГРЕССА (Убираем пустую линию и текст под ней)
            const pbContainer = document.querySelector('.progress-bar-container');
            if (pbContainer) pbContainer.style.display = 'none'; 
            
            if (dom.progressBarFill && dom.progressBarFill.parentElement) {
                dom.progressBarFill.parentElement.style.display = 'none'; 
            }
            if (dom.progressText) {
                dom.progressText.style.display = 'none'; 
            }

            // 4. Подменяем окно "Как играть?" (Путь + Названия из админки)
            if (dom.rulesModal) {
                let tasksHtml = '';
                const manualTasks = currentEventData.manual_tasks_config || [];
                if (manualTasks.length > 0) {
                    tasksHtml = '<div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 12px; margin-bottom: 15px; text-align: left;">';
                    // ОБНОВЛЕННЫЙ ЗАГОЛОВОК
                    tasksHtml += '<div style="font-size: 13px; color: #4b69ff; margin-bottom: 12px; text-transform: uppercase; font-weight: 800; text-align: center; letter-spacing: 0.5px;">ЗАДАНИЯ ДЛЯ ПОЛУЧЕНИЕ ОЧКОВ:</div>';
                    
                    manualTasks.forEach(t => {
                        // ИСПОЛЬЗУЕМ t.title. Если его нет в базе (старый конфиг), пишем ID
                        const taskDisplayName = t.title || `Задание #${t.quest_id}`;
                        
                        tasksHtml += `<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.02); padding: 8px 0; font-size: 13px;">
                            <span style="color: #ddd; flex: 1; padding-right: 10px; line-height: 1.4;">${taskDisplayName}</span>
                            <span style="color: #4b69ff; font-weight: bold; flex-shrink: 0; font-size: 14px;">+${t.points} 🔵</span>
                        </div>`;
                    });
                    tasksHtml += '</div>';
                }

                dom.rulesModal.innerHTML = `
                    <div class="modal-content" style="padding: 24px; text-align: center; border-radius: 16px; background: var(--bg-color, #121216); color: var(--text-color, #fff); position: relative; max-width: 90%; margin: auto; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                        <button class="modal-close-btn" style="position: absolute; top: 12px; right: 12px; background: none; border: none; color: #888; font-size: 20px; cursor: pointer; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;" onclick="this.closest('.modal-overlay').classList.add('hidden'); document.body.classList.remove('no-scroll');">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                        
                        <h2 style="margin-top: 0; margin-bottom: 15px; font-size: 22px;">Как играть?</h2>
                        
                        <div style="background: rgba(0, 0, 0, 0.4); border: 1px dashed #4b69ff; border-radius: 10px; padding: 15px; text-align: left; margin-bottom: 15px;">
                            <strong style="color: #4b69ff; font-size: 14px; display: block; margin-bottom: 8px;"><i class="fa-solid fa-map-location-dot"></i> Где найти задания?</strong>
                            <ol style="margin: 0; padding-left: 20px; color: #bbb; font-size: 13px; line-height: 1.6;">
                                <li>Нажмите кнопку <b>«Перейти к заданиям»</b> ниже.</li>
                                <li>В верхнем меню переключитесь на вкладку <b style="color: #fff;">«РУЧНЫЕ ЗАДАНИЯ»</b>.</li>
                                <li>Выполняйте их и получайте синие монеты 🔵 для продвижения в ТОП!</li>
                            </ol>
                        </div>

                        ${tasksHtml}

                        <button type="button" onclick="window.location.href='/quests'" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #4b69ff, #324ecc); border: none; border-radius: 12px; color: white; font-size: 16px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 15px rgba(75, 105, 255, 0.3);">
                            Перейти к заданиям
                        </button>
                    </div>
                `;
            }
            
        } else {
            // === ТУМБЛЕР ВЫКЛЮЧЕН: ВОЗВРАЩАЕМ КАК БЫЛО ===
            if (dom.contributionForm) {
                dom.contributionForm.style.display = '';
                const contributionSection = dom.contributionForm.closest('.contribution-section');
                if (contributionSection) {
                    contributionSection.style.display = '';
                }
            }
            
            // Возвращаем статистику
            if (dom.userTicketBalance) {
                const statsWrapper = dom.userTicketBalance.closest('.user-stats-container, .stats-row, .info-panel, .user-stats, .stats-wrapper');
                if (statsWrapper) statsWrapper.style.display = '';
                else dom.userTicketBalance.parentElement.style.display = '';
            }
            if (dom.userContributionTotal) {
                 const contribWrapper = dom.userContributionTotal.closest('.user-stats-container, .stats-row, .info-panel, .user-stats, .stats-wrapper');
                 if (contribWrapper) contribWrapper.style.display = '';
                 else dom.userContributionTotal.parentElement.style.display = '';
            }
            if (dom.userLeaderboardRank) {
                 const rankWrapper = dom.userLeaderboardRank.closest('.user-stats-container, .stats-row, .info-panel, .user-stats, .stats-wrapper');
                 if (rankWrapper) rankWrapper.style.display = '';
                 else dom.userLeaderboardRank.parentElement.style.display = '';
            }

            // ВОЗВРАЩАЕМ ШКАЛУ ПРОГРЕССА
            const pbContainer = document.querySelector('.progress-bar-container');
            if (pbContainer) pbContainer.style.display = '';
            
            if (dom.progressBarFill && dom.progressBarFill.parentElement) {
                dom.progressBarFill.parentElement.style.display = '';
            }
            if (dom.progressText) {
                dom.progressText.style.display = '';
            }

            // Возвращаем оригинальные правила
            if (dom.rulesModal && window.originalRulesHtml) {
                dom.rulesModal.innerHTML = window.originalRulesHtml;
                const closeBtn = dom.rulesModal.querySelector('.modal-close-btn');
                if (closeBtn) {
                    closeBtn.onclick = () => {
                        dom.rulesModal.classList.add('hidden');
                        document.body.classList.remove('no-scroll');
                    };
                }
            }
        }
        // ==========================================

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
                const data = tiers[tier.id] || {};
                const name = data.name || (levelConfig.default_reward?.name) || 'Награда не настроена';
                
                // --- ЛОГИКА СВЕЧЕНИЯ И ИЗНОСА ---
                const img = data.image_url || levelConfig.default_reward?.image_url || themeFallbackImg;
                const rarityKey = data.rarity; 
                const rarityColor = RARITY_COLORS[rarityKey] || null; // Цвет редкости
                const wearKey = data.wear;
                const wearText = WEAR_NAMES[wearKey] || ''; // Текст износа

                // Если есть редкость, добавляем легкий drop-shadow того же цвета
                const glowStyle = rarityColor 
                    ? `style="filter: drop-shadow(0 0 6px ${rarityColor}80);"` // 80 в конце добавляет прозрачность
                    : '';

                // Добавляем data-wear в атрибуты
                const imgHtml = img 
                    ? `<div class="image-zoom-container" data-item-name="${escapeHTML(name)}" data-wear="${escapeHTML(wearText)}">
                           <img src="${escapeHTML(img)}" class="tier-image" ${glowStyle}>
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
    // Рассчитываем прогресс
    const { currentLevel, percentage } = calculateEventProgress(currentEventData);
    
    // Словари для отображения
    const RARITY_COLORS = {
        common: '#b0c3d9', uncommon: '#5e98d9', rare: '#4b69ff',
        mythical: '#8847ff', legendary: '#d32ce6', ancient: '#eb4b4b', immortal: '#e4ae39'
    };
    const WEAR_NAMES = {
        'Factory New': 'Прямо с завода', 'Minimal Wear': 'Немного поношенное',
        'Field-Tested': 'После полевых', 'Well-Worn': 'Поношенное', 'Battle-Scarred': 'Закаленное в боях'
    };

    // Определяем падежи
    const activeTheme = document.body.dataset.theme || 'halloween';
    const containerNames = {
        halloween: { acc: 'котел', prep: 'котле' },
        new_year:  { acc: 'мешок', prep: 'мешке' },
        classic:   { acc: 'сундук', prep: 'сундуке' }
    };
    const t = containerNames[activeTheme] || containerNames.classic;

    // --- ЛОГИКА ДОСТУПА ---
    const isNextLevelUnlocked = percentage >= 70;
    const maxViewableLevel = isNextLevelUnlocked ? Math.min(currentLevel + 1, 4) : currentLevel;
    
    // 1. Уровень закрыт (будущее)
    const isTargetLocked = targetLevel > maxViewableLevel;
    
    // 2. Уровень пройден (прошлое) - НОВАЯ ЛОГИКА
    // Если мы на уровне 3, то 1 и 2 считаются пройденными
    const isTargetCompleted = targetLevel < currentLevel; 

    // Обновляем табы (стили)
    if (dom.rewardsTabs) {
        dom.rewardsTabs.forEach(btn => {
            const btnLevel = parseInt(btn.dataset.level);
            btn.classList.toggle('active', btnLevel === targetLevel);
            
            // Замок если закрыт (будущее) ИЛИ если пройден (прошлое - по желанию, но обычно пройденные остаются открытыми для просмотра. 
            // Но ты просил закрыть их.
            
            // Если ты хочешь блокировать кнопку таба для будущего, оставляем locked
            btn.classList.toggle('locked', btnLevel > maxViewableLevel);
            
            // Для пройденных можно добавить класс 'completed' если нужно стилизовать галочку
            if (btnLevel < currentLevel) btn.classList.add('completed-tab');
        });
    }

    const content = dom.rewardsListContent;
    if (!content) return;
    content.innerHTML = '';

    // --- СЦЕНАРИЙ 1: Уровень ПРОЙДЕН (Прошлое) ---
    if (isTargetCompleted) {
        content.innerHTML = `
            <div class="locked-level-container completed-level-container">
                <i class="fa-solid fa-circle-check lock-icon-large" style="color: var(--primary-color);"></i>
                <div style="font-size: 20px; font-weight: bold; margin-bottom: 10px; color: #fff;">Уровень пройден!</div>
                <div style="font-size: 14px; margin-bottom: 15px; line-height: 1.5; color: var(--text-color-muted);">            
            </div>
        `;
        return;
    }

    // --- СЦЕНАРИЙ 2: Уровень ЗАКРЫТ (Будущее) ---
    if (isTargetLocked) {
        const currentPercentFixed = percentage.toFixed(0);
        const showProgressBar = (targetLevel === currentLevel + 1);
        let lockDescription = '';
        
        if (showProgressBar) {
            lockDescription = `Заполните ${t.acc} на <strong>70%</strong>, чтобы увидеть награды этого этапа.`;
        } else {
            lockDescription = `Этот этап пока недоступен. Сначала заполните ${t.acc} на предыдущих уровнях.`;
        }

        content.innerHTML = `
            <div class="locked-level-container">
                <i class="fa-solid fa-lock lock-icon-large"></i>
                <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px; color: #fff;">Этап закрыт</div>
                <div style="font-size: 14px; margin-bottom: 15px; line-height: 1.5;">${lockDescription}</div>
                ${showProgressBar ? `
                    <div class="modal-progress-wrapper">
                        <div class="modal-progress-fill" style="width: ${percentage}%"></div>
                    </div>
                    <div style="font-size: 12px; color: var(--text-color-muted); margin-top: 5px;">
                        Прогресс: <span style="color: var(--primary-color); font-weight:bold;">${currentPercentFixed}%</span> / 70%
                    </div>
                ` : ''}
            </div>
        `;
        return;
    }

    // --- СЦЕНАРИЙ 3: Уровень ОТКРЫТ (Текущий) -> Рендерим список ---
    const levels = currentEventData.levels || {};
    const levelConfig = levels[`level_${targetLevel}`] || {};
    const topPlaces = levelConfig.top_places || [];
    const tiers = levelConfig.tiers || {};
    const defaultReward = levelConfig.default_reward || {};

    // === ГРУППА 1: Топ-20 Игроков ===
    let html = `<div class="modal-rewards-group"><div class="modal-rewards-title">Топ-20 Игроков</div>`;
    
    if (topPlaces.length === 0) {
        html += '<p style="font-size:12px; color:#777; padding:10px;">Награды не назначены</p>';
    } else {
        topPlaces.sort((a,b) => a.place - b.place).forEach(reward => {
            const name = reward.name || '';
            const wearKey = reward.wear;
            const rarityKey = reward.rarity;
            const wearText = WEAR_NAMES[wearKey] || '';
            const rarityColor = RARITY_COLORS[rarityKey] || 'transparent';
            const hasRarity = !!RARITY_COLORS[rarityKey];

            html += `
            <div class="modal-reward-item" style="border-left: 3px solid ${rarityColor};">
                <span class="modal-reward-place">#${reward.place}</span>
                <img src="${escapeHTML(reward.image_url)}" class="modal-reward-img" 
                     data-full-name="${escapeHTML(name)}" 
                     data-wear="${escapeHTML(wearText)}"> 
                <div class="modal-reward-info">
                    <span class="modal-reward-name" style="${hasRarity ? `color:${rarityColor};` : ''}">${escapeHTML(name)}</span>
                    ${wearText ? `<span class="reward-wear-text">${wearText}</span>` : ''}
                </div>
            </div>`;
        });
    }
    html += `</div>`;

    // === ГРУППА 2: Награды остальным ===
    html += `<div class="modal-rewards-group"><div class="modal-rewards-title">Награды остальным</div>`;
    const tierData = [
        { id: '21-30', label: '21-30', data: tiers["21-30"] },
        { id: '31-40', label: '31-40', data: tiers["31-40"] },
        { id: '41+',   label: '41+',   data: tiers["41+"] || defaultReward }
    ];

    tierData.forEach(tier => {
        const name = tier.data?.name || '---';
        const img = tier.data?.image_url || '';
        const wearKey = tier.data?.wear;
        const rarityKey = tier.data?.rarity;
        const wearText = WEAR_NAMES[wearKey] || '';
        const rarityColor = RARITY_COLORS[rarityKey] || 'transparent';
        const hasRarity = !!RARITY_COLORS[rarityKey];

        html += `
        <div class="modal-reward-item" style="border-left: 3px solid ${rarityColor};">
            <span class="modal-reward-place" style="font-size: 11px; width: 40px; opacity: 0.7;">${tier.label}</span>
            ${img ? `<img src="${escapeHTML(img)}" class="modal-reward-img" 
                          data-full-name="${escapeHTML(name)}" 
                          data-wear="${escapeHTML(wearText)}">` 
                  : '<div style="width:36px;"></div>'}
            <div class="modal-reward-info">
                <span class="modal-reward-name" style="${hasRarity ? `color:${rarityColor};` : ''}">${escapeHTML(name)}</span>
                ${wearText ? `<span class="reward-wear-text">${wearText}</span>` : ''}
            </div>
        </div>`;
    });
    html += `</div>`;
    
    content.innerHTML = html;
}
    // Добавляем новые элементы в объект dom
    dom.gatekeeperOverlay = document.getElementById('gatekeeper-overlay');
    dom.checkSubBtn = document.getElementById('check-sub-btn');
        
    // Находим новую кнопку
    const subscribeBtn = document.getElementById('subscribe-channel-btn');

    // Добавляем обработчик
    if (subscribeBtn) {
        subscribeBtn.addEventListener('click', () => {
            // Используем нативный метод Telegram
            // Он откроет канал поверх приложения
            tg.openTelegramLink('https://t.me/hatelove_ttv');
        });
    }

    // Функция проверки подписки
    async function checkSubscriptionStatus() {
        try {
            if (dom.checkSubBtn) {
                dom.checkSubBtn.textContent = 'Проверяю...';
                dom.checkSubBtn.disabled = true;
            }

            const response = await makeApiRequest('/api/v1/user/check_subscription', {}, 'POST');
            
            if (response.is_subscribed) {
                // Если подписан -> Показываем интерфейс игры, скрываем замок
                if (dom.activeGameInterface) dom.activeGameInterface.classList.remove('hidden');
                if (dom.subscriptionLockInterface) dom.subscriptionLockInterface.classList.add('hidden');
                return true;
            } else {
                // Если НЕ подписан -> Скрываем игру, показываем замок
                if (dom.activeGameInterface) dom.activeGameInterface.classList.add('hidden');
                if (dom.subscriptionLockInterface) dom.subscriptionLockInterface.classList.remove('hidden');
                return false;
            }
        } catch (e) {
            console.error('[SUB] Ошибка проверки подписки:', e);
            return false;
        } finally {
            if (dom.checkSubBtn) {
                dom.checkSubBtn.textContent = 'Проверить подписку';
                dom.checkSubBtn.disabled = false;
            }
        }
    }

    // Навешиваем обработчик на кнопку "Проверить"
    if (dom.checkSubBtn) {
        dom.checkSubBtn.addEventListener('click', () => {
            // При клике снова проверяем
            checkSubscriptionStatus().then(isSubscribed => {
                if (isSubscribed) {
                    tg.showAlert("Спасибо за подписку! Доступ открыт.");
                } else {
                    tg.showAlert("Вы все еще не подписаны на канал.");
                }
            });
        });
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
// --- 📳 НОВЫЙ БЛОК: ВИБРАЦИЯ ДЛЯ ВСЕХ ЭЛЕМЕНТОВ 📳 ---
    // --- 📳 ОБНОВЛЕННЫЙ БЛОК: УСИЛЕННАЯ ВИБРАЦИЯ 📳 ---
    document.body.addEventListener('click', (e) => {
        // Расширенный список элементов, на которые реагируем
        // Добавили 'a', '[role="button"]' и '.item-content' на всякий случай
        const selector = `
            button, 
            a, 
            .rewards-tab-btn, 
            .modal-close-btn, 
            .viewer-close-btn, 
            .theme-btn, 
            #rules-button, 
            #rewards-list-button, 
            #check-sub-btn, 
            #toggle-edit-btn,
            [role="button"]
        `;
        
        // Проверяем, был ли клик по нужному элементу
        if (e.target.closest(selector)) {
            // Проверяем наличие API
            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
                try {
                    // 'medium' - средняя вибрация (ощущается лучше, чем light)
                    // 'heavy' - сильная, если medium не чувствуется
                    window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                } catch (err) {
                    console.warn("Ошибка вибрации:", err);
                }
            }
        }
    });
    // --- 👆 КОНЕЦ ОБНОВЛЕННОГО БЛОКА 👆 ---

    // --- ОБРАБОТЧИКИ СОБЫТИЙ ---

    dom.contributionForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 🔥🔥🔥 ВСТАВИТЬ ПРОВЕРКУ СЮДА (НАЧАЛО) 🔥🔥🔥
        if (window.isEventPaused) {
            if (window.Telegram?.WebApp) {
                Telegram.WebApp.HapticFeedback.notificationOccurred('error');
                Telegram.WebApp.showAlert("Прием билетов сейчас на паузе.");
            } else {
                alert("Ивент на паузе.");
            }
            return; // ⛔ ОСТАНАВЛИВАЕМ ОТПРАВКУ
        }
        // 🔥🔥🔥 КОНЕЦ ВСТАВКИ 🔥🔥🔥
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
            const activeTheme = document.body.dataset.theme || 'halloween';

            // ЛОГИКА ВЫБОРА КАРТИНКИ ДЛЯ БРОСКА
            if (activeTheme === 'new_year') {
                // 1. Собираем все доступные картинки призов
                const allRewards = getAllRewardImages(currentEventData);
                // 2. Выбираем случайную
                const randomImg = allRewards[Math.floor(Math.random() * allRewards.length)];
                flask.src = randomImg;
                
                // (Опционально) Можно немного увеличить размер для скинов, так как они часто вытянутые
                flask.style.width = '70px'; 
                flask.style.objectFit = 'contain';
            } else {
                // Для Хэллоуина и Классики возвращаем стандартную колбу
                flask.src = "https://i.postimg.cc/XYxLQYTF/giphy-flusk.gif";
                flask.style.width = '60px'; // Возвращаем стандартный размер
            }
            // === КОНЕЦ ИЗМЕНЕНИЙ ===
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
                 const itemWear = zoomContainer.dataset.wear; // Считываем износ
                 
                 if (imageToZoom && imageToZoom.src) {
                     dom.viewerImage.src = imageToZoom.src;
                     // Формируем подпись: Название (Износ)
                     dom.viewerCaption.textContent = itemName + (itemWear ? ` (${itemWear})` : '');
                     showModal(dom.imageViewerModal);
                 }
                 return; 
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
    // ✅ ВСТАВЬТЕ ВМЕСТО НЕЕ ЭТОТ БЛОК:
    console.log('[INIT] Запуск проверок...');
    
    // Сначала проверяем подписку, потом грузим данные
    checkSubscriptionStatus().then(() => {
        fetchDataAndRender();
    });
    // ==========================================

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
                const name = e.target.dataset.fullName; 
                const wear = e.target.dataset.wear; // Считываем износ
                
                if (imgUrl) {
                    dom.viewerImage.src = imgUrl;
                    // Формируем подпись
                    dom.viewerCaption.textContent = name + (wear ? ` (${wear})` : '');
                    showModal(dom.imageViewerModal);
                }
            }
        });
    }
}); // <--- ЭТО ПОСЛЕДНИЕ СТРОКИ ФАЙЛА
// === PULL TO REFRESH (СВАЙП) ===
function initPullToRefresh() {
    const mainContent = document.getElementById('main-content');
    const ptrContainer = document.getElementById('pull-to-refresh');
    const icon = ptrContainer ? ptrContainer.querySelector('i') : null;
    
    if (!mainContent || !ptrContainer || !icon) return;

    let startY = 0;
    let pulledDistance = 0;
    let isPulling = false;

    mainContent.addEventListener('touchstart', (e) => {
        if (mainContent.scrollTop <= 0) {
            startY = e.touches[0].clientY;
            isPulling = true;
            mainContent.style.transition = 'none'; 
            ptrContainer.style.transition = 'none'; 
        } else {
            isPulling = false;
        }
    }, { passive: true });

    mainContent.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        const currentY = e.touches[0].clientY;
        const diff = currentY - startY;

        if (diff > 0 && mainContent.scrollTop <= 0) {
            if (e.cancelable) e.preventDefault();
            pulledDistance = Math.pow(diff, 0.85); 
            if (pulledDistance > 180) pulledDistance = 180;

            mainContent.style.transform = `translateY(${pulledDistance}px)`;
            ptrContainer.style.transform = `translateY(${pulledDistance}px)`;
            icon.style.transform = `rotate(${pulledDistance * 2.5}deg)`;
            
            icon.style.color = pulledDistance > 80 ? "#34c759" : "#FFD700";
        }
    }, { passive: false });

    mainContent.addEventListener('touchend', () => {
        if (!isPulling) return;
        isPulling = false;
        
        mainContent.style.transition = 'transform 0.3s ease-out';
        ptrContainer.style.transition = 'transform 0.3s ease-out';

        if (pulledDistance > 80) {
            mainContent.style.transform = `translateY(80px)`;
            ptrContainer.style.transform = `translateY(80px)`;
            icon.classList.add('fa-spin');
            if (window.Telegram && Telegram.WebApp.HapticFeedback) {
                Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
            setTimeout(() => { window.location.reload(); }, 500);
        } else {
            mainContent.style.transform = 'translateY(0px)';
            ptrContainer.style.transform = 'translateY(0px)';
            icon.style.transform = 'rotate(0deg)';
        }
        pulledDistance = 0;
    });
}

// Запуск после загрузки страницы
document.addEventListener('DOMContentLoaded', initPullToRefresh);
