// ==========================================
// ФАЙЛ: admin_js/checkpoint_admins.js
// ==========================================

let checkpointData = {};
let availableCpQuests = []; // Список всех доступных заданий для привязки

// 1. Управление видимостью плавающей кнопки сохранения
window.showFloatingCpSaveBtn = function() {
    const floatBtn = document.getElementById('floating-save-cp-btn');
    if (floatBtn) {
        floatBtn.style.transform = 'translateX(-50%) translateY(0)';
        floatBtn.style.opacity = '1';
        floatBtn.style.pointerEvents = 'auto';
    }
};

window.hideFloatingCpSaveBtn = function() {
    const floatBtn = document.getElementById('floating-save-cp-btn');
    if (floatBtn) {
        floatBtn.style.transform = 'translateX(-50%) translateY(100px)';
        floatBtn.style.opacity = '0';
        floatBtn.style.pointerEvents = 'none';
    }
};

// 2. Генератор HTML для селекта типов наград
function getRewardTypeSelectHtml(selectedValue, namePrefix) {
    const types = [
        { val: 'none', text: 'Пусто (Нет награды)' },
        { val: 'coins', text: 'Монеты' },
        { val: 'tickets', text: 'Билеты (Строго 50%)' },
        { val: 'cs2_skin', text: 'CS2 Скин (Маркет)' },
        { val: 'case_coupon', text: 'Купон на кейс' },
        { val: 'grind_vip', text: 'Grind VIP' }
    ];
    let html = `<select class="styled-input reward-type-select" name="${namePrefix}_type" style="width: 100%; margin-bottom: 5px;">`;
    types.forEach(t => {
        html += `<option value="${t.val}" ${t.val === selectedValue ? 'selected' : ''}>${t.text}</option>`;
    });
    html += `</select>`;
    return html;
}

// 3. Создание карточки одного уровня (Тира)
window.createCpTierRow = function(tier = null, index = 0) {
    const data = tier || {
        level: index + 1,
        required_stars: 0,
        free_reward: { type: 'none', value: '' },
        premium_reward: { type: 'none', value: '' }
    };

    const wrapper = document.createElement('div');
    wrapper.className = 'cp-tier-row admin-form'; 
    wrapper.style.cssText = 'padding: 15px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(0,0,0,0.2); position: relative;';

    wrapper.innerHTML = `
        <button type="button" class="admin-action-btn reject remove-tier-btn" style="position: absolute; top: 10px; right: 10px; width: 30px; height: 30px; padding: 0;">
            <i class="fa-solid fa-xmark"></i>
        </button>
        
        <div style="display: flex; gap: 15px; align-items: flex-end; margin-bottom: 15px;">
            <div style="flex: 1;">
                <label style="color: #ff4757;">Уровень (Tier)</label>
                <input type="number" class="tier-level" value="${data.level}" required style="font-weight: bold; font-size: 16px;">
            </div>
            <div style="flex: 2;">
                <label style="color: #ffd700;">Требуется Звезд (EXP)</label>
                <input type="number" class="tier-stars" value="${data.required_stars}" required>
            </div>
        </div>

        <div style="display: flex; gap: 15px;">
            <!-- FREE КОЛОНКА -->
            <div style="flex: 1; padding: 10px; border: 1px dashed rgba(255,255,255,0.2); border-radius: 6px;">
                <h4 style="margin: 0 0 10px; text-align: center; color: #a4b0be;">FREE Награда</h4>
                ${getRewardTypeSelectHtml(data.free_reward.type, 'free')}
                <input type="text" class="styled-input reward-value-input free-val" placeholder="Значение (кол-во или Hash Name)" value="${escapeHTML(String(data.free_reward.value))}" style="width: 100%;">
            </div>

            <!-- PREMIUM КОЛОНКА -->
            <div style="flex: 1; padding: 10px; border: 1px solid rgba(255, 71, 87, 0.4); background: rgba(255, 71, 87, 0.05); border-radius: 6px;">
                <h4 style="margin: 0 0 10px; text-align: center; color: #ff4757;">PREMIUM Награда</h4>
                ${getRewardTypeSelectHtml(data.premium_reward.type, 'premium')}
                <input type="text" class="styled-input reward-value-input premium-val" placeholder="Значение (кол-во или Hash Name)" value="${escapeHTML(String(data.premium_reward.value))}" style="width: 100%;">
            </div>
        </div>
    `;

    // Логика удаления
    wrapper.querySelector('.remove-tier-btn').addEventListener('click', () => {
        wrapper.remove();
        window.showFloatingCpSaveBtn();
    });

    // Логика скрытия инпута value, если тип 'none'
    wrapper.querySelectorAll('.reward-type-select').forEach(select => {
        const toggleValueInput = (sel) => {
            const input = sel.nextElementSibling;
            if (input && input.classList.contains('reward-value-input')) {
                input.style.display = sel.value === 'none' ? 'none' : 'block';
            }
        };
        select.addEventListener('change', (e) => {
            toggleValueInput(e.target);
            window.showFloatingCpSaveBtn();
        });
        toggleValueInput(select); // Init
    });

    return wrapper;
};

