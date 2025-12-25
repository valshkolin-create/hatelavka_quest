const dom = {
        loaderOverlay: document.getElementById('loader-overlay'),
        loadingText: document.getElementById('loading-text'),
        loadingBarFill: document.getElementById('loading-bar-fill'),
        mainContent: document.getElementById('main-content'),
        fullName: document.getElementById('fullName'),
        navAdmin: document.getElementById('nav-admin'),
        footerItems: document.querySelectorAll('.footer-item'),
        viewDashboard: document.getElementById('view-dashboard'),
        viewQuests: document.getElementById('view-quests'),
        challengeContainer: document.getElementById('challenge-container'),
        activeAutomaticQuestContainer: document.getElementById('active-automatic-quest-container'),
        
        promocodeOverlay: document.getElementById('promocode-overlay'),
        rewardClaimedOverlay: document.getElementById('reward-claimed-overlay'),
        rewardCloseBtn: document.getElementById('reward-close-btn'),
        ticketsClaimedOverlay: document.getElementById('tickets-claimed-overlay'),
        ticketsClaimCloseBtn: document.getElementById('tickets-claim-close-btn'),
        
        promptOverlay: document.getElementById('custom-prompt-overlay'),
        promptTitle: document.getElementById('prompt-title'),
        promptInput: document.getElementById('prompt-input'),
        promptCancel: document.getElementById('prompt-cancel'),
        promptConfirm: document.getElementById('prompt-confirm'),

        infoQuestionIcon: document.getElementById('info-question-icon'),
        infoModalOverlay: document.getElementById('info-modal-overlay'),
        infoModalCloseBtn: document.getElementById('info-modal-close-btn'),

        questChooseBtn: document.getElementById("quest-choose-btn"),
        questChooseContainer: document.getElementById("quest-choose-container"),

        newPromoNotification: document.getElementById('new-promo-notification'),
        closePromoNotification: document.getElementById('close-promo-notification'),

        tutorialOverlay: document.getElementById('tutorial-overlay'),
        tutorialModal: document.getElementById('tutorial-modal'),
        tutorialTitle: document.getElementById('tutorial-title'),
        tutorialText: document.getElementById('tutorial-text'),
        tutorialStepCounter: document.getElementById('tutorial-step-counter'),
        tutorialNextBtn: document.getElementById('tutorial-next-btn'),
        tutorialSkipBtn: document.getElementById('tutorial-skip-btn'),
        startTutorialBtn: document.getElementById('start-tutorial-btn'),
        weeklyGoalsContainer: document.getElementById('weekly-goals-container-placeholder'), // (Отступ 8 пробелов)
        // УДАЛИТЬ или ЗАМЕНИТЬ строки про weeklyGoalsAccordion
        weeklyGoalsTrigger: document.getElementById('weekly-goals-trigger'),
        weeklyGoalsBadge: document.getElementById('weekly-goals-badge'),    
        // Элементы модалки
        weeklyModalOverlay: document.getElementById('weekly-modal-overlay'),
        weeklyModalCloseBtn: document.getElementById('weekly-modal-close-btn'),
        weeklyGoalsListContainer: document.getElementById('weekly-goals-list-container'),
        weeklyModalCounter: document.getElementById('weekly-modal-counter')
    };

