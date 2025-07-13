// js/main.js

console.log("main.js: Script loaded.");

// Font AwesomeのCSSを注入
const fontAwesomeLink = document.createElement('link');
fontAwesomeLink.rel = 'stylesheet';
fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
document.head.appendChild(fontAwesomeLink);
console.log("main.js: Font Awesome CSS link added.");

// Google Fonts (M PLUS Rounded 1c) を注入
const googleFontsLink = document.createElement('link');
googleFontsLink.rel = 'stylesheet';
googleFontsLink.href = 'https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700&display=swap';
document.head.appendChild(googleFontsLink);
console.log("main.js: Google Fonts link added.");


// Firefox互換性のためのbrowserオブジェクトのフォールバック
if (typeof browser === 'undefined') {
    var browser = chrome;
}

// --- グローバル変数定義 ---
window.allCards = []; // 全カードデータ
let isSidebarOpen = false; // サイドバーの開閉状態
let uiInjected = false; // UIが挿入されたかどうかのフラグ

// ログイン関連のグローバル変数
window.currentRate = 1500;
window.currentUsername = null;
window.currentUserId = null;
window.userMatchHistory = [];
window.userMemos = [];
window.userBattleRecords = [];
window.userRegisteredDecks = [];
window.ws = null;

// スクリプト注入追跡用
if (!window._injectedSectionScripts) {
    window._injectedSectionScripts = new Set();
}

/**
 * カスタムアラート/確認ダイアログを表示します。
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
        const buttonsWrapper = document.getElementById('tcg-dialog-buttons');

        if (!overlay || !dialogTitle || !dialogMessage || !buttonsWrapper) {
            console.error("Custom dialog elements not found.");
            return resolve(false);
        }

        dialogTitle.textContent = title;
        dialogMessage.innerHTML = message;
        buttonsWrapper.innerHTML = ''; // ボタンをクリア

        const okButton = document.createElement('button');
        okButton.textContent = 'OK';
        okButton.addEventListener('click', () => {
            overlay.classList.remove('show');
            resolve(true);
        });
        buttonsWrapper.appendChild(okButton);

        if (isConfirm) {
            const cancelButton = document.createElement('button');
            cancelButton.textContent = 'キャンセル';
            cancelButton.addEventListener('click', () => {
                overlay.classList.remove('show');
                resolve(false);
            });
            buttonsWrapper.appendChild(cancelButton);
        }

        overlay.classList.add('show');
    });
};

/**
 * コンテンツエリア（サイドバー）の表示/非表示を切り替えます。
 * @param {string | null} sectionId - 表示するセクションのID。nullの場合は現在の状態をトグル。
 * @param {boolean} forceOpen - サイドバーが閉じている場合でも強制的に開くか。
 */
window.toggleContentArea = function(sectionId, forceOpen = false) {
    const contentArea = document.getElementById('tcg-content-area');
    const birdToggle = document.getElementById('tcg-menu-toggle-bird');
    if (!contentArea || !birdToggle) {
        console.error("toggleContentArea: UI elements not found.");
        return;
    }

    const isCurrentlyOpen = contentArea.classList.contains('active');
    const currentActiveSection = document.querySelector('.tcg-menu-icon.active')?.dataset.section;

    // 1. 強制的に開く場合 (popup, ショートカット, マッチング成立時)
    if (forceOpen) {
        if (!isCurrentlyOpen) {
            contentArea.classList.add('active');
            birdToggle.classList.add('open');
            isSidebarOpen = true;
        }
        if(sectionId) window.showSection(sectionId);
    }
    // 2. それ以外の通常トグル操作
    else {
        // 2a. サイドバーが開いていて、同じアイコンをクリックした場合 -> 閉じる
        if (isCurrentlyOpen && currentActiveSection === sectionId) {
            contentArea.classList.remove('active');
            birdToggle.classList.remove('open');
            isSidebarOpen = false;
        }
        // 2b. サイドバーが開いていて、違うアイコンをクリックした場合 -> セクション切り替え
        else if (isCurrentlyOpen && sectionId) {
            window.showSection(sectionId);
        }
        // 2c. サイドバーが閉じていて、アイコンまたは鳥をクリックした場合 -> 開く
        else if (!isCurrentlyOpen) {
            contentArea.classList.add('active');
            birdToggle.classList.add('open');
            isSidebarOpen = true;
            const targetSection = sectionId || currentActiveSection || 'home';
            window.showSection(targetSection);
        }
        // 2d. サイドバーが開いていて、鳥をクリックした場合 (sectionId is null) -> 閉じる
        else if (isCurrentlyOpen && !sectionId) {
             contentArea.classList.remove('active');
             birdToggle.classList.remove('open');
             isSidebarOpen = false;
        }
    }
    
    browser.storage.local.set({ isSidebarOpen: isSidebarOpen });
};


