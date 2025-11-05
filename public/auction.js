// auction.js
document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    try {
        tg.ready();
        tg.expand();
    } catch (e) {
        console.warn("Telegram WebApp script not loaded or running in browser.");
    }

    // Глобальные переменные
    let countdownIntervals = {};
    let userData = {};
    let currentAuctions = [];
    let isEditMode = false;

    // DOM-элементы
    const dom = {
        loader: document.getElementById('loader-overlay'),
        auctionsList: document.getElementById('auctions-list'),
        
        bidModal: document.getElementById('bid-modal'),
        bidModalTitle: document.getElementById('bid-modal-title'),
        bidModalForm: document.getElementById('bid-modal-form'),
        userBalanceDisplay: document.getElementById('user-balance-display'),
        bidAuctionIdInput: document.getElementById('bid-auction-id-input'),
        bidCurrentMinInput: document.getElementById('bid-current-min-input'),
        bidAmountInput: document.getElementById('bid-amount-input'),
        
        historyModal: document.getElementById('bids-history-modal'),
        historyModalTitle: document.getElementById('bids-history-modal-title'),
        historyList: document.getElementById('bids-history-list'),

        adminControls: document.getElementById('admin-controls'),
        editToggle: document.getElementById('edit-mode-toggle'), 
        
        editModal: document.getElementById('auction-edit-modal'),
        editModalTitle: document.getElementById('auction-edit-modal-title'),
        editModalForm: document.getElementById('auction-edit-form'),
        editAuctionId: document.getElementById('auction-id-input'),
        editAuctionTitle: document.getElementById('auction-title-input'),
        editAuctionImage: document.getElementById('auction-image-input'),
        editAuctionCooldown: document.getElementById('auction-cooldown-input'),
        editAuctionActive: document.getElementById('auction-active-input'),
        editAuctionVisible: document.getElementById('auction-visible-input')
    };

    // --- Вспомогательные функции ---

    function escapeHTML(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, match => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'})[match]);
    }

    async function makeApiRequest(url, body = {}, method = 'POST', showLoader = true) {
        if (showLoader) dom.loader.classList.remove('hidden');
        try {
            const options = {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store'
            };
            
            if (method.toUpperCase() !== 'GET') {
                 options.body = JSON.stringify({ ...body, initData: tg.initData });
            }

            const response = await fetch(url, options);
            
            if (response.status === 204) {
                 return { success: true }; 
            }
            
            const result = await response.json();

            if (!response.ok) {
                const errorMsg = result.detail || result.message || 'Произошла ошибка';
                throw new Error(errorMsg);
            }
            return result;
        } catch (e) {
            tg.showAlert(e.message);
            throw e;
        } finally {
            if (showLoader) dom.loader.classList.add('hidden');
        }
    }
    
    async function makePublicGetRequest(url, showLoader = true) {
        if (showLoader) dom.loader.classList.remove('hidden');
        try {
            const response = await fetch(url, { cache: 'no-store' });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.detail || 'Произошла ошибка');
            }
            return result;
        } catch (e) {
            tg.showAlert(e.message);
            throw e;
        } finally {
            if (showLoader) dom.loader.classList.add('hidden');
        }
    }


    function startCountdown(timerElement, expiresAt, intervalKey, onEndCallback) {
        if (countdownIntervals[intervalKey]) {
            clearInterval(countdownIntervals[intervalKey]);
        }
        if (!timerElement) return;

        const endTime = new Date(expiresAt).getTime();
        
        const updateTimer = () => {
            const now = new Date().getTime();
            const distance = endTime - now;

            if (distance < 0) {
                clearInterval(countdownIntervals[intervalKey]);
                delete countdownIntervals[intervalKey];
                timerElement.textContent = "00:00:00";
                if (onEndCallback) onEndCallback();
                return;
            }

            const h = Math.floor(distance / 3600000);
            const m = Math.floor((distance % 3600000) / 60000);
            const s = Math.floor((distance % 60000) / 1000);
            
            timerElement.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        };
        
        countdownIntervals[intervalKey] = setInterval(updateTimer, 1000);
        updateTimer();
    }

    // --- Логика рендеринга ---

    function renderPage(auctions) {
        dom.auctionsList.innerHTML = '';
        if (!auctions || auctions.length === 0) {
            dom.auctionsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Активных аукционов пока нет.</p>';
        }

        currentAuctions = auctions; 

        auctions.forEach(auction => {
            const card = document.createElement('div');
            card.className = 'auction-card';
            card.id = `auction-card-${auction.id}`;
            
            if (isEditMode) {
                card.classList.add('admin-card');
                if (!auction.is_visible) card.classList.add('admin-hidden');
                if (!auction.is_active) card.classList.add('admin-inactive');
            }

            const isEnded = !!auction.ended_at;

            const timerId = `timer-${auction.id}`;
            const timerHtml = (auction.bid_cooldown_ends_at && !isEnded)
                ? `<div class="stat-item-value timer" id="${timerId}">...</div>`
                : `<div class="stat-item-value">${isEnded ? 'ЗАВЕРШЕН' : '00:00:00'}</div>`;

            const isDisabled = isEnded ? 'disabled' : '';

            let adminOverlay = '';
            if (isEditMode) {
                adminOverlay = `
                    <div class="edit-overlay">
                        <button class="card-btn card-edit-btn" data-auction-id="${auction.id}" title="Редактировать">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                        <button class="card-btn card-reset-btn" data-auction-id="${auction.id}" title="Сбросить лот (клонировать)">
                            <i class="fa-solid fa-arrow-rotate-left"></i>
                        </button>
                        <button class="card-btn card-finish-btn" data-auction-id="${auction.id}" title="Завершить вручную">
                            <i class="fa-solid fa-flag-checkered"></i>
                        </button>
                        <button class="card-btn card-delete-btn" data-auction-id="${auction.id}" title="Удалить">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                `;
            }
            
            // 
            // ⬇️ ЛОГИКА ОТОБРАЖЕНИЯ ЛИДЕРА (ВКЛЮЧАЯ TWITCH) ⬇️
            // (Этот код уже был в твоем файле, он корректен)
            //
            let leaderOrWinnerHtml = '';
            
            let displayName = 'Нет ставок';
            let iconHtml = '';
            
            if (isEnded && !auction.bidder && !auction.current_highest_bidder_name) {
                displayName = 'Не определен';
            } else if (auction.bidder) {
                // 'bidder' - это объект {full_name, twitch_login}
                if (auction.bidder.twitch_login) {
                    displayName = auction.bidder.twitch_login;
                    iconHtml = '<i class="fa-brands fa-twitch twitch-icon"></i>';
                } else {
                    displayName = auction.bidder.full_name || 'Аноним';
                    iconHtml = '<i class="fa-solid fa-user user-icon"></i>';
                }
            } else if (auction.current_highest_bidder_name) {
                // Фоллбэк на старое поле
                displayName = auction.current_highest_bidder_name;
                iconHtml = '<i class="fa-solid fa-user user-icon"></i>';
            }

            if (isEnded && (auction.bidder || auction.current_highest_bidder_name)) {
                leaderOrWinnerHtml = `
                    <div class="stat-item winner-block" style="margin-bottom: 15px;">
                        <div class="stat-item-label">Победитель</div>
                        <div class="stat-item-value winner-name">
                            <i class="fa-solid fa-trophy"></i>
                            ${iconHtml}
                            ${escapeHTML(displayName)}
                        </div>
                    </div>
                `;
            } else {
                leaderOrWinnerHtml = `
                    <div class="stat-item" style="margin-bottom: 15px;">
                        <div class="stat-item-label">${isEnded ? 'Победитель' : 'Лидер'}</div>
                        <div class="stat-item-value">
                            ${iconHtml}
                            ${escapeHTML(displayName)}
                        </div>
                    </div>
                `;
            }
            //
            // ⬆️ КОНЕЦ ЛОГИКИ ОТОБРАЖЕНИЯ ЛИДЕРА ⬆️
            //

            card.innerHTML = `
                ${adminOverlay}
                <div class="card-display-area">
                    <div class="event-image-container">
                        <img src="${escapeHTML(auction.image_url || 'https://i.postimg.cc/d0r554hc/1200-600.png?v=2')}" alt="${escapeHTML(auction.title)}" class="event-image">
                    </div>
                </div>
                <div class="card-info-area">
                    <h3 class="event-title">${escapeHTML(auction.title)}</h3>
                    
                    <div class="auction-stats">
                        <div class="stat-item">
                            <div class="stat-item-label">Текущая ставка</div>
                            <div class="stat-item-value">${auction.current_highest_bid || 0} 🎟️</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-item-label">До конца</div>
                            ${timerHtml}
                        </div>
                    </div>
                    
                    ${leaderOrWinnerHtml} 

                    <div class="event-button-container">
                        <button class="history-button" data-auction-id="${auction.id}">История</button>
                        <button class="event-button bid-button" data-auction-id="${auction.id}" ${isDisabled}>
                            ${isEnded ? 'Завершен' : 'Сделать ставку'}
                        </button>
                    </div>
                </div>
            `;
            
            dom.auctionsList.appendChild(card);

            if (auction.bid_cooldown_ends_at && !isEnded) {
                const timerElement = document.getElementById(timerId);
                startCountdown(timerElement, auction.bid_cooldown_ends_at, `auction-${auction.id}`, () => {
                    initialize(false); 
                });
            }
        });
        
        if (isEditMode) {
            const createCard = document.createElement('div');
            createCard.className = 'auction-card create-auction-card';
            createCard.innerHTML = `<i class="fa-solid fa-plus"></i><span>Создать лот</span>`;
            dom.auctionsList.appendChild(createCard);
        }
    }

    //
    // ⬇️ ИЗМЕНЕНИЕ: Parallax-эффект (только влево-вправо) ⬇️
    //
    function initializeParallax() {
        const cards = document.querySelectorAll('.event-image-container');
        
        cards.forEach(card => {
            const image = card.querySelector('.event-image');
            if (!image) return;

            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                // Находим позицию курсора по X
                const x = e.clientX - rect.left - rect.width / 2;
                
                // Вычисляем угол наклона (максимум 8 градусов) только для Y
                const rotateY = (x / (rect.width / 2)) * 8;

                // Применяем 3D-трансформацию (rotateX теперь 0)
                image.style.transform = `perspective(1000px) rotateX(0deg) rotateY(${rotateY}deg) scale(1.05)`;
            });

            // Когда мышь уходит, сбрасываем эффект
            card.addEventListener('mouseleave', () => {
                image.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
            });
        });
    }
    //
    // ⬆️ ИЗМЕНЕНИЕ: Конец ⬆️
    //

    // --- Модальные окна ---

    function showBidModal(auctionId) {
        const auction = currentAuctions.find(a => a.id == auctionId);
        if (!auction) return;
        
        if (!auction.is_active) {
            tg.showAlert("Этот аукцион еще не активен.");
            return;
        }

        dom.bidModalTitle.textContent = `Ставка: ${escapeHTML(auction.title)}`;
        dom.userBalanceDisplay.textContent = userData.tickets || 0;
        dom.bidAuctionIdInput.value = auction.id;
        
        const label = dom.bidModal.querySelector('label');
        const currentBid = auction.current_highest_bid || 0;
        
        const isLeader = userData.profile && (auction.current_highest_bidder_id === userData.profile.telegram_id);

        if (isLeader) {
            label.textContent = "Добавить к ставке (билеты)";
            dom.bidAmountInput.placeholder = "Например: 10";
            dom.bidAmountInput.min = 1;
            dom.bidCurrentMinInput.value = currentBid; 
        } else {
            const minBid = currentBid + 1;
            label.textContent = "Ваша ставка (билеты)";
            dom.bidAmountInput.placeholder = `Больше ${currentBid} 🎟️`;
            dom.bidAmountInput.min = minBid;
            dom.bidCurrentMinInput.value = minBid; 
        }
        
        dom.bidAmountInput.value = ''; 

        showModal(dom.bidModal);
        dom.bidAmountInput.focus();
    }

    async function showHistoryModal(auctionId) {
        const auction = currentAuctions.find(a => a.id == auctionId);
        if (!auction) return;

        dom.historyModalTitle.textContent = `История: ${escapeHTML(auction.title)}`;
        dom.historyList.innerHTML = '<li><i>Загрузка истории...</i></li>';
        showModal(dom.historyModal);
        
        try {
            const history = await makePublicGetRequest(`/api/v1/auctions/history/${auctionId}`, false); 
            
            if (!history || history.length === 0) {
                dom.historyList.innerHTML = '<li><i>Ставок еще не было.</i></li>';
                return;
            }

            dom.historyList.innerHTML = history.slice(0, 10).map(bid => {
                const date = new Date(bid.created_at).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                
                let displayName = 'Аноним';
                let iconHtml = '<i class="fa-solid fa-user user-icon"></i>';
                
                if (bid.user) {
                    if (bid.user.twitch_login) {
                        displayName = bid.user.twitch_login;
                        iconHtml = '<i class="fa-brands fa-twitch twitch-icon"></i>';
                    } else if (bid.user.full_name) {
                        displayName = bid.user.full_name;
                    }
                }

                return `
                    <li class="participant-item">
                        <span class="participant-rank">${date}</span>
                        <span class="participant-name">
                            ${iconHtml}
                            ${escapeHTML(displayName)}
                        </span>
                        <span class="participant-tickets">${bid.bid_amount} 🎟️</span>
                    </li>
                `;
            }).join('');

        } catch (e) {
            dom.historyList.innerHTML = '<li><i>Не удалось загрузить историю.</i></li>';
        }
    }

    function showEditModal(auctionId = null) {
        if (auctionId) {
            const auction = currentAuctions.find(a => a.id == auctionId);
            if (!auction) return;
            
            dom.editModalTitle.textContent = 'Редактировать лот';
            dom.editAuctionId.value = auction.id;
            dom.editAuctionTitle.value = auction.title;
            dom.editAuctionImage.value = auction.image_url;
            dom.editAuctionCooldown.value = auction.bid_cooldown_hours;
            dom.editAuctionActive.checked = auction.is_active;
            dom.editAuctionVisible.checked = auction.is_visible;
        } else {
            dom.editModalTitle.textContent = 'Создать лот';
            dom.editModalForm.reset(); 
            dom.editAuctionId.value = '';
            dom.editAuctionCooldown.value = 4; 
            dom.editAuctionActive.checked = false;
            dom.editAuctionVisible.checked = false;
        }
        showModal(dom.editModal);
    }


    function showModal(modal) {
        modal.classList.remove('hidden');
        if (dom.adminControls) dom.adminControls.style.display = 'none';
    }

    function hideModal(modal) {
        modal.classList.add('hidden');
        if (userData.is_admin && dom.adminControls) {
            dom.adminControls.style.display = 'block';
        }
    }

    // --- Обработчики событий ---

    document.body.addEventListener('click', (e) => {
        const target = e.target;
        
        if (target.matches('.modal-close-btn')) {
            hideModal(target.closest('.modal-overlay'));
            return; 
        }

        const button = target.closest('button');
        const card = target.closest('.create-auction-card');

        if (isEditMode) {
            if (button?.matches('.card-edit-btn')) {
                e.stopPropagation();
                showEditModal(button.dataset.auctionId);
            }
            
            else if (button?.matches('.card-reset-btn')) {
                e.stopPropagation();
                const auctionId = button.dataset.auctionId;
                tg.showConfirm('Вы уверены, что хотите сбросить этот лот? Старый лот и все ставки будут удалены, а вместо него появится клон (как в Розыгрышах).', async (ok) => {
                    if (ok) {
                        try {
                            const result = await makeApiRequest('/api/v1/admin/auctions/clear_participants', { id: parseInt(auctionId) });
                            tg.showAlert(result.message || 'Лот сброшен и пересоздан.');
                            initialize(true);
                        } catch(e) { /* Ошибка уже показана */ }
                    }
                });
            }
            
            else if (button?.matches('.card-finish-btn')) {
                e.stopPropagation();
                const auctionId = button.dataset.auctionId;
                tg.showConfirm('Вы уверены, что хотите завершить этот аукцион? Билеты будут списаны, уведомления отправлены.', async (ok) => {
                    if (ok) {
                        try {
                            const result = await makeApiRequest('/api/v1/admin/auctions/finish_manual', { id: parseInt(auctionId) });
                            tg.showAlert(result.message || 'Аукцион завершен.');
                            initialize(true); 
                        } catch(e) { /* Ошибка уже показана */ }
                    }
                });
            }
            else if (button?.matches('.card-delete-btn')) {
                e.stopPropagation();
                const auctionId = button.dataset.auctionId;
                tg.showConfirm('Вы уверены, что хотите удалить этот лот?', async (ok) => {
                    if (ok) {
                        try {
                            await makeApiRequest('/api/v1/admin/auctions/delete', { id: parseInt(auctionId) });
                            tg.showAlert('Лот удален.');
                            initialize(true); 
                        } catch(e) { /* Ошибка уже показана */ }
                    }
                });
            }
            else if (card) {
                showEditModal(null);
            }
            return; 
        }

        // --- Логика для Пользователя ---

        if (button?.matches('.bid-button')) {
            showBidModal(button.dataset.auctionId);
        }

        if (button?.matches('.history-button')) {
            showHistoryModal(button.dataset.auctionId);
        }
    });

    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideModal(modal);
            }
        });
    });

    dom.bidModalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const auctionId = parseInt(dom.bidAuctionIdInput.value);
        const amountInput = parseInt(dom.bidAmountInput.value);
        
        const auction = currentAuctions.find(a => a.id == auctionId);
        if (!auction) return; 

        const isLeader = userData.profile && (auction.current_highest_bidder_id === userData.profile.telegram_id);
        
        let finalBidAmount = 0;
        let costToUser = 0;

        if (isLeader) {
            if (isNaN(amountInput) || amountInput < 1) {
                tg.showAlert("Сумма добавления должна быть 1 🎟️ или больше.");
                return;
            }
            finalBidAmount = (auction.current_highest_bid || 0) + amountInput;
            costToUser = finalBidAmount; 
        } else {
            const minAmount = parseInt(dom.bidCurrentMinInput.value);
            finalBidAmount = amountInput;
            if (isNaN(finalBidAmount) || finalBidAmount < minAmount) {
                tg.showAlert(`Ваша ставка должна быть ${minAmount} 🎟️ или больше.`);
                return;
            }
            costToUser = finalBidAmount;
        }

        if (costToUser > (userData.tickets || 0)) {
            tg.showAlert('У вас недостаточно билетов для этой ставки.');
            return;
        }
        
        try {
            await makeApiRequest('/api/v1/auctions/bid', {
                auction_id: auctionId,
                bid_amount: finalBidAmount 
            });
            
            tg.showAlert('Ваша ставка принята!');
            hideModal(dom.bidModal);
            initialize(false); 

        } catch (e) {
            console.error(e);
            initialize(false);
        }
    });
    
    if (dom.editToggle) {
        dom.editToggle.addEventListener('change', () => {
            isEditMode = dom.editToggle.checked;
            renderPage(currentAuctions);
            initializeParallax(); // Повторно применяем Parallax
        });
    }

    dom.editModalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const auctionId = dom.editAuctionId.value ? parseInt(dom.editAuctionId.value) : null;
        
        let url = '';
        let payload = {};

        if (auctionId) {
            url = '/api/v1/admin/auctions/update';
            payload = {
                id: auctionId,
                title: dom.editAuctionTitle.value,
                image_url: dom.editAuctionImage.value,
                bid_cooldown_hours: parseInt(dom.editAuctionCooldown.value),
                is_active: dom.editAuctionActive.checked,
                is_visible: dom.editAuctionVisible.checked
            };
        } else {
            url = '/api/v1/admin/auctions/create';
            payload = {
                title: dom.editAuctionTitle.value,
                image_url: dom.editAuctionImage.value,
                bid_cooldown_hours: parseInt(dom.editAuctionCooldown.value),
                is_active: dom.editAuctionActive.checked,
                is_visible: dom.editAuctionVisible.checked
            };
        }
        
        try {
            await makeApiRequest(url, payload);
            tg.showAlert(auctionId ? 'Лот обновлен' : 'Лот создан');
            hideModal(dom.editModal);
            initialize(false); 
        } catch(e) { /* Ошибка уже показана */ }
    });


    // --- Инициализация ---

    async function initialize(showMainLoader = true) {
        if (showMainLoader) {
            dom.loader.classList.remove('hidden');
        }
        try {
            userData = await makeApiRequest('/api/v1/user/me', {}, 'POST', false);
            
            let auctionsData = [];
            if (userData.is_admin) {
                if (dom.adminControls) dom.adminControls.style.display = 'block';
                auctionsData = await makeApiRequest('/api/v1/admin/auctions/list', {}, 'POST', false);
            } else {
                auctionsData = await makePublicGetRequest('/api/v1/auctions/list', false);
            }
            
            renderPage(auctionsData || []);
            
            initializeParallax();

        } catch (e) {
            console.error("Критическая ошибка при загрузке страницы", e);
            if (dom.auctionsList) {
                dom.auctionsList.innerHTML = '<p style="text-align: center; color: var(--danger-color);">Не удалось загрузить аукционы.</p>';
            }
        } finally {
            if (showMainLoader) {
                dom.loader.classList.add('hidden');
            }
        }
    }

    initialize(true);
});
