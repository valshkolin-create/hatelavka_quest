// ==========================================
// ФАЙЛ: admin_js/pending_actions_admins.js
// ==========================================

window.loadPendingActions = async function() {
    try {
        const [groupedSubmissions, allEventPrizes, allCheckpointPrizes] = await Promise.all([
            makeApiRequest('/api/v1/admin/pending_actions', {}, 'POST', true),
            makeApiRequest('/api/v1/admin/events/winners/details', {}, 'POST', true),
            makeApiRequest('/api/v1/admin/checkpoint_rewards/details', {}, 'POST', true)
        ]);

        const filteredSubmissions = (groupedSubmissions || []).filter(item => item.quest_id !== null && item.quest_id !== undefined);

        const updateTabText = (tabSelector, hasData) => {
            const tab = document.querySelector(tabSelector);
            if (!tab) return;
            const baseText = tab.dataset.baseText || tab.textContent.trim().replace(/<i.*<\/i>/, '').trim(); 
            if (!tab.dataset.baseText) tab.dataset.baseText = baseText;

            if (hasData) {
                tab.innerHTML = `<i class="${baseText === 'Розыгрыши' ? 'fa-solid fa-trophy' : 'fa-solid fa-flag-checkered'}"></i> ${baseText} <i class="fa-solid fa-circle-exclamation" style="font-size: 0.9em; margin-left: 5px; color: var(--danger-color);"></i>`;
            } else {
                tab.innerHTML = `<i class="${baseText === 'Розыгрыши' ? 'fa-solid fa-trophy' : 'fa-solid fa-flag-checkered'}"></i> ${baseText}`;
            }
        };
        
        updateTabText('#view-admin-pending-actions .tab-button[data-tab="event-prizes"]', allEventPrizes?.length > 0);
        updateTabText('#view-admin-pending-actions .tab-button[data-tab="checkpoint-prizes"]', allCheckpointPrizes?.length > 0);

        // 1. Отрисовываем сетку внутри самой вкладки "Заявки"
        window.renderGroupedItemsGrid('tab-content-submissions', filteredSubmissions);
        
        // 2. 🔥 ПЕРЕДАЕМ ВСЕ ТРИ МАССИВА для тотального подсчета
        window.updateBadgesOnMainGrid(filteredSubmissions, allEventPrizes, allCheckpointPrizes);

        const eventPrizesContainer = document.getElementById('tab-content-event-prizes');
        if (eventPrizesContainer) window.renderWinners(allEventPrizes, eventPrizesContainer);

        const checkpointPrizesContainer = document.getElementById('tab-content-checkpoint-prizes');
        if (checkpointPrizesContainer) window.renderCheckpointPrizes(allCheckpointPrizes, checkpointPrizesContainer);
    
    } catch (e) {
        console.error("Не удалось загрузить ожидающие действия:", e);
    }
};