try {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();

// --- ДОБАВЬ ЭТУ ФУНКЦИЮ ---
    function escapeHTML(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, match => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'})[match]);
    }
        function updateLoading(percent) {
    if (dom.loadingText) dom.loadingText.textContent = Math.floor(percent) + '%';
    if (dom.loadingBarFill) dom.loadingBarFill.style.width = Math.floor(percent) + '%';
    }
    // --- КОНЕЦ ДОБАВЛЕНИЯ ---

    const updatedBalance = localStorage.getItem('userTicketBalance');
    if (updatedBalance !== null) {
        document.getElementById('ticketStats').textContent = updatedBalance;
        localStorage.removeItem('userTicketBalance');
    }

    let currentQuestId = null;
    let countdownIntervals = {};
    let allQuests = [];
    let userData = {};
    let questsForRoulette = [];
    let tutorialCountdownInterval = null;
    
    // --- ИСПРАВЛЕННАЯ ЛОГИКА ДЛЯ СЛАЙДЕРА V2 (С ЛОГАМИ) ---
    let currentSlideIndex = 0;
    let slideInterval;
    const slideDuration = 15000; // 30 секунд (было 15000, в комменте 30. Оставил 15000)

    function setupSlider() {
        // console.log("--- [setupSlider] Запуск ---");

        // 1. Сбрасываем предыдущий интервал, если он был
        if (slideInterval) clearInterval(slideInterval);

        const container = document.getElementById('main-slider-container');
        if (!container) return;

        // Находим слайды
        const allSlides = container.querySelectorAll('.slide');
        
        // Фильтруем слайды (проверяем, не скрыты ли они стилями)
        const visibleSlides = Array.from(allSlides).filter(slide => {
            return slide.style.display !== 'none';
        });

        const wrapper = container.querySelector('.slider-wrapper');
        const dotsContainer = container.querySelector('.slider-dots');
        
        // --- Очистка кнопок от старых событий ---
        let prevBtnOld = document.getElementById('slide-prev-btn');
        let nextBtnOld = document.getElementById('slide-next-btn');
        
        // Клонируем без событий
        let prevBtn = prevBtnOld.cloneNode(true);
        let nextBtn = nextBtnOld.cloneNode(true);
        
        // Заменяем старые кнопки новыми (чистыми) в DOM
        prevBtnOld.parentNode.replaceChild(prevBtn, prevBtnOld);
        nextBtnOld.parentNode.replaceChild(nextBtn, nextBtnOld);
        // ------------------------------------------------------------

        // Если слайдов 0
        if (visibleSlides.length === 0) {
            console.log("Слайдер: Ждем загрузки слайдов...");
            // container.style.display = 'none'; // <--- ЭТА СТРОКА ЗАКОММЕНТИРОВАНА, ЧТОБЫ НЕ СКРЫВАТЬ БЛОК
            return;
        } else {
             container.style.display = ''; 
        }

        // Если слайд 1
        if (visibleSlides.length <= 1) {
            container.style.display = '';
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
            if (dotsContainer) dotsContainer.style.display = 'none';
            const firstVisibleIndex = Array.from(allSlides).indexOf(visibleSlides[0]);
            if (wrapper) wrapper.style.transform = `translateX(-${firstVisibleIndex * 100}%)`;
            return;
        }
        
        // Если слайдов > 1
        container.style.display = '';
        prevBtn.style.display = 'flex';
        nextBtn.style.display = 'flex';
        if (dotsContainer) dotsContainer.style.display = 'flex';
        
        // Генерация точек
        dotsContainer.innerHTML = '';
        visibleSlides.forEach((_, i) => {
            const dot = document.createElement('button');
            dot.classList.add('dot');
            dot.addEventListener('click', () => {
                showSlide(i);
                resetSlideInterval();
            });
            dotsContainer.appendChild(dot);
        });
        const dots = dotsContainer.querySelectorAll('.dot');

        function showSlide(index) {
            if (index >= visibleSlides.length) index = 0;
            if (index < 0) index = visibleSlides.length - 1;

            if (!wrapper || !dots[index]) return;
            
            wrapper.style.transform = `translateX(-${index * 100}%)`;
            dots.forEach(dot => dot.classList.remove('active'));
            dots[index].classList.add('active');
            currentSlideIndex = index;
        }

        function nextSlide() {
            showSlide(currentSlideIndex + 1);
        }

        function prevSlide() {
            showSlide(currentSlideIndex - 1);
        }

        function resetSlideInterval() {
            clearInterval(slideInterval);
            slideInterval = setInterval(nextSlide, slideDuration);
        }

        // Вешаем события на кнопки
        prevBtn.addEventListener('click', () => {
            prevSlide();
            resetSlideInterval();
        });

        nextBtn.addEventListener('click', () => {
            nextSlide();
            resetSlideInterval();
        });
        
        // Логика свайпа
        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let isSwiping = false;

        container.ontouchstart = (e) => {
            touchStartX = e.touches[0].clientX;
            touchEndX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            isSwiping = false;
        };

        container.ontouchmove = (e) => {
            if (!touchStartX || !touchStartY) return;
            const touchCurrentX = e.touches[0].clientX;
            const touchCurrentY = e.touches[0].clientY;
            const deltaX = Math.abs(touchStartX - touchCurrentX);
            const deltaY = Math.abs(touchStartY - touchCurrentY);
            if (deltaX > deltaY) e.preventDefault();
            touchEndX = touchCurrentX;
            if (deltaX > 10) isSwiping = true;
        };

        container.ontouchend = () => {
            const swipeThreshold = 50; 
            if (touchStartX - touchEndX > swipeThreshold) {
                nextSlide();
                resetSlideInterval();
            } else if (touchEndX - touchStartX > swipeThreshold) {
                prevSlide();
                resetSlideInterval();
            }
            touchStartX = 0;
            touchStartY = 0;
        };
        
        allSlides.forEach(slide => {
            slide.onclick = (e) => {
                if (isSwiping) e.preventDefault();
            };
        });
        // Проверяем, не вышел ли текущий индекс за пределы (на случай, если слайды изменились)
        if (currentSlideIndex >= visibleSlides.length) {
            currentSlideIndex = 0;
        }
        
        // Используем ТЕКУЩИЙ индекс вместо 0, чтобы позиция не сбрасывалась при обновлении
        showSlide(currentSlideIndex); 
        // --- ИСПРАВЛЕНИЕ КОНЕЦ ---

        resetSlideInterval();
    }
    
    const tutorialSteps = [
        {
            element: '.user-profile',
            title: 'Ваш Профиль и Билеты',
            text: 'Слева находится <b>Ваш профиль</b>. Там можно привязать Twitch и посмотреть промокоды. <br><br>Справа - <b>Ваши билеты</b> для участия в розыгрышах.',
            view: 'view-dashboard'
        },
        {
            element: '#main-slider-container',
            title: 'Актуальные События',
            text: 'В этом слайдере находятся различные мероприятия. Они постоянно актуальные и всегда обновляются!',
            view: 'view-dashboard'
        },
        {
            element: '#challenge-container',
            title: 'Ежедневный Челлендж',
            text: 'Челленджи переехали во вкладку <b>Задания</b>! <br>Заходите сюда каждый день, выполняйте задания и получайте награды.',
            view: 'view-quests',
            forceTop: true // 🔥 Показываем подсказку СВЕРХУ, чтобы не уезжала вниз
        },
        {
            element: '#nav-leaderboard', 
            title: 'Лидерборд',
            text: 'Здесь можно посмотреть список лучших игроков и ваше место в рейтинге. Соревнуйтесь по количеству билетов и активности!',
            view: 'view-dashboard', // Переключаем на главную, чтобы было видно футер
            forceTop: true // Для футера подсказка всегда должна быть сверху
        },
        {
            element: '#nav-shop', 
            title: 'Магазин Скинов',
            text: 'А здесь находится <b>Магазин</b> (Shop). <br>Обменивайте заработанные монеты и звезды на уникальные скины CS2 и полезные предметы!',
            view: 'view-dashboard',
            forceTop: true
        }
    ];
    let currentTutorialStep = 0;

    function positionTutorialModal(element, forceTop = false) {
        const rect = element.getBoundingClientRect();
        const modal = dom.tutorialModal;
        const margin = 15; // Отступ от элемента
        
        // Сброс стилей
        modal.style.display = 'block';
        modal.style.top = '';
        modal.style.bottom = '';
        modal.style.transform = '';
        modal.style.left = '5%';
        modal.style.width = '90%';

        const modalHeight = modal.offsetHeight;
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;

        // 1. Если включено forceTop (для футера/челленджей) -> ставим СВЕРХУ
        if (forceTop && spaceAbove >= (modalHeight + margin)) {
            modal.style.top = `${rect.top - modalHeight - margin}px`;
            return;
        }

        // 2. Стандартная логика: если есть место снизу -> ставим СНИЗУ
        if (!forceTop && spaceBelow >= (modalHeight + margin)) {
            modal.style.top = `${rect.bottom + margin}px`;
            return;
        }

        // 3. Иначе пытаемся поставить сверху
        if (spaceAbove >= (modalHeight + margin)) {
            modal.style.top = `${rect.top - modalHeight - margin}px`;
            return;
        }

        // 4. Если места совсем нет -> прибиваем к верху экрана
        modal.style.top = '20px';
    }

    function showTutorialStep(stepIndex) {
        if (tutorialCountdownInterval) {
            clearInterval(tutorialCountdownInterval);
            tutorialCountdownInterval = null;
        }
        const footer = document.querySelector('.app-footer');
        // Убираем подсветку футера, если она была
        footer.classList.remove('tutorial-footer-active');
        document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
        
        if (stepIndex >= tutorialSteps.length) {
            endTutorial(true);
            return;
        }
        
        let step = { ...tutorialSteps[stepIndex] };

        // Если нужно сменить вкладку (например, на Quests для челленджа)
        if (step.view && document.getElementById(step.view).classList.contains('hidden')) {
            switchView(step.view);
        }
        
        // Небольшая задержка, чтобы интерфейс успел перерисоваться
        setTimeout(() => {
            const element = document.querySelector(step.element);
            
            if (element) {
                // Если элемент внутри футера — подсвечиваем весь футер
                if (element.closest('.app-footer')) {
                    footer.classList.add('tutorial-footer-active');
                }
                
                element.classList.add('tutorial-highlight');
                dom.tutorialTitle.textContent = step.title;
                dom.tutorialText.innerHTML = step.text;
                dom.tutorialStepCounter.textContent = `Шаг ${stepIndex + 1} из ${tutorialSteps.length}`;
                
                // Прокручиваем к элементу
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // 🔥 Вызываем позиционирование с учетом флага forceTop
                setTimeout(() => positionTutorialModal(element, step.forceTop), 350);

                // Логика кнопки "Далее" с таймером
                const originalButtonText = (stepIndex === tutorialSteps.length - 1) ? 'Завершить' : 'Далее';
                dom.tutorialNextBtn.textContent = originalButtonText;
                const nextBtn = dom.tutorialNextBtn;
                nextBtn.disabled = true;
                let countdown = 3; 
                nextBtn.textContent = `${originalButtonText} (${countdown})`;
                
                tutorialCountdownInterval = setInterval(() => {
                    countdown--;
                    if (countdown > 0) {
                        nextBtn.textContent = `${originalButtonText} (${countdown})`;
                    } else {
                        clearInterval(tutorialCountdownInterval);
                        tutorialCountdownInterval = null;
                        nextBtn.disabled = false;
                        nextBtn.textContent = originalButtonText;
                    }
                }, 1000);
            } else {
                console.warn(`Tutorial element not found: ${step.element}. Skipping.`);
                currentTutorialStep++;
                showTutorialStep(currentTutorialStep);
            }
        }, 150); 
    }

    function startTutorial() {
        currentTutorialStep = 0;
        dom.tutorialOverlay.classList.remove('hidden');
        showTutorialStep(currentTutorialStep);
    }

    function endTutorial(completed = false) {
        if (tutorialCountdownInterval) {
            clearInterval(tutorialCountdownInterval);
            tutorialCountdownInterval = null;
        }
        document.querySelector('.app-footer').classList.remove('tutorial-footer-active');
        document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
        
        if (completed) {
            dom.tutorialTitle.textContent = 'Готово!';
            dom.tutorialText.innerHTML = 'Теперь вы знаете всё необходимое. <br><br><b>Важно:</b> все задания и розыгрыши в этом боте абсолютно бесплатны. Удачи!';
            dom.tutorialStepCounter.textContent = '';
            
            // --- 👇 ЦЕНТРИРОВАНИЕ ФИНАЛЬНОГО ОКНА 👇 ---
            dom.tutorialModal.style.top = '50%';
            dom.tutorialModal.style.left = '5%';
            dom.tutorialModal.style.width = '90%';
            dom.tutorialModal.style.transform = 'translateY(-50%)';
            // -------------------------------------------

            dom.tutorialSkipBtn.classList.add('hidden');
            dom.tutorialNextBtn.textContent = 'Отлично!';
            dom.tutorialNextBtn.disabled = false;
            
            dom.tutorialNextBtn.onclick = () => {
                dom.tutorialOverlay.classList.add('hidden');
                
                // Сбрасываем стили, чтобы при следующем запуске не сломалось
                dom.tutorialModal.style.top = ''; 
                dom.tutorialModal.style.transform = '';
                
                dom.tutorialNextBtn.onclick = tutorialNextHandler;
                dom.tutorialSkipBtn.classList.remove('hidden');
            };
        } else {
             dom.tutorialOverlay.classList.add('hidden');
             // Сброс стилей при пропуске
             dom.tutorialModal.style.top = ''; 
             dom.tutorialModal.style.transform = '';
        }
        localStorage.setItem('tutorialCompleted', 'true');
    }
    function tutorialNextHandler() {
        currentTutorialStep++;
        showTutorialStep(currentTutorialStep);
    };

    function showNewPromoNotification() {
        sessionStorage.setItem('newPromoReceived', 'true');
        dom.newPromoNotification.classList.remove('hidden');
    }

    function showRewardClaimedModal() {
        showNewPromoNotification();
        dom.rewardClaimedOverlay.classList.remove('hidden');
    }

    function hideRewardClaimedModal() {
        dom.rewardClaimedOverlay.classList.add('hidden');
    }

    function showTicketsClaimedModal() {
        dom.ticketsClaimedOverlay.classList.remove('hidden');
    }

    function hideTicketsClaimedModal() {
        dom.ticketsClaimedOverlay.classList.add('hidden');
    }
    
    function showInfoModal() {
        dom.infoModalOverlay.classList.remove('hidden');
    }

    function hideInfoModal() {
        dom.infoModalOverlay.classList.add('hidden');
    }

    function showCustomPrompt(title, questId) {
        currentQuestId = questId;
        dom.promptTitle.textContent = title;
        dom.promptInput.value = '';
        dom.promptOverlay.classList.remove('hidden');
        dom.promptInput.focus();
    }

    function hideCustomPrompt() {
        dom.promptOverlay.classList.add('hidden');
    }
    
    function switchView(targetViewId) {
        dom.viewDashboard.classList.add('hidden');
        dom.viewQuests.classList.add('hidden');
        document.getElementById(targetViewId)?.classList.remove('hidden');
        dom.footerItems.forEach(item => item.classList.remove('active'));
        const navId = `nav-${targetViewId.split('-')[1]}`;
        document.getElementById(navId)?.classList.add('active');
    }
    
    async function makeApiRequest(url, body = {}, method = 'POST', isSilent = false) {
        if (!isSilent) dom.loaderOverlay.classList.remove('hidden');
        try {
            // Устанавливаем таймаут 25 секунд (чтобы не висело вечно)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);

            const options = { 
                method, 
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal // <--- Подключаем сигнал
            };
            
            if (method !== 'GET') {
                options.body = JSON.stringify({ ...body, initData: Telegram.WebApp.initData });
            }
            
            const response = await fetch(url, options);
            clearTimeout(timeoutId); // <--- Очищаем таймер, если успели

            if (response.status === 429) {
                // ... обработка 429 ...
                throw new Error('Cooldown active'); 
            }
            if (response.status === 204) return null;
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || result.message || 'Ошибка сервера');
            return result;
        } catch (e) {
            // Обработка таймаута
            if (e.name === 'AbortError') {
                e.message = "Превышено время ожидания ответа от сервера.";
            }
            
            if (e.message !== 'Cooldown active' && !isSilent) {
                 Telegram.WebApp.showAlert(`Ошибка: ${e.message}`);
            }
            throw e;
        } finally {
            if (!isSilent) dom.loaderOverlay.classList.add('hidden');
        }
    }

   function startCountdown(timerElement, expiresAt, intervalKey, onEndCallback) {
        if (countdownIntervals[intervalKey]) {
            clearInterval(countdownIntervals[intervalKey]);
        }
        if (!timerElement) { 
            return;
        }
        const endTime = new Date(expiresAt).getTime();
        const updateTimer = () => {
            const currentTimerElement = document.getElementById(timerElement.id);
            if (!currentTimerElement) {
                clearInterval(countdownIntervals[intervalKey]);
                return;
            }
            const now = new Date().getTime();
            const distance = endTime - now;
            if (distance < 0) {
                clearInterval(countdownIntervals[intervalKey]);
                delete countdownIntervals[intervalKey];
                if (onEndCallback) {
                    onEndCallback();
                } 
                else if (intervalKey === 'challenge') {
                    const cardElement = currentTimerElement.closest('.quest-card');
                    if (cardElement) {
                       cardElement.classList.add('expired');
                       cardElement.innerHTML = `
                           <div class="quest-content-wrapper">
                               <div class="quest-icon"><i class="fa-solid fa-star"></i></div>
                               <h2 class="quest-title">${cardElement.querySelector('.quest-title')?.textContent || 'Челлендж'}</h2>
                           </div>
                           <div class="expired-overlay">
                               <div class="expired-overlay-text">Время истекло</div>
                               <button id="check-challenge-progress-btn" class="claim-reward-button" style="margin-top:0;">
                                   <i class="fa-solid fa-flag-checkered"></i> <span>Завершить</span>
                               </button>
                           </div>
                       `;
                    }
                } 
                else if (intervalKey.startsWith('quest_')) {
                     const cardElement = currentTimerElement.closest('.quest-card');
                     if (cardElement) {
                        cardElement.classList.add('expired');
                        const contentWrapper = cardElement.querySelector('.quest-content-wrapper');
                        cardElement.innerHTML = `
                            ${contentWrapper ? contentWrapper.outerHTML : ''}
                            <div class="expired-overlay">
                                <div class="expired-overlay-text">Время истекло</div>
                                <button id="complete-expired-quest-btn" class="claim-reward-button" style="margin-top:0;">
                                   <i class="fa-solid fa-flag-checkered"></i> <span>Завершить</span>
                                </button>
                            </div>
                        `;
                     }
                }
                if (intervalKey === 'challenge_cooldown') {
                    refreshDataSilently();
                }
                return;
            }
            const d = Math.floor(distance / 86400000);
            const h = Math.floor((distance % 86400000) / 3600000);
            const m = Math.floor((distance % 3600000) / 60000);
            const s = Math.floor((distance % 60000) / 1000);
            let result = '';
            if (d > 0) result += `${d}д `;
            result += `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            currentTimerElement.textContent = result;
        };
        countdownIntervals[intervalKey] = setInterval(updateTimer, 1000);
        updateTimer();
    }
    
    function clearAllCountdowns() {
        Object.keys(countdownIntervals).forEach(key => {
            clearInterval(countdownIntervals[key]);
        });
        countdownIntervals = {};
    }
    
    function createTwitchNoticeHtml() {
        return `<div class="twitch-update-notice">ℹ️ Прогресс обновляется с задержкой (до 30 мин).</div>`;
    }

function renderChallenge(challengeData, isGuest) {
        dom.challengeContainer.innerHTML = '';
        
        // --- ПОЛУЧАЕМ СТАТУС СТРИМА ---
        const isOnline = userData.is_stream_online === true;
        
        const streamBadgeHtml = isOnline 
            ? `<div class="stream-status-badge online"><i class="fa-solid fa-circle" style="font-size:6px; vertical-align:middle; margin-right:3px;"></i> СТРИМ ОНЛАЙН</div>`
            : `<div class="stream-status-badge offline">СТРИМ ОФФЛАЙН</div>`;

        // 1. Гость
        if (isGuest) {
            dom.challengeContainer.innerHTML = `
                <div class="quest-card quest-locked">
                    ${streamBadgeHtml} <div class="quest-icon"><i class="fa-brands fa-twitch"></i></div>
                    <h2 class="quest-title">Случайный челлендж</h2>
                    <p class="quest-subtitle">Для доступа к челленджам требуется привязка Twitch-аккаунта.</p>
                    <a href="/profile" class="perform-quest-button" style="text-decoration: none;">Привязать Twitch</a>
                </div>`;
            return;
        }
        
        // 2. Кулдаун
        if (challengeData && challengeData.cooldown_until) {
            dom.challengeContainer.innerHTML = `
                <div class="quest-card challenge-card">
                    ${streamBadgeHtml} <div class="quest-icon"><i class="fa-solid fa-hourglass-half"></i></div>
                    <h2 class="quest-title">Следующий челлендж</h2>
                    <p class="quest-subtitle">Новое задание будет доступно после окончания таймера.</p>
                    <div id="challenge-cooldown-timer" class="challenge-timer" style="font-size: 14px; font-weight: 600; color: var(--primary-color); margin-top: 10px;">...</div>
                </div>`;
            if (!countdownIntervals['challenge_cooldown']) {
                startCountdown(document.getElementById('challenge-cooldown-timer'), challengeData.cooldown_until, 'challenge_cooldown');
            }
            return;
        }

       // 3. (ОБНОВЛЕНО) Если нет челленджа И Стрим Оффлайн -> Кнопка "Расписание"
        if ((!challengeData || !challengeData.description) && !isOnline) {
            dom.challengeContainer.innerHTML = `
                <div class="quest-card challenge-card">
                    
                    <div class="quest-icon" style="color: #ff3b30; box-shadow: none; text-shadow: none; background: rgba(255, 59, 48, 0.1);">
                        <i class="fa-solid fa-video-slash"></i>
                    </div>

                    <h2 class="quest-title">Стрим сейчас оффлайн</h2>
                    <p class="quest-subtitle">Челленджи доступны только во время эфира. Посмотрите расписание.</p>
                    
                    <button id="open-schedule-btn" class="claim-reward-button" style="background: #3a3a3c; color: #fff; box-shadow: none; border: 1px solid rgba(255,255,255,0.1);">
                        <i class="fa-regular fa-calendar-days"></i> <span>Расписание стримов</span>
                    </button>
                </div>`;
            
            // Вешаем событие открытия модалки сразу здесь
            document.getElementById('open-schedule-btn').addEventListener('click', () => {
                document.getElementById('schedule-modal-overlay').classList.remove('hidden');
            });
            return;
        }
    
        // 4. Стрим Онлайн (или есть данные) -> Кнопка "Получить"
        if (!challengeData || !challengeData.description) {
            dom.challengeContainer.innerHTML = `
                <div class="quest-card challenge-card">
                    ${streamBadgeHtml} <div class="quest-icon"><i class="fa-solid fa-dice"></i></div>
                    <h2 class="quest-title">Случайный челлендж</h2>
                    <p class="quest-subtitle">Испытай удачу! Получи случайное задание и выполни его.</p>
                    <button id="get-challenge-btn" class="claim-reward-button">
                        <i class="fa-solid fa-play"></i> <span>Получить челлендж</span>
                    </button>
                </div>`;
            return;
        }

        // 5. Челлендж уже взят (Активен)
        const challenge = challengeData; 
        const currentProgress = challenge.progress_value || 0;
        const target = challenge.target_value || 1;
        const percent = target > 0 ? Math.min(100, (currentProgress / target) * 100) : 0;
        const canClaim = currentProgress >= target && !challenge.claimed_at;
        const isCompleted = currentProgress >= target;
        let statusText = '';
        if (challenge.claimed_at) {
            statusText = '<div style="color: #34C759; font-size: 12px; margin: 5px 0;">✅ Награда получена</div>';
        } else if (isCompleted) {
            statusText = '<div style="color: #FFCC00; font-size: 12px; margin: 5px 0;">🎁 Награда готова!</div>';
        }
        const isTwitchChallenge = challenge.condition_type && challenge.condition_type.includes('twitch');
        const twitchNotice = isTwitchChallenge ? createTwitchNoticeHtml() : '';
        const claimButton = `<button id="claim-challenge-btn" data-challenge-id="${challenge.challenge_id}" class="claim-reward-button" ${!canClaim ? 'disabled' : ''}><i class="fa-solid fa-gift"></i> <span>Забрать награду</span></button>`;
        let progressTextContent = `${currentProgress} / ${target}`;
        const conditionType = challenge.condition_type || '';
        if (conditionType.includes('twitch_uptime')) {
            progressTextContent = `${currentProgress} / ${target} мин.`;
        } else if (conditionType.includes('twitch_messages')) {
            progressTextContent = `💬 ${currentProgress} / ${target}`;
        } else if (conditionType.includes('telegram_messages')) {
            progressTextContent = `✉️ ${currentProgress} / ${target}`;
        }
        
        dom.challengeContainer.innerHTML = `
            <div class="quest-card challenge-card">
                ${streamBadgeHtml} <div class="quest-icon"><i class="fa-solid fa-star"></i></div>
                <h2 class="quest-title">${challenge.description || ''}</h2>
                ${statusText}
                <div id="challenge-timer" class="challenge-timer">...</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percent}%;"></div>
                    <div class="progress-content">
                        <span class="progress-text">${progressTextContent}</span>
                    </div>
                </div>
                ${twitchNotice}
                ${claimButton}
            </div>`;
        
        if (challenge.expires_at) {
            startCountdown(document.getElementById('challenge-timer'), challenge.expires_at, 'challenge');
        }
    }
    
    function renderActiveAutomaticQuest(quest, userData) {
        dom.activeAutomaticQuestContainer.innerHTML = '';
        if (!quest || !userData || !userData.active_quest_id) {
            console.log("renderActiveAutomaticQuest: Нет активного квеста для отображения."); // DEBUG
            return;
        }
        const activeQuest = allQuests.find(q => q.id === userData.active_quest_id);
        if (!activeQuest) {
             console.error("renderActiveAutomaticQuest: Не найдены детали для active_quest_id:", userData.active_quest_id); // DEBUG
             return;
        }
        
        console.log("renderActiveAutomaticQuest: Отображаем квест:", activeQuest.title, "ID:", activeQuest.id); // DEBUG

        const iconHtml = (activeQuest.icon_url && activeQuest.icon_url !== "") ? `<img src="${activeQuest.icon_url}" class="quest-image-icon" alt="Иконка квеста">` : `<div class="quest-icon"><i class="fa-solid fa-bolt"></i></div>`;
        const progress = userData.active_quest_progress || 0;
        const target = activeQuest.target_value || 1;
        const percent = target > 0 ? Math.min(100, (progress / target) * 100) : 0;
        const percentText = `${Math.floor(percent)}%`; // <-- ДОБАВЛЕНО
        const isCompleted = progress >= target;
        const isTwitchQuest = activeQuest.quest_type && activeQuest.quest_type.includes('twitch');
        const twitchNotice = isTwitchQuest ? createTwitchNoticeHtml() : '';
        let buttonHtml = '';
        if (isCompleted) {
            buttonHtml = `<button class="claim-reward-button" data-quest-id="${activeQuest.id}"><i class="fa-solid fa-gift"></i> <span>Забрать</span></button>`;
        } else {
            const lastCancel = userData.last_quest_cancel_at;
            let cancelBtnDisabled = false;
            let cooldownEndTime = null;
            if (lastCancel) {
                const lastCancelDate = new Date(lastCancel);
                const now = new Date();
                const diffHours = (now - lastCancelDate) / 3600000;
                if (diffHours < 24) {
                    cancelBtnDisabled = true;
                    cooldownEndTime = new Date(lastCancelDate.getTime() + 24 * 60 * 60 * 1000);
                }
            }
            buttonHtml = `<button id="cancel-quest-btn" class="cancel-quest-button" ${cancelBtnDisabled ? 'disabled' : ''}>Отменить</button>`;
            if (cancelBtnDisabled) {
                setTimeout(() => {
                    const btn = document.getElementById('cancel-quest-btn');
                    if (btn) {
                         startCountdown(btn, cooldownEndTime, 'quest_cancel', () => {
                            btn.disabled = false;
                            btn.textContent = 'Отменить';
                        });
                    }
                }, 0);
            }
        }
        const currentProgress = Math.min(progress, target);
        let progressTextContent = `${currentProgress} / ${target}`;
        const questType = activeQuest.quest_type || '';
        if (questType.includes('twitch_uptime')) {
            progressTextContent = `${currentProgress} / ${target} мин.`;
        } else if (questType.includes('twitch_messages')) {
            progressTextContent = `💬 ${currentProgress} / ${target}`;
        } else if (questType.includes('telegram_messages')) {
            progressTextContent = `✉️ ${currentProgress} / ${target}`;
        }
        
        const questEndDate = userData.active_quest_end_date;
        console.log("renderActiveAutomaticQuest: Дата окончания квеста (questEndDate):", questEndDate); // DEBUG

        // --- ИЗМЕНЕНИЕ: Добавили '...' как начальный текст ---
        const timerHtml = questEndDate ? `<div id="quest-timer-${activeQuest.id}" class="challenge-timer">...</div>` : '';
        
        dom.activeAutomaticQuestContainer.innerHTML = `
            <div class="quest-card">
                ${!isCompleted ? '<div class="active-quest-indicator">Выполняется</div>' : ''}
                <div class="quest-content-wrapper">
                    ${iconHtml}
                    <h2 class="quest-title">${activeQuest.title || ''}</h2>
                    <p class="quest-subtitle">${activeQuest.description || ''}</p>
                    ${timerHtml} 
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${percent}%;"></div>
                        <div class="progress-content"><span class="progress-text">${progressTextContent}</span></div>
                    </div>
                    ${twitchNotice}
                </div>
                <div class="button-container">${buttonHtml}</div>
            </div>`;
            
        if (questEndDate) {
            // --- ИЗМЕНЕНИЕ: Убедимся, что элемент найден перед запуском таймера ---
            // Даем браузеру микро-задачу на отрисовку перед поиском элемента
            setTimeout(() => {
                 const timerElement = document.getElementById(`quest-timer-${activeQuest.id}`);
                 if (timerElement) {
                    console.log(`renderActiveAutomaticQuest: Элемент таймера #quest-timer-${activeQuest.id} НАЙДЕН. Запускаем startCountdown.`); // DEBUG
                    startCountdown(timerElement, questEndDate, `quest_${activeQuest.id}`);
                 } else {
                    console.error(`renderActiveAutomaticQuest: Элемент таймера #quest-timer-${activeQuest.id} НЕ НАЙДЕН после отрисовки!`); // DEBUG
                 }
            }, 0); // Нулевая задержка выполнит код после текущего потока отрисовки
        }
        
        dom.questChooseBtn.classList.add('hidden');
        dom.questChooseContainer.classList.add('hidden');
    }

    function renderManualQuests(quests) {
        // ИЗМЕНЕНИЕ: Целимся в конкретный контейнер, а не во всю вкладку
        const container = document.getElementById('manual-quests-list');
        
        // Если контейнер еще не создан в HTML (на всякий случай), выходим
        if (!container) return;

        container.innerHTML = ''; // Очищаем ТОЛЬКО список заданий

        if (!quests || quests.length === 0) {
            container.innerHTML = `<p style="text-align: center; font-size: 12px; color: var(--text-color-muted);">Нет заданий для ручной проверки.</p>`;
            return;
        }

        // Используем Map для сохранения порядка категорий
        const groupedQuests = new Map();

        quests.forEach(quest => {
            const categoryName = quest.quest_categories ? quest.quest_categories.name : 'Разное';
            if (!groupedQuests.has(categoryName)) {
                groupedQuests.set(categoryName, []);
            }
            groupedQuests.get(categoryName).push(quest);
        });

        // Отображаем категории
        groupedQuests.forEach((questsInCategory, categoryName) => {
            const questsHtml = questsInCategory.map(quest => {
                const iconHtml = (quest.icon_url && quest.icon_url !== "") ? `<img src="${escapeHTML(quest.icon_url)}" class="quest-image-icon" alt="Иконка квеста">` : `<div class="quest-icon"><i class="fa-solid fa-user-check"></i></div>`;
                const actionLinkHtml = (quest.action_url && quest.action_url !== "")
                    ? `<a href="${escapeHTML(quest.action_url)}" target="_blank" rel="noopener noreferrer" class="action-link-btn">Перейти</a>`
                    : '';
                const submitButtonText = (quest.action_url && quest.action_url !== "") ? 'Отправить' : 'Выполнить';
                
                return `
                    <div class="quest-card" style="display: flex; flex-direction: column;">
                        <div style="flex-grow: 1;">
                            ${iconHtml}
                            <h2 class="quest-title">${escapeHTML(quest.title || '')}</h2>
                            <p class="quest-subtitle">${escapeHTML(quest.description || '')}</p>
                            <p class="quest-subtitle">Награда: ${quest.reward_amount || ''} ⭐</p>
                        </div>
                        <div class="manual-quest-actions">
                            ${actionLinkHtml}
                            <button class="perform-quest-button" data-id="${quest.id}" data-title="${escapeHTML(quest.title)}">${submitButtonText}</button>
                        </div>
                    </div>
                `;
            }).join('');

            const accordionHtml = `
                <details class="quest-category-accordion">
                    <summary class="quest-category-header">${escapeHTML(categoryName)}</summary>
                    <div class="quest-category-body">
                        ${questsHtml}
                    </div>
                </details>
            `;
            container.insertAdjacentHTML('beforeend', accordionHtml);
        });
    }
    // --- КОНЕЦ ОБНОВЛЕННОЙ ВЕРСИИ ---
    function renderWeeklyGoals(data) {
        // Используем новые элементы из объекта dom (убедитесь, что вы добавили их в dom = {...})
        const listContainer = dom.weeklyGoalsListContainer;
        const triggerContainer = dom.weeklyGoalsTrigger;
        const badgeElement = dom.weeklyGoalsBadge;
        const counterElement = dom.weeklyModalCounter;

        // --- Проверка прав и доступности ---
        const isAdmin = userData && userData.is_admin;
        const shouldShow = data && data.system_enabled;

        // Если данных нет, или система выключена (и юзер не админ), или нет целей -> скрываем баннер
        if (!data || (!shouldShow && !isAdmin) || !data.goals || data.goals.length === 0) {
            if (triggerContainer) triggerContainer.classList.add('hidden');
            return;
        }

        // Если все ок -> показываем баннер
        if (triggerContainer) triggerContainer.classList.remove('hidden');

        // Обновляем счетчик в заголовке модалки (X / Y)
        if (counterElement) {
            counterElement.textContent = `${data.completed_goals} / ${data.total_goals}`;
        }

        // --- ЛОГИКА ДЛЯ БЕЙДЖА (УВЕДОМЛЕНИЯ) ---
        let hasUnclaimedReward = false;

        // 1. Проверяем обычные задачи: выполнена, награда - билеты, но еще не забрана
        if (data.goals.some(g => g.is_complete && g.reward_type === 'tickets' && !g.small_reward_claimed)) {
            hasUnclaimedReward = true;
        }

        // 2. Проверяем Суперприз: готов к получению, но не получен
        if (data.super_prize_ready_to_claim && !data.super_prize_claimed) {
            hasUnclaimedReward = true;
        }

        // Управляем видимостью бейджа на картинке
        if (badgeElement) {
            if (hasUnclaimedReward) {
                badgeElement.classList.remove('hidden');
            } else {
                badgeElement.classList.add('hidden');
            }
        }

        // --- РЕНДЕРИНГ ЗАДАЧ ---
        // Если контейнер для списка (в модальном окне) не найден - выходим, чтобы не было ошибок
        if (!listContainer) return;

        const goalsHtml = data.goals.map(goal => {
            // 👇 НОВОЕ: Если награда уже забрана — не рендерим этот блок вообще
            if (goal.small_reward_claimed) return ''; 
            // 👆 КОНЕЦ НОВОГО
            const progress = goal.current_progress || 0;
            const target = goal.target_value || 1;
            const percent = target > 0 ? Math.min(100, (progress / target) * 100) : 0;
            const percentText = `${Math.floor(percent)}%`;
            const isCompleted = goal.is_complete || false;

            // --- Логика кнопки награды ---
            let buttonHtml = '';
            if (goal.reward_type === 'tickets' && goal.reward_value > 0) {
                if (goal.small_reward_claimed) {
                    buttonHtml = `<button class="weekly-goal-reward-btn claimed" disabled>Получено</button>`;
                } else if (isCompleted) {
                    buttonHtml = `<button class="weekly-goal-reward-btn claim-task-reward-btn" data-goal-id="${goal.id}">Забрать (+${goal.reward_value})</button>`;
                } else {
                    buttonHtml = `<button class="weekly-goal-reward-btn" disabled>+${goal.reward_value} 🎟️</button>`;
                }
            }

            // --- Выбор иконки ---
            let iconClass = 'fa-solid fa-star'; // По умолчанию
            const taskType = goal.task_type || '';

            if (taskType === 'manual_quest_complete') iconClass = 'fa-solid fa-user-check';
            else if (taskType === 'twitch_purchase') iconClass = 'fa-brands fa-twitch';
            else if (taskType === 'auction_bid') iconClass = 'fa-solid fa-gavel';
            else if (taskType === 'cauldron_contribution') iconClass = 'fa-solid fa-gift';
            else if (taskType.includes('twitch_messages')) iconClass = 'fa-solid fa-comment-dots';
            else if (taskType.includes('telegram_messages')) iconClass = 'fa-brands fa-telegram';
            else if (taskType.includes('uptime')) iconClass = 'fa-regular fa-clock';
            else if (taskType.startsWith('stat_')) iconClass = 'fa-solid fa-chart-line';

            // --- Примечание (Description) ---
            let descriptionHtml = '';
            if (goal.description) {
                descriptionHtml = `<p class="weekly-goal-description">${escapeHTML(goal.description)}</p>`;
            }

            // --- Логика ссылок и навигации ---
            let navLinkHtml = '';
            const taskInfoMap = {
                'manual_quest_complete': { text: 'Перейти к заполнению ручного задания', nav: 'view-quests' },
                'twitch_purchase': { text: 'Награда Twitch', nav: 'https://www.twitch.tv/hatelove_ttv' },
                'auction_bid': { text: 'Перейти в аукцион', nav: '/auction' },
                'cauldron_contribution': { text: 'Перейти в ивент', nav: '/halloween' },
                'wizebot_challenge_complete': { text: 'Wizebot Челлендж (в профиле)', nav: null },
                'stat_twitch_messages_week': { text: 'Перейти на канал', nav: 'https://www.twitch.tv/hatelove_ttv' },
                'stat_twitch_uptime_week': { text: 'Перейти на канал', nav: 'https://www.twitch.tv/hatelove_ttv' },
                'stat_telegram_messages_week': { text: 'Перейти на канал', nav: 'https://t.me/hatelovettv' }
            };

            const info = taskInfoMap[taskType];

            if (info) {
                if (info.nav) {
                    // Это кнопка-ссылка
                    const isExternal = info.nav.startsWith('http');
                    const icon = isExternal ? '<i class="fa-solid fa-arrow-up-right-from-square"></i>' : '';
                    // Добавляем подсветку для квестов, если нужно
                    const highlightId = (taskType === 'manual_quest_complete' && goal.target_entity_id)
                        ? `data-highlight-quest-id="${goal.target_entity_id}"`
                        : '';

                    navLinkHtml = `<a href="#" class="weekly-goal-nav-link" data-nav="${info.nav}" ${highlightId}>${info.text} ${icon}</a>`;

                } else if (!descriptionHtml) {
                    // Это просто текст (если нет описания)
                    navLinkHtml = `<span class="weekly-goal-nav-link text-only">${info.text}</span>`;
                }
            }

            // --- Сборка HTML элемента задачи ---
            return `
                <div class="weekly-goal-item ${isCompleted ? 'completed' : ''}">
                    <div class="weekly-goal-icon">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="weekly-goal-info">
                        <h3 class="weekly-goal-title">${escapeHTML(goal.title)}</h3>
                        
                        <div class="weekly-goal-progress-row">
                            <div class="weekly-goal-progress-bar">
                                <div class="weekly-goal-progress-fill" style="width: ${percent}%;"></div>
                                <div class="weekly-goal-progress-content">
                                    <span class="weekly-goal-progress-text">${percentText}</span>
                                </div>
                            </div>
                            ${buttonHtml}
                        </div>
                        ${descriptionHtml} ${navLinkHtml}
                    </div>
                </div>
            `;
        }).join('');

        // --- РЕНДЕРИНГ СУПЕРПРИЗА ---
        let superPrizeHtml = '';
        if (data.total_goals > 0) {
            const prizeInfo = data.super_prize_info;
            let prizeText = '...';
            
            if (prizeInfo.super_prize_type === 'tickets') {
                prizeText = `${prizeInfo.super_prize_value} 🎟️`;
            } else if (prizeInfo.super_prize_type === 'promocode_batch') {
                prizeText = `Промокод на ${prizeInfo.super_prize_value} ⭐`;
            }

            let prizeButtonHtml = '';
            if (data.super_prize_claimed) {
                prizeButtonHtml = `<button class="claim-reward-button" disabled>Суперприз получен!</button>`;
            } else if (data.super_prize_ready_to_claim) {
                prizeButtonHtml = `<button id="claim-super-prize-btn" class="claim-reward-button">Забрать Суперприз!</button>`;
            } else {
                prizeButtonHtml = `<button class="claim-reward-button" disabled>Выполните все задания</button>`;
            }

            superPrizeHtml = `
                <div class="weekly-super-prize-card">
                    <h2 class="quest-title">${escapeHTML(prizeInfo.super_prize_description || 'Главный приз')}</h2>
                    <p class="quest-subtitle">Награда: ${prizeText}</p>
                    ${prizeButtonHtml}
                </div>
            `;
        }

        // --- Вставка итогового HTML в список ---
        listContainer.innerHTML = `
            <div class="weekly-goals-container">
                ${goalsHtml}
                ${superPrizeHtml}
            </div>
        `;
    }
    
    async function refreshDataSilently() {
        try {
            // Запрашиваем расширенный heartbeat
            const hbData = await makeApiRequest("/api/v1/user/heartbeat", {}, 'POST', true);
            
            if (hbData) {
                // 1. Если бот выключен глобально
                if (hbData.is_active === false) return;

                // 2. Обновляем баланс в интерфейсе и в памяти
                if (hbData.tickets !== undefined) {
                    userData.tickets = hbData.tickets; // Обновляем память
                    const ticketEl = document.getElementById('ticketStats');
                    if (ticketEl) ticketEl.textContent = hbData.tickets;
                }
                
                // 3. Обновляем прогресс АВТОМАТИЧЕСКОГО КВЕСТА
                if (hbData.quest_id) {
                    // Обновляем глобальную переменную
                    userData.active_quest_id = hbData.quest_id;
                    userData.active_quest_progress = hbData.quest_progress;

                    // Находим квест в базе, чтобы точно знать цель (target)
                    const activeQuest = allQuests.find(q => q.id === hbData.quest_id);
                    
                    if (activeQuest) {
                        const target = activeQuest.target_value || 1;
                        const progress = hbData.quest_progress;
                        
                        // А. Обновляем карточку во вкладке "Задания" (если она есть)
                        const activeQuestContainer = document.getElementById('active-automatic-quest-container');
                        if (activeQuestContainer) {
                            const fill = activeQuestContainer.querySelector('.progress-fill');
                            const textSpan = activeQuestContainer.querySelector('.progress-text');
                            const claimBtn = activeQuestContainer.querySelector('.claim-reward-button');

                            if (fill && textSpan) {
                                // Формируем текст с иконками, если нужно
                                let prefix = "";
                                if (activeQuest.quest_type && activeQuest.quest_type.includes('twitch_messages')) prefix = "💬 ";
                                else if (activeQuest.quest_type && activeQuest.quest_type.includes('telegram_messages')) prefix = "✉️ ";
                                
                                const suffix = (activeQuest.quest_type && activeQuest.quest_type.includes('uptime')) ? " мин." : "";

                                // Обновляем текст и полоску
                                textSpan.textContent = `${prefix}${progress} / ${target}${suffix}`;
                                const percent = Math.min(100, (progress / target) * 100);
                                fill.style.width = `${percent}%`;

                                // Если квест выполнен, но кнопки нет -> обновляем UI
                                if (progress >= target && !claimBtn) {
                                    console.log("Квест выполнен в фоне! Обновляем UI...");
                                    renderActiveAutomaticQuest(activeQuest, userData);
                                }
                            }
                        }
                    }
                }

                // 4. Обновляем прогресс ЧЕЛЛЕНДЖА
                if (hbData.has_active_challenge) {
                    // Обновляем память (если объект challenge существует)
                    if (!userData.challenge) userData.challenge = {};
                    userData.challenge.progress_value = hbData.challenge_progress;
                    userData.challenge.target_value = hbData.challenge_target;

                    const challengeContainer = document.getElementById('challenge-container');
                    if (challengeContainer) {
                        const fill = challengeContainer.querySelector('.progress-fill');
                        const textSpan = challengeContainer.querySelector('.progress-text');
                        const claimBtn = challengeContainer.querySelector('#claim-challenge-btn');

                        if (fill && textSpan) {
                            const progress = hbData.challenge_progress;
                            const target = hbData.challenge_target;
                            
                            // Определяем префикс по текущему тексту (простой способ)
                            let prefix = "";
                            const currentText = textSpan.textContent;
                            if (currentText.includes("💬")) prefix = "💬 ";
                            if (currentText.includes("✉️")) prefix = "✉️ ";
                            
                            const suffix = currentText.includes("мин.") ? " мин." : "";

                            textSpan.textContent = `${prefix}${progress} / ${target}${suffix}`;
                            const percent = Math.min(100, (progress / target) * 100);
                            fill.style.width = `${percent}%`;

                            if (progress >= target && (!claimBtn || claimBtn.disabled)) {
                                console.log("Челлендж выполнен в фоне! Перерисовываем...");
                                renderChallenge(userData.challenge, false);
                            }
                        }
                    }
                }

                // 5. 🔥 ВАЖНО: Обновляем ярлыки на ГЛАВНОЙ странице
                updateShortcutStatuses(userData, allQuests);
            }
        } catch (e) {
            console.error("Ошибка фонового обновления:", e);
        }
    }
    
    async function startChallengeRoulette() {
        const getChallengeBtn = document.getElementById('get-challenge-btn');
        if(getChallengeBtn) getChallengeBtn.disabled = true;
        dom.loaderOverlay.classList.remove('hidden'); 
        try {
            const available = await makeApiRequest('/api/v1/user/challenge/available');
            const assignedChallenge = await makeApiRequest('/api/v1/user/challenge');
            dom.loaderOverlay.classList.add('hidden'); 
            if (assignedChallenge && assignedChallenge.cooldown_until) {
                renderChallenge(assignedChallenge, false);
                return;
            }
            if (!available || available.length === 0 || !assignedChallenge || !assignedChallenge.challenges) {
                Telegram.WebApp.showAlert('Нет доступных челленджей или произошла ошибка.');
                if(getChallengeBtn) getChallengeBtn.disabled = false;
                return;
            }
            const overlay = document.createElement('div');
            overlay.className = 'prompt-overlay';
            overlay.innerHTML = `<div style="width: 90%; max-width: 400px; height: 150px; background: var(--surface-glass-bg); border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; overflow: hidden;"><div id="roulette-inner" style="position: absolute; width: 100%; top: 0;"></div><div style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); width: 100%; height: 50px; border-top: 2px solid var(--primary-color); border-bottom: 2px solid var(--primary-color); box-sizing: border-box; z-index: 1;"></div></div>`;
            document.body.appendChild(overlay);
            const inner = overlay.querySelector('#roulette-inner');
            const itemHeight = 50;
            let rouletteItems = [];
            for (let i = 0; i < 30; i++) rouletteItems.push(...available.sort(() => Math.random() - 0.5));
            rouletteItems.push(assignedChallenge.challenges);
            inner.innerHTML = rouletteItems.map(item => `<div data-id="${item.id}" style="height: ${itemHeight}px; display: flex; flex-direction: column; align-items: center; justify-content: center;"><div style="font-size: 14px; font-weight: 600;">${item.description}</div><div style="font-size: 11px; color: var(--quest-icon-color);">Награда: ${item.reward_amount} ⭐</div></div>`).join('');
            await new Promise(resolve => setTimeout(resolve, 100));
            const winnerElement = Array.from(inner.querySelectorAll(`[data-id="${assignedChallenge.challenge_id}"]`)).pop();
            if (winnerElement) {
                const centeredPosition = winnerElement.offsetTop - (inner.parentElement.clientHeight / 2) + (itemHeight / 2);
                inner.style.transition = 'transform 6s cubic-bezier(0.2, 0.8, 0.2, 1)';
                inner.style.transform = `translateY(-${centeredPosition}px)`;
                setTimeout(() => {
                    overlay.remove();
                    main();
                }, 7000);
            }
        } catch (e) {
            dom.loaderOverlay.classList.add('hidden');
            if(getChallengeBtn) getChallengeBtn.disabled = false;
        }
    }
    
