// ================================================================
// 1. ИНИЦИАЛИЗАЦИЯ И ПЛАТФОРМА (VK / TG)
// ================================================================
let isVk = false;
(function initVkParams() {
    window.vkParams = null;
    const isValid = (str) => str && str.includes('vk_user_id') && str.includes('sign');
    try {
        let s = window.location.search; if (s.startsWith('?')) s = s.slice(1);
        if (isValid(s)) { window.vkParams = s; isVk = true; return; }
        
        let h = window.location.hash; if (h.startsWith('#') || h.startsWith('?')) h = h.slice(1);
        if (isValid(h)) { window.vkParams = h; isVk = true; return; }
        
        if (isValid(window.name)) { window.vkParams = window.name; isVk = true; return; }
        
        const href = window.location.href; const match = href.match(/(vk_user_id=[^#]*)/);
        if (match && match[1] && match[1].includes('sign')) { window.vkParams = match[1]; isVk = true; return; }
    } catch (e) {}
})();

function getAuthPayload() {
    if (isVk) return { initData: window.vkParams || '', platform: 'vk' };
    return { initData: window.Telegram?.WebApp?.initData || '', platform: 'tg' };
}

// Глобальные переменные
let userData = {};
let allQuests = [];
let heartbeatInterval = null;
let bonusGiftEnabled = false;
let cachedP2PCases = [];

// ================================================================
// УТИЛИТЫ И API
// ================================================================
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, match => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[match]);
}

async function makeApiRequest(url, body = {}, method = 'POST', isSilent = false) {
    if (!isSilent) document.getElementById('loader-overlay')?.classList.remove('hidden');
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);
        const options = { method, headers: { 'Content-Type': 'application/json' }, signal: controller.signal };
        
        if (method !== 'GET') options.body = JSON.stringify({ ...body, ...getAuthPayload() });
        else {
            const sep = url.includes('?') ? '&' : '?';
            url += `${sep}initData=${encodeURIComponent(getAuthPayload().initData)}`;
        }

        const response = await fetch(url, options);
        clearTimeout(timeoutId);
        if (response.status === 429) throw new Error('Cooldown active');
        if (response.status === 204) return null;
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || result.message || 'Ошибка сервера');
        return result;
    } catch (e) {
        if (e.name === 'AbortError') e.message = "Превышено время ожидания.";
        if (e.message !== 'Cooldown active' && !isSilent) {
             if (window.Telegram?.WebApp?.showAlert) Telegram.WebApp.showAlert(`Ошибка: ${e.message}`);
             else alert(`Ошибка: ${e.message}`);
        }
        throw e;
    } finally {
        if (!isSilent) document.getElementById('loader-overlay')?.classList.add('hidden');
    }
}

// ================================================================
// ПРОВЕРКИ И HEARTBEAT
// ================================================================
async function checkMaintenance() {
    try {
        const res = await fetch('/api/v1/bootstrap', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(getAuthPayload())
        });
        if (res.ok) {
            const data = await res.json();
            if (data.maintenance) window.location.href = '/';
        }
    } catch (e) {}
}

async function refreshDataSilently() {
    if (!window.Telegram?.WebApp?.initData && !isVk) return;
    try {
        const hbData = await makeApiRequest("/api/v1/user/heartbeat", {}, 'POST', true);
        if (hbData) {
            if (hbData.is_active === false) return;
            if (hbData.tickets !== undefined) {
                userData.tickets = hbData.tickets;
                const tel = document.getElementById('ticketStats');
                if (tel) tel.textContent = hbData.tickets;
            }
            if (hbData.quest_id) {
                userData.active_quest_id = hbData.quest_id;
                userData.active_quest_progress = hbData.quest_progress;
            }
            if (hbData.has_active_challenge) {
                if (!userData.challenge) userData.challenge = {};
                userData.challenge.progress_value = hbData.challenge_progress;
                userData.challenge.target_value = hbData.challenge_target;
            }
            updateShortcutStatuses(userData, allQuests);
            if (hbData.active_trade_status !== undefined) updateShopTile(hbData.active_trade_status);
        }
    } catch (e) {}
}

