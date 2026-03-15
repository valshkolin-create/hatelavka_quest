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

    // === НОВЫЕ ПЕРЕМЕННЫЕ МОДАЛКИ ===
    modalOverlay: document.getElementById('universal-modal-overlay'),
    modalTitle: document.getElementById('modal-title'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    modalContainer: document.getElementById('modal-cards-container'),
    
    scheduleModal: document.getElementById('schedule-modal-overlay'),
    scheduleCloseBtn: document.getElementById('schedule-modal-close-btn')
};

let currentQuestId = null;
let countdownIntervals = {};
let allQuests = [];
let userData = {};
let questsForRoulette = [];
let telegramTasksCache = null;
let activeProfileCheck = null;

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

// === УПРАВЛЕНИЕ КРАСИВЫМ ОКНОМ ===
function openUniversalModal(title, contentHTML = '') {
    // 1. Ставим заголовок
    dom.modalTitle.textContent = title;
    
    // 2. Очищаем и заполняем контент (если передан HTML строкой)
    // Если мы будем заполнять элементами через appendChild, contentHTML можно не передавать
    if (contentHTML) {
        dom.modalContainer.innerHTML = contentHTML;
    } else {
        dom.modalContainer.innerHTML = '';
    }

    // 3. Показываем окно
    dom.modalOverlay.classList.remove('hidden');
    // Небольшая задержка для CSS анимации (чтобы класс active сработал после remove hidden)
    requestAnimationFrame(() => {
        dom.modalOverlay.classList.add('active');
    });
}

function closeUniversalModal() {
    dom.modalOverlay.classList.remove('active');
    setTimeout(() => {
        dom.modalOverlay.classList.add('hidden');
        dom.modalContainer.innerHTML = ''; // Очистка памяти
        dom.modalContainer.classList.remove('grid-mode');
    }, 300); // Ждем окончания анимации CSS (0.3s)
}