async function startQuestRoulette() {
        dom.questChooseBtn.disabled = true;
        if (questsForRoulette.length === 0) {
            Telegram.WebApp.showAlert("Сейчас нет доступных испытаний.");
            dom.questChooseBtn.disabled = false;
            return;
        }
        const container = dom.questChooseContainer;
        container.innerHTML = "";
        dom.questChooseContainer.classList.remove('hidden');
        const shuffled = [...questsForRoulette].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 3);
        selected.forEach((quest, index) => {
            const card = document.createElement("div");
            card.className = "quest-option-card";
            
            // 👇 ЛОГИКА ОТОБРАЖЕНИЯ НАГРАДЫ ИЗМЕНЕНА ЗДЕСЬ 👇
            const rewardHtml = userData.quest_rewards_enabled
                ? `<div class="quest-subtitle">Награда: ${quest.reward_amount} ⭐</div>`
                : `<div class="event-mode-reward-wrapper">
                       <i class="icon fa-solid fa-trophy"></i>
                       <div class="text-content">
                           <span class="title">Идет ивент!</span>
                           <span class="subtitle">Звёзды отключены, награда - только билеты</span>
                       </div>
                   </div>`;
    
            card.innerHTML = `
                <div class="quest-icon"><i class="fa-solid fa-bolt"></i></div>
                <div class="quest-title">${quest.title}</div>
                ${rewardHtml}
            `;
            setTimeout(() => card.classList.add("show"), index * 200);
            card.addEventListener("click", async () => {
                console.log(`[КЛИЕНТ] Пользователь нажал на карточку квеста ID: ${quest.id}, Название: "${quest.title}"`);
                card.classList.add("chosen");
                Array.from(container.children).forEach(otherCard => {
                    if (otherCard !== card) {
                        otherCard.classList.add("fade-out");
                    }
                });
                setTimeout(async () => {
                    try {
                        console.log(`[КЛИЕНТ] Отправляем запрос на сервер для активации квеста ${quest.id}...`);
                        await makeApiRequest("/api/v1/quests/start", { quest_id: quest.id });
                        console.log(`[КЛИЕНТ] Запрос на сервер УСПЕШЕН. Перезагружаем основной экран...`);
                        Telegram.WebApp.showAlert(`✅ Вы выбрали задание: ${quest.title}`);
                        await main();
                    } catch(e) {
                        console.error(`[КЛИЕНТ] Произошла ОШИБКА при запросе на сервер:`, e);
                        Telegram.WebApp.showAlert(`Не удалось взять задание. Ошибка: ${e.message}. Попробуйте позже.`);
                    }
                }, 600);
            });
            container.appendChild(card);
        });
    }
    
    function hideQuestRoulette() {
        const container = dom.questChooseContainer;
        Array.from(container.children).forEach(card => card.classList.add('fade-out'));
        setTimeout(() => {
            container.innerHTML = '';
            container.classList.add('hidden');
            dom.questChooseBtn.disabled = false;
        }, 500);
    }

    // --- ФУНКЦИИ МАГАЗИНА ---