// ================================================================
// БАЛАНС
// ================================================================
let isBalanceLoading = false;
async function checkBalance(updateUI = true) {
    if (isBalanceLoading) return;
    isBalanceLoading = true;
    
    const iconCoins = document.getElementById('refresh-icon');
    if (iconCoins) iconCoins.classList.add('fa-spin');

    try {
        const data = await makeApiRequest('/api/v1/shop/smart_balance', {}, 'POST', true);
        if (updateUI && data) {
            const coins = (data.balance / 100).toFixed(0);
            const tickets = data.tickets || 0;
            const coinsEl = document.getElementById('user-balance');
            const ticketsEl = document.getElementById('ticketStats');
            
            if (coinsEl) { coinsEl.style.opacity = '0.5'; setTimeout(() => { coinsEl.textContent = coins; coinsEl.style.opacity = '1'; }, 150); }
            if (ticketsEl) { ticketsEl.style.opacity = '0.5'; setTimeout(() => { ticketsEl.textContent = tickets; ticketsEl.style.opacity = '1'; }, 150); }
        }
    } catch (e) {} finally {
        setTimeout(() => {
            isBalanceLoading = false;
            if (iconCoins) iconCoins.classList.remove('fa-spin');
        }, 500);
    }
}

// ================================================================
// UI: СЛАЙДЕР, ШОРТКАТЫ, ПЕРЕКЛЮЧАТЕЛЬ
// ================================================================
let slideInterval, currentSlideIndex = 0;
function setupSlider() {
    const container = document.getElementById('main-slider-container');
    if (!container) return;
    const slides = Array.from(container.querySelectorAll('.slide')).filter(s => s.style.display !== 'none');
    
    if (slides.length === 0) { container.style.display = 'none'; return; }
    container.style.display = '';

    const wrapper = container.querySelector('.slider-wrapper');
    const dotsContainer = container.querySelector('.slider-dots');
    const prevBtn = document.getElementById('slide-prev-btn');
    const nextBtn = document.getElementById('slide-next-btn');

    if (slides.length <= 1) {
        prevBtn.style.display = 'none'; nextBtn.style.display = 'none'; dotsContainer.style.display = 'none';
        return;
    }

    dotsContainer.innerHTML = '';
    slides.forEach((_, i) => {
        const dot = document.createElement('button'); dot.className = 'dot';
        dot.onclick = () => { showSlide(i); resetInterval(); };
        dotsContainer.appendChild(dot);
    });
    
    function showSlide(idx) {
        if (idx >= slides.length) idx = 0; if (idx < 0) idx = slides.length - 1;
        wrapper.style.transform = `translateX(-${idx * 100}%)`;
        container.querySelectorAll('.dot').forEach(d => d.classList.remove('active'));
        if (dotsContainer.children[idx]) dotsContainer.children[idx].classList.add('active');
        currentSlideIndex = idx;
    }
    function resetInterval() { clearInterval(slideInterval); slideInterval = setInterval(() => showSlide(currentSlideIndex + 1), 5000); }
    
    prevBtn.onclick = () => { showSlide(currentSlideIndex - 1); resetInterval(); };
    nextBtn.onclick = () => { showSlide(currentSlideIndex + 1); resetInterval(); };
    
    showSlide(currentSlideIndex); resetInterval();
}

function updateShortcutStatuses(uData, qData) {
    const chalStatus = document.getElementById('metro-challenge-status');
    const chalFill = document.getElementById('metro-challenge-fill');
    
    if (chalStatus && chalFill) {
        if (!uData.is_stream_online) {
            chalStatus.textContent = 'ОФФЛАЙН'; chalStatus.style.color = '#ff453a'; chalFill.style.width = '0%';
        } else if (uData.challenge) {
            const ch = uData.challenge;
            const p = ch.progress_value || 0, t = ch.target_value || 1;
            chalStatus.textContent = ch.claimed_at || p >= t ? 'ЗАБРАТЬ!' : `${p} / ${t}`;
            chalStatus.style.color = ch.claimed_at || p >= t ? '#34c759' : '';
            chalFill.style.width = `${Math.min(100, (p/t)*100)}%`;
        } else {
            chalStatus.textContent = 'Нет активного'; chalFill.style.width = '0%';
        }
    }

    const questStatus = document.getElementById('metro-quest-status');
    const questFill = document.getElementById('metro-quest-fill');
    if (questStatus && questFill) {
        if (!uData.active_quest_id) {
            questStatus.textContent = 'Выбрать'; questFill.style.width = '0%';
        } else {
            const q = qData.find(x => x.id === uData.active_quest_id);
            if (q) {
                const p = uData.active_quest_progress || 0, t = q.target_value || 1;
                questStatus.textContent = p >= t ? 'ГОТОВО' : `${p} / ${t}`;
                questStatus.style.color = p >= t ? '#34c759' : '';
                questFill.style.width = `${Math.min(100, (p/t)*100)}%`;
            }
        }
    }
}

