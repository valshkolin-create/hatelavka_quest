// ==========================================
// ФАЙЛ: admin_js/edit_mode.js
// ==========================================

let isEditMode = false;
let isSelectingForFolder = false;
let firstFolderItem = null;
let currentEditItem = null;
let currentOpenFolderContents = null;

// === ИНИЦИАЛИЗАЦИЯ: CACHE-FIRST ПОДХОД ===
document.addEventListener('DOMContentLoaded', () => {
    assignUniqueIDs(); 
    
    // 1. МГНОВЕННАЯ ЗАГРУЗКА ИЗ КЭША
    const cachedStr = localStorage.getItem('adminMainLayout');
    if (cachedStr) {
        try {
            applyLayoutToDOM(JSON.parse(cachedStr));
        } catch (e) {
            console.error("Ошибка чтения кэша:", e);
        }
    }

    // 2. ФОНОВАЯ СИНХРОНИЗАЦИЯ С БАЗОЙ
    syncLayoutWithDB(cachedStr);
    
    // Подключаем кнопку из шапки
    const editBtn = document.getElementById('edit-mode-toggle');
    if(editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleEditMode();
        });
    }

    // Инициализация Drag & Drop
    const mainGrid = document.querySelector('#tab-content-main .admin-icon-menu');
    initDragAndDrop(mainGrid);

    // === ДИНАМИЧЕСКИ ДОБАВЛЯЕМ КНОПКУ "ОТКРЫТЬ ПАПКУ" В МЕНЮ ===
    const actionModal = document.getElementById('edit-icon-action-modal');
    const unpackBtn = document.getElementById('btn-unpack-folder');
    if (actionModal && unpackBtn && !document.getElementById('btn-open-folder-edit')) {
        const btn = document.createElement('button');
        btn.id = 'btn-open-folder-edit';
        btn.className = 'admin-menu-button';
        btn.style.backgroundColor = 'var(--action-color)';
        btn.innerHTML = '<i class="fa-solid fa-folder-open"></i> Открыть';
        btn.onclick = () => {
            actionModal.classList.add('hidden');
            openFolderNormalMode({ currentTarget: currentEditItem, preventDefault: () => {} });
        };
        unpackBtn.parentNode.insertBefore(btn, unpackBtn);
    }
    
    // === ОБРАБОТЧИК КЛИКОВ ВНУТРИ ПАПКИ В РЕЖИМЕ РЕДАКТИРОВАНИЯ ===
    const folderGrid = document.getElementById('folder-view-grid');
    if (folderGrid) {
        folderGrid.addEventListener('click', (e) => {
            if (!isEditMode) return;
            const btn = e.target.closest('.admin-icon-button:not(.folder-add-btn)');
            if (btn) {
                e.preventDefault();
                e.stopPropagation();
                currentEditItem = btn;
                
                // Внутри папки можно только удалять, создание папок в папке запрещено
                document.getElementById('btn-make-folder').classList.add('hidden');
                document.getElementById('btn-unpack-folder').classList.add('hidden');
                const openBtn = document.getElementById('btn-open-folder-edit');
                if (openBtn) openBtn.classList.add('hidden');
                
                document.getElementById('edit-icon-action-modal').classList.remove('hidden');
            }
        });
    }
});

function toggleEditMode() {
    isEditMode = !isEditMode;
    const grid = document.querySelector('#tab-content-main .admin-icon-menu');
    const btn = document.getElementById('edit-mode-toggle');
    
    if (isEditMode) {
        btn.classList.add('active');
        grid.classList.add('edit-mode-active');
        
        grid.addEventListener('click', handleGridEditClick, true);
        
        const addBtn = document.createElement('div');
        addBtn.className = 'empty-edit-slot admin-add-btn';
        addBtn.innerHTML = `<div class="slot-circle">+</div><span>Добавить</span>`;
        grid.appendChild(addBtn);

    } else {
        btn.classList.remove('active');
        grid.classList.remove('edit-mode-active');
        
        grid.removeEventListener('click', handleGridEditClick, true);
        
        isSelectingForFolder = false;
        firstFolderItem = null;
        
        const addBtn = grid.querySelector('.admin-add-btn');
        if (addBtn) addBtn.remove();
    }
}

// === ЛОГИКА DRAG & DROP (ПЕРЕТАСКИВАНИЕ) ===
let dragElement = null;
let ghostElement = null;
let startX = 0, startY = 0;
let isDragging = false;
let justDragged = false; // Флаг, чтобы отличать клик от перетаскивания

