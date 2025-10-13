document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;

    const dom = {
        loaderOverlay: document.getElementById('loader-overlay'),
        appContainer: document.getElementById('app-container'),
        eventTitle: document.getElementById('event-title'),
        cauldronImage: document.getElementById('cauldron-image'),
        progressBarFill: document.getElementById('progress-bar-fill'),
        progressText: document.getElementById('progress-text'),
        userTicketBalance: document.getElementById('user-ticket-balance'),
        contributionForm: document.getElementById('contribution-form'),
        ticketsInput: document.getElementById('tickets-input'),
        errorMessage: document.getElementById('error-message'),
        leaderboardList: document.getElementById('leaderboard-list'),
    };

    let currentUserData = {};
    let currentEventData = {};
    let currentLeaderboardData = {};

    function escapeHTML(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, match => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'})[match]);
    }

    async function makeApiRequest(url, body = {}, method = 'POST') {
        try {
            const options = {
                method: method,
                headers: { 'Content-Type': 'application/json' },
            };
            const requestBody = { ...body, initData: tg.initData };
            options.headers['X-Init-Data'] = tg.initData;
            if (method.toUpperCase() !== 'GET') {
                options.body = JSON.stringify(requestBody);
            }
            const response = await fetch(url, options);
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || 'Ошибка сервера');
            return result;
        } catch (e) {
            console.error(`Ошибка API (${url}):`, e);
            throw e;
        }
    }

    function renderLeaderboard(leaderboardData = {}, rewardsData = {}) {
        const list = dom.leaderboardList;
        list.innerHTML = '';

        const topRewardsMap = new Map((rewardsData.top_places || []).map(r => [r.place, r]));
        const defaultReward = rewardsData.default_reward || { name: 'Приз', image_url: '' };
        const participants = leaderboardData.top20 || [];

        if (participants.length === 0 && Object.keys(topRewardsMap).length === 0) {
            list.innerHTML = '<p style="text-align:center; padding: 20px;">Пока никто не борется за призы. Будь первым!</p>';
            return;
        }

        for (let i = 0; i < 20; i++) {
            const place = i + 1;
            const participant = participants[i];
            const reward = topRewardsMap.get(place) || defaultReward;
            
            if (!reward || !reward.name) continue; // Не рендерим строку, если для нее нет награды

            const row = document.createElement('div');
            row.className = 'leaderboard-row';
            row.innerHTML = `
                <span class="rank">#${place}</span>
                <div class="player">
                    ${participant ? escapeHTML(participant.full_name) : '<span class="free-place">Свободное место</span>'}
                </div>
                <div class="value">
                    ${participant ? participant.total_contribution : '0'} <i class="fa-solid fa-ticket"></i>
                </div>
                <div class="reward" title="${escapeHTML(reward.name)}">
                    <img src="${escapeHTML(reward.image_url)}" alt="">
                    <span>${escapeHTML(reward.name)}</span>
                </div>
            `;
            list.appendChild(row);
        }
        
        if(defaultReward.name) {
             list.insertAdjacentHTML('beforeend', `
                <div class="default-reward-info">
                    <p>Все остальные участники (места 21+) получат: <strong>${escapeHTML(defaultReward.name)}</strong></p>
                </div>
             `);
        }
    }

    function renderPage(eventData, leaderboardData) {
        currentEventData = eventData;
        currentLeaderboardData = leaderboardData;

        const isAdmin = currentUserData.profile && currentUserData.profile.is_admin;
        const canViewEvent = eventData.is_visible_to_users || isAdmin;

        if (!eventData || !canViewEvent) {
            document.body.innerHTML = '<div class="error-fullpage"><h2>Ивент пока неактивен.</h2><a href="/menu">Вернуться в меню</a></div>';
            return;
        }

        const adminNotice = document.getElementById('admin-notice');
        if (adminNotice) {
            adminNotice.classList.toggle('hidden', !(isAdmin && !eventData.is_visible_to_users));
        }

        const { goal = 1, current_progress = 0 } = eventData;
        
        dom.eventTitle.textContent = eventData.title || "Гонка за скинами";
        dom.cauldronImage.src = eventData.cauldron_image_url || 'https://i.postimg.cc/pX9n7fBw/cauldron.png';
        
        const progressPercentage = Math.min((current_progress / goal) * 100, 100);
        dom.progressBarFill.style.width = `${progressPercentage}%`;
        dom.progressText.textContent = `${current_progress} / ${goal}`;

        renderLeaderboard(leaderboardData, eventData.rewards);
    }

    async function fetchDataAndRender() {
        try {
            const [eventData, leaderboardData, userData] = await Promise.all([
                makeApiRequest('/api/v1/events/cauldron/status', {}, 'GET'),
                makeApiRequest('/api/v1/events/cauldron/leaderboard', {}, 'GET'),
                makeApiRequest("/api/v1/user/me", {}, 'POST')
            ]);
            
            currentUserData = userData;
            dom.userTicketBalance.textContent = currentUserData.profile?.tickets || 0;
            renderPage(eventData, leaderboardData);

        } catch (e) {
            document.body.innerHTML = `<div class="error-fullpage"><h2>Ошибка загрузки ивента</h2><p>${e.message}</p></div>`;
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

        if (amount > (currentUserData.profile?.tickets || 0)) {
            dom.errorMessage.textContent = 'У вас недостаточно билетов.';
            dom.errorMessage.classList.remove('hidden');
            return;
        }
        
        try {
            const result = await makeApiRequest('/api/v1/events/cauldron/contribute', { amount });
            tg.HapticFeedback.notificationOccurred('success');
            dom.userTicketBalance.textContent = result.new_ticket_balance;
            dom.ticketsInput.value = '';
            // Данные обновятся через WebSocket
        } catch(error) {
            dom.errorMessage.textContent = error.message;
            dom.errorMessage.classList.remove('hidden');
        }
    });

    tg.ready();
    tg.expand();
    fetchDataAndRender();

    // WebSocket для обновлений в реальном времени
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'cauldron_update') {
            currentEventData.current_progress = data.new_progress;
            // Перезапрашиваем лидерборд, так как он мог измениться
            const newLeaderboardData = await makeApiRequest('/api/v1/events/cauldron/leaderboard', {}, 'GET');
            renderPage(currentEventData, newLeaderboardData);
        } else if (data.type === 'cauldron_config_updated') {
            const newLeaderboardData = await makeApiRequest('/api/v1/events/cauldron/leaderboard', {}, 'GET');
            renderPage(data.content, newLeaderboardData);
        }
    };
});
