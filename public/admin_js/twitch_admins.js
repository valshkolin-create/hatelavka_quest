// ==========================================
// ФАЙЛ: admin_js/twitch_admins.js 
// ==========================================

async function loadTwitchRewards() {
    const container = document.getElementById('twitch-rewards-container');
    container.innerHTML = '';
    try {
        const rewards = await makeApiRequest('/api/v1/admin/twitch_rewards/list', {}, 'GET', true); 
        
        if (!Array.isArray(rewards) || rewards.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Наград пока нет. Они создадутся автоматически, когда пользователь купит первую награду за баллы на Twitch.</p>';
            return;
        }

        rewards.forEach((reward, index) => {
            if (index === 9) {
                const dividerHtml = `
                <div class="quest-card" style="
                    grid-column: 1 / -1;
                    background-color: transparent; 
                    padding: 20px 5px 10px; 
                    backdrop-filter: none; 
                    box-shadow: none;
                    border-radius: 0;">
                    
                    <h3 style="
                        margin: 0; 
                        font-size: 14px; 
                        color: var(--text-color-muted); 
                        text-align: left; 
                        border-bottom: 1px solid var(--divider-glass-color); 
                        padding-bottom: 8px;
                        width: 100%;">
                        
                        <i class="fa-solid fa-box-archive" style="margin-right: 8px;"></i>
                        Дополнительные / Архивные
                    </h3>
                </div>`;
                container.insertAdjacentHTML('beforeend', dividerHtml);
            }

            const itemDiv = document.createElement('div');
            itemDiv.className = 'admin-icon-button';
            itemDiv.dataset.rewardId = reward.id;

            const pendingCount = reward.pending_count || 0;
            const badgeHtml = pendingCount > 0
                ? `<span class="notification-badge">${pendingCount}</span>`
                : '';
            
            const iconUrl = reward.icon_url || 'https://static-cdn.jtvnw.net/custom-reward-images/default-4.png';
            const adminDisplayStyle = hasAdminAccess ? 'block' : 'none';

            itemDiv.innerHTML = `
                <div class="icon-wrapper">
                    <a href="#" class="reward-purchases-link" data-reward-id="${reward.id}" data-reward-title="${escapeHTML(reward.title)}">
                        <img src="${escapeHTML(iconUrl)}" alt="reward">
                    </a>
                    
                    <button class="reward-shortcut-btn reward-settings-btn" data-reward='${JSON.stringify(reward)}'>
                        <i class="fa-solid fa-gear"></i>
                    </button>
                    
                    ${badgeHtml}
                    
                </div>
                <span>${escapeHTML(reward.title)}</span>
            `;
            container.appendChild(itemDiv);
        });
    } catch (e) {
        console.error('Ошибка загрузки Twitch наград:', e);
        container.innerHTML = `<p style="text-align: center; color: var(--danger-color);">Ошибка загрузки наград: ${e.message}</p>`;
    }
}

