// js/main.js (コンテンツスクリプトのメインファイル)

console.log("main.js: Script loaded."); // スクリプトがロードされたことを確認

// Font AwesomeのCSSをウェブページに注入してアイコンを使用できるようにします。
// これはcontent_scriptsのcssプロパティでも可能ですが、動的な制御のためにJSで注入
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
document.head.appendChild(link);
console.log("main.js: Font Awesome CSS link added.");

// Firefox互換性のためのbrowserオブジェクトのフォールバック
// Chrome環境ではchromeオブジェクトが、Firefox環境ではbrowserオブジェクトが使用される
if (typeof browser === 'undefined') {
    var browser = chrome;
    console.log("main.js: 'browser' object aliased to 'chrome' for compatibility.");
} else {
    console.log("main.js: 'browser' object natively available.");
}

// --- グローバル変数定義 ---
// 全カードデータを格納する変数 (各セクションからアクセス可能にするためwindowに公開)
window.allCards = [];

// サイドバーの開閉状態を記憶するためのフラグ
let isSidebarOpen = false;
// メニューアイコンの表示状態を記憶するためのフラグ
let isMenuIconsVisible = true; // デフォルトで表示

// サイドバーとメニューの幅を定義 (CSS変数と同期)
const SIDEBAR_WIDTH = 500; // px (コンテンツエリアの幅)
const MENU_ICON_SIZE = 60; // px (各アイコンボタンのサイズ)
const TOGGLE_BUTTON_SIZE = 50; // px (メニュー開閉ボタンのサイズ)

// UIが既にウェブページに挿入されたかどうかを追跡するフラグ
let uiInjected = false;

// グローバルなログイン状態変数
// これらの変数はrateMatch.jsでサーバーからの応答に基づいて更新されます。
// 他のセクション（memo.js, battleRecord.js, home.js）がこれらの状態を参照します。
window.currentRate = 1500;
window.currentUsername = null; // ログインユーザーのユーザー名 (ログイン用)
window.currentDisplayName = null; // ログインユーザーの表示名 (UI表示用)
window.currentUserId = null; // ログインユーザーのID (サーバーが発行するUUID)
window.userMatchHistory = [];
window.userMemos = [];
window.userBattleRecords = [];
window.userRegisteredDecks = [];
window.ws = null; // WebSocketインスタンスもグローバルに保持


/**
 * カスタムアラート/確認ダイアログを表示します。
 * この関数はグローバルスコープ (window) に公開されます。
 * @param {string} title - ダイアログのタイトル。
 * @param {string} message - ダイアログに表示するメッセージ（HTML可）。
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

        // UI要素がDOMに存在するか確認
        if (!overlay || !dialogTitle || !dialogMessage || !okButton || !cancelButton) {
            console.error("Custom Dialog: Elements not found. Cannot show dialog. Ensure UI is injected.");
            return resolve(false); // エラー時はfalseを返す
        }
        console.log(`Custom Dialog: Displaying dialog with title "${title}" and message "${message}". Is confirm: ${isConfirm}`);

        dialogTitle.textContent = title; // タイトルはテキストとして設定
        dialogMessage.innerHTML = message; // メッセージはHTMLとして設定可能
        cancelButton.style.display = isConfirm ? 'inline-block' : 'none'; // 確認ダイアログならキャンセルボタンを表示

        // イベントリスナーの重複登録防止のため、既存のボタンをクローンして置き換える
        const newOkButton = okButton.cloneNode(true);
        okButton.parentNode.replaceChild(newOkButton, okButton);
        const newCancelButton = cancelButton.cloneNode(true);
        cancelButton.parentNode.replaceChild(newCancelButton, cancelButton);

        // OKボタンのクリックイベント
        newOkButton.addEventListener('click', () => {
            console.log("Custom Dialog: OK button clicked.");
            overlay.classList.remove('show'); // フェードアウト開始
            // トランジション終了後に要素を完全に非表示にする
            overlay.addEventListener('transitionend', () => overlay.style.display = 'none', { once: true });
            resolve(true); // Promiseを解決
        });

        // キャンセルボタンのクリックイベント（確認ダイアログの場合のみ）
        if (isConfirm) {
            newCancelButton.addEventListener('click', () => {
                console.log("Custom Dialog: Cancel button clicked.");
                overlay.classList.remove('show'); // フェードアウト開始
                overlay.addEventListener('transitionend', () => overlay.style.display = 'none', { once: true });
                resolve(false); // Promiseを解決
            });
        }

        overlay.style.display = 'flex'; // overlayを表示
        // DOMに表示された直後にクラスを追加してCSSトランジションをトリガー
        setTimeout(() => overlay.classList.add('show'), 10); 
    });
};


/**
 * メニューアイコンの表示状態を更新する関数。
 * isMenuIconsVisibleの状態に基づいて、メニューコンテナの幅とアイコンラッパーの表示を制御します。
 */
