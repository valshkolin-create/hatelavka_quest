(function() {
    // ==========================================
    // 1. CSS ШАПКИ, МЕНЮ И БАЗОВОЙ ВЕРСТКИ
    // ==========================================
    const navStyles = `
        :root {
            --bg-main: #121212; 
            --surface-glass: rgba(255, 255, 255, 0.12); 
            --border-glass: rgba(255, 255, 255, 0.06);
            --text-primary: #ffffff;
            --text-muted: #8e8e93;
            --radius-pill: 40px;
            --radius-card: 24px; 
            --primary-color: #ffd700;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }

        html, body {
            width: 100vw; height: 100vh; height: var(--tg-viewport-height, 100vh); 
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            overflow: hidden; background-color: var(--bg-main); color: var(--text-primary);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            overflow-x: hidden; overscroll-behavior-x: none !important;
        }

        .hidden { display: none !important; }

        /* ШАПКА */
        .top-header {
            display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; 
            padding-top: calc(var(--tg-content-safe-area-inset-top, var(--tg-safe-area-inset-top, env(safe-area-inset-top, 24px))) + 55px) !important;
            margin-bottom: 5px !important; position: relative; z-index: 100;
        }

        /* Логотип + Текст */
        .logo-wrapper { display: flex; align-items: center; gap: 14px; cursor: pointer; }
        .app-logo { width: 28px; height: 28px; border-radius: 0; background: transparent; object-fit: contain; }
        .logo-text { display: flex; flex-direction: column; justify-content: center; }
        .logo-title { font-size: 13px; font-weight: 900; color: #fff; line-height: 1; text-transform: uppercase; letter-spacing: 0.3px; }
        .logo-subtitle { font-size: 7px; color: rgba(255, 255, 255, 0.4); font-weight: 800; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }

        /* ЛОГОТИП-УВЕДОМЛЕНИЕ */
        .logo-btn-container {
            position: relative; display: inline-flex; align-items: center; justify-content: center;
            cursor: pointer; transition: transform 0.2s cubic-bezier(0.25, 1, 0.5, 1); width: 28px; height: 28px;
        }
        .logo-btn-container:active { transform: scale(0.9); }
        
        .bell-wrapper { position: absolute; top: -2px; right: -4px; width: 18px; height: 18px; border-radius: 50%; background: #1c1c1e; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.5); border: 1px solid rgba(255, 255, 255, 0.1); z-index: 10; pointer-events: none; }
        .bell-wrapper i { font-size: 9px; color: #ffd700; }
        
        .notif-badge-logo { 
            position: absolute; top: -4px; right: -8px; background: #ff3b30; color: white; font-size: 9px; font-weight: 800; 
            height: 16px; min-width: 16px; padding: 0 4px; border-radius: 8px; border: 2px solid var(--bg-main); 
            box-shadow: 0 2px 6px rgba(255, 59, 48, 0.5); display: flex; align-items: center; justify-content: center; 
            box-sizing: border-box; z-index: 11; 
        }

        /* Баланс, Аватар, Бургер */
        .header-right-group { display: flex; align-items: center; gap: 6px; }
        .balance-pill { background: rgba(30, 30, 32, 0.5); backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px; padding: 3px 4px 3px 10px; display: flex; align-items: center; gap: 8px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.1); transition: transform 0.1s, background 0.2s; width: auto; min-width: max-content; white-space: nowrap; }
        .balance-pill:active { transform: scale(0.96); background: rgba(40, 40, 42, 0.7); }
        .balance-col { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .balance-row { display: flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 800; line-height: 1; color: #fff; font-family: 'SF Mono', 'Roboto Mono', monospace; }
        .refresh-icon-wrapper { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.02); width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        #refresh-icon { font-size: 9px; color: #8E8E93; transition: color 0.2s; }
        .balance-pill:active #refresh-icon { color: #fff; }
        .user-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; background: #2c2c2e; }

        /* Бургер */
        .glass-burger { width: 28px; height: 28px; border-radius: 8px; background: rgba(255, 255, 255, 0.02); backdrop-filter: blur(25px); border: 1px solid rgba(255, 255, 255, 0.06); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; cursor: pointer; outline: none; }
        .glass-burger span { display: block; width: 12px; height: 1.5px; background-color: rgba(255, 255, 255, 0.85); border-radius: 2px; }
        .glass-burger:active { transform: scale(0.92); background: rgba(255,255,255,0.1); }

        /* Боковое меню */
        .side-menu-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(5px); z-index: 9999; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
        .side-menu-overlay.active { opacity: 1; pointer-events: auto; }
        .side-menu-content { position: absolute; top: 0; right: -100%; width: 100%; height: 100%; background: rgba(28, 28, 30, 0.75); backdrop-filter: blur(25px); transition: right 0.4s cubic-bezier(0.25, 1, 0.5, 1); padding: calc(var(--tg-content-safe-area-inset-top, env(safe-area-inset-top, 24px)) + 65px) 25px 25px 25px; box-sizing: border-box; display: flex; flex-direction: column; }
        .side-menu-overlay.active .side-menu-content { right: 0; }
        .side-menu-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; padding-top: 10px; }
        .icon-btn { background: transparent; border: none; color: #fff; font-size: 24px; cursor: pointer; outline: none; }
        .side-nav { display: flex; flex-direction: column; gap: 10px; }
        .side-nav a { display: flex; align-items: center; gap: 15px; color: var(--text-primary); text-decoration: none; font-size: 16px; font-weight: 600; padding: 15px; border-radius: 12px; background: rgba(255, 255, 255, 0.08); transition: background 0.2s; }
        .side-nav a:active { background: rgba(255, 255, 255, 0.15); }

        /* МОДАЛКИ (КУПОНЫ, FAQ, ALERTS) */
        .modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(5px); z-index: 10002; opacity: 0; visibility: hidden; transition: opacity 0.3s ease, visibility 0.3s ease; display: flex; align-items: center; justify-content: center; }
        .modal:not(.hidden) { opacity: 1; visibility: visible; }
        .modal-content { background: #1c1c1e; width: 90%; max-width: 360px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 20px 50px rgba(0,0,0,0.7); padding: 24px; display: flex; flex-direction: column; gap: 16px; position: relative; z-index: 10000;}
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
        
        .custom-confirm-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 90000; background: rgba(0,0,0,0.7); backdrop-filter: blur(5px); display: flex; align-items: center; justify-content: center; opacity: 0; visibility: hidden; transition: 0.2s; }
        .custom-confirm-overlay.visible { opacity: 1; visibility: visible; pointer-events: auto; }
        .custom-confirm-box { background: #1c1c1e; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; width: 85%; max-width: 320px; text-align: center; transform: scale(0.9); transition: 0.2s; }
        .custom-confirm-overlay.visible .custom-confirm-box { transform: scale(1); }
        .confirm-title { color: #fff; font-size: 18px; font-weight: 700; margin: 0 0 8px; }
        .confirm-subtitle { color: #8E8E93; font-size: 13px; margin: 0 0 20px; line-height: 1.4; }
        .confirm-buttons { display: flex; gap: 12px; }
        .confirm-btn { flex: 1; padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; border: none; transition: transform 0.1s; }
        .confirm-btn:active { transform: scale(0.95); }
        .btn-cancel-modal { background: rgba(255,255,255,0.1); color: #fff; }
        .btn-yellow-modal { background: #ffcc00; color: #000; }

        /* Адаптация */
        body.android-mode .top-header { padding-top: calc(var(--tg-content-safe-area-inset-top, 0px) + 35px) !important; }
        body.desktop-platform .top-header { padding-top: 15px !important; margin-bottom: 5px !important; }
        @media (min-width: 768px) { body { max-width: 480px; margin: 0 auto; border-left: 1px solid rgba(255,255,255,0.1); border-right: 1px solid rgba(255,255,255,0.1); position: relative; } }
        html.vk-mode, html.vk-mode body { position: fixed !important; overflow: hidden !important; background-color: #000; }
    `;

    // ==========================================
    // 2. HTML ШАПКИ, МЕНЮ И КУПОНОВ
    // ==========================================
    const navHtml = `
        <div id="side-menu-overlay" class="side-menu-overlay">
            <div class="side-menu-content">
                <div class="side-menu-header">
                    <h3 id="fullName">Профиль</h3>
                    <button id="close-menu-btn" class="icon-btn"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <nav class="side-nav">
                    <a href="/profile"><i class="fa-solid fa-user"></i> Мой Профиль</a>
                    <a href="/quests"><i class="fa-solid fa-check-double"></i> Задания</a>
                    <a href="/leaderboard"><i class="fa-solid fa-trophy"></i> Лидербоард</a>
                    <a href="/menu"><i class="fa-solid fa-gear"></i> Настройки</a>
                    <a href="#" onclick="if(typeof showFaq === 'function') showFaq(); return false;"><i class="fa-solid fa-circle-question"></i> Как пользоваться приложением?</a>
                    <a href="#" onclick="if(typeof openCouponModal === 'function') openCouponModal(); return false;">
                        <i class="fa-solid fa-ticket-simple" style="color: #34c759;"></i> Активировать купон
                    </a>
                    <a href="/admin" id="nav-admin" class="hidden" style="color: #ff3b30;"><i class="fa-solid fa-shield"></i> Админ-па-нель</a>
                </nav>
            </div>
        </div>

        <!-- МОДАЛКА КУПОНОВ (ВШИТО) -->
        <div id="coupon-modal" class="modal hidden">
            <div class="modal-content" style="text-align: center; max-width: 320px;">
                <div class="modal-header">
                    <h3 style="margin: 0; color: #fff;">Активация</h3>
                    <button onclick="closeCouponModal()" class="icon-btn" style="font-size: 20px;"><i class="fa-solid fa-xmark"></i></button>
                </div>
                
                <div style="font-size: 45px; margin: 10px 0; animation: pulse 2s infinite;">🎟️</div>
                <p style="font-size: 11px; color: #8e8e93; margin-bottom: 15px; padding: 0 10px;">
                    Введите секретный код, чтобы получить бонус на ваш аккаунт
                </p>
                
                <div style="position: relative; margin-bottom: 15px;">
                    <input type="text" id="coupon-input" placeholder="КОД" autocapitalize="off" spellcheck="false"
                           style="width: 100%; background: #2c2c2e; border: 1px solid rgba(255,255,255,0.05); color: #fff; padding: 14px 45px 14px 16px; border-radius: 14px; font-weight: 700; font-size: 14px; text-align: center; letter-spacing: 2px; height: 44px; outline: none; box-sizing: border-box;">
                    
                    <button onclick="pasteCoupon()" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.05); border: none; color: #8e8e93; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                        <i class="fa-solid fa-paste" style="font-size: 12px;"></i>
                    </button>
                </div>
                
                <button id="activate-coupon-btn" class="confirm-btn btn-buy" 
                        style="height: 44px; font-size: 13px; background: linear-gradient(135deg, #34c759 0%, #2ecc71 100%); color: #fff; border-radius: 10px;" 
                        onclick="activateCouponSubmit()">
                    Активировать
                </button>
            </div>
        </div>

        <header class="top-header">
            <div class="logo-wrapper">
                <div id="logo-notification-btn" class="logo-btn-container" onclick="if(typeof openNotificationsHistory === 'function') openNotificationsHistory()">
                    <img src="https://i.postimg.cc/T3J3WhZL/6d40575f-80b0-49ba-a3ce-84890db9a196.png" alt="Logo" class="app-logo">
                    
                    <!-- БЕЙДЖ СНОВА ТУТ: Внутри bell-wrapper как ты просил -->
                    <div class="bell-wrapper">
                        <i class="fa-solid fa-bell"></i>
                        <span id="logo-notification-badge" class="notif-badge-logo hidden">0</span>
                    </div>

                </div>
                <div class="logo-text">
                    <span class="logo-title">HATElavka</span>
                    <span class="logo-subtitle">
                        <a href="https://www.twitch.tv/hatelove_ttv" target="_blank" onclick="if(window.Telegram?.WebApp) { Telegram.WebApp.openLink('https://www.twitch.tv/hatelove_ttv'); return false; }" style="color: #9146ff; text-decoration: none; font-weight: 700;">TWITCH</a> 
                        <span style="color: inherit; margin: 0 2px;">|</span> 
                        <a href="https://t.me/hatelove_ttv" target="_blank" onclick="if(window.Telegram?.WebApp) { Telegram.WebApp.openTelegramLink('https://t.me/hatelove_ttv'); return false; }" style="color: #2AABEE; text-decoration: none; font-weight: 700;">TELEGRAM</a>
                    </span>
                </div>
            </div>

            <div class="header-right-group">
                <div class="balance-pill" onclick="if(typeof checkBalance === 'function') checkBalance(true)">
                    <div class="balance-col">
                        <div class="balance-row"><span id="user-balance">0</span> <i class="fa-solid fa-coins" style="color: #FFD700;"></i></div>
                        <div class="balance-row"><span id="ticketStats">0</span> <i class="fa-solid fa-ticket" style="color: #bdecff;"></i></div>
                    </div>
                    <div class="refresh-icon-wrapper">
                        <i class="fa-solid fa-rotate-right" id="refresh-icon"></i>
                    </div>
                </div>
                <img src="https://via.placeholder.com/64x64/555555/ffffff?text=U" alt="Avatar" class="user-avatar" id="user-avatar" onclick="window.location.href='/profile'">
                <button id="open-menu-btn" class="glass-burger">
                    <span></span><span></span><span></span>
                </button>
            </div>
        </header>
    `;

    // ==========================================
    // 3. ЛОГИКА ВНЕДРЕНИЯ И ДЕТЕКТОРОВ
    // ==========================================
    function initTopNav() {
        if (document.getElementById('side-menu-overlay')) return; 

        // Внедряем CSS
        const styleEl = document.createElement('style');
        styleEl.innerHTML = navStyles;
        document.head.appendChild(styleEl);

        // Внедряем HTML
        const container = document.createElement('div');
        container.innerHTML = navHtml;
        while (container.firstChild) {
            document.body.insertBefore(container.firstChild, document.body.firstChild);
        }

        // Биндим бургер
        const menuBtn = document.getElementById('open-menu-btn');
        const closeMenuBtn = document.getElementById('close-menu-btn');
        const sideMenu = document.getElementById('side-menu-overlay');

        const toggleMenu = (show) => {
            if (show) { 
                sideMenu.classList.add('active'); 
                document.body.style.overflow = 'hidden'; 
            } else { 
                sideMenu.classList.remove('active'); 
                document.body.style.overflow = ''; 
            }
        };

        if (menuBtn) menuBtn.addEventListener('click', () => toggleMenu(true));
        if (closeMenuBtn) closeMenuBtn.addEventListener('click', () => toggleMenu(false));
        if (sideMenu) sideMenu.addEventListener('click', (e) => { 
            if (e.target === sideMenu) toggleMenu(false); 
        });

        // Загружаем аватарку пользователя из кэша
        try {
            const cached = JSON.parse(localStorage.getItem('cache_bootstrap') || '{}');
            if (cached && cached.user && cached.user.photo_url) {
                const avatarEl = document.getElementById('user-avatar');
                if (avatarEl) avatarEl.src = cached.user.photo_url;
            }
        } catch(e){}

        // Запускаем детектор
        detectPlatforms();

        // 🔥 ВАЖНО: АВТОЗАГРУЗКА БАЛАНСА И УВЕДОМЛЕНИЙ ПРИ СТАРТЕ 🔥
        setTimeout(() => {
            if (typeof window.checkBalance === 'function') window.checkBalance(true);
            if (typeof window.fetchNotificationsBadge === 'function') window.fetchNotificationsBadge();
        }, 300);
    }

    function detectPlatforms() {
        window.isVk = false; window.vkParams = null;
        const checkString = (str) => str && (str.includes('vk_app_id') || str.includes('vk_user_id'));
        let rawParams = window.location.search.replace('?', '') || window.location.hash.replace('#', '');
        
        if (!checkString(rawParams) && checkString(window.name)) rawParams = window.name;
        if (!checkString(rawParams) && checkString(document.referrer)) {
            try { rawParams = new URL(document.referrer).search.replace('?', ''); } catch(e){}
        }

        if (checkString(rawParams) || checkString(window.location.href)) {
            window.isVk = true;
            document.documentElement.classList.add('vk-mode');
            window.vkParams = rawParams;
        }

        if (!window.isVk && window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            const platform = tg.platform || 'unknown';
            if (platform === 'tdesktop' || platform === 'macos' || platform === 'web' || platform === 'webk') {
                document.body.classList.add('desktop-platform', 'desktop-mode');
            } else if (platform === 'ios') {
                document.body.classList.add('ios-mode');
            } else if (platform === 'android') {
                document.body.classList.add('android-mode');
            } else {
                document.body.classList.add('desktop-mode');
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTopNav);
    } else {
        initTopNav();
    }

    // ==========================================
    // 4. ГЛОБАЛЬНЫЕ ФУНКЦИИ (МОДАЛКИ, БАЛАНС, КУПОНЫ, FAQ)
    // ==========================================

    // Глобальная функция создания окон (решает проблему "Как пользоваться приложением")
    window.showShopModal = function({ title, subtitle, confirmText, confirmClass, showCancel = true, onConfirm }) {
        const old = document.querySelector('.custom-confirm-overlay'); if (old) old.remove();
        const overlay = document.createElement('div'); overlay.className = 'custom-confirm-overlay';
        
        let cancelBtnHtml = showCancel ? `<button class="confirm-btn btn-cancel-modal" id="modal-cancel">Отмена</button>` : '';

        overlay.innerHTML = `
            <div class="custom-confirm-box">
                <h3 class="confirm-title">${title}</h3>
                <div class="confirm-subtitle" style="white-space: pre-wrap;">${subtitle}</div>
                <div class="confirm-buttons">
                    ${cancelBtnHtml}
                    <button class="confirm-btn ${confirmClass || 'btn-yellow-modal'}" id="modal-confirm">${confirmText}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('visible'));
        
        const close = () => { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 200); };
        if (showCancel) overlay.querySelector('#modal-cancel').onclick = close;
        
        const confirmBtn = overlay.querySelector('#modal-confirm');
        confirmBtn.onclick = () => { 
            if (confirmBtn.dataset.clicked) return; 
            confirmBtn.dataset.clicked = "true";    
            confirmBtn.style.opacity = "0.7";       
            onConfirm(close);                       
        };
        overlay.onclick = (e) => { if(e.target === overlay && showCancel) close(); };
    };

    window.customAlert = function(message, callback) {
        window.showShopModal({
            title: "Внимание", subtitle: message, confirmText: "ПОНЯТНО", confirmClass: "btn-yellow-modal", showCancel: false, 
            onConfirm: (close) => { close(); if(callback) callback(); }
        });
    };

    window.customConfirm = function(message, callback) {
        window.showShopModal({
            title: "Подтверждение", subtitle: message, confirmText: "ДА", confirmClass: "btn-yellow-modal", showCancel: true,
            onConfirm: (close) => { close(); if (callback) callback(true); }
        });
    };

    // Уведомления
    window.updateNotificationBadgeUI = function(count) {
        const badge = document.getElementById('logo-notification-badge');
        const bellIcon = document.querySelector('.bell-wrapper i.fa-bell');
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('hidden');
            if (bellIcon) {
                bellIcon.style.color = '#ffd700';
                bellIcon.style.textShadow = '0 0 8px rgba(255, 215, 0, 0.4)';
            }
        } else {
            badge.classList.add('hidden');
            if (bellIcon) {
                bellIcon.style.color = '';
                bellIcon.style.textShadow = 'none';
            }
        }
    };

    window.fetchNotificationsBadge = async function() {
        const badge = document.getElementById('logo-notification-badge');
        if (!badge) return;
        const bellIcon = document.querySelector('.bell-wrapper i.fa-bell');
        try {
            if(typeof window.makeApiRequest !== 'function') return;
            const res = await window.makeApiRequest('/api/v1/notifications', {}, 'GET', true);
            if (res && res.unread_count > 0) {
                badge.textContent = res.unread_count > 99 ? '99+' : res.unread_count;
                badge.classList.remove('hidden');
                if (bellIcon) {
                    bellIcon.style.color = '#ffd700';
                    bellIcon.style.textShadow = '0 0 8px rgba(255, 215, 0, 0.4)';
                }
            } else {
                badge.classList.add('hidden');
                if (bellIcon) {
                    bellIcon.style.color = '';
                    bellIcon.style.textShadow = 'none';
                }
            }
        } catch (e) {
            console.warn("Не удалось загрузить бейдж", e);
        }
    };

    // Баланс
    let isBalanceLoading = false;
    window.checkBalance = async function(updateUI = true) {
        if (isBalanceLoading) return Promise.resolve();
        isBalanceLoading = true;
        
        const iconCoins = document.getElementById('refresh-icon');
        if (iconCoins) iconCoins.classList.add('fa-spin');

        if (updateUI) {
            try {
                const cached = JSON.parse(localStorage.getItem('smart_balance_cache'));
                if (cached) window.renderBalanceUI(cached.balance, cached.tickets);
            } catch(e) {}
        }

        try {
            if(typeof window.makeApiRequest !== 'function') throw new Error("makeApiRequest not found");
            const data = await window.makeApiRequest('/api/v1/shop/smart_balance', {}, 'POST', true);
            if (updateUI && data) {
                localStorage.setItem('smart_balance_cache', JSON.stringify(data));
                window.renderBalanceUI(data.balance, data.tickets);
            }
        } catch (err) {
            console.warn("[SHOP BALANCE] Фоновое обновление прервано:", err.message);
        } finally { 
            setTimeout(() => { 
                isBalanceLoading = false; 
                const currentIcon = document.getElementById('refresh-icon');
                if (currentIcon) currentIcon.classList.remove('fa-spin'); 
            }, 500); 
        }
    };

    window.renderBalanceUI = function(coins, tickets) {
        if (coins !== undefined) {
            let displayBalance = Number(coins).toLocaleString('ru-RU');
            const balanceEl = document.getElementById('user-balance');
            if (balanceEl && balanceEl.textContent !== displayBalance) { 
                balanceEl.style.opacity = '0.5'; 
                setTimeout(() => { balanceEl.textContent = displayBalance; balanceEl.style.opacity = '1'; }, 150); 
            }
        }
        if (tickets !== undefined) {
            let displayTickets = Math.floor(Number(tickets)).toString();
            const ticketsEl = document.getElementById('ticketStats');
            if (ticketsEl && ticketsEl.textContent !== displayTickets) { 
                ticketsEl.style.opacity = '0.5'; 
                setTimeout(() => { ticketsEl.textContent = displayTickets; ticketsEl.style.opacity = '1'; }, 150); 
            }
        }
    };

    // Купоны
    window.openCouponModal = () => {
        const m = document.getElementById('coupon-modal');
        if(m) m.classList.remove('hidden');
        const i = document.getElementById('coupon-input');
        if(i) i.value = '';
    };

    window.closeCouponModal = () => {
        const m = document.getElementById('coupon-modal');
        if(m) m.classList.add('hidden');
    };

    window.pasteCoupon = async () => {
        try {
            const text = await navigator.clipboard.readText();
            const i = document.getElementById('coupon-input');
            if(i) i.value = text;
            if (window.Telegram?.WebApp?.HapticFeedback) Telegram.WebApp.HapticFeedback.selectionChanged();
        } catch (err) {
            window.customAlert('Не удалось вставить текст. Проверьте разрешения браузера.');
        }
    };

    window.activateCouponSubmit = async () => {
        const input = document.getElementById('coupon-input');
        if(!input) return;
        const code = input.value.trim(); 
        if (!code) return window.customAlert("Введите промокод!");

        const btn = document.getElementById('activate-coupon-btn');
        const originalHtml = btn ? btn.innerHTML : '';
        if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Проверка...'; }

        try {
            if(typeof window.makeApiRequest !== 'function') throw new Error("makeApiRequest not found");
            const res = await window.makeApiRequest('/api/cs/check_code', { code: code }, 'POST');
            if (res.valid) {
                window.customAlert("✅ " + res.message);
                window.closeCouponModal();
                
                if (!window.activeFreeCases) window.activeFreeCases = [];
                if (res.target_case_name && !window.activeFreeCases.includes(res.target_case_name)) {
                    window.activeFreeCases.push(res.target_case_name);
                }
                
                const shopTab = document.querySelector('.toggle-option[data-target="view-shop"]');
                if (shopTab) shopTab.click();
                
                if(typeof window.loadCategory === 'function') window.loadCategory(window.currentCategoryId || 2716312); 
            } else {
                window.customAlert("❌ " + res.message);
            }
        } catch (e) {
            console.error("Ошибка активации:", e);
        } finally {
            if(btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
        }
    };

    // FAQ
    window.showFaq = function() {
        const faqHtml = '<div style="text-align: left; font-size: 13px; line-height: 1.35; color: #ddd; max-height: 60vh; overflow-y: auto; padding-right: 5px;">' +
            '<div>Добро пожаловать в <b>HATElavka</b>! Чтобы ты не запутался, вот краткий путеводитель:</div><br>' +
            '<div><b style="color: #fff;">💰 Валюта и прогресс</b><br>' +
            '<span style="color: #ffd700;">•</span> <b>Монетки:</b> Твоя основная валюта, с помощью них ты можешь открывать кейсы и участвовать в платных ивентах.<br>' +
            '<span style="color: #2AABEE;">•</span> <b>Билеты:</b> Это монета активности, открывает возможность пользоваться аукционом и розыгрышами.</div><br>' +
            '<div><b style="color: #fff;">📋 Как зарабатывать</b><br>' +
            '• <b>Задания и Челленджи:</b> Проявляй активность в TG/Twitch.<br>' +
            '• <b>Недельные испытания:</b> Выполняй цели за неделю и получай приз недели.</div><br>' +
            '<div><b style="color: #fff;">🎁 Активности и Ивенты</b><br>' +
            'Участвуй в различных <b>Ивентах</b>, делай ставки на <b>Аукционах</b> и крути <b>Рулетки</b> за скины.</div><br>' +
            '<div><b style="color: #fff;">🛒 TRADE IT</b><br>' +
            'Продавай кейсы в разделе кейсы.<br>' +
            '⚠️ <span style="color: #ff3b30; font-weight: 700;">Обязательно укажи актуальную Trade Link Steam в профиле для вывода скинов!</span></div>' +
            '<div style="background: rgba(255, 215, 0, 0.1); border-left: 3px solid #ffd700; padding: 6px 10px; border-radius: 4px; margin: 8px 0;">' +
            '⚠️ <b style="color: #ffd700;">Помним, что Валя — соло-разработчик, баги это нормально! 😉</b></div>' +
            '<div><b style="color: #fff;">🔗 Важно:</b> Для работы авто-заданий привяжи аккаунт Telegram к Twitch. Если что-то не считается — пиши Валентину!</div>' +
        '</div>';

        window.showShopModal({
            title: "📖 Как работает бот?",
            subtitle: faqHtml,
            confirmText: "Спасибо!",
            confirmClass: "btn-yellow-modal",
            showCancel: false,
            onConfirm: (close) => close()
        });
    };
})();