function updateShopTile(status) {
    const tile = document.getElementById('shortcut-shop');
    if (!tile) return;
    
    const s = status || 'none';
    if (s === 'none') {
        tile.style.background = ''; tile.style.border = ''; tile.style.animation = '';
        tile.innerHTML = `<div class="metro-tile-bg-icon"><i class="fa-solid fa-cart-shopping"></i></div><div class="metro-content"><div class="metro-icon-main"><i class="fa-solid fa-cart-shopping"></i></div><span class="metro-label">Магазин</span><span class="metro-sublabel">Кейсы</span></div>`;
        return;
    }
    
    const map = {
        'creating': { l: 'СОЗДАНА', i: '<i class="fa-solid fa-clock"></i>', b: 'linear-gradient(135deg, #6a11cb, #2575fc)' },
        'sending': { l: 'ПРОВЕРКА', i: '<i class="fa-solid fa-hourglass fa-spin"></i>', b: 'linear-gradient(135deg, #2AABEE, #229ED9)' },
        'confirming': { l: 'ДЕЙСТВУЙ!', i: '<i class="fa-solid fa-fire fa-beat"></i>', b: 'linear-gradient(135deg, #ff3b30, #ff9500)' }
    };
    const st = map[s] || map['creating'];
    
    tile.style.background = st.b;
    tile.style.animation = s === 'confirming' ? 'pulse 2s infinite' : '';
    tile.innerHTML = `<div class="metro-tile-bg-icon" style="opacity:0.2">${st.i}</div><div class="metro-content"><div class="metro-icon-main" style="color:#fff;">${st.i}</div><span class="metro-label" style="color:#fff;">${st.l}</span></div>`;
}

