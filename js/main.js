// js/main.js (コンテンツスクリプトのメインファイル) - 修正版 v2.5

console.log("main.js: Script loaded (v2.5).");

const fontAwesomeLink = document.createElement('link');
fontAwesomeLink.rel = 'stylesheet';
fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
document.head.appendChild(fontAwesomeLink);

if (typeof browser === 'undefined') {
    var browser = chrome;
}

class TcgAssistantApp extends EventTarget {
    constructor() {
        super();
        this.allCards = [];
        this.cardDataReady = null;
        this.currentUserId = null;
        this.currentUsername = null;
        this.currentDisplayName = null;
        this.currentRate = 1500;
        this.userMatchHistory = [];
        this.userMemos = [];
        this.userBattleRecords = [];
        this.userRegisteredDecks = [];
        this.ws = null;
        this.isSidebarOpen = false;
        this.isMenuIconsVisible = true;
        this._injectedSectionScripts = new Set();
    }
}
window.TCG_ASSISTANT = new TcgAssistantApp();
console.log("main.js: TCG_ASSISTANT EventTarget namespace initialized.");

const RENDER_WS_URL = 'wss://anokoro-tcg-api.onrender.com';
let reconnectInterval = 5000;

function connectWebSocket() {
    if (window.TCG_ASSISTANT.ws && (window.TCG_ASSISTANT.ws.readyState === WebSocket.OPEN || window.TCG_ASSISTANT.ws.readyState === WebSocket.CONNECTING)) {
        return;
    }
    console.log("WebSocket: Attempting to connect...");
    window.TCG_ASSISTANT.ws = new WebSocket(RENDER_WS_URL);

    window.TCG_ASSISTANT.ws.onopen = () => {
        console.log("WebSocket: Connection established.");
        reconnectInterval = 5000;
        browser.storage.local.get(['loggedInUserId', 'loggedInUsername'], (result) => {
            if (result.loggedInUserId && result.loggedInUsername) {
                window.TCG_ASSISTANT.ws.send(JSON.stringify({
                    type: 'auto_login',
                    userId: result.loggedInUserId,
                    username: result.loggedInUsername
                }));
            } else {
                window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout'));
            }
        });
    };

    window.TCG_ASSISTANT.ws.onclose = () => {
        console.log(`WebSocket: Connection closed. Reconnecting in ${reconnectInterval / 1000}s.`);
        window.TCG_ASSISTANT.ws = null;
        window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout', { detail: { message: 'サーバーとの接続が切れました。' }}));
        setTimeout(connectWebSocket, reconnectInterval);
    };

    window.TCG_ASSISTANT.ws.onerror = (error) => {
        console.error("WebSocket: Error:", error);
        window.TCG_ASSISTANT.ws.close();
    };

    window.TCG_ASSISTANT.ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log("WebSocket [main]: Received", message.type);
            const eventType = `ws-${message.type}`;
            window.TCG_ASSISTANT.dispatchEvent(new CustomEvent(eventType, { detail: message }));
        } catch (e) {
            console.error("Error parsing WebSocket message:", e);
        }
    };
}

const handleWsLoginResponse = (e) => {
    if (e.detail.success) {
        window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginSuccess', { detail: e.detail }));
    } else {
        window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginFail', { detail: e.detail }));
    }
};

window.TCG_ASSISTANT.addEventListener('ws-login_response', handleWsLoginResponse);
window.TCG_ASSISTANT.addEventListener('ws-auto_login_response', handleWsLoginResponse);

window.TCG_ASSISTANT.addEventListener('ws-logout_response', (e) => {
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout', { detail: e.detail }));
});
window.TCG_ASSISTANT.addEventListener('ws-logout_forced', (e) => {
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout', { detail: e.detail }));
});

window.TCG_ASSISTANT.addEventListener('loginSuccess', (e) => {
    const data = e.detail;
    Object.assign(window.TCG_ASSISTANT, {
        currentUserId: data.userId,
        currentUsername: data.username,
        currentDisplayName: data.displayName,
        currentRate: data.rate,
        userMatchHistory: data.matchHistory || [],
        userMemos: data.memos || [],
        userBattleRecords: data.battleRecords || [],
        userRegisteredDecks: data.registeredDecks || []
    });
    if (data.type === 'login_response') {
        browser.storage.local.set({ loggedInUserId: data.userId, loggedInUsername: data.username });
    }
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginStateChanged'));
});

window.TCG_ASSISTANT.addEventListener('loginFail', (e) => {
    window.showCustomDialog('認証失敗', e.detail.message);
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout'));
});

