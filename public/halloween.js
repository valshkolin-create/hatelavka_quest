// halloween.js
document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;

    const dom = {
        loaderOverlay: document.getElementById('loader-overlay'),
        appContainer: document.getElementById('app-container'),
        eventTitle: document.getElementById('event-title'),
        cauldronImage: document.getElementById('cauldron-image'),
        progressBarFill: document.getElementById('progress-bar-fill'),
        progressText: document.getElementById('progress-text'),
        rewardSectionTitle: document.getElementById('reward-section-title'),
        rewardCard: document.getElementById('reward-card'),
        rewardImage: document.getElementById('reward-image'),
        rewardName: document.getElementById('reward-name'),
        uniqueDropInfo: document.getElementById('unique-drop-info'),
        uniqueDropText: document.getElementById('unique-drop-text'),
        userTicketBalance: document.getElementById('user-ticket-balance'),
        contributionForm: document.getElementById('contribution-form'),
        ticketsInput: document.getElementById('tickets-input'),
        errorMessage: document.getElementById('error-message'),
        top20List: document.getElementById('top-20-list'),
        allParticipantsList: document.getElementById('all-participants-list'),
        tabs: document.querySelectorAll('.participants-section .tab-button'),
        tabContents: document.querySelectorAll('.participants-section .tab-content'),
        adminNotice: document.getElementById('admin-notice'),
    };

    let currentUserData = {};
    
    async function makeApiRequest(url, body = {}, method = 'POST') {
        try {
            const options = {
                method: method,
                headers: { 'Content-Type': 'application/json' },
            };

            if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
                const requestBody = { ...body, initData: tg.initData };
                options.headers['X-Init-Data'] = tg.initData; 
                options.body = JSON.stringify(requestBody);
            }
            
            const response = await fetch(url, options);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || 'Ошибка сервера');
            }
            return result;
        } catch (e) {
            console.error(`Ошибка API (${url}):`, e);
            throw e;
        }
    }

    function renderTop20(participants = []) {
        if (participants.length === 0) {
            dom.top20List.innerHTML = '<p style="text-align:center; padding: 20px; color: var(--text-color-muted);">Участников пока нет.</p>';
            return;
        }
        dom.top20List.innerHTML = participants.map((p, index) => `
            <div class="leaderboard-row">
                <span class="rank">#${index + 1}</span>
                <span class="player">${escapeHTML(p.full_name || 'Без имени')}</span>
                <span class="value">${p.total_contribution} <i class="fa-solid fa-ticket" style="color: var(--text-color-muted);"></i></span>
            </div>
        `).join('');
    }
    
    function renderAllParticipants(participants = []) {
         if (participants.length === 0) {
            dom.allParticipantsList.innerHTML = '<p style="text-align:center; padding: 20px; color: var(--text-color-muted);">Участников пока нет.</p>';
            return;
        }
        dom.allParticipantsList.innerHTML = participants.map(p => `
            <div class="leaderboard-row">
                <span class="player">${escapeHTML(p.full_name || 'Без имени')}</span>
                <span class="drop-type ${p.predicted_drop === 'unique' ? 'unique' : 'regular'}">
                    ${p.predicted_drop === 'unique' ? 'Уникальный' : 'Обычный'}
                </span>
            </div>
        `).join('');
    }

    function renderPage(eventData, leaderboardData = {}) {
        // ✅ ИСПРАВЛЕНИЕ: Проверяем флаг напрямую из объекта пользователя, а не из profile
        const isAdmin = currentUserData.is_admin;
        
        const canViewEvent = eventData.is_visible_to_users || isAdmin;

        if (!eventData || !canViewEvent) {
            document.body.innerHTML = '<h2 style="text-align:center; padding-top: 50px;">Ивент пока неактивен.</h2>';
            return;
        }

        if (dom.adminNotice) {
            const isHiddenFromUsers = !eventData.is_visible_to_users;
            dom.adminNotice.classList.toggle('hidden', !(isAdmin && isHiddenFromUsers));
        }

        const { goals = {}, levels = {}, current_progress = 0 } = eventData;
        const allParticipants = leaderboardData.all || [];

        let currentLevel = 1;
        let currentGoal = goals.level_1 || 1;
        let prevGoal = 0;
        if (current_progress >= goals.level_1 && goals.level_2) {
            currentLevel = 2;
            currentGoal = goals.level_2;
            prevGoal = goals.level_1;
        }
        if (current_progress >= goals.level_2 && goals.level_3) {
            currentLevel = 3;
            currentGoal = goals.level_3;
            prevGoal = goals.level_2;
        }
        
        const levelKey = `level_${currentLevel}`;
        const levelConfig = levels[levelKey] || {};
        const uniqueDropConfig = levelConfig.unique_drop || {};
        const regularDropConfig = levelConfig.regular_drop || {};
        
        const isUniqueDropActive = allParticipants.length < (uniqueDropConfig.participant_limit || 20);
        const activeReward = isUniqueDropActive ? uniqueDropConfig : regularDropConfig;

        dom.eventTitle.textContent = eventData.title || "Ведьминский котел";
        dom.cauldronImage.src = eventData.cauldron_image_url || 'https://i.postimg.cc/pX9n7fBw/cauldron.png';
        
        const progressInLevel = current_progress - prevGoal;
        const goalForLevel = currentGoal - prevGoal;
        // Защита от деления на ноль, если цели не заданы
        const progressPercentage = (goalForLevel > 0) ? Math.min((progressInLevel / goalForLevel) * 100, 100) : 0;
        dom.progressBarFill.style.width = `${progressPercentage}%`;
        dom.progressText.textContent = `${current_progress} / ${currentGoal}`;

        dom.rewardSectionTitle.textContent = `Текущая награда (Уровень ${currentLevel})`;
        dom.rewardImage.src = activeReward.image_url || 'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpovbSsLQJf2PLacDBA5ciJlY20hPb6NqjUmldu5MR0j-Db8Y6i2gey-UBsMGDzI4SWJAU8Yw2E-le8xLzrh4e07ZzLzHRmvz5iuyhX/360fx360f';
        dom.rewardName.textContent = activeReward.name || 'Награда не настроена';

        dom.uniqueDropInfo.classList.toggle('hidden', !isUniqueDropActive);
        if(isUniqueDropActive) {
            dom.uniqueDropText.textContent = `Уникальный дроп! (${allParticipants.length}/${uniqueDropConfig.participant_limit || 20} участников)`;
        }

        renderTop20(leaderboardData.top20);
        renderAllParticipants(leaderboardData.all);
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

        if (amount > (currentUserData.profile?.tickets || 0)) {
            dom.errorMessage.textContent = 'У вас недостаточно билетов.';
            dom.errorMessage.classList.remove('hidden');
            return;
        }
        
        try {
            const result = await makeApiRequest('/api/v1/events/cauldron/contribute', { amount });
            tg.showAlert(result.message);
            dom.userTicketBalance.textContent = result.new_ticket_balance;
            dom.ticketsInput.value = '';
        } catch(error) {
            dom.errorMessage.textContent = error.message;
            dom.errorMessage.classList.remove('hidden');
        }
    });

    dom.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            dom.tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            dom.tabContents.forEach(content => {
                content.classList.toggle('hidden', content.id !== `tab-content-${tab.dataset.tab}`);
            });
        });
    });
    
    function escapeHTML(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, match => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'})[match]);
    }
    
    tg.ready();
    tg.expand();
    fetchDataAndRender();
});