// 🔥 Обновленная функция, которая видит ВСЕ типы уведомлений
window.updateBadgesOnMainGrid = function(groupedSubmissions, allEventPrizes, allCheckpointPrizes) {
    const mainGridButtons = document.querySelectorAll('#tab-content-main .admin-icon-button, #tab-content-main .folder-contents .admin-icon-button');
    
    if (mainGridButtons.length === 0) return;

    // Сначала удаляем все старые бейджи
    mainGridButtons.forEach(btn => {
        const existingBadge = btn.querySelector('.notification-badge');
        if (existingBadge) existingBadge.remove();
    });

    // Считаем количество для всех разделов
    const totalSubmissions = (groupedSubmissions || []).reduce((acc, item) => acc + (item.pending_count || 0), 0);
    const totalEvents = (allEventPrizes || []).length;
    const totalCheckpoints = (allCheckpointPrizes || []).length;
    
    // Общая сумма всех уведомлений для глобальной кнопки
    const totalAll = totalSubmissions + totalEvents + totalCheckpoints;

    if (totalAll === 0) return; // Нет уведомлений вообще - выходим

    // Перебираем кнопки и вешаем цифры
    mainGridButtons.forEach(btn => {
        const titleSpan = btn.querySelector('span');
        if (!titleSpan) return;
        
        const btnTitle = titleSpan.innerText.trim().toLowerCase();
        let badgeCount = 0;

        // 1. ГЛОБАЛЬНЫЕ КНОПКИ (ищем по ключевым словам)
        if (btnTitle.includes('заявк') || btnTitle.includes('проверк') || btnTitle.includes('ожидают')) {
            badgeCount = totalAll; // Общая кнопка показывает сумму всех событий
        } else if (btnTitle.includes('розыгрыш') || btnTitle.includes('приз')) {
            badgeCount = totalEvents;
        } else if (btnTitle.includes('чекпоинт')) {
            badgeCount = totalCheckpoints;
        } 
        // 2. ЛОКАЛЬНЫЕ ЯРЛЫКИ КОНКРЕТНЫХ ЗАДАНИЙ (если ты вынес их на раб. стол)
        else {
            const match = (groupedSubmissions || []).find(sub => 
                (sub.quest_title && sub.quest_title.trim().toLowerCase() === btnTitle) || 
                (sub.title && sub.title.trim().toLowerCase() === btnTitle)
            );
            if (match) {
                badgeCount = match.pending_count || 0;
            }
        }

        // Вешаем кружочек, если насчитали больше 0
        if (badgeCount > 0) {
            const iconWrapper = btn.querySelector('.icon-wrapper');
            if (iconWrapper) {
                const badge = document.createElement('span');
                badge.className = 'notification-badge';
                badge.textContent = badgeCount;
                iconWrapper.appendChild(badge);
            }
        }
    });
};

window.renderGroupedItemsGrid = function(containerId, groupedData) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const grid = container.querySelector('.pending-actions-grid');
    if (!grid) {
        container.innerHTML = '<p class="error-message">Ошибка отображения: не найден grid.</p>'; 
        return;
    }

    grid.innerHTML = ''; 

    if (!groupedData || groupedData.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Здесь пока пусто.</p>';
        return;
    }

    groupedData.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'admin-icon-button'; 

        if (item.quest_id) { 
            itemDiv.dataset.type = 'submission';
            itemDiv.dataset.questId = item.quest_id;
            itemDiv.dataset.title = item.quest_title || 'Задание'; 
        } else { 
            itemDiv.dataset.type = item.type; 
            itemDiv.dataset.title = item.title || 'Призы'; 
        }

        const iconHtml = item.quest_icon_url
            ? `<img src="${escapeHTML(item.quest_icon_url)}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: cover;" alt="">`
            : `<i class="${escapeHTML(item.icon_class || 'fa-solid fa-question-circle')}"></i>`; 

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

        itemDiv.addEventListener('click', window.handleGridItemClick);
        grid.appendChild(itemDiv);
    });
};

