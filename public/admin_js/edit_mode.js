// ==========================================
// ФАЙЛ: admin_js/edit_mode.js
// ==========================================

let isEditMode = false;
let currentEditSlotIndex = null;
const MAX_RECENT_SLOTS = 4; // Количество ячеек в ряду

// База всех доступных иконок для выборки
const AVAILABLE_WIDGETS = [
    { id: 'view-admin-shop', title: 'Магазин', icon: 'fa-cart-shopping', color: '#ffcc00' },
    { id: 'view-admin-p2p-trades', title: 'P2P', icon: 'fa-right-left', color: '#00bcd4' },
    { id: 'view-admin-promocodes', title: 'Промокоды', icon: 'fa-ticket', color: '#fff' },
    { id: 'view-admin-quests', title: 'Задания', icon: 'fa-list-check', color: '#fff' },
    { id: 'view-admin-challenges', title: 'Челленджи', icon: 'fa-trophy', color: '#fff' },
    { id: 'view-admin-cauldron', title: 'Котел', icon: 'fa-hat-wizard', color: '#ff9500' },
    { id: 'view-admin-advent', title: 'Адвент', icon: 'fa-calendar-days', color: '#ff4757' },
    { id: 'view-admin-weekly-goals', title: 'Недельные', icon: 'fa-calendar-week', color: '#FFC107' }
];

// Текущие установленные виджеты (загружаем из кэша или ставим по умолчанию)
let currentGridSlots = JSON.parse(localStorage.getItem('adminRecentGrid')) || [
    AVAILABLE_WIDGETS[0], 
    AVAILABLE_WIDGETS[1], 
    null, 
    null
];

document.addEventListener('DOMContentLoaded', () => {
    window.renderEditableGrid();
    setupPullToEdit();
});

// === ОТРИСОВКА СЕТКИ ===
window.renderEditableGrid = function() {
    const grid = document.getElementById('admin-recent-grid');
    const wrapper = document.getElementById('admin-recent-wrapper');
    if (!grid) return;

    // Показываем блок, если он был скрыт
    wrapper.style.display = 'block'; 
    grid.innerHTML = '';

    for (let i = 0; i < MAX_RECENT_SLOTS; i++) {
        const item = currentGridSlots[i];

        if (item) {
            // Отрисовка заполненной ячейки
            const html = `
                <div class="admin-icon-button" data-index="${i}">
                    <div class="icon-wrapper" style="color: ${item.color};">
                        <i class="fa-solid ${item.icon}"></i>
                    </div>
                    <span>${item.title}</span>
                </div>
            `;
            grid.insertAdjacentHTML('beforeend', html);
        } else {
            // Отрисовка пустого слота (виден только в режиме редактирования)
            if (isEditMode) {
                const html = `
                    <div class="empty-edit-slot" data-index="${i}" onclick="window.openIconPicker(${i})">
                        <div class="slot-circle">+</div>
                        <span>Добавить</span>
                    </div>
                `;
                grid.insertAdjacentHTML('beforeend', html);
            }
        }
    }

    // Навешиваем слушатели кликов на заполненные иконки
    grid.querySelectorAll('.admin-icon-button').forEach(btn => {
        btn.onclick = (e) => {
            const idx = btn.getAttribute('data-index');
            if (isEditMode) {
                e.preventDefault();
                e.stopPropagation();
                window.openEditActionModal(idx);
            } else {
                // В обычном режиме — переходим в раздел
                const viewId = currentGridSlots[idx].id;
                // Здесь логика переключения вкладок твоего приложения
                if (window.switchView) window.switchView(viewId);
            }
        };
    });
};

