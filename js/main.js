// js/main.js

// Font AwesomeのCSSを注入してアイコンを使用できるようにします。
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
document.head.appendChild(link);

// 全カードデータを格納する変数 (グローバルで保持し、各セクションからアクセス可能にする)
// window.allCards として公開
window.allCards = [];

// サイドバーの開閉状態を記憶するための変数
let isSidebarOpen = false;
// メニューアイコンの表示状態を記憶するための変数
let isMenuIconsVisible = true; // デフォルトで表示

// サイドバーとメニューの幅を定義
const SIDEBAR_WIDTH = 500; // px (コンテンツエリアの幅)
const MENU_ICON_SIZE = 60; // px (各アイコンボタンのサイズ)
const TOGGLE_BUTTON_SIZE = 50; // px (メニュー開閉ボタンのサイズ)

// UIが既に挿入されたかどうかを追跡するフラグ
let uiInjected = false;

// Firebase関連のグローバル変数
window.firebaseApp = null;
window.db = null;
window.auth = null;
window.currentUserId = null; // Authenticated user ID

/**
 * Firebaseを初期化し、認証リスナーを設定します。
 */
async function initializeFirebase() {
    console.log("Firebase: Initializing Firebase...");
    try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

        if (Object.keys(firebaseConfig).length === 0) {
            console.error("Firebase: Firebase config is empty. Cannot initialize Firebase.");
            return;
        }

        // Firebaseアプリが既に初期化されているかチェック
        if (!window.firebaseApp) {
            window.firebaseApp = initializeApp(firebaseConfig);
            window.db = getFirestore(window.firebaseApp);
            window.auth = getAuth(window.firebaseApp);
            console.log("Firebase: App, Firestore, Auth initialized.");
        } else {
            console.log("Firebase: App already initialized.");
        }

        // 認証状態の変更をリッスン
        onAuthStateChanged(window.auth, async (user) => {
            if (user) {
                window.currentUserId = user.uid;
                console.log("Firebase: User signed in:", user.uid);
            } else {
                console.log("Firebase: No user signed in. Attempting anonymous or custom token sign-in.");
                try {
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await signInWithCustomToken(window.auth, __initial_auth_token);
                        window.currentUserId = window.auth.currentUser.uid;
                        console.log("Firebase: Signed in with custom token:", window.currentUserId);
                    } else {
                        await signInAnonymously(window.auth);
                        window.currentUserId = window.auth.currentUser.uid;
                        console.log("Firebase: Signed in anonymously:", window.currentUserId);
                    }
                } catch (error) {
                    console.error("Firebase: Anonymous or custom token sign-in failed:", error);
                    // 認証失敗時のフォールバックとしてランダムなIDを使用
                    window.currentUserId = crypto.randomUUID();
                    console.warn("Firebase: Using random UUID as userId due to auth failure:", window.currentUserId);
                }
            }
            // 認証が準備できたことを通知するカスタムイベントを発火
            document.dispatchEvent(new CustomEvent('firebaseAuthReady'));
            console.log("Firebase: Auth state changed. Dispatching firebaseAuthReady event.");
        });
    } catch (error) {
        console.error("Firebase: Failed to initialize Firebase:", error);
    }
}


/**
 * カスタムアラート/確認ダイアログを表示します。
 * この関数はグローバルスコープ (window) に公開されます。
 * @param {string} title - ダイアログのタイトル。
 * @param {string} message - ダイアログに表示するメッセージ。
 * @param {boolean} isConfirm - 確認ダイアログかどうか (trueの場合、OKとキャンセルボタンが表示されます)。
 * @returns {Promise<boolean>} - OKがクリックされた場合はtrue、キャンセルがクリックされた場合はfalseを解決するPromise。
 */
