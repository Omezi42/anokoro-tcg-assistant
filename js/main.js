// js/main.js (コンテンツスクリプトのメインファイル) - 安定化版 v3.8
console.log("main.js: Script loaded (v3.8).");

// FontAwesome（アイコン表示用）のスタイルシートをページに注入
const fontAwesomeLink = document.createElement('link');
fontAwesomeLink.rel = 'stylesheet';
fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
document.head.appendChild(fontAwesomeLink);

// ブラウザ差異を吸収 (Chromeでは `browser` が未定義のため、フォールバックとして`chrome`を使用)
if (typeof browser === 'undefined') {
    var browser = chrome;
}

// --- グローバルアプリケーションステート管理 ---
class TcgAssistantApp extends EventTarget {
    constructor() {
        super();
        this.allCards = [];
        this.cardDataReady = new Promise(resolve => this._resolveCardDataReady = resolve);
        this.ws = null;
        
        this.isLoggedIn = false;
        this.currentUserId = null;
        this.currentUsername = null;
        this.currentDisplayName = null;
        this.currentRate = 1500;
        this.userMatchHistory = [];
        this.userMemos = [];
        this.userBattleRecords = [];
        this.userRegisteredDecks = [];

        this.isSidebarOpen = false;
        this.isMenuIconsVisible = true;
        this._injectedSectionScripts = new Set();
    }

    sendWsMessage(payload) {
        const ws = this.ws;

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
            console.log("WS Sent:", payload);
        } else if (ws && ws.readyState === WebSocket.CONNECTING) {
            console.log("WS is connecting. Queuing message:", payload);
            ws.addEventListener('open', () => {
                console.log("WS connection opened. Sending queued message:", payload);
                ws.send(JSON.stringify(payload));
            }, { once: true });
        } else {
            console.error("WS connection not available. The app will try to reconnect automatically.");
            connectWebSocket();
        }
    }
}
window.TCG_ASSISTANT = new TcgAssistantApp();
console.log("main.js: TCG_ASSISTANT namespace initialized.");


// --- WebSocket通信 ---
const RENDER_WS_URL = 'wss://anokoro-tcg-api.onrender.com';
let reconnectTimer = null;
let isConnecting = false;

function connectWebSocket() {
    if (isConnecting || (window.TCG_ASSISTANT.ws && window.TCG_ASSISTANT.ws.readyState === WebSocket.OPEN)) {
        return;
    }
    if (reconnectTimer) clearTimeout(reconnectTimer);

    console.log("WebSocket: Attempting to connect...");
    isConnecting = true;
    const ws = new WebSocket(RENDER_WS_URL);
    window.TCG_ASSISTANT.ws = ws;

    ws.onopen = () => {
        isConnecting = false;
        console.log("WebSocket: Connection established.");
        browser.storage.local.get(['loggedInUserId', 'loggedInUsername'], (result) => {
            if (result.loggedInUserId && result.loggedInUsername) {
                window.TCG_ASSISTANT.sendWsMessage({
                    type: 'auto_login',
                    userId: result.loggedInUserId,
                    username: result.loggedInUsername
                });
            } else {
                window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout'));
            }
        });
    };

    ws.onclose = (event) => {
        isConnecting = false;
        console.log(`WebSocket: Connection closed. Code: ${event.code}, Reason: ${event.reason}`);
        if (event.code !== 1000) { 
            if (window.TCG_ASSISTANT.ws === ws) { 
                window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout', { detail: { message: 'サーバーとの接続が切れました。5秒後に再接続します...' }}));
                reconnectTimer = setTimeout(connectWebSocket, 5000);
            }
        }
    };

    ws.onerror = (error) => {
        isConnecting = false;
        console.error("WebSocket: A connection error occurred.", error);
    };
    
    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log("WebSocket [main]: Received", message.type, message);
            const eventType = `ws-${message.type}`;
            window.TCG_ASSISTANT.dispatchEvent(new CustomEvent(eventType, { detail: message }));
        } catch (e) {
            console.error("Error parsing WebSocket message:", e);
        }
    };
}

// --- ログイン状態管理 ---
const handleLoginResponse = (e) => {
    if (e.detail.success) {
        window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginSuccess', { detail: e.detail }));
    } else {
        window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginFail', { detail: e.detail }));
    }
};