// 4. Создание строки привязки квеста к Чекпоинту
window.createCpQuestRow = function(mapping = null) {
    const data = mapping || { quest_id: '', exp_reward: 10 };
    
    const wrapper = document.createElement('div');
    wrapper.className = 'cp-quest-row admin-form';
    wrapper.style.cssText = 'display: flex; gap: 10px; align-items: center; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);';

    // Строим options для селекта из кэша availableCpQuests
    let optionsHtml = '<option value="">-- Выберите задание --</option>';
    availableCpQuests.forEach(q => {
        const selected = (String(q.id) === String(data.quest_id)) ? 'selected' : '';
        optionsHtml += `<option value="${q.id}" ${selected}>[ID:${q.id}] ${escapeHTML(q.title)}</option>`;
    });

    wrapper.innerHTML = `
        <select class="cp-quest-id-select styled-input" style="flex: 2; margin: 0;" required>
            ${optionsHtml}
        </select>
        <div style="flex: 1; display: flex; align-items: center; gap: 5px;">
            <i class="fa-solid fa-star" style="color: #ffd700;"></i>
            <input type="number" class="cp-quest-exp styled-input" placeholder="EXP" value="${data.exp_reward}" required style="margin: 0;">
        </div>
        <button type="button" class="admin-action-btn reject remove-cp-quest-btn" style="width: 40px; height: 40px; padding: 0; flex-shrink: 0;">
            <i class="fa-solid fa-trash"></i>
        </button>
    `;

    wrapper.querySelector('.remove-cp-quest-btn').addEventListener('click', () => {
        wrapper.remove();
        window.showFloatingCpSaveBtn();
    });

    wrapper.addEventListener('change', window.showFloatingCpSaveBtn);
    wrapper.addEventListener('input', window.showFloatingCpSaveBtn);

    return wrapper;
};

// 5. Сборка JSON для отправки на бэкенд
window.collectCheckpointData = function() {
    const isVisible = document.getElementById('toggle-cp-visible')?.checked || false;
    const title = document.querySelector('[name="cp_title"]').value;
    const startDate = document.querySelector('[name="cp_start_date"]').value;
    const endDate = document.querySelector('[name="cp_end_date"]').value;
    const premiumPrice = parseInt(document.querySelector('[name="cp_premium_price"]').value) || 0;
    const bannerUrl = document.querySelector('[name="cp_banner_url"]').value;

    // Собираем тиры
    const tiers = [];
    document.querySelectorAll('.cp-tier-row').forEach(row => {
        tiers.push({
            level: parseInt(row.querySelector('.tier-level').value) || 0,
            required_stars: parseInt(row.querySelector('.tier-stars').value) || 0,
            free_reward: {
                type: row.querySelector('select[name="free_type"]').value,
                value: row.querySelector('.free-val').value
            },
            premium_reward: {
                type: row.querySelector('select[name="premium_type"]').value,
                value: row.querySelector('.premium-val').value
            }
        });
    });

    // Сортируем тиры по уровню
    tiers.sort((a, b) => a.level - b.level);

    // Собираем квесты
    const questsConfig = [];
    document.querySelectorAll('.cp-quest-row').forEach(row => {
        const qId = parseInt(row.querySelector('.cp-quest-id-select').value);
        const exp = parseInt(row.querySelector('.cp-quest-exp').value);
        if (!isNaN(qId) && !isNaN(exp) && exp > 0) {
            questsConfig.push({ quest_id: qId, exp_reward: exp });
        }
    });

    return {
        is_active: isVisible,
        title: title,
        start_date: startDate ? new Date(startDate).toISOString() : null,
        end_date: endDate ? new Date(endDate).toISOString() : null,
        premium_price: premiumPrice,
        banner_url: bannerUrl,
        tiers: tiers,
        quests_config: questsConfig
    };
};

