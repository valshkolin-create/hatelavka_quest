<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <title>HateLavka</title>
    
    <style id="anti-flash-style">
        /* Прячем ВЕСЬ интерфейс, КРОМЕ экрана техработ и лоадера загрузки */
        body > *:not(#maintenance-screen-hardcore):not(#loader-overlay) {
            display: none !important;
        }
        body {
            background-color: #141414 !important;
            overflow: hidden !important;
        }
    </style>
    
    <script>
        (function() {
            try {
                const cached = JSON.parse(localStorage.getItem('cache_bootstrap') || '{}');
                if (cached && cached.maintenance) {
                    // Если в кэше техработы — сразу показываем зеленое окно
                    document.addEventListener("DOMContentLoaded", function() {
                        document.getElementById('maintenance-screen-hardcore').style.display = 'flex';
                    });
                }
                // ВАЖНО: Мы больше не удаляем стиль здесь! Его удалит main(), когда убедится, что всё ок.
            } catch(e) {}
        })();
    </script>

    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script>
        // Детектор ПК-версии Telegram
        document.addEventListener("DOMContentLoaded", function() {
            if (window.Telegram && window.Telegram.WebApp) {
                const platform = window.Telegram.WebApp.platform;
                // 'tdesktop' = Windows/Linux, 'macos' = Mac, 'web' = Web-версия
                if (platform === 'tdesktop' || platform === 'macos' || platform === 'web' || platform === 'webk') {
                    document.body.classList.add('desktop-platform');
                }
            }
        });
    </script>
    <script src="https://unpkg.com/@vkontakte/vk-bridge/dist/browser.min.js"></script>
    <link rel="stylesheet" href="/fontawesome/css/all.min.css" />
    <link rel="stylesheet" href="menu.css">
</head>
<body>
    <div id="maintenance-screen-hardcore" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #141414; z-index: 2147483647; align-items: center; justify-content: center; flex-direction: column; font-family: -apple-system, system-ui, sans-serif;">
        <i class="fa-solid fa-gear fa-spin" style="font-size: 60px; color: #ffd700; margin-bottom: 20px; filter: drop-shadow(0 0 15px rgba(255, 215, 0, 0.5));"></i>
        <span style="font-weight: 900; font-size: 26px; color: #fff; text-transform: uppercase; letter-spacing: 1px;">Тех. работы</span>
        <span id="maintenance-hardcore-text" style="color: #ffd700; font-size: 14px; margin-top: 10px; font-weight: bold;">Валька устанавливает апдейт...</span>
    </div>
    <div id="loader-overlay" class="global-loader-overlay hidden">
        <div class="spinner-container"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
        <div id="loading-text" style="color: #ffffff; margin-top: 10px; font-weight: 800; font-size: 12px;">Загрузка...</div>
        <div style="width: 150px; height: 4px; background: rgba(255,255,255,0.1); border-radius: 4px; margin-top: 10px; overflow: hidden;">
            <div id="loading-bar-fill" style="width: 0%; height: 100%; background: #ffffff; transition: width 0.3s;"></div>
        </div>
    </div>

    <div id="purchase-loader" class="purchase-loader">
        <i class="fa-solid fa-circle-notch fa-spin loader-spinner"></i>
        <div class="loader-text" id="loader-text">Оформляем...</div>
    </div>

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
            <a href="/menu"><i class="fa-solid fa-gear"></i> Настройки (заглушка)</a>
            <a href="#" onclick="showFaq(); return false;"><i class="fa-solid fa-circle-question"></i> Как пользоваться приложением?</a>
            <a href="#" onclick="openCouponModal(); return false;">
        <i class="fa-solid fa-ticket-simple" style="color: #34c759;"></i> Активировать купон
    </a>
            <a href="/admin" id="nav-admin" class="hidden" style="color: #ff3b30;"><i class="fa-solid fa-shield"></i> Админ-панель</a>
        </nav>
    </div>
</div>

<header class="top-header">
    
    <div class="logo-wrapper">
    <div id="logo-notification-btn" class="logo-btn-container" onclick="openNotificationsHistory()">
        <img src="https://i.postimg.cc/T3J3WhZL/6d40575f-80b0-49ba-a3ce-84890db9a196.png" alt="Logo" class="app-logo">
        
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
        <div class="balance-pill" onclick="checkBalance(true)">
            <div class="balance-col">
                <div class="balance-row"><span id="user-balance">0</span> <i class="fa-solid fa-coins" style="color: #FFD700;"></i></div>
                <div class="balance-row"><span id="ticketStats">0</span> <i class="fa-solid fa-ticket" style="color: #bdecff;"></i></div>
            </div>
            <div class="refresh-icon-wrapper">
                <i class="fa-solid fa-rotate-right fa-spin" id="refresh-icon"></i>
            </div>
        </div>
        
        <img src="https://via.placeholder.com/64x64/555555/ffffff?text=U" alt="Avatar" class="user-avatar" id="user-avatar" onclick="window.location.href='/profile'">
        
        <button id="open-menu-btn" class="glass-burger">
            <span></span><span></span><span></span>
        </button>
    </div>

</header>

    

