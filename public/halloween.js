document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;

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
    };

    // --- ИЗМЕНЕНО: Вставьте сюда ваши ссылки на награды ---
    const THEME_ASSETS = {
        halloween: {
            default_reward_image: 'URL_ВАШЕЙ_НАГРАДЫ_HALLOWEEN.png'
        },
        new_year: {
            default_reward_image: 'URL_ВАШЕЙ_НАГРАДЫ_NEW_YEAR.png'
        },
        classic: {
            default_reward_image: 'URL_ВАШЕЙ_НАГРАДЫ_CLASSIC.png'
        }
    };
    
    // URL-заглушка на случай, если с бэкенда не придет ссылка на котел
    const FALLBACK_CAULDRON_URL = 'https://i.postimg.cc/d1G5DRk1/magic-pot.png';

    let currentUserData = {};
    let currentEventData = {};
    
    async function makeApiRequest(url, body = {}, method = 'POST') {
        try {
            const options = { method, headers: { 'Content-Type': 'application/json' } };
            if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
                options.body = JSON.stringify({ ...body, initData: tg.initData });
            }
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Ошибка сервера');
            }
            return await response.json();
        } catch (e) {
            console.error(`Ошибка API (${url}):`, e.message, e);
            throw e;
        }
    }

    function escapeHTML(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, match => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'})[match]);
    }

    function setTheme(themeName) {
        document.body.dataset.theme = themeName;
        dom.themeSwitcher.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.themeSet === themeName);
        });

        if (currentUserData.is_admin) {
            localStorage.setItem('adminSelectedTheme', themeName);
        }
        
        const currentThemeAssets = THEME_ASSETS[themeName] || THEME_ASSETS.classic;
        
        const { levels = {} } = currentEventData;
        const currentLevel = getCurrentLevel(currentEventData);
        const levelConfig = levels[`level_${currentLevel}`] || {};
        const defaultReward = levelConfig.default_reward || {};
        dom.rewardImage.src = defaultReward.image_url || currentThemeAssets.default_reward_image;
    }
    
    function getCurrentLevel(eventData) {
        const { goals = {}, current_progress = 0 } = eventData;
        if (goals.level_2 && current_progress >= goals.level_2) return 3;
        if (goals.level_1 && current_progress >= goals.level_1) return 2;
        return 1;
    }

    function renderPage(eventData, leaderboardData = {}) {
        currentEventData = eventData;
        const isAdmin = currentUserData.is_admin;
        const canViewEvent = eventData && (eventData.is_visible_to_users || isAdmin);

        if (!canViewEvent) {
            document.body.innerHTML = '<h2 style="text-align:center; padding-top: 50px;">Ивент пока неактивен.</h2>';
            return;
        }

        dom.adminNotice.classList.toggle('hidden', !(isAdmin && !eventData.is_visible_to_users));

        const { goals = {}, levels = {}, current_progress = 0 } = eventData || {};
        const top20 = leaderboardData.top20 || [];

        const currentLevel = getCurrentLevel(eventData);

        // --- НОВАЯ ЛОГИКА: Установка картинки котла в зависимости от уровня ---
        const cauldronImageUrl = eventData[`cauldron_image_url_${currentLevel}`] 
                               || eventData.cauldron_image_url // Для совместимости со старыми настройками
                               || FALLBACK_CAULDRON_URL;
        dom.cauldronImage.src = cauldronImageUrl;
        const top20 = leaderboardData.top20 || [];

        const currentLevel = getCurrentLevel(eventData);
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
        
        dom.rewardSectionTitle.textContent = `Награды Уровня ${currentLevel}`;
        dom.rewardName.textContent = defaultReward.name || 'Награда не настроена';
        const activeTheme = document.body.dataset.theme || 'halloween';
        dom.rewardImage.src = defaultReward.image_url || (THEME_ASSETS[activeTheme]?.default_reward_image);

        if (top20.length === 0) {
            dom.leaderboardRewardsList.innerHTML = '<p style="text-align:center; padding: 20px; color: var(--text-color-muted);">Участников пока нет.</p>';
        } else {
            dom.leaderboardRewardsList.innerHTML = top20.map((p, index) => {
                const rank = index + 1;
                const contributionAmount = p.total_contribution || 0;
                const assignedReward = topPlaceRewards.find(r => r.place === rank);
                const prizeImageHtml = assignedReward?.image_url 
                    ? `<img src="${escapeHTML(assignedReward.image_url)}" alt="Приз" class="prize-image">`
                    : `<span>-</span>`;
                
                const rowClass = rank <= 3 ? 'leaderboard-row is-top-3' : 'leaderboard-row';

                return `
                <div class="${rowClass}">
                    <span class="rank">#${rank}</span>
                    <span class="player">${escapeHTML(p.full_name || 'Без имени')}</span>
                    <div class="prize-image-container">${prizeImageHtml}</div>
                    <span class="contribution align-right">${contributionAmount} 🎟️</span>
                </div>`;
            }).join('');
        }
    }

    async function fetchDataAndRender() {
        try {
            const [eventData, leaderboardData, userData] = await Promise.all([
                makeApiRequest('/api/v1/events/cauldron/status', {}, 'GET'),
                makeApiRequest('/api/v1/events/cauldron/leaderboard', {}, 'GET'),
                makeApiRequest("/api/v1/user/me", {}, 'POST')
            ]);
            
            currentUserData = userData;

            if (currentUserData.is_admin) {
                document.body.classList.add('is-admin');
                const savedTheme = localStorage.getItem('adminSelectedTheme') || 'halloween';
                setTheme(savedTheme);
            } else {
                const globalTheme = eventData.current_theme || 'halloween'; 
                setTheme(globalTheme);
            }
            
            dom.userTicketBalance.textContent = currentUserData.tickets || 0;
            renderPage(eventData, leaderboardData);

        } catch (e) {
            document.body.innerHTML = `<h2 style="text-align:center; padding-top: 50px;">Ошибка загрузки ивента: ${e.message}</h2>`;
        } finally {
            dom.loaderOverlay.classList.add('hidden');
            dom.appContainer.classList.remove('hidden');
        }
    }

    // --- ОБРАБОТЧИКИ СОБЫТИЙ --- (без изменений)

    dom.contributionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
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
        
        try {
            const result = await makeApiRequest('/api/v1/events/cauldron/contribute', { amount });
            tg.showAlert(result.message);
            currentUserData.tickets = result.new_ticket_balance;
            dom.userTicketBalance.textContent = result.new_ticket_balance;
            dom.ticketsInput.value = '';
            fetchDataAndRender();
        } catch(error) {
            dom.errorMessage.textContent = error.message;
            dom.errorMessage.classList.remove('hidden');
        }
    });

    dom.themeSwitcher.addEventListener('click', (e) => {
        const button = e.target.closest('.theme-btn');
        if (button && button.dataset.themeSet) {
            setTheme(button.dataset.themeSet);
        }
    });
    
    // --- ИНИЦИАЛИЗАЦИЯ ---
    tg.ready();
    tg.expand();
    fetchDataAndRender();
});