function openTwitchRewardSettings(reward) {
    const modal = document.getElementById('twitch-reward-settings-modal');
    const form = document.getElementById('twitch-reward-settings-form');
    document.getElementById('twitch-settings-title').textContent = `Настройки: ${reward.title}`;

    form.elements['reward_id'].value = reward.id;
    form.elements['is_active'].checked = reward.is_active;
    form.elements['notify_admin'].checked = reward.notify_admin;
    form.elements['show_user_input'].checked = reward.show_user_input;
    
    // Добавлены поля для Steam
    if (form.elements['auto_steam']) form.elements['auto_steam'].checked = reward.auto_steam || false;
    if (form.elements['steam_item_name']) form.elements['steam_item_name'].value = reward.steam_item_name || "";
    if (form.elements['steam_item_count']) form.elements['steam_item_count'].value = reward.steam_item_count || 1;

    const steamWrapper = document.getElementById('steam-automation-wrapper');
    if (steamWrapper) {
    const rewardType = reward.reward_type || 'promocode';
    steamWrapper.style.display = (hasAdminAccess && rewardType === 'steam') ? 'block' : 'none';
}
    
    const legacyWrapper = document.getElementById('legacy-promocode-field-wrapper');
    const adminWrapper = modal.querySelector('.admin-feature-6971'); 
    
    if (hasAdminAccess) {
        legacyWrapper.style.display = 'none';
        adminWrapper.style.display = 'block';
        
        const rewardType = reward.reward_type || 'promocode';
        form.elements['reward_type'].value = rewardType;
        form.elements['reward_amount'].value = reward.reward_amount ?? (reward.promocode_amount ?? 10); 
        
        const rewardAmountInput = document.getElementById('reward-amount-input');
        const rewardAmountLabel = rewardAmountInput ? rewardAmountInput.previousElementSibling : null; 
        const isNone = rewardType === 'none';

        if (rewardAmountInput) {
            rewardAmountInput.required = !isNone;
            rewardAmountInput.style.display = isNone ? 'none' : 'block';
        }
        if (rewardAmountLabel && rewardAmountLabel.tagName === 'LABEL') {
            rewardAmountLabel.style.display = isNone ? 'none' : 'block';
        }

        form.elements['promocode_amount'].required = false;
        form.elements['sort_order'].value = reward.sort_order ?? '';
        
    } else {
        legacyWrapper.style.display = 'block';
        adminWrapper.style.display = 'none';
        
        form.elements['promocode_amount'].value = reward.promocode_amount ?? (reward.reward_amount ?? 10);
        form.elements['promocode_amount'].required = true;
        if (form.elements['reward_amount']) {
            form.elements['reward_amount'].required = false;
        }
    }

    form.elements['condition_type'].value = reward.condition_type || "";
    form.elements['target_value'].value = reward.target_value || "";

    modal.classList.remove('hidden');
}