window.handleGridItemClick = async function(event) {
    const itemDiv = event.currentTarget;
    const type = itemDiv.dataset.type;
    const questId = itemDiv.dataset.questId; 
    const title = itemDiv.dataset.title || 'Детали'; 

    if(typeof showLoader === 'function') showLoader();
    try {
        let detailedData = [];
        let renderFunction = null;

        if (type === 'submission' && questId) {
            detailedData = await makeApiRequest(`/api/v1/admin/pending_actions/quest/${questId}`);
            renderFunction = window.renderSubmissions; 
        } else if (type === 'event_prizes') {
            detailedData = await makeApiRequest('/api/v1/admin/events/winners/details'); 
            renderFunction = window.renderWinners; 
        } else if (type === 'checkpoint_prizes') {
            detailedData = await makeApiRequest('/api/v1/admin/checkpoint_rewards/details'); 
            renderFunction = window.renderCheckpointPrizes; 
        } else if (type === 'advent_prizes') {
            detailedData = await makeApiRequest('/api/v1/admin/advent/pending_list', {}, 'POST', true);
            renderFunction = window.renderCheckpointPrizes; 
        } else {
            throw new Error(`Неизвестный тип элемента: ${type}`);
        }

        if (renderFunction) {
            const modalBody = document.getElementById('modal-body');
            const modalTitle = document.getElementById('modal-title');
            const submissionsModal = document.getElementById('submissions-modal');

            if (modalBody) {
                submissionsModal.dataset.sourceType = type;
                submissionsModal.dataset.sourceId = questId || 'default'; 
                
                renderFunction(detailedData, modalBody); 
                if (modalTitle) modalTitle.textContent = title; 
                if (submissionsModal) submissionsModal.classList.remove('hidden'); 
            } else {
                tg.showAlert("Ошибка отображения деталей.");
            }
        } else {
            tg.showAlert("Не удалось определить, как отобразить детали.");
        }

    } catch (e) {
        console.error("Ошибка при загрузке деталей:", e);
        tg.showAlert(`Не удалось загрузить детали: ${e.message}`);
    } finally {
        if(typeof hideLoader === 'function') hideLoader();
    }
};

