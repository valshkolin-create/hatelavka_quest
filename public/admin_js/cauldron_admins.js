// ==========================================
// ФАЙЛ: admin_js/cauldron_admins.js
// ==========================================

window.availableManualQuests = [];

window.getCurrentLevel = function(eventData) {
    const { goals = {}, current_progress = 0 } = eventData;
    if (goals.level_3 > 0 && current_progress >= goals.level_3) return 4;
    if (goals.level_2 > 0 && current_progress >= goals.level_2) return 3;
    if (goals.level_1 > 0 && current_progress >= goals.level_1) return 2;
    return 1;
};

window.createTopRewardRow = function(reward = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'top-reward-row admin-form'; 
    wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px dashed #444; position: relative;';
    
    const place = reward.place || '';
    const name = reward.name || '';
    const image = reward.image_url || '';
    const wear = reward.wear || '';     
    const rarity = reward.rarity || ''; 

    wrapper.innerHTML = `
        <div style="display:flex; gap:8px; width: 100%; align-items: center;">
            <input type="text" class="reward-place reward-place-input" placeholder="Места (1, 2-5, 6+)" value="${escapeHTML(place.toString())}" style="width: 120px;">
            <input type="text" class="reward-name" placeholder="Название предмета" value="${escapeHTML(name)}">
            <div class="reward-actions-group">
                <input type="checkbox" class="reward-select-checkbox" title="Выбрать">
                <button type="button" class="admin-action-btn reject remove-reward-btn">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </div>
        <div style="display:flex; gap:8px; width: 100%;">
            <input type="text" class="reward-image" placeholder="URL картинки" value="${escapeHTML(image)}" style="flex: 1;">
            <select class="reward-wear" style="flex: 1;">
                ${typeof generateOptionsHtml === 'function' ? generateOptionsHtml(WEAR_OPTIONS, wear) : ''}
            </select>
            <select class="reward-rarity" style="flex: 1;">
                ${typeof generateOptionsHtml === 'function' ? generateOptionsHtml(RARITY_OPTIONS, rarity) : ''}
            </select>
        </div>
    `;
    
    wrapper.querySelector('.remove-reward-btn').addEventListener('click', () => {
        wrapper.remove();
        if (typeof window.checkCopyVisibility === 'function') window.checkCopyVisibility();
    });
    
    wrapper.querySelector('.reward-select-checkbox').addEventListener('change', () => {
        if (typeof window.checkCopyVisibility === 'function') window.checkCopyVisibility();
    });

    return wrapper;
};

window.collectCauldronData = function() {
    const startDateInput = getValue('start_date');
    const endDateInput = getValue('end_date');

    const content = {
        title: getValue('title'),
        start_date: startDateInput ? new Date(startDateInput).toISOString() : null,
        end_date: endDateInput ? new Date(endDateInput).toISOString() : null,
        current_theme: typeof currentCauldronData !== 'undefined' ? (currentCauldronData.current_theme || 'halloween') : 'halloween',
        is_visible_to_users: document.querySelector('[name="is_visible_to_users"]')?.checked || false,
        goals: {
            level_1: parseInt(getValue('goal_level_1'), 10) || 0,
            level_2: parseInt(getValue('goal_level_2'), 10) || 0,
            level_3: parseInt(getValue('goal_level_3'), 10) || 0,
            level_4: parseInt(getValue('goal_level_4'), 10) || 0,
        },
        banner_image_url: getValue('banner_image_url'),
        cauldron_image_url_1: getValue('cauldron_image_url_1'),
        cauldron_image_url_2: getValue('cauldron_image_url_2'),
        cauldron_image_url_3: getValue('cauldron_image_url_3'),
        cauldron_image_url_4: getValue('cauldron_image_url_4'),
        levels: {}
    };

    [1, 2, 3, 4].forEach(level => {
        const levelKey = `level_${level}`;
        const topPlaces = [];
        const container = document.getElementById(`top-rewards-container-${level}`);
        
        if (container) {
            container.querySelectorAll('.top-reward-row').forEach(row => {
                const place = row.querySelector('.reward-place').value.trim(); 
                const name = row.querySelector('.reward-name').value.trim();
                const image_url = row.querySelector('.reward-image').value.trim();
                const wear = row.querySelector('.reward-wear').value;
                const rarity = row.querySelector('.reward-rarity').value;

                if (place && name) { 
                    topPlaces.push({ place, name, image_url, wear, rarity });
                }
            });
        }
        content.levels[levelKey] = { top_places: topPlaces, tiers: {} };
    });

    return content;
};