async function openTwitchPurchases(rewardId, rewardTitle) {
    const modal = document.getElementById('twitch-purchases-modal');
    const body = document.getElementById('twitch-purchases-body');
    const titleEl = document.getElementById('twitch-purchases-title');
    const headerEl = titleEl.parentElement;
    const refreshBtn = document.getElementById('refresh-purchases-btn');

    refreshBtn.dataset.rewardId = rewardId;
    refreshBtn.dataset.rewardTitle = rewardTitle;

    let deleteAllBtn = headerEl.querySelector('#delete-all-purchases-btn');
    if (!deleteAllBtn) {
        deleteAllBtn = document.createElement('button');
        deleteAllBtn.id = 'delete-all-purchases-btn';
        deleteAllBtn.className = 'admin-action-btn reject';
        deleteAllBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Удалить все';
        headerEl.insertBefore(deleteAllBtn, refreshBtn);
    }
    deleteAllBtn.dataset.rewardId = rewardId;
    deleteAllBtn.disabled = false; 

    let massSteamBtn = headerEl.querySelector('#mass-steam-btn');
    if (!massSteamBtn) {
        massSteamBtn = document.createElement('button');
        massSteamBtn.id = 'mass-steam-btn';
        massSteamBtn.className = 'admin-action-btn';
        // Прячем по умолчанию и задаем аккуратный Steam-дизайн
        massSteamBtn.style.cssText = 'background: #171a21; color: #fff; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px 12px; font-size: 13px; display: none; align-items: center; gap: 6px;';
        massSteamBtn.innerHTML = '<i class="fa-brands fa-steam"></i> Масс. выдача';
        headerEl.insertBefore(massSteamBtn, deleteAllBtn);
    }
    massSteamBtn.dataset.rewardId = rewardId;

    titleEl.textContent = `Покупки: ${rewardTitle}`;
    body.innerHTML = '<i>Загрузка покупок...</i>';
    modal.classList.remove('hidden');

    const makeLinksClickable = (text) => {
        if (!text || typeof text !== 'string') return '';
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
    };

    try {
        const data = await makeApiRequest(`/api/v1/admin/twitch_rewards/${rewardId}/purchases`, {}, 'GET', true);
        let { purchases, reward_settings } = data;

        // ВСТАВЛЯЕМ СЮДА: Назначаем data-атрибуты только когда данные уже получены
        if (massSteamBtn && reward_settings) {
            massSteamBtn.dataset.itemName = reward_settings.steam_item_name || "";
            massSteamBtn.dataset.itemCount = reward_settings.steam_item_count || 1;
        }

        if (!purchases || purchases.length === 0) {
            body.innerHTML = '<p style="text-align: center;">Нет покупок для этой награды.</p>';
            deleteAllBtn.classList.add('hidden');
            return;
        }
        deleteAllBtn.classList.remove('hidden');

        const rewardType = (reward_settings && reward_settings.reward_type) ? reward_settings.reward_type : 'promocode';
        
        // Показываем кнопку масс-выдачи только для Steam наград
        if (massSteamBtn) {
            massSteamBtn.style.display = (rewardType === 'steam') ? 'inline-flex' : 'none';
        }

        const rewardAmount = reward_settings.reward_amount ?? (reward_settings.promocode_amount ?? 0);
        const targetValue = reward_settings.target_value || 0;
        const conditionType = reward_settings.condition_type || '';

        body.innerHTML = purchases.map(p => {
            const date = new Date(p.created_at).toLocaleString('ru-RU');

            let progressHtml = '';
            let warningHtml = '';
            let isConditionMet = true;

            if (targetValue > 0 && conditionType) {
                const base_column_name = CONDITION_TO_COLUMN[conditionType]; 
                const snapshot_key = 'snapshot_' + (base_column_name || '').replace('_message_count', '_messages').replace('_uptime_minutes', '_uptime');
                
                const snapshot_progress = p[snapshot_key] || 0;
                isConditionMet = snapshot_progress >= targetValue;

                const progressClass = isConditionMet ? 'progress-good' : 'progress-bad';
                
                progressHtml = `
                    <p class="purchase-progress ${progressClass}">
                        Прогресс (на момент покупки): <strong>${snapshot_progress} / ${targetValue}</strong>
                    </p>`;
                
                if (!isConditionMet) {
                    warningHtml = `
                    <p class="purchase-warning">
                        <i class="fa-solid fa-triangle-exclamation"></i> Условие не выполнено!
                    </p>`;
                }
            }

            const isViewed = p.viewed_by_admin;
            const viewerName = p.viewed_by_admin_name ? ` (${p.viewed_by_admin_name})` : '';
            const viewedStatusClass = isViewed ? 'status-viewed' : 'status-not-viewed';
            const viewedStatusText = isViewed ? `Просмотрено${escapeHTML(viewerName)}` : 'Не просмотрено';
            const viewStatusHtml = `<p class="purchase-view-status ${viewedStatusClass}">${viewedStatusText}</p>`;
            
            let userInputHtml = '';
            let rouletteWinHtml = '';
            if (reward_settings.show_user_input && p.user_input) {
                let userInputContent = p.user_input;
                if (userInputContent.startsWith("Выигрыш:")) {
                    const parts = userInputContent.split("| Сообщение:");
                    rouletteWinHtml = `<p class="purchase-win-info">${parts[0].trim()}</p>`;
                    userInputContent = (parts.length > 1) ? parts[1].trim() : '';
                }
                if (userInputContent) {
                   userInputHtml = `<div class="purchase-user-input">${makeLinksClickable(userInputContent)}</div>`;
                }
            }

            const tradeLinkHtml = p.trade_link ? `<p>Трейд: <a href="${p.trade_link}" target="_blank" rel="noopener noreferrer" style="color: var(--action-color);">Открыть</a></p>` : '';

            let actionButtonsHtml;

            if (p.rewarded_at) {
                actionButtonsHtml = `
                    <div class="rewarded-info" style="flex-grow: 1;"><i class="fa-solid fa-check-circle"></i> Награда выдана</div>
                    <button class="admin-action-btn reject delete-purchase-btn" data-purchase-id="${p.id}"><i class="fa-solid fa-trash"></i></button>`;
            
            } else {
                let issueButtonHtml = '';

                // Выносим Steam в отдельное условие, чтобы кнопка работала и без привязки
               if (rewardType === 'steam') {
    issueButtonHtml = `<button 
        class="admin-action-btn manual-steam-btn" 
        data-purchase-id="${p.id}"
        data-item-name="${escapeHTML(reward_settings.steam_item_name || '')}"
        data-item-count="${reward_settings.steam_item_count || 1}"
        style="display: flex; align-items: center; justify-content: center; flex-grow: 1; padding: 8px 12px; background: #171a21; color: #fff; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-weight: 500; transition: all 0.2s ease;">
        <i class="fa-brands fa-steam" style="margin-right: 6px; font-size: 1.1em;"></i> Выдать
    </button>`;

                } else if (p.status !== 'Привязан') {
                    issueButtonHtml = `
                        <div class="rewarded-info" style="flex-grow: 1; color: var(--warning-color);">
                            <i class="fa-solid fa-link-slash"></i> Ожидает привязки
                        </div>`;
                } else {
                    if (rewardType === 'tickets') {
                        issueButtonHtml = `<button class="admin-action-btn issue-tickets-btn" data-purchase-id="${p.id}" data-amount="${rewardAmount}">Выдать ${rewardAmount} 🎟️</button>`;
                    } else if (rewardType === 'promocode') {
                        issueButtonHtml = `<button class="admin-action-btn issue-promo-btn" data-purchase-id="${p.id}" data-amount="${rewardAmount}">Выдать ${rewardAmount} ⭐</button>`;
                    } else {
                        issueButtonHtml = `<div class="rewarded-info" style="flex-grow: 1; color: var(--text-color-muted);"><i class="fa-solid fa-file-invoice"></i> Выдача не требуется</div>`;
                    }
                }
                
                actionButtonsHtml = `
                    ${issueButtonHtml}
                    <button class="admin-action-btn reject delete-purchase-btn" data-purchase-id="${p.id}"><i class="fa-solid fa-trash"></i></button>`;
            }

            const telegramNameDisplay = p.status === 'Привязан'
                ? `<span style="color: var(--text-color-muted); font-weight: normal; margin-left: 5px;">(${p.username || '...'})</span>`
                : `<span style="color: var(--warning-color); font-weight: normal; margin-left: 5px;">(Не привязан)</span>`;

            return `
            <div class="purchase-item" id="purchase-item-${p.id}" data-purchase-id="${p.id}" data-condition-met="${isConditionMet}">
                <div class="purchase-item-header">
                    <strong>${p.twitch_login || '???'}${telegramNameDisplay}</strong>
                    <span class="purchase-status-badge purchase-status-${p.status.replace(' ', '.')}">${p.status}</span>
                </div>
                <p>Дата: ${date}</p>
                ${viewStatusHtml}
                ${tradeLinkHtml}
                ${progressHtml} 
                ${warningHtml} 
                ${rouletteWinHtml}
                ${userInputHtml}
                <div class="purchase-actions">${actionButtonsHtml}</div>
            </div>
            `;
        }).join('');

    } catch(e) {
        body.innerHTML = `<p style='color: var(--danger-color);'>Ошибка загрузки покупок: ${e.message}</p>`;
    }
}

