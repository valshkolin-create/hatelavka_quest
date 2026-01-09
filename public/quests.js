// ==========================================
// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И DOM
// ==========================================
const dom = {
    loaderOverlay: document.getElementById('loader-overlay'),
    loadingText: document.getElementById('loading-text'),
    loadingBarFill: document.getElementById('loading-bar-fill'),
    mainContent: document.getElementById('main-content'),
    fullName: document.getElementById('fullName'),
    
    // Элементы квестов
    challengeContainer: document.getElementById('challenge-container'),
    telegramStaticList: document.getElementById('telegram-static-quests'), // Контейнер Telegram (скрытый блок)
    tgTasksList: document.getElementById('tg-tasks-list'), // Список внутри него (куда рендерим)
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

// ==========================================
// 2. УТИЛИТЫ И API (Глобальные)
// ==========================================

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
        
        // Добавляем initData ко всем POST/PUT запросам
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

// ==========================================
// 3. TELEGRAM ЗАДАНИЯ И ЛОГИКА (НОВОЕ)
// ==========================================

// Хранилище для интервалов таймеров, чтобы не плодить их
let cooldownIntervalsMap = {};

// Функция запуска таймера на кнопке
function startButtonCooldown(btnId, lastClaimedIso, cooldownHours = 20) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    // Очищаем старый таймер, если был
    if (cooldownIntervalsMap[btnId]) clearInterval(cooldownIntervalsMap[btnId]);

    const lastClaimTime = new Date(lastClaimedIso).getTime();
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    const targetTime = lastClaimTime + cooldownMs;

    const updateTimer = () => {
        const now = new Date().getTime();
        const diff = targetTime - now;

        if (diff <= 0) {
            // Время вышло — активируем кнопку
            clearInterval(cooldownIntervalsMap[btnId]);
            btn.disabled = false;
            btn.style.background = ''; // Возвращаем родной цвет
            btn.style.opacity = '1';
            // Возвращаем текст "Забрать" (можно усложнить, но пока так)
            // Чтобы текст вернулся корректным, лучше просто перезагрузить список или оставить "Доступно"
            btn.innerHTML = 'Забрать'; 
            return;
        }

        // Форматируем время ЧЧ:ММ:СС
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);

        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        
        // Делаем кнопку серой
        btn.disabled = true;
        btn.style.background = '#444'; // Серый фон
        btn.style.color = '#aaa';      // Серый текст
        btn.innerHTML = `<i class="fa-regular fa-clock"></i> ${timeStr}`;
    };

    updateTimer(); // Запуск сразу
    cooldownIntervalsMap[btnId] = setInterval(updateTimer, 1000);
}