window.renderCauldronParticipants = async function() {
    const container = document.getElementById('cauldron-distribution-list');
    if (!container) return;
    
    const scrollPos = container.scrollTop;
    container.innerHTML = '<p style="text-align: center;">Загрузка участников и проверка подписок...</p>';
    
    try {
        const participants = await makeApiRequest('/api/v1/admin/events/cauldron/participants', {}, 'POST', true);
        
        if (!participants || participants.length === 0) {
            container.innerHTML = '<p style="text-align: center;">Участников пока нет.</p>';
            return;
        }

        participants.sort((a, b) => {
            const contributionDiff = (b.total_contribution || 0) - (a.total_contribution || 0);
            if (contributionDiff !== 0) return contributionDiff;
            return (a.full_name || '').localeCompare(b.full_name || '');
        });

        let activeRewardLevel = null;
        if (typeof currentCauldronData !== 'undefined' && currentCauldronData.levels) {
            const currentLevel = window.getCurrentLevel(currentCauldronData);
            activeRewardLevel = currentCauldronData.levels[`level_${currentLevel}`];
        }

        let html = `
            <div class="distribution-header compact-header">
                <span style="width:30px; text-align:center;">#</span>
                <span style="flex:1;">Участник</span>
                <span style="width:60px; text-align:center;">Вклад</span>
                <span style="flex:1.5;">Награда</span>
                <span style="width:40px; text-align:center;">Трейд</span>
                <span style="width:40px; text-align:center;">Статус</span>
            </div>
            <div class="participants-scroll-list">
        `;

        html += participants.map((p, index) => {
            const place = index + 1;
            let prize = null;

            if (activeRewardLevel) {
                const allRewards = activeRewardLevel.top_places || [];
                for (let r of allRewards) {
                    const pStr = String(r.place).trim();
                    if (pStr.includes('+')) {
                        const min = parseInt(pStr);
                        if (place >= min) prize = r;
                    } else if (pStr.includes('-')) {
                        const parts = pStr.split('-');
                        if (place >= parseInt(parts[0]) && place <= parseInt(parts[1])) prize = r;
                    } else {
                        if (place === parseInt(pStr)) prize = r;
                    }
                    if (prize) break;
                }
            }

            const prizeHtml = prize && prize.name
                ? `<div class="dist-prize compact">
                       <img src="${escapeHTML(prize.image_url || '')}" onerror="this.style.display='none'">
                       <span title="${escapeHTML(prize.name)}">${escapeHTML(prize.name)}</span>
                   </div>`
                : '<span class="no-prize">-</span>';

            const isSent = p.is_reward_sent || false;
            const statusBtn = `
                <button class="status-toggle-btn ${isSent ? 'sent' : 'pending'}" 
                        data-user-id="${p.user_id}" 
                        data-current-status="${isSent}"
                        onclick="window.toggleRewardStatus(this, event)">
                    <i class="fa-solid ${isSent ? 'fa-check' : 'fa-clock'}"></i>
                </button>
            `;

            const tradeLink = p.trade_link && p.trade_link.startsWith('http')
                ? `<a href="${escapeHTML(p.trade_link)}" target="_blank" class="compact-link"><i class="fa-solid fa-link"></i></a>`
                : `<span class="compact-no-link"><i class="fa-solid fa-link-slash"></i></span>`;

            const isSubscribed = p.is_subscribed !== false; 
            const nameStyle = !isSubscribed ? 'color: var(--danger-color); font-weight: bold;' : '';
            const subIcon = !isSubscribed 
                ? '<i class="fa-solid fa-user-slash" title="Не подписан на канал!" style="color: var(--danger-color); margin-left: 6px; font-size: 11px; flex-shrink: 0;"></i>' 
                : '';

            return `
                <div class="distribution-row compact-row ${isSent ? 'row-sent' : ''}">
                    <span class="dist-place">${place}</span>
                    <div class="dist-name-wrapper">
                        <div style="display: flex; align-items: center; width: 100%;">
                            <span class="dist-name" style="${nameStyle} flex: 0 1 auto;" title="${escapeHTML(p.full_name)}">
                                ${escapeHTML(p.full_name || 'No Name')}
                            </span>
                            ${subIcon}
                        </div>
                        ${p.twitch_login ? `<span class="dist-twitch"><i class="fa-brands fa-twitch"></i> ${escapeHTML(p.twitch_login)}</span>` : ''}
                    </div>
                    <span class="dist-amount">${p.total_contribution}</span>
                    ${prizeHtml}
                    <span class="dist-link-wrapper">${tradeLink}</span>
                    <div class="dist-status-wrapper">${statusBtn}</div>
                </div>`;
        }).join('');

        html += `</div>`;
        container.innerHTML = html;
        container.scrollTop = scrollPos;

    } catch (e) {
        container.innerHTML = `<p class="error-message">Ошибка: ${e.message}</p>`;
    }
};

