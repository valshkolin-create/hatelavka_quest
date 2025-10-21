try {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();

    const updatedBalance = localStorage.getItem('userTicketBalance');
    if (updatedBalance !== null) {
        document.getElementById('ticketStats').textContent = updatedBalance;
        localStorage.removeItem('userTicketBalance');
    }

    const dom = {
        loaderOverlay: document.getElementById('loader-overlay'),
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
    };

    let currentQuestId = null;
    let countdownIntervals = {};
    let allQuests = [];
    let userData = {};
    let questsForRoulette = [];
    let tutorialCountdownInterval = null;
    
    // --- ИСПРАВЛЕННАЯ ЛОГИКА ДЛЯ СЛАЙДЕРА V2 ---
    let currentSlideIndex = 0;
    let slideInterval;
    const slideDuration = 15000; // 30 секунд

    function setupSlider() {
        const container = document.getElementById('main-slider-container');
        if (!container) return; // Если слайдера нет, ничего не делаем

        // --- ИЗМЕНЕНИЕ №1: Находим только ВИДИМЫЕ слайды ---
        const allSlides = container.querySelectorAll('.slide');
        const visibleSlides = Array.from(allSlides).filter(
            slide => window.getComputedStyle(slide).display !== 'none'
        );

        const wrapper = container.querySelector('.slider-wrapper');
        const dotsContainer = container.querySelector('.slider-dots');
        const prevBtn = document.getElementById('slide-prev-btn');
        const nextBtn = document.getElementById('slide-next-btn');

        // --- ИЗМЕНЕНИЕ №2: Добавляем логику для 0 или 1 слайда ---
        
        // Если видимых слайдов нет, прячем весь контейнер
        if (visibleSlides.length === 0) {
            container.style.display = 'none';
            return;
        }

        // Если виден только один слайд, показываем его как картинку, но без управления
        if (visibleSlides.length <= 1) {
            container.style.display = ''; // Убедимся, что контейнер виден
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
            if (dotsContainer) dotsContainer.style.display = 'none';
            // Перематываем на первый видимый слайд на случай, если он не первый в DOM
            const firstVisibleIndex = Array.from(allSlides).indexOf(visibleSlides[0]);
            if (wrapper) wrapper.style.transform = `translateX(-${firstVisibleIndex * 100}%)`;
            return;
        }
        
        // Если мы дошли сюда, значит слайдов > 1 и нужно запустить карусель
        container.style.display = '';
        if (prevBtn) prevBtn.style.display = 'flex';
        if (nextBtn) nextBtn.style.display = 'flex';
        if (dotsContainer) dotsContainer.style.display = 'flex';
        
        // --- ИЗМЕНЕНИЕ №3: Работаем дальше только с видимыми слайдами ---
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

            // Находим реальный индекс слайда в DOM, чтобы правильно рассчитать смещение
            const targetSlide = visibleSlides[index];
            const realIndex = Array.from(allSlides).indexOf(targetSlide);

            if (!wrapper || !dots[index]) return;
            
            wrapper.style.transform = `translateX(-${realIndex * 100}%)`;
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

        prevBtn.addEventListener('click', () => {
            prevSlide();
            resetSlideInterval();
        });

        nextBtn.addEventListener('click', () => {
            nextSlide();
            resetSlideInterval();
        });
        
        // Код для свайпа остается без изменений, он будет работать корректно
        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let isSwiping = false;

        container.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchEndX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            isSwiping = false;
        }, { passive: true });

        container.addEventListener('touchmove', (e) => {
            if (!touchStartX || !touchStartY) return;
            const touchCurrentX = e.touches[0].clientX;
            const touchCurrentY = e.touches[0].clientY;
            const deltaX = Math.abs(touchStartX - touchCurrentX);
            const deltaY = Math.abs(touchStartY - touchCurrentY);
            if (deltaX > deltaY) e.preventDefault();
            touchEndX = touchCurrentX;
            if (deltaX > 10) isSwiping = true;
        }, { passive: false });

        container.addEventListener('touchend', () => {
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
        });
        
        allSlides.forEach(slide => {
            slide.addEventListener('click', (e) => {
                if (isSwiping) e.preventDefault();
            });
        });

        showSlide(0);
        resetSlideInterval();
    }
    
    const tutorialSteps = [
        {
            element: '.user-profile',
            title: 'Ваш Профиль и Билеты',
            text: 'Слева находится <b>Ваш профиль</b>. Там можно привязать Twitch, указать трейд-ссылку и посмотреть все полученные промокоды. <br><br>Справа — <b>Ваши билеты</b>, которые вы зарабатываете за задания и используете в "Гонке за скинами".',
            view: 'view-dashboard'
        },
        {
            // ВАЖНОЕ ИСПРАВЛЕНИЕ: Указываем на новый контейнер слайдера
            element: '#main-slider-container',
            title: 'Гонка за скинами',
            text: 'Участвуйте, используя бесплатные билеты, которые можно заработать за выполнение заданий.',
            view: 'view-dashboard'
        },
        {
            element: '#challenge-container',
            title: 'Случайный челлендж',
            text: 'Проходите ежедневные испытания и получайте за это награды! Новые челленджи появляются регулярно.',
            view: 'view-dashboard'
        },
        {
            element: '#checkpoint-link',
            title: 'Марафон "Чекпоинт"',
            text: 'Выполняйте челленджи во время стримов, чтобы заработать звёзды и обменять их на ценные призы в марафоне.',
            view: 'view-dashboard'
        },
        {
            element: '#quest-choose-wrapper',
            title: 'Испытания',
            text: 'Выбирайте и выполняйте автоматические задания. Во время стримов доступны Twitch-испытания, а на выходных — Telegram-испытания.',
            view: 'view-dashboard'
        },
        {
            element: '#nav-leaderboard .icon-wrapper',
            title: 'Лидерборд',
            text: 'Следите за статистикой самых активных пользователей в Twitch и Telegram чатах. Нужная кнопка находится в панели снизу.'
        },
        {
            element: '#nav-quests .icon-wrapper',
            title: 'Задания',
            text: 'В этом разделе находятся задания с ручной проверкой. Найдите иконку в панели снизу, чтобы посмотреть их.'
        }
    ];
    let currentTutorialStep = 0;

    function positionTutorialModal(element) {
        const rect = element.getBoundingClientRect();
        const modal = dom.tutorialModal;
        const margin = 15;
        modal.style.visibility = 'hidden';
        modal.style.display = 'block';
        const modalHeight = modal.offsetHeight;
        modal.style.display = '';
        modal.style.visibility = '';
        modal.style.left = '5%';
        modal.style.right = '5%';
        modal.style.width = '90%';
        modal.style.bottom = 'auto';
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow >= (modalHeight + margin)) {
            modal.style.top = `${rect.bottom + margin}px`;
            return;
        }
        const spaceAbove = rect.top;
        if (spaceAbove >= (modalHeight + margin)) {
            modal.style.top = `${rect.top - modalHeight - margin}px`;
            return;
        }
        modal.style.top = `${margin}px`;
    }

    function showTutorialStep(stepIndex) {
        if (tutorialCountdownInterval) {
            clearInterval(tutorialCountdownInterval);
            tutorialCountdownInterval = null;
        }
        const footer = document.querySelector('.app-footer');
        footer.classList.remove('tutorial-footer-active');
        document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
        if (stepIndex >= tutorialSteps.length) {
            endTutorial(true);
            return;
        }
        let step = { ...tutorialSteps[stepIndex] };
        if (step.element === '#quest-choose-wrapper') {
            const activeQuestContainer = document.getElementById('active-automatic-quest-container');
            if (activeQuestContainer && activeQuestContainer.innerHTML.trim() !== '') {
                step.element = '#active-automatic-quest-container';
                step.text = 'Здесь отображается ваше активное испытание. Когда вы его выполните, сможете забрать награду и выбрать новое.';
            }
        }
        if (step.view && document.getElementById(step.view).classList.contains('hidden')) {
            switchView(step.view);
        }
        const element = document.querySelector(step.element);
        if (element) {
            if (element.closest('.app-footer')) {
                footer.classList.add('tutorial-footer-active');
            }
            element.classList.add('tutorial-highlight');
            dom.tutorialTitle.textContent = step.title;
            dom.tutorialText.innerHTML = step.text;
            dom.tutorialStepCounter.textContent = `Шаг ${stepIndex + 1} из ${tutorialSteps.length}`;
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => positionTutorialModal(element), 400);
            const originalButtonText = (stepIndex === tutorialSteps.length - 1) ? 'Завершить' : 'Далее';
            dom.tutorialNextBtn.textContent = originalButtonText;
            const nextBtn = dom.tutorialNextBtn;
            nextBtn.disabled = true;
            let countdown = 5;
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
            console.warn(`Tutorial element not found: ${step.element}. Trying next step.`);
            setTimeout(() => {
                currentTutorialStep++;
                showTutorialStep(currentTutorialStep);
            }, 100);
        }
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
            dom.tutorialSkipBtn.classList.add('hidden');
            dom.tutorialNextBtn.textContent = 'Отлично!';
            dom.tutorialNextBtn.disabled = false;
            dom.tutorialNextBtn.onclick = () => {
                dom.tutorialOverlay.classList.add('hidden');
                dom.tutorialNextBtn.onclick = tutorialNextHandler;
                dom.tutorialSkipBtn.classList.remove('hidden');
            };
        } else {
             dom.tutorialOverlay.classList.add('hidden');
        }
        localStorage.setItem('tutorialCompleted', 'true');
    }

    const tutorialNextHandler = () => {
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
            const options = { method, headers: { 'Content-Type': 'application/json' } };
            if (method !== 'GET') {
                options.body = JSON.stringify({ ...body, initData: Telegram.WebApp.initData });
            }
            const response = await fetch(url, options);
            if (response.status === 429) {
                const errorResult = await response.json();
                Telegram.WebApp.showAlert(errorResult.detail || 'Действие временно недоступно.');
                throw new Error('Cooldown active'); 
            }
            if (response.status === 204) return null;
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || result.message || 'Ошибка сервера');
            return result;
        } catch (e) {
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
        if (isGuest) {
            dom.challengeContainer.innerHTML = `
                <div class="quest-card quest-locked">
                    <div class="quest-icon"><i class="fa-brands fa-twitch"></i></div>
                    <h2 class="quest-title">Случайный челлендж</h2>
                    <p class="quest-subtitle">Для доступа к челленджам требуется привязка Twitch-аккаунта.</p>
                    <a href="/profile" class="perform-quest-button" style="text-decoration: none;">Привязать Twitch</a>
                </div>`;
            return;
        }
        if (challengeData && challengeData.cooldown_until) {
            dom.challengeContainer.innerHTML = `
                <div class="quest-card challenge-card">
                    <div class="quest-icon"><i class="fa-solid fa-hourglass-half"></i></div>
                    <h2 class="quest-title">Следующий челлендж</h2>
                    <p class="quest-subtitle">Новое задание будет доступно после окончания таймера.</p>
                    <div id="challenge-cooldown-timer" class="challenge-timer" style="font-size: 14px; font-weight: 600; color: var(--primary-color); margin-top: 10px;">...</div>
                </div>`;
            if (!countdownIntervals['challenge_cooldown']) {
                startCountdown(document.getElementById('challenge-cooldown-timer'), challengeData.cooldown_until, 'challenge_cooldown');
            }
            return;
        }
        if (!challengeData || !challengeData.description) {
            dom.challengeContainer.innerHTML = `
                <div class="quest-card challenge-card">
                    <div class="quest-icon"><i class="fa-solid fa-dice"></i></div>
                    <h2 class="quest-title">Случайный челлендж</h2>
                    <p class="quest-subtitle">Испытай удачу! Получи случайное задание и выполни его.</p>
                    <button id="get-challenge-btn" class="claim-reward-button">
                        <i class="fa-solid fa-play"></i> <span>Получить челлендж</span>
                    </button>
                </div>`;
            return;
        }
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
                <div class="quest-icon"><i class="fa-solid fa-star"></i></div>
                <h2 class="quest-title">${challenge.description || ''}</h2>
                ${statusText}
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percent}%;"></div>
                    <div class="progress-content">
                        <span class="progress-text">${progressTextContent}</span>
                    </div>
                </div>
                <div id="challenge-timer" class="challenge-timer">...</div>
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
            return;
        }
        const activeQuest = allQuests.find(q => q.id === userData.active_quest_id);
        if (!activeQuest) return;
        const iconHtml = (activeQuest.icon_url && activeQuest.icon_url !== "") ? `<img src="${activeQuest.icon_url}" class="quest-image-icon" alt="Иконка квеста">` : `<div class="quest-icon"><i class="fa-solid fa-bolt"></i></div>`;
        const progress = userData.active_quest_progress || 0;
        const target = activeQuest.target_value || 1;
        const percent = target > 0 ? Math.min(100, (progress / target) * 100) : 0;
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
        const timerHtml = questEndDate ? `<div id="quest-timer-${activeQuest.id}" class="challenge-timer"></div>` : '';
        dom.activeAutomaticQuestContainer.innerHTML = `
            <div class="quest-card">
                ${!isCompleted ? '<div class="active-quest-indicator">Выполняется</div>' : ''}
                <div class="quest-content-wrapper">
                    ${iconHtml}
                    <h2 class="quest-title">${activeQuest.title || ''}</h2>
                    <p class="quest-subtitle">${activeQuest.description || ''}</p>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${percent}%;"></div>
                        <div class="progress-content"><span class="progress-text">${progressTextContent}</span></div>
                    </div>
                    ${timerHtml}
                    ${twitchNotice}
                </div>
                <div class="button-container">${buttonHtml}</div>
            </div>`;
        if (questEndDate) {
            startCountdown(document.getElementById(`quest-timer-${activeQuest.id}`), questEndDate, `quest_${activeQuest.id}`);
        }
        dom.questChooseBtn.classList.add('hidden');
        dom.questChooseContainer.classList.add('hidden');
    }

    function renderManualQuests(quests, categories) {
        const container = dom.viewQuests;
        const title = container.querySelector('.page-title'); 
        container.innerHTML = ''; 
        if (title) container.appendChild(title); 
        if (!quests || quests.length === 0) {
            container.insertAdjacentHTML('beforeend', `<p style="text-align: center; font-size: 12px; color: var(--text-color-muted); grid-column: 1 / -1;">Нет заданий для ручной проверки.</p>`);
            return;
        }
        const groupedQuests = quests.reduce((acc, quest) => {
            const category = quest.quest_categories ? quest.quest_categories.name : 'Разное';
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(quest);
            return acc;
        }, {});
        for (const categoryName in groupedQuests) {
            const questsInCategory = groupedQuests[categoryName];
            const questsHtml = questsInCategory.map(quest => {
                const iconHtml = (quest.icon_url && quest.icon_url !== "") ? `<img src="${quest.icon_url}" class="quest-image-icon" alt="Иконка квеста">` : `<div class="quest-icon"><i class="fa-solid fa-user-check"></i></div>`;
                const actionLinkHtml = (quest.action_url && quest.action_url !== "")
                    ? `<a href="${quest.action_url}" target="_blank" rel="noopener noreferrer" class="action-link-btn">Перейти</a>`
                    : '';
                const submitButtonText = (quest.action_url && quest.action_url !== "") ? 'Отправить' : 'Выполнить';
                return `
                    <div class="quest-card" style="display: flex; flex-direction: column;">
                        <div style="flex-grow: 1;">
                            ${iconHtml}
                            <h2 class="quest-title">${quest.title || ''}</h2>
                            <p class="quest-subtitle">${quest.description || ''}</p>
                            <p class="quest-subtitle">Награда: ${quest.reward_amount || ''} ⭐</p>
                        </div>
                        <div class="manual-quest-actions">
                            ${actionLinkHtml}
                            <button class="perform-quest-button" data-id="${quest.id}" data-title="${quest.title}">${submitButtonText}</button>
                        </div>
                    </div>
                `;
            }).join('');
            const accordionHtml = `
                <details class="quest-category-accordion">
                    <summary class="quest-category-header">${categoryName}</summary>
                    <div class="quest-category-body">
                        ${questsHtml}
                    </div>
                </details>
            `;
            container.insertAdjacentHTML('beforeend', accordionHtml);
        }
    }
    
    async function refreshDataSilently() {
        try {
            const dashboardData = await makeApiRequest("/api/v1/user/me", {}, 'POST', true);
            if (dashboardData) {
                userData = dashboardData || {};
                const challengeData = dashboardData.challenge;
                const activeQuest = allQuests.find(q => q.id === userData.active_quest_id);
                if (activeQuest) {
                    renderActiveAutomaticQuest(activeQuest, userData);
                }
                if (challengeData) {
                    renderChallenge(challengeData, !userData.twitch_id);
                } else {
                    renderChallenge({ cooldown_until: userData.challenge_cooldown_until }, !userData.twitch_id);
                }
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

function setupEventListeners() {
        document.getElementById('nav-dashboard').addEventListener('click', async (e) => { 
            e.preventDefault(); 
            switchView('view-dashboard');
            await main();
        });
        document.getElementById('nav-quests').addEventListener('click', async (e) => { 
            e.preventDefault(); 
            switchView('view-quests');
            const manualQuests = await makeApiRequest("/api/v1/quests/manual");
            const categories = await makeApiRequest("/api/v1/quests/categories");
            renderManualQuests(manualQuests, categories);
        });
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
            if(dom.questChooseContainer.classList.contains('hidden')) {
                startQuestRoulette();
            } else {
                hideQuestRoulette();
            }
        });
        dom.closePromoNotification.addEventListener('click', () => {
            dom.newPromoNotification.classList.add('hidden');
            sessionStorage.removeItem('newPromoReceived');
        });
        dom.startTutorialBtn.addEventListener('click', startTutorial);
        dom.tutorialNextBtn.onclick = tutorialNextHandler;
        dom.tutorialSkipBtn.addEventListener('click', () => endTutorial(false));
        document.body.addEventListener('click', async (event) => {
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

    async function main() {
        try {
            setTimeout(() => window.scrollTo(0, 0), 0);
            if (!Telegram.WebApp.initData) {
                document.body.innerHTML = `<div style="text-align:center; padding:20px;"><h1>Ошибка</h1><p>Запустите приложение из Telegram.</p></div>`;
                return;
            }
            const menuContentPromise = fetch("/api/v1/content/menu").then(res => res.json());
            const day = new Date().getDay();
            const questButton = dom.questChooseBtn;
            if (day === 0 || day === 1) { 
                questButton.classList.remove('twitch-theme');
                questButton.classList.add('telegram-theme');
                questButton.innerHTML = '<i class="fa-brands fa-telegram"></i> ВЫХОДНЫЕ ИСПЫТАНИЯ';
            } else {
                questButton.classList.remove('telegram-theme');
                questButton.classList.add('twitch-theme');
                questButton.innerHTML = '<i class="fa-brands fa-twitch"></i> НАЧАТЬ ИСПЫТАНИЕ';
            }
            if (sessionStorage.getItem('newPromoReceived') === 'true') {
                dom.newPromoNotification.classList.remove('hidden');
            }
            const dashboardData = await makeApiRequest("/api/v1/user/me");
            userData = dashboardData || {}; 
            const challengeData = dashboardData.challenge;
            const isGuest = !userData || !userData.full_name;
            if (isGuest) {
                dom.fullName.textContent = "Гость";
            } else {
                dom.fullName.textContent = userData.full_name;
                if (userData.is_admin) dom.navAdmin.classList.remove('hidden');
            }
            document.getElementById('ticketStats').textContent = userData.tickets || 0;
            const menuContent = await menuContentPromise;
            if (menuContent) {
                // --- НОВЫЙ КОД ДЛЯ СОРТИРОВКИ СЛАЙДОВ ---
                const sliderWrapper = document.querySelector('.slider-wrapper');
                if (sliderWrapper && menuContent.slider_order) {
                    menuContent.slider_order.forEach(slideId => {
                        const slideElement = document.querySelector(`.slide[data-event="${slideId}"]`);
                        if (slideElement) {
                            sliderWrapper.appendChild(slideElement);
                        }
                    });
                }
                // --- КОНЕЦ НОВОГО КОДА ---

                // --- НОВЫЙ КОД: Логика для баннера "Гонка за скинами" ---
                const skinRaceBannerImg = document.getElementById('menu-banner-img');
                const skinRaceSlide = skinRaceBannerImg ? skinRaceBannerImg.closest('.slide') : null;

                if (skinRaceSlide) {
                    // Показываем слайд, если гонка включена ИЛИ если пользователь - админ
                    if (menuContent.skin_race_enabled || (userData && userData.is_admin)) {
                        skinRaceSlide.style.display = ''; // Показываем слайд
                        if (menuContent.menu_banner_url) {
                            skinRaceBannerImg.src = menuContent.menu_banner_url;
                        }
                    } else {
                        skinRaceSlide.style.display = 'none'; // Скрываем слайд
                    }
                }
                // --- КОНЕЦ НОВОГО КОДА ---

                if (menuContent.checkpoint_banner_url) {
                    const checkpointBannerImg = document.getElementById('checkpoint-banner-img');
                    if (checkpointBannerImg) {
                        checkpointBannerImg.src = menuContent.checkpoint_banner_url;
                    }
                }
            }
            // --- Логика для баннера ивента "Котел" (ИСПРАВЛЕНО ДЛЯ АДМИНА) ---
            try {
                const eventData = await fetch('/api/v1/events/cauldron/status', {
                    headers: { 'X-Init-Data': Telegram.WebApp.initData } // Отправляем initData для проверки админа
                }).then(res => res.json());

                const eventSlide = document.querySelector('.slide[data-event="cauldron"]');

                if (eventSlide) {
                    // --- КЛЮЧЕВОЕ ИЗМЕНЕНИЕ ---
                    // Показываем слайд, если (ивент видим для всех) ИЛИ (текущий пользователь - админ)
                    if ((eventData && eventData.is_visible_to_users) || (userData && userData.is_admin)) {
                        
                        // Если ивент активен (или мы админ), настраиваем и показываем слайд
                        eventSlide.href = eventData.event_page_url || '/halloween';
                        const img = eventSlide.querySelector('img');
                        if (img && eventData.banner_image_url) {
                            img.src = eventData.banner_image_url;
                        }
                        eventSlide.style.display = ''; // Показываем слайд
                        
                    } else {
                        // Если ивент неактивен и мы НЕ админ, скрываем слайд
                        eventSlide.style.display = 'none';
                    }
                }
            } catch (e) {
                console.error("Не удалось загрузить статус ивента 'Котел'", e);
                const eventSlide = document.querySelector('.slide[data-event="cauldron"]');
                
                // --- ИЗМЕНЕНИЕ ПРИ ОШИБКЕ ---
                // Прячем слайд при ошибке только если пользователь НЕ админ
                if (eventSlide && !(userData && userData.is_admin)) {
                    eventSlide.style.display = 'none';
                } else if (eventSlide) {
                    // Если админ, но произошла ошибка, все равно оставляем слайд видимым
                    eventSlide.style.display = '';
                }
            }
            // --- Конец логики для баннера ---
            
            // ВЫЗОВ ФУНКЦИИ СЛАЙДЕРА (ПРАВИЛЬНОЕ МЕСТО)
            setTimeout(() => {
                setupSlider();
            }, 0);

            const questsDataResp = await makeApiRequest("/api/v1/quests/list");
            allQuests = questsDataResp || [];
            questsForRoulette = allQuests.filter(q => q.quest_type && q.quest_type.startsWith('automatic') && !q.is_completed);
            const activeQuest = allQuests.find(q => q.id === userData.active_quest_id);
            const questChooseWrapper = document.getElementById('quest-choose-wrapper');
            if (questChooseWrapper) {
                questChooseWrapper.classList.toggle('hidden', !!activeQuest);
            }
            if (activeQuest) {
                renderActiveAutomaticQuest(activeQuest, userData);
            } else {
                dom.activeAutomaticQuestContainer.innerHTML = '';
            }
            if (challengeData) {
                renderChallenge(challengeData, !userData.twitch_id);
            } else {
                renderChallenge({ cooldown_until: userData.challenge_cooldown_until }, !userData.twitch_id);
            }

            if (!localStorage.getItem('tutorialCompleted')) {
                startTutorial();
            }
        } catch (e) {
            console.error("Критическая ошибка при основной загрузке:", e);
            dom.challengeContainer.innerHTML = `<p style="text-align:center; color: #ff453a;">Не удалось загрузить челлендж.</p>`;
        } finally {
            dom.mainContent.classList.add('visible');
            dom.loaderOverlay.classList.add('hidden');
        }
    }

    setupEventListeners();
    main();
    setInterval(refreshDataSilently, 30000);

} catch (e) {
    document.getElementById('loader-overlay')?.classList.add('hidden');
    document.body.innerHTML = `<div style="text-align:center; padding:20px;"><h1>Критическая ошибка</h1><p>${e.message}</p></div>`;
}