// 1. Функция загрузки товаров
async function loadAndRenderShop() {
    const container = document.getElementById('shop-container');
    container.innerHTML = '<div class="spinner"></div>'; // Показываем спиннер
    
    try {
        // Запрашиваем товары у вашего Python-сервера
        // Убедитесь, что в Python (index.py) есть эндпоинт /api/v1/shop/goods
        const goods = await makeApiRequest('/api/v1/shop/goods');
        
        container.innerHTML = ''; // Очищаем спиннер
        
        if (!goods || goods.length === 0) {
            container.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">В магазине пока пусто.</p>';
            return;
        }

        // Рисуем карточки товаров
        goods.forEach(item => {
            const card = document.createElement('div');
            card.className = 'shop-item';
            
            // Подставляем данные (image_url, name, price)
            // Если картинки нет, ставим заглушку
            const imgUrl = item.image_url || 'https://placehold.co/150/2c2c2c/ffffff?text=No+Image';
            
            card.innerHTML = `
                <img src="${escapeHTML(imgUrl)}" alt="${escapeHTML(item.name)}">
                <h3>${escapeHTML(item.name)}</h3>
                <p>${item.price} <i class="fa-solid fa-star"></i></p>
                <button class="shop-btn">Купить</button>
            `;
            
            // Вешаем клик на кнопку "Купить"
            const btn = card.querySelector('.shop-btn');
            btn.onclick = () => buyItem(item.id, item.price, item.name);
            
            container.appendChild(card);
        });
        
    } catch (e) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #ff453a;">Ошибка загрузки магазина. Попробуйте позже.</p>';
        console.error(e);
    }
}

