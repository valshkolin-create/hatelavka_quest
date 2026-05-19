// ==========================================
// ФАЙЛ: admin_js/edit_mode.js
// ==========================================

let isEditMode = false;
let isSelectingForFolder = false;
let firstFolderItem = null;
let currentEditItem = null;
let currentOpenFolderContents = null;

document.addEventListener('DOMContentLoaded', () => {
    assignUniqueIDs(); // Генерируем НАДЕЖНЫЕ ID
    restoreLayout();   // Восстанавливаем порядок
    
    // Подключаем кнопку из шапки
    const editBtn = document.getElementById('edit-mode-toggle');
    if(editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleEditMode();
        });
    }
});

// 1. Вкл / Выкл режим редактирования
function toggleEditMode() {
    isEditMode = !isEditMode;
    const grid = document.querySelector('#tab-content-main .admin-icon-menu');
    const btn = document.getElementById('edit-mode-toggle');
    
    if (isEditMode) {
        btn.classList.add('active');
        grid.classList.add('edit-mode-active');
        enableEditInterception(grid);
        
        // Добавляем кнопку "+" в конец сетки
        const addBtn = document.createElement('div');
        addBtn.className = 'empty-edit-slot admin-add-btn';
        addBtn.innerHTML = `<div class="slot-circle">+</div><span>Добавить</span>`;
        addBtn.onclick = openAddFromAdminPicker;
        grid.appendChild(addBtn);

    } else {
        btn.classList.remove('active');
        grid.classList.remove('edit-mode-active');
        disableEditInterception(grid);
        isSelectingForFolder = false;
        firstFolderItem = null;
        
        // Убираем кнопку "+"
        const addBtn = grid.querySelector('.admin-add-btn');
        if (addBtn) addBtn.remove();
    }
}

// === БЛОКИРОВКА ПЕРЕХОДОВ ВО ВРЕМЯ РЕДАКТИРОВАНИЯ ===
function enableEditInterception(grid) {
    grid.querySelectorAll('.admin-icon-button:not(.admin-add-btn)').forEach(item => {
        item.addEventListener('click', handleIconEditClick, true);
    });
}
function disableEditInterception(grid) {
    grid.querySelectorAll('.admin-icon-button').forEach(item => {
        item.removeEventListener('click', handleIconEditClick, true);
    });
}

function handleIconEditClick(e) {
    if (!isEditMode) return;
    
    e.preventDefault();
    e.stopPropagation();

    const item = e.currentTarget;

    if (isSelectingForFolder) {
        if (item === firstFolderItem) return;
        if (item.classList.contains('admin-folder') || firstFolderItem.classList.contains('admin-folder')) {
            if(window.tg) return tg.showAlert('Нельзя класть папку в папку!');
        }
        createFolder(firstFolderItem, item);
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

// === ФУНКЦИЯ ДОБАВЛЕНИЯ НОВЫХ ИКОНОК С ДРУГИХ ВКЛАДОК ===
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
            
            clone.onclick = (e) => {
                e.preventDefault();
                
                item.classList.remove('user-hidden');
                const addBtn = mainGrid.querySelector('.admin-add-btn');
                mainGrid.insertBefore(item, addBtn); // Вставляем перед плюсом
                
                item.addEventListener('click', handleIconEditClick, true);
                saveLayout();
                
                document.getElementById('icon-picker-modal').classList.add('hidden');
            };
            pickerGrid.appendChild(clone);
        });
    }
    
    document.getElementById('icon-picker-modal').classList.remove('hidden');
}

// === ДЕЙСТВИЯ С ИКОНКАМИ ===
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
    if(window.tg) tg.showPopup({message: 'Выберите вторую иконку для объединения'});
};

document.getElementById('btn-unpack-folder').onclick = () => {
    document.getElementById('edit-icon-action-modal').classList.add('hidden');
    unpackFolder(currentEditItem);
};