// 6. Инициализация (загрузка данных с сервера)
window.loadCheckpointSettings = async function() {
    showLoader();
    try {
        // 1. Загружаем все доступные квесты для селектора
        const questsList = await makeApiRequest('/api/v1/quests/list', {}, 'POST', true);
        if (Array.isArray(questsList)) {
            availableCpQuests = questsList;
        }

        // 2. Загружаем настройки Чекпоинта
        checkpointData = await makeApiRequest('/api/v1/admin/checkpoint/status', {}, 'GET', true).catch(() => ({}));
        
        // Заполняем основные поля
        const toggleVisible = document.getElementById('toggle-cp-visible');
        if (toggleVisible) toggleVisible.checked = checkpointData.is_active || false;
        
        document.querySelector('[name="cp_title"]').value = checkpointData.title || '';
        document.querySelector('[name="cp_start_date"]').value = formatDateToInput(checkpointData.start_date);
        document.querySelector('[name="cp_end_date"]').value = formatDateToInput(checkpointData.end_date);
        document.querySelector('[name="cp_premium_price"]').value = checkpointData.premium_price || 0;
        document.querySelector('[name="cp_banner_url"]').value = checkpointData.banner_url || '';

        // Рендерим тиры
        const tiersContainer = document.getElementById('cp-tiers-container');
        tiersContainer.innerHTML = '';
        const tiers = checkpointData.tiers || [];
        if (tiers.length === 0) {
            tiersContainer.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Нет созданных уровней.</p>';
        } else {
            tiers.forEach((t, i) => tiersContainer.appendChild(createCpTierRow(t, i)));
        }

        // Рендерим квесты
        const questsContainer = document.getElementById('cp-quests-container');
        questsContainer.innerHTML = '';
        const questsConfig = checkpointData.quests_config || [];
        if (questsConfig.length === 0) {
            questsContainer.innerHTML = '<p style="text-align: center; color: var(--text-color-muted);">Задания пока не привязаны.</p>';
        } else {
            questsConfig.forEach(q => questsContainer.appendChild(createCpQuestRow(q)));
        }

    } catch (e) {
        tg.showAlert(`Ошибка загрузки Чекпоинта: ${e.message}`);
    } finally {
        hideLoader();
    }
};

// 7. Подключение слушателей событий
window.setupCheckpointEventListeners = function() {
    
    // Вкладки Чекпоинта
    const cpTabs = document.getElementById('checkpoint-tabs');
    if (cpTabs) {
        cpTabs.addEventListener('click', (e) => {
            const button = e.target.closest('.tab-button');
            if (!button) return;
            
            cpTabs.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            const tabId = button.dataset.tab;
            document.querySelectorAll('[id^="tab-content-cp-"]').forEach(content => {
                content.classList.toggle('hidden', content.id !== `tab-content-${tabId}`);
            });
        });
    }

    // Добавление Уровня
    const addTierBtn = document.getElementById('add-cp-tier-btn');
    if (addTierBtn) {
        addTierBtn.addEventListener('click', () => {
            const container = document.getElementById('cp-tiers-container');
            if (container.querySelector('p')) container.innerHTML = ''; // Убираем плейсхолдер
            const currentIndex = container.querySelectorAll('.cp-tier-row').length;
            container.appendChild(createCpTierRow(null, currentIndex));
            window.showFloatingCpSaveBtn();
            setTimeout(() => container.lastElementChild?.scrollIntoView({ behavior: 'smooth' }), 100);
        });
    }

    // Привязка задания
    const addQuestBtn = document.getElementById('add-cp-quest-btn');
    if (addQuestBtn) {
        addQuestBtn.addEventListener('click', () => {
            const container = document.getElementById('cp-quests-container');
            if (container.querySelector('p')) container.innerHTML = '';
            container.appendChild(createCpQuestRow());
            window.showFloatingCpSaveBtn();
            setTimeout(() => container.lastElementChild?.scrollIntoView({ behavior: 'smooth' }), 100);
        });
    }

    // Форма сохранения
    const cpForm = document.getElementById('checkpoint-settings-form');
    if (cpForm) {
        // Следим за изменениями для показа плавающей кнопки
        cpForm.addEventListener('input', window.showFloatingCpSaveBtn);
        cpForm.addEventListener('change', window.showFloatingCpSaveBtn);
        document.getElementById('toggle-cp-visible')?.addEventListener('change', window.showFloatingCpSaveBtn);

        // Сабмит формы
        cpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            tg.showConfirm('Сохранить настройки и структуру Battle Pass?', async (ok) => {
                if (ok) {
                    try {
                        const payload = window.collectCheckpointData();
                        await makeApiRequest('/api/v1/admin/checkpoint/update', { config: payload });
                        tg.showAlert('Настройки Чекпоинта успешно сохранены!');
                        window.hideFloatingCpSaveBtn();
                    } catch (error) {
                        tg.showAlert(`Ошибка сохранения: ${error.message}`);
                    }
                }
            });
        });
    }

    // Сброс сезона
    const resetSeasonBtn = document.getElementById('reset-cp-season-btn');
    if (resetSeasonBtn) {
        resetSeasonBtn.addEventListener('click', () => {
            tg.showConfirm('ВНИМАНИЕ! Это обнулит звезды и сбросит массив полученных наград у ВСЕХ пользователей. Вы уверены?', async (ok) => {
                if (ok) {
                    try {
                        await makeApiRequest('/api/v1/admin/checkpoint/reset_season');
                        tg.showAlert('Сезон успешно сброшен!');
                    } catch (error) {
                        tg.showAlert(`Ошибка сброса: ${error.message}`);
                    }
                }
            });
        });
    }
};

// Интеграция в общую систему роутинга (добавить вызов loadCheckpointSettings в switchView внутри admin.js)
