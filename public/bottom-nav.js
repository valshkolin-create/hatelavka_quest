document.addEventListener("DOMContentLoaded", () => {
    // 1. Вставляем стили
    const style = document.createElement('style');
    style.innerHTML = `
        .floating-bottom-bar {
            position: fixed; bottom: 15px; left: 50%; transform: translateX(-50%); 
            width: 85%; max-width: 360px;
            background: rgba(40, 40, 40, 0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1); 
            border-radius: 35px; box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            display: flex; justify-content: space-around; align-items: center; 
            padding: 6px 12px; z-index: 1000;
        }
        .nav-item { 
            display: flex; flex-direction: column; align-items: center; justify-content: center; 
            color: #8E8E93; text-decoration: none; gap: 2px; padding: 6px 10px; 
            border-radius: 20px; transition: all 0.3s ease; 
        }
        .nav-item i { font-size: 18px; }
        .nav-item span { font-size: 9px; font-weight: 600; }
        .nav-item.active { background: transparent; color: #FFFFFF; }
    `;
    document.head.appendChild(style);

    // 2. Вставляем HTML
    const navHTML = `
        <nav class="floating-bottom-bar">
            <a href="/leaderboard" class="nav-item" data-path="/leaderboard"><i class="fa-solid fa-trophy"></i><span>Топ</span></a>
            <a href="/quests" class="nav-item" data-path="/quests"><i class="fa-solid fa-check-double"></i><span>Задания</span></a>
            <a href="/" class="nav-item" data-path="/"><i class="fa-solid fa-house"></i><span>Главная</span></a>
            <a href="/events" class="nav-item" data-path="/events"><i class="fa-solid fa-fire"></i><span>Гринд</span></a>
            <a href="/event_page" class="nav-item" data-path="/event_page"><i class="fa-solid fa-gamepad"></i><span>Игры</span></a>
        </nav>
    `;
    document.body.insertAdjacentHTML('beforeend', navHTML);

    // 3. Логика подсветки активной кнопки
    const currentPath = window.location.pathname;
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        // Убираем класс active у всех
        item.classList.remove('active');
        
        // Сравниваем путь кнопки с текущим путем в браузере
        if (item.getAttribute('data-path') === currentPath) {
            item.classList.add('active');
        }
    });
});
