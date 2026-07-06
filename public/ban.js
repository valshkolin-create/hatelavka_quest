(function() {
    // ==========================================
    // 1. БРУТАЛЬНАЯ ФУНКЦИЯ БЛОКИРОВКИ
    // ==========================================
    function triggerBanScreen() {
        try {
            // Полностью уничтожаем всю страницу и рисуем экран смерти с нуля
            document.documentElement.innerHTML = `
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
                    <title>Доступ закрыт</title>
                    <style>
                        body { margin: 0; padding: 0; background: #000; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; color: #ff3b30; }
                        .skull { font-size: 100px; margin-bottom: 20px; animation: pulse 2s infinite; filter: drop-shadow(0 0 20px rgba(255, 59, 48, 0.6)); }
                        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); opacity: 0.8; } 100% { transform: scale(1); } }
                        h1 { font-size: 28px; font-weight: 900; color: #fff; text-transform: uppercase; margin: 0 0 10px 0; letter-spacing: 1px; }
                        p { color: #fff; font-size: 16px; margin: 0 0 30px 0; opacity: 0.9; max-width: 300px; line-height: 1.4; }
                        a { background: #2AABEE; color: #fff; text-decoration: none; padding: 14px 24px; border-radius: 14px; font-weight: 800; font-size: 14px; display: inline-flex; align-items: center; gap: 10px; box-shadow: 0 4px 20px rgba(42, 171, 238, 0.3); transition: 0.2s; }
                        a:active { transform: scale(0.95); }
                        .footer { color: #555; font-size: 11px; margin-top: 25px; line-height: 1.4; }
                    </style>
                </head>
                <body>
                    <i class="fa-solid fa-skull-crossbones skull"></i>
                    <h1>Доступ ограничен</h1>
                    <p>Твой аккаунт заблокирован за нарушение правил системы.</p>
                    <a href="https://t.me/hatelove_twitch"><i class="fa-brands fa-telegram" style="font-size: 18px;"></i> СВЯЗАТЬСЯ СО МНОЙ</a>
                    <div class="footer">Если ты считаешь, что это произошло по ошибке,<br>напиши в поддержку для разбора ситуации.</div>
                </body>
            `;
            
            if (window.Telegram?.WebApp?.HapticFeedback) {
                Telegram.WebApp.HapticFeedback.notificationOccurred('error');
            }
        } catch (e) {
            console.error("💀 [BAN.JS] Ошибка при отрисовке экрана:", e);
        }
    }

    // Делаем доступной извне на всякий случай
    if (!window.triggerBanScreen) {
        Object.defineProperty(window, 'triggerBanScreen', { value: triggerBanScreen, writable: false, configurable: false });
    }

    // ==========================================
    // 2. ГЛОБАЛЬНЫЙ ПЕРЕХВАТЧИК ВСЕХ ЗАПРОСОВ
    // ==========================================
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        
        if (!response.ok) {
            try {
                const clone = response.clone();
                // Читаем как текст, чтобы не упало, если сервер вернул не JSON
                const text = await clone.text(); 
                const upperText = text.toUpperCase();
                
                // Ищем признаки блокировки
                if (upperText.includes("BAN") || upperText.includes("BANNED") || upperText.includes("ЗАБЛОКИРОВАН")) {
                    console.error("💀 [BAN.JS] СЕРВЕР ОТВЕТИЛ БАНОМ! БЛОКИРУЮ ИНТЕРФЕЙС!");
                    triggerBanScreen();
                    
                    // Жестко пишем в кэш
                    try {
                        const cached = JSON.parse(localStorage.getItem('cache_bootstrap') || '{}');
                        if (!cached.user) cached.user = {};
                        cached.user.is_banned = true;
                        localStorage.setItem('cache_bootstrap', JSON.stringify(cached));
                    } catch(e) {}
                    
                    // Замораживаем весь остальной JS на странице
                    return new Promise(() => {});
                }
            } catch (e) {
                console.warn("💀 [BAN.JS] Ошибка чтения ответа:", e);
            }
        }
        
        return response;
    };

    // ==========================================
    // 3. ПРОВЕРКА КЭША ПРИ СТАРТЕ СТРАНИЦЫ
    // ==========================================
    function checkCache() {
        try {
            const cached = JSON.parse(localStorage.getItem('cache_bootstrap') || '{}');
            if (cached && cached.user && cached.user.is_banned === true) {
                console.error("💀 [BAN.JS] ЮЗЕР УЖЕ В БАНЕ ПО КЭШУ!");
                triggerBanScreen();
            }
        } catch (e) {}
    }
    
    checkCache();

})();