window.TCG_ASSISTANT.addEventListener('ws-login_response', handleLoginResponse);
window.TCG_ASSISTANT.addEventListener('ws-auto_login_response', handleLoginResponse);
window.TCG_ASSISTANT.addEventListener('ws-user_update_response', handleLoginResponse); 
window.TCG_ASSISTANT.addEventListener('ws-logout_response', () => window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout')));
window.TCG_ASSISTANT.addEventListener('ws-logout_forced', (e) => window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout', { detail: e.detail })));

window.TCG_ASSISTANT.addEventListener('loginSuccess', (e) => {
    const data = e.detail;
    const userData = data.updatedUserData || data;

    Object.assign(window.TCG_ASSISTANT, {
        isLoggedIn: true,
        currentUserId: userData.userId,
        currentUsername: userData.username,
        currentDisplayName: userData.displayName,
        currentRate: userData.rate,
        userMatchHistory: userData.matchHistory || [],
        userMemos: userData.memos || [],
        userBattleRecords: userData.battleRecords || [],
        userRegisteredDecks: userData.registeredDecks || []
    });
    
    const persistableTypes = ['login_response', 'auto_login_response', 'user_update_response'];
    if (persistableTypes.includes(data.type)) {
        browser.storage.local.set({ loggedInUserId: userData.userId, loggedInUsername: userData.username });
    }
    // [★修正] ログイン状態が変更されたことをブロードキャストする
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginStateChanged', { detail: { isLoggedIn: true } }));
});

window.TCG_ASSISTANT.addEventListener('loginFail', (e) => {
    if (e.detail.type !== 'auto_login_response') {
        window.showCustomDialog('認証失敗', e.detail.message || 'ログインに失敗しました。');
    }
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout'));
});

window.TCG_ASSISTANT.addEventListener('logout', (e) => {
    const wasLoggedIn = window.TCG_ASSISTANT.isLoggedIn;
    if (e?.detail?.message && window.TCG_ASSISTANT.isSidebarOpen) {
         window.showCustomDialog('ログアウト', e.detail.message);
    }
    Object.assign(window.TCG_ASSISTANT, {
        isLoggedIn: false, currentUserId: null, currentUsername: null, currentDisplayName: null,
        currentRate: 1500, userMatchHistory: [], userMemos: [],
        userBattleRecords: [], userRegisteredDecks: []
    });
    browser.storage.local.remove(['loggedInUserId', 'loggedInUsername']);
    if (wasLoggedIn) {
        window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginStateChanged', { detail: { isLoggedIn: false } }));
    }
});


// --- UI操作 ---
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
    const iconsWrapper = menuContainer?.querySelector('.tcg-menu-icons-wrapper');
    const toggleIcon = menuContainer?.querySelector('#tcg-menu-toggle-button i');
    if (!menuContainer || !iconsWrapper || !toggleIcon) return;
    
    if (window.TCG_ASSISTANT.isMenuIconsVisible) {
        menuContainer.classList.add('expanded');
        iconsWrapper.classList.remove('hidden');
        toggleIcon.classList.replace('fa-chevron-left', 'fa-chevron-right');
    } else {
        menuContainer.classList.remove('expanded');
        iconsWrapper.classList.add('hidden');
        toggleIcon.classList.replace('fa-chevron-right', 'fa-chevron-left');
    }
}

function createRightSideMenuAndAttachListeners() {
    const menuContainer = document.getElementById('tcg-right-menu-container');
    if (!menuContainer) return;

    menuContainer.querySelectorAll('.tcg-menu-icon').forEach(iconButton => {
        iconButton.addEventListener('click', (event) => toggleContentArea(event.currentTarget.dataset.section));
    });

    const toggleButton = document.getElementById('tcg-menu-toggle-button');
    toggleButton.addEventListener('click', () => {
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

// [★修正] セクション表示のロジックを修正
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

    const initSection = (initFunctionName) => {
        if (typeof window[initFunctionName] === 'function') {
            window[initFunctionName]();
        } else {
            console.error(`Init function ${initFunctionName} not found.`);
        }
    };

    const jsPath = `js/sections/${sectionId}.js`;
    const initFunctionName = `init${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}Section`;
    
    // HTMLがなければ読み込む
    if (!targetSection.hasChildNodes()) {
        try {
            const htmlPath = browser.runtime.getURL(`html/sections/${sectionId}.html`);
            const response = await fetch(htmlPath);
            if (!response.ok) throw new Error(`HTML load failed: ${response.status}`);
            targetSection.innerHTML = await response.text();
            
            // HTML読み込み後にJSを注入して初期化
            if (!window.TCG_ASSISTANT._injectedSectionScripts.has(jsPath)) {
                const script = document.createElement('script');
                script.src = browser.runtime.getURL(jsPath);
                script.onload = () => {
                    window.TCG_ASSISTANT._injectedSectionScripts.add(jsPath);
                    initSection(initFunctionName);
                };
                document.head.appendChild(script);
            } else {
                initSection(initFunctionName);
            }

        } catch (error) {
            targetSection.innerHTML = `<p style="color: red;">セクションの読み込みに失敗しました: ${error.message}</p>`;
        }
    } else {
        // 既にHTMLとJSがある場合は、初期化関数を再実行してUIを更新
        initSection(initFunctionName);
    }
    
    targetSection.classList.add('active');
};


// --- 初期化処理 ---
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
    fetch(browser.runtime.getURL('json/cards.json'))
        .then(response => response.json())
        .then(data => {
            window.TCG_ASSISTANT.allCards = data;
            console.log(`Features: ${data.length} cards loaded.`);
            window.TCG_ASSISTANT._resolveCardDataReady();
        })
        .catch(error => {
            console.error("Features: Failed to load card data:", error);
            window.showCustomDialog('エラー', 'カードデータの読み込みに失敗しました。');
        });
    connectWebSocket();
}

// --- エントリーポイント ---
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "showSection") {
        toggleContentArea(request.section, true);
    } else if (request.action === "toggleSidebar") {
        const activeSection = document.querySelector('.tcg-menu-icon.active')?.dataset.section || 'home';
        toggleContentArea(activeSection);
    }
    sendResponse({success: true});
    return true;
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUIIntoPage);
} else {
    injectUIIntoPage();
}