// Слушатель закрытия (добавь это в setupEventListeners или просто внизу)
if (dom.modalCloseBtn) {
    dom.modalCloseBtn.addEventListener('click', closeUniversalModal);
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
        // === ИСПРАВЛЕНИЕ: Используем let вместо const, чтобы можно было исправить данные ===
        let tasks = await makeApiRequest(`/api/v1/telegram/tasks?user_id=${userId}`, {}, 'GET', true);
        
        // === ИСПРАВЛЕНИЕ: Защита от краша tasks.filter ===
        // Если сервер вернул null, undefined или объект ошибки — делаем пустой массив
        if (!Array.isArray(tasks)) {
            console.warn("loadTelegramTasks: API вернул не массив, сбрасываем в []", tasks);
            tasks = [];
        }

        // === ВАЖНОЕ ДОБАВЛЕНИЕ ДЛЯ АВТО-ОБНОВЛЕНИЯ ===
        telegramTasksCache = tasks; 
        // ==============================================

        container.innerHTML = ''; 

        if (tasks.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:10px;">Заданий пока нет</div>';
            return;
        }

        // 1. Разделяем задачи
        const activeTasks = tasks.filter(t => !t.is_completed);
        const completedTasks = tasks.filter(t => t.is_completed);

        // !!! ВАЖНО: Список для отложенного запуска таймеров !!!
        const timersToStart = [];

        // Функция создания HTML
        const createTaskElement = (task) => {
            const el = document.createElement('div');
            el.className = `tg-task-item ${task.is_completed ? 'completed' : ''}`;
            
            if (task.is_completed) {
                el.style.opacity = '0.6';
                el.style.filter = 'grayscale(1)';
            }
            
            let iconClass = 'fa-solid fa-star';
            if (task.task_key === 'tg_surname') iconClass = 'fa-solid fa-signature';
            if (task.task_key === 'tg_bio') iconClass = 'fa-solid fa-link';
            if (task.task_key === 'tg_sub') iconClass = 'fa-brands fa-telegram';
            if (task.task_key === 'tg_vote') iconClass = 'fa-solid fa-rocket';

            let rightColHtml = '';
            let bottomHtml = '';

            if (task.is_completed) {
                rightColHtml = `<div class="tg-completed-icon"><i class="fa-solid fa-check"></i></div>`;
            } else {
                const rewardHtml = `
                    <div class="btn-reward-badge">
                        <span>+${task.reward_amount}</span>
                        <i class="fa-solid fa-ticket btn-ticket-icon"></i>
                    </div>
                `;
                const btnDataAttr = `data-reward="${task.reward_amount}"`;

                // --- 🔥 ЛОГИКА 7 ДНЯ (ЗОЛОТАЯ КНОПКА) 🔥 ---
                const isFinalDay = task.is_daily && task.current_day === task.total_days;
                let btnStyle = '';
                let btnContent = `ЗАБРАТЬ ${rewardHtml}`;
                
                if (isFinalDay) {
                    btnStyle = 'background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: #000; border: none; box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3); font-weight: 800;';
                    // Меняем текст на "ЗАБРАТЬ ПРИЗ" и убираем стандартный бейдж с +билетами
                    btnContent = `<i class="fa-solid fa-gift" style="margin-right:5px;"></i> ЗАБРАТЬ ПРИЗ`; 
                }
                // ----------------------------------------

                if (task.is_daily || task.task_key === 'tg_sub' || task.task_key === 'tg_vote' || task.task_key === 'tg_surname' || task.task_key === 'tg_bio') {
                    let actionLinkHtml = '';
                    if ((task.task_key === 'tg_sub' || task.task_key === 'tg_vote') && task.action_url) {
                        const linkText = task.task_key === 'tg_vote' ? 'Проголосовать' : 'Открыть канал';
                        actionLinkHtml = `<div style="font-size:9px; color:#0088cc; margin-bottom:4px; text-align:right; cursor:pointer;" onclick="Telegram.WebApp.openTelegramLink('${task.action_url}')">${linkText} <i class="fa-solid fa-arrow-up-right-from-square"></i></div>`;
                    }

                    rightColHtml = `
                        ${actionLinkHtml}
                        <button class="tg-premium-btn" id="btn-${task.task_key}" ${btnDataAttr} style="${btnStyle}" onclick="handleDailyClaim('${task.task_key}', ${userId}, '${task.action_url || ''}')">
                            ${btnContent}
                        </button>
                    `;
                    
                    if (task.is_daily) {
                        let segmentsHtml = '';
                        for (let i = 1; i <= task.total_days; i++) {
                            const isFilled = i <= task.current_day ? 'filled' : '';
                            segmentsHtml += `<div class="tg-progress-segment ${isFilled}" id="seg-${task.task_key}-${i}"></div>`;
                        }
                        bottomHtml = `
                            <div class="tg-progress-track" style="margin-top:8px;">
                                ${segmentsHtml}
                            </div>
                            <div class="tg-counter-text" id="prog-text-${task.task_key}">
                                День ${task.current_day}/${task.total_days}
                            </div>
                        `;
                    }
                } else {
                    rightColHtml = `
                        <button class="tg-premium-btn" id="btn-${task.task_key}" ${btnDataAttr} onclick="handleTgTaskClick('${task.task_key}', '${task.action_url}')">
                            ЗАБРАТЬ ${rewardHtml}
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
                            <span class="tg-subtitle">
                                ${(task.description || '').replace(/(@[a-zA-Z0-9_]+)/g, '<span class="tg-code-phrase">$1</span>')}
                            </span>
                        </div>
                    </div>
                    <div class="tg-right-col">
                        ${rightColHtml}
                    </div>
                </div>
                ${bottomHtml}
            `;

            // !!! ИСПРАВЛЕНИЕ: БЛОКИРУЕМ ТАЙМЕР, ЕСЛИ ЭТО 7 ДЕНЬ !!!
            const isFinalDay = task.is_daily && task.current_day === task.total_days;

            if ((task.is_daily || task.task_key === 'tg_surname' || task.task_key === 'tg_bio') && task.last_claimed_at && !task.is_completed && !isFinalDay) {
                const last = new Date(task.last_claimed_at).getTime();
                const now = new Date().getTime();
                const diff = now - last;
                const cooldownMs = 20 * 60 * 60 * 1000; // 20 часов
                
                if (diff < cooldownMs) {
                    timersToStart.push({
                        id: `btn-${task.task_key}`,
                        time: task.last_claimed_at
                    });
                }
            }
            return el;
        };

        // 2. Рендерим АКТИВНЫЕ задачи (они добавляются в DOM)
        activeTasks.forEach(task => {
            container.appendChild(createTaskElement(task));
        });

        // 3. Рендерим ВЫПОЛНЕННЫЕ
        if (completedTasks.length > 0) {
            const detailsEl = document.createElement('details');
            detailsEl.style.cssText = `width: 100%; margin-top: 15px; background: rgba(255, 255, 255, 0.05); border-radius: 12px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.05);`;
            detailsEl.open = false;

            const summaryEl = document.createElement('summary');
            summaryEl.style.cssText = `padding: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #8e8e93; font-weight: 600; font-size: 13px; list-style: none; user-select: none;`;
            summaryEl.innerHTML = `<span>Показать выполненные (${completedTasks.length})</span> <i class="fa-solid fa-chevron-down" style="margin-left: 8px; transition: transform 0.3s;"></i>`;

            const innerList = document.createElement('div');
            innerList.style.cssText = `display: flex; flex-direction: column; gap: 4px; padding: 10px; border-top: 1px solid rgba(255, 255, 255, 0.05); background: rgba(0, 0, 0, 0.1);`;

            completedTasks.forEach(task => {
                innerList.appendChild(createTaskElement(task));
            });

            detailsEl.appendChild(summaryEl);
            detailsEl.appendChild(innerList);
            container.appendChild(detailsEl);

            summaryEl.addEventListener('click', () => {
                const icon = summaryEl.querySelector('i');
                setTimeout(() => {
                    if(detailsEl.open) icon.style.transform = 'rotate(180deg)';
                    else icon.style.transform = 'rotate(0deg)';
                }, 10);
            });
        }

        // !!! ГЛАВНОЕ ИСПРАВЛЕНИЕ !!!
        // Запускаем таймеры ТОЛЬКО ТЕПЕРЬ, когда все кнопки точно есть на странице
        timersToStart.forEach(data => {
            if (typeof startButtonCooldown === 'function') {
                startButtonCooldown(data.id, data.time);
            }
        });

    } catch (e) { 
        console.error("Ошибка в loadTelegramTasks:", e); 
    }
}

// === ОБНОВЛЕНИЕ КЭША ЧТОБЫ НЕ СКАКАЛ БАЛАНС ===
function updateCacheAfterClaim() {
    try {
        // Берем текущий слепок из памяти
        const cachedRaw = localStorage.getItem('quests_cache_v1');
        if (cachedRaw && userData) {
            const cache = JSON.parse(cachedRaw);
            // Обновляем в нем данные пользователя (билеты и т.д.)
            // Важно: мы сохраняем весь объект userData, так как мы его уже обновили в handleDailyClaim
            cache.user = userData; 
            
            // Если нужно, обновляем и квесты (чтобы галочки не пропадали при релоаде до сети)
            if (typeof allQuests !== 'undefined') {
                cache.quests = allQuests;
            }
            
            // Записываем обратно
            localStorage.setItem('quests_cache_v1', JSON.stringify(cache));
        }
    } catch (e) {
        console.error("Ошибка сохранения кэша:", e);
    }
}
// Замени старую функцию handleDailyClaim на эту:
async function handleDailyClaim(taskKey, userId, actionUrl) {
    const btn = document.getElementById(`btn-${taskKey}`);
    const rewardAmount = btn ? btn.getAttribute('data-reward') : '';
    const originalStyle = btn ? btn.getAttribute('style') : '';
    
    const restoreBtnHtml = `
        ЗАБРАТЬ 
        <div class="btn-reward-badge">
            <span>+${rewardAmount}</span>
            <i class="fa-solid fa-ticket btn-ticket-icon"></i>
        </div>
    `;

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
            
            // Секретный код
            if (data.secret_code) {
                if(Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                const popup = document.getElementById('secret-reward-popup');
                const goProfileBtn = document.getElementById('go-to-profile-btn');
                const closeBtn = document.getElementById('close-secret-popup-btn');
                
                if (popup) {
                    popup.classList.add('visible');
                    goProfileBtn.onclick = () => { window.location.href = 'profile.html'; };
                    closeBtn.onclick = () => { popup.classList.remove('visible'); window.location.reload(); };
                } else {
                    Telegram.WebApp.showAlert("Код получен! Он в профиле.");
                    window.location.reload();
                }
                return;
            }

            // Сгорание серии
            if (data.streak_reset) {
                const stats = document.getElementById('ticketStats');
                // if(stats) stats.innerText = parseInt(stats.innerText || '0') + data.reward;
                // 🔥 Обновляем глобальные данные
                // if(userData) userData.tickets = (userData.tickets || 0) + data.reward;
                
                // 🔥 ФИКС БАЛАНСА: Сохраняем в память телефона сразу
                // if (typeof updateCacheAfterClaim === 'function') updateCacheAfterClaim();

                if (telegramTasksCache) {
                    const task = telegramTasksCache.find(t => t.task_key === taskKey);
                    if (task) {
                        task.current_day = data.day;
                        task.total_days = data.total_days;
                        task.is_completed = data.is_completed;
                        task.last_claimed_at = new Date().toISOString();
                    }
                }
                const container = dom.modalContainer;
                if (container && telegramTasksCache) renderTelegramGrid(telegramTasksCache, container);

                injectBurnedPopup(data.reward);
                return; 
            }

            // === 🔥 ОБЫЧНЫЙ УСПЕХ 🔥 ===
            
            const earned = data.reward || 0;

            // 1. Обновляем DOM (визуал)
            const stats = document.getElementById('ticketStats');
            if(stats) stats.innerText = parseInt(stats.innerText || '0') + earned;

            // 2. 🔥 ВАЖНО: Обновляем глобальную переменную userData
            // Это предотвратит "откат" цифр при следующем фоновом обновлении
            if (userData) {
                userData.tickets = (userData.tickets || 0) + earned;
            }

            // 🔥 ФИКС БАЛАНСА: Сохраняем новое состояние в LocalStorage
            // Теперь при перезагрузке скрипт сразу увидит новые билеты
            if (typeof updateCacheAfterClaim === 'function') updateCacheAfterClaim();

            // 3. Обновляем кэш задач
            if (telegramTasksCache) {
                const task = telegramTasksCache.find(t => t.task_key === taskKey);
                if (task) {
                    task.current_day = data.day;
                    task.total_days = data.total_days;
                    task.is_completed = data.is_completed;
                    task.last_claimed_at = new Date().toISOString();
                }
            }

            // 4. Перерисовываем сетку (чтобы кнопка стала серой/зеленой сразу)
            const container = dom.modalContainer;
            if (container && telegramTasksCache) {
                renderTelegramGrid(telegramTasksCache, container);
            }
            
            // 5. Показываем окно (теперь оно ПЕРЕЗАГРУЖАЕТ страницу при закрытии)
            // 🔥 ИЗМЕНЕНИЕ ЗДЕСЬ: добавлен true третьим параметром
            injectRewardPopup(earned, data.message || "Задание выполнено!", true);

        } else if (data) {
            // Ошибки
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
                 Telegram.WebApp.showAlert("Вы не подписаны на канал!");
            }
            else {
                Telegram.WebApp.showAlert(data.error || "Произошла ошибка");
            }
            
            if(btn) {
                btn.disabled = false;
                btn.innerHTML = restoreBtnHtml; 
                if (originalStyle) btn.setAttribute('style', originalStyle);
            }
        }
    } catch (e) {
        console.error(e);
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = restoreBtnHtml || "Ошибка"; 
            if (originalStyle) btn.setAttribute('style', originalStyle);
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

function injectBurnedPopup(reward) {
    const existing = document.getElementById('burnedPopup');
    if (existing) existing.remove();

    const popupHtml = `
    <div id="burnedPopup" class="popup-overlay" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.85); z-index: 99999; justify-content: center; align-items: center; backdrop-filter: blur(8px);">
      <div class="popup-content" style="background: #1c1c1e; color: #fff; padding: 25px; border-radius: 16px; text-align: center; width: 85%; max-width: 320px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); border: 1px solid rgba(255,59,48,0.3);">
        <div style="font-size: 40px; margin-bottom: 10px;">🔥</div>
        <h3 style="margin-top: 0; color: #ff3b30; font-size: 20px; margin-bottom: 10px;">Серия прервана!</h3>
        
        <p style="font-size: 14px; line-height: 1.5; color: #ddd; margin-bottom: 20px;">
            Вы пропустили день.<br>
            Ваш прогресс сброшен до <b>Дня 1</b>. Не пропускайте дни, чтобы забрать главную награду!
        </p>
        <button id="closeBurnedPopup" style="width: 100%; background: #2c2c2e; color: #fff; border: none; padding: 12px; border-radius: 10px; font-weight: bold; cursor: pointer;">Понятно</button>
      </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', popupHtml);
    if(window.Telegram && Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred('warning');
    
    document.getElementById('closeBurnedPopup').addEventListener('click', () => {
        document.getElementById('burnedPopup').remove();
        // Перезагружаем страницу, чтобы обновить дни
        window.location.reload();
    });
}

function injectBoostPopup(customUrl) {
    const urlToUse = customUrl || 'https://t.me/boost/hatelove_ttv';
    const existing = document.getElementById('boostPopup');
    if (existing) existing.remove();

    const popupHtml = `
    <div id="boostPopup" class="popup-overlay" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.85); z-index: 99999; justify-content: center; align-items: center; backdrop-filter: blur(8px);">
      <div class="popup-content" style="background: #1c1c1e; color: #fff; padding: 25px; border-radius: 16px; text-align: center; width: 85%; max-width: 320px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; align-items: center;">
        <h3 style="margin-top: 0; color: #ff4757; font-size: 20px; margin-bottom: 10px;">⚠️ Внимание!</h3>
        <p style="font-size: 14px; line-height: 1.5; color: #ddd; margin-bottom: 20px;">Голосование за канал необходимо для получения бонусов.</p>
        <button id="goToBoostBtn" style="width: 100%; background: #0088cc; color: white; border: none; padding: 12px; border-radius: 10px; margin-bottom: 15px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
           <i class="fa-solid fa-rocket"></i> Проголосовать
        </button>
        <button id="closePopupBtn" style="width: 100%; background: transparent; border: none; color: #8e8e93; padding: 10px; cursor: pointer; font-size: 15px;">Закрыть</button>
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
    // === 1. ЗАПОМИНАЕМ ТИП ПРОВЕРКИ ДЛЯ АВТО-ОБНОВЛЕНИЯ ===
    activeProfileCheck = type; 

    const existing = document.getElementById('profilePopup');
    if (existing) existing.remove();

    let titleText = '';
    let bodyHTML = ''; 
    const tgColor = '#0088cc'; 
    const tgBg = 'rgba(0, 136, 204, 0.15)'; 

    // === БЛОК ФАМИЛИИ ===
    if (type === 'surname') {
        titleText = '❌ Ник бота не найден';
        const botNick = '@HATElavka_bot';
        
        bodyHTML = `
            <div style="margin-bottom: 12px; font-size: 11px; color: #ccc;">Скопируйте ник и вставьте в поле <b>"Фамилия"</b>:</div>
            <div style="display: flex; gap: 8px; background: rgba(0,0,0,0.4); padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); align-items: center;">
                <input id="popupRefInput" type="text" readonly value="${botNick}" style="flex-grow: 1; background: transparent; border: none; color: ${tgColor}; font-weight: 600; font-size: 11px; outline: none; width: 100%;">
                <button id="popupCopyBtn" style="background: ${tgColor}; border: none; border-radius: 8px; color: #fff; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                    <i class="fa-regular fa-copy"></i>
                </button>
            </div>
        `;
        
        setTimeout(() => {
            const copyBtn = document.getElementById('popupCopyBtn');
            if(copyBtn) copyBtn.addEventListener('click', function() {
                navigator.clipboard.writeText(botNick).then(() => {
                     if(Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                     this.innerHTML = '<i class="fa-solid fa-check"></i>';
                     setTimeout(() => this.innerHTML = '<i class="fa-regular fa-copy"></i>', 2000);
                });
            });
        }, 100);

    // === БЛОК БИО (ССЫЛКА) ===
    } else {
        titleText = '❌ Ссылка не найдена';
        let refPayload = userData.telegram_id;
        if (userData && userData.bott_ref_id) refPayload = `r_${userData.bott_ref_id}`;
        else if (userData && userData.bott_internal_id) refPayload = `r_${userData.bott_internal_id}`;
        
        const fullRefLink = `https://t.me/HATElavka_bot/app?startapp=${refPayload}`;
        const displayRefLink = fullRefLink.replace('https://', '');

        bodyHTML = `
            <div style="margin-bottom: 12px; font-size: 11px; color: #ccc;">Скопируйте ссылку и вставьте в раздел <b>"О себе" (Bio)</b>:</div>
            <div style="display: flex; gap: 8px; background: rgba(0,0,0,0.4); padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); align-items: center;">
                <input id="popupRefInput" type="text" readonly value="${displayRefLink}" style="flex-grow: 1; background: transparent; border: none; color: ${tgColor}; font-weight: 600; font-size: 11px; outline: none; width: 100%;">
                <button id="popupCopyBtn" style="background: ${tgColor}; border: none; border-radius: 8px; color: #fff; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                    <i class="fa-regular fa-copy"></i>
                </button>
            </div>
        `;

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

    // Вместо сломанной кнопки делаем красивый блок с инструкцией
    const instructionHtml = `
        <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px; font-size: 13px; color: #aaa; margin-bottom: 15px; text-align: left; line-height: 1.4; border: 1px dashed #444;">
            <i class="fa-solid fa-circle-info" style="color: ${tgColor}; margin-right: 5px;"></i>
            Перейдите в <b>Настройки</b> → <b>Изменить профиль</b> и вставьте скопированный текст в нужное поле.
        </div>
    `;

    const popupHtml = `
    <div id="profilePopup" class="popup-overlay" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.85); z-index: 99999; justify-content: center; align-items: center; backdrop-filter: blur(8px);">
      <div class="popup-content" style="background: #1c1c1e; color: #fff; padding: 24px; border-radius: 16px; text-align: center; width: 85%; max-width: 340px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; align-items: center;">
        <h3 style="margin-top: 0; color: #ff4757; font-size: 20px; margin-bottom: 16px; font-weight: 700;">${titleText}</h3>
        <div style="font-size: 15px; line-height: 1.5; color: #ddd; margin-bottom: 24px; width: 100%;">${bodyHTML}</div>
        
        ${instructionHtml}

        <button id="closeProfilePopupBtn" style="width: 100%; background: transparent; border: none; color: #8e8e93; padding: 10px; cursor: pointer; font-size: 15px;">Закрыть</button>
      </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', popupHtml);
    
    // Обработчик остался только для кнопки "Закрыть", так как кнопка перехода удалена
    document.getElementById('closeProfilePopupBtn').addEventListener('click', () => {
        document.getElementById('profilePopup').remove();
        // === 2. СБРАСЫВАЕМ ТИП ПРОВЕРКИ ===
        activeProfileCheck = null; 
    });
}

// === КРАСИВОЕ ОКНО НАГРАДЫ (С ПЕРЕЗАГРУЗКОЙ) ===
function injectRewardPopup(amount, text = "Задание выполнено!", reloadOnClose = false) {
    const existing = document.getElementById('rewardPopup');
    if (existing) existing.remove();

    const popupHtml = `
    <div id="rewardPopup" class="popup-overlay" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.85); z-index: 999999; justify-content: center; align-items: center; backdrop-filter: blur(10px); animation: fadeIn 0.3s;">
      
      <div class="popup-content" style="
          background: #1c1c1e; 
          color: #fff; 
          padding: 32px 24px; 
          border-radius: 24px; 
          text-align: center; 
          width: 85%; 
          max-width: 320px; 
          border: 1px solid rgba(255, 255, 255, 0.08); 
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5); 
          transform: scale(0.9); 
          animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
      ">
        
        <div style="font-size: 54px; margin-bottom: 16px; color: #FFD700; filter: drop-shadow(0 0 25px rgba(255, 215, 0, 0.3)); animation: float 3s ease-in-out infinite;">
            <i class="fa-solid fa-ticket"></i>
        </div>
        
        <h3 style="margin: 0 0 8px; font-size: 22px; font-weight: 800; color: #fff; letter-spacing: 0.5px;">${text}</h3>
        <p style="margin: 0 0 24px; color: #8e8e93; font-size: 14px; font-weight: 500;">Награда зачислена на баланс</p>
        
        <div style="
            background: rgba(255, 215, 0, 0.1); 
            border: 1px solid rgba(255, 215, 0, 0.2); 
            border-radius: 16px; 
            padding: 12px; 
            margin-bottom: 28px;
            display: inline-block;
            min-width: 120px;
        ">
            <span style="font-size: 36px; font-weight: 900; color: #FFD700; text-shadow: 0 2px 10px rgba(255, 215, 0, 0.2);">+${amount}</span>
        </div>
        
        <button id="closeRewardBtn" style="
            width: 100%; 
            background: linear-gradient(135deg, #0088cc 0%, #005f8f 100%); 
            color: #fff; 
            border: none; 
            padding: 16px; 
            border-radius: 16px; 
            font-weight: 700; 
            font-size: 16px; 
            cursor: pointer; 
            box-shadow: 0 8px 20px rgba(0, 136, 204, 0.3); 
            transition: transform 0.1s, box-shadow 0.1s;
            text-transform: uppercase;
            letter-spacing: 1px;
        ">
            ЗАКРЫТЬ
        </button>

      </div>
    </div>
    <style>
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes popIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      @keyframes float { 0% { transform: translateY(0px) rotate(0deg); } 50% { transform: translateY(-8px) rotate(5deg); } 100% { transform: translateY(0px) rotate(0deg); } }
      #closeRewardBtn:active { transform: scale(0.96); box-shadow: 0 4px 10px rgba(0, 136, 204, 0.2); }
    </style>
    `;

    document.body.insertAdjacentHTML('beforeend', popupHtml);

    if(window.Telegram && Telegram.WebApp.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }

    document.getElementById('closeRewardBtn').addEventListener('click', () => {
        const popup = document.getElementById('rewardPopup');
        popup.style.opacity = '0';
        setTimeout(() => {
            popup.remove();
            if (reloadOnClose) {
                window.location.reload();
            } else if (typeof main === 'function') {
                main(); // Попытка обновить без перезагрузки, если reloadOnClose = false
            }
        }, 200);
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
    // === ФИКС НАЧАЛО: Логика кнопки ===
    let claimButtonHtml = '';

    if (challenge.claimed_at) {
        // Если награда уже получена — показываем заглушку, которую НЕЛЬЗЯ нажать
        claimButtonHtml = `
            <button class="claim-reward-button" disabled style="background: #2c2c2e; color: #666; cursor: default; box-shadow: none; border: 1px solid rgba(255,255,255,0.05);">
                <i class="fa-solid fa-check"></i> <span>Выполнено</span>
            </button>
        `;
    } else {
        // Если еще не забрали — показываем обычную кнопку
        claimButtonHtml = `
            <button id="claim-challenge-btn" data-challenge-id="${challenge.challenge_id}" class="claim-reward-button" ${!canClaim ? 'disabled' : ''}>
                <i class="fa-solid fa-gift"></i> <span>Забрать награду</span>
            </button>
        `;
    }
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
            ${claimButtonHtml}
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
        
        // Проверка кулдауна бесплатной отмены (24 часа)
        if (lastCancel) {
            const lastCancelDate = new Date(lastCancel);
            const now = new Date();
            const diffHours = (now - lastCancelDate) / 3600000;
            if (diffHours < 24) {
                cancelBtnDisabled = true;
                cooldownEndTime = new Date(lastCancelDate.getTime() + 24 * 60 * 60 * 1000);
            }
        }

        // Основная кнопка (Бесплатная)
        const freeCancelBtn = `<button id="cancel-quest-btn" class="cancel-quest-button" ${cancelBtnDisabled ? 'disabled' : ''}>Отменить бесплатно</button>`;
        
        // Кнопка платной отмены (Появляется ТОЛЬКО если бесплатная недоступна)
        let paidCancelBtn = '';
        if (cancelBtnDisabled) {
            // 🔥 ЦЕНА ОТМЕНЫ (5, 10, 15...)
            // В идеале сервер должен присылать userData.next_cancel_cost. 
            // Пока поставим заглушку 5, если данных нет.
            const cost = userData.next_cancel_cost || 5; 
            
            paidCancelBtn = `
                <button id="paid-cancel-quest-btn" data-cost="${cost}" class="cancel-quest-button" style="margin-top: 10px; background: rgba(255, 165, 0, 0.15); border: 1px solid rgba(255, 165, 0, 0.4); color: #ffae00;">
                    <i class="fa-solid fa-ticket"></i> Отменить за ${cost} билетов
                </button>
            `;
        }

        // Собираем кнопки в контейнер
        buttonHtml = `
            <div style="display: flex; flex-direction: column; width: 100%;">
                ${freeCancelBtn}
                ${paidCancelBtn}
            </div>
        `;

        // Запуск таймера для бесплатной кнопки
        if (cancelBtnDisabled) {
            setTimeout(() => {
                const btn = document.getElementById('cancel-quest-btn');
                const paidBtn = document.getElementById('paid-cancel-quest-btn'); // Ссылка на платную кнопку
                if (btn) {
                     startCountdown(btn, cooldownEndTime, 'quest_cancel', () => {
                        btn.disabled = false;
                        btn.textContent = 'Отменить бесплатно';
                        // Если бесплатная стала доступна, платную можно скрыть
                        if(paidBtn) paidBtn.style.display = 'none'; 
                    });
                }
            }, 0);
        }
    }

    const currentProgress = Math.min(progress, target);
    let progressTextContent = `${currentProgress} / ${target}`;
    const questType = activeQuest.quest_type || '';
    
    if (questType.includes('twitch_uptime')) progressTextContent = `${currentProgress} / ${target} мин.`;
    else if (questType.includes('twitch_messages')) progressTextContent = `💬 ${currentProgress} / ${target}`;
    else if (questType.includes('telegram_messages')) progressTextContent = `✉️ ${currentProgress} / ${target}`;
    
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
            
            // Здесь монетка 🟡 уже стоит (из прошлого шага)
            return `
                <div class="quest-card" style="display: flex; flex-direction: column;">
                    <div style="flex-grow: 1;">
                        ${iconHtml}
                        <h2 class="quest-title">${escapeHTML(quest.title || '')}</h2>
                        <p class="quest-subtitle">${escapeHTML(quest.description || '')}</p>
                        <p class="quest-subtitle">Награда: ${quest.reward_amount || ''} <i class="fa-solid fa-coins" style="color: #ffcc00;"></i></p>
                    </div>
                    <div class="manual-quest-actions">
                        ${actionLinkHtml}
                        <button class="perform-quest-button" data-id="${quest.id}" data-title="${escapeHTML(quest.title)}">${submitButtonText}</button>
                    </div>
                </div>
            `;
        }).join('');

        // !!! ИЗМЕНЕНИЕ ЗДЕСЬ: Убрали атрибут 'open' из тега <details> !!!
        // Теперь списки будут свернуты по умолчанию.
        const accordionHtml = `
            <details class="quest-category-accordion">
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
                // 🔥 ФИКС 1: Чистим кэш и перезагружаем для отображения активного челленджа
                localStorage.removeItem('quests_cache_v1');
                window.location.reload();
            }, 7000);
        }
    } catch (e) {
        dom.loaderOverlay.classList.add('hidden');
        if(getChallengeBtn) getChallengeBtn.disabled = false;
    }
}