function updateMenuIconsVisibility() {
    const menuContainer = document.getElementById('tcg-right-menu-container');
    const menuIconsWrapper = menuContainer ? menuContainer.querySelector('.tcg-menu-icons-wrapper') : null;
    const toggleButton = document.getElementById('tcg-menu-toggle-button');
    const toggleIcon = toggleButton ? toggleButton.querySelector('i') : null;

    if (!menuContainer || !menuIconsWrapper || !toggleButton || !toggleIcon) {
        console.warn("UI: Menu visibility elements not found for update. UI might not be fully loaded yet.");
        return;
    }
    console.log(`UI: Setting menu visibility to ${isMenuIconsVisible ? 'visible' : 'hidden'}.`);

    if (isMenuIconsVisible) { // アイコンを表示し、コンテナを展開
        menuContainer.classList.remove('collapsed');
        menuContainer.classList.add('expanded');
        menuIconsWrapper.classList.remove('hidden');
        menuIconsWrapper.classList.add('visible');
        toggleIcon.classList.replace('fa-chevron-left', 'fa-chevron-right'); // 右矢印アイコンに切り替え
    } else { // アイコンを隠し、コンテナを格納
        menuContainer.classList.remove('expanded');
        menuContainer.classList.add('collapsed');
        menuIconsWrapper.classList.remove('visible');
        menuIconsWrapper.classList.add('hidden');
        toggleIcon.classList.replace('fa-chevron-right', 'fa-chevron-left'); // 左矢印アイコンに切り替え
    }
}

/**
 * 右サイドメニュー（アイコン群）を作成・挿入し、イベントリスナーを設定します。
 * この関数はUIがDOMに挿入された後に一度だけ呼び出されます。
 */
function createRightSideMenuAndAttachListeners() {
    console.log("UI: Attaching menu listeners.");
    const menuContainer = document.getElementById('tcg-right-menu-container');
    if (!menuContainer) {
        console.error("UI: tcg-right-menu-container not found after UI injection. Cannot attach menu listeners.");
        return;
    }

    const menuIconsWrapper = menuContainer.querySelector('.tcg-menu-icons-wrapper');
    const menuIcons = menuIconsWrapper.querySelectorAll('.tcg-menu-icon');
    const toggleButton = document.getElementById('tcg-menu-toggle-button');

    if (!menuIconsWrapper || !menuIcons.length || !toggleButton) {
        console.error("UI: Some menu elements are missing. Cannot attach listeners.");
        return;
    }

    // 各メニューアイコンにクリックイベントリスナーを設定（重複防止のためremoveEventListenerを先に呼ぶ）
    menuIcons.forEach(iconButton => {
        iconButton.removeEventListener('click', handleMenuIconClick); 
        iconButton.addEventListener('click', handleMenuIconClick);
        console.log(`UI: Attached click listener to menu icon: ${iconButton.dataset.section}`);
    });

    // トグルボタンのイベントリスナーを設定
    toggleButton.removeEventListener('click', handleMenuToggleButtonClick); 
    toggleButton.addEventListener('click', handleMenuToggleButtonClick);
    console.log("UI: Attached click listener to toggle button.");

    // メニューアイコンの表示状態をローカルストレージからロードし、初期状態を適用
    browser.storage.local.get(['isMenuIconsVisible'], (result) => {
        isMenuIconsVisible = result.isMenuIconsVisible !== undefined ? result.isMenuIconsVisible : true;
        updateMenuIconsVisibility();
        console.log(`UI: Loaded isMenuIconsVisible: ${isMenuIconsVisible}`);
    });
}