// 2. Функция покупки
async function buyItem(itemId, price, name) {
    Telegram.WebApp.showConfirm(`Купить "${name}" за ${price} звёзд?`, async (ok) => {
        if (!ok) return;
        
        try {
            // Вызываем эндпоинт покупки
            await makeApiRequest('/api/v1/shop/buy', { item_id: itemId, price: price });
            
            Telegram.WebApp.showAlert(`Успешно! Товар "${name}" выдан.`);
            
            // Обновляем баланс в интерфейсе (перезагружаем данные пользователя)
            await main(); 
            
        } catch (e) {
            // Если недостаточно денег или ошибка
            Telegram.WebApp.showAlert(e.message || "Ошибка при покупке");
        }
    });
}

// Функция проверки: нужно ли показывать попап и кнопку
async function checkReferralAndWelcome(userData) {
    const startParam = Telegram.WebApp.initDataUnsafe?.start_param;
    const bonusBtn = document.getElementById('open-bonus-btn');

    // --- ОПТИМИЗАЦИЯ: Мгновенный показ кнопки (если есть ссылка r_) ---
    let potentialReferral = false;
    if (startParam && startParam.startsWith('r_') && !userData.referral_activated_at) {
        potentialReferral = true;
        if (bonusBtn) {
            bonusBtn.classList.remove('hidden');
            bonusBtn.onclick = () => openWelcomePopup(userData);
        }
    }

    // 1. Попытка синхронизации при входе по ссылке
    if (startParam && startParam.startsWith('r_')) {
        try {
            await fetch('/api/v1/user/sync_referral', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: Telegram.WebApp.initData })
            });
            // Мы не ждем ответа для UI, просто шлем запрос
        } catch (e) { console.error("Ref sync error", e); }
    }

    // --- ЛОГИКА ОТОБРАЖЕНИЯ (ФИНАЛЬНАЯ ПРОВЕРКА) ---

    // 🔥 ИСПРАВЛЕНИЕ БАГА: Если бонус УЖЕ получен -> Чистим всё и выходим
    if (userData.referral_activated_at) {
        if (bonusBtn) bonusBtn.classList.add('hidden');
        
        // Удаляем все флаги, чтобы уведомление не вылезло снова
        localStorage.removeItem('openRefPopupOnLoad');
        localStorage.removeItem('bonusPopupDeferred'); 
        
        // Принудительно скрываем уведомление, если оно успело появиться
        const notif = document.getElementById('new-promo-notification');
        if (notif && notif.classList.contains('bonus-mode')) {
            notif.classList.add('hidden');
            notif.classList.remove('bonus-mode'); // Убираем наш класс-маркер
        }
        return; 
    }

    // Если есть реферер (подтвержденный сервером ИЛИ мы только что пришли по ссылке)
    if (userData.referrer_id || potentialReferral) {
        if (bonusBtn) {
            bonusBtn.classList.remove('hidden');
            bonusBtn.onclick = () => openWelcomePopup(userData);
        }

        const shouldRestorePopup = localStorage.getItem('openRefPopupOnLoad');
        const isDeferred = localStorage.getItem('bonusPopupDeferred');

        if (shouldRestorePopup) {
            openWelcomePopup(userData);
            localStorage.removeItem('openRefPopupOnLoad');
        } 
        else if (!isDeferred) {
            openWelcomePopup(userData);
        } 
        else {
            showTopBonusNotification(userData);
        }
    } 
    else {
        if (bonusBtn) bonusBtn.classList.add('hidden');
    }
}

// Функция для красивого уведомления сверху
function showTopBonusNotification(userData) {
    const notif = document.getElementById('new-promo-notification');
    if (!notif) return;

    const span = notif.querySelector('span');
    if (span) span.innerHTML = '🎁 <b>Ваш бонус ждет!</b> Нажмите, чтобы забрать.';
    
    notif.style.backgroundColor = '#FFD700';
    notif.style.color = '#000';
    notif.classList.remove('hidden');
    notif.classList.add('bonus-mode'); // Добавляем метку для очистки

    notif.onclick = (e) => {
        if (!e.target.classList.contains('promo-notification-close')) {
            openWelcomePopup(userData);
            notif.classList.add('hidden');
        }
    };
}
// Вспомогательные функции стилей (Обновил цвета рамок)
function markStepDone(el, icon) {
    if(el) { el.style.borderColor = "#34c759"; el.style.background = "rgba(52, 199, 89, 0.1)"; }
    if(icon) { icon.className = "fa-solid fa-circle-check"; icon.style.color = "#34c759"; }
}

function markStepError(el, icon) {
    if(el) el.style.borderColor = "#ff3b30";
    if(icon) { icon.className = "fa-solid fa-circle-xmark"; icon.style.color = "#ff3b30"; }
}

function markStepPending(el, icon) {
    // Возвращаем дефолтные цвета (Twitch фиолетовый, ТГ синий)
    if(el) { 
        el.style.borderColor = "transparent"; 
        if(el.id === 'step-twitch') el.style.background = "rgba(145, 70, 255, 0.15)";
        if(el.id === 'step-tg') el.style.background = "rgba(0, 136, 204, 0.15)";
    }
    if(icon) { icon.className = "fa-regular fa-circle"; icon.style.color = "#aaa"; }
}

// Вспомогательные функции стилей
function markStepDone(el, icon) {
    if(el) { el.style.borderColor = "#34c759"; el.style.color = "#fff"; }
    if(icon) { icon.className = "fa-solid fa-circle-check"; icon.style.color = "#34c759"; }
}
function markStepError(el, icon) {
    if(el) el.style.borderColor = "#ff3b30";
    if(icon) { icon.className = "fa-solid fa-circle-xmark"; icon.style.color = "#ff3b30"; }
}
function markStepPending(el, icon) {
    if(el) el.style.borderColor = "transparent";
    if(icon) { icon.className = "fa-regular fa-circle"; icon.style.color = "#aaa"; }
}
// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ СТИЛЕЙ (Нужны для попапа) ---
function markStepDone(el, icon) {
    if(el) { el.style.borderColor = "#34c759"; el.style.background = "rgba(52, 199, 89, 0.1)"; }
    if(icon) { icon.className = "fa-solid fa-circle-check"; icon.style.color = "#34c759"; }
}

function markStepError(el, icon) {
    if(el) el.style.borderColor = "#ff3b30";
    if(icon) { icon.className = "fa-solid fa-circle-xmark"; icon.style.color = "#ff3b30"; }
}

function markStepPending(el, icon) {
    if(el) { 
        el.style.borderColor = "transparent"; 
        if(el.id === 'step-twitch') el.style.background = "rgba(145, 70, 255, 0.15)";
        if(el.id === 'step-tg') el.style.background = "rgba(0, 136, 204, 0.15)";
    }
    if(icon) { icon.className = "fa-regular fa-circle"; icon.style.color = "#aaa"; }
}