function initDragAndDrop(grid) {
    grid.addEventListener('touchstart', handleDragStart, { passive: false });
    grid.addEventListener('touchmove', handleDragMove, { passive: false });
    grid.addEventListener('touchend', handleDragEnd);

    grid.addEventListener('mousedown', handleDragStart);
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
}

function handleDragStart(e) {
    if (!isEditMode) return;
    
    const target = e.target.closest('.admin-icon-button:not(.admin-add-btn)');
    if (!target) return;

    dragElement = target;
    startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    isDragging = false;
}

function handleDragMove(e) {
    if (!dragElement || !isEditMode) return;

    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

    const dx = clientX - startX;
    const dy = clientY - startY;

    // Если сдвинули курсор больше чем на 8px — начинаем тащить
    if (!isDragging && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        isDragging = true;
        justDragged = true; 
        
        // Создаем "призрака", который летит за пальцем
        ghostElement = dragElement.cloneNode(true);
        ghostElement.style.position = 'fixed';
        ghostElement.style.pointerEvents = 'none';
        ghostElement.style.zIndex = '9999';
        ghostElement.style.opacity = '0.9';
        ghostElement.style.transform = 'scale(1.1)';
        ghostElement.style.transition = 'none'; 
        ghostElement.style.animation = 'none'; // Отключаем тряску у призрака
        
        // Убираем марджины, чтобы он не дергался при отрыве
        ghostElement.style.margin = '0';
        document.body.appendChild(ghostElement);
        
        dragElement.style.opacity = '0.3'; // Оригинал делаем полупрозрачным
    }

    if (isDragging) {
        e.preventDefault(); // Запрещаем скролл страницы на мобилках
        
        ghostElement.style.left = (clientX - ghostElement.offsetWidth / 2) + 'px';
        ghostElement.style.top = (clientY - ghostElement.offsetHeight / 2) + 'px';

        // Ищем элемент под пальцем (прячем призрака на миллисекунду)
        ghostElement.style.display = 'none';
        const elemBelow = document.elementFromPoint(clientX, clientY);
        ghostElement.style.display = 'block';

        if (elemBelow) {
            const targetItem = elemBelow.closest('.admin-icon-button:not(.admin-add-btn)');
            if (targetItem && targetItem !== dragElement) {
                const grid = dragElement.parentNode;
                const rect = targetItem.getBoundingClientRect();
                const isAfter = clientX > rect.left + rect.width / 2;
                
                // Раздвигаем сетку (переносим оригинал на новое место)
                if (isAfter) {
                    grid.insertBefore(dragElement, targetItem.nextSibling);
                } else {
                    grid.insertBefore(dragElement, targetItem);
                }
            }
        }
    }
}

function handleDragEnd(e) {
    if (!dragElement) return;

    if (isDragging) {
        // Заканчиваем перетаскивание
        dragElement.style.opacity = '1';
        if (ghostElement) {
            ghostElement.remove();
            ghostElement = null;
        }
        saveLayout(); // Сохраняем новый порядок!
        
        // Блокируем клик на 50мс, чтобы не открылось меню
        setTimeout(() => { justDragged = false; }, 50);
    }
    
    dragElement = null;
    isDragging = false;
}

// === ЖЕСТКАЯ БЛОКИРОВКА КЛИКОВ ===
function handleGridEditClick(e) {
    if (!isEditMode) return;
    
    const btn = e.target.closest('.admin-icon-button, .admin-add-btn');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    // Если мы только что бросили иконку, меню открывать не надо!
    if (justDragged) return;

    if (btn.classList.contains('admin-add-btn')) {
        openAddFromAdminPicker(false);
        return;
    }

    processItemClick(btn);
}

function processItemClick(item) {
    if (isSelectingForFolder) {
        if (item === firstFolderItem) return;
        
        const itemIsFolder = item.classList.contains('admin-folder');
        const firstIsFolder = firstFolderItem.classList.contains('admin-folder');

        if (itemIsFolder && firstIsFolder) {
            if(window.tg) return tg.showAlert('Нельзя класть папку в папку!');
            return;
        }
        
        if (itemIsFolder) {
            addToExistingFolder(firstFolderItem, item);
        } else if (firstIsFolder) {
            addToExistingFolder(item, firstFolderItem);
        } else {
            createFolder(firstFolderItem, item);
        }
        
        isSelectingForFolder = false;
        firstFolderItem = null;
        return;
    }

    currentEditItem = item;
    const isFolder = item.classList.contains('admin-folder');
    
    document.getElementById('btn-make-folder').classList.toggle('hidden', isFolder);
    document.getElementById('btn-unpack-folder').classList.toggle('hidden', !isFolder);
    
    const openBtn = document.getElementById('btn-open-folder-edit');
    if (openBtn) openBtn.classList.toggle('hidden', !isFolder);
    
    document.getElementById('edit-icon-action-modal').classList.remove('hidden');
}