window.closeManualSteamModal = function() {
    const modal = document.getElementById('manual-steam-modal');
    if (modal) modal.classList.add('hidden');
};

// --- ЭКСПОРТ ОБРАБОТЧИКОВ (вызывается из admin.js) ---
window.setupTwitchEventListeners = function() {
    
    // 1. Кнопки обновления
    if(document.getElementById('refresh-purchases-btn')) {
        document.getElementById('refresh-purchases-btn').addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const { rewardId, rewardTitle } = btn.dataset;
            if (rewardId && rewardTitle) {
                openTwitchPurchases(rewardId, rewardTitle);
            }
        });
    }

    const reloadTwitchBtn = document.getElementById('reload-twitch-rewards-btn');
    if (reloadTwitchBtn) {
        reloadTwitchBtn.addEventListener('click', async () => {
            showLoader(); 
            await loadTwitchRewards(); 
            hideLoader(); 
        });
    }

    const rewardTypeSelect = document.getElementById('reward-type-select');
if (rewardTypeSelect) {
    rewardTypeSelect.addEventListener('change', (e) => {
        const steamWrapper = document.getElementById('steam-automation-wrapper');
        if (steamWrapper) steamWrapper.style.display = e.target.value === 'steam' ? 'block' : 'none';
    });
}

    // 2. Форма настроек Twitch
    const twitchRewardSettingsForm = document.getElementById('twitch-reward-settings-form');
    if(twitchRewardSettingsForm) {
        twitchRewardSettingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const payload = {
                id: parseInt(form.elements['reward_id'].value),
                is_active: form.elements['is_active'].checked,
                notify_admin: form.elements['notify_admin'].checked,
                show_user_input: form.elements['show_user_input'].checked,
                condition_type: form.elements['condition_type'].value || null,
                target_value: form.elements['target_value'].value ? parseInt(form.elements['target_value'].value) : null,
                auto_steam: form.elements['auto_steam'] ? form.elements['auto_steam'].checked : false,
                steam_item_name: form.elements['steam_item_name'] ? form.elements['steam_item_name'].value : "",
                steam_item_count: form.elements['steam_item_count'] ? parseInt(form.elements['steam_item_count'].value) : 1
            };

            if (hasAdminAccess) {
                payload.reward_type = form.elements['reward_type'].value;
                if (payload.reward_type === 'none') {
                    payload.reward_amount = 0;
                } else {
                    const amountVal = form.elements['reward_amount'].value;
                    payload.reward_amount = (amountVal && !isNaN(parseInt(amountVal))) ? parseInt(amountVal) : 10;
                }
                payload.promocode_amount = payload.reward_amount;
                const sortOrderVal = form.elements['sort_order'].value;
                payload.sort_order = sortOrderVal.trim() === '' ? null : parseInt(sortOrderVal, 10);
            } else {
                payload.promocode_amount = parseInt(form.elements['promocode_amount'].value);
                payload.reward_type = 'promocode'; 
                payload.reward_amount = payload.promocode_amount;
            }

            await makeApiRequest('/api/v1/admin/twitch_rewards/update', payload);
            document.getElementById('twitch-reward-settings-modal').classList.add('hidden');
            tg.showAlert('Настройки сохранены!');
            await loadTwitchRewards();
        });
    }

    if(document.getElementById('delete-twitch-reward-btn')) {
        document.getElementById('delete-twitch-reward-btn').addEventListener('click', () => {
            const form = document.getElementById('twitch-reward-settings-form');
            const rewardId = parseInt(form.elements['reward_id'].value);
            if (!rewardId) return;

            showCustomConfirmHTML('Удалить награду и ВСЕ ее покупки? Необратимо.', () => {
                showLoader();
                makeApiRequest('/api/v1/admin/twitch_rewards/delete', { reward_id: rewardId }, 'POST', true)
                    .then(async () => {
                        document.getElementById('twitch-reward-settings-modal').classList.add('hidden');
                        await loadTwitchRewards();
                        hideLoader();
                        tg.showPopup({ message: 'Награда удалена' });
                    })
                    .catch(e => { hideLoader(); tg.showAlert(`Ошибка: ${e.message}`); });
            });
        });
    }

    // 3. Отметка "Просмотрено" по клику на ссылку
    if(document.getElementById('twitch-purchases-body')) {
        document.getElementById('twitch-purchases-body').addEventListener('click', async (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            const purchaseItem = link.closest('.purchase-item');
            if (!purchaseItem) return;

            const purchaseId = parseInt(purchaseItem.dataset.purchaseId);
            if (!purchaseId) return;

            const statusEl = purchaseItem.querySelector('.purchase-view-status');
            if (statusEl && !statusEl.classList.contains('status-viewed')) {
                statusEl.textContent = 'Отмечаю...';
                try {
                    const result = await makeApiRequest('/api/v1/admin/twitch_rewards/purchase/mark_viewed', { 
                        purchase_id: purchaseId 
                    }, 'POST', true);

                    const viewerName = result.viewer || 'Вами';
                    statusEl.innerHTML = `Просмотрено (${viewerName})`;
                    statusEl.classList.remove('status-not-viewed');
                    statusEl.classList.add('status-viewed');
                } catch (err) {
                    console.error("Ошибка маркировки просмотра:", err);
                    statusEl.textContent = 'Ошибка метки';
                }
            }
        });
    }

    // 4. Ручная привязка Twitch
    if (dom.manualTwitchLinkBtn) {
        dom.manualTwitchLinkBtn.addEventListener('click', () => {
            openAdminUserSearchModal('Привязать Twitch пользователю', (user) => {
                dom.manualTwitchLinkForm.reset();
                dom.manualTwitchLinkForm.elements['user_id'].value = user.id;
                dom.mtlUserDisplay.textContent = `${user.name} (ID: ${user.id})`;
                dom.mtlFindIdBtn.href = "#"; 
                dom.manualTwitchLinkModal.classList.remove('hidden');
                dom.mtlLoginInput.focus();
            });
        });
    }

    if (dom.mtlFindIdBtn && dom.mtlLoginInput) {
        dom.mtlFindIdBtn.addEventListener('click', (e) => {
            const login = dom.mtlLoginInput.value.trim();
            if (!login) {
                e.preventDefault();
                tg.showAlert('Сначала введите никнейм!');
                return;
            }
            navigator.clipboard.writeText(login).then(() => {
                tg.showPopup({message: `Ник "${login}" скопирован!`});
            }).catch(() => {});

            const url = `https://www.streamweasels.com/tools/convert-twitch-username-to-user-id/`; 
            e.currentTarget.href = url;
        });
    }

    if (dom.manualTwitchLinkForm) {
        dom.manualTwitchLinkForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const userId = parseInt(form.elements['user_id'].value);
            const login = form.elements['twitch_login'].value.trim();
            const twitchId = form.elements['twitch_id'].value.trim();

            if (!userId || !login || !twitchId) {
                tg.showAlert('Заполните все поля!');
                return;
            }

            try {
                await makeApiRequest('/api/v1/admin/users/link_twitch_manual', {
                    user_id: userId,
                    twitch_login: login,
                    twitch_id: twitchId
                });
                
                tg.showAlert('Twitch успешно привязан!');
                dom.manualTwitchLinkModal.classList.add('hidden');
            } catch (err) {
                tg.showAlert(`Ошибка: ${err.message}`);
            }
        });
    }

    // 5. Делегированные клики Twitch