window.initEventControls = async function() {
    const visibleToggle = document.getElementById('toggle-event-visible');
    const pausedToggle = document.getElementById('toggle-event-paused');
    if (!visibleToggle || !pausedToggle) return;

    try {
        const data = await makeApiRequest('/api/admin/event/status', {}, 'GET', true);
        visibleToggle.checked = data.visible;
        pausedToggle.checked = data.paused;
    } catch (err) {
        console.error('Ошибка получения статуса ивента:', err);
    }

    const updateStatus = async () => {
        const payload = { visible: visibleToggle.checked, paused: pausedToggle.checked };
        try {
            await makeApiRequest('/api/admin/event/status', payload, 'POST', true);
            if (window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
        } catch (e) {
            tg.showAlert('Ошибка сохранения настроек: ' + e.message);
        }
    };

    visibleToggle.addEventListener('change', updateStatus);
    pausedToggle.addEventListener('change', updateStatus);
};

window.showFloatingSaveBtn = function() {
    const floatBtn = document.getElementById('floating-save-cauldron-btn');
    if (floatBtn) {
        floatBtn.style.transform = 'translateX(-50%) translateY(0)';
        floatBtn.style.opacity = '1';
        floatBtn.style.pointerEvents = 'auto';
    }
};

window.hideFloatingSaveBtn = function() {
    const floatBtn = document.getElementById('floating-save-cauldron-btn');
    if (floatBtn) {
        floatBtn.style.transform = 'translateX(-50%) translateY(100px)';
        floatBtn.style.opacity = '0';
        floatBtn.style.pointerEvents = 'none';
    }
};

window.addQuestTaskRow = function(questId = '', pointsReward = '') {
    const list = document.getElementById('manual-tasks-list');
    if (!list) return;
    
    const row = document.createElement('div');
    row.className = 'manual-task-row';
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    
    let optionsHtml = '<option value="">Выберите задание...</option>';
    if (window.availableManualQuests) {
        window.availableManualQuests.forEach(q => {
            const selected = (q.id == questId) ? 'selected' : '';
            optionsHtml += `<option value="${q.id}" ${selected}>${q.title}</option>`;
        });
    }

    row.innerHTML = `
        <select class="task-quest-id" style="flex: 2; min-width: 0; padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.3); color: white; outline: none; font-size: 13px;">
            ${optionsHtml}
        </select>
        <input type="number" class="task-points" placeholder="Очки" value="${pointsReward}" style="flex: 1; min-width: 60px; padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.3); color: white; font-size: 13px;">
        <button type="button" onclick="this.parentElement.remove(); if(window.showFloatingSaveBtn) window.showFloatingSaveBtn();" style="background: #ff453a; color: white; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer; font-weight: bold; flex-shrink: 0;">X</button>
    `;
    list.appendChild(row);
};

window.getManualTasksConfig = function() {
    const rows = document.querySelectorAll('.manual-task-row');
    const config = [];
    rows.forEach(row => {
        const selectEl = row.querySelector('.task-quest-id');
        const qId = parseInt(selectEl.value);
        const points = parseInt(row.querySelector('.task-points').value);
        
        let titleName = '';
        if (selectEl.selectedIndex >= 0) {
            titleName = selectEl.options[selectEl.selectedIndex].text;
        }

        if (!isNaN(qId) && !isNaN(points) && points > 0) {
            config.push({ quest_id: qId, points: points, title: titleName });
        }
    });
    return config;
};

window.checkCopyVisibility = function() {
    const checked = document.querySelectorAll('.reward-select-checkbox:checked');
    const panel = document.getElementById('bulk-actions-panel');
    const countSpan = document.getElementById('bulk-selected-count');
    
    if (panel) {
        if (checked.length > 0) {
            panel.classList.add('active');
            if (countSpan) countSpan.textContent = checked.length;
        } else {
            panel.classList.remove('active');
        }
    }
};

window.toggleSelectAllRewards = function() {
    const allRows = document.querySelectorAll('.top-reward-row');
    const visibleRows = Array.from(allRows).filter(row => row.offsetParent !== null);
    if (visibleRows.length === 0) return;

    const checkboxes = visibleRows.map(row => row.querySelector('.reward-select-checkbox')).filter(cb => cb);
    if (checkboxes.length === 0) return;

    const allSelected = checkboxes.every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allSelected);
    window.checkCopyVisibility();
};