<div id="pull-to-refresh">
        <i class="fa-solid fa-rotate-right"></i>
    </div>

    <!-- ТУТ ТУМБЛЕРА БЫТЬ НЕ ДОЛЖНО, СПУСКАЕМ ЕГО НИЖЕ -->
    
   <main id="main-content" class="main-content-scrollable">
    <div class="content-wrapper">

        <!-- 1. СНАЧАЛА СТАТИСТИКА (будет сверху) -->
        <div id="global-stats-block" style="display: flex; justify-content: center; align-items: center; gap: 16px; margin: 0 16px 15px 16px; opacity: 0.7;">
            <!-- Кейсы -->
            <div style="display: flex; align-items: center; gap: 6px; font-size: 10px;">
                <i class="fa-solid fa-box-open" style="color: #2AABEE;"></i>
                <span style="color: #8e8e93; font-weight: 700; text-transform: uppercase;">Открыто кейсов:</span>
                <span id="stat-cases-opened" style="color: #fff; font-weight: 900; font-family: 'SF Mono', monospace;">0</span>
            </div>

            <!-- Точка-разделитель -->
            <div style="width: 3px; height: 3px; background: rgba(255,255,255,0.3); border-radius: 50%;"></div>

            <!-- Скины -->
            <div style="display: flex; align-items: center; gap: 6px; font-size: 10px;">
                <i class="fa-solid fa-gun" style="color: #ffd700; transform: scaleX(-1);"></i>
                <span style="color: #8e8e93; font-weight: 700; text-transform: uppercase;">Успешных сделок:</span>
                <span id="stat-skins-issued" style="color: #fff; font-weight: 900; font-family: 'SF Mono', monospace;">0</span>
            </div>
        </div>

        <!-- 2. ДАЛЕЕ ТУМБЛЕР (прямо под статистикой) -->
        <div class="toggle-container">
            <div class="toggle-wrapper" id="mode-toggle">
                <div class="toggle-slider"></div>
                <div class="toggle-option active" data-target="view-dashboard">ГЛАВНАЯ</div>
                <div class="toggle-option" data-target="view-shop">КЕЙСЫ</div>
            </div>
        </div>
            
            <div id="view-dashboard" class="view-section active">
            
                <div id="open-bonus-btn" class="hidden" style="margin: 0 16px 15px 16px; background: rgba(28, 28, 30, 0.6); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(145, 70, 255, 0.3); border-radius: 14px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.2); position: relative; overflow: hidden; transition: transform 0.1s ease;" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'" onmouseleave="this.style.transform='scale(1)'" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform='scale(1)'">
                    
                    <div style="position: absolute; top: -20px; left: -20px; width: 60px; height: 60px; background: rgba(145, 70, 255, 0.2); filter: blur(20px); border-radius: 50%; pointer-events: none;"></div>

                    <div style="display: flex; align-items: center; gap: 12px; z-index: 1;">
                        <div style="width: 32px; height: 32px; border-radius: 10px; background: rgba(145, 70, 255, 0.1); border: 1px solid rgba(145, 70, 255, 0.2); display: flex; align-items: center; justify-content: center;">
                            <i class="fa-solid fa-gift" style="color: #9146ff; font-size: 16px;"></i>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            <span style="font-size: 12px; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 0.5px;">Приветственный бонус</span>
                            <span style="font-size: 10px; color: #8e8e93; font-weight: 500;">Доступна награда за привязку</span>
                        </div>
                    </div>
                    
                    <div style="z-index: 1;">
                        <i class="fa-solid fa-chevron-right" style="color: #666; font-size: 12px;"></i>
                    </div>
                </div>



                <div id="matrix-quest-tracker"></div>
                        
                <div id="main-slider-container" class="slider-container fullscreen-slider" style="display:none;">
                    <div class="slider-wrapper">
                        
                        <div class="slide" id="default-banner-slide" style="display:none; position: relative;">
                            <img src="https://i.postimg.cc/FK6Xm2R5/zagluska.png" alt="HATElavka">
                        </div>

                       <a href="/halloween" class="slide" data-event="cauldron" style="display:none; position: relative;">
                            <img src="" id="cauldron-banner-img" alt="Ивент">
                            
                            <div style="position: absolute; top: 50%; transform: translateY(-50%); right: 15px; background: rgba(0,0,0,0.3); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px 10px; border-radius: 10px; font-size: 8px; font-weight: 800; text-transform: uppercase; text-align: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); text-shadow: 0 0 8px rgba(255, 255, 255, 0.9);">
                                Перейти
                            </div>
                        </a>
                        
                    </div> 
                    <button id="slide-prev-btn" class="slider-arrow prev"><i class="fa-solid fa-chevron-left"></i></button>
                    <button id="slide-next-btn" class="slider-arrow next"><i class="fa-solid fa-chevron-right"></i></button>
                    <div class="slider-dots"></div>
                </div>

                <div id="weekly-goals-trigger" class="weekly-banner-wrapper hidden">
                    <img id="weekly-goals-banner-img" src="" class="weekly-banner-img" alt="Недельные испытания">
                    <div id="weekly-goals-badge" class="weekly-reward-badge hidden">
                        <i class="fa-solid fa-gift fa-shake"></i> ЗАДАНИЕ ВЫПОЛНЕНО!
                    </div>
                </div>


               <div class="action-cards-grid">
    <div class="flat-card" id="auction-card-container" onclick="window.location.href='/auction'" style="cursor: pointer; padding: 0; background: linear-gradient(135deg, rgba(255, 149, 0, 0.1) 0%, #1c1c1e 100%);">
        <div class="auction-content" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <i class="fa-solid fa-gavel" style="font-size: 26px; color: #ff9500; filter: drop-shadow(0 0 10px rgba(255, 149, 0, 0.4)); margin-bottom: 8px;"></i>
            <span style="font-size: 13px; font-weight: 800; text-transform: uppercase;">Аукционы</span>
        </div>
    </div>
    
    <div class="flat-card mini-raffle-slider-container" id="mini-raffle-slider" onclick="window.location.href='/raffles'">
        <span id="default-raffle-text" style="font-weight: 800; letter-spacing: 1px;">РОЗЫГРЫШИ</span>
    </div>
