// js/main.js (コンテンツスクリプトのメインファイル) - 修正版 v2.6

console.log("main.js: Script loaded (v2.6).");

// FontAwesome（アイコン表示用）のスタイルシートを読み込み
const fontAwesomeLink = document.createElement('link');
fontAwesomeLink.rel = 'stylesheet';
fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
document.head.appendChild(fontAwesomeLink);

// ブラウザ差異を吸収 (Chromeでは `browser` が未定義のため)
if (typeof browser === 'undefined') {
    var browser = chrome;
}

// --- グローバルアプリケーションステート管理 ---
class TcgAssistantApp extends EventTarget {
    constructor() {
        super();
        this.allCards = [];
        this.cardDataReady = null; // カードデータがロード完了したことを示すPromise
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
        this.isMenuIconsVisible = true;
        this._injectedSectionScripts = new Set(); // 読み込み済みのセクションスクリプトを記録
    }
}
// グローバルな `window` オブジェクトにアプリケーションインスタンスを配置
window.TCG_ASSISTANT = new TcgAssistantApp();
console.log("main.js: TCG_ASSISTANT EventTarget namespace initialized.");

// --- WebSocket通信 ---
const RENDER_WS_URL = 'wss://anokoro-tcg-api.onrender.com';
let reconnectInterval = 5000; // 再接続試行の間隔 (ミリ秒)

function connectWebSocket() {
    // 既に接続中または接続試行中の場合は何もしない
    if (window.TCG_ASSISTANT.ws && (window.TCG_ASSISTANT.ws.readyState === WebSocket.OPEN || window.TCG_ASSISTANT.ws.readyState === WebSocket.CONNECTING)) {
        return;
    }
    console.log("WebSocket: Attempting to connect...");
    window.TCG_ASSISTANT.ws = new WebSocket(RENDER_WS_URL);

    // 接続成功時の処理
    window.TCG_ASSISTANT.ws.onopen = () => {
        console.log("WebSocket: Connection established.");
        reconnectInterval = 5000; // 接続成功したら再接続間隔をリセット
        // ローカルストレージからログイン情報を取得し、自動ログインを試行
        browser.storage.local.get(['loggedInUserId', 'loggedInUsername'], (result) => {
            if (result.loggedInUserId && result.loggedInUsername) {
                window.TCG_ASSISTANT.ws.send(JSON.stringify({
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
    window.TCG_ASSISTANT.ws.onclose = () => {
        console.log(`WebSocket: Connection closed. Reconnecting in ${reconnectInterval / 1000}s.`);
        window.TCG_ASSISTANT.ws = null;
        // ログアウトイベントを発行し、UIを「未接続」状態にする
        window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout', { detail: { message: 'サーバーとの接続が切れました。' }}));
        setTimeout(connectWebSocket, reconnectInterval); // 一定時間後に再接続を試みる
    };

    // エラー発生時の処理
    window.TCG_ASSISTANT.ws.onerror = (error) => {
        console.error("WebSocket: Error:", error);
        window.TCG_ASSISTANT.ws.close(); // エラー時は接続を閉じる
    };

    // サーバーからメッセージ受信時の処理
    window.TCG_ASSISTANT.ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log("WebSocket [main]: Received", message.type);
            // 受信したメッセージタイプに基づいてカスタムイベントを発行
            // 例: `ws-login_response`, `ws-match_found` など
            const eventType = `ws-${message.type}`;
            window.TCG_ASSISTANT.dispatchEvent(new CustomEvent(eventType, { detail: message }));
        } catch (e) {
            console.error("Error parsing WebSocket message:", e);
        }
    };
}

// --- ログイン状態管理ロジック ---

// ログイン/自動ログインのレスポンスをハンドルする共通関数
const handleLoginResponse = (e) => {
    if (e.detail.success) {
        // 成功時は loginSuccess イベントを発行
        window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginSuccess', { detail: e.detail }));
    } else {
        // 失敗時は loginFail イベントを発行
        window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginFail', { detail: e.detail }));
    }
};

// WebSocketからのログイン関連メッセージにリスナーを設定
window.TCG_ASSISTANT.addEventListener('ws-login_response', handleLoginResponse);
window.TCG_ASSISTANT.addEventListener('ws-auto_login_response', handleLoginResponse);

// ログアウト関連のメッセージにリスナーを設定
window.TCG_ASSISTANT.addEventListener('ws-logout_response', (e) => {
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout', { detail: e.detail }));
});
window.TCG_ASSISTANT.addEventListener('ws-logout_forced', (e) => {
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout', { detail: e.detail }));
});

// loginSuccess イベントの処理
window.TCG_ASSISTANT.addEventListener('loginSuccess', (e) => {
    const data = e.detail;
    // グローバルステートにユーザー情報を設定
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
    if (data.type === 'login_response') {
        browser.storage.local.set({ loggedInUserId: data.userId, loggedInUsername: data.username });
    }
    // ★★★ 修正点 ★★★
    // ログイン状態が変わったことを全コンポーネントに通知する
    // これにより、各セクションが自身の表示を更新できるようになる
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginStateChanged', {
        detail: { isLoggedIn: true, userData: data }
    }));
});

// loginFail イベントの処理
window.TCG_ASSISTANT.addEventListener('loginFail', (e) => {
    window.showCustomDialog('認証失敗', e.detail.message);
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout')); // 失敗時もlogoutイベントで状態をリセット
});

// logout イベントの処理
window.TCG_ASSISTANT.addEventListener('logout', (e) => {
    // ログアウトメッセージがあればダイアログで表示
    if (e?.detail?.message && window.TCG_ASSISTANT.isSidebarOpen) {
         window.showCustomDialog('ログアウト', e.detail.message);
    }
    // グローバルステートを初期状態にリセット
    Object.assign(window.TCG_ASSISTANT, {
        isLoggedIn: false,
        currentUserId: null, currentUsername: null, currentDisplayName: null,
        currentRate: 1500, userMatchHistory: [], userMemos: [],
        userBattleRecords: [], userRegisteredDecks: []
    });
    // ローカルストレージからログイン情報を削除
    browser.storage.local.remove(['loggedInUserId', 'loggedInUsername']);
    // ★★★ 修正点 ★★★
    // ログイン状態が変わったことを全コンポーネントに通知する
    window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginStateChanged', {
        detail: { isLoggedIn: false }
    }));
});