// メニューアイコンクリックハンドラ
function handleMenuIconClick(event) {
    const sectionId = event.currentTarget.dataset.section;
    console.log(`UI: Menu icon "${sectionId}" clicked.`);
    // アリーナボタンがクリックされたら新しいタブで開く
    if (sectionId === 'arena') {
        window.open('https://anokorotcg-arena.vercel.app/', '_blank');
        return; // サイドバーは開かない
    }
    window.toggleContentArea(sectionId); // グローバル関数として呼び出し
}

// メニュー開閉トグルボタンクリックハンドラ
function handleMenuToggleButtonClick() {
    console.log("UI: Toggle button clicked.");
    isMenuIconsVisible = !isMenuIconsVisible;
    updateMenuIconsVisibility();
    browser.storage.local.set({ isSidebarOpen: isSidebarOpen, isMenuIconsVisible: isMenuIconsVisible }); // サイドバー状態も一緒に保存
}


/**
 * コンテンツエリア（サイドバー）の表示/非表示を切り替えます。
 * この関数はグローバルスコープ (window) に公開されます。
 * @param {string} sectionId - 表示するセクションのID。
 * @param {boolean} forceOpenSidebar - サイドバーが閉じている場合でも強制的に開くかどうか。
 */
window.toggleContentArea = function(sectionId, forceOpenSidebar = false) {
    console.log(`UI: Toggling content area for section "${sectionId}". Force open: ${forceOpenSidebar}`);
    const contentArea = document.getElementById('tcg-content-area');
    const rightMenuContainer = document.getElementById('tcg-right-menu-container');
    const gameCanvas = document.querySelector('canvas#unity-canvas');
    const menuIcons = rightMenuContainer ? rightMenuContainer.querySelectorAll('.tcg-menu-icon') : [];

    if (!contentArea || !rightMenuContainer) {
        console.error("UI: Essential UI elements for toggleContentArea not found.");
        return;
    }

    const currentActiveIcon = rightMenuContainer.querySelector('.tcg-menu-icon.active');
    const clickedIcon = rightMenuContainer.querySelector(`.tcg-menu-icon[data-section="${sectionId}"]`);

    // すべてのメニューアイコンのアクティブ状態を解除
    menuIcons.forEach(btn => btn.classList.remove('active'));

    // クリックされたアイコンが既にアクティブで、かつサイドバーが開いている場合は閉じる
    const isContentAreaActive = contentArea.classList.contains('active');
    const isSameIconAlreadyActiveAndClicked = isContentAreaActive && (currentActiveIcon && currentActiveIcon.dataset.section === sectionId);

    if (isSameIconAlreadyActiveAndClicked && !forceOpenSidebar) { // forceOpenSidebar が true の場合は閉じない
        console.log("UI: Same icon clicked, closing sidebar.");
        contentArea.classList.remove('active');
        contentArea.style.right = `-${SIDEBAR_WIDTH}px`;
        isSidebarOpen = false;
        isMenuIconsVisible = false; // サイドバーを閉じたらアイコンも隠す
        updateMenuIconsVisibility();
        if (gameCanvas) gameCanvas.style.display = 'block'; // ゲームキャンバスを表示
        document.body.classList.remove('game-focused-mode'); // ゲームフォーカスモード解除
        browser.storage.local.set({ isSidebarOpen: isSidebarOpen, isMenuIconsVisible: isMenuIconsVisible });
    } else {
        console.log("UI: Opening sidebar or switching section.");
        contentArea.classList.add('active');
        contentArea.style.right = '0px';
        isSidebarOpen = true; // サイドバーを開く
        isMenuIconsVisible = true; // サイドバーを開いたらアイコンを表示
        updateMenuIconsVisibility();
        if (gameCanvas) gameCanvas.style.display = 'block'; // ゲームキャンバスを表示
        document.body.classList.remove('game-focused-mode'); // ゲームフォーカスモード解除
        browser.storage.local.set({ isSidebarOpen: isSidebarOpen, activeSection: sectionId, isMenuIconsVisible: isMenuIconsVisible });

        window.showSection(sectionId); // グローバル関数として呼び出し

        if (clickedIcon) {
            clickedIcon.classList.add('active'); // クリックされたアイコンをアクティブ状態に
        }
    }
};