window.showCustomDialog = function(title, message, isConfirm = false) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('tcg-custom-dialog-overlay');
        const dialogTitle = document.getElementById('tcg-dialog-title');
        const dialogMessage = document.getElementById('tcg-dialog-message');
        const okButton = document.getElementById('tcg-dialog-ok-button');
        const cancelButton = document.getElementById('tcg-dialog-cancel-button');

        if (!overlay || !dialogTitle || !dialogMessage || !okButton || !cancelButton) {
            console.error("Custom dialog elements not found. Cannot show dialog.");
            return resolve(false); // エラー時はfalseを返す
        }

        dialogTitle.textContent = title;
        dialogMessage.innerHTML = message; // HTMLを許可するためにinnerHTMLを使用
        cancelButton.style.display = isConfirm ? 'inline-block' : 'none';

        // 既存のイベントリスナーを削除し、新しいものを追加
        const newOkButton = okButton.cloneNode(true);
        okButton.parentNode.replaceChild(newOkButton, okButton);
        const newCancelButton = cancelButton.cloneNode(true);
        cancelButton.parentNode.replaceChild(newCancelButton, cancelButton);

        newOkButton.addEventListener('click', () => {
            overlay.classList.remove('show');
            overlay.addEventListener('transitionend', () => overlay.style.display = 'none', { once: true });
            resolve(true);
        });

        if (isConfirm) {
            newCancelButton.addEventListener('click', () => {
                overlay.classList.remove('show');
                overlay.addEventListener('transitionend', () => overlay.style.display = 'none', { once: true });
                resolve(false);
            });
        }

        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('show'), 10);
    });
};


/**
 * メニューアイコンの表示状態を更新する関数
 * isMenuIconsVisibleの状態に基づいて、メニューコンテナの幅とアイコンラッパーの表示を制御します。
 */
function updateMenuIconsVisibility() {
    const menuContainer = document.getElementById('tcg-right-menu-container');
    const menuIconsWrapper = menuContainer ? menuContainer.querySelector('.tcg-menu-icons-wrapper') : null;
    const toggleButton = document.getElementById('tcg-menu-toggle-button');
    const toggleIcon = toggleButton ? toggleButton.querySelector('i') : null;

    if (!menuContainer || !menuIconsWrapper || !toggleIcon) {
        console.warn("Menu visibility elements not found for update. UI might not be fully loaded yet.");
        return;
    }

    if (isMenuIconsVisible) { // アイコンを表示し、コンテナを展開
        menuContainer.classList.remove('collapsed');
        menuContainer.classList.add('expanded');
        menuIconsWrapper.classList.remove('hidden');
        menuIconsWrapper.classList.add('visible');
        toggleIcon.classList.replace('fa-chevron-left', 'fa-chevron-right'); // 右矢印
    } else { // アイコンを隠し、コンテナを格納
        menuContainer.classList.remove('expanded');
        menuContainer.classList.add('collapsed');
        menuIconsWrapper.classList.remove('visible');
        menuIconsWrapper.classList.add('hidden');
        toggleIcon.classList.replace('fa-chevron-right', 'fa-chevron-left'); // 左矢印
    }
}

/**
 * 右サイドメニュー（アイコン群）を作成・挿入し、イベントリスナーを設定します。
 * この関数はUIがDOMに挿入された後に一度だけ呼び出されます。
 */