async function openQuestSelectionModal() {
    // 1. Определяем платформу (Twitch или Telegram) на основе текущей вкладки
    const currentTheme = document.body.getAttribute('data-theme');
    const isTelegram = currentTheme === 'telegram';
    const filterPrefix = isTelegram ? 'automatic_telegram' : 'automatic_twitch';

    // 2. 🔥 Сначала фильтруем квесты (ДО открытия окна)
    const quests = allQuests
        .filter(q => q.quest_type && q.quest_type.startsWith(filterPrefix) && !q.is_completed)
        // Сортировка: от большей награды к меньшей
        .sort((a, b) => (b.reward_amount || 0) - (a.reward_amount || 0));

    // 3. 🔥 ПРОВЕРКА: Если квестов нет — просто выходим
    if (!quests || quests.length === 0) {
        console.log(`📭 Нет доступных квестов (${filterPrefix}). Меню не открываем.`);
        // Мы уже переключили вкладку в функции main, поэтому пользователь 
        // просто увидит страницу без всплывающего окна.
        return; 
    }

    // 4. Если квесты ЕСТЬ — настраиваем цвета и заголовки
    const modalTitle = isTelegram ? 'Telegram Испытания' : 'Twitch Испытания';
    const accentColor = isTelegram ? '#0088cc' : '#9146ff';
    const bgIconColor = isTelegram ? 'rgba(0, 136, 204, 0.2)' : 'rgba(145, 70, 255, 0.2)';
    const iconClass = isTelegram ? 'fa-brands fa-telegram' : 'fa-brands fa-twitch';

    // 5. Открываем окно только теперь
    openUniversalModal(modalTitle);
    
    const container = dom.modalContainer;
    container.classList.add('grid-mode'); 
    container.innerHTML = ''; 
    
    // 6. Рендерим карточки
    quests.forEach((quest, index) => {
        const el = document.createElement('div');
        el.className = `tg-grid-card anim-card anim-delay-${index % 8}`;
        
        const rewardText = userData.quest_rewards_enabled 
            ? `+${quest.reward_amount} <i class="fa-solid fa-coins" style="color: #ffcc00;"></i>`
            : `Ивент`;

        el.innerHTML = `
            <div class="tg-grid-icon" style="color: ${accentColor}; background: ${bgIconColor}; box-shadow: 0 4px 10px ${bgIconColor};">
                <i class="${iconClass}"></i>
            </div>
            
            <div class="tg-grid-title">${quest.title}</div>
            <div class="tg-grid-reward">${rewardText}</div>
            
            <button class="tg-grid-btn" style="background: ${accentColor};" id="btn-start-${quest.id}">
                Начать
            </button>
        `;

        const btn = el.querySelector(`#btn-start-${quest.id}`);
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            try {
                await makeApiRequest("/api/v1/quests/start", { quest_id: quest.id });
                closeUniversalModal();
                
                // Чистим кэш и перезагружаем страницу, чтобы сразу показать активный квест
                localStorage.removeItem('quests_cache_v1');
                window.location.reload(); 
            } catch(e) {
                Telegram.WebApp.showAlert(`Ошибка: ${e.message}`);
                btn.disabled = false;
                btn.innerText = 'Начать';
            }
        });
        
        container.appendChild(el);
    });
}