// === ДОБАВЛЕНИЕ НОВЫХ ИКОНОК ===
function openAddFromAdminPicker(isForFolder = false) {
    const pickerGrid = document.getElementById('icon-picker-grid');
    pickerGrid.innerHTML = '';
    
    const adminGrid = document.querySelector('#tab-content-admin .admin-icon-menu');
    const adminItems = adminGrid ? Array.from(adminGrid.querySelectorAll('.admin-icon-button')) : [];
    
    const mainGrid = document.querySelector('#tab-content-main .admin-icon-menu');
    const hiddenMainItems = Array.from(mainGrid.querySelectorAll('.admin-icon-button.user-hidden'));
    
    const allAvailable = [...adminItems, ...hiddenMainItems];
    
    if (allAvailable.length === 0) {
        pickerGrid.innerHTML = '<p style="grid-column: 1/-1; text-align:center;">Нет доступных иконок.</p>';
    } else {
        allAvailable.forEach(item => {
            const clone = item.cloneNode(true);
            clone.classList.remove('user-hidden', 'edit-mode-active');
            clone.style.animation = 'none';
            
            clone.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                let elementToAdd;
                // 🔥 ФИКС БАГА С ПЕРЕКИДЫВАНИЕМ: Клонируем элементы из админки, создавая ярлыки
                if (item.closest('#tab-content-admin')) {
                    elementToAdd = item.cloneNode(true);
                    elementToAdd.id = item.id + '_shortcut'; // Уникальный ID для ярлыка
                } else {
                    elementToAdd = item; // Скрытые иконки просто возвращаем
                }
                
                elementToAdd.classList.remove('user-hidden', 'edit-mode-active');
                elementToAdd.style.animation = ''; 
                
                // Проверяем, куда добавляем: в папку или на главную
                if (isForFolder === true && currentOpenFolderContents) {
                    const modalGrid = document.getElementById('folder-view-grid');
                    const folderAddBtn = modalGrid.querySelector('.folder-add-btn');
                    if (folderAddBtn) {
                        modalGrid.insertBefore(elementToAdd, folderAddBtn);
                    } else {
                        modalGrid.appendChild(elementToAdd);
                    }
                } else {
                    const addBtn = mainGrid.querySelector('.admin-add-btn');
                    mainGrid.insertBefore(elementToAdd, addBtn); 
                }
                
                saveLayout();
                document.getElementById('icon-picker-modal').classList.add('hidden');
            }, true);

            pickerGrid.appendChild(clone);
        });
    }
    document.getElementById('icon-picker-modal').classList.remove('hidden');
}

// === ДЕЙСТВИЯ ИЗ МЕНЮ ===
document.getElementById('btn-hide-icon').onclick = () => {
    if (currentEditItem) {
        // 🔥 Если это ярлык - удаляем насовсем. Если оригинал - скрываем.
        if (currentEditItem.id.endsWith('_shortcut')) {
            currentEditItem.remove(); 
        } else {
            currentEditItem.classList.add('user-hidden');
            // Если выкидываем из папки, возвращаем в корень, чтобы не сломать логику папки
            if (currentEditItem.closest('#folder-view-grid') || currentEditItem.closest('.folder-contents')) {
                document.querySelector('#tab-content-main .admin-icon-menu').appendChild(currentEditItem);
            }
        }
        saveLayout();
        document.getElementById('edit-icon-action-modal').classList.add('hidden');
    }
};

document.getElementById('btn-make-folder').onclick = () => {
    document.getElementById('edit-icon-action-modal').classList.add('hidden');
    isSelectingForFolder = true;
    firstFolderItem = currentEditItem;
    if(window.tg) tg.showPopup({message: 'Выберите вторую иконку или папку для объединения'});
};

document.getElementById('btn-unpack-folder').onclick = () => {
    document.getElementById('edit-icon-action-modal').classList.add('hidden');
    unpackFolder(currentEditItem);
};