</div>
        
<div class="row-two-grid">
            
    <div class="schedule-box" onclick="openScheduleModal()">
        <span class="schedule-title">РАСПИСАНИЕ СТРИМОВ</span>
        <span class="schedule-subtitle">Нажмите, чтобы ознакомиться!</span>
    </div>
    
    <div class="schedule-box" onclick="openTrustModal()">
        <span class="schedule-title">ТВОЙ ТРАСТ-ФАКТОР</span>
        <span class="schedule-subtitle">Нажмите, чтобы ознакомиться!</span>
    </div>

        <div class="weapon-box" style="position: absolute; inset: 0; z-index: 10; pointer-events: none; display: flex; align-items: center; justify-content: center;">
            <img src="https://i.postimg.cc/rpbKB3s4/4.webp" alt="AK-47" class="weapon-huge-img">
        </div>
        
    </div>

</div>

    <div id="view-shop" class="view-section"> <!-- А ЗДЕСЬ ОТКРЫЛИ ВЛАДКУ "КЕЙСЫ" (view-shop) -->
                
    <div class="shop-actions" style="padding: 0 16px; display: flex; gap: 10px;">
    
    <!-- СЛЕВА: Trade-In (Родной цвет) -->
    <button onclick="openP2PModal()" class="premium-exchange-btn" id="open-p2p-modal-btn" style="flex: 1; padding: 10px; display: flex; align-items: center; justify-content: flex-start; text-align: left; min-height: 64px; border-radius: 12px; background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%); box-shadow: 0 4px 15px rgba(37, 117, 252, 0.3); border: none;">
        <div class="p2p-icon-box" style="margin-right: 10px; width: 34px; height: 34px; background: rgba(255,255,255,0.2); color: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: none;">
            <i class="fa-solid fa-arrow-right-arrow-left" style="font-size: 14px;"></i>
        </div>
        <div class="p2p-text-box" style="line-height: 1.2;">
            <span class="p2p-title" style="font-size: 12px; font-weight: 800; color: #fff; display: block;">TRADE-IN</span>
            <span class="p2p-subtitle" style="font-size: 9px; color: rgba(255,255,255,0.8); font-weight: 500; display: block; margin-top: 2px;">Обменяй кейсы на 🟡</span>
        </div>
    </button>

    <!-- СПРАВА: SWAP (Огненный цвет) -->
    <button onclick="openSwapModal()" class="premium-exchange-btn" style="flex: 1; padding: 10px; display: flex; align-items: center; justify-content: flex-start; text-align: left; min-height: 64px; border-radius: 12px; background: linear-gradient(135deg, #ff3b30 0%, #ff9500 100%); box-shadow: 0 4px 15px rgba(255, 149, 0, 0.4); border: none;">
        <div class="p2p-icon-box" style="margin-right: 10px; width: 34px; height: 34px; background: rgba(255,255,255,0.2); color: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: none;">
            <i class="fa-solid fa-rotate" style="font-size: 14px;"></i>
        </div>
        <div class="p2p-text-box" style="line-height: 1.2;">
            <span class="p2p-title" style="font-size: 12px; color: #fff; font-weight: 800; display: block;">SWAP</span>
            <span class="p2p-subtitle" style="font-size: 9px; color: rgba(255,255,255,0.8); font-weight: 500; display: block; margin-top: 2px;">Обмен 4 скина на 1</span>
        </div>
    </button>
    