// === ФУНКЦИЯ ОТРИСОВКИ СЕТКИ (ИЗ КЭША) ===
function renderTelegramGrid(tasks, container) {
    container.innerHTML = ''; 
    
    // Сортировка: Сначала активные, выполненные вниз
    tasks.sort((a, b) => (a.is_completed === b.is_completed) ? 0 : a.is_completed ? 1 : -1);

    tasks.forEach((task, index) => {
        const el = document.createElement('div');
        // Добавляем anim-card только если карточки еще не было в DOM (опционально)
        // Но для красоты оставим анимацию всегда
        el.className = `tg-grid-card ${task.is_completed ? 'completed' : ''} anim-card anim-delay-${index % 8}`;
        
        let iconClass = 'fa-solid fa-star';
        let iconTypeClass = ''; 
        
        if (task.task_key === 'tg_surname') { iconClass = 'fa-solid fa-signature'; iconTypeClass = 'telegram'; }
        if (task.task_key === 'tg_bio') { iconClass = 'fa-solid fa-link'; iconTypeClass = 'telegram'; }
        if (task.task_key === 'tg_sub') { iconClass = 'fa-brands fa-telegram'; iconTypeClass = 'telegram'; }
        if (task.task_key === 'tg_vote') { iconClass = 'fa-solid fa-rocket'; iconTypeClass = 'rocket'; }
        
        if (task.is_completed) {
            iconClass = 'fa-solid fa-check';
            iconTypeClass = 'check';
        }

        let buttonHtml = '';
        let progressHtml = '';
        const userId = Telegram.WebApp.initDataUnsafe?.user?.id;

        if (task.is_completed) {
            buttonHtml = `<button class="tg-grid-btn" disabled>Готово</button>`;
        } else {
            if (task.is_daily || task.task_key === 'tg_sub' || task.task_key === 'tg_vote') {
                const rewardText = task.is_daily ? `~${Math.round(task.reward_amount / task.total_days)}` : task.reward_amount;
                let onClickAction = `handleDailyClaim('${task.task_key}', ${userId}, '${task.action_url || ''}')`;
                
                buttonHtml = `
                    <button class="tg-grid-btn" id="btn-${task.task_key}" onclick="${onClickAction}">
                        Забрать (+${rewardText} <i class="fa-solid fa-coins"></i>)
                    </button>
                `;

                if (task.is_daily) {
                    let segments = '';
                    for (let i = 1; i <= task.total_days; i++) {
                        const filled = i <= task.current_day ? 'filled' : '';
                        segments += `<div class="tg-grid-segment ${filled}" id="seg-${task.task_key}-${i}"></div>`;
                    }
                    progressHtml = `<div class="tg-grid-progress">${segments}</div>`;
                }
            } else {
                buttonHtml = `
                    <button class="tg-grid-btn" id="btn-${task.task_key}" onclick="handleTgTaskClick('${task.task_key}', '${task.action_url}')">
                        +${task.reward_amount} <i class="fa-solid fa-coins"></i>
                    </button>
                `;
            }
        }
        
        let iconOnClick = '';
        if (task.action_url && !task.is_completed) {
            iconOnClick = `onclick="Telegram.WebApp.openTelegramLink('${task.action_url}')"`;
        }

        el.innerHTML = `
            <div class="tg-grid-icon ${iconTypeClass}" ${iconOnClick}>
                <i class="${iconClass}"></i>
            </div>
            <div class="tg-grid-title">${task.title}</div>
            <div class="tg-grid-reward">+${task.reward_amount} <i class="fa-solid fa-coins" style="color: #ffcc00;"></i></div>
            ${buttonHtml}
            ${progressHtml}
        `;
        
        container.appendChild(el);

        // Таймер
        if (task.is_daily && task.last_claimed_at && !task.is_completed) {
            const last = new Date(task.last_claimed_at).getTime();
            const now = new Date().getTime();
            if (now - last < 20 * 3600 * 1000) {
                startButtonCooldown(`btn-${task.task_key}`, task.last_claimed_at);
            }
        }
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

// ==========================================
// ГЛОБАЛЬНАЯ НАВИГАЦИЯ, СВАЙПЫ И КНОПКА "НАЗАД"
// ==========================================

// Умное переключение вкладок (не срабатывает, если мы уже на ней)
function safeSwitchTab(platform) {
    const currentTheme = document.body.getAttribute('data-theme');
    if (currentTheme === platform) return; // ЗАЩИТА: Если уже тут, игнорируем свайп/клик

    const switchEl = document.getElementById(`view-${platform}`);
    if (switchEl) switchEl.checked = true;
    setPlatformTheme(platform);
}

// Обработчик системной кнопки "Назад"
function handleGlobalBack() {
    let closedAny = false;

    // 1. Проверяем динамические попапы (Ошибки, Безопасно, Буст и тд)
    const injectedPopups = document.querySelectorAll('.popup-overlay');
    injectedPopups.forEach(p => {
        if (p.style.opacity !== '0' && p.style.display !== 'none') {
            p.remove();
            closedAny = true;
        }
    });

    // 2. Проверяем красивое окно с гридом (Telegram/Twitch Испытания)
    if (dom.modalOverlay && dom.modalOverlay.classList.contains('active')) {
        closeUniversalModal();
        closedAny = true;
    }

    // 3. Проверяем статические модалки
    const staticModals = [
        dom.promptOverlay, dom.infoModalOverlay, dom.scheduleModal, 
        dom.rewardClaimedOverlay, dom.ticketsClaimedOverlay
    ];
    staticModals.forEach(m => {
        if (m && !m.classList.contains('hidden')) {
            m.classList.add('hidden');
            closedAny = true;
        }
    });

    // Если мы закрыли хоть одно окно — остаемся на странице
    if (closedAny) return;

    // Если окон нет — возвращаемся в меню
    if (window.history.length > 1 && document.referrer) {
        window.history.back();
    } else {
        window.location.href = '/menu';
    }
}

// Настройка жестов (Свайпы)
function setupGestures() {
    let touchStartX = 0;
    let touchStartY = 0;
    const SWIPE_THRESHOLD = 80; // Минимальная длина свайпа

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;

        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        // Если открыто какое-либо окно — блокируем свайпы
        if (document.querySelector('.popup-overlay, .prompt-overlay:not(.hidden), .active')) {
            return; 
        }

        // ГОРИЗОНТАЛЬНЫЕ СВАЙПЫ
        if (Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX < -SWIPE_THRESHOLD) {
                // Свайп ВЛЕВО (<-) -> Twitch
                safeSwitchTab('twitch');
            } else if (diffX > SWIPE_THRESHOLD) {
                // Свайп ВПРАВО (->) -> Telegram
                safeSwitchTab('telegram');
            }
        } 
        // ВЕРТИКАЛЬНЫЕ СВАЙПЫ
        else if (Math.abs(diffY) > Math.abs(diffX)) {
            // Свайп ВНИЗ (v) -> Ручная проверка
            // Важное условие: срабатывает только если страница находится в самом верху, 
            // чтобы не мешать обычному чтению списка (скроллу вниз)
            if (diffY > SWIPE_THRESHOLD && dom.mainContent.scrollTop <= 10) {
                safeSwitchTab('manual');
            }
        }
    }, { passive: true });
}

