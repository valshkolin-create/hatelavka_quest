// Этот файл должен грузиться ПЕРВЫМ
window.makeApiRequest = async function(url, body = {}, method = 'POST', showLoader = true) {
    const loader = document.getElementById('loader-overlay');
    if (showLoader && loader) loader.classList.remove('hidden');
    
    try {
        const options = {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
        };
        
        if (method.toUpperCase() !== 'GET') {
            options.body = JSON.stringify({ ...body, initData: window.Telegram?.WebApp?.initData || '' });
        } else {
            // Если нужно, добавь initData в URL для GET-запросов
            const separator = url.includes('?') ? '&' : '?';
            url += `${separator}initData=${encodeURIComponent(window.Telegram?.WebApp?.initData || '')}`;
        }

        const response = await fetch(url, options);
        if (response.status === 204) return { success: true };
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || result.message || 'Ошибка API');
        return result;
    } catch (e) {
        console.error("API Request Error:", e);
        throw e;
    } finally {
        if (showLoader && loader) loader.classList.add('hidden');
    }
};