</div>

        <!-- 🔥 ВСТАВЛЯЕМ УМНЫЙ ФИЛЬТР СЮДА 🔥 -->
    <div style="padding: 0 16px; margin-top: 15px; margin-bottom: 5px;">
        <div id="smart-filter-btn" onclick="toggleSmartFilter()" style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 8px 14px; border-radius: 12px; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
            <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-wallet" id="smart-filter-icon" style="color: #8e8e93; font-size: 13px; transition: 0.3s;"></i>
                <span id="smart-filter-text" style="font-size: 11px; font-weight: 800; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px; transition: 0.3s;">Доступные кейсы </span>
            </div>
            <div id="smart-filter-switch" style="width: 36px; height: 20px; background: rgba(255,255,255,0.1); border-radius: 12px; position: relative; transition: 0.3s; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);">
                <div class="switch-circle" style="width: 16px; height: 16px; background: #8e8e93; border-radius: 50%; position: absolute; top: 2px; left: 2px; transition: 0.3s cubic-bezier(0.25, 1, 0.5, 1); box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>
            </div>
        </div>
    </div>
    <!-- 🔥 КОНЕЦ ФИЛЬТРА 🔥 -->

                <div id="shop-grid" class="shop-grid"></div>
            </div>
            </div>

            <div style="height: 250px; width: 100%; clear: both; pointer-events: none; flex-shrink: 0;"></div>

        </div>

        
    </main>

    

   <script src="/bottom-nav.js"></script>

    <div id="gift-container" class="hidden" style="position: fixed; right: 20px; bottom: 100px; z-index: 1000;">
        <button id="daily-gift-btn" class="gift-floating-btn"><i class="fa-solid fa-gift"></i></button>
    </div>

    <div id="gift-modal-overlay" class="modal hidden">
        <div class="modal-content" style="text-align: center;">
            <button id="gift-x-btn" class="close-modal"><i class="fa-solid fa-xmark"></i></button>
            <div id="gift-content-initial">
                <h2 style="color:#FFD700; margin-top:0;">Ежедневный Подарок!</h2>
                <p style="font-size:12px; color:#8E8E93;">Открой коробку и забери случайную награду.</p>
                <div style="font-size: 60px; margin: 20px 0; animation: pulse 2s infinite;">🎁</div>
                <button id="gift-open-btn" class="action-btn btn-buy" style="height: 45px; font-size:14px;">Открыть</button>
            </div>
            <div id="gift-content-result" class="hidden">
                <h2 id="gift-result-title" style="color:#34c759; margin-top:0;">Поздравляем!</h2>
                <div id="gift-result-icon" style="font-size: 60px; margin: 15px 0;">🎉</div>
                <p id="gift-result-text" style="font-size:14px; color:#fff; font-weight:bold;"></p>
                <div id="gift-promo-block" class="hidden" style="margin: 15px 0; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
                    <p style="font-size:11px; color:#8E8E93; margin:0 0 5px;">Личный промокод:</p>
                    <code id="gift-promo-code" style="color:#FFD700; font-size:16px; font-weight:bold;"></code>
                </div>
                <button id="gift-close-btn" class="action-btn btn-secondary-action" style="height: 40px;">Круто!</button>
            </div>
        </div>
    </div>

    <div id="modal-schedule" class="modal-overlay" onclick="if(event.target===this) closeScheduleModal()">
        <div class="bottom-sheet">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
                <h3 style="margin:0; font-size: 18px; color: var(--primary);">🗓 Расписание</h3>
                <div style="display: flex; gap: 15px; align-items: center;">
                    <button id="btn-edit-schedule" onclick="toggleScheduleEdit()" style="display:none; background:none; border:none; color:var(--text-sec); font-size:16px;">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button onclick="closeScheduleModal()" style="background:none; border:none; color:var(--text-sec); font-size:20px;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
            
            <p class="info-text" style="text-align: left; margin-top: 0; margin-bottom: 15px; line-height: 1.4;">
    Время указано по МСК.<br>
    <a href="https://www.twitch.tv/hatelove_ttv" target="_blank" 
       onclick="if(window.Telegram?.WebApp) { Telegram.WebApp.openLink('https://www.twitch.tv/hatelove_ttv'); return false; }"
       style="color: #9146ff; text-decoration: none; font-weight: bold; display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; transition: opacity 0.2s;">
        <i class="fa-brands fa-twitch"></i> twitch.tv/hatelove_ttv
    </a>