function initUnifiedSwitcher() {
    const radios = document.querySelectorAll('input[name="view"]');
    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                const view = e.target.value;
                
                // 🔥 МЫ БОЛЬШЕ НИЧЕГО НЕ СОХРАНЯЕМ ПРИ КЛИКЕ
                // (Сохранение происходит только при нажатии кнопки "Отменить" в другой функции)

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
    // 🔥 ЭКСТРЕННАЯ ОЧИСТКА: Удаляем "вечную" память, чтобы починить баг
    localStorage.removeItem('last_active_tab'); 

    // 1. Проверка окружения Telegram
    if (window.Telegram && !Telegram.WebApp.initData) {
        if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
        return; 
    }

    // === БЛОК 1: МГНОВЕННЫЙ РЕНДЕР ИЗ КЭША (Stale-While-Revalidate) ===
    const cachedRaw = localStorage.getItem('quests_cache_v1');
    let isRenderedFromCache = false;

    if (cachedRaw) {
        try {
            const cachedData = JSON.parse(cachedRaw);
            if (cachedData && cachedData.user) {
                console.log("🚀 Restoring from cache...");
                
                // Применяем данные из кэша
                userData = cachedData.user;
                allQuests = cachedData.quests || [];
                
                // Обновляем UI
                dom.fullName.textContent = userData.full_name || "Гость";
                if (document.getElementById('ticketStats')) {
                    document.getElementById('ticketStats').textContent = userData.tickets || 0;
                }

                // Кнопка промокодов
                if (dom.fullName.parentNode && !document.getElementById('promo-btn-inject')) {
                    const btn = document.createElement('a');
                    btn.id = 'promo-btn-inject';
                    btn.href = 'profile.html';
                    btn.className = 'promo-profile-btn'; 
                    // Иконку убираем стилями, оставляем текст для читалки
                    btn.innerHTML = 'Промокоды'; 
                    dom.fullName.insertAdjacentElement('afterend', btn);
                }

                // Инициализация переключателя и темы
                initUnifiedSwitcher();
                
                // === ЛОГИКА ВОЗВРАТА ПОСЛЕ ОТМЕНЫ ===
                const tempTab = localStorage.getItem('temp_return_tab');
                let defaultView;

                if (tempTab) {
                    defaultView = tempTab;
                    localStorage.removeItem('temp_return_tab');
                } else {
                    defaultView = userData.is_stream_online ? 'twitch' : 'telegram';
                }
                // =====================================

                const switchEl = document.getElementById(`view-${defaultView}`);
                if (switchEl) {
                    switchEl.checked = true;
                    setPlatformTheme(defaultView);
                    dom.sectionAuto.classList.remove('hidden');
                    dom.sectionManual.classList.add('hidden');
                }

                // 🔥 ИСПРАВЛЕНИЕ БАГА С ОТВАЛОМ TWITCH (КЭШ) 🔥
                const isTwitchLinkedCache = !!(userData.twitch_id || userData.twitch_login || userData.twitch_access_token);
                if (userData.challenge) renderChallenge(userData.challenge, !isTwitchLinkedCache);
                else renderChallenge({ cooldown_until: userData.challenge_cooldown_until }, !isTwitchLinkedCache);
                
                // Скрываем загрузчик СРАЗУ, так как контент уже есть
                if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
                dom.mainContent.style.opacity = 1;
                isRenderedFromCache = true;
            }
        } catch (e) {
            console.error("Cache parsing error", e);
        }
    }

    // Если кэша нет, показываем загрузку
    if (!isRenderedFromCache && dom.loaderOverlay) {
        dom.loaderOverlay.classList.remove('hidden');
        updateLoading(10);
    }
    
    // === БЛОК 2: ЗАГРУЗКА СВЕЖИХ ДАННЫХ (Сеть) ===
    try {
        let bootstrapData;
        
        // Проверяем предзагрузку из HTML (window.bootstrapPromise)
        if (window.bootstrapPromise) {
            try {
                bootstrapData = await window.bootstrapPromise;
            } catch (e) {
                console.warn("Предзагрузка не удалась, пробуем снова...", e);
                bootstrapData = await makeApiRequest("/api/v1/bootstrap", {}, 'POST', true);
            }
        } else {
            // Обычный запрос, если предзагрузки нет
            bootstrapData = await makeApiRequest("/api/v1/bootstrap", {}, 'POST', true);
        }
        
        updateLoading(50);

        if (bootstrapData) {
            // === СОХРАНЯЕМ В КЭШ ===
            localStorage.setItem('quests_cache_v1', JSON.stringify(bootstrapData));

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
                    btn.innerHTML = 'Промокоды';
                    dom.fullName.insertAdjacentElement('afterend', btn);
                }
            }

            // Переинициализация с новыми данными
            initUnifiedSwitcher(); 

            let defaultView = userData.is_stream_online ? 'twitch' : 'telegram';
            
            // Если рендерили из кэша, проверяем текущий выбор пользователя
            if (isRenderedFromCache) {
                 const currentChecked = document.querySelector('input[name="view"]:checked');
                 if (currentChecked) defaultView = currentChecked.value;
            } else {
                 const switchEl = document.getElementById(`view-${defaultView}`);
                 if (switchEl) switchEl.checked = true;
            }
            
            setPlatformTheme(defaultView);
            
            // Логика отображения секций
            if (defaultView === 'manual') {
                 dom.sectionAuto.classList.add('hidden');
                 dom.sectionManual.classList.remove('hidden');
            } else {
                 dom.sectionAuto.classList.remove('hidden');
                 dom.sectionManual.classList.add('hidden');
            }

            // 🔥 ИСПРАВЛЕНИЕ БАГА С ОТВАЛОМ TWITCH (СЕТЬ) 🔥
            const isTwitchLinkedNet = !!(userData.twitch_id || userData.twitch_login || userData.twitch_access_token);
            if (userData.challenge) renderChallenge(userData.challenge, !isTwitchLinkedNet);
            else renderChallenge({ cooldown_until: userData.challenge_cooldown_until }, !isTwitchLinkedNet);

            updateLoading(70);
            
            try {
                // Загружаем ручные квесты
                const manualQuests = await makeApiRequest("/api/v1/quests/manual", {}, 'POST', true);
                renderManualQuests(manualQuests);
            } catch (e) {
                const fallbackQuests = allQuests.filter(q => q.quest_type === 'manual_check');
                renderManualQuests(fallbackQuests);
            }
        }

        // === ДОБАВЛЯЕМ ЧТЕНИЕ ПАРАМЕТРОВ URL ===
        const urlParams = new URLSearchParams(window.location.search);
        const viewCommand = urlParams.get('view');
        const openCommand = urlParams.get('open');
        
        // 1. Сначала проверяем, есть ли активный квест (ПРАВИЛО 3)
        if (userData.active_quest_id) {
            const activeQuest = allQuests.find(q => q.id === userData.active_quest_id);
            
            // Определяем, где этот квест выполняется
            if (activeQuest && activeQuest.quest_type && activeQuest.quest_type.includes('twitch')) {
                safeSwitchTab('twitch');
            } else {
                safeSwitchTab('telegram');
            }
            
            console.log("✅ Квест активен. Просто открываем вкладку прогресса.");
            
            const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
        } 
        // 2. Если активного квеста НЕТ, обрабатываем команды открытия (ПРАВИЛА 1 и 2)
        else {
            if (viewCommand) {
                 safeSwitchTab(viewCommand);
            }
            else if (openCommand === 'roulette' || openCommand === 'twitch_only') {
                const isOnline = userData.is_stream_online === true;
                
                if (isOnline) {
                    safeSwitchTab('twitch');
                    setTimeout(() => openQuestSelectionModal(), 400);
                } 
                else {
                    safeSwitchTab('telegram');
                    setTimeout(() => openQuestSelectionModal(), 400);
                }

                const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
            }
        }

        // Скрываем лоадер
        if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
        dom.mainContent.style.opacity = 1;

    } catch (e) {
        console.error("Ошибка в main:", e);
        if (!isRenderedFromCache) {
            Telegram.WebApp.showAlert("Ошибка загрузки. Обновите страницу.");
        }
        if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
    }
}

        // =========================================================================
        // 👇👇👇 ВАЖНАЯ ДОБАВКА: ПЕРЕКЛЮЧЕНИЕ НА TWITCH ПО КНОПКЕ "ИСПЫТАНИЕ" 👇👇👇
        // =========================================================================
        // =========================================================================
    // ВНУТРИ main() УДАЛИ ЭТИ СТРОКИ:
    // Функция для безопасного переключения вкладки
    const safeSwitchTab = (platform) => {
        const switchEl = document.getElementById(`view-${platform}`);
        if (switchEl) {
            switchEl.checked = true;
            // setPlatformTheme определена выше в твоем коде
            if (typeof setPlatformTheme === 'function') setPlatformTheme(platform);
        }
    };
    // === ДОБАВЛЯЕМ ЧТЕНИЕ ПАРАМЕТРОВ URL ===
    const urlParams = new URLSearchParams(window.location.search);
    const viewCommand = urlParams.get('view');
    const openCommand = urlParams.get('open');
    // ========================================
    // 1. Сначала проверяем, есть ли активный квест (ПРАВИЛО 3)
    if (userData.active_quest_id) {
        // Если квест уже взят, мы ИГНОРИРУЕМ команду открытия меню выбора (openCommand)
        // и просто переключаем на нужную вкладку.
        
        const activeQuest = allQuests.find(q => q.id === userData.active_quest_id);
        
        // Определяем, где этот квест выполняется (Twitch или Telegram)
        if (activeQuest && activeQuest.quest_type && activeQuest.quest_type.includes('twitch')) {
            safeSwitchTab('twitch');
        } else {
            safeSwitchTab('telegram');
        }
        
        console.log("✅ Квест активен. Просто открываем вкладку прогресса.");
        
        // Очищаем URL, чтобы при обновлении не срабатывали триггеры
        const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    } 
    // 2. Если активного квеста НЕТ, обрабатываем команды открытия (ПРАВИЛА 1 и 2)
    else {
        // Если пришли с параметром ?view=... (из menu.js для уже взятых квестов, но тут страховка)
        if (viewCommand) {
             safeSwitchTab(viewCommand);
        }
        
        // Если пришли с командой открыть меню (?open=roulette или ?open=twitch_only)
        else if (openCommand === 'roulette' || openCommand === 'twitch_only') {
            
            const isOnline = userData.is_stream_online === true;
            
            // ПРАВИЛО 2: Стрим ЕСТЬ -> Twitch
            if (isOnline) {
                safeSwitchTab('twitch');
                console.log("🌊 Стрим онлайн -> Открываем Twitch выбор");
                setTimeout(() => openQuestSelectionModal(), 400);
            } 
            // ПРАВИЛО 1: Стрима НЕТ -> Telegram
            else {
                safeSwitchTab('telegram');
                console.log("zzz Стрим оффлайн -> Открываем TG выбор");
                setTimeout(() => openQuestSelectionModal(), 400);
            }

            // Очищаем URL
            const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
        }
    }
    // =========================================================================

    // Скрываем лоадер
    if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
    dom.mainContent.style.opacity = 1;

    // 👇👇👇 ВОТ ЭТОГО НЕ ХВАТАЛО (ЗАКРЫВАЕМ БЛОК TRY) 👇👇👇
    } catch (e) {
        console.error("Ошибка в main:", e);
        // Показываем ошибку пользователю, только если нет кэша (чтобы не пугать зря)
        if (!isRenderedFromCache) {
            Telegram.WebApp.showAlert("Ошибка загрузки. Обновите страницу.");
        }
        if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
    }
} // <--- Конец функции main

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
    // 2. Авто-проверка профиля при возврате
    // --- СОБЫТИЯ ---