// --- UI操作と表示ロジック ---

// カスタムダイアログ表示関数
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

// 右側メニューアイコンの表示/非表示を切り替え
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

// 右側メニューのUIを生成し、イベントリスナーを設定
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

// サイドバーの表示/非表示を切り替え
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

// 指定されたセクションのHTMLとJSを読み込んで表示
window.showSection = async function(sectionId) {
    const tcgSectionsWrapper = document.getElementById('tcg-sections-wrapper');
    if (!tcgSectionsWrapper) return;

    // すべてのセクションを一旦非表示に
    document.querySelectorAll('.tcg-section').forEach(s => s.classList.remove('active'));
    
    // 対象セクションのコンテナ要素を取得または生成
    let targetSection = document.getElementById(`tcg-${sectionId}-section`);
    if (!targetSection) {
        targetSection = document.createElement('div');
        targetSection.id = `tcg-${sectionId}-section`;
        targetSection.className = 'tcg-section';
        tcgSectionsWrapper.appendChild(targetSection);
    }

    // セクションのHTMLを読み込み (初回のみ)
    if (!targetSection.innerHTML) {
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
    }

    // セクションのJSを読み込み、初期化関数を実行
    const jsPath = `js/sections/${sectionId}.js`;
    const initFunctionName = `init${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}Section`;

    const injectAndInit = async () => {
        try {
            // 初期化関数が利用可能になるまで少し待つ (スクリプトの読み込みタイミングによる)
            let attempts = 0;
            const maxAttempts = 50;
            while (typeof window[initFunctionName] !== 'function' && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            // 初期化関数を実行
            if (typeof window[initFunctionName] === 'function') {
                await window[initFunctionName]();
            } else {
                console.error(`Init function ${initFunctionName} not found after waiting.`);
            }
        } catch(e) {
            console.error(`Error initializing section ${sectionId}:`, e);
        }
    };

    // ★★★ スクリプト注入エラーに関する注記 ★★★
    // ログにあった `non-structured-clonable data` エラーは、多くの場合、バックグラウンドスクリプト(background.js)が
    // スクリプトを注入する際に、シリアライズ不可能なデータ（関数やPromiseなど）を返そうとすることが原因です。
    // この `main.js` のコード自体は問題ない可能性が高いです。
    // 解決策は、バックグラウンドスクリプト側で `browser.scripting.executeScript` の結果が
    // シリアライズ可能な値になるようにするか、または `injectSectionScript` のメッセージハンドラが
    // `sendResponse` で何も返さないようにすることです。
    if (!window.TCG_ASSISTANT._injectedSectionScripts.has(jsPath)) {
        // バックグラウンドスクリプトにスクリプト注入を依頼
        browser.runtime.sendMessage({ action: "injectSectionScript", scriptPath: jsPath }, (response) => {
            if (browser.runtime.lastError || !response?.success) {
                console.error(`Failed to inject script ${jsPath}:`, browser.runtime.lastError?.message || response?.error);
                return;
            }
            window.TCG_ASSISTANT._injectedSectionScripts.add(jsPath);
            injectAndInit();
        });
    } else {
        // 既に注入済みの場合は初期化関数を直接呼ぶ
        await injectAndInit();
    }
    targetSection.classList.add('active');
};


// --- 初期化処理 ---

// 拡張機能のUIをページに注入する
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
        
        // UI注入後に各種機能を初期化
        createRightSideMenuAndAttachListeners();
        await initializeExtensionFeatures();

        // 前回開いていたセクションを復元
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

// 拡張機能のコア機能（カードデータ読み込み、WebSocket接続）を初期化
function initializeExtensionFeatures() {
    console.log("Features: Initializing...");
    // カードデータをJSONファイルから非同期で読み込む
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
    // WebSocket接続を開始
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
    } else if (request.action === "command") {
        // キーボードショートカットなどのコマンドを処理
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
    return true; // 非同期でsendResponseを呼ぶ可能性があることを示す
});

// ページの読み込み状態に応じてUI注入処理を実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUIIntoPage);
} else {
    injectUIIntoPage();
}
