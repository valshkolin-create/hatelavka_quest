(function() {
    // ==========================================
    // 1. CSS БЛОКИРОВКИ
    // ==========================================
    const banStyles = `
        #global-ban-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: #000; z-index: 2147483647;
            display: none; flex-direction: column; align-items: center; justify-content: center;
            color: #ff3b30; text-align: center; padding: 30px; box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        
        /* Жесткое отображение, если активен */
        #global-ban-overlay.active {
            display: flex !important;
        }

        @keyframes banPulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.05); opacity: 0.8; }
            100% { transform: scale(1); opacity: 1; }
        }

        .ban-skull { font-size: 100px; margin-bottom: 25px; filter: drop-shadow(0 0 20px rgba(255, 59, 48, 0.6)); animation: banPulse 2s infinite; }
        .ban-title { font-size: 28px; font-weight: 900; margin-bottom: 10px; text-transform: uppercase; color: #fff; letter-spacing: 1px; }
        .ban-text { color: #fff; font-size: 16px; line-height: 1.5; margin-bottom: 30px; opacity: 0.9; max-width: 300px; }
        .ban-btn { display: inline-flex; align-items: center; gap: 10px; background: #2AABEE; color: #fff; text-decoration: none; padding: 14px 24px; border-radius: 14px; font-weight: 800; font-size: 14px; transition: transform 0.2s; box-shadow: 0 4px 20px rgba(42, 171, 238, 0.3); }
        .ban-btn:active { transform: scale(0.95); }
        .ban-footer { color: #555; font-size: 11px; margin-top: 25px; line-height: 1.4; }
        
        /* Полная блокировка остального сайта */
        body.banned-locked { overflow: hidden !important; position: fixed !important; width: 100%; height: 100%; }
        body.banned-locked > *:not(#global-ban-overlay) { display: none !important; }
    `;

    // ==========================================
    // 2. HTML ЭКРАНА БЛОКИРОВКИ
    // ==========================================
    const banHtml = `
        <div id="global-ban-overlay">
            <i class="fa-solid fa-skull-crossbones ban-skull"></i>
            <h1 class="ban-title">Доступ ограничен</h1>
            <p class="ban-text">Твой аккаунт заблокирован за нарушение правил системы.</p>
            <a href="https://t.me/hatelove_twitch" target="_blank" class="ban-btn" onclick="if(window.Telegram?.WebApp) { Telegram.WebApp.openTelegramLink('https://t.me/hatelove_twitch'); return false; }">
                <i class="fa-brands fa-telegram" style="font-size: 18px;"></i> СВЯЗАТЬСЯ СО МНОЙ
            </a>
            <p class="ban-footer">Если ты считаешь, что это произошло по ошибке,<br>напиши в поддержку для разбора ситуации.</p>
        </div>
    `;

    let isInitialized = false;

    // ==========================================
    // 3. ДОМИНАНТНАЯ ЛОГИКА
    // ==========================================

    // Блокируем функцию от перезаписи (как в top_nav.js)
    function lockGlobalFunction(name, fn) {
        if (window[name]) return;
        Object.defineProperty(window, name, {
            value: fn,
            writable: false,      
            configurable: false   
        });
    }

    function injectBanDOM() {
        if (document.getElementById('global-ban-overlay')) return; 

        // Внедряем CSS
        if (!document.getElementById('hatelavka-ban-styles')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'hatelavka-ban-styles';
            styleEl.innerHTML = banStyles;
            document.head.appendChild(styleEl);
        }

        // Внедряем HTML в конец body
        const container = document.createElement('div');
        container.innerHTML = banHtml;
        document.body.appendChild(container.firstElementChild);
    }

    // ==========================================
    // 4. ГЛОБАЛЬНАЯ ЗАЩИЩЕННАЯ ФУНКЦИЯ
    // ==========================================
    lockGlobalFunction('triggerBanScreen', function() {
        const overlay = document.getElementById('global-ban-overlay');
        
        if (overlay) {
            overlay.classList.add('active');
            document.body.classList.add('banned-locked');
            
            if (window.Telegram?.WebApp?.HapticFeedback) {
                Telegram.WebApp.HapticFeedback.notificationOccurred('error');
            }
        } else {
            // Если по какой-то причине удалили из DOM, восстанавливаем и запускаем снова
            injectBanDOM();
            window.triggerBanScreen();
        }
    });

    // ==========================================
    // 5. ИНИЦИАЛИЗАЦИЯ И НАБЛЮДАТЕЛЬ
    // ==========================================
    function checkBanStatus() {
        try {
            const cachedBootstrap = JSON.parse(localStorage.getItem('cache_bootstrap') || '{}');
            if (cachedBootstrap && cachedBootstrap.user && cachedBootstrap.user.is_banned === true) {
                window.triggerBanScreen();
            }
        } catch (e) {
            console.warn("Ошибка проверки бана:", e);
        }
    }

    function bootstrapBan() {
        if (isInitialized) return;
        isInitialized = true;

        injectBanDOM();
        checkBanStatus();

        // Наблюдатель (Observer): Если юзер забанен и пытается удалить экран через консоль
        const observer = new MutationObserver(() => {
            if (!document.getElementById('global-ban-overlay') || !document.getElementById('hatelavka-ban-styles')) {
                injectBanDOM();
                // Если боди всё еще заблокировано (был бан) — сразу поднимаем экран обратно
                if (document.body.classList.contains('banned-locked')) {
                    window.triggerBanScreen();
                }
            }
        });
        
        observer.observe(document.body, { childList: true, subtree: false });
        observer.observe(document.head, { childList: true, subtree: false });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapBan);
    } else {
        bootstrapBan();
    }

})();