</p>

            <div id="schedule-container" style="display: flex; flex-direction: column; gap: 8px;">
                <div style="text-align:center; color:#888;"><i class="fa-solid fa-circle-notch fa-spin"></i> Загрузка...</div>
            </div>

            <button id="btn-save-schedule" class="btn-save" style="display:none; background: linear-gradient(135deg, #28a745, #20c997);" onclick="saveSchedule()">
                СОХРАНИТЬ РАСПИСАНИЕ
            </button>
        </div>
    </div>


    <div id="welcome-popup" class="modal hidden">
        <div class="modal-content" style="text-align: center;">
            <h2 style="color: #FFD700; margin-top:0;">Приветственный бонус!</h2>
            <p style="font-size: 12px; color: #8E8E93; margin-bottom: 15px;">Привяжите аккаунты, чтобы забрать награду.</p>
            
            <div id="step-tg" style="display:flex; align-items:center; justify-content:space-between; background:rgba(0,136,204,0.15); padding:12px; border-radius:12px; margin-bottom:10px; cursor:pointer;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="fa-brands fa-telegram" style="color:#0088CC; font-size:24px;"></i>
                    <div style="text-align:left;">
                        <div style="color:#fff; font-size:14px; font-weight:bold;">Подписка TG</div>
                        <div style="color:#aaa; font-size:11px;">Кликни, чтобы подписаться</div>
                    </div>
                </div>
                <i id="icon-tg" class="fa-regular fa-circle" style="color:#aaa;"></i>
            </div>

            <div id="step-twitch" style="background:rgba(145,70,255,0.15); padding:12px; border-radius:12px; margin-bottom:15px;">
                </div>

            <button id="action-btn" class="action-btn btn-buy" style="height: 45px; font-size:14px; margin-bottom:10px;">Проверка...</button>
            <button id="later-btn" class="action-btn btn-secondary-action">Позже</button>
        </div>
    </div>

    <div id="r-modal" class="r-modal-overlay">
        <div id="r-top-header">
            <div id="r-case-name" class="r-case-title">КЕЙС</div>
        </div>
        <div id="r-area" class="r-game-area">
            <div class="r-marker"></div>
            <div class="r-track" id="r-track"></div>
        </div>
        <div id="r-bottom-progress">
            <div class="r-progress-bar" id="r-progress-bar-container">
                <div class="r-progress-dot"></div><div class="r-progress-dot"></div>
                <div class="r-progress-dot"></div><div class="r-progress-dot"></div>
                <div class="r-progress-dot"></div> 
            </div>
            <div class="r-progress-label" id="r-progress-text">До гаранта</div>
        </div>
        <div id="r-win" class="win-screen"></div>
    </div>

   <div id="case-contents-modal" class="modal hidden">
        <div class="modal-content" style="width: 90%; max-width: 380px; max-height: 80vh; display: flex; flex-direction: column; padding: 20px; overflow: hidden;">
            
            <div class="modal-header" style="flex-shrink: 0; margin-bottom: 10px;">
                <h3 style="margin: 0; font-size: 18px;">Содержимое</h3>
                <button onclick="closeContentsModal()" class="close-modal"><i class="fa-solid fa-xmark"></i></button>
            </div>
            
            <div id="contents-loader" style="text-align:center; padding:20px; color:#888; flex-shrink: 0;">
                <i class="fa-solid fa-circle-notch fa-spin"></i> Загрузка скинов...
            </div>
            
            <div id="case-items-list" class="case-contents-grid" style="overflow-y: auto; flex-grow: 1; padding-bottom: 10px; margin: 0; align-content: flex-start;"></div>
            
        </div>
    </div>

    <div id="replacement-modal" class="modal hidden" style="z-index: 30000 !important;">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Выберите замену</h3>
                <button onclick="closeReplacementModal()" class="close-modal"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <p style="font-size: 10px; color: #8E8E93; margin: 0;">Оригинала нет, выберите любой скин — отправим его сразу:</p>
            <div id="replacement-options-list" class="replacement-grid"></div>
            <button onclick="closeReplacementModal()" class="action-btn btn-secondary-action" style="margin-top: 10px; height: 36px;">Отмена</button>
        </div>
    </div>

    <div id="p2p-modal" class="modal hidden">
        <div class="modal-content" style="max-height: 85vh;">
            <div class="modal-header">
                <h3>Обмен Кейсов</h3>
                <button onclick="closeP2PModal()" class="close-modal"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="modal-body" style="display: flex; flex-direction: column; gap: 12px; overflow-y: auto; padding-bottom: 20px;">
                <div class="bot-connect-banner" onclick="openAppUrl('https://t.me/quest_hatelavka_bot?start=start')">
                    <div class="bot-icon-box"><i class="fa-brands fa-telegram"></i></div>
                    <div class="bot-text-box">
                        <h4>Включить уведомления</h4>
                        <p>Нажми, чтобы бот присылал статус сделки</p>
                    </div>
                    <div style="margin-left: auto; color: #fff;"><i class="fa-solid fa-chevron-right"></i></div>
                </div>

                <div class="form-group">
                    <label class="form-label">Выберите кейс</label>
                    <div class="select-wrapper">
                        <select id="p2p-case-select" onchange="calculateP2P()" class="p2p-select">
                            <option value="">Загрузка...</option>
                        </select>
                    </div>
                </div>

                <div id="case-preview" class="case-preview-card">
                    <img id="preview-img" src="" class="preview-image">
                    <div id="preview-name" class="preview-title">Название кейса</div>
                    <div class="preview-price">Цена: <span id="preview-price-text">0</span> 🟡</div>
                </div>

                <div class="form-group">
                    <label class="form-label">Количество</label>
                    <input type="number" id="p2p-quantity" value="1" min="1" oninput="calculateP2P()" class="p2p-input" placeholder="0">
                </div>
                
                <div class="summary-card">
                    <div class="summary-row">
                        <span>Цена за 1 шт:</span>
                        <span class="mono-num"><span id="p2p-price-per-item">0</span> 🟡</span>
                    </div>
                    <div class="summary-row total">
                        <span>Вы получите:</span>
                        <span class="mono-num" style="font-size: 18px;"><span id="p2p-total">0</span> 🟡</span>
                    </div>
                </div>

                <button onclick="createP2PTrade()" class="action-btn btn-buy" style="height: 48px; font-size: 16px;">Создать заявку</button>
                
                <button id="smart-history-btn" class="history-status-btn" onclick="openHistoryModal()">
                    <span id="smart-btn-text">История сделок</span>
                    <div class="btn-icon"><i class="fa-solid fa-clock-rotate-left"></i></div>
                </button>
            </div>
        </div>
    </div>

    <div id="history-modal-window" class="history-modal">
        <div class="history-modal-content">
            <div class="modal-header">
                <h3>Мои сделки</h3>
                <button onclick="closeHistoryModal()" class="close-modal"><i class="fa-solid fa-chevron-down"></i></button>
            </div>
            <div id="full-history-list" class="history-scroll-area"></div>
        </div>
    </div>

    <div id="tutorial-overlay" class="tutorial-overlay hidden">
        <div id="tutorial-modal" class="tutorial-modal">
            <h3 id="tutorial-title" style="margin-top:0; color:#FFD700;"></h3>
            <p id="tutorial-text" style="font-size: 13px; color:#ddd; line-height:1.4;"></p>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px;">
                <span id="tutorial-step-counter" style="font-size:11px; color:#888;"></span>
                <div style="display:flex; gap:10px;">
                    <button id="tutorial-skip-btn" class="action-btn btn-secondary-action" style="padding: 8px 12px; height: auto;">Пропустить</button>
                    <button id="tutorial-next-btn" class="action-btn btn-buy" style="padding: 8px 12px; height: auto;">Далее</button>
                </div>
            </div>
        </div>
    </div>

    <div id="admin-fab" class="admin-wrapper" style="display: none; bottom: 100px;">
        <div class="admin-fab-btn toggle" onclick="toggleAdminMenu()"><i class="fa-solid fa-chevron-up"></i></div>
        <div class="admin-menu-items" id="admin-menu-items">
            <div class="admin-action-btn" onclick="openPassModal()"><i class="fa-solid fa-trash-can"></i></div>
        </div>
    </div>

    <div id="password-modal" class="modal hidden" style="z-index: 10001;">
        <div class="modal-content" style="text-align: center; max-width: 300px;">
            <h3 style="margin: 0 0 5px 0; color: #fff;">Admin Access</h3>
            <p style="margin: 0; color: #8e8e93; font-size: 12px;">Введите код доступа</p>
            <input type="password" id="admin-pass-input" class="p2p-input" placeholder="••••" inputmode="numeric" style="text-align:center; margin: 15px 0;">
            <div style="display: flex; gap: 10px;">
                <button class="action-btn btn-secondary-action" onclick="closePassModal()">Отмена</button>
                <button class="action-btn btn-buy" onclick="submitResetCache()">OK</button>
            </div>
        </div>
    </div>
    