// 各セクションのJavaScriptファイルを追跡するためのセット
// これにより同じスクリプトが複数回注入されるのを防ぐ
if (!window._injectedSectionScripts) {
    window._injectedSectionScripts = new Set();
}

/**
 * 指定されたセクションのHTMLコンテンツをロードし、対応するJavaScriptファイルを注入して初期化します。
 * この関数はグローバルスコープ (window) に公開されます。
 * @param {string} sectionId - 表示するセクションのID (例: "home", "rateMatch")。
 */
window.showSection = async function(sectionId) {
    console.log(`Section Loader: Attempting to show section: ${sectionId}`);
    // アリーナセクションはHTMLとしてロードしない（別タブで開くため）
    if (sectionId === 'arena') {
        console.log("Section Loader: Arena section is handled by opening a new tab. No HTML to load.");
        return; 
    }

    // すべてのセクションを非アクティブにする
    document.querySelectorAll('.tcg-section').forEach(section => {
        section.classList.remove('active');
    });

    // ターゲットセクションのコンテナ要素を取得または作成
    const tcgSectionsWrapper = document.getElementById('tcg-sections-wrapper');
    let targetSection = document.getElementById(`tcg-${sectionId}-section`);

    if (!tcgSectionsWrapper) {
        console.error("Section Loader: tcg-sections-wrapper not found. Cannot append new section.");
        return;
    }

    // セクションコンテナが存在しない場合は動的に作成
    if (!targetSection) {
        targetSection = document.createElement('div');
        targetSection.id = `tcg-${sectionId}-section`;
        targetSection.className = 'tcg-section';
        tcgSectionsWrapper.appendChild(targetSection);
        console.log(`Section Loader: Created new section div for ${sectionId}.`);
    }

    // セクションのHTMLをロード
    try {
        const htmlPath = browser.runtime.getURL(`html/sections/${sectionId}.html`);
        console.log(`Section Loader: Fetching HTML from: ${htmlPath}`);
        const response = await fetch(htmlPath);
        if (!response.ok) {
            throw new Error(`Failed to load HTML for ${sectionId}: ${response.statusText} (${response.status})`);
        }
        const htmlContent = await response.text();
        targetSection.innerHTML = htmlContent; // HTMLコンテンツを挿入
        console.log(`Section Loader: HTML loaded for section ${sectionId}.`);
    } catch (error) {
        console.error(`Section Loader: Error loading HTML for section ${sectionId}:`, error);
        targetSection.innerHTML = `<p style="color: red;">セクションの読み込みに失敗しました: ${sectionId}<br>エラー: ${error.message}</p>`;
        return;
    }

    // 各セクションのJavaScriptを動的に注入し、初期化関数を呼び出す
    const jsPath = `js/sections/${sectionId}.js`; 
    // initFunctionNameを動的に生成 (例: "rateMatch" -> "initRateMatchSection")
    const initFunctionName = `init${sectionId.charAt(0).toUpperCase() + sectionId.slice(1).replace(/-([a-z])/g, (g) => g[1].toUpperCase())}Section`;
    console.log(`Section Loader: Preparing to inject script: ${jsPath} with init function: ${initFunctionName}`);

    // スクリプトがまだ注入されていない場合のみ、background scriptに注入を依頼
    if (!window._injectedSectionScripts.has(jsPath)) {
        console.log(`Section Loader: Script ${jsPath} not yet injected. Requesting background script injection.`);
        try {
            browser.runtime.sendMessage({
                action: "injectSectionScript",
                scriptPath: jsPath,
                initFunctionName: initFunctionName
            }, (response) => {
                if (browser.runtime.lastError) {
                    console.error("Section Loader: Error from runtime.sendMessage (injectSectionScript):", browser.runtime.lastError.message);
                    return;
                }
                if (response && response.success) {
                    window._injectedSectionScripts.add(jsPath); // 注入済みとしてマーク
                    console.log(`Section Loader: Script ${jsPath} injected and ${initFunctionName} called via background.js successfully.`);
                } else {
                    console.error(`Section Loader: Failed to inject script ${jsPath}: ${response ? response.error : 'Unknown error'}`);
                }
            });
        } catch (error) {
            console.error(`Section Loader: Failed to send message to background for script injection for section ${sectionId}:`, error);
        }
    } else {
        // 既にスクリプトが注入されている場合は、初期化関数を再実行
        // DOMが更新された後にイベントリスナーを再アタッチするために必要
        console.log(`Section Loader: Script ${jsPath} already injected. Re-calling ${initFunctionName}.`);
        setTimeout(() => {
            if (typeof window[initFunctionName] === 'function') {
                window[initFunctionName](); // 引数を削除して呼び出し
            } else {
                console.error(`Section Loader: Initialization function ${initFunctionName} NOT found on window object for already injected script for section ${sectionId}. This indicates a scoping issue or the function is not exposed globally.`);
            }
        }, 0);
    }

    // 指定されたセクションをアクティブにする
    targetSection.classList.add('active');
    console.log(`Section Loader: Section ${sectionId} set to active.`);

    // アクティブなセクションをローカルストレージに保存
    browser.storage.local.set({ activeSection: sectionId });
};