window.renderSubmissions = function(submissions, targetElement) {
    if (!targetElement) return;
    targetElement.innerHTML = ''; 

    if (!submissions || submissions.length === 0) {
        targetElement.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Нет заданий на проверку.</p>';
        return;
    }

    submissions.forEach(action => {
        let submissionContentHtml = ''; 
        const submittedData = action.submitted_data || '';
        const isUrl = submittedData.startsWith('http://') || submittedData.startsWith('https');

        if (isUrl) {
            submissionContentHtml = `<a href="${escapeHTML(submittedData)}" target="_blank" rel="noopener noreferrer" style="color: var(--action-color); text-decoration: underline; word-break: break-all;">${escapeHTML(submittedData)}</a>`;
        } else {
            submissionContentHtml = `<span>${escapeHTML(submittedData)}</span>`;
        }

        const actionLinkHtml = (action.quest_action_url && action.quest_action_url !== "")
            ? `<a href="${escapeHTML(action.quest_action_url)}" target="_blank" rel="noopener noreferrer" class="action-link-btn">Перейти</a>`
            : '';

        const isWizebotQuest = (action.title || "").toLowerCase().includes("сообщен");

        const questTitle = action.quest_title || action.title || 'Ручное задание'; 
        const questDescription = action.quest_description || 'Описание отсутствует.';
        const rewardAmount = action.reward_amount || '?';
        const userFullName = action.user_full_name || 'Неизвестный';
        const userUsername = action.username || ''; 

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
};

window.renderCheckpointPrizes = function(prizes, targetElement) { 
    if (!targetElement) return; 
    targetElement.innerHTML = ''; 

    if (!prizes || prizes.length === 0) {
        targetElement.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Нет наград из Чекпоинта.</p>';
        return;
    }

    prizes.forEach(action => {
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
        targetElement.innerHTML += cardHtml;
    });
};

window.renderWinners = function(winners, targetElement) { 
    if (!targetElement) return; 
    targetElement.innerHTML = ''; 

    if (!winners || winners.length === 0) {
        targetElement.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Нет победителей для отображения.</p>';
        return;
    }

    winners.forEach(winner => {
        const hasValidTradeLink = winner.trade_link && winner.trade_link !== 'Не указана' && winner.trade_link.startsWith('http');
        const tradeLinkHref = hasValidTradeLink ? escapeHTML(winner.trade_link) : '#'; 

        const confirmationHtml = winner.prize_sent_confirmed
            ? '<p style="text-align:center; color: var(--status-active-color); font-weight: 600;">✅ Приз выдан</p>'
            : `<button class="admin-action-btn confirm confirm-winner-prize-btn" data-event-id="${escapeHTML(winner.event_id)}">Подтвердить выдачу</button>`;

        const cardHtml = `
            <div class="quest-card admin-submission-card" id="winner-card-${escapeHTML(winner.event_id)}">
                <h3 class="quest-title">${escapeHTML(winner.prize_title || 'Без названия')}</h3>
                <p>Победитель: <strong>${escapeHTML(winner.winner_name || 'Неизвестно')}</strong></p>
                <p>Трейд-ссылка: ${hasValidTradeLink ? `<a href="${tradeLinkHref}" target="_blank" style="color: var(--action-color);">Открыть</a>` : '<span style="color:var(--warning-color);">Не указана</span>'}</p>
                <div class="submission-actions">
                    ${confirmationHtml}
                </div>
            </div>`;
        targetElement.innerHTML += cardHtml;
    });
};

window.renderSubmissionsInModal = function(submissions, questTitle) {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    if(!modalTitle || !modalBody) return;
    
    modalTitle.textContent = `Заявки: ${questTitle}`;
    modalBody.innerHTML = (!submissions || submissions.length === 0) ? '<p style="text-align: center;">Для этого квеста нет заявок.</p>' :
        submissions.map(sub => `
        <div class="submission-item">
            <p><strong>${sub.user_full_name || 'Неизвестный пользователь'}</strong> <span class="submission-status-badge status-${sub.status}">${sub.status === 'pending' ? 'Ожидает' : 'Одобрена'}</span></p>
            <p><small>${new Date(sub.created_at).toLocaleString('ru-RU')}</small></p>
        </div>`).join('');
};

window.setupPendingActionsEventListeners = function() {
    // 1. Кнопка перезагрузки списка
    const reloadPendingBtn = document.getElementById('reload-pending-actions-btn');
    if (reloadPendingBtn) {
        reloadPendingBtn.addEventListener('click', async () => {
            if(typeof showLoader === 'function') showLoader(); 
            await window.loadPendingActions(); 
            if(typeof hideLoader === 'function') hideLoader(); 
        });
    }

    // 2. Делегирование кликов для карточек заявок и призов
    document.body.addEventListener('click', async (event) => {
        const target = event.target;

        // --- ПОДТВЕРЖДЕНИЕ ВЫДАЧИ ПРИЗА (ПОБЕДИТЕЛЬ) ---
        const confirmWinnerBtn = target.closest('.confirm-winner-prize-btn');
        if (confirmWinnerBtn) {
            if(typeof showCustomConfirmHTML !== 'function') return;
            showCustomConfirmHTML('Выдать приз и закрыть заявку?', () => {
                confirmWinnerBtn.closest('.admin-submission-card').remove();
                makeApiRequest('/api/v1/admin/events/confirm_sent', { event_id: parseInt(confirmWinnerBtn.dataset.eventId) }, 'POST', true)
                    .then(() => tg.showPopup({ message: '✅ Приз выдан' }))
                    .catch(e => tg.showAlert(`Ошибка: ${e.message}`));
            }, 'Подтвердить', '#34c759');
            return;
        }

        // --- ПРОСМОТР ЗАЯВОК (ВНУТРИ СПИСКА КВЕСТОВ) ---
        const viewSubsBtn = target.closest('.admin-view-subs-btn');
        if (viewSubsBtn) {
            const id = viewSubsBtn.dataset.id;
            if(typeof showLoader === 'function') showLoader();
            const submissions = await makeApiRequest('/api/v1/admin/quest/submissions', { quest_id: parseInt(id) }, 'POST', true);
            if(typeof hideLoader === 'function') hideLoader();
            
            window.renderSubmissionsInModal(submissions, viewSubsBtn.dataset.title);
            document.getElementById('submissions-modal')?.classList.remove('hidden');
            return;
        }

    });
};

// Запускаем загрузку бейджей сразу при старте приложения
document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.loadPendingActions === 'function') {
        // Вызываем без лоадера, чтобы фоновая загрузка не стопила интерфейс
        window.loadPendingActions(); 
    }
});
