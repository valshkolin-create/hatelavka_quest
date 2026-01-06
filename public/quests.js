const dom = {
    loaderOverlay: document.getElementById('loader-overlay'),
    loadingText: document.getElementById('loading-text'),
    loadingBarFill: document.getElementById('loading-bar-fill'),
    mainContent: document.getElementById('main-content'),
    fullName: document.getElementById('fullName'),
    
    // Элементы квестов
    challengeContainer: document.getElementById('challenge-container'),
    telegramStaticList: document.getElementById('telegram-static-quests'), // <--- ДОБАВИЛ
    activeAutomaticQuestContainer: document.getElementById('active-automatic-quest-container'),
    questChooseBtn: document.getElementById("quest-choose-btn"),
    questChooseContainer: document.getElementById("quest-choose-container"),
    
    // Модальные окна
    rewardClaimedOverlay: document.getElementById('reward-claimed-overlay'),
    rewardCloseBtn: document.getElementById('reward-close-btn'),
    ticketsClaimedOverlay: document.getElementById('tickets-claimed-overlay'),
    ticketsClaimCloseBtn: document.getElementById('tickets-claim-close-btn'),
    
    promptOverlay: document.getElementById('custom-prompt-overlay'),
    promptTitle: document.getElementById('prompt-title'),
    promptInput: document.getElementById('prompt-input'),
    promptCancel: document.getElementById('prompt-cancel'),
    promptConfirm: document.getElementById('prompt-confirm'),

    infoQuestionIcon: document.getElementById('info-question-icon'),
    infoModalOverlay: document.getElementById('info-modal-overlay'),
    infoModalCloseBtn: document.getElementById('info-modal-close-btn'),
    sectionAuto: document.getElementById('section-auto-quests'),
    sectionManual: document.getElementById('section-manual-quests'),
    
    scheduleModal: document.getElementById('schedule-modal-overlay'),
    scheduleCloseBtn: document.getElementById('schedule-modal-close-btn')
};

let currentQuestId = null;
let countdownIntervals = {};
let allQuests = [];
let userData = {};
let questsForRoulette = [];

// --- ФУНКЦИИ БЛОКИРОВКИ СКРОЛЛА ---
function lockAppScroll() {
    document.body.classList.add('no-scroll');
    const content = document.getElementById('main-content');
    if (content) content.classList.add('no-scroll');
}

function unlockAppScroll() {
    document.body.classList.remove('no-scroll');
    const content = document.getElementById('main-content');
    if (content) content.classList.remove('no-scroll');
}


async function checkMaintenance() {
    try {
        const res = await fetch('/api/v1/bootstrap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: window.Telegram.WebApp.initData || '' })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.maintenance) {
                window.location.href = '/'; 
            }
        }
    } catch (e) {
        console.error("Ошибка проверки статуса:", e);
    }
}
checkMaintenance();

