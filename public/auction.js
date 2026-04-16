// auction.js
document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 🛡️ ЗАЩИТА: ПРОВЕРКА ТЕХ. РЕЖИМА (КЛИЕНТ)
    // ==========================================
    async function checkMaintenance() {
        try {
            // Проверяем статус сервера
            const res = await fetch('/api/v1/bootstrap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: window.Telegram?.WebApp?.initData || '' })
            });

            if (res.ok) {
                const data = await res.json();
                
                // Если включен режим сна (maintenance: true)
                if (data.maintenance) {
                    console.warn("⛔ Тех. режим включен. Редирект на главную.");
                    // Убираем всё содержимое, чтобы пользователь не видел интерфейс
                    document.body.innerHTML = ""; 
                    // Перекидываем на заглушку
                    window.location.href = '/'; 
                    return; // Останавливаем выполнение скрипта
                }
            }
        } catch (e) {
            console.error("Ошибка проверки статуса:", e);
        }
    }

    // Запускаем проверку ПЕРВЫМ ДЕЛОМ
    checkMaintenance();
    // ==========================================

    const tg = window.Telegram.WebApp;
    try {
        tg.ready();
        tg.expand();
    } catch (e) {
        console.warn("Telegram WebApp script not loaded or running in browser.");
    }

    function goBack() {
        // Проверяем историю браузера
        if (window.history.length > 1 && document.referrer) {
            window.history.back();
        } else {
            // Если истории нет, идем в меню
            window.location.href = '/menu';
        }
    }

    // 1. Настраиваем HTML кнопку
    const headerBackBtn = document.getElementById('header-back-btn');
    if (headerBackBtn) {
        headerBackBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Отменяем переход по ссылке #
            goBack();
        });
    }

    // 2. Настраиваем нативную кнопку Telegram (в шапке)
    if (tg.BackButton) {
        tg.BackButton.show();
        tg.BackButton.onClick(() => {
            goBack();
        });
    }

    // Глобальные переменные
    let countdownIntervals = {};
    let userData = {};
    let currentAuctions = [];
    let isPageVisible = true;
    
    // === ВСТАВИТЬ СЮДА ===
    const RARITY_COLORS = {
        common: '#b0c3d9',      // Ширпотреб
        uncommon: '#5e98d9',    // Промышленное
        rare: '#4b69ff',        // Армейское
        mythical: '#8847ff',    // Запрещенное
        legendary: '#d32ce6',   // Засекреченное
        ancient: '#eb4b4b',     // Тайное
        immortal: '#e4ae39'     // Нож
    };

    const WEAR_NAMES = {
        'Factory New': 'Прямо с завода',
        'Minimal Wear': 'Немного поношенное',
        'Field-Tested': 'После полевых',
        'Well-Worn': 'Поношенное',
        'Battle-Scarred': 'Закаленное в боях'
    };
    // =====================

   // 🛡 УЛЬТИМАТИВНАЯ ЗАЩИТА: AFK-Таймер (Детектор бездействия)
    
    let idleTimer = null;
    const IDLE_TIMEOUT = 30000; // 30 секунд без движений = сон (можешь изменить)

    function pauseApp() {
        if (!isPageVisible) return; // Уже спим
        isPageVisible = false;
        if (smartPollTimer) clearTimeout(smartPollTimer);
        console.log("💤 Аппка уснула (AFK)"); // Можешь удалить console.log потом
    }

    function resumeApp() {
        if (isPageVisible) return; // Уже работаем
        isPageVisible = true;
        if (typeof updateAuctionsBackground === 'function') {
             updateAuctionsBackground(); 
        }
        startAutoRefresh();
        console.log("☀️ Аппка проснулась!");
    }

    function resetIdleTimer() {
        // Если спали — просыпаемся от любого движения
        if (!isPageVisible) resumeApp();
        
        // Сбрасываем таймер засыпания
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(pauseApp, IDLE_TIMEOUT);
    }

    // Отслеживаем любую активность пользователя (мышь, тапы, скролл, клавиатура)
    const activeEvents = ['mousemove', 'touchstart', 'scroll', 'keydown', 'click'];
    activeEvents.forEach(event => {
        document.addEventListener(event, resetIdleTimer, { passive: true });
    });

    // Запускаем AFK-таймер при загрузке
    resetIdleTimer();

    // Оставляем стандартную защиту от полного сворачивания (для мобилок)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) pauseApp();
        else resetIdleTimer();
    });

    function escapeHTML(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, match => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'})[match]);
    }

    // 🔥 НОВАЯ ФУНКЦИЯ: Очистка рекламы из ника
    function cleanName(str) {
        if (typeof str !== 'string') return 'Аноним';
        
        // Список фраз для удаления (регистронезависимо)
        const bannedPhrases = [
            '@cs_shot_bot', 
            't.me/', 
            'cs.money' // Можешь добавлять свои варианты сюда
        ];

        let cleanStr = str;
        bannedPhrases.forEach(phrase => {
            // Создаем регулярку для глобального удаления без учета регистра
            const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            cleanStr = cleanStr.replace(regex, '');
        });

        // Убираем лишние пробелы. Если имя стало пустым, пишем "Пользователь"
        return cleanStr.trim() || 'Пользователь';
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
                        winnerName = cleanName(item.winner.full_name); 
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

        const visibleAuctions = auctions.filter(a => !a.ended_at);

        if (!visibleAuctions || visibleAuctions.length === 0) {
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

            const isEnded = !!auction.ended_at;
            const timerId = `timer-${auction.id}`;
            
            const timerHtml = (auction.bid_cooldown_ends_at && !isEnded)
                ? `<div class="stat-item-value timer" id="${timerId}">...</div>`
                : `<div class="stat-item-value">${isEnded ? 'ЗАВЕРШЕН' : '00:00:00'}</div>`;

            const isDisabled = isEnded ? 'disabled' : '';

            // === ВСТАВИТЬ ЛОГИКУ ЦВЕТОВ ===
            const rarityKey = auction.rarity;
            const rarityColor = RARITY_COLORS[rarityKey] || 'var(--text-primary)';
            const titleStyle = rarityKey ? `style="color: ${rarityColor}; text-shadow: 0 0 10px ${rarityColor}40;"` : '';
            
            const wearKey = auction.wear;
            const wearText = WEAR_NAMES[wearKey] || '';
            // ==============================
            
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
                    // 🔥 БЫЛО: displayName = auction.bidder.full_name || 'ㅤ';
                    // 🔥 СТАЛО:
                    displayName = cleanName(auction.bidder.full_name); 
                    iconHtml = '<i class="fa-solid fa-user user-icon"></i>';
                }
            } else if (auction.current_highest_bidder_name) {
                // 🔥 БЫЛО: displayName = auction.current_highest_bidder_name;
                // 🔥 СТАЛО:
                displayName = cleanName(auction.current_highest_bidder_name);
                iconHtml = '<i class="fa-solid fa-user user-icon"></i>';
            }

            if (isEnded && (auction.bidder || auction.current_highest_bidder_name)) {
                leaderOrWinnerHtml = `
                    <div class="stat-item winner-block" style="margin-bottom: 12px;">
                        <div class="stat-item-label">Победитель</div>
                        <div class="stat-item-value winner-name" id="leader-value-${auction.id}">
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
                        <div class="stat-item-value" id="leader-value-${auction.id}">
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
                <div class="card-display-area">
                    <div class="event-image-container">
                        ${restrictionsHtml} 
                        
                        <div style="position:absolute; bottom:0; left:0; width:100%; height:3px; background:${rarityColor}; z-index:5; opacity:0.8;"></div>
                        
                        <img src="${escapeHTML(auction.image_url || 'https://i.postimg.cc/d0r554hc/1200-600.png?v=2')}" alt="${escapeHTML(auction.title)}" class="event-image">
                    </div>
                </div>
                
                <div class="card-info-area">
                    <h3 class="event-title" ${titleStyle}>${escapeHTML(auction.title)}</h3>
                    
                    ${wearText ? `<div class="auction-wear-text">${wearText}</div>` : ''}
                    
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

       // --- НАЧАЛО ИЗМЕНЕНИЙ ---
        // Надежное получение ID пользователя (учитываем разную структуру ответа API)
        const myId = userData.telegram_id || (userData.profile && userData.profile.telegram_id);
        
        // Проверяем, является ли текущий пользователь лидером
        const isLeader = myId && (auction.current_highest_bidder_id === myId);
        
        if (isLeader) {
             tg.showAlert("🏆 Вы уже лидируете в этом аукционе!\n\nНет смысла перебивать самого себя.");
             return;
        }
        // --- КОНЕЦ ИЗМЕНЕНИЙ ---

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
                        // 🔥 БЫЛО: displayName = bid.user.full_name;
                        // 🔥 СТАЛО:
                        displayName = cleanName(bid.user.full_name);
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


    function showModal(modal) {
        modal.classList.remove('hidden');
    }

    function hideModal(modal) {
        modal.classList.add('hidden');
    }

    // --- Обработчики событий ---

    document.body.addEventListener('click', (e) => {
        const target = e.target;
        
        if (target.matches('.modal-close-btn')) {
            hideModal(target.closest('.modal-overlay'));
            return; 
        }

        const button = target.closest('button');

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

                // --- НАЧАЛО ИЗМЕНЕНИЙ ---
                // 🔒 Блокировка клика для лидера
                const myId = userData.telegram_id || (userData.profile && userData.profile.telegram_id);
                const isLeader = myId && (auction.current_highest_bidder_id === myId);
                
                if (isLeader) {
                     tg.showAlert("🏆 Вы уже лидируете в этом аукционе!\n\nНет смысла перебивать самого себя.");
                     return;
                }
                // --- КОНЕЦ ИЗМЕНЕНИЙ ---

                showBidModal(auctionId);
            }
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

        // --- НАЧАЛО ИЗМЕНЕНИЙ ---
        // 🔥 Определяем myId в самом начале функции надежным способом
        const myId = userData.telegram_id || (userData.profile && userData.profile.telegram_id);

        // Проверка на лидера
        const isLeader = myId && (auction.current_highest_bidder_id === myId);
        
        if (isLeader) {
            tg.showAlert("Вы уже лидируете! Обновите страницу.");
            return;
        }
        // --- КОНЕЦ ИЗМЕНЕНИЙ ---

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

    if (dom.archiveBtn) {
        dom.archiveBtn.addEventListener('click', () => {
            loadArchive();
        });
    }

    // --- УМНОЕ ОБНОВЛЕНИЕ (Smart Polling) ---

    // Заменяем старый autoRefreshInterval на новый умный таймер
    let smartPollTimer = null;

    // 🔥 НОВАЯ ФУНКЦИЯ: Фоновое обновление лотов "на лету"
    async function updateAuctionsBackground() {
        try {
            const newData = await makeApiRequest('/api/v1/auctions/list', {}, 'POST', false);
            
            // 2. Жесткая проверка: если изменилось количество лотов (появился новый или удален) - рендерим с нуля
            if (!currentAuctions || newData.length !== currentAuctions.length) {
                renderPage(newData || []);
                return;
            }

            // Иначе обновляем только цифры в DOM
            newData.forEach(newAuction => {
                const oldAuction = currentAuctions.find(a => a.id === newAuction.id);
                if (!oldAuction) return;

                // Если статус завершения изменился (лот кончился) - перерисовываем полностью, чтобы скрыть таймер
                if (!oldAuction.ended_at && newAuction.ended_at) {
                    renderPage(newData || []);
                    return;
                }

                // Обновляем данные в стейте
                Object.assign(oldAuction, newAuction);
                
                // Вызываем функцию точечного обновления карточки
                updateSingleCardDOM(newAuction);
                
                // Если открыто окно ставки именно для этого лота — обновляем и его
                if (typeof dom !== 'undefined' && dom.bidModal && !dom.bidModal.classList.contains('hidden')) {
                    if (dom.bidAuctionIdInput && dom.bidAuctionIdInput.value == newAuction.id) {
                        updateOpenBidModal(newAuction);
                    }
                }
            });

            currentAuctions = newData;
        } catch (e) {
            console.error("Ошибка фонового обновления:", e);
        }
    }

    function startAutoRefresh() {
        if (smartPollTimer) clearTimeout(smartPollTimer);
        scheduleNextUpdate();
    }

    function scheduleNextUpdate() {
        // Если вкладка свернута, ничего не планируем (продолжится при visibilitychange)
        if (!isPageVisible) return;

        // По умолчанию мы в "Спящем режиме" (обновляем раз в 30 секунд!)
        let nextInterval = 30000; 
        const now = new Date().getTime();
        let isHotPhase = false;

        // Проверяем, есть ли лоты, у которых скоро финиш
        if (currentAuctions && currentAuctions.length > 0) {
            currentAuctions.forEach(auction => {
                if (!auction.ended_at && auction.bid_cooldown_ends_at) {
                    const timeLeft = new Date(auction.bid_cooldown_ends_at).getTime() - now;
                    
                    // Если хотя бы одному активному лоту осталось жить меньше 10 минут (600 000 мс)
                    if (timeLeft > 0 && timeLeft < 600000) {
                        isHotPhase = true;
                    }
                }
            });
        }

        // Если горячая фаза — ускоряем пульс до 10 секунд
        if (isHotPhase) {
            nextInterval = 10000;
        }

        // Планируем следующий запрос
        smartPollTimer = setTimeout(async () => {
            if (isPageVisible) {
                await updateAuctionsBackground();
            }
            // Как только запрос выполнился, планируем следующий
            scheduleNextUpdate(); 
        }, nextInterval);
    }

    // Обновляет только цифры в карточке
    function updateSingleCardDOM(auction) {
        const card = document.getElementById(`auction-card-${auction.id}`);
        if (!card) return; 

        // 1. Обновляем Цену
        const priceEl = card.querySelector('.auction-stats .stat-item:first-child .stat-item-value');
        if (priceEl) {
            const newPriceText = `${auction.current_highest_bid || 0} 🎟️`;
            if (priceEl.textContent !== newPriceText) {
                priceEl.textContent = newPriceText;
                // Зеленая вспышка при изменении цены
                priceEl.style.color = '#34c759'; 
                priceEl.style.transform = 'scale(1.1)';
                priceEl.style.transition = 'all 0.3s';
                setTimeout(() => {
                    priceEl.style.color = '';
                    priceEl.style.transform = 'scale(1)';
                }, 500);
            }
        }

        // 2. Обновляем Лидера (Имя + Иконка)
        const leaderEl = document.getElementById(`leader-value-${auction.id}`);
        if (leaderEl) {
            let displayName = 'Нет ставок';
            let iconHtml = ''; // Пусто, если ставок нет
            let isTwitch = false;

            // Логика определения имени (копия из renderPage)
            if (auction.bidder) {
                if (auction.bidder.twitch_login) {
                    displayName = auction.bidder.twitch_login;
                    iconHtml = '<i class="fa-brands fa-twitch twitch-icon"></i>';
                    isTwitch = true;
                } else {
                    // 🔥 БЫЛО: displayName = auction.bidder.full_name || 'Аноним';
                    // 🔥 СТАЛО:
                    displayName = cleanName(auction.bidder.full_name);
                    iconHtml = '<i class="fa-solid fa-user user-icon"></i>';
                }
            } else if (auction.current_highest_bidder_name) {
                // 🔥 БЫЛО: displayName = auction.current_highest_bidder_name;
                // 🔥 СТАЛО:
                displayName = cleanName(auction.current_highest_bidder_name);
                iconHtml = '<i class="fa-solid fa-user user-icon"></i>';
            }
            
            // Формируем новый HTML
            let newHtmlContent = '';
            
            // Если аукцион завершен, добавляем кубок (для красоты, как в renderPage)
            if (auction.ended_at) {
                 newHtmlContent = `<i class="fa-solid fa-trophy"></i> ${iconHtml} ${escapeHTML(displayName)}`;
            } else {
                 newHtmlContent = `${iconHtml} ${escapeHTML(displayName)}`;
            }

            // Сравниваем старый HTML с новым (чтобы не моргать лишний раз)
            // trim() убирает лишние пробелы для точности сравнения
            if (leaderEl.innerHTML.replace(/\s+/g, ' ').trim() !== newHtmlContent.replace(/\s+/g, ' ').trim()) {
                leaderEl.innerHTML = newHtmlContent;
                
                // Анимация обновления лидера (белая вспышка текста)
                leaderEl.style.opacity = '0.5';
                setTimeout(() => { leaderEl.style.opacity = '1'; }, 300);
            }
        }
    }

    // Обновляет открытое окно ставки, чтобы юзер не ввел меньше минимума
    function updateOpenBidModal(auction) {
        const currentBidInDB = auction.current_highest_bid || 0;
        const minBid = currentBidInDB + 1;
        
        const oldMin = parseInt(dom.bidCurrentMinInput.value);
        
        // Если цена выросла
        if (minBid > oldMin) {
            dom.bidCurrentMinInput.value = minBid;
            dom.bidAmountInput.min = minBid;
            dom.bidAmountInput.placeholder = `Больше ${currentBidInDB} 🎟️`;
            
            // Если введенное значение стало меньше нового минимума, подсвечиваем
            if (dom.bidAmountInput.value && parseInt(dom.bidAmountInput.value) < minBid) {
                dom.bidAmountInput.style.borderColor = '#ff3b30';
            }

            // Моргаем заголовком
            const originalTitle = dom.bidModalTitle.textContent;
            dom.bidModalTitle.style.color = '#ff3b30';
            dom.bidModalTitle.textContent = `ЦЕНА ВЫРОСЛА: ${currentBidInDB} 🎟️`;
            
            setTimeout(() => {
                dom.bidModalTitle.style.color = '';
                // Возвращаем исходный текст, если окно еще то
                if (dom.bidAuctionIdInput.value == auction.id) {
                     dom.bidModalTitle.textContent = `Ставка: ${escapeHTML(auction.title)}`;
                }
            }, 2000);
        }
    }

    async function initialize(showMainLoader = true) {
        if (showMainLoader) {
            dom.loader.classList.remove('hidden');
        }
        try {
            userData = await makeApiRequest('/api/v1/user/me', {}, 'POST', false);
            
            const auctionsData = await makeApiRequest('/api/v1/auctions/list', {}, 'POST', false);
            
            renderPage(auctionsData || []);
            initializeParallax();
            startAutoRefresh();

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

// === ВСТАВИТЬ В САМЫЙ КОНЕЦ ФАЙЛА, ПЕРЕД ЗАКРЫВАЮЩЕЙ СКОБКОЙ ИЛИ ПОСЛЕ НЕЕ ===
function initPullToRefresh() {
    const content = document.getElementById('main-content');
    const ptrContainer = document.getElementById('pull-to-refresh');
    const icon = ptrContainer ? ptrContainer.querySelector('i') : null;
    
    if (!content || !ptrContainer || !icon) return;

    let startY = 0;
    let pulledDistance = 0;
    let isPulling = false;

    content.addEventListener('touchstart', (e) => {
        if (content.scrollTop <= 0) {
            startY = e.touches[0].clientY;
            isPulling = true;
            content.style.transition = 'none'; 
            ptrContainer.style.transition = 'none'; 
        } else {
            isPulling = false;
        }
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
            
            icon.style.color = pulledDistance > 80 ? "#34c759" : "#FFD700";
        }
    }, { passive: false });

    content.addEventListener('touchend', () => {
        if (!isPulling) return;
        isPulling = false;
        
        content.style.transition = 'transform 0.3s ease-out';
        ptrContainer.style.transition = 'transform 0.3s ease-out';

        if (pulledDistance > 80) {
            content.style.transform = `translateY(80px)`;
            ptrContainer.style.transform = `translateY(80px)`;
            icon.classList.add('fa-spin');
            if (window.Telegram?.WebApp?.HapticFeedback) {
                Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
            setTimeout(() => { window.location.reload(); }, 500);
        } else {
            content.style.transform = 'translateY(0px)';
            ptrContainer.style.transform = 'translateY(0px)';
            icon.style.transform = 'rotate(0deg)';
        }
        pulledDistance = 0;
    });
}

// Запуск
document.addEventListener('DOMContentLoaded', initPullToRefresh);
