// js/main.js (コンテンツスクリプトのメインファイル) - 修正版 v2.1

console.log("main.js: Script loaded (v2.1).");

// Font AwesomeのCSSをウェブページに注入
const fontAwesomeLink = document.createElement('link');
fontAwesomeLink.rel = 'stylesheet';
fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
document.head.appendChild(fontAwesomeLink);

// Firefox互換性のためのbrowserオブジェクトのフォールバック
if (typeof browser === 'undefined') {
    var browser = chrome;
}

// --- グローバルな状態管理オブジェクト ---
// 拡張機能全体で共有する状態を一つのオブジェクトにまとめる
window.TCG_ASSISTANT = {
    allCards: [],
    // ★修正点: データロード完了を待つためのPromiseを追加
    cardDataReady: null,
    // ログイン状態
    currentUserId: null,
    currentUsername: null,
    currentDisplayName: null,
    currentRate: 1500,
    // ユーザーデータ
    userMatchHistory: [],
    userMemos: [],
    userBattleRecords: [],
    userRegisteredDecks: [],
    // WebSocketインスタンス
    ws: null,
    // UIの状態
    isSidebarOpen: false,
    isMenuIconsVisible: true,
    // 注入済みスクリプトの追跡
    _injectedSectionScripts: new Set()
};
console.log("main.js: TCG_ASSISTANT namespace initialized.");


// --- WebSocket 接続管理 ---
const RENDER_WS_URL = 'wss://anokoro-tcg-api.onrender.com';
let reconnectInterval = 5000; // 5秒後に再接続

function connectWebSocket() {
    // 既に接続中または接続済みの場合は何もしない
    if (window.TCG_ASSISTANT.ws && (window.TCG_ASSISTANT.ws.readyState === WebSocket.OPEN || window.TCG_ASSISTANT.ws.readyState === WebSocket.CONNECTING)) {
        console.log("WebSocket: Connection already active or connecting.");
        return;
    }

    console.log("WebSocket: Attempting to connect to " + RENDER_WS_URL);
    window.TCG_ASSISTANT.ws = new WebSocket(RENDER_WS_URL);

    window.TCG_ASSISTANT.ws.onopen = () => {
        console.log("WebSocket: Connection established.");
        reconnectInterval = 5000; // 接続成功時に再接続間隔をリセット
        // 接続後、ローカルストレージに保存されたログイン情報があれば自動ログインを試みる
        browser.storage.local.get(['loggedInUserId', 'loggedInUsername'], (result) => {
            if (result.loggedInUserId && result.loggedInUsername) {
                window.TCG_ASSISTANT.ws.send(JSON.stringify({
                    type: 'auto_login',
                    userId: result.loggedInUserId,
                    username: result.loggedInUsername
                }));
            } else {
                // ログイン情報がない場合はUIを更新
                 if (window.updateUIState) window.updateUIState();
            }
        });
    };

    window.TCG_ASSISTANT.ws.onclose = () => {
        console.log(`WebSocket: Connection closed. Attempting to reconnect in ${reconnectInterval / 1000} seconds.`);
        window.TCG_ASSISTANT.ws = null; // wsインスタンスをクリア
        // 接続が閉じたときにUIを未接続状態に更新
        if (window.handleLogoutOnDisconnect) window.handleLogoutOnDisconnect();
        setTimeout(connectWebSocket, reconnectInterval);
    };

    window.TCG_ASSISTANT.ws.onerror = (error) => {
        console.error("WebSocket: Error occurred:", error);
        window.TCG_ASSISTANT.ws.close(); // エラー発生時に接続を閉じて再接続をトリガー
    };

    // onmessageハンドラは各セクション、特にrateMatch.jsで設定される
}


/**
 * カスタムアラート/確認ダイアログを表示します。
 * @param {string} title - ダイアログのタイトル。
 * @param {string} message - ダイアログに表示するメッセージ（HTML可）。
 * @param {boolean} isConfirm - 確認ダイアログかどうか。
 * @returns {Promise<boolean>} - OK/キャンセルの結果。
 */
