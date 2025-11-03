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
        historyList: document.getElementById('bids-history-list')
    };

    // --- Вспомогательные функции ---

    function escapeHTML(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, match => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'})[match]);
    }

    async function makeApiRequest(url, body = {}, method = 'POST') {
        dom.loader.classList.remove('hidden');
        try {
            const options = {
                method: method,
                headers: { 'Content-Type': 'application/json' },
            };
            
            // Добавляем initData только если это не GET запрос
            if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
                options.body = JSON.stringify({ ...body, initData: tg.initData });
            }

            const response = await fetch(url, options);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || 'Произошла ошибка');
            }
            return result;
        } catch (e) {
            tg.showAlert(e.message);
            throw e;
        } finally {
            dom.loader.classList.add('hidden');
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

            const h = Math.floor(distance / 3600000); // Часы
            const m = Math.floor((distance % 3600000) / 60000); // Минуты
            const s = Math.floor((distance % 60000) / 1000); // Секунды
            
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
            return;
        }

        currentAuctions = auctions; // Сохраняем в кэш

        auctions.forEach(auction => {
            const card = document.createElement('div');
            card.className = 'auction-card';
            card.id = `auction-card-${auction.id}`;

            const timerId = `timer-${auction.id}`;
            const timerHtml = auction.bid_cooldown_ends_at
                ? `<div class="stat-item-value timer" id="${timerId}">...</div>`
                : `<div class="stat-item-value">00:00:00</div>`;

            // Проверяем, завершен ли аукцион
            const isEnded = !!auction.ended_at;
            const isDisabled = isEnded ? 'disabled' : '';

            card.innerHTML = `
                <div class="card-display-area">
                    <div class="event-image-container">
                        <img src="${escapeHTML(auction.image_url || 'default-image.png')}" alt="${escapeHTML(auction.title)}" class="event-image">
                    </div>
                </div>
                <div class="card-info-area">
                    <h3 class="event-title">${escapeHTML(auction.title)}</h3>
                    
                    <div class="auction-stats">
                        <div class="stat-item">
                            <div class="stat-item-label">Текущая ставка</div>
                            <div class="stat-item-value">${auction.current_highest_bid} 🎟️</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-item-label">До конца</div>
                            ${timerHtml}
                        </div>
                    </div>
                    
                    <div class="stat-item" style="margin-bottom: 15px;">
                        <div class="stat-item-label">Лидер</div>
                        <div class="stat-item-value">${escapeHTML(auction.current_highest_bidder_name || 'Нет ставок')}</div>
                    </div>

                    <div class="event-button-container">
                        <button class="history-button" data-auction-id="${auction.id}">История</button>
                        <button class="event-button bid-button" data-auction-id="${auction.id}" ${isDisabled}>
                            ${isEnded ? 'Завершен' : 'Сделать ставку'}
                        </button>
                    </div>
                </div>
            `;
            
            dom.auctionsList.appendChild(card);

            // Запускаем таймер для этой карточки, если он есть
            if (auction.bid_cooldown_ends_at && !isEnded) {
                const timerElement = document.getElementById(timerId);
                startCountdown(timerElement, auction.bid_cooldown_ends_at, `auction-${auction.id}`, () => {
                    // Когда таймер истек, перезагружаем данные
                    initialize(); 
                });
            }
        });
    }

    // --- Модальные окна ---

    function showBidModal(auctionId) {
        const auction = currentAuctions.find(a => a.id == auctionId);
        if (!auction) return;

        dom.bidModalTitle.textContent = `Ставка: ${escapeHTML(auction.title)}`;
        dom.userBalanceDisplay.textContent = userData.tickets || 0;
        dom.bidAuctionIdInput.value = auction.id;
        
        const minBid = (auction.current_highest_bid || 0) + 1;
        dom.bidCurrentMinInput.value = minBid;
        dom.bidAmountInput.placeholder = `Больше ${auction.current_highest_bid} 🎟️`;
        dom.bidAmountInput.min = minBid;
        dom.bidAmountInput.value = ''; // Сбрасываем значение

        dom.bidModal.classList.remove('hidden');
        dom.bidAmountInput.focus();
    }

    async function showHistoryModal(auctionId) {
        const auction = currentAuctions.find(a => a.id == auctionId);
        if (!auction) return;

        dom.historyModalTitle.textContent = `История: ${escapeHTML(auction.title)}`;
        dom.historyList.innerHTML = '<li><i>Загрузка истории...</i></li>';
        dom.historyModal.classList.remove('hidden');
        
        try {
            // TODO: Нам нужно будет создать этот API эндпоинт
            const history = await makeApiRequest(`/api/v1/auctions/history/${auctionId}`, {}, 'GET');
            
            if (!history || history.length === 0) {
                dom.historyList.innerHTML = '<li><i>Ставок еще не было.</i></li>';
                return;
            }

            // Рендерим историю (например, последние 10 ставок)
            dom.historyList.innerHTML = history.slice(0, 10).map(bid => {
                const date = new Date(bid.created_at).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                return `
                    <li class="participant-item">
                        <span class="participant-rank">${date}</span>
                        <span class="participant-name">${escapeHTML(bid.user_name || '...')}</span>
                        <span class="participant-tickets">${bid.bid_amount} 🎟️</span>
                    </li>
                `;
            }).join('');

        } catch (e) {
            dom.historyList.innerHTML = '<li><i>Не удалось загрузить историю.</i></li>';
        }
    }

    function hideModal(modal) {
        modal.classList.add('hidden');
    }

    // --- Обработчики событий ---

    document.body.addEventListener('click', (e) => {
        const target = e.target;

        // Клик по кнопке "Сделать ставку"
        if (target.matches('.bid-button')) {
            showBidModal(target.dataset.auctionId);
        }

        // Клик по кнопке "История"
        if (target.matches('.history-button')) {
            showHistoryModal(target.dataset.auctionId);
        }

        // Клик по кнопке "Закрыть" (крестик)
        if (target.matches('.modal-close-btn')) {
            hideModal(target.closest('.modal-overlay'));
        }
    });

    // Клик по фону модалки
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideModal(modal);
            }
        });
    });

    // Отправка формы ставки
    dom.bidModalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const auctionId = parseInt(dom.bidAuctionIdInput.value);
        const amount = parseInt(dom.bidAmountInput.value);
        const minAmount = parseInt(dom.bidCurrentMinInput.value);

        if (isNaN(amount) || amount < minAmount) {
            tg.showAlert(`Ваша ставка должна быть ${minAmount} 🎟️ или больше.`);
            return;
        }

        if (amount > (userData.tickets || 0)) {
            tg.showAlert('У вас недостаточно билетов для этой ставки.');
            return;
        }
        
        try {
            // TODO: Нам нужно будет создать этот API эндпоинт
            await makeApiRequest('/api/v1/auctions/bid', {
                auction_id: auctionId,
                bid_amount: amount
            });
            
            tg.showAlert('Ваша ставка принята!');
            hideModal(dom.bidModal);
            
            // Обновляем данные на странице
            initialize(); 

        } catch (e) {
            // Ошибка (н.п., "Ставка перебита") уже будет показана в makeApiRequest
            console.error(e);
        }
    });

    // --- Инициализация ---

    async function initialize() {
        dom.loader.classList.remove('hidden');
        try {
            // Загружаем данные пользователя и аукционы параллельно
            const [meData, auctionsData] = await Promise.all([
                makeApiRequest('/api/v1/user/me', {}, 'POST'),
                makeApiRequest('/api/v1/auctions/list', {}, 'GET') // TODO: Создать этот API
            ]);
            
            userData = meData || {};
            renderPage(auctionsData || []);

        } catch (e) {
            console.error("Критическая ошибка при загрузке страницы", e);
            dom.auctionsList.innerHTML = '<p style="text-align: center; color: var(--danger-color);">Не удалось загрузить аукционы.</p>';
        } finally {
            dom.loader.classList.add('hidden');
        }
    }

    initialize();
});