window.TCG_ASSISTANT.addEventListener('logout', (e) => {
    if (e?.detail?.message && window.TCG_ASSISTANT.isSidebarOpen) {
         window.showCustomDialog('ログアウト', e.detail.message);
    }
    Object.assign(window.TCG_ASSISTANT, {
        currentUserId: null, currentUsername: null, currentDisplayName: null,
        currentRate: 1500, userMatchHistory: [], userMemos: [],
        userBattleRecords: [], userRegisteredDecks: []
    });
    browser.storage.local.remove(['loggedInUserId', 'loggedInUsername']);
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginStateChanged'));
});

window.showCustomDialog = function(title, message, isConfirm = false) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('tcg-custom-dialog-overlay');
        if (!overlay) return resolve(false);
        const dialogTitle = overlay.querySelector('#tcg-dialog-title');
        const dialogMessage = overlay.querySelector('#tcg-dialog-message');
        const okButton = overlay.querySelector('#tcg-dialog-ok-button');
        const cancelButton = overlay.querySelector('#tcg-dialog-cancel-button');
        if (!dialogTitle || !dialogMessage || !okButton || !cancelButton) return resolve(false);

        dialogTitle.textContent = title;
        dialogMessage.innerHTML = message;
        cancelButton.style.display = isConfirm ? 'inline-block' : 'none';

        const newOkButton = okButton.cloneNode(true);
        okButton.parentNode.replaceChild(newOkButton, okButton);
        const newCancelButton = cancelButton.cloneNode(true);
        cancelButton.parentNode.replaceChild(newCancelButton, cancelButton);

        newOkButton.addEventListener('click', () => {
            overlay.classList.remove('show');
            resolve(true);
        }, { once: true });

        if (isConfirm) {
            newCancelButton.addEventListener('click', () => {
                overlay.classList.remove('show');
                resolve(false);
            }, { once: true });
        }
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('show'), 10);
    });
};

function updateMenuIconsVisibility() {
    const menuContainer = document.getElementById('tcg-right-menu-container');
    const menuIconsWrapper = menuContainer?.querySelector('.tcg-menu-icons-wrapper');
    const toggleButton = document.getElementById('tcg-menu-toggle-button');
    const toggleIcon = toggleButton?.querySelector('i');
    if (!menuContainer || !menuIconsWrapper || !toggleButton || !toggleIcon) return;

    if (window.TCG_ASSISTANT.isMenuIconsVisible) {
        menuContainer.classList.add('expanded');
        menuIconsWrapper.classList.remove('hidden');
        toggleIcon.classList.replace('fa-chevron-left', 'fa-chevron-right');
    } else {
        menuContainer.classList.remove('expanded');
        menuIconsWrapper.classList.add('hidden');
        toggleIcon.classList.replace('fa-chevron-right', 'fa-chevron-left');
    }
}

function createRightSideMenuAndAttachListeners() {
    const menuContainer = document.getElementById('tcg-right-menu-container');
    if (!menuContainer) return;
    menuContainer.querySelectorAll('.tcg-menu-icon').forEach(iconButton => {
        iconButton.addEventListener('click', (event) => toggleContentArea(event.currentTarget.dataset.section));
    });
    document.getElementById('tcg-menu-toggle-button').addEventListener('click', () => {
        window.TCG_ASSISTANT.isMenuIconsVisible = !window.TCG_ASSISTANT.isMenuIconsVisible;
        updateMenuIconsVisibility();
        browser.storage.local.set({ isMenuIconsVisible: window.TCG_ASSISTANT.isMenuIconsVisible });
    });
    browser.storage.local.get(['isMenuIconsVisible'], (result) => {
        window.TCG_ASSISTANT.isMenuIconsVisible = result.isMenuIconsVisible !== false;
        updateMenuIconsVisibility();
    });
}

window.toggleContentArea = function(sectionId, forceOpen = false) {
    const contentArea = document.getElementById('tcg-content-area');
    const menuContainer = document.getElementById('tcg-right-menu-container');
    if (!contentArea || !menuContainer) return;

    const currentActiveIcon = menuContainer.querySelector('.tcg-menu-icon.active');
    const clickedIcon = menuContainer.querySelector(`.tcg-menu-icon[data-section="${sectionId}"]`);
    const isSameIcon = currentActiveIcon === clickedIcon;

    if (window.TCG_ASSISTANT.isSidebarOpen && isSameIcon && !forceOpen) {
        contentArea.classList.remove('active');
        window.TCG_ASSISTANT.isSidebarOpen = false;
        if(currentActiveIcon) currentActiveIcon.classList.remove('active');
    } else {
        contentArea.classList.add('active');
        window.TCG_ASSISTANT.isSidebarOpen = true;
        if (currentActiveIcon) currentActiveIcon.classList.remove('active');
        if (clickedIcon) clickedIcon.classList.add('active');
        showSection(sectionId);
    }
    browser.storage.local.set({ isSidebarOpen: window.TCG_ASSISTANT.isSidebarOpen, activeSection: sectionId });
};