try {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();

    function escapeHTML(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, match => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'})[match]);
    }

    function updateLoading(percent) {
        if (dom.loadingText) dom.loadingText.textContent = Math.floor(percent) + '%';
        if (dom.loadingBarFill) dom.loadingBarFill.style.width = Math.floor(percent) + '%';
    }

    async function makeApiRequest(url, body = {}, method = 'POST', isSilent = false) {
        if (!isSilent && dom.loaderOverlay) dom.loaderOverlay.classList.remove('hidden');
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);

            const options = { 
                method, 
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal 
            };
            
            if (method !== 'GET') {
                options.body = JSON.stringify({ ...body, initData: Telegram.WebApp.initData });
            }
            
            const response = await fetch(url, options);
            clearTimeout(timeoutId);

            if (response.status === 429) throw new Error('Cooldown active'); 
            if (response.status === 204) return null;
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || result.message || 'Ошибка сервера');
            return result;
        } catch (e) {
            if (e.name === 'AbortError') e.message = "Превышено время ожидания ответа.";
            if (e.message !== 'Cooldown active' && !isSilent) Telegram.WebApp.showAlert(`Ошибка: ${e.message}`);
            throw e;
        } finally {
            if (!isSilent && dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
        }
    }

    function startCountdown(timerElement, expiresAt, intervalKey, onEndCallback) {
        if (countdownIntervals[intervalKey]) clearInterval(countdownIntervals[intervalKey]);
        if (!timerElement) return;

        const endTime = new Date(expiresAt).getTime();
        const updateTimer = () => {
            const currentTimerElement = document.getElementById(timerElement.id);
            if (!currentTimerElement) {
                clearInterval(countdownIntervals[intervalKey]);
                return;
            }
            const now = new Date().getTime();
            const distance = endTime - now;
            if (distance < 0) {
                clearInterval(countdownIntervals[intervalKey]);
                delete countdownIntervals[intervalKey];
                if (onEndCallback) {
                    onEndCallback();
                } else if (intervalKey === 'challenge') {
                    // Логика истечения челленджа
                    const cardElement = currentTimerElement.closest('.quest-card');
                    if (cardElement) {
                       cardElement.classList.add('expired');
                       const titleEl = cardElement.querySelector('.quest-title');
                       const titleText = titleEl ? titleEl.textContent : 'Челлендж';
                       cardElement.innerHTML = `
                           <div class="quest-content-wrapper">
                               <div class="quest-icon"><i class="fa-solid fa-star"></i></div>
                               <h2 class="quest-title">${titleText}</h2>
                           </div>
                           <div class="expired-overlay">
                               <div class="expired-overlay-text">Время истекло</div>
                               <button id="check-challenge-progress-btn" class="claim-reward-button" style="margin-top:0;">
                                   <i class="fa-solid fa-flag-checkered"></i> <span>Завершить</span>
                               </button>
                           </div>
                       `;
                    }
                } else if (intervalKey.startsWith('quest_')) {
                     // Логика истечения квеста
                     const cardElement = currentTimerElement.closest('.quest-card');
                     if (cardElement) {
                        cardElement.classList.add('expired');
                        const contentWrapper = cardElement.querySelector('.quest-content-wrapper');
                        cardElement.innerHTML = `
                            ${contentWrapper ? contentWrapper.outerHTML : ''}
                            <div class="expired-overlay">
                                <div class="expired-overlay-text">Время истекло</div>
                                <button id="complete-expired-quest-btn" class="claim-reward-button" style="margin-top:0;">
                                   <i class="fa-solid fa-flag-checkered"></i> <span>Завершить</span>
                                </button>
                            </div>
                        `;
                     }
                }
                if (intervalKey === 'challenge_cooldown') refreshDataSilently();
                return;
            }
            const d = Math.floor(distance / 86400000);
            const h = Math.floor((distance % 86400000) / 3600000);
            const m = Math.floor((distance % 3600000) / 60000);
            const s = Math.floor((distance % 60000) / 1000);
            let result = '';
            if (d > 0) result += `${d}д `;
            result += `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            currentTimerElement.textContent = result;
        };
        countdownIntervals[intervalKey] = setInterval(updateTimer, 1000);
        updateTimer();
    }

    function createTwitchNoticeHtml() {
        return `<div class="twitch-update-notice">ℹ️ Прогресс обновляется с задержкой (до 30 мин).</div>`;
    }

    // --- РЕНДЕРИНГ ЧЕЛЛЕНДЖА ---
    function renderChallenge(challengeData, isGuest) {
        dom.challengeContainer.innerHTML = '';
        const isOnline = userData.is_stream_online === true;
        
        const streamBadgeHtml = isOnline 
            ? `<div class="stream-status-badge online"><i class="fa-solid fa-circle" style="font-size:6px; vertical-align:middle; margin-right:3px;"></i> СТРИМ ОНЛАЙН</div>`
            : `<div class="stream-status-badge offline">СТРИМ ОФФЛАЙН</div>`;

        if (isGuest) {
            dom.challengeContainer.innerHTML = `
                <div class="quest-card quest-locked">
                    ${streamBadgeHtml} <div class="quest-icon"><i class="fa-brands fa-twitch"></i></div>
                    <h2 class="quest-title">Случайный челлендж</h2>
                    <p class="quest-subtitle">Для доступа к челленджам требуется привязка Twitch-аккаунта.</p>
                    <a href="/profile" class="perform-quest-button" style="text-decoration: none;">Привязать Twitch</a>
                </div>`;
            return;
        }
        
        if (challengeData && challengeData.cooldown_until) {
            dom.challengeContainer.innerHTML = `
                <div class="quest-card challenge-card">
                    ${streamBadgeHtml} <div class="quest-icon"><i class="fa-solid fa-hourglass-half"></i></div>
                    <h2 class="quest-title">Следующий челлендж</h2>
                    <p class="quest-subtitle">Новое задание будет доступно после окончания таймера.</p>
                    <div id="challenge-cooldown-timer" class="challenge-timer" style="font-size: 14px; font-weight: 600; color: var(--primary-color); margin-top: 10px;">...</div>
                </div>`;
            if (!countdownIntervals['challenge_cooldown']) {
                startCountdown(document.getElementById('challenge-cooldown-timer'), challengeData.cooldown_until, 'challenge_cooldown');
            }
            return;
        }

        if ((!challengeData || !challengeData.description) && !isOnline) {
            dom.challengeContainer.innerHTML = `
                <div class="quest-card challenge-card">
                    <div class="quest-icon" style="color: #ff3b30; box-shadow: none; text-shadow: none; background: rgba(255, 59, 48, 0.1);">
                        <i class="fa-solid fa-video-slash"></i>
                    </div>
                    <h2 class="quest-title">Стрим сейчас оффлайн</h2>
                    <p class="quest-subtitle">Челленджи доступны только во время эфира. Посмотрите расписание.</p>
                    <button id="open-schedule-btn" class="claim-reward-button" style="background: #3a3a3c; color: #fff; box-shadow: none; border: 1px solid rgba(255,255,255,0.1);">
                        <i class="fa-regular fa-calendar-days"></i> <span>Расписание стримов</span>
                    </button>
                </div>`;
            document.getElementById('open-schedule-btn').addEventListener('click', () => {
                if(dom.scheduleModal) dom.scheduleModal.classList.remove('hidden');
            });
            return;
        }
    
        if (!challengeData || !challengeData.description) {
            dom.challengeContainer.innerHTML = `
                <div class="quest-card challenge-card">
                    ${streamBadgeHtml} <div class="quest-icon"><i class="fa-solid fa-dice"></i></div>
                    <h2 class="quest-title">Случайный челлендж</h2>
                    <p class="quest-subtitle">Испытай удачу! Получи случайное задание и выполни его.</p>
                    <button id="get-challenge-btn" class="claim-reward-button">
                        <i class="fa-solid fa-play"></i> <span>Получить челлендж</span>
                    </button>
                </div>`;
            return;
        }

        const challenge = challengeData; 
        const currentProgress = challenge.progress_value || 0;
        const target = challenge.target_value || 1;
        const percent = target > 0 ? Math.min(100, (currentProgress / target) * 100) : 0;
        const canClaim = currentProgress >= target && !challenge.claimed_at;
        const isCompleted = currentProgress >= target;
        let statusText = '';
        if (challenge.claimed_at) {
            statusText = '<div style="color: #34C759; font-size: 12px; margin: 5px 0;">✅ Награда получена</div>';
        } else if (isCompleted) {
            statusText = '<div style="color: #FFCC00; font-size: 12px; margin: 5px 0;">🎁 Награда готова!</div>';
        }
        const isTwitchChallenge = challenge.condition_type && challenge.condition_type.includes('twitch');
        const twitchNotice = isTwitchChallenge ? createTwitchNoticeHtml() : '';
        const claimButton = `<button id="claim-challenge-btn" data-challenge-id="${challenge.challenge_id}" class="claim-reward-button" ${!canClaim ? 'disabled' : ''}><i class="fa-solid fa-gift"></i> <span>Забрать награду</span></button>`;
        let progressTextContent = `${currentProgress} / ${target}`;
        const conditionType = challenge.condition_type || '';
        if (conditionType.includes('twitch_uptime')) {
            progressTextContent = `${currentProgress} / ${target} мин.`;
        } else if (conditionType.includes('twitch_messages')) {
            progressTextContent = `💬 ${currentProgress} / ${target}`;
        } else if (conditionType.includes('telegram_messages')) {
            progressTextContent = `✉️ ${currentProgress} / ${target}`;
        }
        
        dom.challengeContainer.innerHTML = `
            <div class="quest-card challenge-card">
                ${streamBadgeHtml} <div class="quest-icon"><i class="fa-solid fa-star"></i></div>
                <h2 class="quest-title">${challenge.description || ''}</h2>
                ${statusText}
                <div id="challenge-timer" class="challenge-timer">...</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percent}%;"></div>
                    <div class="progress-content">
                        <span class="progress-text">${progressTextContent}</span>
                    </div>
                </div>
                ${twitchNotice}
                ${claimButton}
            </div>`;
        
        if (challenge.expires_at) {
            startCountdown(document.getElementById('challenge-timer'), challenge.expires_at, 'challenge');
        }
    }

    // --- РЕНДЕРИНГ АКТИВНОГО КВЕСТА ---
    function renderActiveAutomaticQuest(quest, userData) {
        dom.activeAutomaticQuestContainer.innerHTML = '';
        if (!quest || !userData || !userData.active_quest_id) return;
        
        const activeQuest = allQuests.find(q => q.id === userData.active_quest_id);
        if (!activeQuest) return;

        const iconHtml = (activeQuest.icon_url && activeQuest.icon_url !== "") ? `<img src="${activeQuest.icon_url}" class="quest-image-icon" alt="Иконка квеста">` : `<div class="quest-icon"><i class="fa-solid fa-bolt"></i></div>`;
        const progress = userData.active_quest_progress || 0;
        const target = activeQuest.target_value || 1;
        const percent = target > 0 ? Math.min(100, (progress / target) * 100) : 0;
        const isCompleted = progress >= target;
        const isTwitchQuest = activeQuest.quest_type && activeQuest.quest_type.includes('twitch');
        const twitchNotice = isTwitchQuest ? createTwitchNoticeHtml() : '';
        let buttonHtml = '';
        
        if (isCompleted) {
            buttonHtml = `<button class="claim-reward-button" data-quest-id="${activeQuest.id}"><i class="fa-solid fa-gift"></i> <span>Забрать</span></button>`;
        } else {
            const lastCancel = userData.last_quest_cancel_at;
            let cancelBtnDisabled = false;
            let cooldownEndTime = null;
            if (lastCancel) {
                const lastCancelDate = new Date(lastCancel);
                const now = new Date();
                const diffHours = (now - lastCancelDate) / 3600000;
                if (diffHours < 24) {
                    cancelBtnDisabled = true;
                    cooldownEndTime = new Date(lastCancelDate.getTime() + 24 * 60 * 60 * 1000);
                }
            }
            buttonHtml = `<button id="cancel-quest-btn" class="cancel-quest-button" ${cancelBtnDisabled ? 'disabled' : ''}>Отменить</button>`;
            if (cancelBtnDisabled) {
                setTimeout(() => {
                    const btn = document.getElementById('cancel-quest-btn');
                    if (btn) {
                         startCountdown(btn, cooldownEndTime, 'quest_cancel', () => {
                            btn.disabled = false;
                            btn.textContent = 'Отменить';
                        });
                    }
                }, 0);
            }
        }
        const currentProgress = Math.min(progress, target);
        let progressTextContent = `${currentProgress} / ${target}`;
        const questType = activeQuest.quest_type || '';
        if (questType.includes('twitch_uptime')) {
            progressTextContent = `${currentProgress} / ${target} мин.`;
        } else if (questType.includes('twitch_messages')) {
            progressTextContent = `💬 ${currentProgress} / ${target}`;
        } else if (questType.includes('telegram_messages')) {
            progressTextContent = `✉️ ${currentProgress} / ${target}`;
        }
        
        const questEndDate = userData.active_quest_end_date;
        const timerHtml = questEndDate ? `<div id="quest-timer-${activeQuest.id}" class="challenge-timer">...</div>` : '';
        
        dom.activeAutomaticQuestContainer.innerHTML = `
            <div class="quest-card">
                ${!isCompleted ? '<div class="active-quest-indicator">Выполняется</div>' : ''}
                <div class="quest-content-wrapper">
                    ${iconHtml}
                    <h2 class="quest-title">${activeQuest.title || ''}</h2>
                    <p class="quest-subtitle">${activeQuest.description || ''}</p>
                    ${timerHtml} 
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${percent}%;"></div>
                        <div class="progress-content"><span class="progress-text">${progressTextContent}</span></div>
                    </div>
                    ${twitchNotice}
                </div>
                <div class="button-container">${buttonHtml}</div>
            </div>`;
            
        if (questEndDate) {
            setTimeout(() => {
                 const timerElement = document.getElementById(`quest-timer-${activeQuest.id}`);
                 if (timerElement) startCountdown(timerElement, questEndDate, `quest_${activeQuest.id}`);
            }, 0); 
        }
        
        dom.questChooseBtn.classList.add('hidden');
        dom.questChooseContainer.classList.add('hidden');
    }

    // --- РЕНДЕРИНГ РУЧНЫХ ЗАДАНИЙ ---
    function renderManualQuests(questsData) {
        const container = document.getElementById('manual-quests-list');
        if (!container) return;
        container.innerHTML = ''; 

        // 1. Нормализация данных: превращаем всё в массив
        let quests = [];
        if (Array.isArray(questsData)) {
            // Если пришел сразу массив [ ... ]
            quests = questsData;
        } else if (questsData && Array.isArray(questsData.quests)) {
            // Если пришел объект { quests: [ ... ] }
            quests = questsData.quests;
        } else if (questsData && Array.isArray(questsData.data)) {
            // Если пришел объект { data: [ ... ] }
            quests = questsData.data;
        }

        // 2. Проверка: если пусто или не массив
        if (!quests || quests.length === 0) {
            container.innerHTML = `<p style="text-align: center; font-size: 12px; color: var(--text-color-muted);">Нет заданий для ручной проверки.</p>`;
            return;
        }

        // 3. Группировка и рендер
        const groupedQuests = new Map();
        quests.forEach(quest => {
            const categoryName = quest.quest_categories ? quest.quest_categories.name : 'Разное';
            if (!groupedQuests.has(categoryName)) groupedQuests.set(categoryName, []);
            groupedQuests.get(categoryName).push(quest);
        });

        groupedQuests.forEach((questsInCategory, categoryName) => {
            const questsHtml = questsInCategory.map(quest => {
                const iconHtml = (quest.icon_url && quest.icon_url !== "") ? `<img src="${escapeHTML(quest.icon_url)}" class="quest-image-icon" alt="Иконка квеста">` : `<div class="quest-icon"><i class="fa-solid fa-user-check"></i></div>`;
                const actionLinkHtml = (quest.action_url && quest.action_url !== "")
                    ? `<a href="${escapeHTML(quest.action_url)}" target="_blank" rel="noopener noreferrer" class="action-link-btn">Перейти</a>`
                    : '';
                const submitButtonText = (quest.action_url && quest.action_url !== "") ? 'Отправить' : 'Выполнить';
                
                return `
                    <div class="quest-card" style="display: flex; flex-direction: column;">
                        <div style="flex-grow: 1;">
                            ${iconHtml}
                            <h2 class="quest-title">${escapeHTML(quest.title || '')}</h2>
                            <p class="quest-subtitle">${escapeHTML(quest.description || '')}</p>
                            <p class="quest-subtitle">Награда: ${quest.reward_amount || ''} ⭐</p>
                        </div>
                        <div class="manual-quest-actions">
                            ${actionLinkHtml}
                            <button class="perform-quest-button" data-id="${quest.id}" data-title="${escapeHTML(quest.title)}">${submitButtonText}</button>
                        </div>
                    </div>
                `;
            }).join('');

            const accordionHtml = `
                <details class="quest-category-accordion" open>
                    <summary class="quest-category-header">${escapeHTML(categoryName)}</summary>
                    <div class="quest-category-body">
                        ${questsHtml}
                    </div>
                </details>
            `;
            container.insertAdjacentHTML('beforeend', accordionHtml);
        });
    }

    async function refreshDataSilently() {
        try {
            const hbData = await makeApiRequest("/api/v1/user/heartbeat", {}, 'POST', true);
            if (hbData) {
                if (hbData.is_active === false) return;
                if (hbData.tickets !== undefined) {
                    userData.tickets = hbData.tickets; 
                    const ticketEl = document.getElementById('ticketStats');
                    if (ticketEl) ticketEl.textContent = hbData.tickets;
                }
                
                // Обновление активного квеста
                if (hbData.quest_id) {
                    userData.active_quest_id = hbData.quest_id;
                    userData.active_quest_progress = hbData.quest_progress;
                    const activeQuest = allQuests.find(q => q.id === hbData.quest_id);
                    if (activeQuest) {
                        const target = activeQuest.target_value || 1;
                        const progress = hbData.quest_progress;
                        
                        const activeQuestContainer = document.getElementById('active-automatic-quest-container');
                        if (activeQuestContainer) {
                            const fill = activeQuestContainer.querySelector('.progress-fill');
                            const textSpan = activeQuestContainer.querySelector('.progress-text');
                            const claimBtn = activeQuestContainer.querySelector('.claim-reward-button');

                            if (fill && textSpan) {
                                let prefix = "";
                                if (activeQuest.quest_type && activeQuest.quest_type.includes('twitch_messages')) prefix = "💬 ";
                                else if (activeQuest.quest_type && activeQuest.quest_type.includes('telegram_messages')) prefix = "✉️ ";
                                const suffix = (activeQuest.quest_type && activeQuest.quest_type.includes('uptime')) ? " мин." : "";

                                textSpan.textContent = `${prefix}${progress} / ${target}${suffix}`;
                                const percent = Math.min(100, (progress / target) * 100);
                                fill.style.width = `${percent}%`;

                                if (progress >= target && !claimBtn) {
                                    renderActiveAutomaticQuest(activeQuest, userData);
                                }
                            }
                        }
                    }
                }

                // Обновление челленджа
                if (hbData.has_active_challenge) {
                    if (!userData.challenge) userData.challenge = {};
                    userData.challenge.progress_value = hbData.challenge_progress;
                    userData.challenge.target_value = hbData.challenge_target;

                    const challengeContainer = document.getElementById('challenge-container');
                    if (challengeContainer) {
                        const fill = challengeContainer.querySelector('.progress-fill');
                        const textSpan = challengeContainer.querySelector('.progress-text');
                        const claimBtn = challengeContainer.querySelector('#claim-challenge-btn');

                        if (fill && textSpan) {
                            const progress = hbData.challenge_progress;
                            const target = hbData.challenge_target;
                            let prefix = "";
                            const currentText = textSpan.textContent;
                            if (currentText.includes("💬")) prefix = "💬 ";
                            if (currentText.includes("✉️")) prefix = "✉️ ";
                            const suffix = currentText.includes("мин.") ? " мин." : "";

                            textSpan.textContent = `${prefix}${progress} / ${target}${suffix}`;
                            const percent = Math.min(100, (progress / target) * 100);
                            fill.style.width = `${percent}%`;

                            if (progress >= target && (!claimBtn || claimBtn.disabled)) {
                                renderChallenge(userData.challenge, false);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Ошибка фонового обновления:", e);
        }
    }

    // --- ЛОГИКА РУЛЕТОК ---
    async function startChallengeRoulette() {
        const getChallengeBtn = document.getElementById('get-challenge-btn');
        if(getChallengeBtn) getChallengeBtn.disabled = true;
        dom.loaderOverlay.classList.remove('hidden'); 
        try {
            const available = await makeApiRequest('/api/v1/user/challenge/available');
            const assignedChallenge = await makeApiRequest('/api/v1/user/challenge');
            dom.loaderOverlay.classList.add('hidden'); 
            if (assignedChallenge && assignedChallenge.cooldown_until) {
                renderChallenge(assignedChallenge, false);
                return;
            }
            if (!available || available.length === 0 || !assignedChallenge || !assignedChallenge.challenges) {
                Telegram.WebApp.showAlert('Нет доступных челленджей или произошла ошибка.');
                if(getChallengeBtn) getChallengeBtn.disabled = false;
                return;
            }
            // Анимация рулетки
            const overlay = document.createElement('div');
            overlay.className = 'prompt-overlay';
            overlay.innerHTML = `<div style="width: 90%; max-width: 400px; height: 150px; background: var(--surface-glass-bg); border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; overflow: hidden;"><div id="roulette-inner" style="position: absolute; width: 100%; top: 0;"></div><div style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); width: 100%; height: 50px; border-top: 2px solid var(--primary-color); border-bottom: 2px solid var(--primary-color); box-sizing: border-box; z-index: 1;"></div></div>`;
            document.body.appendChild(overlay);
            const inner = overlay.querySelector('#roulette-inner');
            const itemHeight = 50;
            let rouletteItems = [];
            for (let i = 0; i < 30; i++) rouletteItems.push(...available.sort(() => Math.random() - 0.5));
            rouletteItems.push(assignedChallenge.challenges);
            inner.innerHTML = rouletteItems.map(item => `<div data-id="${item.id}" style="height: ${itemHeight}px; display: flex; flex-direction: column; align-items: center; justify-content: center;"><div style="font-size: 14px; font-weight: 600;">${item.description}</div><div style="font-size: 11px; color: var(--quest-icon-color);">Награда: ${item.reward_amount} ⭐</div></div>`).join('');
            await new Promise(resolve => setTimeout(resolve, 100));
            const winnerElement = Array.from(inner.querySelectorAll(`[data-id="${assignedChallenge.challenge_id}"]`)).pop();
            if (winnerElement) {
                const centeredPosition = winnerElement.offsetTop - (inner.parentElement.clientHeight / 2) + (itemHeight / 2);
                inner.style.transition = 'transform 6s cubic-bezier(0.2, 0.8, 0.2, 1)';
                inner.style.transform = `translateY(-${centeredPosition}px)`;
                setTimeout(() => {
                    overlay.remove();
                    main();
                }, 7000);
            }
        } catch (e) {
            dom.loaderOverlay.classList.add('hidden');
            if(getChallengeBtn) getChallengeBtn.disabled = false;
        }
    }
    
    async function startQuestRoulette() {
        dom.questChooseBtn.disabled = true;
        if (questsForRoulette.length === 0) {
            Telegram.WebApp.showAlert("Сейчас нет доступных испытаний.");
            dom.questChooseBtn.disabled = false;
            return;
        }
        const container = dom.questChooseContainer;
        container.innerHTML = "";
        dom.questChooseContainer.classList.remove('hidden');
        const shuffled = [...questsForRoulette].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 3);
        selected.forEach((quest, index) => {
            const card = document.createElement("div");
            card.className = "quest-option-card";
            const rewardHtml = userData.quest_rewards_enabled
                ? `<div class="quest-subtitle">Награда: ${quest.reward_amount} ⭐</div>`
                : `<div class="event-mode-reward-wrapper">
                       <i class="icon fa-solid fa-trophy"></i>
                       <div class="text-content">
                           <span class="title">Идет ивент!</span>
                           <span class="subtitle">Звёзды отключены, награда - только билеты</span>
                       </div>
                   </div>`;
            card.innerHTML = `
                <div class="quest-icon"><i class="fa-solid fa-bolt"></i></div>
                <div class="quest-title">${quest.title}</div>
                ${rewardHtml}
            `;
            setTimeout(() => card.classList.add("show"), index * 200);
            card.addEventListener("click", async () => {
                card.classList.add("chosen");
                Array.from(container.children).forEach(otherCard => {
                    if (otherCard !== card) otherCard.classList.add("fade-out");
                });
                setTimeout(async () => {
                    try {
                        await makeApiRequest("/api/v1/quests/start", { quest_id: quest.id });
                        Telegram.WebApp.showAlert(`✅ Вы выбрали задание: ${quest.title}`);
                        await main();
                    } catch(e) {
                        Telegram.WebApp.showAlert(`Не удалось взять задание. Ошибка: ${e.message}`);
                    }
                }, 600);
            });
            container.appendChild(card);
        });
    }
    
    function hideQuestRoulette() {
        const container = dom.questChooseContainer;
        Array.from(container.children).forEach(card => card.classList.add('fade-out'));
        setTimeout(() => {
            container.innerHTML = '';
            container.classList.add('hidden');
            dom.questChooseBtn.disabled = false;
        }, 500);
    }

    // --- МОДАЛКИ И ПРОЧЕЕ ---
    function showCustomPrompt(title, questId) {
        currentQuestId = questId;
        dom.promptTitle.textContent = title;
        dom.promptInput.value = '';
        dom.promptOverlay.classList.remove('hidden');
        dom.promptInput.focus();
    }
    function hideCustomPrompt() { dom.promptOverlay.classList.add('hidden'); }
    function showRewardClaimedModal() { dom.rewardClaimedOverlay.classList.remove('hidden'); }
    function hideRewardClaimedModal() { dom.rewardClaimedOverlay.classList.add('hidden'); }
    function showTicketsClaimedModal() { dom.ticketsClaimedOverlay.classList.remove('hidden'); }
    function hideTicketsClaimedModal() { dom.ticketsClaimedOverlay.classList.add('hidden'); }
    function showInfoModal() { dom.infoModalOverlay.classList.remove('hidden'); }
    function hideInfoModal() { dom.infoModalOverlay.classList.add('hidden'); }

    // --- PULL TO REFRESH ---
    function initPullToRefresh() {
        const content = document.getElementById('main-content');
        const ptrContainer = document.getElementById('pull-to-refresh'); 
        const icon = ptrContainer ? ptrContainer.querySelector('i') : null;
        if (!content || !ptrContainer || !icon) return;
        let startY = 0;
        let pulledDistance = 0;
        let isPulling = false;
        const triggerThreshold = 80;

        content.addEventListener('touchstart', (e) => {
            if (content.scrollTop <= 0) {
                startY = e.touches[0].clientY;
                isPulling = true;
                content.style.transition = 'none'; 
                ptrContainer.style.transition = 'none'; 
                icon.style.transition = 'none';
            } else { isPulling = false; }
        }, { passive: true });

        content.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            const currentY = e.touches[0].clientY;
            const diff = currentY - startY;
            if (diff > 0 && content.scrollTop <= 0) {
                if (e.cancelable) e.preventDefault();
                pulledDistance = Math.pow(diff, 0.85); 
                if (pulledDistance > 180) pulledDistance = 180;
                content.style.transform = `translateY(${pulledDistance}px)`;
                ptrContainer.style.transform = `translateY(${pulledDistance}px)`;
                icon.style.transform = `rotate(${pulledDistance * 2.5}deg)`;
                if (pulledDistance > triggerThreshold) icon.style.color = "#34c759";
                else icon.style.color = "#FFD700";
            }
        }, { passive: false });

        content.addEventListener('touchend', () => {
            if (!isPulling) return;
            isPulling = false;
            content.style.transition = 'transform 0.3s ease-out';
            ptrContainer.style.transition = 'transform 0.3s ease-out';
            if (pulledDistance > triggerThreshold) {
                content.style.transform = `translateY(80px)`;
                ptrContainer.style.transform = `translateY(80px)`;
                icon.classList.add('fa-spin');
                Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                setTimeout(() => window.location.reload(), 500);
            } else {
                content.style.transform = 'translateY(0px)';
                ptrContainer.style.transform = 'translateY(0px)';
                icon.style.transform = 'rotate(0deg)';
            }
            pulledDistance = 0;
        });
    }

    // --- MAIN ---
    // --- ЛОГИКА ПЕРЕКЛЮЧЕНИЯ ПЛАТФОРМ (НОВОЕ) ---
    function setPlatformTheme(platform) {
        document.body.setAttribute('data-theme', platform);
        
        const questButton = dom.questChooseBtn;
        if (platform === 'telegram') {
            questButton.classList.remove('twitch-theme');
            questButton.classList.add('telegram-theme');
            questButton.innerHTML = '<i class="fa-brands fa-telegram"></i> TELEGRAM ИСПЫТАНИЯ';
            
            // Скрываем Twitch челлендж
            dom.challengeContainer.classList.add('hidden');
            
            // Показываем Telegram статик
            if(dom.telegramStaticList) {
                dom.telegramStaticList.classList.remove('hidden');
                // Подгружаем актуальные данные (галочки и т.д.)
                if(window.updateTelegramStatus) window.updateTelegramStatus();
            }

        } else {
            // Twitch режим
            questButton.classList.remove('telegram-theme');
            questButton.classList.add('twitch-theme');
            questButton.innerHTML = '<i class="fa-brands fa-twitch"></i> TWITCH ИСПЫТАНИЯ';
            
            // Показываем Twitch челлендж
            dom.challengeContainer.classList.remove('hidden');
            
            // Скрываем Telegram статик
            if(dom.telegramStaticList) dom.telegramStaticList.classList.add('hidden');
        }

        // Фильтр для рулетки
        questsForRoulette = allQuests.filter(q => 
            q.quest_type && q.quest_type.startsWith(`automatic_${platform}`) && !q.is_completed
        );

        // Управление активным квестом
        const activeQuest = allQuests.find(q => q.id === userData.active_quest_id);
        let isActiveQuestVisible = false;

        if (activeQuest) {
            const activeType = activeQuest.quest_type || '';
            if (activeType.includes(platform)) {
                isActiveQuestVisible = true;
            }
        }

        if (isActiveQuestVisible) {
            renderActiveAutomaticQuest(activeQuest, userData);
            dom.activeAutomaticQuestContainer.classList.remove('hidden');
            dom.questChooseBtn.classList.add('hidden');
            dom.questChooseContainer.classList.add('hidden');
        } else {
            dom.activeAutomaticQuestContainer.classList.add('hidden'); 
            
            if (questsForRoulette.length > 0) {
                dom.questChooseBtn.classList.remove('hidden');
                dom.questChooseBtn.disabled = false;
                if (platform === 'telegram') dom.questChooseBtn.innerHTML = '<i class="fa-brands fa-telegram"></i> TELEGRAM ИСПЫТАНИЯ';
                else dom.questChooseBtn.innerHTML = '<i class="fa-brands fa-twitch"></i> TWITCH ИСПЫТАНИЯ';
                dom.questChooseContainer.classList.add('hidden'); 
            } else {
                 dom.questChooseBtn.classList.remove('hidden');
                 dom.questChooseBtn.disabled = true;
                 dom.questChooseBtn.innerHTML = '<i class="fa-solid fa-clock"></i> Задания недоступны';
            }
        }
    }

    function initUnifiedSwitcher() {
        const radios = document.querySelectorAll('input[name="view"]');
        
        radios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const view = e.target.value;
                    
                    if (!dom.sectionAuto || !dom.sectionManual) return;

                    if (view === 'manual') {
                        dom.sectionAuto.classList.add('hidden');
                        dom.sectionManual.classList.remove('hidden');
                        setPlatformTheme('manual'); 
                    } else {
                        dom.sectionAuto.classList.remove('hidden');
                        dom.sectionManual.classList.add('hidden');
                        setPlatformTheme(view);
                    }
                    try { Telegram.WebApp.HapticFeedback.selectionChanged(); } catch (err) {}
                }
            });
        });
    }

    // --- ОБНОВЛЕННАЯ ФУНКЦИЯ MAIN ---
    async function main() {
        if (window.Telegram && !Telegram.WebApp.initData) {
            if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
            return; 
        }

        if (dom.loaderOverlay) dom.loaderOverlay.classList.remove('hidden');
        updateLoading(10);
        
        try {
            const bootstrapData = await makeApiRequest("/api/v1/bootstrap", {}, 'POST', true);
            updateLoading(50);

            if (bootstrapData) {
                userData = bootstrapData.user;
                allQuests = bootstrapData.quests;
                
                if (userData) {
                    dom.fullName.textContent = userData.full_name || "Гость";
                    if (document.getElementById('ticketStats')) {
                        document.getElementById('ticketStats').textContent = userData.tickets || 0;
                    }
                    if (dom.fullName.parentNode && !document.getElementById('promo-btn-inject')) {
                        const btn = document.createElement('a');
                        btn.id = 'promo-btn-inject';
                        btn.href = 'profile.html';
                        btn.className = 'promo-profile-btn'; 
                        btn.innerHTML = '<i class="fa-solid fa-ticket" style="margin-right: 5px; font-size: 10px;"></i> Промокоды';
                        dom.fullName.insertAdjacentElement('afterend', btn);
                    }
                }

                initUnifiedSwitcher(); 

                let defaultView = userData.is_stream_online ? 'twitch' : 'telegram';
                const switchEl = document.getElementById(`view-${defaultView}`);
                if (switchEl) {
                    switchEl.checked = true;
                    setPlatformTheme(defaultView);
                    dom.sectionAuto.classList.remove('hidden');
                    dom.sectionManual.classList.add('hidden');
                }
    
                if (userData.challenge) renderChallenge(userData.challenge, !userData.twitch_id);
                else renderChallenge({ cooldown_until: userData.challenge_cooldown_until }, !userData.twitch_id);

                updateLoading(70);
                
                try {
                    const manualQuests = await makeApiRequest("/api/v1/quests/manual", {}, 'POST', true);
                    renderManualQuests(manualQuests);
                } catch (e) {
                    const fallbackQuests = allQuests.filter(q => q.quest_type === 'manual_check');
                    renderManualQuests(fallbackQuests);
                }
                
                try {
                    const questIdToHighlight = localStorage.getItem('highlightQuestId');
                    if (questIdToHighlight) {
                        localStorage.removeItem('highlightQuestId');
                        setTimeout(() => {
                            const targetButton = document.querySelector(`.perform-quest-button[data-id="${questIdToHighlight}"]`);
                            if (targetButton) {
                                const questCard = targetButton.closest('.quest-card');
                                const accordion = targetButton.closest('.quest-category-accordion');
                                if (accordion) accordion.open = true;
                                setTimeout(() => {
                                    if (questCard) {
                                        questCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        questCard.classList.add('tutorial-highlight');
                                        setTimeout(() => questCard.classList.remove('tutorial-highlight'), 2500);
                                    }
                                }, 150);
                            }
                        }, 500);
                    }
                } catch (err) { console.error(err); }
            }

            updateLoading(100);
            setTimeout(() => {
                if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
                dom.mainContent.style.opacity = 1; 
            }, 300);

        } catch (e) {
            console.error(e);
            Telegram.WebApp.showAlert("Ошибка загрузки. Обновите страницу.");
            if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
        }
    }

    // --- СОБЫТИЯ ---
    function setupEventListeners() {
        const footer = document.querySelector('.app-footer');
        if (footer) {
            footer.addEventListener('click', (e) => {
                if (e.target.closest('.footer-item')) {
                    try { Telegram.WebApp.HapticFeedback.impactOccurred('medium'); } catch (err) {}
                }
            });
        }
        
        document.addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('quest-category-header')) {
                e.preventDefault();
                const details = e.target.parentElement;
                if (details) {
                    if (details.hasAttribute('open')) details.removeAttribute('open');
                    else details.setAttribute('open', '');
                }
            }
        });

        dom.promptCancel.addEventListener('click', hideCustomPrompt);
        dom.promptConfirm.addEventListener('click', async () => {
            const text = dom.promptInput.value.trim();
            if (!text) return;
            const questIdForSubmission = currentQuestId;
            hideCustomPrompt();
            await makeApiRequest(`/api/v1/quests/${questIdForSubmission}/submit`, { submittedData: text });
            Telegram.WebApp.showAlert('Ваша заявка принята и отправлена на проверку!');
        });
        dom.rewardCloseBtn.addEventListener('click', () => { hideRewardClaimedModal(); main(); });
        dom.ticketsClaimCloseBtn.addEventListener('click', () => { hideTicketsClaimedModal(); main(); });
        dom.infoQuestionIcon.addEventListener('click', showInfoModal);
        dom.infoModalCloseBtn.addEventListener('click', hideInfoModal);
        
        if (dom.scheduleCloseBtn && dom.scheduleModal) {
            dom.scheduleCloseBtn.addEventListener('click', () => { dom.scheduleModal.classList.add('hidden'); });
            dom.scheduleModal.addEventListener('click', (e) => {
                if (e.target === dom.scheduleModal) dom.scheduleModal.classList.add('hidden');
            });
        }

        dom.questChooseBtn.addEventListener("click", () => {
            if (dom.questChooseContainer.classList.contains('hidden')) startQuestRoulette();
            else hideQuestRoulette();
        });

        document.body.addEventListener('click', async (event) => {
            const target = event.target.closest('button');
            if (!target) return;

            if (target.id === 'get-challenge-btn') {
                await startChallengeRoulette();
            } else if (target.id === 'claim-challenge-btn') {
                target.disabled = true;
                target.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                try {
                    const challengeId = target.dataset.challengeId; 
                    const result = await makeApiRequest(`/api/v1/challenges/${challengeId}/claim`, {}, 'POST');
                    if (result.success) {
                        if (result.promocode) {
                            showRewardClaimedModal(); 
                        } else {
                            await main();
                        }
                    } else {
                        Telegram.WebApp.showAlert(result.message || "Не удалось забрать награду");
                        target.disabled = false;
                        target.innerHTML = '<i class="fa-solid fa-gift"></i> <span>Забрать награду</span>';
                    }
                } catch (e) {
                    target.disabled = false;
                    target.innerHTML = '<i class="fa-solid fa-gift"></i> <span>Забрать награду</span>';
                }
            } else if (target.classList.contains('claim-reward-button') && target.dataset.questId) {
                const questId = target.dataset.questId;
                target.disabled = true;
                target.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                try {
                    const result = await makeApiRequest('/api/v1/promocode', { quest_id: parseInt(questId) });
                    if (result && result.promocode) {
                        showRewardClaimedModal();
                    } else if (result && result.tickets_only) {
                        const ticketStatsEl = document.getElementById('ticketStats');
                        if (ticketStatsEl) {
                            const current = parseInt(ticketStatsEl.textContent, 10);
                            ticketStatsEl.textContent = current + (result.tickets_awarded || 0);
                        }
                        showTicketsClaimedModal();
                    } else {
                        await main();
                    }
                } catch (e) {
                    target.disabled = false;
                    target.innerHTML = '<i class="fa-solid fa-gift"></i> <span>Забрать</span>';
                }
            } else if (target.classList.contains('perform-quest-button') && target.dataset.id) {
                const questId = target.dataset.id;
                const questTitle = target.dataset.title;
                showCustomPrompt(questTitle, questId);
            } else if (target.id === 'check-challenge-progress-btn' || target.id === 'complete-expired-quest-btn') {
                target.disabled = true;
                target.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                try {
                    if (target.id === 'check-challenge-progress-btn') await makeApiRequest("/api/v1/user/challenge/close_expired");
                    else await makeApiRequest('/api/v1/quests/close_expired');
                    await main();
                } catch (e) {
                    await main();
                }
            } else if (target.id === 'cancel-quest-btn') {
                Telegram.WebApp.showConfirm("Вы уверены, что хотите отменить это задание? Отменять задания можно лишь раз в сутки.", async (ok) => {
                    if (ok) {
                        try {
                            await makeApiRequest('/api/v1/quests/cancel');
                            Telegram.WebApp.showAlert('Задание отменено.');
                            await main();
                        } catch (e) {}
                    }
                });
            }
        });
    }

    setupEventListeners();
    initPullToRefresh();
    main();
    setInterval(refreshDataSilently, 7000);

} catch (e) {
    console.error("Critical Error:", e);
    if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
    document.body.innerHTML = `<div style="text-align:center; padding:20px; color:#fff;"><h1>Ошибка запуска</h1><p>${e.message}</p></div>`;
}

