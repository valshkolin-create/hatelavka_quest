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

        // --- НОВЫЕ DOM ЭЛЕМЕНТЫ ДЛЯ АДМИНКИ ---
        adminControls: document.getElementById('admin-controls'),
        editBtn: document.getElementById('edit-btn'),
        
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

    async function makeApiRequest(url, body = {}, method = 'POST') {
        dom.loader.classList.remove('hidden');
        try {
            const options = {
                method: method,
                headers: { 'Content-Type': 'application/json' },
            };
            
            // Добавляем initData
            // (GET-запросы в этом приложении тоже ожидают initData в теле, 
            // но fetch() API не позволяет тело в GET. 
            // Поэтому мы используем POST для 'user/me' и 'admin/auctions/list')
            if (method.toUpperCase() !== 'GET') {
                 options.body = JSON.stringify({ ...body, initData: tg.initData });
            }

            const response = await fetch(url, options);
            
            // Для 204 No Content (например, при удалении)
            if (response.status === 204) {
                 return { success: true }; 
            }
            
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
    
    // Функция для GET-запросов без тела (для публичной истории)
    async function makePublicGetRequest(url) {
        dom.loader.classList.remove('hidden');
        try {
            const response = await fetch(url);
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
        }

        currentAuctions = auctions; // Сохраняем в кэш

        auctions.forEach(auction => {
            const card = document.createElement('div');
            card.className = 'auction-card';
            card.id = `auction-card-${auction.id}`;
            
            // Админ-классы для стилизации
            if (isEditMode) {
                card.classList.add('admin-card');
                if (!auction.is_visible) card.classList.add('admin-hidden');
                if (!auction.is_active) card.classList.add('admin-inactive');
            }


            const timerId = `timer-${auction.id}`;
            const timerHtml = auction.bid_cooldown_ends_at
                ? `<div class="stat-item-value timer" id="${timerId}">...</div>`
                : `<div class="stat-item-value">00:00:00</div>`;

            const isEnded = !!auction.ended_at;
            const isDisabled = isEnded ? 'disabled' : '';

            // --- НОВЫЙ БЛОК: Оверлей для админа ---
            let adminOverlay = '';
            if (isEditMode) {
                adminOverlay = `
                    <div class="edit-overlay">
                        <button class="card-btn card-edit-btn" data-auction-id="${auction.id}" title="Редактировать">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                        <button class="card-btn card-delete-btn" data-auction-id="${auction.id}" title="Удалить">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                `;
            }

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
        
        // --- НОВЫЙ БЛОК: Кнопка "Создать" для админа ---
        if (isEditMode) {
            const createCard = document.createElement('div');
            createCard.className = 'auction-card create-auction-card';
            createCard.innerHTML = `<i class="fa-solid fa-plus"></i><span>Создать лот</span>`;
            dom.auctionsList.appendChild(createCard);
        }
    }

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
        
        const minBid = (auction.current_highest_bid || 0) + 1;
        dom.bidCurrentMinInput.value = minBid;
        dom.bidAmountInput.placeholder = `Больше ${auction.current_highest_bid} 🎟️`;
        dom.bidAmountInput.min = minBid;
        dom.bidAmountInput.value = ''; // Сбрасываем значение

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
            // Используем новый GET-запрос без тела
            const history = await makePublicGetRequest(`/api/v1/auctions/history/${auctionId}`);
            
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

    // --- НОВАЯ ФУНКЦИЯ: Модальное окно админа ---
    function showEditModal(auctionId = null) {
        if (auctionId) {
            // Редактирование
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
            // Создание
            dom.editModalTitle.textContent = 'Создать лот';
            dom.editModalForm.reset(); // Сбрасываем форму
            dom.editAuctionId.value = '';
            dom.editAuctionCooldown.value = 4; // Значение по умолчанию
        }
        showModal(dom.editModal);
    }


    function showModal(modal) {
        modal.classList.remove('hidden');
        if (dom.adminControls) dom.adminControls.style.display = 'none';
    }

    function hideModal(modal) {
        modal.classList.add('hidden');
        if (userData.is_admin) dom.adminControls.style.display = 'block';
    }

    // --- Обработчики событий ---

    document.body.addEventListener('click', (e) => {
        const target = e.target;
        const button = target.closest('button');
        const card = target.closest('.create-auction-card');

        // --- Логика для Админа ---
        if (isEditMode) {
            if (button?.matches('.card-edit-btn')) {
                e.stopPropagation();
                showEditModal(button.dataset.auctionId);
            }
            else if (button?.matches('.card-delete-btn')) {
                e.stopPropagation();
                const auctionId = button.dataset.auctionId;
                tg.showConfirm('Вы уверены, что хотите удалить этот лот?', async (ok) => {
                    if (ok) {
                        try {
                            await makeApiRequest('/api/v1/admin/auctions/delete', { id: parseInt(auctionId) });
                            tg.showAlert('Лот удален.');
                            initialize(); // Перезагружаем список
                        } catch(e) { /* Ошибка уже показана */ }
                    }
                });
            }
            else if (card) {
                // Клик по карточке "Создать"
                showEditModal(null);
            }
            return; // В режиме редактирования не даем нажимать обычные кнопки
        }

        // --- Логика для Пользователя ---

        // Клик по кнопке "Сделать ставку"
        if (button?.matches('.bid-button')) {
            showBidModal(button.dataset.auctionId);
        }

        // Клик по кнопке "История"
        if (button?.matches('.history-button')) {
            showHistoryModal(button.dataset.auctionId);
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
            // Перезагружаем, чтобы увидеть актуальную мин. ставку
            initialize();
        }
    });
    
    // --- НОВЫЕ ОБРАБОТЧИКИ ДЛЯ АДМИНКИ ---
    
    // Кнопка "Редактировать"
    dom.editBtn.addEventListener('click', () => {
        isEditMode = !isEditMode;
        document.body.classList.toggle('edit-mode');
        dom.editBtn.textContent = isEditMode ? 'Закончить' : 'Редактировать';
        dom.editBtn.classList.toggle('active', isEditMode);
        renderPage(currentAuctions); // Перерисовываем страницу с оверлеями
    });

    // Форма Редактирования/Создания
    dom.editModalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const auctionId = dom.editAuctionId.value ? parseInt(dom.editAuctionId.value) : null;
        
        let url = '';
        let payload = {};

        if (auctionId) {
            // Обновление
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
            // Создание
            url = '/api/v1/admin/auctions/create';
            payload = {
                title: dom.editAuctionTitle.value,
                image_url: dom.editAuctionImage.value,
                bid_cooldown_hours: parseInt(dom.editAuctionCooldown.value)
                // is_active и is_visible по умолчанию false на сервере
            };
        }
        
        try {
            await makeApiRequest(url, payload);
            tg.showAlert(auctionId ? 'Лот обновлен' : 'Лот создан');
            hideModal(dom.editModal);
            initialize(); // Перезагружаем
        } catch(e) { /* Ошибка уже показана */ }
    });


    // --- Инициализация ---

    async function initialize() {
        dom.loader.classList.remove('hidden');
        try {
            // Загружаем данные пользователя (всегда)
            userData = await makeApiRequest('/api/v1/user/me', {}, 'POST');
            
            let auctionsData = [];
            if (userData.is_admin) {
                // Админ-запрос
                dom.adminControls.style.display = 'block';
                auctionsData = await makeApiRequest('/api/v1/admin/auctions/list', {}, 'POST');
            } else {
                // Публичный запрос
                auctionsData = await makePublicGetRequest('/api/v1/auctions/list');
            }
            
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
