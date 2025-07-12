// js/main.js (コンテンツスクリプトのメインファイル) - 安定化版 v2.8

console.log("main.js: Script loaded (v2.8).");

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
// 拡張機能全体のデータと状態を管理するクラス
class TcgAssistantApp extends EventTarget {
    constructor() {
        super();
        this.allCards = []; // 全カードデータ
        // カードデータの読み込み完了を通知するためのPromise
        this.cardDataReady = new Promise(resolve => this._resolveCardDataReady = resolve);
        this.ws = null; // WebSocketインスタンス
        
        // --- ログイン状態とユーザーデータ ---
        this.isLoggedIn = false;
        this.currentUserId = null;
        this.currentUsername = null;
        this.currentDisplayName = null;
        this.currentRate = 1500;
        this.userMatchHistory = [];
        this.userMemos = [];
        this.userBattleRecords = [];
        this.userRegisteredDecks = [];

        // --- UIの状態 ---
        this.isSidebarOpen = false;
        this.isMenuIconsVisible = true; // ★修正: メニュー表示状態を管理
        this._injectedSectionScripts = new Set(); // 読み込み済みのセクションスクリプトを記録
    }
}
// グローバルな `window` オブジェクトにアプリケーションインスタンスを配置し、どこからでもアクセス可能にする
window.TCG_ASSISTANT = new TcgAssistantApp();
console.log("main.js: TCG_ASSISTANT namespace initialized.");

// --- WebSocket通信 ---
const RENDER_WS_URL = 'wss://anokoro-tcg-api.onrender.com';
let reconnectTimer = null; // 再接続用のタイマー

/**
 * WebSocketサーバーに接続する関数
 */
function connectWebSocket() {
    // 既に接続中、または接続試行中の場合は何もしない
    if (window.TCG_ASSISTANT.ws && window.TCG_ASSISTANT.ws.readyState === WebSocket.OPEN) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);

    console.log("WebSocket: Attempting to connect...");
    const ws = new WebSocket(RENDER_WS_URL);
    window.TCG_ASSISTANT.ws = ws;

    // 接続成功時の処理
    ws.onopen = () => {
        console.log("WebSocket: Connection established.");
        // ローカルストレージからログイン情報を取得し、自動ログインを試行
        browser.storage.local.get(['loggedInUserId', 'loggedInUsername'], (result) => {
            if (result.loggedInUserId && result.loggedInUsername) {
                ws.send(JSON.stringify({
                    type: 'auto_login',
                    userId: result.loggedInUserId,
                    username: result.loggedInUsername
                }));
            } else {
                // ログイン情報がなければ、ログアウト状態としてUIを更新
                window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout'));
            }
        });
    };

    // 接続切断時の処理
    ws.onclose = () => {
        console.log(`WebSocket: Connection closed.`);
        // 意図しない切断の場合のみ再接続処理を行う
        if (window.TCG_ASSISTANT.ws === ws) { 
            window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout', { detail: { message: 'サーバーとの接続が切れました。再接続します...' }}));
            reconnectTimer = setTimeout(connectWebSocket, 5000); // 5秒後に再接続
        }
    };

    // エラー発生時の処理
    ws.onerror = (error) => console.error("WebSocket: Error:", error);
    
    // サーバーからメッセージ受信時の処理
    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log("WebSocket [main]: Received", message.type);
            // 受信したメッセージタイプに基づいてカスタムイベントを発行
            const eventType = `ws-${message.type}`;
            window.TCG_ASSISTANT.dispatchEvent(new CustomEvent(eventType, { detail: message }));
        } catch (e) {
            console.error("Error parsing WebSocket message:", e);
        }
    };
}

// --- ログイン状態管理 ---

/**
 * ログイン/自動ログインのレスポンスをハンドルする共通関数
 * @param {CustomEvent} e - イベントオブジェクト
 */
const handleLoginResponse = (e) => {
    if (e.detail.success) {
        window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginSuccess', { detail: e.detail }));
    } else {
        window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginFail', { detail: e.detail }));
    }
};

