// js/sections/home.js - 修正版 v2.5

let homeInitialized = false;

window.initHomeSection = async function() {
    console.log("Home section initialized (v2.5).");

    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    const homeLoginStatus = document.getElementById('home-login-status');
    const homeLoginButton = document.getElementById('home-login-button');
    const homeLogoutButton = document.getElementById('home-logout-button');

    const updateLoginStatusUI = () => {
        if (!homeLoginStatus || !homeLoginButton || !homeLogoutButton) return;
        const assistant = window.TCG_ASSISTANT;
        
        if (assistant.isLoggedIn) {
            homeLoginStatus.innerHTML = `現在、<strong>${assistant.currentDisplayName || assistant.currentUsername}</strong> としてログイン中です。`;
            homeLoginButton.style.display = 'none';
            homeLogoutButton.style.display = 'inline-block';
        } else {
            homeLoginStatus.innerHTML = 'レート戦や戦績記録などの機能を利用するには、レート戦セクションからログインしてください。';
            homeLoginButton.style.display = 'inline-block';
            homeLogoutButton.style.display = 'none';
        }
    };

    if (homeInitialized) {
        updateLoginStatusUI();
        return;
    }

    const onHomeLoginButtonClick = () => {
        if (window.toggleContentArea) {
            window.toggleContentArea('rateMatch', true);
        }
    };

    const onHomeLogoutButtonClick = async () => {
        const confirmed = await window.showCustomDialog('ログアウト', 'ログアウトしますか？', true);
        if (confirmed) {
            if (window.TCG_ASSISTANT.ws && window.TCG_ASSISTANT.ws.readyState === WebSocket.OPEN) {
                window.TCG_ASSISTANT.ws.send(JSON.stringify({ type: 'logout' }));
            } else {
                window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout', { detail: { message: 'ログアウトしました。' }}));
            }
        }
    };

    homeLoginButton?.addEventListener('click', onHomeLoginButtonClick);
    homeLogoutButton?.addEventListener('click', onHomeLogoutButtonClick);
    window.TCG_ASSISTANT.addEventListener('loginStateChanged', updateLoginStatusUI);

    updateLoginStatusUI();
    homeInitialized = true;
};

void 0;