// --- ОСНОВНАЯ ФУНКЦИЯ ПОПАПА (С ЛОГИКОЙ ВОЗВРАТА) ---
// --- ИСПРАВЛЕННАЯ ФУНКЦИЯ (ПОЛНОСТЬЮ) ---
function openWelcomePopup(userData) {
    const popup = document.getElementById('welcome-popup');
    const successModal = document.getElementById('subscription-success-modal');
    
    // Элементы нового окна SOS
    const sosOverlay = document.getElementById('sos-modal-overlay');
    const sosCloseBtn = document.getElementById('sos-close-btn');
    const sosAdminBtn = document.getElementById('sos-admin-btn');

    if (!popup) return;

    const stepTwitch = document.getElementById('step-twitch');
    const stepTg = document.getElementById('step-tg');
    
    // Ищем иконки (для Телеграма она статична, для Твича найдем позже, так как перезапишем HTML)
    const iconTg = document.getElementById('icon-tg');
    const actionBtn = document.getElementById('action-btn');

    // --- 1. Логика отрисовки Twitch (если не привязан) ---
    if (!userData.twitch_id) {
        
        const authUrl = `https://hatelavka-quest-nine.vercel.app/api/v1/auth/twitch_oauth?initData=${encodeURIComponent(Telegram.WebApp.initData)}`;
        
        // Перерисовываем блок, добавляя кнопки И КРУЖОЧЕК СТАТУСА
        stepTwitch.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fa-brands fa-twitch" style="font-size: 20px; color: #9146ff; width: 24px; text-align: center;"></i>
                    <div style="text-align: left;">
                        <div style="font-weight: 500; font-size: 14px; color: #fff;">Привязка Twitch</div>
                        <div style="font-size: 11px; color: #aaa;">Обязательно для бонуса</div>
                    </div>
                </div>
                <i id="icon-twitch" class="fa-regular fa-circle" style="color: #aaa; font-size: 16px;"></i>
            </div>

            <div style="display: flex; gap: 8px; width: 100%;">
                <button id="twitch-help-btn-popup" style="background-color: rgba(145, 70, 255, 0.2); color: #9146ff; border: 1px solid rgba(145, 70, 255, 0.4); border-radius: 8px; width: 42px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;">
                    <i class="fa-solid fa-question" style="font-size: 16px;"></i>
                </button>

                <button id="connect-twitch-btn-popup" style="background-color: #9146ff; color: white; border: none; border-radius: 8px; height: 36px; flex-grow: 1; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px;">
                    <i class="fa-brands fa-twitch"></i> Привязать
                </button>
            </div>
        `;
        
        // Убираем кликабельность самой плашки (чтобы клик шел только по кнопкам)
        stepTwitch.onclick = null; 
        stepTwitch.style.cursor = 'default';
        stepTwitch.style.display = 'block';
        stepTwitch.style.padding = '12px';

        // Вешаем обработчики (делаем это с задержкой 0, чтобы HTML успел обновиться)
        setTimeout(() => {
            const btnConnect = document.getElementById('connect-twitch-btn-popup');
            const btnHelp = document.getElementById('twitch-help-btn-popup');

            if (btnConnect) {
                btnConnect.onclick = (e) => {
                    e.stopPropagation();
                    localStorage.setItem('openRefPopupOnLoad', 'true');
                    Telegram.WebApp.openLink(authUrl, { try_instant_view: false });
                };
            }

            // --- ЛОГИКА ОТКРЫТИЯ ОКНА SOS ---
            if (btnHelp) {
                btnHelp.onclick = (e) => {
                    e.stopPropagation();
                    // Скрываем Приветственный попап (убираем класс visible)
                    popup.classList.remove('visible');
                    // Показываем SOS попап
                    if(sosOverlay) sosOverlay.classList.remove('hidden');
                };
            }
        }, 0);

    } else {
        // Если УЖЕ привязан — оставляем старое поведение
        stepTwitch.onclick = () => {
            Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        };
    }
    
    // --- ОБРАБОТЧИКИ ДЛЯ ОКНА SOS ---
    if (sosCloseBtn) {
        sosCloseBtn.onclick = () => {
            // Скрываем SOS
            sosOverlay.classList.add('hidden');
            // Возвращаем Приветственный попап
            popup.classList.add('visible');
        };
    }
    if (sosAdminBtn) {
        sosAdminBtn.onclick = () => {
             Telegram.WebApp.openTelegramLink('https://t.me/hatelove_twitch');
        };
    }

    // --- 2. Логика Telegram ---
    stepTg.onclick = () => {
        Telegram.WebApp.openTelegramLink('https://t.me/hatelove_ttv');
    };

    // Показываем основное окно
    popup.classList.add('visible');

    // --- 3. Визуальная проверка статусов ---
    // Находим иконку Twitch (она была создана динамически выше, либо уже была в HTML)
    const iconTwitch = document.getElementById('icon-twitch');

    if (userData.twitch_id) {
        markStepDone(stepTwitch, iconTwitch);
    } else {
        markStepPending(stepTwitch, iconTwitch);
    }
    
    // Проверка статуса подписки Telegram (предполагаем поле is_telegram_subscribed)
    // Если такого поля нет, можно использовать логику, что если юзер открыл попап, он еще не проверен полностью
    markStepPending(stepTg, iconTg);


    // --- 4. Логика кнопки "Проверить" ---
    const attemptActivation = async () => {
        actionBtn.disabled = true;
        actionBtn.textContent = "Проверка...";

        try {
            const response = await fetch('/api/v1/user/referral/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: Telegram.WebApp.initData })
            });

            const res = await response.json();

            if (response.ok) {
                // --- УСПЕХ ---
                // Обновляем иконки на зеленые галочки
                markStepDone(stepTwitch, document.getElementById('icon-twitch'));
                markStepDone(stepTg, iconTg);
                
                Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                actionBtn.textContent = "Успешно!";
                actionBtn.style.background = "#34c759";
                
                document.getElementById('open-bonus-btn')?.classList.add('hidden');
                localStorage.removeItem('openRefPopupOnLoad');

                setTimeout(() => {
                    popup.classList.remove('visible');
                    if (successModal) {
                        successModal.classList.remove('hidden');
                        successModal.classList.add('visible');
                    }
                    refreshDataSilently(); 
                }, 800);

            } else {
                // --- ОШИБКА ---
                actionBtn.disabled = false;
                actionBtn.textContent = "Проверить снова";
                Telegram.WebApp.HapticFeedback.notificationOccurred('error');
                
                const msg = res.detail || "";
                
                // Снова ищем иконку Twitch, так как она динамическая
                const currentTwitchIcon = document.getElementById('icon-twitch');

                if (msg.includes("канал") || msg.includes("подпишитесь")) {
                    markStepDone(stepTwitch, currentTwitchIcon);
                    markStepError(stepTg, iconTg);
                } else if (msg.includes("Twitch") || msg.includes("привяжите")) {
                    markStepError(stepTwitch, currentTwitchIcon);
                    markStepPending(stepTg, iconTg);
                } else {
                    Telegram.WebApp.showAlert(msg);
                }
            }
        } catch (e) {
            console.error(e);
            actionBtn.disabled = false;
            actionBtn.textContent = "Ошибка сети";
        }
    };

    actionBtn.onclick = attemptActivation;
}
    
function setupEventListeners() {
    // --- НОВЫЕ ЯРЛЫКИ НА ГЛАВНОЙ ---
    // Логика кнопки "В главное меню" в новом окне успеха
    const successCloseBtn = document.getElementById('success-close-btn');
    if (successCloseBtn) {
        successCloseBtn.addEventListener('click', () => {
            // Показываем лоадер для визуального отклика
            document.getElementById('loader-overlay').classList.remove('hidden');
            
            // Принудительно перезагружаем страницу
            // Это скроет все окна и обновит статус бонуса (кнопка пропадет, так как бонус уже получен)
            window.location.reload();
        });
    }
    
    // 1. Магазин -> shop.html
    document.getElementById('shortcut-shop')?.addEventListener('click', () => {
        window.location.href = '/shop';
    });

    // 2. Челленджи -> Вкладка Задания + Скролл
    document.getElementById('shortcut-challenge')?.addEventListener('click', async () => {
        await openQuestsTab(false); // Открываем вкладку
        await refreshDataSilently(); // 🔥 ПРИНУДИТЕЛЬНО ПОДГРУЖАЕМ ДАННЫЕ
        
        // Небольшая задержка, чтобы данные успели отрисоваться
        setTimeout(() => {
            const el = document.getElementById('challenge-container');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    });

    // 3. Испытания -> Вкладка Задания + Скролл
    document.getElementById('shortcut-quests')?.addEventListener('click', async () => {
        await openQuestsTab(false);
        await refreshDataSilently(); // 🔥 ПРИНУДИТЕЛЬНО ПОДГРУЖАЕМ ДАННЫЕ
        
        setTimeout(() => {
            const activeEl = document.getElementById('active-automatic-quest-container');
            const startBtn = document.getElementById('quest-choose-btn');
            
            // Если есть активный квест, скроллим к нему, иначе к кнопке старт
            if (activeEl && activeEl.innerHTML.trim() !== "") {
                 activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (startBtn) {
                 startBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    });
    // --- КОНЕЦ БЛОКА ЯРЛЫКОВ ---
    // 👇 ВСТАВЬТЕ ВАШ КОД СЮДА 👇

    // Открытие модалки при клике на баннер
    if (dom.weeklyGoalsTrigger) {
        dom.weeklyGoalsTrigger.addEventListener('click', () => {
            dom.weeklyModalOverlay.classList.remove('hidden');
            // Блокируем прокрутку основной страницы
            document.body.style.overflow = 'hidden';
        });
    }

    // Закрытие модалки по крестику
    if (dom.weeklyModalCloseBtn) {
        dom.weeklyModalCloseBtn.addEventListener('click', () => {
            dom.weeklyModalOverlay.classList.add('hidden');
            // Разблокируем прокрутку
            document.body.style.overflow = '';
        });
    }

    // Закрытие по клику вне контента (по темному фону)
    if (dom.weeklyModalOverlay) {
        dom.weeklyModalOverlay.addEventListener('click', (e) => {
            if (e.target === dom.weeklyModalOverlay) {
                dom.weeklyModalOverlay.classList.add('hidden');
                // Разблокируем прокрутку
                document.body.style.overflow = '';
            }
        });
    }

    // 👆 КОНЕЦ ВАШЕГО КОДА 👆
    // Обработчик кнопки "Позже" в приветственном попапе
    const laterBtn = document.getElementById('later-btn');
    if (laterBtn) {
        laterBtn.addEventListener('click', () => {
            document.getElementById('welcome-popup').classList.remove('visible');
            // Запоминаем НАДОЛГО, что юзер попросил напомнить позже
            localStorage.setItem('bonusPopupDeferred', 'true');
            
            // Можно сразу показать уведомление сверху, чтобы он не потерял бонус
            // showTopBonusNotification(userData); // (Раскомментируй, если нужно сразу показать плашку)
        });
    }
   // --- ЛОГИКА ДЛЯ МАГАЗИНА (ВНУТРЕННИЙ ВИД) ---
        const shopBtn = document.getElementById('shop-open-btn');
        if (shopBtn) {
            shopBtn.addEventListener('click', () => {
                // 1. Прячем Dashboard, показываем Shop
                dom.viewDashboard.classList.add('hidden');
                dom.viewQuests.classList.add('hidden');
                
                const viewShop = document.getElementById('view-shop');
                if (viewShop) {
                    viewShop.classList.remove('hidden');
                    // 2. Загружаем товары
                    loadAndRenderShop();
                }
            });
        }
        // --- КОНЕЦ ЛОГИКИ ---
    // --- 🔽 ВОТ НОВЫЙ КОД 🔽 ---
    // Сохраняем состояние аккордеона при его открытии/закрытии
    if (dom.weeklyGoalsAccordion) {
        // 'toggle' срабатывает после того, как состояние (open) изменилось
        dom.weeklyGoalsAccordion.addEventListener('toggle', (event) => {
            localStorage.setItem('weeklyAccordionOpen', event.target.open);
        });
    }
    // --- 🔼 КОНЕЦ НОВОГО КОДА 🔼 ---   
        document.getElementById('nav-dashboard').addEventListener('click', async (e) => { 
            e.preventDefault(); 
            switchView('view-dashboard');
            await main();
        });
        document.getElementById('nav-quests').addEventListener('click', async (e) => { 
    e.preventDefault(); 
    // false означает "показать спиннер", так как пользователь нажал кнопку сам
    await openQuestsTab(false);
        });
    // --- ФИКС АККОРДЕОНА (Вставь это в setupEventListeners) ---
    // Используем делегирование, так как элементы создаются динамически
    document.addEventListener('click', (e) => {
        // Проверяем, был ли клик по заголовку аккордеона
        if (e.target && e.target.classList.contains('quest-category-header')) {
            e.preventDefault(); // Отменяем стандартное поведение, чтобы не было конфликтов
            
            const details = e.target.parentElement;
            if (details) {
                // Если открыт - закрываем, если закрыт - открываем
                if (details.hasAttribute('open')) {
                    details.removeAttribute('open');
                } else {
                    details.setAttribute('open', '');
                }
            }
        }
    });
    // --- КОНЕЦ ФИКСА ---
        dom.promptCancel.addEventListener('click', hideCustomPrompt);
        dom.promptConfirm.addEventListener('click', async () => {
            const text = dom.promptInput.value.trim();
            if (!text) return;
            const questIdForSubmission = currentQuestId;
            hideCustomPrompt();
            await makeApiRequest(`/api/v1/quests/${questIdForSubmission}/submit`, { submittedData: text });
            Telegram.WebApp.showAlert('Ваша заявка принята и отправлена на проверку!');
        });
        dom.rewardCloseBtn.addEventListener('click', () => {
            hideRewardClaimedModal();
            main();
        });

        // 👇 ДОБАВЛЕНА СТРОКА ДЛЯ НОВОЙ КНОПКИ 👇
        dom.ticketsClaimCloseBtn.addEventListener('click', () => {
            hideTicketsClaimedModal();
            main();
        });

        dom.infoQuestionIcon.addEventListener('click', showInfoModal);
        dom.infoModalCloseBtn.addEventListener('click', hideInfoModal);
        dom.questChooseBtn.addEventListener("click", () => {
                if (dom.questChooseContainer.classList.contains('hidden')) {
                        // Если контейнер скрыт - показываем рулетку
                        startQuestRoulette();
                } else {
                        // Если контейнер виден - скрываем рулетку
                        hideQuestRoulette();
                }
        });
        dom.closePromoNotification.addEventListener('click', () => {
            dom.newPromoNotification.classList.add('hidden');
            sessionStorage.removeItem('newPromoReceived');
        });
    // 👇👇👇 ВСТАВЛЯЕМ СЮДА 👇👇👇
        // Логика для модалки расписания
        const scheduleModal = document.getElementById('schedule-modal-overlay');
        const scheduleCloseBtn = document.getElementById('schedule-modal-close-btn');
        
        if (scheduleCloseBtn && scheduleModal) {
            scheduleCloseBtn.addEventListener('click', () => {
                scheduleModal.classList.add('hidden');
            });
            
            // Закрытие по клику вне картинки (опционально)
            scheduleModal.addEventListener('click', (e) => {
                if (e.target === scheduleModal) {
                    scheduleModal.classList.add('hidden');
                }
            });
        }
        // 👆👆👆 КОНЕЦ ВСТАВКИ 👆👆👆
        dom.startTutorialBtn.addEventListener('click', startTutorial);
        dom.tutorialNextBtn.onclick = tutorialNextHandler;
        dom.tutorialSkipBtn.addEventListener('click', () => endTutorial(false));
        document.body.addEventListener('click', async (event) => {
            // (v3) Обработка кнопок "Недельного Забега"
            const claimTaskBtn = event.target.closest('.claim-task-reward-btn');
            const claimSuperBtn = event.target.closest('#claim-super-prize-btn');

            if (claimTaskBtn) {
                claimTaskBtn.disabled = true;
                claimTaskBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                try {
                    const result = await makeApiRequest('/api/v1/user/weekly_goals/claim_task', {
                        goal_id: claimTaskBtn.dataset.goalId
                    });
                    
                    showTicketsClaimedModal();

                    // --- 👇 НАЧАЛО: ОБНОВЛЕНИЕ СЧЕТЧИКА В ШАПКЕ 👇 ---
                    const counterEl = document.getElementById('weekly-modal-counter');
                    if (counterEl) {
                        // Берем текущий текст, например "1 / 6"
                        const parts = counterEl.textContent.split('/');
                        if (parts.length === 2) {
                            // Превращаем текст в числа
                            let done = parseInt(parts[0].trim(), 10);
                            const total = parseInt(parts[1].trim(), 10);
                            
                            // Увеличиваем "выполненное" на 1 (или оставляем total, если так задумано)
                            // Если логика "забрано / всего":
                            if (!isNaN(done)) {
                                done += 1;
                                // Если вдруг done стало больше total (редкий баг), ограничиваем
                                if (done > total) done = total; 
                                counterEl.textContent = `${done} / ${total}`;
                            }
                        }
                    }
                    // --- 👆 КОНЕЦ: ОБНОВЛЕНИЕ СЧЕТЧИКА 👆 ---
                    
                    // Обновляем баланс билетов
                    if (result.new_ticket_balance !== undefined) {
                        document.getElementById('ticketStats').textContent = result.new_ticket_balance;
                    }

                    // Логика скрытия задания (которую мы добавили ранее)
                    const goalItem = claimTaskBtn.closest('.weekly-goal-item');
                    if (goalItem) {
                        goalItem.classList.add('fade-out-remove');
                        setTimeout(() => { goalItem.remove(); }, 500);
                    }

                } catch (e) {
                    // Обработка ошибок...
                    Telegram.WebApp.showAlert(`Ошибка: ${e.message}`);
                    claimTaskBtn.disabled = false;
                    claimTaskBtn.innerHTML = `Забрать (+${claimTaskBtn.dataset.rewardValue || '...'})`;
                }
                return; 
            }
            if (claimSuperBtn) {
                claimSuperBtn.disabled = true;
                claimSuperBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                try {
                    const result = await makeApiRequest('/api/v1/user/weekly_goals/claim_super_prize', {});
                    
                    // --- НАЧАЛО ИЗМЕНЕНИЯ ---

                    // Показываем модалку "Отправлено в профиль" в ЛЮБОМ успешном случае
                    if (result.promocode) {
                        // Случай 1: Получен промокод
                        showRewardClaimedModal();
                    } else if (result.new_ticket_balance !== undefined) {
                        // Случай 2: Получены билеты
                        // Просто обновляем баланс (пользователь увидит его на главной)
                        document.getElementById('ticketStats').textContent = result.new_ticket_balance;
                        // И ПОКАЗЫВАЕМ ТУ ЖЕ МОДАЛКУ, ЧТО И ДЛЯ ПРОМОКОДА
                        showRewardClaimedModal(); 
                    } else {
                        // Случай 3: Другое сообщение (например, "уже получено")
                        tg.showAlert(result.message);
                    }
                    
                    // --- КОНЕЦ ИЗМЕНЕНИЯ ---

                    // Меняем кнопку на "Получено"
                    claimSuperBtn.textContent = 'Суперприз получен!';
                    claimSuperBtn.classList.add('claimed');
                } catch (e) {
                    tg.showAlert(`Ошибка: ${e.message}`);
                    claimSuperBtn.disabled = false;
                    claimSuperBtn.innerHTML = 'Забрать Суперприз!';
                }
                return; // Останавливаем выполнение
            }
            // --- 🔼 КОНЕЦ НОВОГО БЛОКА 🔼 ---
            // --- 🔽 ВОТ НОВЫЙ КОД 🔽 ---
            const navLink = event.target.closest('.weekly-goal-nav-link');
            if (navLink) {
                event.preventDefault(); // Запрещаем стандартный переход по #
                const navTarget = navLink.dataset.nav;
                
                if (navTarget === 'view-quests') {
                    // --- 🔽 НОВОЕ ИЗМЕНЕНИЕ ЗДЕСЬ 🔽 ---
                    const questIdToHighlight = navLink.dataset.highlightQuestId;
                    if (questIdToHighlight) {
                        // Сохраняем ID, чтобы вкладка "Задания" могла его прочитать
                        localStorage.setItem('highlightQuestId', questIdToHighlight);
                    }
                    // --- 🔼 КОНЕЦ ИЗМЕНЕНИЯ 🔼 ---

                    // Переключаем вкладку на "Задания"
                    document.getElementById('nav-quests').click();
                } else if (navTarget.startsWith('http')) {
                    // Внешняя ссылка (Twitch)
                    Telegram.WebApp.openLink(navTarget);
                } else if (navTarget.startsWith('/')) {
                    // Внутренняя ссылка (Аукцион, Котел)
                    window.location.href = navTarget;
                }
                return; // Останавливаем выполнение
            }
            const target = event.target.closest('button');
            if (!target) return;
            if (target.id === 'get-challenge-btn') {
                await startChallengeRoulette();
            } else if (target.id === 'claim-challenge-btn') {
                target.disabled = true;
                target.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                try {
                    const challengeId = target.dataset.challengeId; 
                    if (!challengeId) throw new Error("ID челленджа не найден");
                    const result = await makeApiRequest(`/api/v1/challenges/${challengeId}/claim`, {}, 'POST');
                    if (result.success) {
                        if (result.promocode) {
                            showRewardClaimedModal(); 
                            dom.rewardCloseBtn.onclick = async () => {
                                hideRewardClaimedModal();
                                await main();
                            };
                        } else {
                            await main();
                        }
                    } else {
                        // --- ИСПРАВЛЕНИЕ ---
                        Telegram.WebApp.showAlert(result.message || "Не удалось забрать награду");
                        target.disabled = false;
                        target.innerHTML = '<i class="fa-solid fa-gift"></i> <span>Забрать награду</span>';
                    }
                } catch (e) {
                    console.error("Ошибка claim:", e);
                    target.disabled = false;
                    target.innerHTML = '<i class="fa-solid fa-gift"></i> <span>Забрать награду</span>';
                }
            
            // 👇 БЛОК 'claim-reward-button' ПОЛНОСТЬЮ ЗАМЕНЁН 👇
            } else if (target.classList.contains('claim-reward-button') && target.dataset.questId) {
                const questId = target.dataset.questId;
                if (!questId) return;
                
                target.disabled = true;
                target.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

                try {
                    const result = await makeApiRequest('/api/v1/promocode', { quest_id: parseInt(questId) });
                    
                    if (result && result.promocode) {
                        // Случай 1: Промокод получен
                        showRewardClaimedModal();
                    } else if (result && result.tickets_only) {
                        // Случай 2: Получены только билеты
                        const ticketStatsEl = document.getElementById('ticketStats');
                        if (ticketStatsEl) {
                            const currentTickets = parseInt(ticketStatsEl.textContent, 10);
                            const newTotal = currentTickets + (result.tickets_awarded || 0);
                            ticketStatsEl.textContent = newTotal;
                        }
                        showTicketsClaimedModal();
                    } else {
                        // Если что-то пошло не так, просто перезагружаем
                        await main();
                    }
                } catch (e) {
                    // При ошибке возвращаем кнопку в исходное состояние
                    target.disabled = false;
                    target.innerHTML = '<i class="fa-solid fa-gift"></i> <span>Забрать</span>';
                }
            } else if (target.classList.contains('perform-quest-button') && target.dataset.id) {
                const questId = target.dataset.id;
                const questTitle = target.dataset.title;
                if (!questId) return;
                showCustomPrompt(questTitle, questId);
            } else if (target.id === 'check-challenge-progress-btn') {
                console.log("Нажата кнопка 'Завершить' для ЧЕЛЛЕНДЖА.");
                target.disabled = true;
                target.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                try {
                    await makeApiRequest("/api/v1/user/challenge/close_expired");
                    await main();
                } catch (e) {
                    console.error("Ошибка при завершении челленджа:", e);
                    await main();
                }
            } else if (target.id === 'complete-expired-quest-btn') {
                console.log("Нажата кнопка 'Завершить' для КВЕСТА.");
                target.disabled = true;
                target.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                try {
                    await makeApiRequest('/api/v1/quests/close_expired');
                    await main();
                } catch (e) {
                     console.error("Ошибка при завершении квеста:", e);
                    target.disabled = false;
                    target.innerHTML = '<i class="fa-solid fa-flag-checkered"></i> <span>Завершить</span>';
                }
            } else if (target.id === 'cancel-quest-btn') {
                Telegram.WebApp.showConfirm("Вы уверены, что хотите отменить это задание? Вы сможете выбрать новое, но отменять задания можно лишь раз в сутки.", async (ok) => {
                    if (ok) {
                        try {
                            await makeApiRequest('/api/v1/quests/cancel');
                            Telegram.WebApp.showAlert('Задание отменено. Теперь вы можете выбрать новое.');
                            await main();
                        } catch (e) {}
                    }
                });
            }
        });
    }
    // Функция для открытия вкладки заданий
// isSilent = true означает, что мы НЕ трогаем спиннер (он уже крутится в main)
async function openQuestsTab(isSilent = false) {
    switchView('view-quests');
    
    // Загружаем квесты
    const manualQuests = await makeApiRequest("/api/v1/quests/manual", {}, 'POST', isSilent);
    renderManualQuests(manualQuests);

    // Логика подсветки (Highlight)
    try {
        const questIdToHighlight = localStorage.getItem('highlightQuestId');
        if (questIdToHighlight) {
            localStorage.removeItem('highlightQuestId');
            setTimeout(() => {
                const targetButton = document.querySelector(`.perform-quest-button[data-id="${questIdToHighlight}"]`);
                if (!targetButton) return;

                const questCard = targetButton.closest('.quest-card');
                const accordion = targetButton.closest('.quest-category-accordion');

                if (accordion) accordion.open = true;
                
                setTimeout(() => {
                    if (questCard) {
                        questCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        questCard.classList.add('tutorial-highlight');
                        setTimeout(() => questCard.classList.remove('tutorial-highlight'), 2500);
                    }
                }, 150);
            }, 200);
        }
    } catch (err) {
        console.error('Highlighting error:', err);
    }
}

    // Функция для тихой проверки реферала при входе
    function syncReferralOnLoad() {
        if (!window.Telegram || !window.Telegram.WebApp) return;
        
        const initData = window.Telegram.WebApp.initData;
        if (!initData) return;

        // Отправляем запрос на сервер, не дожидаясь ответа (fire and forget)
        fetch('/api/v1/user/sync_referral', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: initData })
        }).catch(err => {
            console.warn("Referral sync failed:", err);
        });
    }

    // Запускаем сразу
    syncReferralOnLoad();
    
    // Функция обновления статусов на ярлыках (Магазин, Челленджи, Испытания)
    // Функция обновления статусов на ярлыках (Новая Metro версия)
    function updateShortcutStatuses(userData, allQuests) {
        // 1. Обновляем Челлендж (shortcut-challenge)
        const chalStatus = document.getElementById('metro-challenge-status');
        const chalFill = document.getElementById('metro-challenge-fill');
        
        if (chalStatus && chalFill) {
            if (userData.challenge) {
                const ch = userData.challenge;
                const prog = ch.progress_value || 0;
                const target = ch.target_value || 1;
                const percent = Math.min(100, (prog / target) * 100);

                if (ch.claimed_at) {
                    chalStatus.textContent = "Награда получена";
                    chalStatus.classList.add('metro-status-done');
                    chalFill.style.width = '100%';
                    chalFill.classList.add('metro-fill-done');
                } else if (prog >= target) {
                    chalStatus.textContent = "ЗАБРАТЬ!";
                    chalStatus.classList.add('metro-status-done');
                    chalFill.style.width = '100%';
                    chalFill.classList.add('metro-fill-done');
                } else {
                    chalStatus.textContent = `${prog} / ${target}`;
                    chalStatus.classList.remove('metro-status-done');
                    chalFill.style.width = `${percent}%`;
                    chalFill.classList.remove('metro-fill-done');
                }
            } else {
                chalStatus.textContent = "Нет активного";
                chalFill.style.width = '0%';
            }
        }

        // 2. Обновляем Испытание (shortcut-quests)
        const questStatus = document.getElementById('metro-quest-status');
        const questFill = document.getElementById('metro-quest-fill');

        if (questStatus && questFill) {
            const activeId = userData.active_quest_id;
            if (!activeId) {
                questStatus.textContent = "Нажмите для выбора";
                questStatus.style.fontSize = "11px"; // Чуть меньше, если текст длинный
                questFill.style.width = '0%';
                questStatus.classList.remove('metro-status-done');
            } else {
                // Ищем квест в списке allQuests
                const quest = allQuests.find(q => q.id === activeId);
                if (quest) {
                    const prog = userData.active_quest_progress || 0;
                    const target = quest.target_value || 1;
                    const percent = Math.min(100, (prog / target) * 100);
                    
                    if (prog >= target) {
                        questStatus.textContent = "ГОТОВО";
                        questStatus.classList.add('metro-status-done');
                        questFill.style.width = '100%';
                        questFill.classList.add('metro-fill-done');
                    } else {
                        // Форматируем текст (добавляем мин. или иконки)
                        let suffix = "";
                        if(quest.quest_type && quest.quest_type.includes('uptime')) suffix = " мин.";
                        
                        questStatus.textContent = `${prog} / ${target}${suffix}`;
                        questStatus.classList.remove('metro-status-done');
                        questFill.style.width = `${percent}%`;
                        questFill.classList.remove('metro-fill-done');
                    }
                } else {
                    questStatus.textContent = "...";
                }
            }
        }
    }
    // --- ОПТИМИЗАЦИЯ: Предзагрузка изображений ---
function preloadImages(urls, onProgress) {
    if (!urls || urls.length === 0) {
        if (onProgress) onProgress(100);
        return Promise.resolve();
    }
    
    let loadedCount = 0;
    const total = urls.length;

    // Создаем массив промисов
    const imagePromises = urls.map(url => {
        return new Promise((resolve) => {
            if (!url) {
                loadedCount++;
                if (onProgress) onProgress(Math.floor((loadedCount / total) * 100));
                return resolve();
            }
            const img = new Image();
            img.src = url;
            img.onload = () => {
                loadedCount++;
                if (onProgress) onProgress(Math.floor((loadedCount / total) * 100));
                resolve();
            };
            img.onerror = () => {
                // Даже если ошибка, считаем что "обработано", чтобы не зависло
                loadedCount++; 
                if (onProgress) onProgress(Math.floor((loadedCount / total) * 100));
                resolve();
            };
        });
    });

    // Таймаут на случай, если картинки грузятся вечность (3.5 секунды)
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
            console.warn("⏳ Preload timeout, force rendering.");
            resolve();
        }, 3500); 
    });

    return Promise.race([Promise.all(imagePromises), timeoutPromise]);
}
    
// --- ОПТИМИЗАЦИЯ: Сбор всех URL из данных ---
function extractImageUrls(data) {
    const urls = [];
    if (!data) return urls;

    // Баннеры меню
    if (data.menu) {
        if (data.menu.menu_banner_url) urls.push(data.menu.menu_banner_url);
        if (data.menu.checkpoint_banner_url) urls.push(data.menu.checkpoint_banner_url);
        if (data.menu.auction_banner_url) urls.push(data.menu.auction_banner_url);
        if (data.menu.weekly_goals_banner_url) urls.push(data.menu.weekly_goals_banner_url);
        if (data.menu.auction_slide_data?.image_url) urls.push(data.menu.auction_slide_data.image_url);
    }
    // Котёл
    if (data.cauldron?.banner_image_url) urls.push(data.cauldron.banner_image_url);
    // Квесты (иконки)
    if (data.quests) {
        data.quests.forEach(q => {
            if (q.icon_url) urls.push(q.icon_url);
        });
    }
    return urls;
}

// --- ОПТИМИЗАЦИЯ: Функция рендеринга всего интерфейса ---
// Мы вынесли это из main, чтобы вызывать дважды (для кэша и для сети)
async function renderFullInterface(bootstrapData) {
    if (!bootstrapData) return;

    const menuContent = bootstrapData.menu;
    const weeklyGoalsData = bootstrapData.weekly_goals;
    const dashboardData = bootstrapData.user; 
    const questsDataResp = bootstrapData.quests;
    const cauldronData = bootstrapData.cauldron;

    // Глобальные переменные из вашего кода
    userData = dashboardData || {};
    allQuests = questsDataResp || [];

    // Проверки рефералов
    await checkReferralAndWelcome(userData); // <--- ДОБАВИЛИ await

    // Баланс
    if (document.getElementById('ticketStats')) {
        document.getElementById('ticketStats').textContent = userData.tickets || 0;
    }

    const isGuest = !userData || !userData.full_name;
    if (isGuest) {
        dom.fullName.textContent = "Гость";
    } else {
        dom.fullName.textContent = userData.full_name;
        if (userData.is_admin) dom.navAdmin.classList.remove('hidden');
    }

    // Рендер целей
    renderWeeklyGoals(weeklyGoalsData);
    if (dom.weeklyGoalsAccordion && localStorage.getItem('weeklyAccordionOpen') === 'true') {
        dom.weeklyGoalsAccordion.open = true;
    }

    // Слайдеры
    if (menuContent) {
        // Баннер целей
        if (menuContent.weekly_goals_banner_url) {
            const wImg = document.getElementById('weekly-goals-banner-img');
            if (wImg) wImg.src = menuContent.weekly_goals_banner_url;
        }

        const sliderWrapper = document.querySelector('.slider-wrapper');
        // Очищаем старые слайды перед перерисовкой, чтобы не дублировались при обновлении
        // НО оставляем их в DOM, просто пересортируем
        if (sliderWrapper && menuContent.slider_order) {
            menuContent.slider_order.forEach(slideId => {
                const slide = document.querySelector(`.slide[data-event="${slideId}"]`);
                if (slide) sliderWrapper.appendChild(slide);
            });
        }

        const setupSlide = (id, enabled, url, link) => {
            const slide = document.querySelector(`.slide[data-event="${id}"]`);
            if (slide) {
                const show = enabled || (userData && userData.is_admin);
                slide.style.display = show ? '' : 'none';
                if (show) {
                    if (link) slide.href = link;
                    if (url) {
                        const img = document.getElementById(`${id}-banner-img`) || slide.querySelector('img');
                        if (img && img.src !== url) img.src = url; // Меняем только если URL отличается
                    }
                }
            }
        };

        setupSlide('skin_race', menuContent.skin_race_enabled, menuContent.menu_banner_url);
        setupSlide('auction', menuContent.auction_enabled, menuContent.auction_banner_url || menuContent.auction_slide_data?.image_url, '/auction');
        setupSlide('checkpoint', menuContent.checkpoint_enabled, menuContent.checkpoint_banner_url);

// Кнопка Twitch/Telegram испытаний
            let activeQuestType = 'twitch';
            const day = new Date().getDay();
            if (menuContent.quest_schedule_override_enabled) {
                activeQuestType = menuContent.quest_schedule_active_type || 'twitch';
            } else if (day === 0 || day === 1) {
                activeQuestType = 'telegram';
            }

            const questButton = dom.questChooseBtn;
            if (activeQuestType === 'telegram') {
                questButton.classList.remove('twitch-theme');
                questButton.classList.add('telegram-theme');
                questButton.innerHTML = '<i class="fa-brands fa-telegram"></i> TELEGRAM ИСПЫТАНИЯ';
            } else {
                questButton.classList.remove('telegram-theme');
                questButton.classList.add('twitch-theme');
                questButton.innerHTML = '<i class="fa-brands fa-twitch"></i> TWITCH ИСПЫТАНИЯ';
            }
        }
    
    // Котел
    const eventSlide = document.querySelector('.slide[data-event="cauldron"]');
    if (eventSlide) {
        const show = (cauldronData && cauldronData.is_visible_to_users) || (userData && userData.is_admin);
        eventSlide.style.display = show ? '' : 'none';
        if (show) {
            eventSlide.href = cauldronData.event_page_url || '/halloween';
            const img = eventSlide.querySelector('img');
            if (img && cauldronData.banner_image_url && img.src !== cauldronData.banner_image_url) {
                img.src = cauldronData.banner_image_url;
            }
        }
    }

    // Запускаем логику слайдера
    // 👇 НОВЫЙ БЛОК НАЧАЛО 👇
    setupSlider(); // Запуск сразу
    setTimeout(() => setupSlider(), 100);  // Чуть позже
    setTimeout(() => setupSlider(), 500);  // Еще позже
    setTimeout(() => setupSlider(), 2000); // Страховка для медленного интернета

    // Перезапуск при загрузке каждой картинки
    document.querySelectorAll('.slide img').forEach(img => {
        img.onload = () => setupSlider();
    });
    // 👆 НОВЫЙ БЛОК КОНЕЦ 👆

    // Фильтры и рулетка
    let activeQType = 'twitch'; 
    if (menuContent && menuContent.quest_schedule_override_enabled) activeQType = menuContent.quest_schedule_active_type;
    else if (new Date().getDay() === 0 || new Date().getDay() === 1) activeQType = 'telegram';
    
    questsForRoulette = allQuests.filter(q => 
        q.quest_type && q.quest_type.startsWith(`automatic_${activeQType}`) && !q.is_completed
    );

    const activeAutomaticQuest = allQuests.find(q => q.id === userData.active_quest_id);
    const questChooseWrapper = document.getElementById('quest-choose-wrapper');
    if (questChooseWrapper) questChooseWrapper.classList.toggle('hidden', !!activeAutomaticQuest);
    
    if (activeAutomaticQuest) renderActiveAutomaticQuest(activeAutomaticQuest, userData);
    else dom.activeAutomaticQuestContainer.innerHTML = '';

    if (dashboardData.challenge) renderChallenge(dashboardData.challenge, !userData.twitch_id);
    else renderChallenge({ cooldown_until: userData.challenge_cooldown_until }, !userData.twitch_id);

    updateShortcutStatuses(userData, allQuests);
}

    async function main() {
        console.log("--- 1. main() ЗАПУЩЕНА (Progress Mode) ---");
        
        // Старт: 5%
        updateLoading(5);
        setTimeout(() => window.scrollTo(0, 0), 0);

        // БЛОК 1: Возврат в приложение (оставляем как было)
        if (window.Telegram && !Telegram.WebApp.initData) {
            // ... ваш код для редиректа ...
            if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
            return; 
        }

        // БЛОК 2: Основная логика
        updateLoading(10); // Инициализация прошла

        // 1. Проверяем КЭШ
        let hasCache = false;
        try {
            const cachedJson = localStorage.getItem('app_bootstrap_cache');
            if (cachedJson) {
                const cachedData = JSON.parse(cachedJson);
                console.log("Отображаем интерфейс из КЭША...");
                updateLoading(90); // Кэш есть - сразу почти готово
                await renderFullInterface(cachedData);
                
                updateLoading(100);
                setTimeout(() => {
                    dom.mainContent.classList.add('visible');
                    dom.loaderOverlay.classList.add('hidden');
                }, 200); // Небольшая задержка для красоты
                hasCache = true;
            }
        } catch (e) {
            console.warn("Ошибка чтения кэша:", e);
        }

        if (!hasCache) {
            dom.loaderOverlay.classList.remove('hidden');
            updateLoading(15); // Начинаем запрос к серверу
        }

        try {
            // 2. Загружаем данные с сервера
            // Чтобы прогресс не стоял на месте во время запроса, можно запустить фейковый таймер
            let fakeProgress = 15;
            const fakeTimer = setInterval(() => {
                if (fakeProgress < 40) { // До 40% доходим сами пока ждем
                    fakeProgress++;
                    if (!hasCache) updateLoading(fakeProgress);
                }
            }, 200);

            const bootstrapData = await makeApiRequest("/api/v1/bootstrap", {}, 'POST', hasCache);
            clearInterval(fakeTimer); // Останавливаем фейковый таймер

            if (!bootstrapData) throw new Error("Bootstrap failed");

            // Данные получены — прыгаем на 45%
            if (!hasCache) updateLoading(45);

            // 3. Предзагрузка картинок (от 45% до 90%)
            const imageUrls = extractImageUrls(bootstrapData);
            
            if (imageUrls.length > 0) {
                if (!hasCache) {
                    await preloadImages(imageUrls, (percentOfImages) => {
                        // Математика: преобразуем 0-100% картинок в диапазон 45-95% общей загрузки
                        const totalProgress = 45 + Math.floor(percentOfImages * 0.5); 
                        updateLoading(totalProgress);
                    });
                } else {
                    preloadImages(imageUrls); // Если кэш, грузим фоном
                }
            }

            // 4. Рендерим
            if (!hasCache) updateLoading(95);
            console.log("Обновляем интерфейс СВЕЖИМИ данными...");
            await renderFullInterface(bootstrapData);

            // Сохраняем кэш
            localStorage.setItem('app_bootstrap_cache', JSON.stringify(bootstrapData));

            // Проверки (туториал и т.д.)
            if (!localStorage.getItem('tutorialCompleted')) startTutorial();
            if (sessionStorage.getItem('newPromoReceived') === 'true') dom.newPromoNotification.classList.remove('hidden');

            if (window.location.hash === '#quests') {
                await openQuestsTab(true);
                history.replaceState(null, null, window.location.pathname + window.location.search);
            }
        
        } catch (e) {
            console.error("Критическая ошибка main:", e);
            localStorage.removeItem('app_bootstrap_cache');
            
            if (!hasCache) {
                dom.challengeContainer.innerHTML = `<p style="text-align:center; color: #ff453a;">Ошибка загрузки: ${e.message}</p>`;
                dom.loadingText.textContent = "Ошибка";
                dom.loadingText.style.color = "#ff453a";
            }
        } finally {
            // 5. Финиш
            updateLoading(100);
            setTimeout(() => {
                dom.mainContent.classList.add('visible');
                dom.loaderOverlay.classList.add('hidden');
            }, 300); // Даем пользователю увидеть 100%
        }
            
// --- ЗАПУСК ПРИЛОЖЕНИЯ (Этого не хватало) ---
    setupEventListeners();
    main();
    setInterval(refreshDataSilently, 7000);

} catch (e) {
    // --- БЛОК ОБРАБОТКИ ОШИБОК (Этого не хватало) ---
    console.error("Critical Error in Global Scope:", e);
    if (dom.loaderOverlay) dom.loaderOverlay.classList.add('hidden');
    
    // Показываем ошибку на экране, чтобы вы видели, что случилось
    document.body.innerHTML = `
        <div style="text-align:center; padding:20px; color: #fff; background: #000; height: 100vh; display: flex; flex-direction: column; justify-content: center;">
            <h1 style="color: #ff3b30; margin-bottom: 10px;">Ошибка запуска</h1>
            <p style="font-family: monospace; background: #333; padding: 10px; border-radius: 8px;">${e.name}: ${e.message}</p>
            <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; border-radius: 8px; border: none; background: #007aff; color: white; font-weight: bold;">Повторить</button>
        </div>`;
}