/**
 * セクションIDに対応する表示タイトルを取得します。
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
        case 'arena': return 'アリーナ'; // アリーナセクションのタイトル
        default: return 'あの頃の自作TCGアシスタント';
    }
}


/**
 * 拡張機能のUIをウェブページに挿入し、初期化します。
 * この関数は一度だけ実行されることを保証します。
 */
async function injectUIIntoPage() {
    console.log("UI Injector: Attempting to inject UI.");
    if (uiInjected) {
        console.log("UI Injector: UI already injected, skipping.");
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
        console.log("UI Injector: UI HTML parsed.");

        // bodyの既存コンテンツを保持しつつ、UIを挿入する
        const bodyOriginalContent = Array.from(document.body.childNodes);
        document.body.innerHTML = ''; // bodyを一度クリア
        console.log("UI Injector: Body content cleared.");

        while (tempDiv.firstChild) {
            document.body.appendChild(tempDiv.firstChild);
        }
        console.log("UI Injector: New UI elements appended to body.");

        bodyOriginalContent.forEach(node => {
            document.body.appendChild(node);
        });
        console.log("UI Injector: Original body content re-appended.");
        
        uiInjected = true;
        console.log("main.js: UI injected into page. Elements referenced.");

        createRightSideMenuAndAttachListeners();
        console.log("main.js: Right side menu listeners attached.");
        initializeExtensionFeatures();
        console.log("main.js: Extension features initialized.");

        // 初期セクションの表示は、UI要素が完全にDOMに追加された後に、
        // かつ createRightSideMenuAndAttachListeners の中で重複して呼ばれないように
        // ここで一度だけ行います。
        browser.storage.local.get(['isSidebarOpen', 'activeSection'], (result) => { 
            const activeSection = result.activeSection || 'home';
            const initialIsSidebarOpen = result.isSidebarOpen !== undefined ? result.isSidebarOpen : false;

            // サイドバーの初期状態を適用
            const contentArea = document.getElementById('tcg-content-area');
            const gameCanvas = document.querySelector('canvas#unity-canvas');
            if (initialIsSidebarOpen) {
                if (contentArea) {
                    contentArea.classList.add('active');
                    contentArea.style.right = '0px';
                }
                if (gameCanvas) {
                    gameCanvas.style.display = 'block';
                }
                document.body.classList.remove('game-focused-mode');
            } else {
                if (contentArea) {
                    contentArea.classList.remove('active');
                    contentArea.style.right = `-${SIDEBAR_WIDTH}px`;
                }
                if (gameCanvas) {
                    gameCanvas.style.display = 'block';
                }
                document.body.classList.remove('game-focused-mode');
            }

            // アクティブなセクションを表示
            window.showSection(activeSection); 
            console.log(`UI Injector: Initial section "${activeSection}" shown.`);

            // 初期アクティブアイコンを設定
            const menuContainer = document.getElementById('tcg-right-menu-container');
            if (menuContainer) {
                const initialActiveIcon = menuContainer.querySelector(`.tcg-menu-icon[data-section="${activeSection}"]`);
                if (initialActiveIcon) {
                    menuContainer.querySelectorAll('.tcg-menu-icon').forEach(btn => btn.classList.remove('active'));
                    initialActiveIcon.classList.add('active');
                }
            }
        });

    } catch (error) {
        console.error("UI Injector: Failed to inject UI into page:", error);
        if (window.showCustomDialog) {
            window.showCustomDialog('エラー', `UIの注入に失敗しました: ${error.message}`);
        }
    }
}