window.transferSelectedRewards = function() {
    const checked = document.querySelectorAll('.reward-select-checkbox:checked');
    if (checked.length === 0) return;

    const targetLevel = prompt("Введите номер уровня (1, 2, 3...):");
    if (!targetLevel) return;

    const targetContainer = document.getElementById(`top-rewards-container-${targetLevel}`);
    if (!targetContainer) {
        tg.showAlert(`Ошибка: Контейнер уровня ${targetLevel} не найден.`);
        return;
    }

    let count = 0;
    checked.forEach(checkbox => {
        const row = checkbox.closest('.top-reward-row');
        if (row) {
            const data = {
                place: '', 
                name: row.querySelector('.reward-name').value,
                image_url: row.querySelector('.reward-image').value,
                wear: row.querySelector('.reward-wear')?.value || '',
                rarity: row.querySelector('.reward-rarity')?.value || ''
            };
            const newRow = window.createTopRewardRow(data);
            targetContainer.appendChild(newRow);
            checkbox.checked = false;
            count++;
        }
    });

    window.checkCopyVisibility();
    
    const targetTabBtn = document.querySelector(`.tab-button[data-tab="cauldron-rewards-${targetLevel}"]`);
    if (targetTabBtn) targetTabBtn.click();
    
    tg.showPopup({ message: `Перенесено: ${count} шт.` });
    setTimeout(() => targetContainer.lastElementChild?.scrollIntoView({ behavior: 'smooth' }), 300);
};

window.toggleRewardStatus = async function(btn, event) {
    if (event) event.stopPropagation();

    const userId = btn.dataset.userId;
    const currentStatus = btn.dataset.currentStatus === 'true';
    const newStatus = !currentStatus;

    const icon = btn.querySelector('i');
    const originalIconClass = icon.className;
    icon.className = 'fa-solid fa-spinner fa-spin';
    btn.disabled = true;

    try {
        await makeApiRequest('/api/v1/admin/events/cauldron/reward_status', {
            user_id: parseInt(userId),
            is_sent: newStatus
        });

        btn.dataset.currentStatus = newStatus;
        btn.classList.toggle('sent', newStatus);
        btn.classList.toggle('pending', !newStatus);
        btn.innerHTML = `<i class="fa-solid ${newStatus ? 'fa-check' : 'fa-clock'}"></i>`;
        
        const row = btn.closest('.distribution-row');
        if (row) row.classList.toggle('row-sent', newStatus);

    } catch (e) {
        console.error("Ошибка смены статуса:", e);
        tg.showAlert('Не удалось изменить статус. Проверьте консоль.');
        icon.className = originalIconClass;
    } finally {
        btn.disabled = false;
    }
};