function createRightSideMenuAndAttachListeners() {
    const menuContainer = document.getElementById('tcg-right-menu-container');
    if (!menuContainer) {
        console.error("tcg-right-menu-container not found after UI injection. Cannot attach menu listeners.");
        return;
    }

    const menuIconsWrapper = menuContainer.querySelector('.tcg-menu-icons-wrapper');
    const menuIcons = menuIconsWrapper.querySelectorAll('.tcg-menu-icon');
    const toggleButton = document.getElementById('tcg-menu-toggle-button');

    // 各メニューアイコンにクリックイベントリスナーを設定
    menuIcons.forEach(iconButton => {
        iconButton.removeEventListener('click', handleMenuIconClick); // 以前のリスナーを削除
        iconButton.addEventListener('click', handleMenuIconClick);
    });

    // トグルボタンのイベントリスナーを設定
    toggleButton.removeEventListener('click', handleMenuToggleButtonClick); // 以前のリスナーを削除
    toggleButton.addEventListener('click', handleMenuToggleButtonClick);

    // メニューアイコンの表示状態をロードし、初期状態を適用
    chrome.storage.local.get(['isMenuIconsVisible'], (result) => {
        isMenuIconsVisible = result.isMenuIconsVisible !== undefined ? result.isMenuIconsVisible : true;
        updateMenuIconsVisibility();
    });

    // サイドバーの開閉状態とアクティブなセクションをロードし、UIを初期化
    chrome.storage.local.get(['isSidebarOpen', 'activeSection', 'isMenuIconsVisible'], (result) => {
        isSidebarOpen = result.isSidebarOpen !== undefined ? result.isSidebarOpen : false;
        const activeSection = result.activeSection || 'home'; // デフォルトはホーム
        isMenuIconsVisible = result.isMenuIconsVisible !== undefined ? result.isMenuIconsVisible : isSidebarOpen;

        const contentArea = document.getElementById('tcg-content-area');
        const gameCanvas = document.querySelector('canvas#unity-canvas'); // ゲームのcanvas要素

        // まず、すべてのメニューアイコンのアクティブ状態をリセット
        menuIcons.forEach(btn => btn.classList.remove('active'));

        // メニューコンテナの初期状態を適用
        updateMenuIconsVisibility();

        if (isSidebarOpen) {
            if (contentArea) {
                contentArea.classList.add('active');
                contentArea.style.right = '0px';
            }
            if (gameCanvas) {
                gameCanvas.style.display = 'block';
            }
            document.body.classList.remove('game-focused-mode');
            showSection(activeSection); // アクティブなセクションのコンテンツを表示
            const initialActiveIcon = menuContainer.querySelector(`.tcg-menu-icon[data-section="${activeSection}"]`);
            if (initialActiveIcon) {
                initialActiveIcon.classList.add('active');
            }
        } else {
            if (contentArea) {
                contentArea.classList.remove('active');
                contentArea.style.right = `-${SIDEBAR_WIDTH}px`;
            }
            if (gameCanvas) {
                gameCanvas.style.display = 'block';
            }
            document.body.classList.remove('game-focused-mode');
            const initialActiveIcon = menuContainer.querySelector(`.tcg-menu-icon[data-section="${activeSection}"]`);
            if (initialActiveIcon) {
                initialActiveIcon.classList.add('active');
            }
        }
    });
}

// メニューアイコンクリックハンドラ
function handleMenuIconClick(event) {
    const sectionId = event.currentTarget.dataset.section;
    // アリーナボタンがクリックされたら新しいタブで開く
    if (sectionId === 'arena') {
        window.open('https://anokorotcg-arena.vercel.app/', '_blank');
        return; // サイドバーは開かない
    }
    toggleContentArea(sectionId);
}

// メニュー開閉トグルボタンクリックハンドラ
function handleMenuToggleButtonClick() {
    isMenuIconsVisible = !isMenuIconsVisible;
    updateMenuIconsVisibility();
    chrome.storage.local.set({ isMenuIconsVisible: isMenuIconsVisible });
}


/**
 * コンテンツエリアの表示/非表示を切り替えます。
 * @param {string} sectionId - 表示するセクションのID。
 * @param {boolean} forceOpenSidebar - サイドバーが閉じている場合でも強制的に開くかどうか
 */
