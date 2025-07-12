// js/main.js (コンテンツスクリプトのメインファイル) - 安定化版 v2.7

console.log("main.js: Script loaded (v2.7).");

// FontAwesomeの読み込み
const fontAwesomeLink = document.createElement('link');
fontAwesomeLink.rel = 'stylesheet';
fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
document.head.appendChild(fontAwesomeLink);

if (typeof browser === 'undefined') { var browser = chrome; }

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
        this._injectedSectionScripts = new Set();
    }
}
window.TCG_ASSISTANT = new TcgAssistantApp();
console.log("main.js: TCG_ASSISTANT namespace initialized.");

// --- WebSocket通信 ---
const RENDER_WS_URL = 'wss://anokoro-tcg-api.onrender.com';
let reconnectTimer = null;

function connectWebSocket() {
    if (window.TCG_ASSISTANT.ws && window.TCG_ASSISTANT.ws.readyState === WebSocket.OPEN) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);

    console.log("WebSocket: Attempting to connect...");
    const ws = new WebSocket(RENDER_WS_URL);
    window.TCG_ASSISTANT.ws = ws;

    ws.onopen = () => {
        console.log("WebSocket: Connection established.");
        browser.storage.local.get(['loggedInUserId', 'loggedInUsername'], (result) => {
            if (result.loggedInUserId && result.loggedInUsername) {
                ws.send(JSON.stringify({
                    type: 'auto_login',
                    userId: result.loggedInUserId,
                    username: result.loggedInUsername
                }));
            } else {
                window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout'));
            }
        });
    };

    ws.onclose = () => {
        console.log(`WebSocket: Connection closed.`);
        if (window.TCG_ASSISTANT.ws === ws) { // 意図しない切断の場合のみ再接続
            window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout', { detail: { message: 'サーバーとの接続が切れました。再接続します...' }}));
            reconnectTimer = setTimeout(connectWebSocket, 5000);
        }
    };

    ws.onerror = (error) => console.error("WebSocket: Error:", error);
    
    ws.onmessage = (event) => {
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
window.TCG_ASSISTANT.addEventListener('ws-logout_response', () => window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout')));
window.TCG_ASSISTANT.addEventListener('ws-logout_forced', (e) => window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout', { detail: e.detail })));

window.TCG_ASSISTANT.addEventListener('loginSuccess', (e) => {
    const data = e.detail;
    Object.assign(window.TCG_ASSISTANT, {
        isLoggedIn: true,
        currentUserId: data.user_id,
        currentUsername: data.username,
        currentDisplayName: data.display_name,
        currentRate: data.rate,
        userMatchHistory: data.matchHistory || [],
        userMemos: data.memos || [],
        userBattleRecords: data.battleRecords || [],
        userRegisteredDecks: data.registeredDecks || []
    });
    if (e.detail.type === 'login_response') {
        browser.storage.local.set({ loggedInUserId: data.user_id, loggedInUsername: data.username });
    }
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginStateChanged', { detail: { isLoggedIn: true } }));
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
        isLoggedIn: false, currentUserId: null, currentUsername: null, currentDisplayName: null,
        currentRate: 1500, userMatchHistory: [], userMemos: [],
        userBattleRecords: [], userRegisteredDecks: []
    });
    browser.storage.local.remove(['loggedInUserId', 'loggedInUsername']);
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginStateChanged', { detail: { isLoggedIn: false } }));
});


// --- UI操作 ---
window.showCustomDialog = function(title, message, isConfirm = false) { /* ... 実装は変更なし ... */ return new Promise(r => r(false)); };
// ... その他のUI操作関数 (toggleContentArea, showSectionなど) は変更なし

// --- 初期化処理 ---
async function injectUIIntoPage() { /* ... 実装は変更なし ... */ }

function initializeExtensionFeatures() {
    console.log("Features: Initializing...");
    fetch(browser.runtime.getURL('json/cards.json'))
        .then(response => response.json())
        .then(data => {
            window.TCG_ASSISTANT.allCards = data;
            console.log(`Features: ${data.length} cards loaded.`);
            window.TCG_ASSISTANT._resolveCardDataReady(); // Promiseを解決
        })
        .catch(error => {
            console.error("Features: Failed to load card data:", error);
            window.showCustomDialog('エラー', 'カードデータの読み込みに失敗しました。');
        });
    connectWebSocket();
}

// --- エントリーポイント ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUIIntoPage);
} else {
    injectUIIntoPage();
}