// === МАГИЯ ПАПОК ===
function createFolder(el1, el2) {
    const folderName = prompt('Название новой папки:', 'Папка') || 'Папка';
    const folderId = 'folder_' + Date.now();
    
    const folderDiv = document.createElement('div');
    folderDiv.className = 'admin-icon-button admin-folder';
    folderDiv.id = folderId;
    
    folderDiv.innerHTML = `
        <div class="icon-wrapper folder-wrapper"></div>
        <span>${folderName}</span>
        <div class="folder-contents"></div>
    `;

    el1.parentNode.insertBefore(folderDiv, el1);
    const contents = folderDiv.querySelector('.folder-contents');
    
    contents.appendChild(el1);
    contents.appendChild(el2);

    updateFolderPreview(folderDiv); 
    folderDiv.addEventListener('click', openFolderNormalMode);
    
    saveLayout();
}

function addToExistingFolder(iconEl, folderEl) {
    const contents = folderEl.querySelector('.folder-contents');
    contents.appendChild(iconEl);
    updateFolderPreview(folderEl); 
    saveLayout();
    if(window.tg) tg.showPopup({message: 'Иконка добавлена в папку!'});
}

function updateFolderPreview(folderEl) {
    const contents = folderEl.querySelector('.folder-contents');
    const wrapper = folderEl.querySelector('.folder-wrapper');
    wrapper.innerHTML = ''; 

    const children = Array.from(contents.children).slice(0, 4);
    
    children.forEach(child => {
        const childIconWrapper = child.querySelector('.icon-wrapper');
        if (!childIconWrapper) return;
        
        const clone = childIconWrapper.cloneNode(true);
        clone.querySelectorAll('.notification-badge, .reward-shortcut-btn').forEach(el => el.remove());
        
        const color = childIconWrapper.style.color || '#fff';
        wrapper.insertAdjacentHTML('beforeend', `<div class="mini-icon" style="color: ${color}">${clone.innerHTML}</div>`);
    });
}

function openFolderNormalMode(e) {
    if (e && e.preventDefault) e.preventDefault();
    
    const folder = e.currentTarget;
    const contents = folder.querySelector('.folder-contents');
    const modalGrid = document.getElementById('folder-view-grid');
    
    document.getElementById('folder-view-title').innerText = folder.querySelector('span').innerText;
    
    while (contents.firstChild) {
        modalGrid.appendChild(contents.firstChild);
    }
    currentOpenFolderContents = contents;
    document.getElementById('folder-view-modal').classList.remove('hidden');

    // 🔥 ДОБАВЛЯЕМ ПЛЮСИК ДЛЯ ПАПКИ В РЕЖИМЕ РЕДАКТИРОВАНИЯ
    if (isEditMode) {
        modalGrid.classList.add('edit-mode-active');
        const addBtn = document.createElement('div');
        addBtn.className = 'empty-edit-slot folder-add-btn';
        addBtn.innerHTML = `<div class="slot-circle">+</div><span>Добавить</span>`;
        addBtn.onclick = (ev) => {
            ev.stopPropagation();
            openAddFromAdminPicker(true); // true означает добавление в папку
        };
        modalGrid.appendChild(addBtn);
    } else {
        modalGrid.classList.remove('edit-mode-active');
    }
}

document.querySelector('#folder-view-modal .modal-close-btn').onclick = () => {
    const modalGrid = document.getElementById('folder-view-grid');
    
    // Убираем кнопку-плюсик перед сохранением
    const addBtn = modalGrid.querySelector('.folder-add-btn');
    if (addBtn) addBtn.remove();
    
    if (currentOpenFolderContents) {
        while (modalGrid.firstChild) {
            currentOpenFolderContents.appendChild(modalGrid.firstChild);
        }
        const parentFolder = currentOpenFolderContents.closest('.admin-folder');
        if (parentFolder) updateFolderPreview(parentFolder);
        
        if (isEditMode) saveLayout();
    }
    document.getElementById('folder-view-modal').classList.add('hidden');
};

function unpackFolder(folderEl) {
    const contents = folderEl.querySelector('.folder-contents');
    while (contents.firstChild) {
        folderEl.parentNode.insertBefore(contents.firstChild, folderEl);
    }
    folderEl.remove();
    saveLayout();
}

// === ЖЕЛЕЗОБЕТОННОЕ СОХРАНЕНИЕ И СИНХРОНИЗАЦИЯ ===
function assignUniqueIDs() {
    const items = document.querySelectorAll('.admin-icon-button:not(.admin-folder)');
    items.forEach((item) => {
        if (!item.id) {
            const view = item.getAttribute('data-view') || '';
            const href = item.getAttribute('href') || '';
            const text = item.querySelector('span')?.innerText.trim() || '';
            let uniqueStr = view + '_' + href + '_' + text;
            uniqueStr = uniqueStr.replace(/[^a-zA-Z0-9а-яА-Я]/g, '_');
            item.id = `btn_safe_${uniqueStr}`;
        }
    });
}