document.body.addEventListener('click', async (event) => {
    const target = event.target;

        // Шестеренка
        const settingsBtn = target.closest('.reward-settings-btn');
        if (settingsBtn) {
            const rewardData = JSON.parse(settingsBtn.dataset.reward);
            if (hasAdminAccess) openTwitchRewardSettings(rewardData);
            else {
                afterPasswordCallback = () => openTwitchRewardSettings(rewardData);
                dom.passwordPromptOverlay.classList.remove('hidden');
                dom.passwordPromptInput.focus();
            }
            return;
        }

        // Клик по картинке награды (открыть покупки)
        const purchasesLink = target.closest('.reward-purchases-link');
        if (purchasesLink) {
            event.preventDefault();
            openTwitchPurchases(purchasesLink.dataset.rewardId, purchasesLink.dataset.rewardTitle);
            return;
        }

        // Удаление одной покупки
        const deletePurchaseBtn = target.closest('.delete-purchase-btn');
        if (deletePurchaseBtn) {
            event.preventDefault(); 
            event.stopPropagation();
            const purchaseId = deletePurchaseBtn.dataset.purchaseId;

            showCustomConfirmHTML('Удалить эту покупку навсегда?', () => {
                const itemDiv = document.getElementById(`purchase-item-${purchaseId}`);
                if (itemDiv) {
                    itemDiv.style.transition = 'all 0.3s ease-out';
                    itemDiv.style.transform = 'translateX(100%)';
                    itemDiv.style.opacity = '0';
                    setTimeout(() => itemDiv.remove(), 300);
                }
                const refreshBtn = document.getElementById('refresh-purchases-btn');
                if (refreshBtn) {
                    const currentRewardId = refreshBtn.dataset.rewardId;
                    const badge = document.querySelector(`.admin-icon-button[data-reward-id="${currentRewardId}"] .notification-badge`);
                    if (badge) {
                        let c = Math.max(0, (parseInt(badge.textContent) || 0) - 1);
                        badge.textContent = c;
                        if (c === 0) badge.classList.add('hidden');
                    }
                }
                makeApiRequest('/api/v1/admin/twitch_rewards/purchase/delete', { purchase_id: parseInt(purchaseId) }, 'POST', true)
                    .then(() => tg.showPopup({ message: '✅ Удалено' }))
                    .catch(e => tg.showAlert(`Ошибка сервера: ${e.message}`));
            });
            return;
        }

        // Удаление всех покупок
        const deleteAllBtn = target.closest('#delete-all-purchases-btn');
        if (deleteAllBtn) {
            const rewardId = parseInt(deleteAllBtn.dataset.rewardId);
            showCustomConfirmHTML('Удалить ВСЕ покупки для этой награды? Необратимо.', () => {
                document.getElementById('twitch-purchases-body').innerHTML = '<p style="text-align: center;">Нет покупок.</p>';
                deleteAllBtn.classList.add('hidden');
                makeApiRequest('/api/v1/admin/twitch_rewards/purchases/delete_all', { reward_id: rewardId }, 'POST', true)
                    .then(() => tg.showPopup({ message: '✅ Все удалено' }))
                    .catch(e => tg.showAlert(`Ошибка: ${e.message}`));
            });
            return;
        }

        // Выдача промокода
        const issuePromoBtn = target.closest('.issue-promo-btn');
        if (issuePromoBtn) {
            const purchaseId = issuePromoBtn.dataset.purchaseId;
            const isConditionMet = issuePromoBtn.closest('.purchase-item').dataset.conditionMet === 'true';
            const msg = isConditionMet ? 'Выдать награду (промокод)?' : '⚠️ Условие не выполнено! Выдать все равно?';
            
            showCustomConfirmHTML(msg, () => {
                document.getElementById(`purchase-item-${purchaseId}`)?.remove();
                makeApiRequest('/api/v1/admin/twitch_rewards/issue_promocode', { purchase_id: parseInt(purchaseId) }, 'POST', true)
                    .then(res => tg.showPopup({ message: res.message || 'Награда выдана' }))
                    .catch(e => tg.showAlert(`Ошибка: ${e.message}`));
            }, 'Выдать', '#ff9500');
            return;
        }

        // Выдача билетов
        const issueTicketsBtn = target.closest('.issue-tickets-btn');
        if (issueTicketsBtn) {
            const purchaseId = issueTicketsBtn.dataset.purchaseId;
            const amount = issueTicketsBtn.dataset.amount;
            const isConditionMet = issueTicketsBtn.closest('.purchase-item').dataset.conditionMet === 'true';
            const msg = isConditionMet ? `Выдать ${amount} 🎟️ билетов?` : `⚠️ Условие не выполнено! Выдать ${amount} 🎟️?`;

            showCustomConfirmHTML(msg, () => {
                document.getElementById(`purchase-item-${purchaseId}`)?.remove();
                makeApiRequest('/api/v1/admin/twitch_rewards/issue_tickets', { purchase_id: parseInt(purchaseId) }, 'POST', true)
                    .then(res => tg.showPopup({ message: 'Билеты выданы' }))
                    .catch(e => tg.showAlert(`Ошибка: ${e.message}`));
            }, 'Выдать', '#007aff');
            return;
        }

        // Проверка Wizebot
        const checkBtn = target.closest('.check-wizebot-btn, .wizebot-check-btn');
        if (checkBtn) {
            const nickname = checkBtn.dataset.nickname;
            const period = checkBtn.dataset.period || 'session';
            const resultDiv = checkBtn.classList.contains('wizebot-check-btn') 
                ? checkBtn.closest('.purchase-item').querySelector('.purchase-warning') 
                : checkBtn.closest('.admin-submission-card').querySelector('.wizebot-stats-result');
            
            if (!resultDiv && checkBtn.classList.contains('wizebot-check-btn')) {
                 checkBtn.disabled = true;
                 checkBtn.textContent = '...';
                 makeApiRequest('/api/v1/admin/wizebot/check_user', { twitch_username: nickname, period: period }, 'POST', true)
                    .then(stats => {
                        const msg = stats.found ? `✅ ${stats.messages} сообщ. (Ранг ${stats.rank})` : `⚠️ Не найден в топе`;
                        tg.showPopup({message: msg});
                    })
                    .catch(e => tg.showAlert(`Ошибка: ${e.message}`))
                    .finally(() => { checkBtn.disabled = false; checkBtn.innerHTML = '<i class="fa-brands fa-twitch"></i> Проверить'; });
                 return;
            }

            if (resultDiv) {
                resultDiv.innerHTML = '<i>Проверяем...</i>';
                checkBtn.disabled = true;
                makeApiRequest('/api/v1/admin/wizebot/check_user', { twitch_username: nickname, period: period }, 'POST', true)
                    .then(stats => {
                        resultDiv.innerHTML = stats.found 
                            ? `<p style="color: var(--primary-color);">✅ ${stats.messages} сообщ. (Ранг ${stats.rank})</p>`
                            : `<p style="color: var(--warning-color);">⚠️ Не найден в топ-100</p>`;
                    })
                    .catch(e => resultDiv.innerHTML = `<p style="color: var(--danger-color);">Ошибка: ${e.message}</p>`)
                    .finally(() => checkBtn.disabled = false);
            }
            return;
        }

// --- 🛡️ РУЧНАЯ ВЫДАЧА STEAM (ПРЯМАЯ ОТПРАВКА) ---
        const manualSteamBtn = target.closest('.manual-steam-btn');
        if (manualSteamBtn) {
            event.preventDefault();
            const purchaseId = manualSteamBtn.dataset.purchaseId;
            const itemName = manualSteamBtn.dataset.itemName;
            const itemCount = parseInt(manualSteamBtn.dataset.itemCount) || 1;

            if (!itemName) {
                return tg.showAlert("Предмет не настроен! Зайдите в настройки награды (шестеренка) и укажите название предмета для выдачи.");
            }

            // Быстрое подтверждение без ввода текста
            showCustomConfirmHTML(`Отправить <b>${itemName}</b> (x${itemCount}) этому пользователю?`, async () => {
                const originalText = manualSteamBtn.innerHTML;
                manualSteamBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Выдача...';
                manualSteamBtn.disabled = true;

                try {
                    const res = await makeApiRequest('/api/v1/admin/twitch_rewards/inventory_issue', {
                        search_query: itemName,
                        count: itemCount,
                        purchase_id: parseInt(purchaseId)
                    }, 'POST', true);
                    
                    tg.showPopup({ message: res.message || 'Трейд успешно отправлен!' });
                    document.getElementById(`purchase-item-${purchaseId}`)?.remove();
                } catch (e) {
                    let errorMsg = `Ошибка: ${e.message}`;
                    if (errorMsg.length > 250) errorMsg = errorMsg.substring(0, 247) + '...';
                    tg.showAlert(errorMsg);
                } finally {
                    manualSteamBtn.innerHTML = originalText;
                    manualSteamBtn.disabled = false;
                }
            }, 'Выдать', '#66c0f4');
            return;
        }

        // --- 🛡️ МАССОВАЯ ВЫДАЧА STEAM (ПРЯМАЯ ОТПРАВКА) ---
        const massSteamBtnAction = target.closest('#mass-steam-btn');
        if (massSteamBtnAction) {
            event.preventDefault();
            const rewardId = massSteamBtnAction.dataset.rewardId;
            const itemName = massSteamBtnAction.dataset.itemName;
            const itemCount = parseInt(massSteamBtnAction.dataset.itemCount) || 1;

            if (!itemName) {
                return tg.showAlert("Предмет не настроен! Зайдите в настройки награды (шестеренка) и укажите название предмета.");
            }

            // Быстрое подтверждение массовой выдачи
            showCustomConfirmHTML(`Запустить массовую рассылку <b>${itemName}</b> (x${itemCount}) всем ожидающим?`, async () => {
                const originalText = massSteamBtnAction.innerHTML;
                massSteamBtnAction.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Выдача...';
                massSteamBtnAction.disabled = true;

                try {
                    const res = await makeApiRequest('/api/v1/admin/twitch_rewards/manual_mass_steam', {
                        search_query: itemName,
                        count: itemCount,
                        reward_id: parseInt(rewardId)
                    }, 'POST', true);
                    
                    tg.showPopup({ message: res.message || 'Массовый трейд успешно отправлен!' });
                    document.getElementById('refresh-purchases-btn')?.click();
                } catch (e) {
                    let errorMsg = `Ошибка: ${e.message}`;
                    if (errorMsg.length > 250) errorMsg = errorMsg.substring(0, 247) + '...';
                    tg.showAlert(errorMsg);
                } finally {
                    massSteamBtnAction.innerHTML = originalText;
                    massSteamBtnAction.disabled = false;
                }
            }, 'Разослать всем', '#66c0f4');
            return;
        }

    });
};