/**
 * 指定されたセクションを表示し、他のセクションを非表示にします。
 * @param {string} sectionId - 表示するセクションのID。
 */
window.showSection = async function(sectionId) {
    if (!sectionId) {
        console.error("showSection called with null or undefined sectionId. Aborting.");
        return; // TypeErrorを回避
    }

    console.log(`showSection: Attempting to show section: ${sectionId}`);
    
    // メニューアイコンのアクティブ状態を更新
    document.querySelectorAll('.tcg-menu-icon').forEach(icon => {
        icon.classList.toggle('active', icon.dataset.section === sectionId);
    });

    // すべてのセクションを非表示にする
    document.querySelectorAll('.tcg-section').forEach(section => {
        section.classList.remove('active');
    });

    const sectionsWrapper = document.getElementById('tcg-sections-wrapper');
    let targetSection = document.getElementById(`tcg-${sectionId}-section`);

    // セクションのコンテナがなければ作成
    if (!targetSection) {
        targetSection = document.createElement('div');
        targetSection.id = `tcg-${sectionId}-section`;
        targetSection.className = 'tcg-section';
        sectionsWrapper.appendChild(targetSection);
    }

    // HTMLがまだロードされていなければロードする
    if (targetSection.innerHTML.trim() === '') {
        try {
            const htmlPath = browser.runtime.getURL(`html/sections/${sectionId}.html`);
            const response = await fetch(htmlPath);
            if (!response.ok) throw new Error(`HTML fetch failed: ${response.statusText}`);
            targetSection.innerHTML = await response.text();
        } catch (error) {
            console.error(`Error loading HTML for section ${sectionId}:`, error);
            targetSection.innerHTML = `<p style="color: red;">セクションの読み込みに失敗しました: ${error.message}</p>`;
            targetSection.classList.add('active');
            return;
        }
    }

    // セクションをアクティブにする
    targetSection.classList.add('active');
    browser.storage.local.set({ activeSection: sectionId });

    // 対応するJSを注入・実行
    const initFunctionName = `init${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}Section`;
    const jsPath = `js/sections/${sectionId}.js`;

    // background scriptに注入を依頼
    browser.runtime.sendMessage({
        action: "injectSectionScript",
        scriptPath: jsPath,
        initFunctionName: initFunctionName
    }, (response) => {
        if (browser.runtime.lastError) {
            console.error(`Error sending message for ${jsPath}:`, browser.runtime.lastError.message);
            return;
        }
        if (!response || !response.success) {
            console.error(`Failed to inject script ${jsPath}:`, response ? response.error : 'No response');
        } else {
            if (!window._injectedSectionScripts.has(jsPath)) {
                 window._injectedSectionScripts.add(jsPath);
            }
            console.log(`Script ${jsPath} initialized via background script.`);
        }
    });
};


/**
 * 拡張機能のUIをウェブページに挿入します。
 */