async function saveLayout() {
    const mainGrid = document.querySelector('#tab-content-main .admin-icon-menu');
    const layout = { folders: {}, hidden: [], mainOrder: [] };

    Array.from(mainGrid.children).forEach(item => {
        if (!item.classList.contains('admin-icon-button')) return;
        if (item.classList.contains('admin-add-btn')) return;
        
        if (item.classList.contains('user-hidden')) {
            layout.hidden.push(item.id);
        } else if (item.classList.contains('admin-folder')) {
            const childrenIds = Array.from(item.querySelectorAll('.folder-contents .admin-icon-button')).map(child => child.id);
            layout.folders[item.id] = {
                name: item.querySelector('span').innerText,
                children: childrenIds 
            };
            layout.mainOrder.push(item.id);
        } else {
            layout.mainOrder.push(item.id);
        }
    });

    localStorage.setItem('adminMainLayout', JSON.stringify(layout));

    try {
        const initDataStr = (typeof tg !== 'undefined' && tg.initData) ? tg.initData : '';
        await makeApiRequest('/api/v1/admin/layout/save', { 
            initData: initDataStr, 
            layout: layout 
        });
    } catch (e) {
        console.error("Ошибка сохранения рабочего стола в БД:", e);
    }
}

// Вспомогательная функция для генерации ярлыков
function getOrCreateItem(id) {
    let item = document.getElementById(id);
    if (!item && id.endsWith('_shortcut')) {
        const orig = document.getElementById(id.replace('_shortcut', ''));
        if (orig) {
            item = orig.cloneNode(true);
            item.id = id;
        }
    }
    return item;
}

function applyLayoutToDOM(layout) {
    if (!layout) return;
    const mainGrid = document.querySelector('#tab-content-main .admin-icon-menu');

    if (layout.hidden) {
        layout.hidden.forEach(id => {
            const item = getOrCreateItem(id); 
            if (item) {
                mainGrid.appendChild(item);
                item.classList.add('user-hidden');
            }
        });
    }

    if (layout.mainOrder) {
        layout.mainOrder.forEach(id => {
            if (layout.folders && layout.folders[id]) {
                const data = layout.folders[id];
                
                let folderDiv = document.getElementById(id);
                if (!folderDiv) {
                    folderDiv = document.createElement('div');
                    folderDiv.className = 'admin-icon-button admin-folder';
                    folderDiv.id = id;
                    folderDiv.innerHTML = `
                        <div class="icon-wrapper folder-wrapper"></div>
                        <span>${data.name}</span>
                        <div class="folder-contents"></div>
                    `;
                    folderDiv.addEventListener('click', openFolderNormalMode);
                }
                
                const contents = folderDiv.querySelector('.folder-contents');
                
                data.children.forEach(childId => {
                    const child = getOrCreateItem(childId); 
                    if (child) {
                        child.classList.remove('user-hidden');
                        contents.appendChild(child);
                    }
                });
                
                if (contents.children.length > 0) {
                    updateFolderPreview(folderDiv);
                    mainGrid.appendChild(folderDiv);
                }
            } else {
                const item = getOrCreateItem(id);
                if (item) {
                    item.classList.remove('user-hidden');
                    mainGrid.appendChild(item);
                }
            }
        });
    }
}

async function syncLayoutWithDB(cachedStr) {
    try {
        const initDataStr = (typeof tg !== 'undefined' && tg.initData) ? tg.initData : '';
        const response = await makeApiRequest('/api/v1/admin/layout/get', {
            initData: initDataStr 
        }, 'POST', true);
        
        if (response && response.layout) {
            const dbLayoutStr = JSON.stringify(response.layout);
            
            if (dbLayoutStr !== cachedStr) {
                localStorage.setItem('adminMainLayout', dbLayoutStr);
                resetGridToDefault(); 
                applyLayoutToDOM(response.layout);
            }
        }
    } catch (e) {
        console.warn("Фоновая синхронизация с сервером не удалась", e);
    }
}

function resetGridToDefault() {
    const mainGrid = document.querySelector('#tab-content-main .admin-icon-menu');
    
    mainGrid.querySelectorAll('.admin-icon-button:not(.admin-folder)').forEach(item => {
        item.classList.remove('user-hidden');
        mainGrid.appendChild(item);
    });

    mainGrid.querySelectorAll('.admin-folder').forEach(folder => folder.remove());
}