<div id="swap-modal" class="modal hidden">
    <div class="modal-content" style="margin-top: 75px; height: calc(100vh - 90px); display: flex; flex-direction: column; padding: 15px;">
        
        <div class="modal-header" style="flex-shrink: 0; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <button id="swap-back-btn" class="hidden" onclick="swapGoBack()" style="background: rgba(255,255,255,0.1); border: none; color: #fff; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <h3 style="margin: 0; font-size: 16px; text-transform: uppercase;">ОБМЕННИК</h3>
            </div>
            <button onclick="closeSwapModal()" class="close-modal"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div id="swap-locked-area" class="hidden" style="text-align: center; padding: 20px 10px; overflow-y: auto;">
            <i class="fa-solid fa-lock" style="font-size: 48px; color: #ff3b30; margin-bottom: 15px; filter: drop-shadow(0 0 15px rgba(255,59,48,0.4));"></i>
            <h3 style="color: #fff; margin-bottom: 10px;">SWAP недоступен</h3>
            <p style="font-size: 13px; color: #8e8e93; line-height: 1.4; margin-bottom: 15px;">
                Обменник доступен только активным зрителям. Для разблокировки нужно написать <b>300 сообщений</b> за месяц на Twitch.
            </p>
            
            <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; margin-bottom: 15px; border: 1px solid rgba(255,255,255,0.1);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; font-weight: bold;">
                    <span style="color: #fff;">Прогресс:</span><span style="color: #ffcc00;"><span id="swap-msg-progress">0</span> / 300</span>
                </div>
                <div style="width: 100%; height: 6px; background: #333; border-radius: 3px; overflow: hidden;">
                    <div id="swap-msg-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #ff3b30, #ff9500); transition: width 0.5s ease-out;"></div>
                </div>
            </div>

            <div style="background: rgba(145, 70, 255, 0.1); border: 1px solid rgba(145, 70, 255, 0.3); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 12px; text-align: left;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <i class="fa-brands fa-twitch" style="color: #9146ff; font-size: 24px; filter: drop-shadow(0 0 8px rgba(145, 70, 255, 0.4));"></i>
                    <div style="font-size: 11px; color: #ccc; line-height: 1.4;">
                        Сообщения считаются <b>автоматически</b> после привязки Twitch в профиле HATElavka. Общайтесь в чате на канале <span style="color: #9146ff; font-weight: bold;">hatelove_ttv</span>!
                    </div>
                </div>
                <a href="https://www.twitch.tv/hatelove_ttv" target="_blank" style="background-color: #9146ff; color: #ffffff; text-decoration: none; text-align: center; font-size: 13px; font-weight: 700; padding: 10px; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity 0.2s; box-shadow: 0 4px 12px rgba(145, 70, 255, 0.3);">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> Перейти на канал
                </a>
            </div>
        </div>

        <div id="swap-loader" style="text-align:center; padding:20px; color:#888; flex-grow: 1; display: flex; align-items: center; justify-content: center;">
            <div><i class="fa-solid fa-circle-notch fa-spin" style="font-size: 24px; margin-bottom: 10px;"></i><br>Загрузка данных...</div>
        </div>

        <div id="swap-content-area" class="hidden" style="display: flex; flex-direction: column; flex-grow: 1; min-height: 0; padding-bottom: 10px; padding-top: 10px;">
            
            <div id="swap-step-1" class="hidden" style="display: flex; flex-direction: column; height: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-shrink: 0; background: #1c1c1e; padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 13px; color: #8e8e93; font-weight: 800; text-transform: uppercase;">ОТДАЕТЕ (ДО 4 ШТ)</span>
                    <span style="font-size: 15px; color: #fff; font-weight: bold; display: flex; align-items: center; gap: 6px;">
                        <span id="swap-give-sum">0</span> 
                        <div style="width: 14px; height: 14px; background: #ffd700; border-radius: 50%; box-shadow: 0 0 5px rgba(255,215,0,0.5);"></div>
                    </span>
                </div>
                <div id="swap-inventory-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; flex-grow: 1; overflow-y: auto; align-content: flex-start; padding-bottom: 10px;"></div>
            </div>

            <div id="swap-step-2" class="hidden" style="display: flex; flex-direction: column; height: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-shrink: 0; background: #1c1c1e; border: 1px solid rgba(255,255,255,0.05); padding: 12px 16px; border-radius: 12px;">
                    <span style="font-size: 13px; color: #8e8e93; font-weight: 800; text-transform: uppercase;">ВЫБЕРИТЕ ЗАМЕНУ</span>
                    <span style="font-size: 15px; color: #ffcc00; font-weight: bold; display: flex; align-items: center; gap: 6px;">
                        <span id="swap-take-price">0</span> 
                        <div style="width: 14px; height: 14px; background: #ffd700; border-radius: 50%; box-shadow: 0 0 5px rgba(255,215,0,0.5);"></div>
                    </span>
                </div>

                <div style="margin-bottom: 15px; flex-shrink: 0;">
                    <input type="text" id="swap-search-input" placeholder="Поиск (название)..." 
                           oninput="renderSwapMarket()" 
                           style="width: 100%; background: #1c1c1e; border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 12px 16px; border-radius: 12px; font-size: 13px; outline: none; box-sizing: border-box; transition: border-color 0.2s;">
                </div>

                <div id="swap-market-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; flex-grow: 1; overflow-y: auto; overflow-x: hidden; align-content: flex-start; padding-bottom: 10px; width: 100%;"></div>
            </div>

            <div id="swap-step-3" class="hidden" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                <h2 style="color: #fff; margin-bottom: 5px;">Готовы к обмену?</h2>
                <p style="color: #8e8e93; font-size: 12px; margin-bottom: 25px; text-align: center;">Одобрите операцию для получения скина</p>
                
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 10px;">
                    <div style="flex: 1; background: rgba(255,255,255,0.05); padding: 15px; border-radius: 14px; border: 1px dashed rgba(255,255,255,0.1); text-align: center; display: flex; flex-direction: column; align-items: center;">
                        <span style="font-size: 10px; color: #888; text-transform: uppercase; font-weight: 800; margin-bottom: 8px;">Вы отдаете</span>
                        <div id="swap-confirm-give-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;"></div>
                        <div style="font-size: 12px; color: #fff; font-weight: bold; margin-top: 8px; display: flex; align-items: center; gap: 4px;">
                            <span id="swap-confirm-sum">0</span> <div style="width: 10px; height: 10px; background: #ffd700; border-radius: 50%;"></div>
                        </div>
                    </div>
                    
                    <i class="fa-solid fa-arrow-right" style="color: #ff9500; font-size: 24px; filter: drop-shadow(0 0 8px rgba(255,149,0,0.5));"></i>
                    
                    <div style="flex: 1; background: rgba(255,149,0,0.1); padding: 15px; border-radius: 14px; border: 1px solid rgba(255,149,0,0.3); text-align: center; display: flex; flex-direction: column; align-items: center;">
                        <span style="font-size: 10px; color: #ff9500; text-transform: uppercase; font-weight: 800; margin-bottom: 8px;">Вы получаете</span>
                        <img id="swap-confirm-take-img" src="" style="width: 50px; height: 50px; object-fit: contain; margin-bottom: 5px;">
                        <span id="swap-confirm-take-name" style="font-size: 9px; color: #fff; margin-bottom: 5px; line-height: 1.1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">Название</span>
                        <div style="font-size: 12px; color: #ffcc00; font-weight: bold; display: flex; align-items: center; gap: 4px;">
                            <span id="swap-confirm-take-price">0</span> <div style="width: 10px; height: 10px; background: #ffd700; border-radius: 50%;"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div> 

        <div id="swap-footer" style="margin-top: 10px; flex-shrink: 0;">
            <button id="swap-main-btn" onclick="handleSwapMainBtn()" class="action-btn btn-buy" style="height: 48px; width: 100%; font-size: 14px; background: linear-gradient(135deg, #ff3b30, #ff9500); color: #fff; border-radius: 12px;" disabled>
                ВЫБЕРИТЕ СВОИ ПРЕДМЕТЫ
            </button>
        </div>
    </div>