// --- ЛОГИКА TELEGRAM ИСПЫТАНИЙ (В САМОМ НИЗУ) ---
window.updateTelegramStatus = async function() {
    try {
        const res = await fetch('/api/v1/telegram/status', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: Telegram.WebApp.initData })
        });
        
        if (!res.ok) return;
        const data = await res.json();
        
        // Хелпер: заполнение прогресс бара
        const setProgress = (fillId, current, total) => {
            const el = document.getElementById(fillId);
            if(el) {
                const percent = Math.min((current / total) * 100, 100);
                el.style.width = percent + "%";
            }
        };

        // 1. Подписка
        const subBtn = document.getElementById('btn-tg-sub');
        if (data.subscribed) {
            document.getElementById('tg-row-sub').style.display = 'none';
        } else if(subBtn) {
            subBtn.innerText = "ТЫК";
            resetTgBtn(subBtn);
        }

        // 2. Голосование
        const voteBtn = document.getElementById('btn-tg-vote');
        const voteTimer = document.getElementById('tg-vote-timer');
        
        if (!data.vote_available) {
             document.getElementById('tg-row-vote').style.display = 'none';
        } else {
             document.getElementById('tg-row-vote').style.display = 'flex';
             if(voteBtn) voteBtn.innerText = "ТЫК";
             if(voteTimer) voteTimer.classList.add('hidden');
        }

        // 3. Фамилия (7 дней)
        // Если бэкенд еще не отдает дни, используем заглушку: если surname_ok=true, то 1/7
        const surnameDays = data.surname_days || (data.surname_ok ? 1 : 0);
        setProgress('tg-surname-fill', surnameDays, 7);
        // Если 7 дней собрано - скрываем
        if (surnameDays >= 7) document.getElementById('tg-row-surname').style.display = 'none';

        // 4. Био (7 дней)
        const bioDays = data.bio_days || (data.bio_ok ? 1 : 0);
        setProgress('tg-bio-fill', bioDays, 7);
        if (bioDays >= 7) document.getElementById('tg-row-bio').style.display = 'none';

        // 5. Реакции
        const rCount = data.reactions_count || 0;
        const rTarget = data.reactions_target || 7;
        
        if (rCount >= rTarget) {
            document.getElementById('tg-row-reaction').style.display = 'none';
        } else {
            const countEl = document.getElementById('tg-reaction-count');
            if (countEl) countEl.innerText = `${rCount}/${rTarget}`;
            setProgress('tg-reaction-fill', rCount, rTarget);
        }
        
    } catch (e) {
        console.error("TG Quest Update Error:", e);
    }
};

