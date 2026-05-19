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
    
    // 1. МГНОВЕННАЯ ЗАГРУЗКА ИЗ КЭША (чтобы избежать "прыжков" интерфейса)
    const cachedStr = localStorage.getItem('adminMainLayout');
    if (cachedStr) {
        try {
            applyLayoutToDOM(JSON.parse(cachedStr));
        } catch (e) {
            console.error("Ошибка чтения кэша:", e);
        }
    }

    // 2. ФОНОВАЯ СИНХРОНИЗАЦИЯ С БАЗОЙ (не блокирует отрисовку)
    syncLayoutWithDB(cachedStr);
    
    // Подключаем кнопку из шапки
    const editBtn = document.getElementById('edit-mode-toggle');
    if(editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleEditMode();
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

// === ЖЕСТКАЯ БЛОКИРОВКА КЛИКОВ (ССЫЛОК) ===
function handleGridEditClick(e) {
    if (!isEditMode) return;
    
    const btn = e.target.closest('.admin-icon-button, .admin-add-btn');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    if (btn.classList.contains('admin-add-btn')) {
        openAddFromAdminPicker();
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
    
    document.getElementById('edit-icon-action-modal').classList.remove('hidden');
}

// === ДОБАВЛЕНИЕ НОВЫХ ИКОНОК ===
function openAddFromAdminPicker() {
    const pickerGrid = document.getElementById('icon-picker-grid');
    pickerGrid.innerHTML = '';
    
    const adminGrid = document.querySelector('#tab-content-admin .admin-icon-menu');
    const adminItems = Array.from(adminGrid.querySelectorAll('.admin-icon-button'));
    
    const mainGrid = document.querySelector('#tab-content-main .admin-icon-menu');
    const hiddenMainItems = Array.from(mainGrid.querySelectorAll('.admin-icon-button.user-hidden'));
    
    const allAvailable = [...adminItems, ...hiddenMainItems];
    
    if (allAvailable.length === 0) {
        pickerGrid.innerHTML = '<p style="grid-column: 1/-1; text-align:center;">Все иконки уже на главной.</p>';
    } else {
        allAvailable.forEach(item => {
            const clone = item.cloneNode(true);
            clone.classList.remove('user-hidden', 'edit-mode-active');
            clone.style.animation = 'none';
            
            clone.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                item.classList.remove('user-hidden');
                const addBtn = mainGrid.querySelector('.admin-add-btn');
                mainGrid.insertBefore(item, addBtn); 
                
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
        currentEditItem.classList.add('user-hidden');
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
    if (isEditMode) return;
    e.preventDefault();
    
    const folder = e.currentTarget;
    const contents = folder.querySelector('.folder-contents');
    const modalGrid = document.getElementById('folder-view-grid');
    
    document.getElementById('folder-view-title').innerText = folder.querySelector('span').innerText;
    
    while (contents.firstChild) {
        modalGrid.appendChild(contents.firstChild);
    }
    currentOpenFolderContents = contents;
    document.getElementById('folder-view-modal').classList.remove('hidden');
}

document.querySelector('#folder-view-modal .modal-close-btn').onclick = () => {
    const modalGrid = document.getElementById('folder-view-grid');
    if (currentOpenFolderContents) {
        while (modalGrid.firstChild) {
            currentOpenFolderContents.appendChild(modalGrid.firstChild);
        }
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

// Функция применяет JSON-макет к экрану
function applyLayoutToDOM(layout) {
    if (!layout) return;
    const mainGrid = document.querySelector('#tab-content-main .admin-icon-menu');

    if (layout.hidden) {
        layout.hidden.forEach(id => {
            const item = document.getElementById(id);
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
                
                // Проверяем, существует ли папка, чтобы не дублировать
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
                    const child = document.getElementById(childId);
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
                const item = document.getElementById(id);
                if (item) {
                    item.classList.remove('user-hidden');
                    mainGrid.appendChild(item);
                }
            }
        });
    }
}

// Фоновая сверка с базой данных
async function syncLayoutWithDB(cachedStr) {
    try {
        const initDataStr = (typeof tg !== 'undefined' && tg.initData) ? tg.initData : '';
        const response = await makeApiRequest('/api/v1/admin/layout/get', {
            initData: initDataStr 
        }, 'POST', true);
        
        if (response && response.layout) {
            const dbLayoutStr = JSON.stringify(response.layout);
            
            // Если БД отличается от кэша устройства (админ редактировал с другого телефона/ПК)
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

// Разбираем сетку до "заводского" состояния перед применением нового макета из БД
function resetGridToDefault() {
    const mainGrid = document.querySelector('#tab-content-main .admin-icon-menu');
    
    // Достаем все кнопки из папок
    mainGrid.querySelectorAll('.admin-icon-button:not(.admin-folder)').forEach(item => {
        item.classList.remove('user-hidden');
        mainGrid.appendChild(item);
    });

    // Уничтожаем пустые папки
    mainGrid.querySelectorAll('.admin-folder').forEach(folder => folder.remove());
}