</div>

    <div id="coupon-modal" class="modal hidden" style="z-index: 10002;">
        <div class="modal-content" style="text-align: center; max-width: 320px;">
            <div class="modal-header">
                <h3 style="margin: 0; color: #fff;">Активация</h3>
                <button onclick="closeCouponModal()" class="close-modal"><i class="fa-solid fa-xmark"></i></button>
            </div>
            
            <div style="font-size: 45px; margin: 10px 0; animation: pulse 2s infinite;">🎟️</div>
            
            <p style="font-size: 11px; color: #8e8e93; margin-bottom: 15px; padding: 0 10px;">
                Введите секретный код, чтобы получить бонус на ваш аккаунт
            </p>
            
            <div style="position: relative; margin-bottom: 15px;">
                <input type="text" id="coupon-input" class="p2p-input" placeholder="КОД" autocapitalize="off" spellcheck="false"
       style="text-align:center; padding-right: 45px; font-weight: 700; font-size: 14px; letter-spacing: 2px; height: 40px;">
                
                <button onclick="pasteCoupon()" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.05); border: none; color: #8e8e93; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                    <i class="fa-solid fa-paste" style="font-size: 12px;"></i>
                </button>
            </div>
            
            <button id="activate-coupon-btn" class="action-btn btn-buy" 
                    style="height: 40px; font-size: 13px; background: linear-gradient(135deg, #34c759 0%, #2ecc71 100%); color: #fff; border-radius: 10px;" 
                    onclick="activateCouponSubmit()">
                Активировать
            </button>
        </div>
    </div>

