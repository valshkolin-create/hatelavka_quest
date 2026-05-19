// ==========================================
// ФАЙЛ: admin_js/edit_mode.js
// ==========================================

let isEditMode = false;
let isSelectingForFolder = false;
let firstFolderItem = null;
let currentEditItem = null;
let currentOpenFolderContents = null;

document.addEventListener('DOMContentLoaded', () => {
    assignUniqueIDs(); // Каждой кнопке нужен ID для сохранения
    restoreLayout();   // Восстанавливаем папки и скрытые кнопки
    setupTopToBottomSwipe();
});

// 1. Отслеживаем свайп СВЕРХУ-ВНИЗ
function setupTopToBottomSwipe() {
    const container = document.getElementById('app-container');
    const mainView = document.getElementById('view-admin-main');
    let startY = 0;
    let isPulling = false;

    container.addEventListener('touchstart', (e) => {
        // Срабатывает ТОЛЬКО на главной странице и если мы в самом верху скролла
        if (container.scrollTop <= 0 && !mainView.classList.contains('hidden')) {
            startY = e.touches[0].clientY;
            isPulling = true;
        }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        const currentY = e.touches[0].clientY;
        const pullDistance = currentY - startY;

        // Если потянули ВНИЗ больше чем на 120px
        if (pullDistance > 120) {
            isPulling = false;
            toggleEditMode(); // Вкл / Выкл
            if(window.tg && window.tg.HapticFeedback) tg.HapticFeedback.impactOccurred('heavy');
        }
    }, { passive: true });

    container.addEventListener('touchend', () => { isPulling = false; });
}

// 2. Вкл / Выкл режим редактирования
function toggleEditMode() {
    isEditMode = !isEditMode;
    const grid = document.querySelector('#tab-content-main .admin-icon-menu');
    
    if (isEditMode) {
        grid.classList.add('edit-mode-active');
        enableEditInterception(grid);
        tg.showPopup({message: 'Режим настройки меню\nПовторите свайп вниз для выхода.'});
    } else {
        grid.classList.remove('edit-mode-active');
        disableEditInterception(grid);
        isSelectingForFolder = false;
        firstFolderItem = null;
    }
}

// Перехватываем клики, чтобы ссылки не открывались во время тряски
function enableEditInterception(grid) {
    grid.querySelectorAll('.admin-icon-button').forEach(item => {
        item.addEventListener('click', handleIconEditClick, true);
    });
}
function disableEditInterception(grid) {
    grid.querySelectorAll('.admin-icon-button').forEach(item => {
        item.removeEventListener('click', handleIconEditClick, true);
    });
}

// 3. Обработка клика по иконке
function handleIconEditClick(e) {
    if (!isEditMode) return;
    
    e.preventDefault();
    e.stopPropagation(); // Блокируем стандартный переход

    const item = e.currentTarget;

    // Если мы в процессе выбора второй иконки для папки
    if (isSelectingForFolder) {
        if (item === firstFolderItem) return;
        if (item.classList.contains('admin-folder') || firstFolderItem.classList.contains('admin-folder')) {
            return tg.showAlert('Нельзя класть папку в папку!');
        }
        createFolder(firstFolderItem, item);
        isSelectingForFolder = false;
        firstFolderItem = null;
        return;
    }

    // Обычный клик открывает меню действий
    currentEditItem = item;
    const isFolder = item.classList.contains('admin-folder');
    
    document.getElementById('btn-make-folder').classList.toggle('hidden', isFolder);
    document.getElementById('btn-unpack-folder').classList.toggle('hidden', !isFolder);
    
    document.getElementById('edit-icon-action-modal').classList.remove('hidden');
}

// === КНОПКИ МОДАЛКИ ДЕЙСТВИЙ ===

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
    tg.showPopup({message: 'Выберите вторую иконку, чтобы объединить их'});
};

document.getElementById('btn-unpack-folder').onclick = () => {
    document.getElementById('edit-icon-action-modal').classList.add('hidden');
    unpackFolder(currentEditItem);
};