// WebSocketからの各種メッセージに対するリスナーを設定
window.TCG_ASSISTANT.addEventListener('ws-login_response', handleLoginResponse);
window.TCG_ASSISTANT.addEventListener('ws-auto_login_response', handleLoginResponse);
window.TCG_ASSISTANT.addEventListener('ws-logout_response', () => window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout')));
window.TCG_ASSISTANT.addEventListener('ws-logout_forced', (e) => window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout', { detail: e.detail })));

// ログイン成功イベントの処理
window.TCG_ASSISTANT.addEventListener('loginSuccess', (e) => {
    const data = e.detail;
    // グローバルステートにユーザー情報を設定
    // ★修正: バックエンドのキー名 (userId, displayName) に合わせる
    Object.assign(window.TCG_ASSISTANT, {
        isLoggedIn: true,
        currentUserId: data.userId,
        currentUsername: data.username,
        currentDisplayName: data.displayName,
        currentRate: data.rate,
        userMatchHistory: data.matchHistory || [],
        userMemos: data.memos || [],
        userBattleRecords: data.battleRecords || [],
        userRegisteredDecks: data.registeredDecks || []
    });
    // 手動ログインの場合のみ、ローカルストレージに情報を保存
    if (e.detail.type === 'login_response') {
        browser.storage.local.set({ loggedInUserId: data.userId, loggedInUsername: data.username });
    }
    // ログイン状態が変わったことを全コンポーネントに通知
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginStateChanged', { detail: { isLoggedIn: true } }));
});

// ログイン失敗イベントの処理
window.TCG_ASSISTANT.addEventListener('loginFail', (e) => {
    window.showCustomDialog('認証失敗', e.detail.message);
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout')); // 失敗時もlogoutイベントで状態をリセット
});

// ログアウトイベントの処理
window.TCG_ASSISTANT.addEventListener('logout', (e) => {
    if (e?.detail?.message && window.TCG_ASSISTANT.isSidebarOpen) {
         window.showCustomDialog('ログアウト', e.detail.message);
    }
    // グローバルステートを初期状態にリセット
    Object.assign(window.TCG_ASSISTANT, {
        isLoggedIn: false, currentUserId: null, currentUsername: null, currentDisplayName: null,
        currentRate: 1500, userMatchHistory: [], userMemos: [],
        userBattleRecords: [], userRegisteredDecks: []
    });
    // ローカルストレージからログイン情報を削除
    browser.storage.local.remove(['loggedInUserId', 'loggedInUsername']);
    // ログイン状態が変わったことを全コンポーネントに通知
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginStateChanged', { detail: { isLoggedIn: false } }));
});


// --- UI操作 ---

/**
 * カスタムダイアログ（ポップアップ）を表示する関数
 * @param {string} title - ダイアログのタイトル
 * @param {string} message - 表示するメッセージ
 * @param {boolean} isConfirm - 確認ダイアログ（キャンセルボタンあり）にするか
 * @returns {Promise<boolean>} - OKが押されたらtrue、キャンセルならfalseを返す
 */
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

/**
 * [★修正] 右側メニューの表示/非表示を切り替えるロジックを修正
 */
function updateMenuIconsVisibility() {
    const menuContainer = document.getElementById('tcg-right-menu-container');
    if (!menuContainer) return;
    
    // `expanded` クラスの付け外しでCSS側で表示を制御する
    if (window.TCG_ASSISTANT.isMenuIconsVisible) {
        menuContainer.classList.add('expanded');
    } else {
        menuContainer.classList.remove('expanded');
    }
}

/**
 * [★修正] 右側メニューのイベントリスナー設定を修正
 */
function createRightSideMenuAndAttachListeners() {
    const menuContainer = document.getElementById('tcg-right-menu-container');
    if (!menuContainer) return;

    menuContainer.querySelectorAll('.tcg-menu-icon').forEach(iconButton => {
        iconButton.addEventListener('click', (event) => toggleContentArea(event.currentTarget.dataset.section));
    });

    const toggleButton = document.getElementById('tcg-menu-toggle-button');
    toggleButton.addEventListener('click', () => {
        // isMenuIconsVisible の状態をトグルし、表示を更新
        window.TCG_ASSISTANT.isMenuIconsVisible = !window.TCG_ASSISTANT.isMenuIconsVisible;
        updateMenuIconsVisibility();
        // 状態をローカルストレージに保存
        browser.storage.local.set({ isMenuIconsVisible: window.TCG_ASSISTANT.isMenuIconsVisible });
    });
    
    // 起動時にローカルストレージから表示状態を復元
    browser.storage.local.get(['isMenuIconsVisible'], (result) => {
        // 保存された値がなければデフォルトで表示(true)
        window.TCG_ASSISTANT.isMenuIconsVisible = result.isMenuIconsVisible !== false;
        updateMenuIconsVisibility();
    });
}

/**
 * サイドバー（コンテンツエリア）の表示/非表示を切り替える
 * @param {string} sectionId - 表示するセクションのID
 * @param {boolean} forceOpen - 強制的に開くか
 */
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

/**
 * 指定されたセクションのHTMLとJSを読み込んで表示する
 * @param {string} sectionId - 表示するセクションのID
 */
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

    if (!targetSection.innerHTML) {
        try {
            const htmlPath = browser.runtime.getURL(`html/sections/${sectionId}.html`);
            const response = await fetch(htmlPath);
            if (!response.ok) throw new Error(`HTML load failed: ${response.status}`);
            targetSection.innerHTML = await response.text();
        } catch (error) {
            targetSection.innerHTML = `<p style="color: red;">セクションの読み込みに失敗しました。</p>`;
        }
    }

    const jsPath = `js/sections/${sectionId}.js`;
    const initFunctionName = `init${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}Section`;

    const injectAndInit = async () => {
        try {
            if (typeof window[initFunctionName] === 'function') {
                await window[initFunctionName]();
            } else {
                console.error(`Init function ${initFunctionName} not found.`);
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


// --- 初期化処理 ---

/**
 * 拡張機能のUIをページに注入する
 */
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

/**
 * 拡張機能のコア機能（カードデータ読み込み、WebSocket接続）を初期化
 */
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

// --- イベントリスナーとエントリーポイント ---

// background.jsやポップアップからのメッセージをリッスン
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "showSection") {
        toggleContentArea(request.section, true);
    } else if (request.action === "toggleSidebar") {
        const activeSection = document.querySelector('.tcg-menu-icon.active')?.dataset.section || 'home';
        toggleContentArea(activeSection);
    }
    sendResponse({success: true});
    return true; // 非同期でsendResponseを呼ぶ可能性があることを示す
});

// ページの読み込み状態に応じてUI注入処理を実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUIIntoPage);
} else {
    injectUIIntoPage();
}