function setupEventListeners() {
    // === НОВОЕ: Включаем кнопку Назад и свайпы ===
    if (window.Telegram && Telegram.WebApp.BackButton) {
        Telegram.WebApp.BackButton.show();
        Telegram.WebApp.BackButton.offClick(handleGlobalBack); // Очистка дублей
        Telegram.WebApp.BackButton.onClick(handleGlobalBack);
    }
    setupGestures();
    // ==============================================
    // 1. Вибрация в футере
    const footer = document.querySelector('.app-footer');
    if (footer) {
        footer.addEventListener('click', (e) => {
            if (e.target.closest('.footer-item')) {
                try { Telegram.WebApp.HapticFeedback.impactOccurred('medium'); } catch (err) {}
            }
        });
    }

    // 2. Авто-проверка профиля при возврате
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && activeProfileCheck) {
            console.log("🔄 Пользователь вернулся, проверяем:", activeProfileCheck);
            const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
            if (!userId) return;

            const taskKey = activeProfileCheck === 'surname' ? 'tg_surname' : 'tg_bio';
            await new Promise(r => setTimeout(r, 1500));

            try {
                const data = await makeApiRequest('/api/v1/telegram/claim_daily', { 
                    user_id: userId, 
                    task_key: taskKey 
                }, 'POST', true);
                
                if (data && data.success) {
                    const popup = document.getElementById('profilePopup');
                    if (popup) popup.remove();
                    activeProfileCheck = null;

                    // 🔥 ИЗМЕНЕНИЕ ЗДЕСЬ: Добавили true, чтобы страница перезагрузилась при закрытии
                    injectRewardPopup(data.reward || 0, "Профиль подтвержден!", true);

                    // Обновляем галочку в списке (фоном)
                    if (telegramTasksCache) {
                        const task = telegramTasksCache.find(t => t.task_key === taskKey);
                        if (task) {
                            task.is_completed = true;
                            if (data.day) task.current_day = data.day;
                        }
                    }

                    // Обновляем сетку (фоном)
                    const container = dom.modalContainer;
                    if (container && telegramTasksCache) {
                        renderTelegramGrid(telegramTasksCache, container);
                    }
                    
                    // Обновляем счетчик билетов (фоном)
                    const stats = document.getElementById('ticketStats');
                    if(stats && data.reward) stats.innerText = parseInt(stats.innerText || '0') + data.reward;
                } else {
                    console.log("Проверка не прошла, ждем следующей попытки...");
                }
            } catch (e) {
                console.error("Ошибка авто-проверки:", e);
            }
        }
    });

    // 3. Аккордеон
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

    // 4. Модальные окна (Prompts, Rewards, Info, Schedule)
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

    // 5. Кнопка выбора квестов
    if (dom.questChooseBtn) {
        dom.questChooseBtn.addEventListener("click", () => {
            if (dom.questChooseContainer.classList.contains('hidden')) {
                openQuestSelectionModal();
            } else {
                hideQuestRoulette();
            }
        });
    }
    
    // 6. ГЛАВНЫЙ ОБРАБОТЧИК КНОПОК (ИСПРАВЛЕННЫЙ)
    document.body.addEventListener('click', async (event) => {
        const target = event.target.closest('button');
        if (!target) return;

        // -- Рулетка --
        if (target.id === 'get-challenge-btn') {
            await startChallengeRoulette();

        // -- Забрать награду (Челлендж) --
        } else if (target.id === 'claim-challenge-btn') {
            target.disabled = true;
            target.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            
            if(userData.challenge) {
                userData.challenge.claimed_at = new Date().toISOString(); 
            }
            
            try {
                const challengeId = target.dataset.challengeId; 
                const result = await makeApiRequest(`/api/v1/challenges/${challengeId}/claim`, {}, 'POST');
                
                if (result.success) {
                    target.innerHTML = '<i class="fa-solid fa-check"></i> <span>Выполнено</span>';
                    target.style.background = '#2c2c2e';
                    target.style.color = '#666';
                    target.style.boxShadow = 'none';

                    if (result.promocode) {
                        dom.rewardClaimedOverlay.classList.remove('hidden'); 
                    } else {
                        await main();
                    }
                } else {
                    Telegram.WebApp.showAlert(result.message || "Не удалось забрать награду");
                    target.disabled = false;
                    target.style.background = ''; 
                    target.style.color = '';
                    target.innerHTML = '<i class="fa-solid fa-gift"></i> <span>Забрать награду</span>';
                    if(userData.challenge) delete userData.challenge.claimed_at;
                }
            } catch (e) {
                target.disabled = false;
                target.innerHTML = '<i class="fa-solid fa-gift"></i> <span>Забрать награду</span>';
                if(userData.challenge) delete userData.challenge.claimed_at;
            }

        // -- Забрать награду (Квест) --
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

        // -- Выполнить (Ручной квест) --
        } else if (target.classList.contains('perform-quest-button') && target.dataset.id) {
            currentQuestId = target.dataset.id;
            dom.promptTitle.textContent = target.dataset.title;
            dom.promptInput.value = '';
            dom.promptOverlay.classList.remove('hidden');
            dom.promptInput.focus();

        // -- Завершить истекшие (Челлендж или Квест) --
        } else if (target.id === 'check-challenge-progress-btn' || target.id === 'complete-expired-quest-btn') {
            target.disabled = true;
            target.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            
            // 1. ЗАПОМИНАЕМ ТЕКУЩУЮ ВКЛАДКУ
            const currentTab = document.querySelector('input[name="view"]:checked')?.value || 'twitch';
            localStorage.setItem('temp_return_tab', currentTab);

            // 2. Чистим кэш
            localStorage.removeItem('quests_cache_v1');

            try {
                if (target.id === 'check-challenge-progress-btn') await makeApiRequest("/api/v1/user/challenge/close_expired");
                else await makeApiRequest('/api/v1/quests/close_expired');
                
                // 3. Перезагружаем страницу
                window.location.reload();
            } catch (e) {
                console.error(e);
                window.location.reload();
            }

        // -- Отмена квеста --
        } else if (target.id === 'cancel-quest-btn') {
            event.preventDefault();
            Telegram.WebApp.showConfirm("Вы уверены, что хотите отменить это задание? Отменять задания можно лишь раз в сутки.", async (ok) => {
                if (ok) {
                    try {
                        const btn = document.getElementById('cancel-quest-btn');
                        if(btn) { btn.disabled = true; btn.innerText = '...'; }

                        await makeApiRequest('/api/v1/quests/cancel');
                        Telegram.WebApp.showAlert('Задание отменено.');

                        const currentTab = document.querySelector('input[name="view"]:checked')?.value || 'twitch';
                        localStorage.setItem('temp_return_tab', currentTab);
                        localStorage.removeItem('quests_cache_v1');
                        window.location.reload();
                    } catch (e) {
                        window.location.reload();
                    }
                }
            });
        // 7. 🔥 ОТМЕНА КВЕСТА ЗА БИЛЕТЫ (НОВОЕ) 🔥
        } else if (target.id === 'paid-cancel-quest-btn') {
            event.preventDefault();
            
            const cost = parseInt(target.dataset.cost || 5);
            const currentTickets = parseInt(userData.tickets || 0);

            // А. Если билетов не хватает — показываем красивое окно
            if (currentTickets < cost) {
                if(Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred('error');
                
                // 🔥 Исправленное красивое окно с иконкой
                openUniversalModal('Не хватает билетов', `
                    <div style="text-align:center; padding: 20px; display: flex; flex-direction: column; align-items: center;">
                        <div style="font-size: 50px; margin-bottom: 15px; animation: shake 0.5s; color: #ff4757; filter: drop-shadow(0 0 10px rgba(255, 71, 87, 0.3));">
                            <i class="fa-solid fa-ticket"></i>
                        </div>
                        <p style="font-size: 16px; color: #fff; margin-bottom: 8px; font-weight: 600;">
                            Баланс: <span style="color:#FFD700">${currentTickets}</span> <i class="fa-solid fa-ticket" style="font-size:12px"></i> / Нужно: <span style="color:#ff4757">${cost}</span>
                        </p>
                        <p style="font-size: 13px; color: #8e8e93; line-height: 1.5; margin-bottom: 20px;">
                            Выполняй задания или приглашай друзей, чтобы заработать больше!
                        </p>
                        <button onclick="closeUniversalModal()" style="
                            width: 100%; padding: 14px; border-radius: 14px; 
                            background: rgba(255, 255, 255, 0.1); color: #fff; border: 1px solid rgba(255,255,255,0.1); font-weight: 600; font-size: 15px; cursor: pointer;
                        ">Понятно</button>
                    </div>
                    <style>
                        @keyframes shake { 0% { transform: translateX(0); } 25% { transform: translateX(-5px); } 50% { transform: translateX(5px); } 75% { transform: translateX(-5px); } 100% { transform: translateX(0); } }
                    </style>
                `);
                return;
            }

            // Б. Если билетов хватает — подтверждаем и списываем
            Telegram.WebApp.showConfirm(`Списать ${cost} билетов за отмену задания?`, async (ok) => {
                if (ok) {
                    target.disabled = true;
                    target.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                    
                    try {
                        // Эндпоинт для платной отмены (нужно будет добавить на бэке)
                        await makeApiRequest('/api/v1/quests/cancel_paid'); 
                        
                        Telegram.WebApp.showAlert(`Задание отменено! Списано ${cost} билетов.`);
                        
                        const currentTab = document.querySelector('input[name="view"]:checked')?.value || 'twitch';
                        localStorage.setItem('temp_return_tab', currentTab);
                        localStorage.removeItem('quests_cache_v1');
                        window.location.reload();
                    } catch (e) {
                        target.disabled = false;
                        target.innerHTML = `<i class="fa-solid fa-ticket"></i> Отменить за ${cost} билетов`;
                        Telegram.WebApp.showAlert(e.message || "Ошибка при отмене");
                    }
                }
            });
        }
    }); // Конец обработчика кнопок
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
