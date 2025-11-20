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
        editAuctionSnipeMinutes: document.getElementById('auction-snipe-minutes-input'),
        editAuctionActive: document.getElementById('auction-active-input'),
        editAuctionVisible: document.getElementById('auction-visible-input'),
        
        editAuctionMinTickets: document.getElementById('auction-min-tickets-input'), 
        editAuctionMaxTickets: document.getElementById('auction-max-tickets-input'),
        archiveBtn: document.getElementById('archive-btn'),
        archiveModal: document.getElementById('archive-modal'),
        archiveList: document.getElementById('archive-list'),
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
            // Здесь мы только пробрасываем ошибку, чтобы обработать её в месте вызова
            // tg.showAlert(e.message); // <-- Убрали alert отсюда, чтобы не дублировать
            throw e;
        } finally {
            if (showLoader) dom.loader.classList.add('hidden');
        }
    }

    async function loadArchive() {
        dom.archiveList.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div></div>';
        showModal(dom.archiveModal);

        try {
            const archiveData = await makeApiRequest('/api/v1/auctions/archive', {}, 'POST', false);

            if (!archiveData || archiveData.length === 0) {
                dom.archiveList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); font-size: 12px;">История пуста.</p>';
                return;
            }

            dom.archiveList.innerHTML = archiveData.map(item => {
                let winnerName = 'Неизвестно';
                let iconHtml = '<i class="fa-solid fa-user"></i>';

                if (item.winner) {
                    if (item.winner.twitch_login) {
                        winnerName = item.winner.twitch_login;
                        iconHtml = '<i class="fa-brands fa-twitch"></i>';
                    } else {
                        winnerName = item.winner.full_name;
                    }
                }

                return `
                    <div class="archive-item">
                        <img src="${escapeHTML(item.image_url)}" class="archive-item-img" alt="skin">
                        <div class="archive-item-info">
                            <div class="archive-item-title">${escapeHTML(item.title)}</div>
                            <div class="archive-item-winner">
                                ${iconHtml} ${escapeHTML(winnerName)}
                            </div>
                        </div>
                        <div class="archive-item-price">
                            ${item.current_highest_bid} 🎟️
                        </div>
                    </div>
                `;
            }).join('');

        } catch (e) {
            console.error(e);
            dom.archiveList.innerHTML = '<p style="text-align: center; color: var(--danger-color);">Ошибка загрузки.</p>';
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

        const visibleAuctions = isEditMode 
            ? auctions 
            : auctions.filter(a => !a.ended_at);

        // Кнопка создания лота (первая в режиме редактирования)
        if (isEditMode) {
            const createCard = document.createElement('div');
            createCard.className = 'auction-card create-auction-card';
            createCard.innerHTML = `<i class="fa-solid fa-plus"></i><span>Создать лот</span>`;
            dom.auctionsList.appendChild(createCard);
        }

        if ((!visibleAuctions || visibleAuctions.length === 0) && !isEditMode) {
            dom.auctionsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); margin-top: 20px;">Активных аукционов пока нет.</p>';
        }

        currentAuctions = auctions;

        visibleAuctions.forEach(auction => {
            const card = document.createElement('div');
            card.className = 'auction-card';
            card.id = `auction-card-${auction.id}`;
            
            if (auction.max_allowed_tickets && auction.max_allowed_tickets > 0) {
                card.classList.add('beginner-lot');
            }
            
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
                const isAlreadyFinished = !!auction.ended_at;
                adminOverlay = `
                    <div class="edit-overlay">
                        <button class="card-btn card-edit-btn" data-auction-id="${auction.id}" title="Редактировать">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                        <button class="card-btn card-reset-btn" data-auction-id="${auction.id}" title="Сбросить лот (клонировать)">
                            <i class="fa-solid fa-arrow-rotate-left"></i>
                        </button>
                        
                        <button class="card-btn card-finish-btn" 
                                data-auction-id="${auction.id}" 
                                title="${isAlreadyFinished ? 'Уже завершен' : 'Завершить вручную'}"
                                ${isAlreadyFinished ? 'disabled' : ''}> 
                            <i class="fa-solid fa-flag-checkered"></i>
                        </button>
                        
                        <button class="card-btn card-delete-btn" data-auction-id="${auction.id}" title="Удалить">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                `;
            }
            
            let leaderOrWinnerHtml = '';
            let displayName = 'Нет ставок';
            let iconHtml = '';
            
            if (isEnded && !auction.bidder && !auction.current_highest_bidder_name) {
                displayName = 'Не определен';
            } else if (auction.bidder) {
                if (auction.bidder.twitch_login) {
                    displayName = auction.bidder.twitch_login;
                    iconHtml = '<i class="fa-brands fa-twitch twitch-icon"></i>';
                } else {
                    displayName = auction.bidder.full_name || 'ㅤ';
                    iconHtml = '<i class="fa-solid fa-user user-icon"></i>';
                }
            } else if (auction.current_highest_bidder_name) {
                displayName = auction.current_highest_bidder_name;
                iconHtml = '<i class="fa-solid fa-user user-icon"></i>';
            }

            if (isEnded && (auction.bidder || auction.current_highest_bidder_name)) {
                leaderOrWinnerHtml = `
                    <div class="stat-item winner-block" style="margin-bottom: 12px;">
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
                    <div class="stat-item" style="margin-bottom: 12px;">
                        <div class="stat-item-label">${isEnded ? 'Победитель' : 'Лидер'}</div>
                        <div class="stat-item-value">
                            ${iconHtml}
                            ${escapeHTML(displayName)}
                        </div>
                    </div>
                `;
            }

            let myBidHtml = '';
            const isUserBanned = userData.profile && userData.profile.is_banned;
            
            if (!isEnded && !isUserBanned && auction.user_bid_amount > 0 && auction.user_bid_rank > 0) {
                const myId = userData.telegram_id || (userData.profile && userData.profile.telegram_id);
                const isLeader = myId && (auction.current_highest_bidder_id === myId);
                myBidHtml = `
                    <div class="my-bid-stats">
                        <div class="stat-item">
                            <div class="stat-item-label">Ваша ставка</div>
                            <div class="stat-item-value">${auction.user_bid_amount} 🎟️</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-item-label">Ваше место</div>
                            <div class="stat-item-value ${isLeader ? 'timer' : ''}">
                                ${isLeader ? '<i class="fa-solid fa-crown" style="font-size: 0.8em; margin-right: 5px;"></i>' : ''}
                                #${auction.user_bid_rank}
                            </div>
                        </div>
                    </div>
                `;
            }

            let restrictionsHtml = '';
            if (auction.max_allowed_tickets && auction.max_allowed_tickets > 0) {
                restrictionsHtml = `
                    <div class="auction-restriction-badge low-balance-restriction">
                        <i class="fa-solid fa-ban"></i>
                        <span>Вход до ${auction.max_allowed_tickets} 🎟️</span>
                    </div>
                `;
            } else if (auction.min_required_tickets && auction.min_required_tickets > 1) {
                restrictionsHtml = `
                    <div class="auction-restriction-badge high-balance-restriction">
                        <i class="fa-solid fa-crown"></i>
                        <span>ВХОД ОТ ${auction.min_required_tickets} 🎟️</span>
                    </div>
                `;
            }

            card.innerHTML = `
                ${adminOverlay}
                
                <div class="card-display-area">
                    <div class="event-image-container">
                        ${restrictionsHtml} 
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
                    ${myBidHtml}

                    <div class="event-button-container">
                        <button class="history-button" data-auction-id="${auction.id}">Топ по ставкам</button>
                        <button class="event-button bid-button" data-auction-id="${auction.id}" ${isDisabled}>
                            ${isEnded ? 'Завершен' : 'Сделать ставку'}
                        </button>
                    </div>
                </div>
            `;
            
            dom.auctionsList.appendChild(card);

            if (auction.bid_cooldown_ends_at && !isEnded) {
                const timerElement = document.getElementById(timerId);
                const endTime = new Date(auction.bid_cooldown_ends_at).getTime();
                const now = new Date().getTime();

                if (endTime > now) {
                    startCountdown(timerElement, auction.bid_cooldown_ends_at, 'auction-' + auction.id, () => {
                        if (timerElement) timerElement.innerHTML = '<i class="fa-solid fa-hourglass-half fa-spin"></i>';
                        setTimeout(() => { initialize(false); }, 3000);
                    });
                } else {
                    if (timerElement) timerElement.innerHTML = '<span style="font-size: 0.9em; color: var(--accent-color);">Финиш...</span>';
                }
            }
        });

        if (dom.auctionsList.children.length === 1) {
            dom.auctionsList.classList.add('centered');
        } else {
            dom.auctionsList.classList.remove('centered');
        }
    }

    function initializeParallax() {
        const cards = document.querySelectorAll('.event-image-container');
        cards.forEach(card => {
            const image = card.querySelector('.event-image');
            if (!image) return;
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const rotateY = (x / (rect.width / 2)) * 8;
                image.style.transform = `perspective(1000px) rotateX(0deg) rotateY(${rotateY}deg) scale(1.05)`;
            });
            card.addEventListener('mouseleave', () => {
                image.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
            });
        });
    }

    // --- Модальные окна ---

    function showBidModal(auctionId) {
        const auction = currentAuctions.find(a => a.id == auctionId);
        if (!auction) return;
        
        if (!auction.is_active) {
            tg.showAlert("Этот аукцион еще не активен.");
            return;
        }

        // 🔒 [ИСПРАВЛЕНИЕ 1] Снова проверяем лидерство перед открытием
        const isLeader = userData.profile && (auction.current_highest_bidder_id === userData.profile.telegram_id);
        if (isLeader) {
             tg.showAlert("🏆 Вы уже лидируете в этом аукционе!\n\nНет смысла перебивать самого себя.");
             return;
        }

        dom.bidModalTitle.textContent = `Ставка: ${escapeHTML(auction.title)}`;
        dom.userBalanceDisplay.textContent = userData.tickets || 0;
        dom.bidAuctionIdInput.value = auction.id;
        
        const label = dom.bidModal.querySelector('label');
        const currentBid = auction.current_highest_bid || 0;
        
        // Так как лидер не может открыть окно, логика только для новой ставки
        const minBid = currentBid + 1;
        label.textContent = "Ваша ставка (билеты)";
        dom.bidAmountInput.placeholder = `Больше ${currentBid} 🎟️`;
        dom.bidAmountInput.min = minBid;
        dom.bidCurrentMinInput.value = minBid; 
        
        dom.bidAmountInput.value = ''; 

        showModal(dom.bidModal);
        dom.bidAmountInput.focus();
    }

    async function showHistoryModal(auctionId) {
        const auction = currentAuctions.find(a => a.id == auctionId);
        if (!auction) return;

        dom.historyModalTitle.textContent = `Топ 10: ${escapeHTML(auction.title)}`;
        dom.historyList.innerHTML = '<li><i>Загрузка топа...</i></li>';
        showModal(dom.historyModal);
        
        try {
            const leaderboard = await makePublicGetRequest(`/api/v1/auctions/history/${auctionId}`, false); 
            
            if (!leaderboard || leaderboard.length === 0) {
                dom.historyList.innerHTML = '<li><i>Ставок еще не было.</i></li>';
                return;
            }

            dom.historyList.innerHTML = leaderboard.map((bid, index) => {
                const rank = index + 1; 
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
                        <span class="participant-rank"><b>#${rank}</b></span>
                        <span class="participant-name">
                            ${iconHtml}
                            ${escapeHTML(displayName)}
                        </span>
                        <span class="participant-tickets">${bid.bid_amount} 🎟️</span>
                    </li>
                `;
            }).join('');

        } catch (e) {
            dom.historyList.innerHTML = '<li><i>Не удалось загрузить топ.</i></li>';
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
            dom.editAuctionSnipeMinutes.value = auction.snipe_guard_minutes || 5;

            dom.editAuctionMinTickets.value = auction.min_required_tickets || 1;
            dom.editAuctionMaxTickets.value = auction.max_allowed_tickets || 0;

            dom.editAuctionActive.checked = auction.is_active;
            dom.editAuctionVisible.checked = auction.is_visible;
        } else {
            dom.editModalTitle.textContent = 'Создать лот';
            dom.editModalForm.reset(); 
            dom.editAuctionId.value = '';
            dom.editAuctionCooldown.value = 24; 
            dom.editAuctionSnipeMinutes.value = 5;
            dom.editAuctionMinTickets.value = 1;
            dom.editAuctionMaxTickets.value = 0;
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
            const auctionId = parseInt(button.dataset.auctionId);
            const auction = currentAuctions.find(a => a.id == auctionId);
            
            if (auction) {
                // Проверка на участие в других аукционах
                const activeBidElsewhere = currentAuctions.find(a => 
                    a.id !== auctionId && 
                    !a.ended_at && 
                    a.user_bid_amount > 0
                );

                if (activeBidElsewhere) {
                    tg.showAlert(`⛔️ Вы не можете участвовать в этом аукционе.\n\nУ вас уже есть активная ставка в лоте «${activeBidElsewhere.title}». Дождитесь его завершения.`);
                    return; 
                }

                const userTickets = userData.tickets || 0;
                
                // Макс. лимит (для новичков)
                if (auction.max_allowed_tickets && auction.max_allowed_tickets > 0) {
                    if (userTickets > auction.max_allowed_tickets) {
                        const hasBidBefore = auction.user_bid_amount > 0; 
                        if (!hasBidBefore) {
                            tg.showAlert(`🔒 Доступ закрыт!\n\nДанный лот доступен только для баланса до ${auction.max_allowed_tickets} 🎟️.\n\nУ вас сейчас ${userTickets} 🎟️.`);
                            return; 
                        }
                    }
                }
                
                // Мин. лимит (для богатых)
                if (auction.min_required_tickets && userTickets < auction.min_required_tickets) {
                     tg.showAlert(`🔒 Доступ закрыт!\n\nТребуется минимум ${auction.min_required_tickets} 🎟️.\n\nУ вас сейчас ${userTickets} 🎟️.`);
                     return; 
                }

                // 🔒 [ИСПРАВЛЕНИЕ 1] Блокировка клика для лидера
                const isLeader = userData.profile && (auction.current_highest_bidder_id === userData.profile.telegram_id);
                if (isLeader) {
                     tg.showAlert("🏆 Вы уже лидируете в этом аукционе!\n\nНет смысла перебивать самого себя.");
                     return;
                }

                showBidModal(auctionId);
            }
        }

        if (button?.matches('.history-button')) {
            showHistoryModal(button.dataset.auctionId);
        }
    });

    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (modal.id === 'auction-edit-modal') return;
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

        // 🔥 [ИСПРАВЛЕНИЕ] Определяем myId в самом начале функции
        // Это гарантирует, что переменная видна и для проверки лидера, и для обновления UI внизу
        const myId = userData.telegram_id || (userData.profile && userData.profile.telegram_id);

        // Проверка на лидера
        const isLeader = myId && (auction.current_highest_bidder_id === myId);
        
        // 👇 Если вдруг модалка открылась, запрещаем отправку лидеру
        if (isLeader) {
            tg.showAlert("Вы уже лидируете!");
            return;
        }

        let finalBidAmount = 0;
        let costToUser = 0; 

        const minAmount = parseInt(dom.bidCurrentMinInput.value);
        finalBidAmount = amountInput;
        
        if (isNaN(finalBidAmount) || finalBidAmount < minAmount) {
            tg.showAlert(`Ваша ставка должна быть ${minAmount} 🎟️ или больше.`);
            return;
        }
        costToUser = finalBidAmount; 

        const MAX_STEP = 3; 
        const currentBid = auction.current_highest_bid || 0;

        if ((finalBidAmount - currentBid) > MAX_STEP) {
            tg.showAlert(`🚫 Не спешите!\n\nМаксимальный шаг повышения: ${MAX_STEP} 🎟️.`);
            return; 
        }

        if (costToUser > (userData.tickets || 0)) {
            tg.showAlert('У вас недостаточно билетов для этой ставки.'); 
            return;
        }
        
        try {
            // 1. Отправляем запрос на сервер
            await makeApiRequest('/api/v1/auctions/bid', {
                auction_id: auctionId,
                bid_amount: finalBidAmount 
            });
            
            // --- 🔥 НАЧАЛО: ОПТИМИСТИЧНОЕ ОБНОВЛЕНИЕ ИНТЕРФЕЙСА 🔥 ---
            
            const aucIndex = currentAuctions.findIndex(a => a.id === auctionId);
            if (aucIndex !== -1) {
                currentAuctions[aucIndex].current_highest_bid = finalBidAmount;
                currentAuctions[aucIndex].user_bid_amount = finalBidAmount;
                currentAuctions[aucIndex].user_bid_rank = 1;
                
                // 🔥 Используем myId, который мы определили в начале
                currentAuctions[aucIndex].current_highest_bidder_id = myId;
                
                // Безопасное получение имени
                const myName = userData.username || (userData.profile && userData.profile.username) || 
                               userData.full_name || (userData.profile && userData.profile.full_name) || 'Вы';
                               
                currentAuctions[aucIndex].current_highest_bidder_name = myName;
                
                currentAuctions[aucIndex].bidder = {
                    full_name: userData.full_name || (userData.profile && userData.profile.full_name),
                    twitch_login: userData.twitch_login || (userData.profile && userData.profile.twitch_login)
                };
            }

            if (userData.tickets >= costToUser) {
                userData.tickets -= costToUser;
                dom.userBalanceDisplay.textContent = userData.tickets;
            }

            renderPage(currentAuctions);
            
            tg.showAlert('Ваша ставка принята!');
            hideModal(dom.bidModal);
            
            initialize(false); 

        } catch (e) {
            console.error(e);
            tg.showAlert(e.message || "Ошибка при ставке");
            hideModal(dom.bidModal);
            initialize(false);
        }
    });
    
    if (dom.editToggle) {
        dom.editToggle.addEventListener('change', () => {
            isEditMode = dom.editToggle.checked;
            renderPage(currentAuctions);
            initializeParallax(); 
        });
    }

    if (dom.archiveBtn) {
        dom.archiveBtn.addEventListener('click', () => {
            loadArchive();
        });
    }

   dom.editModalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const auctionId = dom.editAuctionId.value ? parseInt(dom.editAuctionId.value) : null;
        
        const rawMaxTickets = dom.editAuctionMaxTickets.value;
        let maxTicketsValue = null;
        if (rawMaxTickets && parseInt(rawMaxTickets) > 0) {
            maxTicketsValue = parseInt(rawMaxTickets);
        }
        const minTicketsValue = parseInt(dom.editAuctionMinTickets.value);

        let url = '';
        let payload = {};

        if (auctionId) {
            url = '/api/v1/admin/auctions/update';
            payload = {
                id: auctionId,
                title: dom.editAuctionTitle.value,
                image_url: dom.editAuctionImage.value,
                bid_cooldown_hours: parseInt(dom.editAuctionCooldown.value),
                snipe_guard_minutes: parseInt(dom.editAuctionSnipeMinutes.value),
                is_active: dom.editAuctionActive.checked,
                is_visible: dom.editAuctionVisible.checked,
                min_required_tickets: minTicketsValue,
                max_allowed_tickets: maxTicketsValue
            };
        } else {
            url = '/api/v1/admin/auctions/create';
            payload = {
                title: dom.editAuctionTitle.value,
                image_url: dom.editAuctionImage.value,
                bid_cooldown_hours: parseInt(dom.editAuctionCooldown.value),
                snipe_guard_minutes: parseInt(dom.editAuctionSnipeMinutes.value),
                is_active: dom.editAuctionActive.checked,
                is_visible: dom.editAuctionVisible.checked,
                min_required_tickets: minTicketsValue,
                max_allowed_tickets: maxTicketsValue
            };
        }
        
        try {
            await makeApiRequest(url, payload);
            tg.showAlert(auctionId ? 'Лот обновлен' : 'Лот создан');
            hideModal(dom.editModal);
            initialize(false); 
        } catch(e) { /* Error already shown */ }
    });

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
                auctionsData = await makeApiRequest('/api/v1/auctions/list', {}, 'POST', false);
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