// Экспорт всех слушателей
window.setupCauldronEventListeners = async function() {
    window.initEventControls();

    // Предзагрузка квестов для ручного режима
    try {
        const quests = await makeApiRequest('/api/v1/quests/list', {}, 'POST', true);
        if (Array.isArray(quests)) {
            window.availableManualQuests = quests.filter(q => q.quest_type === 'manual_check' && q.is_active);
        }
    } catch (e) {
        console.error("Ошибка загрузки заданий для котла:", e);
    }

    // Слушатели плавающей кнопки
    const cauldronFormEl = document.getElementById('cauldron-settings-form');
    const controlPanelEl = document.querySelector('.event-control-panel');
    if (cauldronFormEl) {
        cauldronFormEl.addEventListener('input', window.showFloatingSaveBtn);
        cauldronFormEl.addEventListener('change', window.showFloatingSaveBtn);
    }
    if (controlPanelEl) {
        controlPanelEl.addEventListener('input', window.showFloatingSaveBtn);
        controlPanelEl.addEventListener('change', window.showFloatingSaveBtn);
    }

    // Тумблер ручных заданий
    const manualModeToggle = document.getElementById('toggle-manual-tasks');
    const manualTasksContainer = document.getElementById('manual-tasks-container');
    if (manualModeToggle && manualTasksContainer) {
        manualModeToggle.addEventListener('change', (e) => {
            manualTasksContainer.style.display = e.target.checked ? 'block' : 'none';
        });
    }

    // Основная форма Котла
    if (cauldronFormEl) {
        const saveBtn = cauldronFormEl.querySelector('button[type="submit"]') || cauldronFormEl.querySelector('.approve');
        if (saveBtn) {
            const oldPanel = document.getElementById('bulk-actions-panel');
            if (oldPanel) oldPanel.remove();

            const panel = document.createElement('div');
            panel.id = 'bulk-actions-panel';
            panel.innerHTML = `
                <div class="bulk-info">Выбрано: <span id="bulk-selected-count" class="bulk-count-badge">0</span></div>
                <div class="bulk-controls">
                    <button type="button" class="btn-text-action" id="btn-select-all"><i class="fa-solid fa-check-double"></i> Все</button>
                    <button type="button" class="btn-primary-action" id="btn-transfer-action"><i class="fa-solid fa-share"></i> Перенести</button>
                </div>
            `;
            const parent = saveBtn.closest('.admin-action-btn')?.parentElement || saveBtn.parentElement;
            parent.insertBefore(panel, saveBtn.closest('.admin-action-btn') || saveBtn);

            document.getElementById('btn-transfer-action').addEventListener('click', window.transferSelectedRewards);
            document.getElementById('btn-select-all').addEventListener('click', window.toggleSelectAllRewards);
        }

        cauldronFormEl.addEventListener('submit', async (e) => {
            e.preventDefault();
            tg.showConfirm('Сохранить все настройки для ивента "Котел"?', async (ok) => {
                if (ok) {
                    try {
                        const eventData = window.collectCauldronData();
                        eventData.is_visible_to_users = document.getElementById('toggle-event-visible')?.checked || false;
                        eventData.is_manual_tasks_only = document.getElementById('toggle-manual-tasks')?.checked || false;
                        eventData.is_paused = document.getElementById('toggle-event-paused')?.checked || false;
                        eventData.manual_tasks_config = window.getManualTasksConfig();

                        let currentProgress = 0;
                        try {
                            const currentStatus = await makeApiRequest('/api/v1/events/cauldron/status', {}, 'GET', true);
                            currentProgress = currentStatus.current_progress || 0;
                        } catch(err) {}
                        eventData.current_progress = currentProgress;

                        await makeApiRequest('/api/v1/admin/cauldron/update', { content: eventData });
                        tg.showAlert('Настройки ивента "Котел" успешно сохранены!');
                        window.hideFloatingSaveBtn();
                    } catch (error) {
                        tg.showAlert(`Ошибка сохранения: ${error.message}`);
                    }
                }
            });
        });
    }

    // Сброс котла
    const resetCauldronBtn = document.getElementById('reset-cauldron-btn');
    if (resetCauldronBtn) {
        resetCauldronBtn.addEventListener('click', () => {
            tg.showConfirm('Вы уверены, что хотите полностью сбросить весь прогресс и удалить всех участников ивента "Котел"? Это действие необратимо.', async (ok) => {
                if (ok) {
                    await makeApiRequest('/api/v1/admin/events/cauldron/reset');
                    tg.showAlert('Прогресс ивента "Котел" был полностью сброшен.');
                    if (typeof switchView === 'function') await switchView('view-admin-cauldron');
                }
            });
        });
    }

    // Вкладки котла
    const cauldronTabs = document.getElementById('cauldron-tabs');
    if (cauldronTabs) {
        cauldronTabs.addEventListener('click', (e) => {
            const button = e.target.closest('.tab-button');
            if (button && button.dataset.tab === 'cauldron-distribution') {
                window.renderCauldronParticipants();
            }
        });
    }
    
    // Удаление триггеров
    const cauldronTriggersContainer = document.getElementById('cauldron-triggers-container');
    if (cauldronTriggersContainer) {
        cauldronTriggersContainer.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.remove-trigger-btn');
            if (removeBtn) removeBtn.closest('.cauldron-trigger-row').remove();
        });
    }
};