function createFolder(el1, el2) {
    const folderName = prompt('Название новой папки:', 'Папка') || 'Папка';
    const folderId = 'folder_' + Date.now();
    
    const folderDiv = document.createElement('div');
    folderDiv.className = 'admin-icon-button admin-folder';
    folderDiv.id = folderId;
    
    const icon1 = el1.querySelector('.icon-wrapper').innerHTML;
    const icon2 = el2.querySelector('.icon-wrapper').innerHTML;
    const color1 = el1.querySelector('.icon-wrapper').style.color || '#fff';
    const color2 = el2.querySelector('.icon-wrapper').style.color || '#fff';

    folderDiv.innerHTML = `
        <div class="icon-wrapper folder-wrapper">
            <div class="mini-icon" style="color: ${color1}">${icon1}</div>
            <div class="mini-icon" style="color: ${color2}">${icon2}</div>
        </div>
        <span>${folderName}</span>
        <div class="folder-contents"></div>
    `;

    el1.parentNode.insertBefore(folderDiv, el1);
    const contents = folderDiv.querySelector('.folder-contents');
    contents.appendChild(el1);
    contents.appendChild(el2);

    folderDiv.addEventListener('click', handleIconEditClick, true);
    folderDiv.addEventListener('click', openFolderNormalMode);
    saveLayout();
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

// === ЖЕЛЕЗОБЕТОННОЕ СОХРАНЕНИЕ (ИСПРАВЛЕНИЕ БАГА) ===
function assignUniqueIDs() {
    // Выдаем ID всем кнопкам на основе их текста или атрибутов (они никогда не меняются при перемещении)
    const items = document.querySelectorAll('.admin-icon-button:not(.admin-folder)');
    items.forEach((item) => {
        if (!item.id) {
            const view = item.getAttribute('data-view') || '';
            const href = item.getAttribute('href') || '';
            const text = item.querySelector('span')?.innerText.trim() || '';
            
            // Создаем уникальный ID (например: btn_view_admin_quests)
            let uniqueStr = view + '_' + href + '_' + text;
            uniqueStr = uniqueStr.replace(/[^a-zA-Z0-9а-яА-Я]/g, '_'); // убираем спецсимволы
            item.id = `btn_safe_${uniqueStr}`;
        }
    });
}

function saveLayout() {
    const mainGrid = document.querySelector('#tab-content-main .admin-icon-menu');
    const layout = { folders: {}, hidden: [], mainOrder: [] };

    mainGrid.querySelectorAll('.admin-icon-button').forEach(item => {
        if (item.classList.contains('admin-add-btn')) return;
        
        if (item.classList.contains('user-hidden')) {
            layout.hidden.push(item.id);
        } else if (item.classList.contains('admin-folder')) {
            const childrenIds = Array.from(item.querySelectorAll('.folder-contents .admin-icon-button')).map(child => child.id);
            layout.folders[item.id] = {
                name: item.querySelector('span').innerText,
                preview: item.querySelector('.folder-wrapper').innerHTML,
                children: childrenIds
            };
            layout.mainOrder.push(item.id);
        } else {
            layout.mainOrder.push(item.id);
        }
    });

    localStorage.setItem('adminMainLayout', JSON.stringify(layout));
}

function restoreLayout() {
    const layout = JSON.parse(localStorage.getItem('adminMainLayout'));
    if (!layout) return;

    const mainGrid = document.querySelector('#tab-content-main .admin-icon-menu');

    // Скрываем те, что были удалены с экрана
    layout.hidden.forEach(id => {
        const item = document.getElementById(id);
        if (item) {
            mainGrid.appendChild(item); // перемещаем на главную
            item.classList.add('user-hidden');
        }
    });

    // Восстанавливаем порядок и папки
    layout.mainOrder.forEach(id => {
        if (layout.folders[id]) {
            const data = layout.folders[id];
            const folderDiv = document.createElement('div');
            folderDiv.className = 'admin-icon-button admin-folder';
            folderDiv.id = id;
            folderDiv.innerHTML = `
                <div class="icon-wrapper folder-wrapper">${data.preview}</div>
                <span>${data.name}</span>
                <div class="folder-contents"></div>
            `;
            const contents = folderDiv.querySelector('.folder-contents');
            
            // Запихиваем кнопки обратно в папку
            data.children.forEach(childId => {
                const child = document.getElementById(childId);
                if (child) {
                    child.classList.remove('user-hidden');
                    contents.appendChild(child);
                }
            });
            
            // Возвращаем папку на экран
            if (contents.children.length > 0) {
                mainGrid.appendChild(folderDiv);
                folderDiv.addEventListener('click', openFolderNormalMode);
            }
        } else {
            const item = document.getElementById(id);
            if (item) {
                item.classList.remove('user-hidden');
                mainGrid.appendChild(item); // Возвращаем обычную кнопку на экран
            }
        }
    });
}