function toggleContentArea(sectionId, forceOpenSidebar = false) {
    const contentArea = document.getElementById('tcg-content-area');
    const rightMenuContainer = document.getElementById('tcg-right-menu-container');
    const gameCanvas = document.querySelector('canvas#unity-canvas');
    const menuIcons = rightMenuContainer ? rightMenuContainer.querySelectorAll('.tcg-menu-icon') : [];

    if (!contentArea || !rightMenuContainer) return;

    const currentActiveIcon = rightMenuContainer.querySelector('.tcg-menu-icon.active');
    const clickedIcon = rightMenuContainer.querySelector(`.tcg-menu-icon[data-section="${sectionId}"]`);

    // すべてのメニューアイコンのアクティブ状態を解除
    menuIcons.forEach(btn => btn.classList.remove('active'));

    // クリックされたアイコンが既にアクティブで、かつサイドバーが開いている場合は閉じる
    const isContentAreaActive = contentArea.classList.contains('active');
    const isSameIconAlreadyActiveAndClicked = isContentAreaActive && (currentActiveIcon && currentActiveIcon.dataset.section === sectionId);

    if (isSameIconAlreadyActiveAndClicked && !forceOpenSidebar) { // forceOpenSidebar が true の場合は閉じない
        contentArea.classList.remove('active');
        contentArea.style.right = `-${SIDEBAR_WIDTH}px`;
        isMenuIconsVisible = false;
        updateMenuIconsVisibility();
        if (gameCanvas) gameCanvas.style.display = 'block';
        document.body.classList.remove('game-focused-mode');
        isSidebarOpen = false;
        chrome.storage.local.set({ isSidebarOpen: isSidebarOpen, isMenuIconsVisible: isMenuIconsVisible });
    } else {
        // サイドバーを開く、または別のセクションに切り替える
        contentArea.classList.add('active');
        contentArea.style.right = '0px';
        isMenuIconsVisible = true;
        updateMenuIconsVisibility();
        if (gameCanvas) gameCanvas.style.display = 'block';
        document.body.classList.remove('game-focused-mode');
        isSidebarOpen = true;
        chrome.storage.local.set({ isSidebarOpen: isSidebarOpen, activeSection: sectionId, isMenuIconsVisible: isMenuIconsVisible });

        showSection(sectionId); // ターゲットセクションのコンテンツを表示

        if (clickedIcon) {
            clickedIcon.classList.add('active');
        }
    }
}

// 各セクションのJavaScriptファイルを追跡するためのセット
// これにより同じスクリプトが複数回注入されるのを防ぐ
if (!window._injectedSectionScripts) {
    window._injectedSectionScripts = new Set();
}

/**
 * 指定されたセクションを表示し、他のセクションを非表示にします。
 * @param {string} sectionId - 表示するセクションのID (例: "home", "rateMatch")。
 */
async function showSection(sectionId) {
    // アリーナセクションはHTMLとしてロードしない
    if (sectionId === 'arena') {
        // アリーナボタンがクリックされたら新しいタブで開くロジックは handleMenuIconClick で処理済み
        // ここでは何もしないか、エラーログを出力しないようにする
        console.log("Arena section is handled by opening a new tab. No HTML to load.");
        return; 
    }

    // すべてのセクションを非アクティブにする
    document.querySelectorAll('.tcg-section').forEach(section => {
        section.classList.remove('active');
    });

    // ターゲットセクションのコンテナ
    const tcgSectionsWrapper = document.getElementById('tcg-sections-wrapper');
    let targetSection = document.getElementById(`tcg-${sectionId}-section`);

    // セクションコンテナが存在しない場合は動的に作成
    if (!targetSection) {
        targetSection = document.createElement('div');
        targetSection.id = `tcg-${sectionId}-section`;
        targetSection.className = 'tcg-section';
        if (tcgSectionsWrapper) {
            tcgSectionsWrapper.appendChild(targetSection);
        } else {
            console.error("tcg-sections-wrapper not found. Cannot append new section.");
            return;
        }
    }

    // セクションのHTMLをロード
    try {
        const htmlPath = chrome.runtime.getURL(`html/sections/${sectionId}.html`);
        const response = await fetch(htmlPath);
        if (!response.ok) {
            throw new Error(`Failed to load HTML for ${sectionId}: ${response.statusText} (${response.status})`);
        }
        const htmlContent = await response.text();
        targetSection.innerHTML = htmlContent;
    } catch (error) {
        console.error(`Error loading HTML for section ${sectionId}:`, error);
        targetSection.innerHTML = `<p style="color: red;">セクションの読み込みに失敗しました: ${sectionId}<br>エラー: ${error.message}</p>`;
        return;
    }

    // 各セクションのJavaScriptを動的に注入
    // jsPath は background.js に渡すための相対パス
    const jsPath = `js/sections/${sectionId}.js`; 
    const initFunctionName = `init${sectionId.charAt(0).toUpperCase() + sectionId.slice(1).replace(/-([a-z])/g, (g) => g[1].toUpperCase())}Section`;

    // スクリプトがまだ注入されていない場合のみ注入
    if (!window._injectedSectionScripts.has(jsPath)) {
        try {
            // background.js にメッセージを送信してスクリプト注入を依頼
            chrome.runtime.sendMessage({
                action: "injectSectionScript",
                scriptPath: jsPath,
                initFunctionName: initFunctionName
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Error injecting script via background:", chrome.runtime.lastError.message);
                    return;
                }
                if (response && response.success) {
                    window._injectedSectionScripts.add(jsPath); // 注入済みとしてマーク
                    console.log(`Script ${jsPath} injected and ${initFunctionName} called via background.js.`);
                } else {
                    console.error(`Failed to inject script ${jsPath}: ${response ? response.error : 'Unknown error'}`);
                }
            });
        } catch (error) {
            console.error(`Failed to send message to background for script injection for section ${sectionId}:`, error);
        }
    } else {
        // 既にスクリプトが注入されている場合は、初期化関数を再実行
        // DOMが更新された後にイベントリスナーを再アタッチするため
        setTimeout(() => {
            if (typeof window[initFunctionName] === 'function') {
                console.log(`Re-calling ${initFunctionName} for already injected section ${sectionId}.`);
                // allCards は main.js のグローバル変数としてアクセス可能
                // showCustomDialog は main.js のグローバル関数としてアクセス可能
                window[initFunctionName](); // 引数を削除
            } else {
                console.error(`Initialization function ${initFunctionName} NOT found on window object for already injected script for section ${sectionId}. This indicates a scoping issue or the function is not exposed globally.`);
            }
        }, 0);
    }

    // 指定されたセクションをアクティブにする
    targetSection.classList.add('active');

    // アクティブなセクションを保存
    chrome.storage.local.set({ activeSection: sectionId });
}

