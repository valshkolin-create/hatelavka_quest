// ==========================================
// ФАЙЛ: admin_js/p2p_admins.js
// ==========================================

let currentP2PTradeId = null;
let adminP2PTradeLinkCache = ''; // <-- ДОБАВЛЕНО, чтобы не было ReferenceError

window.loadP2PTrades = async function() {
    const container = document.getElementById('p2p-trades-list'); 
    if (!container) return;

    container.className = 'p2p-trades-grid'; 
    container.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Загрузка...</p>';

    try {
        const trades = await makeApiRequest('/api/v1/admin/p2p/list', {}, 'POST', true);
        
        container.innerHTML = '';
        window.updateP2PBadge(trades);

        if (!trades || trades.length === 0) {
            container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #777;">Нет активных сделок.</p>';
            return;
        }

        trades.forEach(trade => {
            const user = trade.user || {};
            const caseItem = trade.case || {};
            
            let statusClass = 'status-pending';
            if (trade.status === 'review' || trade.status === 'active') statusClass = 'status-review';
            if (trade.status === 'completed') statusClass = 'status-completed';
            if (trade.status === 'canceled') statusClass = 'status-canceled';

            const caseName = caseItem.case_name || ('Case #' + trade.case_id);
            const caseImg = caseItem.image_url || 'https://via.placeholder.com/60';
            const userName = user.full_name || user.username || ('User ' + trade.user_id);

            const html = `
                <div class="p2p-trade-card">
                    <button class="p2p-card-delete-btn" onclick="deleteP2PTradeFromCard(event, ${trade.id})" title="Удалить навсегда">
                        <i class="fa-solid fa-trash"></i>
                    </button>

                    <div class="p2p-status-dot ${statusClass}"></div>
                    <img src="${escapeHTML(caseImg)}" onerror="this.src='https://placehold.co/60'">
                    <div class="p2p-user-name">${escapeHTML(userName)}</div>
                    <div class="p2p-case-name">${escapeHTML(caseName)}</div>
                    
                    <button class="btn-details-p2p" onclick='openP2PDetailsModal(${JSON.stringify(trade).replace(/'/g, "&#39;")})'>
                        Подробнее
                    </button>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        });

    } catch (e) {
        console.error(e);
        container.innerHTML = `<p class="error-message" style="grid-column: 1/-1;">Ошибка: ${e.message}</p>`;
    }
};

window.deleteP2PTradeFromCard = function(event, tradeId) {
    event.stopPropagation(); 
    
    showCustomConfirmHTML(
        '🗑️ Удалить сделку НАВСЕГДА?<br><span style="font-size:13px; color:#aaa">Она исчезнет из базы, статус не изменится.</span>',
        async () => {
            try {
                await makeApiRequest('/api/v1/admin/p2p/delete', { 
                    trade_id: tradeId, 
                    initData: tg.initData 
                });
                tg.showPopup({message: 'Удалено'});
                window.loadP2PTrades(); 
            } catch (e) {
                tg.showAlert('Ошибка: ' + e.message);
            }
        },
        'Удалить',
        '#ff3b30'
    );
};

window.updateP2PBadge = function(trades) {
    if (!trades) return;
    const activeCount = trades.filter(t => ['pending', 'active', 'review'].includes(t.status)).length;
    
    const badge = document.getElementById('p2p-badge-main'); 
    if (badge) {
        badge.innerText = activeCount;
        if (activeCount > 0) {
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
};

window.openP2PDetailsModal = function(trade) {
    currentP2PTradeId = trade.id;
    const user = trade.user || {};
    const caseItem = trade.case || {};

    document.getElementById('modal-p2p-id').innerText = trade.id;
    document.getElementById('modal-p2p-img').src = caseItem.image_url || '';
    document.getElementById('modal-p2p-case').innerText = caseItem.case_name || 'Неизвестный кейс';
    document.getElementById('modal-p2p-price').innerText = (trade.total_coins || 0) + ' монет';
    
    const userFullName = user.full_name || 'User';
    const userUsername = user.username || '';
    const userDisplayField = document.getElementById('modal-p2p-user');
    
    userDisplayField.value = `${userFullName} ${userUsername ? '(@' + userUsername + ')' : ''} (ID: ${trade.user_id})`;
    
    userDisplayField.style.cursor = 'pointer';
    userDisplayField.title = 'Нажмите, чтобы скопировать логин/ID';
    userDisplayField.onclick = async () => {
        let textToCopy = userUsername ? `@${userUsername}` : trade.user_id.toString();
        try {
            await navigator.clipboard.writeText(textToCopy);
            tg.showPopup({ message: `${textToCopy} скопирован!` });
        } catch (e) {
            tg.showAlert('Ошибка копирования');
        }
    };

    if (trade.created_at) {
        const dateObj = new Date(trade.created_at);
        document.getElementById('modal-p2p-date').value = dateObj.toLocaleString('ru-RU');
    } else {
        document.getElementById('modal-p2p-date').value = 'Неизвестно';
    }
    
    window.renderP2PModalStatus(trade.status, trade.id, trade.total_coins);
    document.getElementById('p2pTradeDetailsModal').classList.remove('hidden');
};

window.renderP2PModalStatus = function(status, tradeId, amount) {
    const statusEl = document.getElementById('modal-p2p-status-text');
    const actionsDiv = document.getElementById('modal-p2p-actions');
    actionsDiv.innerHTML = ''; 

    let statusText = status;
    let statusColor = '#fff';

    if (status === 'pending') {
        statusText = '🆕 Новая заявка';
        statusColor = '#ff9500';
        actionsDiv.innerHTML = `
            <div style="display: flex; gap: 10px;">
                <button data-action="reject" data-id="${tradeId}" class="admin-action-btn reject" style="flex: 1;">
                    <i class="fa-solid fa-xmark"></i> Отказать
                </button>
                <button data-action="approve" data-id="${tradeId}" class="admin-action-btn approve" style="flex: 2;">
                    <i class="fa-solid fa-bolt"></i> Принять
                </button>
            </div>`;
    } 
    else if (status === 'active') {
        statusText = '⏳ Ссылка отправлена. Ждем юзера...';
        statusColor = '#007aff'; 
        actionsDiv.innerHTML = `
            <div style="padding: 10px; background: rgba(0,122,255,0.1); border-radius: 8px; text-align: center; color: #ccc; font-size: 13px; margin-bottom: 10px;">
                Ожидаем, пока пользователь нажмет «Я передал»
            </div>
            
            <button data-action="force_confirm" data-id="${tradeId}" class="admin-action-btn confirm" style="width: 100%; margin-bottom: 8px; background-color: #007aff;">
                <i class="fa-solid fa-eye"></i> Я уже вижу скин (Подтвердить)
            </button>

            <button data-action="reject" data-id="${tradeId}" class="admin-action-btn reject" style="width: 100%; font-size: 13px; padding: 8px;">
                Отменить (если долго не кидает)
            </button>
        `;
    }
    else if (status === 'review') {
        statusText = '👀 Юзер отправил! Проверка';
        statusColor = '#007aff';
        actionsDiv.innerHTML = `
            <div style="display: flex; gap: 10px;">
                <button data-action="reject" data-id="${tradeId}" class="admin-action-btn reject" style="flex: 1;">
                    Обман
                </button>
                <button data-action="complete" data-id="${tradeId}" data-amount="${amount}" class="admin-action-btn confirm" style="flex: 2;">
                    <i class="fa-solid fa-coins"></i> Подтвердить
                </button>
            </div>`;
    }
    else if (status === 'completed') { 
        statusText = '✅ Сделка завершена'; 
        statusColor = '#32d74b';
        actionsDiv.innerHTML = `<button class="admin-action-btn" disabled style="opacity:0.5; background:#333; cursor:default;">Действия недоступны</button>`;
    }
    else if (status === 'canceled') { 
        statusText = '❌ Отменено'; 
        statusColor = '#ff453a'; 
        actionsDiv.innerHTML = `<button class="admin-action-btn" disabled style="opacity:0.5; background:#333; cursor:default;">Действия недоступны</button>`;
    }

    statusEl.innerText = statusText;
    statusEl.style.color = statusColor;
};

window.approveP2PTrade = async function(tradeId) {
    showLoader();
    try {
        let tradeLink = adminP2PTradeLinkCache;
        if (!tradeLink) {
            const settings = await makeApiRequest('/api/v1/admin/settings', {}, 'POST', true);
            tradeLink = settings.p2p_admin_trade_link;
        }

        if (!tradeLink) {
            hideLoader();
            tg.showAlert("ОШИБКА: Трейд-ссылка не настроена! Зайдите в 'Настройки P2P' и сохраните её.");
            return;
        }

        await makeApiRequest('/api/v1/admin/p2p/approve', {
            trade_id: tradeId,
            trade_link: tradeLink
        });

        tg.showPopup({ message: "Заявка принята, ссылка отправлена!" });
        window.renderP2PModalStatus('active', tradeId, 0); 
        window.loadP2PTrades(); 

    } catch (e) {
        tg.showAlert("Ошибка: " + e.message);
    } finally {
        hideLoader();
    }
};

window.completeP2PTrade = async function(tradeId, coins) {
    showCustomConfirmHTML(
        `✅ Подтвердить получение скина?<br>Выдать <b>${coins} монет</b> пользователю?`,
        async () => {
            try {
                await makeApiRequest('/api/v1/admin/p2p/complete', { trade_id: tradeId, initData: tg.initData });
                tg.showPopup({message: 'Успешно! Монеты выданы.'});
                
                window.renderP2PModalStatus('completed', tradeId, coins);
                window.loadP2PTrades(); 
            } catch (e) {
                tg.showAlert(e.message);
            }
        },
        'Подтвердить',
        '#32d74b'
    );
};

window.deleteCurrentP2PTrade = function() {
    if(!currentP2PTradeId) return;

    showCustomConfirmHTML(
        '🗑️ Удалить запись из базы?<br><span style="font-size:13px; color:#aaa">Никто не получит уведомлений, сделка просто исчезнет.</span>',
        async () => {
            try {
                await makeApiRequest('/api/v1/admin/p2p/delete', { 
                    trade_id: currentP2PTradeId, 
                    initData: tg.initData 
                });
                
                tg.showPopup({message: 'Сделка удалена.'});
                window.closeModal('p2pTradeDetailsModal');
                window.loadP2PTrades(); 
            } catch (e) {
                tg.showAlert('Ошибка: ' + e.message);
            }
        },
        'Удалить навсегда',
        '#ff3b30'
    );
};

window.rejectP2PTrade = function(tradeId) {
    showCustomConfirmHTML(
        '⛔ Отменить эту сделку?<br><span style="font-size:13px; color:#aaa">Пользователь получит уведомление об отмене.</span>',
        async () => {
            try {
                await makeApiRequest('/api/v1/admin/p2p/cancel', { trade_id: tradeId, initData: tg.initData });
                
                tg.showPopup({message: 'Статус изменен на "Отменено"'});
                window.renderP2PModalStatus('canceled', tradeId, 0);
                window.loadP2PTrades(); 
            } catch (e) {
                tg.showAlert('Ошибка: ' + e.message);
            }
        },
        'Отменить сделку',
        '#ff3b30'
    );
};

window.cancelP2PTrade = async function(tradeId) {
    tg.showConfirm(`Отменить сделку #${tradeId}?`, async (ok) => {
        if (ok) {
            showLoader();
            try {
                await makeApiRequest('/api/v1/admin/p2p/cancel', { trade_id: parseInt(tradeId) });
                tg.showAlert("Сделка отменена.");
                window.loadP2PTrades();
            } catch (e) {
                tg.showAlert("Ошибка: " + e.message);
            } finally {
                hideLoader();
            }
        }
    });
};

window.loadP2PSettingsAndCases = async function() {
    await window.loadP2PCases();
    try {
        const settings = await makeApiRequest('/api/v1/admin/settings', {}, 'POST', true);
        const linkInput = document.getElementById('p2p-admin-trade-link');
        
        if (settings.p2p_admin_trade_link) {
            adminP2PTradeLinkCache = settings.p2p_admin_trade_link; 
            if (linkInput) linkInput.value = settings.p2p_admin_trade_link;
        }
    } catch (e) {
        console.error("Ошибка загрузки P2P настроек", e);
    }
};

window.saveP2PAdminLink = async function() {
    const linkInput = document.getElementById('p2p-admin-trade-link');
    if (!linkInput) return;
    
    const linkVal = linkInput.value.trim();
    if (!linkVal) return tg.showAlert("Введи ссылку!");

    showLoader();
    try {
        const currentSettings = await makeApiRequest('/api/v1/admin/settings', {}, 'POST', true);
        currentSettings.p2p_admin_trade_link = linkVal;
        await makeApiRequest('/api/v1/admin/settings/update', { settings: currentSettings });
        
        adminP2PTradeLinkCache = linkVal;
        tg.showAlert('Ссылка сохранена!');
    } catch (e) {
        console.error(e);
        tg.showAlert("Ошибка: " + e.message);
    } finally {
        hideLoader();
    }
};

window.loadP2PCases = async function() {
    const container = document.getElementById('p2p-cases-list');
    if(!container) return;
    
    container.innerHTML = '<p style="grid-column: 1/-1; text-align:center;">Загрузка...</p>';
    
    try {
        const cases = await makeApiRequest('/api/v1/p2p/cases', {}, 'GET', true);
        container.innerHTML = '';

        if (!cases || cases.length === 0) {
            container.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#777;">Кейсов нет. Создайте первый!</p>';
            return;
        }

        cases.forEach(item => {
            const safeName = escapeHTML(item.case_name);
            const safeImg = escapeHTML(item.image_url);
            
            const html = `
                <div class="p2p-case-card-grid">
                    <img src="${safeImg}" onerror="this.src='https://placehold.co/80?text=No+Img'">
                    <div class="case-grid-title">${safeName}</div>
                    <div class="case-grid-price">${item.price_in_coins} монет</div>
                    
                    <button onclick="deleteP2PCase(${item.id})" class="admin-delete-quest-btn" style="width:100%; margin-top:auto; font-size:12px;">
                        <i class="fa-solid fa-trash"></i> Удалить
                    </button>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        });

    } catch (e) {
        container.innerHTML = `<p class="error-message" style="grid-column: 1/-1;">${e.message}</p>`;
    }
};

window.deleteP2PCase = async function(caseId) {
    if(!confirm("Удалить этот кейс?")) return;
    try {
        await makeApiRequest('/api/v1/admin/p2p/case/delete', { case_id: caseId });
        window.loadP2PCases();
    } catch(e) {
        tg.showAlert(e.message);
    }
};

window.openTradeModal = function() {
    const storedLink = adminP2PTradeLinkCache || ''; 
    const input = document.getElementById('p2p-admin-trade-link-modal');
    
    if (input) input.value = storedLink;
    document.getElementById('tradeModal').classList.remove('hidden');
};

window.saveTradeUrlFromModal = async function() {
    const input = document.getElementById('p2p-admin-trade-link-modal');
    if (!input) return;
    
    const val = input.value.trim();
    if (!val) return tg.showAlert('Введите ссылку!');

    showLoader();
    try {
        const settings = await makeApiRequest('/api/v1/admin/settings', {}, 'POST', true);
        settings.p2p_admin_trade_link = val;
        await makeApiRequest('/api/v1/admin/settings/update', { settings: settings });
        
        adminP2PTradeLinkCache = val; 
        tg.showPopup({message: 'Ссылка сохранена!'});
        window.closeModal('tradeModal');
    } catch (e) {
        tg.showAlert('Ошибка: ' + e.message);
    } finally {
        hideLoader();
    }
};

window.openAddCaseModal = function() {
    document.getElementById('wiz-case-name').value = '';
    document.getElementById('wiz-case-img').value = '';
    document.getElementById('wiz-case-price').value = '';
    
    document.getElementById('wiz-img-preview').style.display = 'none';
    document.getElementById('wiz-img-placeholder').style.display = 'inline';
    
    window.wizardNext(1);
    document.getElementById('addCaseModal').classList.remove('hidden');
};

window.wizardNext = function(step) {
    document.getElementById('wiz-step-1').classList.add('hidden');
    document.getElementById('wiz-step-2').classList.add('hidden');
    document.getElementById('wiz-step-3').classList.add('hidden');
    
    document.getElementById('wiz-step-' + step).classList.remove('hidden');
    
    if(step === 1) setTimeout(() => document.getElementById('wiz-case-name').focus(), 100);
    if(step === 2) setTimeout(() => document.getElementById('wiz-case-img').focus(), 100);
    if(step === 3) setTimeout(() => document.getElementById('wiz-case-price').focus(), 100);
};

window.previewCaseImage = function() {
    const url = document.getElementById('wiz-case-img').value;
    const img = document.getElementById('wiz-img-preview');
    const placeholder = document.getElementById('wiz-img-placeholder');
    
    if (url && url.length > 10) {
        img.src = url;
        img.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        img.style.display = 'none';
        placeholder.style.display = 'inline';
    }
};

window.finishAddCase = async function() {
    const name = document.getElementById('wiz-case-name').value;
    const img = document.getElementById('wiz-case-img').value;
    const price = parseInt(document.getElementById('wiz-case-price').value);

    if (!name || !img || !price) return tg.showAlert('Заполните все поля!');

    showLoader();
    try {
        await makeApiRequest('/api/v1/admin/p2p/case/add', {
            case_name: name,
            image_url: img,
            price_in_coins: price
        });
        
        tg.showPopup({message: 'Кейс создан!'});
        window.closeModal('addCaseModal');
        await window.loadP2PCases(); 
    } catch (e) {
        tg.showAlert(e.message);
    } finally {
        hideLoader();
    }
};

window.closeModal = function(id) {
    document.getElementById(id).classList.add('hidden');
};

window.adminForceConfirmSent = async function(tradeId) {
    showCustomConfirmHTML(
        '👀 Вы видите скин в трейдах Steam?<br><span style="font-size:13px; color:#aaa">Это переведет сделку в статус "Проверка", как будто пользователь сам нажал кнопку.</span>',
        async () => {
            try {
                await makeApiRequest('/api/v1/admin/p2p/force_confirm_sent', { 
                    trade_id: tradeId, 
                    initData: tg.initData 
                });
                
                tg.showPopup({message: 'Статус обновлен вручную!'});
                
                window.renderP2PModalStatus('review', tradeId, 0); 
                window.loadP2PTrades(); 
                
                const trades = await makeApiRequest('/api/v1/admin/p2p/list', {}, 'POST', true);
                const trade = trades.find(t => t.id === tradeId);
                if (trade) {
                    window.renderP2PModalStatus('review', tradeId, trade.total_coins);
                }

            } catch (e) {
                tg.showAlert('Ошибка: ' + e.message);
            }
        },
        'Да, скин у меня',
        '#007aff'
    );
};

window.refreshCurrentP2PTradeDetails = async function() {
    if (!currentP2PTradeId) return;

    const btn = document.getElementById('btn-refresh-p2p-details');
    const icon = btn ? btn.querySelector('i') : null;

    if (icon) icon.classList.add('fa-spin');

    try {
        const trades = await makeApiRequest('/api/v1/admin/p2p/list', {}, 'POST', true);
        const trade = trades.find(t => t.id === currentP2PTradeId);

        if (trade) {
            window.openP2PDetailsModal(trade);
            tg.showPopup({message: 'Данные обновлены'});
        } else {
            tg.showAlert('Сделка не найдена (возможно, удалена)');
            window.closeModal('p2pTradeDetailsModal');
            window.loadP2PTrades(); 
        }
    } catch (e) {
        tg.showAlert('Ошибка обновления: ' + e.message);
    } finally {
        if (icon) icon.classList.remove('fa-spin');
    }
};

window.setupP2PEventListeners = function() {
    const refreshP2PBtn = document.getElementById('btn-refresh-p2p-details');
    if (refreshP2PBtn) {
        refreshP2PBtn.addEventListener('click', (e) => {
            e.preventDefault(); 
            window.refreshCurrentP2PTradeDetails();
        });
    }

    // НОВЫЙ БЛОК: Единый перехватчик кликов (Telegram его не заблокирует)
    const actionsDiv = document.getElementById('modal-p2p-actions');
    if (actionsDiv) {
        // Убиваем старые слушатели, чтобы не двоило
        const newActionsDiv = actionsDiv.cloneNode(true);
        actionsDiv.parentNode.replaceChild(newActionsDiv, actionsDiv);

        newActionsDiv.addEventListener('click', (e) => {
            const btn = e.target.closest('.admin-action-btn');
            if (!btn) return;

            const action = btn.dataset.action;
            if (!action) return;

            const id = parseInt(btn.dataset.id);
            const amount = parseInt(btn.dataset.amount) || 0;

            if (action === 'reject') window.rejectP2PTrade(id);
            if (action === 'approve') window.approveP2PTrade(id);
            if (action === 'force_confirm') window.adminForceConfirmSent(id);
            if (action === 'complete') window.completeP2PTrade(id, amount);
        });
    }

    const createP2PCaseForm = document.getElementById('create-p2p-case-form');
    if (createP2PCaseForm) {
        createP2PCaseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            try {
                await makeApiRequest('/api/v1/admin/p2p/case/add', {
                    case_name: formData.get('case_name'),
                    image_url: formData.get('image_url'),
                    price_in_coins: parseInt(formData.get('price_in_coins'))
                });
                tg.showAlert('Кейс добавлен!');
                e.target.reset();
                window.loadP2PCases(); 
            } catch (err) {
                tg.showAlert(err.message);
            }
        });
    }
};
   