async function loadTelegramTasks() {
    const container = document.getElementById('tg-tasks-list');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:10px; color:#666;">Загрузка...</div>';
    
    const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
    if (!userId) {
        container.innerHTML = '<div style="text-align:center; padding:10px; color:red;">Ошибка: User ID не найден</div>';
        return;
    }

    try {
        const tasks = await makeApiRequest(`/api/v1/telegram/tasks?user_id=${userId}`, {}, 'GET', true);
        container.innerHTML = ''; 

        if (!tasks || tasks.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:10px;">Заданий пока нет</div>';
            return;
        }

        tasks.forEach(task => {
            const el = document.createElement('div');
            el.className = `tg-task-item ${task.is_completed ? 'completed' : ''}`;
            
            let iconClass = 'fa-solid fa-star';
            if (task.task_key === 'tg_surname') iconClass = 'fa-solid fa-signature';
            if (task.task_key === 'tg_bio') iconClass = 'fa-solid fa-link';
            if (task.task_key === 'tg_sub') iconClass = 'fa-brands fa-telegram';
            if (task.task_key === 'tg_vote') iconClass = 'fa-solid fa-rocket';

            let rightColHtml = '';
            let bottomHtml = '';

            // 1. ВЫПОЛНЕНО ПОЛНОСТЬЮ
            if (task.is_completed) {
                rightColHtml = `<div class="tg-completed-icon"><i class="fa-solid fa-check"></i></div>`;
            } 
            // 2. АКТИВНО (ИЛИ НА КУЛДАУНЕ)
            else {
                if (task.is_daily || task.task_key === 'tg_sub' || task.task_key === 'tg_vote') {
                    
                    const rewardText = task.is_daily ? `~${Math.round(task.reward_amount / task.total_days)}` : task.reward_amount;
                    let actionLinkHtml = '';
                    
                    if ((task.task_key === 'tg_sub' || task.task_key === 'tg_vote') && task.action_url) {
                        const linkText = task.task_key === 'tg_vote' ? 'Проголосовать' : 'Открыть канал';
                        actionLinkHtml = `<div style="font-size:9px; color:#0088cc; margin-bottom:4px; text-align:right; cursor:pointer;" onclick="Telegram.WebApp.openTelegramLink('${task.action_url}')">${linkText} <i class="fa-solid fa-arrow-up-right-from-square"></i></div>`;
                    }

                    rightColHtml = `
                        ${actionLinkHtml}
                        <button class="tg-action-btn" id="btn-${task.task_key}" onclick="handleDailyClaim('${task.task_key}', ${userId}, '${task.action_url || ''}')">
                            Забрать (+${rewardText} 🎟)
                        </button>
                    `;
                    
                    // Прогресс бар
                    if (task.is_daily) {
                        const percent = (task.current_day / task.total_days) * 100;
                        bottomHtml = `
                            <div class="tg-progress-track" style="margin-top:8px;">
                                <div id="prog-fill-${task.task_key}" class="tg-progress-fill" style="width: ${percent}%"></div>
                            </div>
                            <div class="tg-counter-text" id="prog-text-${task.task_key}">
                                День ${task.current_day}/${task.total_days}
                            </div>
                        `;
                    }
                } else {
                    rightColHtml = `
                        <button class="tg-action-btn" id="btn-${task.task_key}" onclick="handleTgTaskClick('${task.task_key}', '${task.action_url}')">
                            +${task.reward_amount} 🎟
                        </button>
                    `;
                }
            }

            el.innerHTML = `
                <div class="tg-task-header">
                    <div class="tg-left-col">
                        <div class="tg-icon-box"><i class="${iconClass}"></i></div>
                        <div class="tg-text-col">
                            <span class="tg-title">${task.title}</span>
                            <span class="tg-subtitle">${task.description || ''}</span>
                        </div>
                    </div>
                    <div class="tg-right-col">
                        ${rightColHtml}
                    </div>
                </div>
                ${bottomHtml}
            `;
            container.appendChild(el);

            // === ЗАПУСК ТАЙМЕРА, ЕСЛИ НУЖНО ===
            // Проверяем: это дейлик? есть дата клейма? не завершено ли?
            if (task.is_daily && task.last_claimed_at && !task.is_completed) {
                // Проверяем, прошло ли 20 часов
                const last = new Date(task.last_claimed_at).getTime();
                const now = new Date().getTime();
                const diff = now - last;
                const cooldownMs = 20 * 60 * 60 * 1000;
                
                if (diff < cooldownMs) {
                    startButtonCooldown(`btn-${task.task_key}`, task.last_claimed_at);
                }
            }
        });

    } catch (e) { console.error(e); }
}

// Глобальная функция обработки клика по ДЕЙЛИКУ
// В файле quests.js замени handleDailyClaim на эту версию:

// Замени старую функцию handleDailyClaim на эту:
async function handleDailyClaim(taskKey, userId, actionUrl) {
    const btn = document.getElementById(`btn-${taskKey}`);
    const fill = document.getElementById(`prog-fill-${taskKey}`);
    const text = document.getElementById(`prog-text-${taskKey}`);
    
    if(btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }

    try {
        const data = await makeApiRequest('/api/v1/telegram/claim_daily', { 
            user_id: userId, 
            task_key: taskKey 
        });
        
        if (data && data.success) {
            // УСПЕХ
            if(Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            
            if (data.is_completed) {
                Telegram.WebApp.showAlert(data.message || "Задание выполнено!");
                setTimeout(() => loadTelegramTasks(), 500); 
            } else {
                // ОБНОВЛЯЕМ ПРОГРЕСС
                if(fill) {
                    const percent = (data.day / data.total_days) * 100;
                    fill.style.width = `${percent}%`;
                }
                if(text) text.innerText = `День ${data.day} из ${data.total_days} (Получено +${data.reward})`;
                
                Telegram.WebApp.showAlert(data.message);

                // !!! ЗАПУСКАЕМ ТАЙМЕР СРАЗУ !!!
                // Берем текущее время как время клейма
                const nowIso = new Date().toISOString();
                startButtonCooldown(`btn-${taskKey}`, nowIso);
            }
            
            const stats = document.getElementById('ticketStats');
            if(stats) stats.innerText = parseInt(stats.innerText || '0') + data.reward;

        } else if (data) {
            // ОШИБКА
            if(Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred('error');
            
            if (taskKey === 'tg_vote') {
                injectBoostPopup(actionUrl);
            }
            else if (data.error && (data.error.includes("Условие не выполнено") || data.error.includes("Тег"))) {
                if (taskKey === 'tg_surname') injectProfilePopup('surname');
                else if (taskKey === 'tg_bio') injectProfilePopup('bio');
                else Telegram.WebApp.showAlert(data.error);
            }
            else if (data.error && data.error.includes("не подписаны")) {
                 Telegram.WebApp.showAlert("Вы не подписаны на канал! Ссылка для подписки выше кнопки.");
            }
            else {
                Telegram.WebApp.showAlert(data.error || "Произошла ошибка");
            }
            
            if(btn) {
                btn.disabled = false;
                btn.innerText = "Проверить снова";
                // Сбрасываем стили если была ошибка
                btn.style.background = '';
                btn.style.color = '';
            }
        }
    } catch (e) {
        console.error(e);
        if(btn) {
            btn.disabled = false;
            btn.innerText = "Ошибка";
        }
    }
}

// Глобальная функция для ОБЫЧНЫХ квестов
function handleTgTaskClick(key, url) {
    if (key === 'tg_vote') {
        injectBoostPopup(url);
    } else if (key === 'tg_sub') {
        Telegram.WebApp.openTelegramLink(url);
        setTimeout(() => { if(window.updateTelegramStatus) window.updateTelegramStatus(); }, 2000);
    }
}

// ==========================================
// 4. ПОПАПЫ И UI (Глобальные)
// ==========================================

function injectBoostPopup(customUrl) {
    const urlToUse = customUrl || 'https://t.me/boost/hatelove_ttv';
    const existing = document.getElementById('boostPopup');
    if (existing) existing.remove();

    const popupHtml = `
    <div id="boostPopup" class="popup-overlay" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); z-index: 99999; justify-content: center; align-items: center; backdrop-filter: blur(5px);">
      <div class="popup-content" style="background: #1c1c1e; color: #fff; padding: 25px; border-radius: 16px; text-align: center; width: 85%; max-width: 320px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #333; display: flex; flex-direction: column; align-items: center;">
        <h3 style="margin-top: 0; color: #ff4757; font-size: 20px; margin-bottom: 10px;">⚠️ Внимание!</h3>
        <p style="font-size: 14px; line-height: 1.5; color: #ddd; margin-bottom: 20px;">Голосование за канал необходимо для получения бонусов.</p>
        <button id="goToBoostBtn" style="width: 100%; background: #0088cc; color: white; border: none; padding: 12px; border-radius: 10px; margin-bottom: 15px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
           <i class="fa-solid fa-rocket"></i> Проголосовать
        </button>
        <button id="closePopupBtn" style="width: 100%; background: transparent; border: 1px solid #555; color: #aaa; padding: 10px; border-radius: 10px; cursor: pointer; font-size: 14px;">Закрыть</button>
      </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', popupHtml);
    document.getElementById('goToBoostBtn').addEventListener('click', () => {
        const popup = document.getElementById('boostPopup');
        if (popup) popup.remove();
        Telegram.WebApp.openTelegramLink(urlToUse);
    });
    document.getElementById('closePopupBtn').addEventListener('click', () => {
        const popup = document.getElementById('boostPopup');
        if (popup) popup.remove();
    });
}

function injectProfilePopup(type) {
    const existing = document.getElementById('profilePopup');
    if (existing) existing.remove();

    let titleText = '';
    let bodyHTML = ''; 
    const tgColor = '#0088cc'; 
    const tgBg = 'rgba(0, 136, 204, 0.15)'; 

    if (type === 'surname') {
        titleText = '❌ Ник бота не найден';
        bodyHTML = `Добавьте фразу <b style="color: ${tgColor}; background: ${tgBg}; padding: 2px 6px; border-radius: 4px;">@HATElavka_bot</b> в поле "Фамилия" в настройках Telegram.`;
    } else {
        titleText = '❌ Ссылка не найдена';
        let refPayload = userData.telegram_id;
        if (userData && userData.bott_ref_id) refPayload = `r_${userData.bott_ref_id}`;
        else if (userData && userData.bott_internal_id) refPayload = `r_${userData.bott_internal_id}`;
        
        const fullRefLink = `https://t.me/HATElavka_bot/app?startapp=${refPayload}`;
        const displayRefLink = fullRefLink.replace('https://', '');

        bodyHTML = `
            <div style="margin-bottom: 12px; font-size: 11px; color: #ccc;">Добавьте вашу реф. ссылку в раздел <b>"О себе" (Bio)</b>:</div>
            <div style="display: flex; gap: 8px; background: rgba(0,0,0,0.4); padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); align-items: center;">
                <input id="popupRefInput" type="text" readonly value="${displayRefLink}" style="flex-grow: 1; background: transparent; border: none; color: ${tgColor}; font-weight: 600; font-size: 11px; outline: none; width: 100%;">
                <button id="popupCopyBtn" style="background: ${tgColor}; border: none; border-radius: 8px; color: #fff; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                    <i class="fa-regular fa-copy"></i>
                </button>
            </div>
        `;
        // Копирование
        setTimeout(() => {
            const copyBtn = document.getElementById('popupCopyBtn');
            if(copyBtn) copyBtn.addEventListener('click', function() {
                navigator.clipboard.writeText(fullRefLink).then(() => {
                     if(Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                     this.innerHTML = '<i class="fa-solid fa-check"></i>';
                     setTimeout(() => this.innerHTML = '<i class="fa-regular fa-copy"></i>', 2000);
                });
            });
        }, 100);
    }

    const popupHtml = `
    <div id="profilePopup" class="popup-overlay" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.85); z-index: 99999; justify-content: center; align-items: center; backdrop-filter: blur(8px);">
      <div class="popup-content" style="background: #1c1c1e; color: #fff; padding: 24px; border-radius: 16px; text-align: center; width: 85%; max-width: 340px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; align-items: center;">
        <h3 style="margin-top: 0; color: #ff4757; font-size: 20px; margin-bottom: 16px; font-weight: 700;">${titleText}</h3>
        <div style="font-size: 15px; line-height: 1.5; color: #ddd; margin-bottom: 24px; width: 100%;">${bodyHTML}</div>
        <button id="goToSettingsBtn" style="width: 100%; background: ${tgColor}; color: white; border: none; padding: 14px; border-radius: 12px; margin-bottom: 10px; font-weight: 600; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
           <i class="fa-solid fa-gear"></i> Открыть настройки
        </button>
        <button id="closeProfilePopupBtn" style="width: 100%; background: transparent; border: none; color: #8e8e93; padding: 10px; cursor: pointer; font-size: 15px;">Закрыть</button>
      </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', popupHtml);
    document.getElementById('goToSettingsBtn').addEventListener('click', () => {
        document.getElementById('profilePopup').remove();
        Telegram.WebApp.openLink('tg://settings'); 
    });
    document.getElementById('closeProfilePopupBtn').addEventListener('click', () => {
        document.getElementById('profilePopup').remove();
    });
}

// ==========================================
// 5. РЕНДЕРИНГ
// ==========================================

function createTwitchNoticeHtml() {
    return `<div class="twitch-update-notice">ℹ️ Прогресс обновляется с задержкой (до 30 мин).</div>`;
}

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

function renderManualQuests(questsData) {
    const container = document.getElementById('manual-quests-list');
    if (!container) return;
    container.innerHTML = ''; 

    let quests = [];
    if (Array.isArray(questsData)) {
        quests = questsData;
    } else if (questsData && Array.isArray(questsData.quests)) {
        quests = questsData.quests;
    } else if (questsData && Array.isArray(questsData.data)) {
        quests = questsData.data;
    }

    if (!quests || quests.length === 0) {
        container.innerHTML = `<p style="text-align: center; font-size: 12px; color: var(--text-color-muted);">Нет заданий для ручной проверки.</p>`;
        return;
    }

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

// ==========================================
// 6. ОСНОВНАЯ ЛОГИКА
// ==========================================

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

// ==========================================
// 7. ИНИЦИАЛИЗАЦИЯ И ОБРАБОТЧИКИ
// ==========================================

function setPlatformTheme(platform) {
    document.body.setAttribute('data-theme', platform);
    
    const questButton = dom.questChooseBtn;
    if (platform === 'telegram') {
        questButton.classList.remove('twitch-theme');
        questButton.classList.add('telegram-theme');
        questButton.innerHTML = '<i class="fa-brands fa-telegram"></i> TELEGRAM ИСПЫТАНИЯ';
        
        dom.challengeContainer.classList.add('hidden');
        if(dom.telegramStaticList) {
            dom.telegramStaticList.classList.remove('hidden');
            loadTelegramTasks(); 
        }

    } else {
        questButton.classList.remove('telegram-theme');
        questButton.classList.add('twitch-theme');
        questButton.innerHTML = '<i class="fa-brands fa-twitch"></i> TWITCH ИСПЫТАНИЯ';
        
        dom.challengeContainer.classList.remove('hidden');
        if(dom.telegramStaticList) dom.telegramStaticList.classList.add('hidden');
    }

    questsForRoulette = allQuests.filter(q => 
        q.quest_type && q.quest_type.startsWith(`automatic_${platform}`) && !q.is_completed
    );

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
             if (platform === 'manual') {
                 dom.questChooseBtn.classList.add('hidden');
             } else {
                 dom.questChooseBtn.classList.remove('hidden');
                 dom.questChooseBtn.disabled = true;
                 dom.questChooseBtn.innerHTML = '<i class="fa-solid fa-clock"></i> Задания недоступны';
             }
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

    if(dom.promptCancel) dom.promptCancel.addEventListener('click', () => dom.promptOverlay.classList.add('hidden'));
    
    if(dom.promptConfirm) dom.promptConfirm.addEventListener('click', async () => {
        const text = dom.promptInput.value.trim();
        if (!text) return;
        const questIdForSubmission = currentQuestId;
        dom.promptOverlay.classList.add('hidden');
        await makeApiRequest(`/api/v1/quests/${questIdForSubmission}/submit`, { submittedData: text });
        Telegram.WebApp.showAlert('Ваша заявка принята и отправлена на проверку!');
    });
    
    if(dom.rewardCloseBtn) dom.rewardCloseBtn.addEventListener('click', () => { dom.rewardClaimedOverlay.classList.add('hidden'); main(); });
    if(dom.ticketsClaimCloseBtn) dom.ticketsClaimCloseBtn.addEventListener('click', () => { dom.ticketsClaimedOverlay.classList.add('hidden'); main(); });
    if(dom.infoQuestionIcon) dom.infoQuestionIcon.addEventListener('click', () => dom.infoModalOverlay.classList.remove('hidden'));
    if(dom.infoModalCloseBtn) dom.infoModalCloseBtn.addEventListener('click', () => dom.infoModalOverlay.classList.add('hidden'));
    
    if (dom.scheduleCloseBtn && dom.scheduleModal) {
        dom.scheduleCloseBtn.addEventListener('click', () => { dom.scheduleModal.classList.add('hidden'); });
        dom.scheduleModal.addEventListener('click', (e) => {
            if (e.target === dom.scheduleModal) dom.scheduleModal.classList.add('hidden');
        });
    }

    if(dom.questChooseBtn) dom.questChooseBtn.addEventListener("click", () => {
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
                        dom.rewardClaimedOverlay.classList.remove('hidden'); 
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
                    dom.rewardClaimedOverlay.classList.remove('hidden');
                } else if (result && result.tickets_only) {
                    const ticketStatsEl = document.getElementById('ticketStats');
                    if (ticketStatsEl) {
                        const current = parseInt(ticketStatsEl.textContent, 10);
                        ticketStatsEl.textContent = current + (result.tickets_awarded || 0);
                    }
                    dom.ticketsClaimedOverlay.classList.remove('hidden');
                } else {
                    await main();
                }
            } catch (e) {
                target.disabled = false;
                target.innerHTML = '<i class="fa-solid fa-gift"></i> <span>Забрать</span>';
            }
        } else if (target.classList.contains('perform-quest-button') && target.dataset.id) {
            currentQuestId = target.dataset.id;
            dom.promptTitle.textContent = target.dataset.title;
            dom.promptInput.value = '';
            dom.promptOverlay.classList.remove('hidden');
            dom.promptInput.focus();
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

// ==========================================
// 8. ЗАПУСК
// ==========================================

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

// Глобальные "экспорты" для совместимости (если что-то вызывается из HTML напрямую)
window.updateTelegramStatus = async function() {
    try {
        const res = await makeApiRequest('/api/v1/telegram/status', {}, 'POST', true);
        if (!res) return;
        
        // Тут можно было бы обновить UI для Sub/Vote, но мы рендерим всё в loadTelegramTasks
        // Оставим эту функцию пустой или используем для обновления кнопки подписки
        const subBtn = document.getElementById('btn-tg-sub');
        if (subBtn) {
            if (res.subscribed) subBtn.style.display = 'none';
            else subBtn.style.display = 'block';
        }
    } catch (e) { /* Silent */ }
};

window.checkTelegramProfile = function(type) {
    // Эта функция больше не используется (заменена на handleDailyClaim),
    // но оставим заглушку чтобы не было ошибок
    console.log("Use handleDailyClaim instead");
};

window.doTelegramVote = function() {
    // Тоже заменено на handleTgTaskClick -> injectBoostPopup
};

try {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
    checkMaintenance();
    setupEventListeners();
    initPullToRefresh();
    main();
    setInterval(refreshDataSilently, 30000);
} catch (e) {
    console.error("Critical Error:", e);
    if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
    document.body.innerHTML = `<div style="text-align:center; padding:20px; color:#fff;"><h1>Ошибка запуска</h1><p>${e.message}</p></div>`;
}