window.showCustomDialog = function(title, message, isConfirm = false) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('tcg-custom-dialog-overlay');
        const dialogTitle = document.getElementById('tcg-dialog-title');
        const dialogMessage = document.getElementById('tcg-dialog-message');
        const okButton = document.getElementById('tcg-dialog-ok-button');
        const cancelButton = document.getElementById('tcg-dialog-cancel-button');

        if (!overlay || !dialogTitle || !dialogMessage || !okButton || !cancelButton) {
            console.error("Custom Dialog: Elements not found.");
            return resolve(false);
        }

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
 * メニューアイコンの表示状態を更新する関数。
 */
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

/**
 * 右サイドメニューを作成・挿入し、イベントリスナーを設定します。
 */
function createRightSideMenuAndAttachListeners() {
    const menuContainer = document.getElementById('tcg-right-menu-container');
    if (!menuContainer) return;

    menuContainer.querySelectorAll('.tcg-menu-icon').forEach(iconButton => {
        iconButton.addEventListener('click', (event) => {
            const sectionId = event.currentTarget.dataset.section;
            toggleContentArea(sectionId);
        });
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

/**
 * コンテンツエリア（サイドバー）の表示/非表示を切り替えます。
 * @param {string} sectionId - 表示するセクションのID。
 * @param {boolean} forceOpen - 強制的に開くか。
 */
window.toggleContentArea = function(sectionId, forceOpen = false) {
    const contentArea = document.getElementById('tcg-content-area');
    const menuContainer = document.getElementById('tcg-right-menu-container');
    if (!contentArea || !menuContainer) return;

    const currentActiveIcon = menuContainer.querySelector('.tcg-menu-icon.active');
    const clickedIcon = menuContainer.querySelector(`.tcg-menu-icon[data-section="${sectionId}"]`);
    const isSameIcon = currentActiveIcon === clickedIcon;

    if (window.TCG_ASSISTANT.isSidebarOpen && isSameIcon && !forceOpen) {
        // 同じアイコンをクリックして閉じる
        contentArea.classList.remove('active');
        window.TCG_ASSISTANT.isSidebarOpen = false;
        currentActiveIcon.classList.remove('active');
    } else {
        // サイドバーを開く、またはセクションを切り替える
        contentArea.classList.add('active');
        window.TCG_ASSISTANT.isSidebarOpen = true;
        
        if (currentActiveIcon) currentActiveIcon.classList.remove('active');
        if (clickedIcon) clickedIcon.classList.add('active');

        showSection(sectionId);
    }
    browser.storage.local.set({ isSidebarOpen: window.TCG_ASSISTANT.isSidebarOpen, activeSection: sectionId });
};

/**
 * 指定されたセクションのHTMLをロードし、対応するJSを初期化します。
 * @param {string} sectionId - 表示するセクションのID。
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

    try {
        const htmlPath = browser.runtime.getURL(`html/sections/${sectionId}.html`);
        const response = await fetch(htmlPath);
        if (!response.ok) throw new Error(`HTML load failed: ${response.status}`);
        targetSection.innerHTML = await response.text();
    } catch (error) {
        console.error(`Error loading section ${sectionId}:`, error);
        targetSection.innerHTML = `<p style="color: red;">セクションの読み込みに失敗しました。</p>`;
        targetSection.classList.add('active');
        return;
    }

    const jsPath = `js/sections/${sectionId}.js`;
    const initFunctionName = `init${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}Section`;

    if (!window.TCG_ASSISTANT._injectedSectionScripts.has(jsPath)) {
        browser.runtime.sendMessage({
            action: "injectSectionScript",
            scriptPath: jsPath,
            initFunctionName: initFunctionName
        }, (response) => {
            if (response?.success) {
                window.TCG_ASSISTANT._injectedSectionScripts.add(jsPath);
            } else {
                console.error(`Failed to inject script ${jsPath}:`, response?.error);
            }
        });
    } else {
        if (typeof window[initFunctionName] === 'function') {
            // ★修正点: 初期化関数を非同期で呼び出す
            (async () => {
                try {
                    await window[initFunctionName]();
                } catch (e) {
                    console.error(`Error re-initializing section ${sectionId}:`, e);
                }
            })();
        } else {
            console.error(`Init function ${initFunctionName} not found.`);
        }
    }
    targetSection.classList.add('active');
    browser.storage.local.set({ activeSection: sectionId });
};

/**
 * 拡張機能のUIをページに挿入します。
 */
async function injectUIIntoPage() {
    if (document.getElementById('tcg-assistant-container')) return;

    const uiContainer = document.createElement('div');
    uiContainer.id = 'tcg-assistant-container';
    
    try {
        // index.htmlはUIの骨格だけなので、main.js内で定義する方が管理しやすい
        uiContainer.innerHTML = `
            <div id="tcg-right-menu-container" class="collapsed">
                <div class="tcg-menu-icons-wrapper hidden">
                    <button class="tcg-menu-icon" data-section="home" title="ホーム"><i class="fas fa-home"></i></button>
                    <button class="tcg-menu-icon" data-section="rateMatch" title="レート戦"><i class="fas fa-fist-raised"></i></button>
                    <button class="tcg-menu-icon" data-section="memo" title="メモ"><i class="fas fa-clipboard"></i></button>
                    <button class="tcg-menu-icon" data-section="search" title="検索"><i class="fas fa-search"></i></button>
                    <button class="tcg-menu-icon" data-section="minigames" title="ミニゲーム"><i class="fas fa-gamepad"></i></button>
                    <button class="tcg-menu-icon" data-section="battleRecord" title="戦いの記録"><i class="fas fa-trophy"></i></button>
                </div>
                <button class="tcg-menu-toggle-button" id="tcg-menu-toggle-button" title="メニューを開く/閉じる">
                    <i class="fas fa-chevron-left"></i>
                </button>
            </div>
            <div id="tcg-content-area">
                <div id="tcg-sections-wrapper"></div>
            </div>
            <div id="tcg-custom-dialog-overlay">
                <div class="tcg-modal-content">
                    <h3 id="tcg-dialog-title"></h3>
                    <p id="tcg-dialog-message"></p>
                    <div class="tcg-dialog-buttons">
                      <button id="tcg-dialog-ok-button">OK</button>
                      <button id="tcg-dialog-cancel-button" style="display: none;">キャンセル</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(uiContainer);
        
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
 * 拡張機能のコア機能を初期化します。
 */
function initializeExtensionFeatures() {
    console.log("Features: Initializing...");

    // ★修正点: Promiseを使ってデータロードの完了を管理
    window.TCG_ASSISTANT.cardDataReady = new Promise(async (resolve, reject) => {
        try {
            const response = await fetch(browser.runtime.getURL('json\cards.json'));
            if (!response.ok) {
                throw new Error(`Failed to fetch cards.json: ${response.statusText}`);
            }
            window.TCG_ASSISTANT.allCards = await response.json();
            console.log(`Features: ${window.TCG_ASSISTANT.allCards.length} cards loaded.`);
            resolve(); // データロード完了を通知
        } catch (error) {
            console.error("Features: Failed to load card data:", error);
            window.showCustomDialog('エラー', `カードデータのロードに失敗しました: ${error.message}`);
            reject(error); // 失敗を通知
        }
    });

    // WebSocket接続を開始
    connectWebSocket();
}

// --- メッセージリスナー ---
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "showSection") {
        toggleContentArea(request.section, true);
    } else if (request.action === "toggleSidebar") {
        const activeSection = document.querySelector('.tcg-menu-icon.active')?.dataset.section || 'home';
        toggleContentArea(activeSection);
    }
    return true;
});


// --- 初期化実行 ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUIIntoPage);
} else {
    injectUIIntoPage();
}