<script>
    // АТОМНЫЙ ДЕТЕКТОР ПЛАТФОРМЫ (V3 - ТЕРМИНАТОР)
    (function() {
        window.isVk = false;
        window.vkParams = null;

        const checkString = (str) => str && (str.includes('vk_app_id') || str.includes('vk_user_id'));

        // 1. Проверяем URL (search и hash)
        let rawParams = window.location.search.replace('?', '') || window.location.hash.replace('#', '');
        
        // 2. Если пусто, проверяем window.name (ВК часто пишет туда параметры)
        if (!checkString(rawParams) && checkString(window.name)) {
            rawParams = window.name;
        }

        // 3. Если всё еще пусто, проверяем document.referrer
        if (!checkString(rawParams) && checkString(document.referrer)) {
            const refUrl = new URL(document.referrer);
            rawParams = refUrl.search.replace('?', '');
        }

        // ИТОГОВАЯ ПРОВЕРКА
        if (checkString(rawParams) || checkString(window.location.href)) {
            window.isVk = true;
            document.documentElement.classList.add('vk-mode');
            window.vkParams = rawParams;
            console.log("🛡️ [DETECTOR] ВК обнаружен через параметры/контекст");
        } else {
            console.log("🛡️ [DETECTOR] ВК не найден, режим Telegram");
        }
    })();
</script>

    <script>
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

        /* ==========================================
           ТВОЙ CSS: ЛОГОТИП-УВЕДОМЛЕНИЕ (ИН-АПП)
        ========================================== */
        .logo-btn-container {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.2s cubic-bezier(0.25, 1, 0.5, 1);
            width: 28px; 
            height: 28px;
        }

        .logo-btn-container:active {
            transform: scale(0.9);
        }

        .notif-badge-logo {
            position: absolute;
            top: -6px;
            right: -8px;
            background: #ff3b30;
            color: white;
            font-size: 9px;
            font-weight: 800;
            height: 16px;
            min-width: 16px;
            padding: 0 4px;
            border-radius: 8px;
            border: 2px solid #121212; 
            box-shadow: 0 2px 6px rgba(255, 59, 48, 0.5);
            display: flex; 
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            z-index: 11;
        }

        @keyframes badge-pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.15); box-shadow: 0 0 10px rgba(255, 59, 48, 0.6); }
            100% { transform: scale(1); }
        }

        .badge-pulse-anim {
            animation: badge-pulse 0.5s ease-in-out 2;
        }

        /* КОЛОКОЛЬЧИК (Без круга, сдвинут вправо) */
        .bell-wrapper {
            position: absolute;
            top: 2px;
            right: -12px;
            width: 18px;
            height: 18px;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
            pointer-events: none;
        }

        .bell-wrapper i {
            font-size: 15px; 
            color: #ffd700;
            filter: drop-shadow(0 2px 3px rgba(0,0,0,0.6));
            transition: color 0.3s, text-shadow 0.3s;
        }

        /* --- ТВОЙ CSS: ВТОРОЙ РЯД --- */
        .row-two-grid {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; 
            gap: 10px; 
            height: 110px; 
            width: 100%;
            margin-top: -30px; 
            margin-bottom: 20px;
            position: relative;
        }

        .schedule-box {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            cursor: pointer;
            width: 100%;
            height: 100%;
            min-width: 0;
            box-sizing: border-box;
            position: relative; 
            z-index: 2;
        }

        .schedule-box:active {
            transform: scale(0.96);
        }

        .schedule-box .schedule-title {
            color: #ffd700;
            font-weight: 900;
            font-size: 15px;
            text-transform: uppercase;
            margin-bottom: 2px;
            line-height: 1.1;
            letter-spacing: 0.5px;
            text-shadow: 0 0 8px rgba(255, 215, 0, 0.4); 
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
                    <a href="/admin" id="nav-admin" class="hidden" style="color: #ff3b30;"><i class="fa-solid fa-shield"></i> Админ-панель</a>
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
        const tryLoadData = () => {
            if (!window.isVk && (!window.Telegram || !window.Telegram.WebApp || !window.Telegram.WebApp.initData)) {
                setTimeout(tryLoadData, 100);
                return;
            }
            if (typeof window.checkBalance === 'function') window.checkBalance(true);
            if (typeof window.fetchNotificationsBadge === 'function') window.fetchNotificationsBadge();
        };
        setTimeout(tryLoadData, 300);
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
        // Защита от 422 ошибки
        if (!window.isVk && (!window.Telegram || !window.Telegram.WebApp || !window.Telegram.WebApp.initData)) return;

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
        // Защита от 422 ошибки
        if (!window.isVk && (!window.Telegram || !window.Telegram.WebApp || !window.Telegram.WebApp.initData)) return Promise.resolve();

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
    </script>

    <script src="menu.js?v=2"></script>
</body>
</html>