// 4. Логика создания папки (DOM Магия)
function createFolder(el1, el2) {
    const folderName = prompt('Название новой папки:', 'Папка') || 'Папка';
    const folderId = 'folder_' + Date.now();
    
    const folderDiv = document.createElement('div');
    folderDiv.className = 'admin-icon-button admin-folder';
    folderDiv.id = folderId;
    
    // Достаем цвета и иконки для красивого превью папки
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
    
    // Прячем реальные иконки внутрь HTML папки (все их ссылки и обработчики сохраняются!)
    const contents = folderDiv.querySelector('.folder-contents');
    contents.appendChild(el1);
    contents.appendChild(el2);

    // Вешаем слушатели на новую папку
    folderDiv.addEventListener('click', handleIconEditClick, true);
    folderDiv.addEventListener('click', openFolderNormalMode);
    
    saveLayout();
}

// Открытие папки в обычном режиме
function openFolderNormalMode(e) {
    if (isEditMode) return;
    e.preventDefault();
    
    const folder = e.currentTarget;
    const contents = folder.querySelector('.folder-contents');
    const modalGrid = document.getElementById('folder-view-grid');
    
    document.getElementById('folder-view-title').innerText = folder.querySelector('span').innerText;
    
    // Временно переносим кнопки в модалку, чтобы они красиво отобразились
    while (contents.firstChild) {
        modalGrid.appendChild(contents.firstChild);
    }
    currentOpenFolderContents = contents;
    document.getElementById('folder-view-modal').classList.remove('hidden');
}

// Закрытие модалки папки (возвращаем кнопки обратно в DOM)
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

// === СИСТЕМА СОХРАНЕНИЯ (ПЕРЕЖИВЕТ ПЕРЕЗАГРУЗКУ) ===

function assignUniqueIDs() {
    const items = document.querySelectorAll('#tab-content-main .admin-icon-button:not(.admin-folder)');
    items.forEach((item, idx) => {
        if (!item.id) {
            // Генерируем ID из текста кнопки или ссылки
            const text = item.querySelector('span')?.innerText.trim().replace(/\s+/g, '_') || '';
            item.id = `grid_item_${idx}_${text}`;
        }
    });
}

function saveLayout() {
    const grid = document.querySelector('#tab-content-main .admin-icon-menu');
    const layout = { folders: {}, hidden: [] };

    // Сохраняем скрытые
    grid.querySelectorAll('.admin-icon-button.user-hidden').forEach(item => {
        if(item.id) layout.hidden.push(item.id);
    });

    // Сохраняем папки
    grid.querySelectorAll('.admin-folder').forEach(folder => {
        const childrenIds = Array.from(folder.querySelectorAll('.folder-contents .admin-icon-button'))
                                 .map(child => child.id);
        layout.folders[folder.id] = {
            name: folder.querySelector('span').innerText,
            preview: folder.querySelector('.folder-wrapper').innerHTML,
            children: childrenIds
        };
    });

    localStorage.setItem('adminMainLayout', JSON.stringify(layout));
}

function restoreLayout() {
    const layout = JSON.parse(localStorage.getItem('adminMainLayout'));
    if (!layout) return;

    const grid = document.querySelector('#tab-content-main .admin-icon-menu');

    // Скрываем ненужное
    layout.hidden.forEach(id => {
        const item = document.getElementById(id);
        if (item) item.classList.add('user-hidden');
    });

    // Восстанавливаем папки
    Object.keys(layout.folders).forEach(folderId => {
        const data = layout.folders[folderId];
        
        const folderDiv = document.createElement('div');
        folderDiv.className = 'admin-icon-button admin-folder';
        folderDiv.id = folderId;
        folderDiv.innerHTML = `
            <div class="icon-wrapper folder-wrapper">${data.preview}</div>
            <span>${data.name}</span>
            <div class="folder-contents"></div>
        `;
        
        const contents = folderDiv.querySelector('.folder-contents');
        
        data.children.forEach(childId => {
            const child = document.getElementById(childId);
            if (child) contents.appendChild(child); // Перемещаем оригинальную кнопку внутрь
        });

        // Если папка не пустая, добавляем в сетку
        if (contents.children.length > 0) {
            grid.appendChild(folderDiv);
            folderDiv.addEventListener('click', openFolderNormalMode);
        }
    });
}