// === ЛОГИКА ТРИГГЕРА (СВАЙП / СКРОЛЛ ВНИЗ) ===
function setupPullToEdit() {
    const container = document.getElementById('app-container');
    let startY = 0;
    let isPulling = false;

    // Для телефонов (Свайп)
    container.addEventListener('touchstart', (e) => {
        if (container.scrollTop === 0) {
            startY = e.touches[0].clientY;
            isPulling = true;
        }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        const currentY = e.touches[0].clientY;
        const pullDistance = currentY - startY;

        // Если потянули сильно вниз (больше 100px)
        if (pullDistance > 100) {
            window.toggleEditMode(true);
            isPulling = false; 
            tg.HapticFeedback.impactOccurred('heavy'); // Вибрация TG
        }
    }, { passive: true });

    container.addEventListener('touchend', () => { isPulling = false; });

    // Для ПК (Колесико мыши)
    container.addEventListener('wheel', (e) => {
        if (container.scrollTop === 0 && e.deltaY < -50) {
            // Скролл вверх, находясь в самом верху (deltaY отрицательный)
            window.toggleEditMode(!isEditMode); 
        }
    }, { passive: true });
}

// === ВКЛЮЧЕНИЕ / ВЫКЛЮЧЕНИЕ РЕЖИМА ===
window.toggleEditMode = function(forceState) {
    const grid = document.getElementById('admin-recent-grid');
    isEditMode = forceState !== undefined ? forceState : !isEditMode;
    
    if (isEditMode) {
        grid.classList.add('edit-mode-active');
        tg.showPopup({ message: 'Режим редактирования включен. Нажмите на иконку для изменения.' });
    } else {
        grid.classList.remove('edit-mode-active');
    }
    
    window.renderEditableGrid(); // Перерисовываем (чтобы показать/скрыть пустые слоты)
};

// Выключаем режим редактирования при клике вне сетки
document.addEventListener('click', (e) => {
    const grid = document.getElementById('admin-recent-wrapper');
    if (isEditMode && grid && !grid.contains(e.target)) {
        window.toggleEditMode(false);
    }
});

// === МОДАЛКИ И ДЕЙСТВИЯ ===
window.openEditActionModal = function(index) {
    currentEditSlotIndex = parseInt(index);
    document.getElementById('edit-icon-action-modal').classList.remove('hidden');
};

document.getElementById('btn-delete-icon').onclick = () => {
    if (currentEditSlotIndex !== null) {
        currentGridSlots[currentEditSlotIndex] = null;
        saveAndRender();
        document.getElementById('edit-icon-action-modal').classList.add('hidden');
    }
};

document.getElementById('btn-replace-icon').onclick = () => {
    document.getElementById('edit-icon-action-modal').classList.add('hidden');
    window.openIconPicker(currentEditSlotIndex);
};

window.openIconPicker = function(index) {
    currentEditSlotIndex = parseInt(index);
    const pickerGrid = document.getElementById('icon-picker-grid');
    pickerGrid.innerHTML = '';

    AVAILABLE_WIDGETS.forEach(widget => {
        const html = `
            <div class="admin-icon-button" style="cursor: pointer;" onclick="window.selectIconForSlot('${widget.id}')">
                <div class="icon-wrapper" style="color: ${widget.color};">
                    <i class="fa-solid ${widget.icon}"></i>
                </div>
                <span>${widget.title}</span>
            </div>
        `;
        pickerGrid.insertAdjacentHTML('beforeend', html);
    });

    document.getElementById('icon-picker-modal').classList.remove('hidden');
};

window.selectIconForSlot = function(widgetId) {
    const selectedWidget = AVAILABLE_WIDGETS.find(w => w.id === widgetId);
    if (selectedWidget && currentEditSlotIndex !== null) {
        currentGridSlots[currentEditSlotIndex] = selectedWidget;
        saveAndRender();
        document.getElementById('icon-picker-modal').classList.add('hidden');
    }
};

// Сохраняем в кэш и перерисовываем
function saveAndRender() {
    localStorage.setItem('adminRecentGrid', JSON.stringify(currentGridSlots));
    window.renderEditableGrid();
}
