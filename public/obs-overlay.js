document.addEventListener('DOMContentLoaded', () => {
    const dom = {
        title: document.getElementById('event-title'),
        progressBar: document.getElementById('progress-bar-fill'),
        progressText: document.getElementById('progress-text'),
        cauldronImage: document.getElementById('cauldron-image'),
        promoText: document.getElementById('promo-text')
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
        if (!eventData || !eventData.is_visible_to_users) {
            document.body.innerHTML = ''; // Скрываем все, если ивент неактивен
            return;
        }

        const { title, goals = {}, current_progress = 0 } = eventData;
        const currentLevel = getCurrentLevel(eventData);

        // 1. Устанавливаем заголовок из админки
        dom.title.textContent = title || "Ведьминский Котел";

        // 2. Устанавливаем правильную картинку котла
        const cauldronImageUrl = eventData[`cauldron_image_url_${currentLevel}`] 
                               || eventData.cauldron_image_url 
                               || 'https://i.postimg.cc/d1G5DRk1/magic-pot.png'; // Резервный URL
        dom.cauldronImage.src = cauldronImageUrl;

        // 3. ИСПРАВЛЕНИЕ: Правильно рассчитываем прогресс-бар и текст
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

    // --- Получение первоначальных данных ---
    async function fetchInitialState() {
        try {
            const response = await fetch('/api/v1/events/cauldron/status');
            if (!response.ok) throw new Error('Failed to load event data');
            const data = await response.json();
            updateDisplay(data);
        } catch (error) {
            console.error("Error fetching initial state:", error);
        }
    }

    // --- Подключение к WebSocket ---
    function connectWebSocket() {
        // !!! ЗАМЕНИТЕ НА ВАШ ДОМЕН VERСEL !!!
        const vercelDomain = 'hatelavka-quest.vercel.app'; // <--- ВАШ ДОМЕН ЗДЕСЬ
        const wsUrl = `wss://${vercelDomain}/ws`;
        
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => console.log('WebSocket connected.');
        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'cauldron_update' || message.type === 'cauldron_config_updated') {
                    // При любом обновлении, перезапрашиваем полное состояние
                    // Это самый надежный способ, чтобы все данные (цели, картинки) были актуальны
                    fetchInitialState();
                }
            } catch (e) { console.error('WS Error:', e); }
        };
        ws.onclose = () => setTimeout(connectWebSocket, 5000);
        ws.onerror = (e) => { console.error('WS Error:', e); ws.close(); };
    }

    // --- Запуск ---
    fetchInitialState();
    connectWebSocket();
});
