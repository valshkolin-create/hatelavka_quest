document.addEventListener("DOMContentLoaded", () => {
    // 1. Вставляем стили
    const style = document.createElement('style');
    style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;900&display=swap');

        .floating-bottom-bar {
            font-family: 'Montserrat', sans-serif;
            position: fixed; bottom: 15px; left: 50%; transform: translateX(-50%); 
            
            /* 🔥 ФИКС ШИРИНЫ 🔥 */
            width: 360px; 
            max-width: 92vw;
            box-sizing: border-box;

            background: rgba(40, 40, 40, 0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1); 
            border-radius: 35px; box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            display: flex; justify-content: space-between; align-items: center; 
            padding: 6px 12px; z-index: 1000;
        }
        
        .nav-item { 
            flex: 1; /* 🔥 ФИКС КНОПОК: Теперь они делят ширину поровну и не дергают бар */
            display: flex; flex-direction: column; align-items: center; justify-content: center; 
            color: #8E8E93; text-decoration: none; gap: 2px; padding: 6px 0; 
            border-radius: 20px; transition: all 0.3s ease; position: relative;
        }
        
        .nav-item i { font-size: 18px; transition: all 0.3s ease; }
        .nav-item span { font-size: 9px; font-weight: 600; transition: all 0.3s ease; }
        .nav-item.active { background: transparent; color: #FFFFFF; }

        /* --- БЕЙДЖ ДЛЯ ИГРЫ --- */
        .comic-badge {
            position: absolute;
            top: -26px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #ff3b30, #ff4d4d);
            color: #fff;
            font-size: 7px;
            font-weight: 900;
            text-transform: uppercase;
            padding: 4px 6px;
            border-radius: 6px;
            line-height: 1.1;
            text-align: center;
            white-space: nowrap;
            box-shadow: 0 4px 10px rgba(255, 59, 48, 0.6), inset 0 1px 2px rgba(255, 255, 255, 0.5);
            border: 1px solid #cc0000;
            pointer-events: none;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, transform 0.3s ease;
            animation: comicPulse 1.5s infinite ease-in-out;
            z-index: 10;
        }

        .comic-badge::after {
            content: '';
            position: absolute;
            bottom: -4px;
            left: 50%;
            transform: translateX(-50%);
            border-width: 5px 5px 0;
            border-style: solid;
            border-color: #ff3b30 transparent transparent transparent;
        }

        @keyframes comicPulse {
            0% { transform: translateX(-50%) scale(1) rotate(-2deg); }
            50% { transform: translateX(-50%) scale(1.05) rotate(2deg); }
            100% { transform: translateX(-50%) scale(1) rotate(-2deg); }
        }

        /* КОГДА ИГРА АКТИВНА */
        .nav-item.game-live .comic-badge {
            opacity: 1;
            visibility: visible;
        }

        .nav-item.game-live i {
            color: #ff4d4d !important;
            filter: drop-shadow(0 0 10px rgba(255, 77, 77, 0.8));
            animation: shakeIcon 2s infinite;
        }

        .nav-item.game-live span {
            color: #ff4d4d !important;
            font-weight: 900;
            text-shadow: 0 0 5px rgba(255, 77, 77, 0.4);
        }

        @keyframes shakeIcon {
            0% { transform: rotate(0deg); }
            10% { transform: rotate(-10deg); }
            20% { transform: rotate(10deg); }
            30% { transform: rotate(-10deg); }
            40% { transform: rotate(10deg); }
            50% { transform: rotate(0deg); }
            100% { transform: rotate(0deg); }
        }
    `;
    document.head.appendChild(style);

    // 2. Вставляем HTML меню
    const navHTML = `
        <nav class="floating-bottom-bar">
            <a href="/leaderboard" class="nav-item" data-path="/leaderboard">
                <i class="fa-solid fa-trophy"></i><span>Топ</span>
            </a>
            <a href="/quests" class="nav-item" data-path="/quests">
                <i class="fa-solid fa-check-double"></i><span>Задания</span>
            </a>
            <a href="/" class="nav-item" data-path="/">
                <i class="fa-solid fa-house"></i><span>Главная</span>
            </a>
            <a href="/events" class="nav-item" data-path="/events">
                <i class="fa-solid fa-fire"></i><span>Гринд</span>
            </a>
            <a href="/event_page" class="nav-item" data-path="/event_page" id="nav-games-btn">
                <div class="comic-badge">ИГРА<br>НАЧАЛАСЬ</div>
                <i class="fa-solid fa-gamepad"></i><span>Игры</span>
            </a>
        </nav>
    `;
    document.body.insertAdjacentHTML('beforeend', navHTML);

    // 3. Логика подсветки активной кнопки меню
    let currentPath = window.location.pathname.replace('.html', '');
    
    // Фикс для главной
    if (currentPath === '/menu' || currentPath === '' || currentPath === '/index') {
        currentPath = '/';
    }

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-path') === currentPath) {
            item.classList.add('active');
        }
    });

    // 4. АВТОНОМНАЯ ПРОВЕРКА СТАТУСА ИГРЫ
    const checkGameStatus = async () => {
        try {
            const res = await fetch('https://pyeuckjcrsiaseyqrsek.supabase.co/rest/v1/guess_state?id=eq.1&select=is_active', {
                headers: { 
                    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5ZXVja2pjcnNpYXNleXFyc2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NzEyOTgsImV4cCI6MjA3MDA0NzI5OH0.srRwuUygiF7jr3-b2AwyRNAmrChlW3Bzp3I-9Ju2TVg', 
                    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5ZXVja2pjcnNpYXNleXFyc2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NzEyOTgsImV4cCI6MjA3MDA0NzI5OH0.srRwuUygiF7jr3-b2AwyRNAmrChlW3Bzp3I-9Ju2TVg' 
                }
            });
            const data = await res.json();
            const gamesBtn = document.getElementById('nav-games-btn');
            
            if (gamesBtn && data && data.length > 0) {
                const isStreamOnline = (typeof window.userData !== 'undefined' && window.userData.is_stream_online);
                
                if (data[0].is_active && isStreamOnline) {
                    gamesBtn.classList.add('game-live');
                } else {
                    gamesBtn.classList.remove('game-live');
                }
            }
        } catch(e) {
            console.warn('Game status checker error:', e);
        }
    };
    
    checkGameStatus();
    setInterval(checkGameStatus, 10000);
});