// ================================================================
// КЕЙСЫ (РЕНДЕР И ЛОГИКА)
// ================================================================
let casesLoaded = false;
async function loadCases() {
    const grid = document.getElementById('shop-grid');
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:30px; color:#ffd700;"></i></div>';
    
    try {
        const items = await makeApiRequest('/api/v1/shop/goods', { category_id: 0 }, 'POST', true);
        grid.innerHTML = '';
        if (!items || !items.length) { grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#888;">Пусто</div>'; return; }
        
        items.forEach(item => {
            const name = item.name.replace(/^(Кейс|Case)\s*\|\s*/i, '');
            const safeImg = item.image_url || '';
            const safeName = item.name.replace(/'/g, "\\'");
            
            const div = document.createElement('div');
            div.className = 'shop-item';
            div.innerHTML = `
                <div class="item-title" style="margin-top:10px;">${escapeHTML(name)}</div>
                <div class="item-image-wrapper" onclick="openCaseContents(event, '${safeName}')">
                    <div class="case-info-overlay">Что внутри?</div>
                    <img src="${safeImg}" class="item-image case-zoom loaded">
                </div>
                <div class="item-info">
                    <button class="action-btn btn-buy" onclick="openCase(${item.id}, ${item.price}, '${safeName}', '${safeImg}', 'coins')">${item.price} 🟡</button>
                    <button class="action-btn btn-buy-tickets" onclick="openCase(${item.id}, ${item.price * 2}, '${safeName}', '${safeImg}', 'tickets')">${item.price * 2} 🎟️</button>
                </div>
            `;
            grid.appendChild(div);
        });
    } catch (e) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#ff3b30;">Ошибка</div>';
    }
}

// ================================================================
// РУЛЕТКА (ОТКРЫТИЕ КЕЙСА)
// ================================================================
async function validateUserTradeLink() {
    const loader = document.getElementById('purchase-loader');
    if (loader) { loader.classList.add('active'); loader.querySelector('.loader-text').innerText = "Проверка..."; }
    try {
        const res = await makeApiRequest('/api/v1/user/me', {}, 'POST', true);
        const tLink = res?.trade_link || "";
        if (!tLink.includes("partner=") || !tLink.includes("token=")) {
            Telegram.WebApp.showAlert("Привяжите корректную Trade-ссылку в Профиле!");
            return false;
        }
        return true;
    } catch(e) { return false; } finally { if (loader) loader.classList.remove('active'); }
}

window.openCase = async function(id, price, name, imageUrl, currency = 'coins') {
    const icon = currency === 'coins' ? '🟡' : '🎟️';
    const isLinkValid = await validateUserTradeLink();
    if (!isLinkValid) return;

    Telegram.WebApp.showConfirm(`Открыть за ${price} ${icon}?`, async (ok) => {
        if (!ok) return;
        const loader = document.getElementById('purchase-loader');
        if (loader) { loader.classList.add('active'); loader.querySelector('.loader-text').innerText = "Крутим..."; }

        try {
            const contentsResp = await makeApiRequest(`/api/v1/shop/case_contents?case_name=${encodeURIComponent(name)}`, {}, 'GET', true);
            const possibleItems = (contentsResp && contentsResp.length > 0) ? contentsResp : [{ name: "Item", image_url: imageUrl, rarity: "blue" }];

            const resData = await makeApiRequest('/api/v1/shop/buy', { item_id: id, price, title: name, image_url: imageUrl, currency }, 'POST');
            
            let winner = resData.winner || { name: "Ошибка", image_url: imageUrl, rarity: 'common' };
            
            let strip = [];
            for(let i=0; i<80; i++) strip.push(possibleItems[Math.floor(Math.random() * possibleItems.length)]);
            strip[60] = winner;

            launchRoulette(strip, winner, name, resData.lacky);
            checkBalance(true);
        } catch (e) { } finally {
            if (loader) loader.classList.remove('active');
        }
    });
}

function launchRoulette(items, winner, caseName, lacky) {
    const modal = document.getElementById('r-modal');
    const track = document.getElementById('r-track');
    const winScreen = document.getElementById('r-win');
    const area = document.getElementById('r-area');
    
    document.getElementById('r-case-name').innerText = caseName.replace(/^(Кейс|Case)\s*\|\s*/i, '');
    
    // Прогресс бар гаранта
    const curLacky = lacky || 1;
    const dots = document.querySelectorAll('#r-bottom-progress .r-progress-dot');
    dots.forEach((dot, i) => {
        dot.className = 'r-progress-dot';
        if (i < curLacky) dot.classList.add('active');
        if (i === 4 && curLacky === 5) dot.classList.add('guaranteed');
    });

    const progText = document.getElementById('r-progress-text');
    if (curLacky === 5) progText.innerHTML = '<span style="color:#ffcc00;">🔥 ГАРАНТ АКТИВЕН 🔥</span>';
    else progText.innerHTML = `Осталось <span style="color:#fff;">${5 - curLacky}</span> до гаранта`;

    document.getElementById('r-top-header').style.display = 'flex';
    document.getElementById('r-bottom-progress').style.display = 'flex';

    track.style.transition = 'none'; track.style.transform = 'translateX(0)';
    area.style.display = 'block'; winScreen.style.display = 'none'; modal.style.display = 'flex';

    track.innerHTML = items.map(item => `
        <div class="r-card r-${(item.rarity || 'blue').split(',')[0]}">
            <img src="${item.image_url}">
            <div class="r-card-name">${item.name.split('|').pop()}</div>
        </div>
    `).join('');

    setTimeout(() => {
        const finalPos = -((60 * 148) + 74 - (window.innerWidth / 2) + (Math.random() * 60 - 30));
        track.style.transition = `transform 8000ms cubic-bezier(0.15, 0, 0.05, 1)`;
        track.style.transform = `translateX(${finalPos}px)`;

        let tInterval = 50, timer = 0;
        const haptic = window.Telegram?.WebApp?.HapticFeedback;
        const tick = () => {
            if (timer >= 7700) return;
            if (haptic) haptic.selectionChanged();
            timer += tInterval;
            if (timer > 5000) tInterval += 20;
            setTimeout(tick, tInterval);
        };
        tick();

        setTimeout(() => {
            if (haptic) haptic.notificationOccurred('success');
            area.style.display = 'none';
            winScreen.innerHTML = `
                <h2 style="color:#ffcc00; margin-bottom:10px; text-shadow:0 0 20px rgba(255,215,0,0.5);">ВЫПАЛО!</h2>
                <img src="${winner.image_url}" class="win-img">
                <h3 style="color:#fff; margin:15px 0;">${winner.name}</h3>
                <button class="action-btn btn-buy" style="height:45px; margin-bottom:10px;" onclick="claimItem(${winner.id})">ЗАБРАТЬ</button>
                <button class="action-btn" style="background:#6a11cb; height:45px;" onclick="sellForTickets(${winner.id}, ${winner.price || 0})">ПРОДАТЬ ЗА ${winner.price || 0} 🎟️</button>
                <button class="action-btn btn-secondary-action" style="margin-top:10px; height:36px;" onclick="closeRoulette()">Закрыть</button>
            `;
            winScreen.style.display = 'flex';
        }, 8000);
    }, 100);
}

window.closeRoulette = () => {
    document.getElementById('r-modal').style.display = 'none';
    document.getElementById('r-top-header').style.display = 'none';
    document.getElementById('r-bottom-progress').style.display = 'none';
    checkBalance(true);
}

// ================================================================
// ВЫВОД И ПРОДАЖА СКИНА
// ================================================================
function showCustomConfirm(title, sub, btnText, btnClass, onConfirm) {
    const old = document.querySelector('.custom-confirm-overlay'); if (old) old.remove();
    const div = document.createElement('div'); div.className = 'custom-confirm-overlay visible';
    div.innerHTML = `
        <div class="custom-confirm-box">
            <h3 class="confirm-title">${title}</h3><p class="confirm-subtitle">${sub}</p>
            <div class="confirm-buttons">
                <button class="confirm-btn btn-cancel-modal" onclick="this.closest('.custom-confirm-overlay').remove()">Отмена</button>
                <button class="confirm-btn ${btnClass}" id="cc-btn">${btnText}</button>
            </div>
        </div>`;
    document.body.appendChild(div);
    div.querySelector('#cc-btn').onclick = () => { onConfirm(() => div.remove()); };
}

window.claimItem = async function(id) {
    showCustomConfirm("Вывести предмет?", "Ожидайте трейд в течение 24 часов.", "ЗАБРАТЬ", "btn-yellow-modal", async (close) => {
        try {
            const res = await makeApiRequest('/api/v1/user/inventory/withdraw', { history_id: id }, 'POST');
            if (res && res.status === 'offer_replacement') {
                close(); showReplacementChoice(res.options, id); return;
            }
            Telegram.WebApp.showAlert("✅ Успешно! Трейд скоро придет.");
            close(); closeRoulette();
        } catch(e) { close(); }
    });
}

window.sellForTickets = async function(id, price) {
    showCustomConfirm(`Продать за ${price} 🎟️?`, "Билеты начислятся моментально.", "ПРОДАТЬ", "btn-purple-modal", async (close) => {
        try {
            await makeApiRequest('/api/v1/user/inventory/sell', { history_id: id }, 'POST');
            Telegram.WebApp.showAlert(`Успешно! +${price} 🎟️`);
            close(); closeRoulette(); checkBalance(true);
        } catch(e) { close(); }
    });
}

// ================================================================
// ЗАМЕНЫ (REPLACEMENTS) И СОДЕРЖИМОЕ
// ================================================================
window.openCaseContents = async function(e, name) {
    if (e) e.stopPropagation();
    document.getElementById('case-contents-modal').classList.remove('hidden');
    const list = document.getElementById('case-items-list');
    list.innerHTML = ''; document.getElementById('contents-loader').style.display = 'block';
    try {
        const data = await makeApiRequest(`/api/v1/shop/case_contents?case_name=${encodeURIComponent(name)}`, {}, 'GET', true);
        list.innerHTML = data.map(item => `
            <div class="content-item ${item.rarity.includes('gold') ? 'gold' : item.rarity.includes('red') ? 'red' : item.rarity.includes('pink') ? 'pink' : item.rarity.includes('purple') ? 'purple' : 'blue'}">
                <img src="${item.image_url}">
                <div class="content-name">${item.name.split('|').pop()}</div>
            </div>`).join('');
    } catch(err) { list.innerHTML = 'Ошибка'; }
    finally { document.getElementById('contents-loader').style.display = 'none'; }
}
window.closeContentsModal = () => document.getElementById('case-contents-modal').classList.add('hidden');

window.showReplacementChoice = function(options, historyId) {
    document.getElementById('replacement-modal').classList.remove('hidden');
    document.getElementById('replacement-options-list').innerHTML = options.map(item => {
        const rClass = item.rarity.includes('gold') ? 'gold' : item.rarity.includes('red') ? 'red' : 'blue';
        return `
        <div class="replacement-card ${rClass}" onclick="initiateReplacementConfirm(${historyId}, '${item.assetid}', '${item.name_ru.replace(/'/g,"")}')">
            <img src="${item.icon_url}">
            <div class="replacement-text-zone">
                <div class="replacement-name">${item.name_ru.split('|').pop()}</div>
            </div>
        </div>`;
    }).join('');
}
window.closeReplacementModal = () => document.getElementById('replacement-modal').classList.add('hidden');
window.initiateReplacementConfirm = (hId, aId, name) => {
    showCustomConfirm("Подтвердить выбор?", `Забираем "${name}"?`, "Да", "btn-yellow-modal", async (close) => {
        try {
            await makeApiRequest('/api/v1/user/inventory/confirm_replacement', { history_id: hId, assetid: aId }, 'POST');
            Telegram.WebApp.showAlert("✅ Трейд отправлен."); close(); closeReplacementModal(); closeRoulette();
        } catch(e) { close(); }
    });
}

// ================================================================
// P2P TRADE-IN
// ================================================================
window.openP2PModal = async () => {
    document.getElementById('p2p-modal').classList.remove('hidden');
    const select = document.getElementById('p2p-case-select');
    select.innerHTML = '<option value="">Загрузка...</option>';
    try {
        cachedP2PCases = await makeApiRequest('/api/v1/p2p/cases', {}, 'GET', true);
        select.innerHTML = '<option value="">-- Выберите кейс --</option>' + cachedP2PCases.map(c => 
            `<option value="${c.id}" data-price="${c.price_in_coins}" data-img="${c.image_url}" data-name="${c.case_name}">${c.case_name}</option>`
        ).join('');
    } catch(e) { select.innerHTML = '<option value="">Ошибка</option>'; }
    loadP2PHistoryData();
}
window.closeP2PModal = () => document.getElementById('p2p-modal').classList.add('hidden');

window.calculateP2P = () => {
    const sel = document.getElementById('p2p-case-select');
    const opt = sel.options[sel.selectedIndex];
    const q = parseInt(document.getElementById('p2p-quantity').value) || 1;
    const card = document.getElementById('case-preview');
    
    if (!sel.value) { card.classList.remove('visible'); return; }
    
    document.getElementById('p2p-price-per-item').innerText = opt.dataset.price;
    document.getElementById('p2p-total').innerText = opt.dataset.price * q;
    document.getElementById('preview-img').src = opt.dataset.img;
    document.getElementById('preview-name').innerText = opt.dataset.name;
    document.getElementById('preview-price-text').innerText = opt.dataset.price;
    card.classList.add('visible');
}

window.createP2PTrade = async () => {
    const cid = document.getElementById('p2p-case-select').value;
    const q = parseInt(document.getElementById('p2p-quantity').value);
    if (!cid) return;
    try {
        await makeApiRequest('/api/v1/p2p/create', { case_id: parseInt(cid), quantity: q }, 'POST');
        Telegram.WebApp.showAlert("✅ Заявка создана!");
        document.getElementById('p2p-case-select').value = ""; window.calculateP2P(); loadP2PHistoryData();
    } catch(e) {}
}

window.openHistoryModal = () => { document.getElementById('history-modal-window').classList.add('active'); loadP2PHistoryData(); }
window.closeHistoryModal = () => document.getElementById('history-modal-window').classList.remove('active');

async function loadP2PHistoryData() {
    const list = document.getElementById('full-history-list');
    try {
        const trades = await makeApiRequest('/api/v1/p2p/my_trades', {}, 'POST', true);
        if (!trades.length) { list.innerHTML = '<div style="text-align:center; color:#888; margin-top:20px;">Пусто</div>'; return; }
        
        list.innerHTML = trades.map(t => {
            let bg = '#2c2c2e', bd = 'rgba(255,255,255,0.05)', st = 'Ожидание', action = '';
            if(t.status === 'active') { bg = 'rgba(255,204,0,0.1)'; bd = '#ffcc00'; st = '🔥 ПЕРЕДАЙТЕ СКИН'; action = `<button class="action-btn btn-buy" style="margin-top:10px;" onclick="confirmP2P(${t.id})">✅ Я передал</button>`; }
            if(t.status === 'review') { st = '👀 ПРОВЕРКА'; }
            if(t.status === 'completed') { st = '✅ ГОТОВО'; }
            
            return `
            <div style="background:${bg}; border:1px solid ${bd}; border-radius:12px; padding:12px; margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; color:#fff; font-weight:800;">
                    <span>Кейс #${t.case_id} (x${t.quantity})</span>
                    <span style="color:#ffcc00;">+${t.total_coins}</span>
                </div>
                <div style="font-size:10px; color:#888; margin-top:5px;">Статус: ${st}</div>
                ${action}
            </div>`;
        }).join('');
    } catch(e) {}
}
window.confirmP2P = (id) => {
    Telegram.WebApp.showConfirm("Передали скин в Steam?", async (ok) => {
        if(ok) { await makeApiRequest('/api/v1/p2p/confirm_sent', { trade_id: id }); loadP2PHistoryData(); Telegram.WebApp.showAlert("Отлично!"); }
    });
}

// ================================================================
// ЕЖЕДНЕВНЫЕ ПОДАРКИ
// ================================================================
async function checkGift() {
    if (!bonusGiftEnabled) return;
    try {
        const res = await makeApiRequest('/api/v1/gift/check', {}, 'POST', true);
        if (res && res.available) document.getElementById('gift-container').classList.remove('hidden');
    } catch (e) {}
}

document.getElementById('daily-gift-btn')?.addEventListener('click', () => {
    document.getElementById('gift-modal-overlay').classList.remove('hidden');
    document.getElementById('gift-content-initial').classList.remove('hidden');
    document.getElementById('gift-content-result').classList.add('hidden');
});

document.getElementById('gift-open-btn')?.addEventListener('click', async () => {
    try {
        document.getElementById('gift-open-btn').disabled = true;
        const res = await makeApiRequest('/api/v1/gift/claim', {}, 'POST');
        
        document.getElementById('gift-content-initial').classList.add('hidden');
        document.getElementById('gift-content-result').classList.remove('hidden');
        document.getElementById('gift-result-text').innerText = res.type === 'coins' ? `+${res.value} 🟡` : `+${res.value} 🎟️`;
        checkBalance(true);
    } catch (e) {}
});

document.getElementById('gift-x-btn')?.addEventListener('click', () => document.getElementById('gift-modal-overlay').classList.add('hidden'));
document.getElementById('gift-close-btn')?.addEventListener('click', () => document.getElementById('gift-modal-overlay').classList.add('hidden'));

// ================================================================
// PULL TO REFRESH И ЗАЩИТА СВАЙПА
// ================================================================
document.body.addEventListener('touchmove', (e) => {
    if (!e.target.closest('.main-content-scrollable') && !e.target.closest('.modal-content')) {
        if (e.cancelable) e.preventDefault();
    }
}, { passive: false });

function initPullToRefresh() {
    const content = document.getElementById('main-content');
    const ptr = document.getElementById('pull-to-refresh');
    if (!content || !ptr) return;

    let startY = 0, distance = 0, isPulling = false;
    content.addEventListener('touchstart', (e) => {
        if (content.scrollTop <= 0) { startY = e.touches[0].clientY; isPulling = true; content.style.transition = 'none'; ptr.style.transition = 'none'; }
    }, { passive: true });
    
    content.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        const diff = e.touches[0].clientY - startY;
        if (diff > 0 && content.scrollTop <= 0) {
            if (e.cancelable) e.preventDefault();
            distance = Math.pow(diff, 0.85);
            if (distance > 150) distance = 150;
            content.style.transform = `translateY(${distance}px)`;
            ptr.style.transform = `translateY(${distance}px)`;
        }
    }, { passive: false });

    content.addEventListener('touchend', () => {
        if (!isPulling) return;
        isPulling = false;
        content.style.transition = '0.3s'; ptr.style.transition = '0.3s';
        if (distance > 80) {
            ptr.querySelector('i').classList.add('fa-spin');
            setTimeout(() => window.location.reload(), 300);
        } else {
            content.style.transform = 'translateY(0)'; ptr.style.transform = 'translateY(0)';
        }
        distance = 0;
    });
}

