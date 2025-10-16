document.addEventListener('DOMContentLoaded', () => {
    // --- Элементы DOM ---
    const dom = {
        title: document.getElementById('event-title'),
        progressBar: document.getElementById('progress-bar-fill'),
        progressText: document.getElementById('progress-text'),
        toast: document.getElementById('last-contributor-toast'),
        toastName: document.querySelector('#last-contributor-toast .contributor-name'),
        toastAmount: document.querySelector('#last-contributor-toast .contribution-amount')
    };

    // --- Функция обновления UI ---
    function updateDisplay(eventData) {
        const { title, goals = {}, current_progress = 0 } = eventData;
        
        dom.title.textContent = title || "Ведьминский Котел";

        const goal = goals.level_3 || goals.level_2 || goals.level_1 || 1;
        const percentage = (current_progress / goal) * 100;

        dom.progressBar.style.width = `${Math.min(percentage, 100)}%`;
        dom.progressText.textContent = `${current_progress} / ${goal}`;
    }

    // --- Функция для показа уведомления ---
    function showContributionToast(contributor) {
        if (!contributor || !contributor.name) return;

        dom.toastName.textContent = contributor.name;
        const contributionType = contributor.type === 'ticket' ? 'билетов' : 'очков Twitch';
        dom.toastAmount.textContent = `Вложил(а) ${contributor.amount} ${contributionType}!`;
        
        dom.toast.classList.remove('hidden');
        dom.toast.classList.add('show');

        // Скрываем уведомление через 7 секунд
        setTimeout(() => {
            dom.toast.classList.remove('show');
        }, 7000);
    }

    // --- Получение первоначальных данных ---
    async function fetchInitialState() {
        try {
            const response = await fetch('/api/v1/events/cauldron/status', { method: 'GET' });
            if (!response.ok) throw new Error('Failed to load event data');
            const data = await response.json();
            if (data && data.is_visible_to_users) {
                updateDisplay(data);
            }
        } catch (error) {
            console.error("Error fetching initial state:", error);
        }
    }

    // --- Подключение к WebSocket ---
    function connectWebSocket() {
        // Укажите URL вашего WebSocket. Если запускаете локально, он будет таким.
        // При развертывании на Vercel замените на wss://ВАШ_ДОМЕН/ws
        const wsUrl = `wss://${window.location.host}/ws`;
        
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket connected for OBS overlay.');
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                
                // Обрабатываем обновление прогресса
                if (message.type === 'cauldron_update') {
                    dom.progressBar.style.width = `${(message.new_progress / (dom.progressText.textContent.split(' / ')[1] || 1)) * 100}%`;
                    dom.progressText.textContent = `${message.new_progress} / ${dom.progressText.textContent.split(' / ')[1]}`;
                    
                    // Показываем уведомление о последнем вкладе
                    showContributionToast(message.last_contributor);
                }

                // Обрабатываем полное обновление конфига (если админ что-то поменял)
                if (message.type === 'cauldron_config_updated') {
                    updateDisplay(message.content);
                }

            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected. Reconnecting in 5 seconds...');
            setTimeout(connectWebSocket, 5000); // Попытка переподключения
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            ws.close();
        };
    }

    // --- Запуск ---
    fetchInitialState();
    connectWebSocket();
});
