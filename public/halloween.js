// halloween.js
document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;

    const dom = {
        loaderOverlay: document.getElementById('loader-overlay'),
        appContainer: document.getElementById('app-container'),
        adminNotice: document.getElementById('admin-notice'),
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

    let currentUserData = {};
    
    // ✅ ИСПРАВЛЕННАЯ ФУНКЦИЯ
    async function makeApiRequest(url, body = {}, method = 'POST') {
        try {
            // Устанавливаем метод и заголовки сразу
            const options = {
                method: method,
                headers: { 'Content-Type': 'application/json' },
            };

            // Добавляем тело запроса только для методов, которые его поддерживают
            if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
                options.body = JSON.stringify({ ...body, initData: tg.initData });
            }
            
            // Отправляем запрос с правильными опциями
            const response = await fetch(url, options);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || 'Ошибка сервера');
            }
            return result;
        } catch (e) {
            console.error(`Ошибка API (${url}):`, e.message, e);
            throw e;
        }
    }

    function escapeHTML(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, match => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'})[match]);
    }

    function renderPage(eventData, leaderboardData = {}) {
        const isAdmin = currentUserData.is_admin;
        const canViewEvent = eventData.is_visible_to_users || isAdmin;

        if (!eventData || !canViewEvent) {
            document.body.innerHTML = '<h2 style="text-align:center; padding-top: 50px;">Ивент пока неактивен.</h2>';
            return;
        }

        if (dom.adminNotice) {
            dom.adminNotice.classList.toggle('hidden', !(isAdmin && !eventData.is_visible_to_users));
        }

        const { goals = {}, levels = {}, current_progress = 0 } = eventData;
        const top20 = leaderboardData.top20 || [];

        // 1. Определяем текущий уровень
        let currentLevel = 1, currentGoal = goals.level_1 || 1, prevGoal = 0;
        if (goals.level_1 && current_progress >= goals.level_1) {
            currentLevel = 2; currentGoal = goals.level_2 || goals.level_1; prevGoal = goals.level_1;
        }
        if (goals.level_2 && current_progress >= goals.level_2) {
            currentLevel = 3; currentGoal = goals.level_3 || goals.level_2; prevGoal = goals.level_2;
        }
        
        // 2. Получаем награды для текущего уровня
        const levelConfig = levels[`level_${currentLevel}`] || {};
        const topPlaceRewards = levelConfig.top_places || [];
        const defaultReward = levelConfig.default_reward || {};

        // 3. Обновляем DOM
        dom.eventTitle.textContent = eventData.title || "Ведьминский Котел";
        dom.cauldronImage.src = eventData.cauldron_image_url || 'https://i.postimg.cc/pX9n7fBw/cauldron.png';
        
        const progressInLevel = current_progress - prevGoal;
        const goalForLevel = currentGoal - prevGoal;
        const progressPercentage = (goalForLevel > 0) ? Math.min((progressInLevel / goalForLevel) * 100, 100) : 0;
        dom.progressBarFill.style.width = `${progressPercentage}%`;
        dom.progressText.textContent = `${current_progress} / ${currentGoal}`;
        dom.rewardSectionTitle.textContent = `Уровень ${currentLevel}`;
        
        // Отображаем награду для остальных
        dom.rewardImage.src = defaultReward.image_url || 'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpovbSsLQJf2PLacDBA5ciJlY20hPb6NqjUmldu5MR0j-Db8Y6i2gey-UBsMGDzI4SWJAU8Yw2E-le8xLzrh4e07ZzLzHRmvz5iuyhX/360fx360f';
        dom.rewardName.textContent = defaultReward.name || 'Награда не настроена';

        // 4. Рендерим список Топ-20 с их индивидуальными наградами
        if (top20.length === 0) {
            dom.leaderboardRewardsList.innerHTML = '<p style="text-align:center; padding: 20px; color: var(--text-color-muted);">Участников пока нет.</p>';
        } else {
            dom.leaderboardRewardsList.innerHTML = top20.map((p, index) => {
                const rank = index + 1;
                // Ищем награду, назначенную для этого места
                const assignedReward = topPlaceRewards.find(r => r.place === rank);
                const rewardName = assignedReward?.name || 'Особый приз';
                const rewardImage = assignedReward?.image_url;

                return `
                <div class="leaderboard-row">
                    <span class="rank">#${rank}</span>
                    <div class="player-info">
                        <span class="player">${escapeHTML(p.full_name || 'Без имени')}</span>
                        <div class="reward-info">
                           ${rewardImage ? `<img src="${escapeHTML(rewardImage)}" alt="prize">` : `<i class="fa-solid fa-star"></i>`}
                           <span>${escapeHTML(rewardName)}</span>
                        </div>
                    </div>
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
            dom.userTicketBalance.textContent = currentUserData.tickets || 0;
            renderPage(eventData, leaderboardData);

        } catch (e) {
            document.body.innerHTML = `<h2 style="text-align:center; padding-top: 50px;">Ошибка загрузки ивента: ${e.message}</h2>`;
        } finally {
            dom.loaderOverlay.classList.add('hidden');
            dom.appContainer.classList.remove('hidden');
        }
    }

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
            dom.userTicketBalance.textContent = result.new_ticket_balance;
            dom.ticketsInput.value = '';
            fetchDataAndRender();
        } catch(error) {
            dom.errorMessage.textContent = error.message;
            dom.errorMessage.classList.remove('hidden');
        }
    });
    
    tg.ready();
    tg.expand();
    fetchDataAndRender();
});