/**
 * セクションIDに対応するタイトルを取得します。
 * @param {string} sectionId - セクションのID。
 * @returns {string} セクションの表示タイトル。
 */
function getSectionTitle(sectionId) {
    switch (sectionId) {
        case 'home': return 'ホーム';
        case 'rateMatch': return 'レート戦';
        case 'memo': return 'メモ';
        case 'search': return '検索';
        case 'minigames': return 'ミニゲーム';
        case 'battleRecord': return '戦いの記録';
        // case 'deckAnalysis': return 'デッキ分析'; // デッキ分析は削除
        case 'arena': return 'アリーナ'; // アリーナセクションのタイトル
        default: return 'あの頃の自作TCGアシスタント';
    }
}


/**
 * 拡張機能のUIをウェブページに挿入します。
 * この関数は一度だけ実行されることを保証します。
 */
async function injectUIIntoPage() {
    if (uiInjected) {
        return;
    }

    try {
        // UIのHTML構造を文字列として定義
        const uiHtml = `
            <div id="tcg-right-menu-container">
                <div class="tcg-menu-icons-wrapper">
                    <button class="tcg-menu-icon" data-section="home" title="ホーム"><i class="fas fa-home"></i></button>
                    <button class="tcg-menu-icon" data-section="rateMatch" title="レート戦"><i class="fas fa-fist-raised"></i></button>
                    <button class="tcg-menu-icon" data-section="memo" title="メモ"><i class="fas fa-clipboard"></i></button>
                    <button class="tcg-menu-icon" data-section="search" title="検索"><i class="fas fa-search"></i></button>
                    <button class="tcg-menu-icon" data-section="minigames" title="ミニゲーム"><i class="fas fa-gamepad"></i></button>
                    <button class="tcg-menu-icon" data-section="battleRecord" title="戦いの記録"><i class="fas fa-trophy"></i></button>
                </div>
                <button class="tcg-menu-toggle-button" id="tcg-menu-toggle-button" title="メニューを隠す/表示">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>

            <div id="tcg-content-area">
                <div id="tcg-sections-wrapper">
                    <div id="tcg-home-section" class="tcg-section"></div>
                    <div id="tcg-rateMatch-section" class="tcg-section"></div>
                    <div id="tcg-memo-section" class="tcg-section"></div>
                    <div id="tcg-search-section" class="tcg-section"></div>
                    <div id="tcg-minigames-section" class="tcg-section"></div>
                    <div id="tcg-battleRecord-section" class="tcg-section"></div>
                </div>
            </div>

            <div id="tcg-custom-dialog-overlay" class="tcg-modal-overlay" style="display: none;">
                <div class="tcg-modal-content">
                    <h3 id="tcg-dialog-title"></h3>
                    <p id="tcg-dialog-message"></p>
                    <button id="tcg-dialog-ok-button">OK</button>
                    <button id="tcg-dialog-cancel-button" style="margin-left: 10px; background-color: #6c757d; display: none;">キャンセル</button>
                </div>
            </div>
        `;

        // 一時的なコンテナを作成し、HTMLコンテンツを解析
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = uiHtml;

        // bodyの既存コンテンツを保持しつつ、UIを挿入する
        const bodyOriginalContent = Array.from(document.body.childNodes);
        document.body.innerHTML = '';

        while (tempDiv.firstChild) {
            document.body.appendChild(tempDiv.firstChild);
        }

        bodyOriginalContent.forEach(node => {
            document.body.appendChild(node);
        });
        
        uiInjected = true;
        console.log("main.js: UI injected into page. Elements referenced.");

        // Firebase初期化をここで行う
        await initializeFirebase(); // Firebaseの初期化が完了するのを待つ

        createRightSideMenuAndAttachListeners();
        initializeExtensionFeatures();

        chrome.storage.local.get(['activeSection'], (result) => {
            const activeSection = result.activeSection || 'home';
            showSection(activeSection);
        });

    } catch (error) {
        console.error("Failed to inject UI into page:", error);
    }
}