async function injectUIIntoPage() {
    if (uiInjected) return;
    console.log("injectUIIntoPage: Injecting UI...");

    // 桜小鳥の画像URLを取得
    const birdImageUrl = browser.runtime.getURL('images/irust_桜小鳥.png');

    const uiHtml = `
        <!-- サイドバー本体 -->
        <div id="tcg-content-area">
            <!-- サイドバーヘッダー (メニューアイコン) -->
            <div id="tcg-sidebar-header">
                <button class="tcg-menu-icon" data-section="home" title="ホーム"><i class="fas fa-home"></i></button>
                <button class="tcg-menu-icon" data-section="rateMatch" title="レート戦"><i class="fas fa-fist-raised"></i></button>
                <button class="tcg-menu-icon" data-section="battleRecord" title="戦いの記録"><i class="fas fa-trophy"></i></button>
                <button class="tcg-menu-icon" data-section="memo" title="メモ"><i class="fas fa-clipboard"></i></button>
                <button class="tcg-menu-icon" data-section="search" title="検索"><i class="fas fa-search"></i></button>
                <button class="tcg-menu-icon" data-section="minigames" title="ミニゲーム"><i class="fas fa-gamepad"></i></button>
            </div>
            <!-- 各セクションのコンテンツラッパー -->
            <div id="tcg-sections-wrapper"></div>
        </div>

        <!-- 桜小鳥トグルボタン -->
        <div id="tcg-menu-toggle-bird" style="background-image: url('${birdImageUrl}')" title="アシスタントメニューを開く"></div>

        <!-- カスタムダイアログ -->
        <div id="tcg-custom-dialog-overlay">
            <div class="tcg-modal-content">
                <h3 id="tcg-dialog-title"></h3>
                <p id="tcg-dialog-message"></p>
                <div class="dialog-buttons" id="tcg-dialog-buttons">
                    <!-- ボタンはJSで動的に追加 -->
                </div>
            </div>
        </div>
    `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = uiHtml;
    while (tempDiv.firstChild) {
        document.body.appendChild(tempDiv.firstChild);
    }
    uiInjected = true;
    console.log("main.js: UI injected into page.");

    // イベントリスナーを設定
    attachEventListeners();
    
    // 初期化処理
    initializeExtensionFeatures();
}

/**
 * イベントリスナーを設定します。
 */
function attachEventListeners() {
    // 桜小鳥トグルボタン
    document.getElementById('tcg-menu-toggle-bird').addEventListener('click', () => {
        window.toggleContentArea(null, false);
    });

    // サイドバーヘッダーのメニューアイコン
    document.querySelectorAll('.tcg-menu-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
            const sectionId = e.currentTarget.dataset.section;
            window.toggleContentArea(sectionId, false);
        });
    });
}

/**
 * 拡張機能のコア機能を初期化します。
 */
async function initializeExtensionFeatures() {
    console.log("main.js: Initializing extension features...");
    try {
        const response = await fetch(browser.runtime.getURL('json/cards.json'));
        window.allCards = await response.json();
        console.log(`main.js: ${window.allCards.length} cards loaded.`);
    } catch (error) {
        console.error("main.js: Failed to load card data:", error);
        window.showCustomDialog('エラー', `カードデータの読み込みに失敗しました: ${error.message}`);
    }

    // 保存されたサイドバーの状態を復元
    browser.storage.local.get(['isSidebarOpen', 'activeSection'], (result) => {
        const lastSection = result.activeSection || 'home';
        if (result.isSidebarOpen) {
            window.toggleContentArea(lastSection, true);
        } else {
            // 閉じていた場合でも、次に開くセクションを準備しておく
            // アイコンのアクティブ状態だけ設定
            document.querySelectorAll('.tcg-menu-icon').forEach(icon => {
                icon.classList.toggle('active', icon.dataset.section === lastSection);
            });
        }
    });
}

// --- メッセージリスナー ---
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`main.js: Message received - Action: ${request.action}`);
    if (request.action === "showSection") {
        // popup.jsやショートカットからのリクエスト
        window.toggleContentArea(request.section, true);
    } else if (request.action === "toggleSidebar") {
        // ショートカットキーからのリクエスト
        window.toggleContentArea(null, false);
    } else if (request.action === "matchFound") {
        // マッチング成立時は、強制的にレート戦画面を開く
        window.showCustomDialog('対戦相手決定', `対戦相手が決まりました！<br>レート戦画面に移動します。`);
        window.toggleContentArea('rateMatch', true);
    }
    // 非同期応答の可能性があることを示す
    return true; 
});

// --- 実行開始 ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUIIntoPage);
} else {
    injectUIIntoPage();
}
