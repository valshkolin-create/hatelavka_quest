document.addEventListener('DOMContentLoaded', () => {
    const dom = {
        title: document.getElementById('event-title'),
        progressBar: document.getElementById('progress-bar-fill'),
        progressText: document.getElementById('progress-text'),
        cauldronImage: document.getElementById('cauldron-image'),
    };
    
    // --- Логика для определения текущего уровня (как в halloween.js) ---
    function getCurrentLevel(eventData) {
        const { goals = {}, current_progress = 0 } = eventData;
        if (goals.level_2 && current_progress >= goals.level_2) return 3;
        if (goals.level_1 && current_progress >= goals.level_1) return 2;
        return 1;
    }

    // --- Главная функция обновления всего UI ---
    function updateDisplay(eventData) {
        // Проверяем, видим ли ивент. Если нет, ничего не показываем.
        if (!eventData || !eventData.is_visible_to_users) {
            document.body.style.display = 'none'; // Просто скрываем все
            return;
        }
        document.body.style.display = 'block'; // Показываем, если было скрыто

        const { title, goals = {}, current_progress = 0 } = eventData;
        const currentLevel = getCurrentLevel(eventData);

        // 1. Устанавливаем заголовок из админки
        dom.title.textContent = title || "Ведьминский Котел";

        // 2. Устанавливаем правильную картинку котла
        const cauldronImageUrl = eventData[`cauldron_image_url_${currentLevel}`] 
                               || eventData.cauldron_image_url 
                               || 'https://i.postimg.cc/d1G5DRk1/magic-pot.png'; // Резервный URL
        
        // Обновляем картинку только если она изменилась, чтобы избежать моргания
        if (dom.cauldronImage.src !== cauldronImageUrl) {
            dom.cauldronImage.src = cauldronImageUrl;
        }

        // 3. Правильно рассчитываем прогресс-бар и текст
        let currentGoal = 1, prevGoal = 0;
        if (currentLevel === 1) { currentGoal = goals.level_1 || 1; prevGoal = 0; }
        else if (currentLevel === 2) { currentGoal = goals.level_2 || goals.level_1; prevGoal = goals.level_1; }
        else if (currentLevel === 3) { currentGoal = goals.level_3 || goals.level_2; prevGoal = goals.level_2; }

        const progressInLevel = current_progress - prevGoal;
        const goalForLevel = currentGoal - prevGoal;
        const percentage = (goalForLevel > 0) ? Math.min((progressInLevel / goalForLevel) * 100, 100) : 0;
        
        dom.progressBar.style.width = `${percentage}%`;
        dom.progressText.textContent = `${current_progress} / ${currentGoal}`;
    }

    // --- Функция, которая будет регулярно запрашивать данные ---
    async function checkForUpdates() {
        console.log("Checking for updates...");
        try {
            const response = await fetch('/api/v1/events/cauldron/status');
            if (!response.ok) throw new Error(`Server responded with ${response.status}`);
            const data = await response.json();
            updateDisplay(data);
        } catch (error) {
            console.error("Error checking for updates:", error);
        }
    }

    // --- Запуск ---
    // 1. Получаем данные сразу при загрузке
    checkForUpdates();
    
    // 2. Устанавливаем интервал для проверки обновлений каждые 5 секунд
    setInterval(checkForUpdates, 5000); 
});