/**
 * 拡張機能の各種機能を初期化し、イベントリスナーを設定します。
 * この関数は一度だけ呼び出されます。
 */
async function initializeExtensionFeatures() {
    console.log("main.js: Initializing extension features...");
    try {
        const response = await fetch(chrome.runtime.getURL('json/cards.json'));
        window.allCards = await response.json();
        if (!Array.isArray(window.allCards) || window.allCards.length === 0) {
            console.warn("main.js: カードデータが空または無効です。一部機能が制限される可能性があります。");
        } else {
            console.log(`main.js: ${window.allCards.length} cards loaded into window.allCards.`);
        }
    } catch (error) {
        console.error("main.js: カードデータのロードに失敗しました:", error);
    }
}

// DOMが完全にロードされるのを待ってから要素を注入し、機能を初期化します。
// Firebaseの初期化が非同期になったため、DOMContentLoaded後にUI注入とFirebase初期化を行う
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        injectUIIntoPage();
    });
} else {
    injectUIIntoPage();
}

// popup.jsからのメッセージを受け取るリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "showSection") {
        toggleContentArea(request.section, request.forceOpenSidebar);
    } else if (request.action === "toggleSidebar") {
        const contentArea = document.getElementById('tcg-content-area');
        const rightMenuContainer = document.getElementById('tcg-right-menu-container');
        const gameCanvas = document.querySelector('canvas#unity-canvas');

        if (!contentArea || !rightMenuContainer) return;

        if (contentArea.classList.contains('active')) {
            contentArea.classList.remove('active');
            contentArea.style.right = `-${SIDEBAR_WIDTH}px`;
            isSidebarOpen = false;
            isMenuIconsVisible = false;
            updateMenuIconsVisibility();
        } else {
            contentArea.classList.add('active');
            contentArea.style.right = '0px';
            isSidebarOpen = true;
            isMenuIconsVisible = true;
            updateMenuIconsVisibility();

            chrome.storage.local.get(['activeSection'], (result) => {
                const activeSection = result.activeSection || 'home';
                const initialActiveIcon = rightMenuContainer.querySelector(`.tcg-menu-icon[data-section="${activeSection}"]`);
                rightMenuContainer.querySelectorAll('.tcg-menu-icon').forEach(btn => btn.classList.remove('active'));
                if (initialActiveIcon) {
                    initialActiveIcon.classList.add('active');
                }
                showSection(activeSection);
            });
        }
        chrome.storage.local.set({ isSidebarOpen: isSidebarOpen, isMenuIconsVisible: isMenuIconsVisible });
    } else if (request.action === "matchFound") {
        console.log("main.js: Match found message received from background. Triggering dialog and sidebar.");
        window.showCustomDialog('対戦相手決定', `対戦相手が決まりました！対戦を開始しましょう！`);
        toggleContentArea('rateMatch', true);
    }
});

// Firebaseのインポート (main.jsのスコープ内で)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