// ================================================================
// UI ТАБЫ И АНИМАЦИИ
// ================================================================
document.querySelectorAll('.toggle-option').forEach((opt, index) => {
    opt.addEventListener('click', () => {
        document.querySelector('.toggle-slider').style.transform = `translateX(${index * 100}%)`;
        document.querySelectorAll('.toggle-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
        document.getElementById(opt.dataset.target).classList.add('active');
        
        if (opt.dataset.target === 'cases-view' && !casesLoaded) { loadCases(); casesLoaded = true; }
    });
});

// АДМИНКА
window.toggleAdminMenu = () => { document.querySelector('.admin-fab-btn').classList.toggle('active'); document.getElementById('admin-menu-items').classList.toggle('show'); }
window.openPassModal = () => document.getElementById('password-modal').classList.remove('hidden');
window.closePassModal = () => document.getElementById('password-modal').classList.add('hidden');
window.submitResetCache = async () => {
    const pw = document.getElementById('admin-pass-input').value;
    if(!pw) return;
    try {
        await makeApiRequest('/api/v1/admin/shop/reset_cache', { password: pw }, 'POST');
        Telegram.WebApp.showAlert("Кэш очищен"); closePassModal();
    } catch(e) {}
}

// ================================================================
// ГЛАВНАЯ ЗАГРУЗКА (MAIN)
// ================================================================
async function main() {
    try {
        if (!isVk && window.Telegram && !Telegram.WebApp.initData) {
            document.getElementById('loader-overlay')?.classList.add('hidden');
            return;
        }

        const data = await makeApiRequest("/api/v1/bootstrap", {}, 'POST');
        if (!data) throw new Error("Нет данных");
        
        userData = data.user || {};
        allQuests = data.quests || [];
        bonusGiftEnabled = data.menu?.bonus_gift_enabled || false;
        
        // Рендер
        document.getElementById('fullName').textContent = userData.full_name || "Профиль";
        if (userData.is_admin) {
            document.getElementById('nav-admin').classList.remove('hidden');
            document.getElementById('admin-fab').style.display = 'flex';
        }
        
        // Слайдер (Фейковые розыгрыши для теста, в идеале берется из data)
        const wrapper = document.querySelector('.slider-wrapper');
        wrapper.innerHTML = `
            <a href="/raffles" class="slide premium-slide-box">
                <div class="slide-content-left"><div class="raffle-item-name-new">AWP | Asiimov</div></div>
                <img src="https://placehold.co/100" class="raffle-item-img-new">
            </a>`;
        setupSlider();

        // Ярлыки
        updateShortcutStatuses(userData, allQuests);
        if (userData.active_trade_status) updateShopTile(userData.active_trade_status);

        // Подарки
        setTimeout(checkGift, 1000);

        document.getElementById('loader-overlay')?.classList.add('hidden');
    } catch(e) {
        document.getElementById('loading-text').textContent = "Ошибка запуска";
        setTimeout(() => document.getElementById('loader-overlay')?.classList.add('hidden'), 2000);
    }
}

// ЗАПУСК СИСТЕМЫ
try {
    if (window.Telegram?.WebApp) {
        Telegram.WebApp.ready();
        Telegram.WebApp.expand();
        Telegram.WebApp.setHeaderColor('#141414');
        Telegram.WebApp.setBackgroundColor('#141414');
        if (Telegram.WebApp.disableVerticalSwipes) Telegram.WebApp.disableVerticalSwipes();
    }
    
    initPullToRefresh();
    checkMaintenance();
    main();

    clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => { if (!document.hidden) refreshDataSilently(); }, 30000);
} catch (e) { console.error("Global init error", e); }