window.checkTelegramProfile = async function() {
    const btn1 = document.getElementById('btn-tg-surname');
    const btn2 = document.getElementById('btn-tg-bio');
    
    // Анимация
    if(btn1) btn1.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    if(btn2) btn2.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        const res = await fetch('/api/v1/telegram/check_profile', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: Telegram.WebApp.initData })
        });
        const data = await res.json();
        
        // Если успешно - показываем модалку награды
        if (data.success && (data.surname || data.bio)) {
             // Если функция showRewardClaimedModal доступна глобально (из quests.js)
             if (typeof dom !== 'undefined' && dom.rewardClaimedOverlay) {
                 dom.rewardClaimedOverlay.classList.remove('hidden');
             } else {
                 Telegram.WebApp.showAlert("Награда получена!");
             }
        } 
        
        if (!data.surname && !data.bio && data.success) {
            Telegram.WebApp.showAlert("Условия не выполнены. Проверьте фамилию и описание.");
        }
        
        // Обновляем UI
        await window.updateTelegramStatus();

    } catch (e) {
        Telegram.WebApp.showAlert("Ошибка проверки");
        window.updateTelegramStatus();
    }
};

window.doTelegramVote = async function() {
    const btn = document.getElementById('btn-tg-vote');
    if(btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    
    try {
        const res = await fetch('/api/v1/telegram/vote', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: Telegram.WebApp.initData })
        });
        const data = await res.json();
        
        if (data.success) {
             if (typeof dom !== 'undefined' && dom.rewardClaimedOverlay) {
                 dom.rewardClaimedOverlay.classList.remove('hidden');
             } else {
                 Telegram.WebApp.showAlert("Награда получена!");
             }
        } else {
            Telegram.WebApp.showAlert(data.message || "Ошибка");
        }
        await window.updateTelegramStatus();
        
    } catch (e) {
        await window.updateTelegramStatus();
    }
};

function markTgAsDone(btn) {
    if (!btn) return;
    btn.disabled = true;
    btn.classList.add('completed');
    btn.innerHTML = '<i class="fa-solid fa-check"></i>';
}

function markTgAsDone(btn) {
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-check"></i>';
    // Делаем кнопку зеленой и полупрозрачной
    btn.style.background = 'rgba(52, 199, 89, 0.2)'; 
    btn.style.color = '#34c759';
    btn.style.cursor = 'default';
    
    // Затемняем всю строку для красоты
    const row = btn.closest('.tg-row');
    if(row) row.style.opacity = '0.5';
}

function resetTgBtn(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.style.background = '#0088CC';
    btn.style.color = '#fff';
    btn.innerHTML = 'ТЫК';
}
    
    const row = btn.closest('.tg-row');
    if(row) row.style.opacity = '1';
}