window.showSection = async function(sectionId) {
    const tcgSectionsWrapper = document.getElementById('tcg-sections-wrapper');
    if (!tcgSectionsWrapper) return;

    document.querySelectorAll('.tcg-section').forEach(s => s.classList.remove('active'));
    let targetSection = document.getElementById(`tcg-${sectionId}-section`);
    if (!targetSection) {
        targetSection = document.createElement('div');
        targetSection.id = `tcg-${sectionId}-section`;
        targetSection.className = 'tcg-section';
        tcgSectionsWrapper.appendChild(targetSection);
    }

    try {
        const htmlPath = browser.runtime.getURL(`html/sections/${sectionId}.html`);
        const response = await fetch(htmlPath);
        if (!response.ok) throw new Error(`HTML load failed: ${response.status}`);
        targetSection.innerHTML = await response.text();
    } catch (error) {
        targetSection.innerHTML = `<p style="color: red;">セクションの読み込みに失敗しました。</p>`;
        targetSection.classList.add('active');
        return;
    }

    const jsPath = `js/sections/${sectionId}.js`;
    const initFunctionName = `init${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}Section`;

    const injectAndInit = async () => {
        try {
            let attempts = 0;
            const maxAttempts = 50;
            while (typeof window[initFunctionName] !== 'function' && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            if (typeof window[initFunctionName] === 'function') {
                await window[initFunctionName]();
            } else {
                console.error(`Init function ${initFunctionName} not found after waiting.`);
            }
        } catch(e) {
            console.error(`Error initializing section ${sectionId}:`, e);
        }
    };

    if (!window.TCG_ASSISTANT._injectedSectionScripts.has(jsPath)) {
        browser.runtime.sendMessage({ action: "injectSectionScript", scriptPath: jsPath }, (response) => {
            if (browser.runtime.lastError || !response?.success) {
                console.error(`Failed to inject script ${jsPath}:`, browser.runtime.lastError?.message || response?.error);
                return;
            }
            window.TCG_ASSISTANT._injectedSectionScripts.add(jsPath);
            injectAndInit();
        });
    } else {
        await injectAndInit();
    }
    targetSection.classList.add('active');
};

async function injectUIIntoPage() {
    if (document.getElementById('tcg-assistant-container')) return;
    const uiContainer = document.createElement('div');
    uiContainer.id = 'tcg-assistant-container';
    try {
        const htmlPath = browser.runtime.getURL('html/index.html');
        const response = await fetch(htmlPath);
        if (!response.ok) throw new Error('Failed to fetch index.html');
        uiContainer.innerHTML = await response.text();
        document.body.prepend(uiContainer);
        console.log("main.js: UI injected successfully.");
        createRightSideMenuAndAttachListeners();
        await initializeExtensionFeatures();
        browser.storage.local.get(['isSidebarOpen', 'activeSection'], (result) => {
            const activeSection = result.activeSection || 'home';
            if (result.isSidebarOpen) {
                toggleContentArea(activeSection, true);
            }
        });
    } catch (error) {
        console.error("UI Injector: Failed to inject UI:", error);
    }
}

function initializeExtensionFeatures() {
    console.log("Features: Initializing...");
    window.TCG_ASSISTANT.cardDataReady = new Promise(async (resolve, reject) => {
        try {
            const response = await fetch(browser.runtime.getURL('json/cards.json'));
            if (!response.ok) throw new Error(`Failed to fetch cards.json: ${response.statusText}`);
            window.TCG_ASSISTANT.allCards = await response.json();
            console.log(`Features: ${window.TCG_ASSISTANT.allCards.length} cards loaded.`);
            resolve();
        } catch (error) {
            console.error("Features: Failed to load card data:", error);
            setTimeout(() => window.showCustomDialog('エラー', `カードデータのロードに失敗しました: ${error.message}`), 500);
            reject(error);
        }
    });
    connectWebSocket();
}

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "showSection") {
        toggleContentArea(request.section, true);
    } else if (request.action === "toggleSidebar") {
        const activeSection = document.querySelector('.tcg-menu-icon.active')?.dataset.section || 'home';
        toggleContentArea(activeSection);
    } else if (request.action === "command") {
        switch (request.command) {
            case "toggle-sidebar":
                const activeSection = document.querySelector('.tcg-menu-icon.active')?.dataset.section || 'home';
                toggleContentArea(activeSection);
                break;
            case "open-home-section":
                toggleContentArea("home", true);
                break;
            case "open-memo-section":
                toggleContentArea("memo", true);
                break;
        }
    }
    sendResponse({success: true});
    return true;
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUIIntoPage);
} else {
    injectUIIntoPage();
}