/**
 * 拡張機能の各種機能を初期化し、イベントリスナーを設定します。
 * この関数は一度だけ呼び出されます。
 */
async function initializeExtensionFeatures() {
    console.log("Features: Initializing extension features...");
    try {
        const response = await fetch(browser.runtime.getURL('json/cards.json'));
        window.allCards = await response.json();
        if (!Array.isArray(window.allCards) || window.allCards.length === 0) {
            console.warn("Features: Card data is empty or invalid. Some features may be limited.");
        } else {
            console.log(`Features: ${window.allCards.length} cards loaded into window.allCards.`);
        }
    }
    catch (error) {
        console.error("Features: Failed to load card data:", error);
        if (window.showCustomDialog) {
            window.showCustomDialog('エラー', `カードデータのロードに失敗しました: ${error.message}`);
        }
    }
}

// DOMが完全にロードされるのを待ってからUIを注入し、機能を初期化します。
if (document.readyState === 'loading') {
    console.log("main.js: Document is still loading, waiting for DOMContentLoaded.");
    document.addEventListener('DOMContentLoaded', () => {
        injectUIIntoPage();
    });
} else {
    console.log("main.js: Document already loaded, injecting UI immediately.");
    injectUIIntoPage();
}

// popup.jsからのメッセージを受け取るリスナー
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`main.js: Message received - Action: ${request.action}`);
    if (request.action === "showSection") {
        window.toggleContentArea(request.section, request.forceOpenSidebar); // グローバル関数として呼び出し
    } else if (request.action === "toggleSidebar") {
        const contentArea = document.getElementById('tcg-content-area');
        const rightMenuContainer = document.getElementById('tcg-right-menu-container');
        const gameCanvas = document.querySelector('canvas#unity-canvas');

        if (!contentArea || !rightMenuContainer) {
            console.error("main.js: toggleSidebar: Essential UI elements not found.");
            return;
        }

        if (contentArea.classList.contains('active')) {
            console.log("main.js: toggleSidebar: Sidebar is active, closing.");
            contentArea.classList.remove('active');
            contentArea.style.right = `-${SIDEBAR_WIDTH}px`;
            isSidebarOpen = false;
            isMenuIconsVisible = false;
            updateMenuIconsVisibility();
        } else {
            console.log("main.js: toggleSidebar: Sidebar is inactive, opening.");
            contentArea.classList.add('active');
            contentArea.style.right = '0px';
            isSidebarOpen = true;
            isMenuIconsVisible = true;
            updateMenuIconsVisibility();

            browser.storage.local.get(['activeSection'], (result) => {
                const activeSection = result.activeSection || 'home';
                const initialActiveIcon = rightMenuContainer.querySelector(`.tcg-menu-icon[data-section="${activeSection}"]`);
                rightMenuContainer.querySelectorAll('.tcg-menu-icon').forEach(btn => btn.classList.remove('active'));
                if (initialActiveIcon) {
                    initialActiveIcon.classList.add('active');
                }
                window.showSection(activeSection); // グローバル関数として呼び出し
            });
        }
        browser.storage.local.set({ isSidebarOpen: isSidebarOpen, isMenuIconsVisible: isMenuIconsVisible });
    } else if (request.action === "matchFound") {
        console.log("main.js: Match found message received from background. Triggering dialog and sidebar.");
        // ルームIDは表示しない
        if (window.showCustomDialog) {
            window.showCustomDialog('対戦相手決定', `対戦相手が決まりました！対戦を開始しましょう！`);
        } else {
            console.error("main.js: showCustomDialog is not available.");
        }
        window.toggleContentArea('rateMatch', true); // グローバル関数として呼び出し
    }
});
