// js/main.js

// Font AwesomeのCSSを注入してアイコンを使用できるようにします。
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
document.head.appendChild(link);

// 全カードデータを格納する変数 (グローバルで保持し、各セクションに渡す)
let allCards = [];

// サイドバーの開閉状態を記憶するための変数
let isSidebarOpen = false;
// メニューアイコンの表示状態を記憶するための変数
let isMenuIconsVisible = true; // デフォルトで表示

// サイドバーとメニューの幅を定義
const SIDEBAR_WIDTH = 500; // px (コンテンツエリアの幅)
const MENU_ICON_SIZE = 60; // px (各アイコンボタンのサイズ)
const TOGGLE_BUTTON_SIZE = 50; // px (メニュー開閉ボタンのサイズ)

// スクリーンショットオーバーレイ関連の要素は、UI注入後に取得するように変更
let screenshotOverlay;
let screenshotCanvas;
let cropScreenshotButton;
let pasteFullScreenshotButton;
let cancelCropButton;

let screenshotCtx = null; // Canvasコンテキストは後で初期化
let currentScreenshotImage = null;
let startX, startY, endX, endY;
let isDrawing = false;

// UIが既に挿入されたかどうかを追跡するフラグ
let uiInjected = false;


/**
 * カスタムアラート/確認ダイアログを表示します。
 * @param {string} title - ダイアログのタイトル。
 * @param {string} message - ダイアログに表示するメッセージ。
 * @param {boolean} isConfirm - 確認ダイアログかどうか (trueの場合、OKとキャンセルボタンが表示されます)。
 * @returns {Promise<boolean>} - OKがクリックされた場合はtrue、キャンセルがクリックされた場合はfalseを解決するPromise。
 */
function showCustomDialog(title, message, isConfirm = false) {
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
}


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
 */
function toggleContentArea(sectionId) {
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

    if (isSameIconAlreadyActiveAndClicked) {
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
                initFunctionName: initFunctionName,
                allCards: allCards // allCardsデータも渡す
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
                window[initFunctionName](allCards, showCustomDialog);
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
        case 'deckAnalysis': return 'デッキ分析';
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
                    <button class="tcg-menu-icon" data-section="deckAnalysis" title="デッキ分析"><i class="fas fa-cube"></i></button>
                </div>
                <button class="tcg-menu-toggle-button" id="tcg-menu-toggle-button" title="メニューを隠す/表示">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>

            <div id="tcg-content-area">
                <div id="tcg-sections-wrapper">
                    <!-- 各セクションのコンテンツはここに動的にロードされます -->
                    <div id="tcg-home-section" class="tcg-section"></div>
                    <div id="tcg-rateMatch-section" class="tcg-section"></div>
                    <div id="tcg-memo-section" class="tcg-section"></div>
                    <div id="tcg-search-section" class="tcg-section"></div>
                    <div id="tcg-minigames-section" class="tcg-section"></div>
                    <div id="tcg-battleRecord-section" class="tcg-section"></div>
                    <div id="tcg-deckAnalysis-section" class="tcg-section"></div>
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

            <div id="screenshot-overlay" class="tcg-modal-overlay" style="display: none;">
                <div class="tcg-modal-content screenshot-modal-content">
                    <h3>スクリーンショットをトリミング</h3>
                    <p>ドラッグで範囲を選択してください。</p>
                    <canvas id="screenshot-canvas"></canvas>
                    <div style="margin-top:15px; display:flex; justify-content:center; gap:10px;">
                        <button id="crop-screenshot-button" class="tcg-button-primary">トリミングして貼り付け</button>
                        <button id="paste-full-screenshot-button" class="tcg-button-secondary">トリミングせずに貼り付け</button>
                        <button id="cancel-crop-button" class="tcg-button-danger">キャンセル</button>
                    </div>
                </div>
            </div>
        `;

        // 一時的なコンテナを作成し、HTMLコンテンツを解析
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = uiHtml;

        // bodyの既存コンテンツを保持しつつ、UIを挿入する
        // bodyを一度クリアし、tempDivの子要素をbodyに移動し、元のbodyコンテンツを再追加
        const bodyOriginalContent = Array.from(document.body.childNodes); // 元の子ノードを配列にコピー
        document.body.innerHTML = ''; // bodyをクリア

        while (tempDiv.firstChild) {
            document.body.appendChild(tempDiv.firstChild); // tempDivの子要素をbodyに移動
        }

        // 元のbodyコンテンツを再追加
        bodyOriginalContent.forEach(node => {
            document.body.appendChild(node);
        });
        
        // UI要素がDOMに挿入された後に、グローバル変数に参照を割り当てる
        // この時点で要素はDOMに存在しているはず
        screenshotOverlay = document.getElementById('screenshot-overlay');
        screenshotCanvas = document.getElementById('screenshot-canvas');
        cropScreenshotButton = document.getElementById('crop-screenshot-button');
        pasteFullScreenshotButton = document.getElementById('paste-full-screenshot-button');
        cancelCropButton = document.getElementById('cancel-crop-button');

        uiInjected = true; // 挿入フラグを設定

        // UI要素がDOMに挿入され、グローバル変数が割り当てられた後に初期化関数を呼び出す
        createRightSideMenuAndAttachListeners(); // 右サイドメニューのイベントリスナー設定
        initializeExtensionFeatures(); // カードデータロード、スクリーンショット関連初期化

        // 初期表示セクションをロード
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
 * ここでは、セクション固有ではない、グローバルな機能の初期化を行います。
 */
async function initializeExtensionFeatures() {
    // cards.jsonを読み込む
    try {
        const response = await fetch(chrome.runtime.getURL('json/cards.json'));
        allCards = await response.json();
        if (!Array.isArray(allCards) || allCards.length === 0) {
            console.warn("カードデータが空または無効です。一部機能が制限される可能性があります。");
        }
    } catch (error) {
        console.error("カードデータのロードに失敗しました:", error);
    }

    // screenshotCanvasのコンテキストを初期化
    if (screenshotCanvas) {
        screenshotCtx = screenshotCanvas.getContext('2d');

        // スクリーンショットCanvasのイベントリスナーはここに残す（グローバルなオーバーレイ要素のため）
        screenshotCanvas.addEventListener('mousedown', (e) => {
            const rect = screenshotCanvas.getBoundingClientRect();
            const xInCanvas = e.clientX - rect.left;
            const yInCanvas = e.clientY - rect.top;

            if (xInCanvas >= 0 && xInCanvas <= screenshotCanvas.width &&
                yInCanvas >= 0 && yInCanvas <= screenshotCanvas.height) {
                startX = xInCanvas;
                startY = yInCanvas;
                endX = xInCanvas; // 初期化
                endY = yInCanvas; // 初期化
                isDrawing = true;
            }
        });

        screenshotCanvas.addEventListener('mousemove', (e) => {
            if (!isDrawing || !screenshotCtx || !currentScreenshotImage) return;
            
            const rect = screenshotCanvas.getBoundingClientRect();
            const xInCanvas = e.clientX - rect.left;
            const yInCanvas = e.clientY - rect.top;

            endX = Math.max(0, Math.min(screenshotCanvas.width, xInCanvas));
            endY = Math.max(0, Math.min(screenshotCanvas.height, yInCanvas));

            screenshotCtx.clearRect(0, 0, screenshotCanvas.width, screenshotCanvas.height);
            screenshotCtx.drawImage(currentScreenshotImage, 0, 0, screenshotCanvas.width, screenshotCanvas.height);
            
            const width = endX - startX;
            const height = endY - startY;
            screenshotCtx.strokeStyle = 'red';
            screenshotCtx.lineWidth = 2;
            screenshotCtx.strokeRect(startX, startY, width, height);
        });

        screenshotCanvas.addEventListener('mouseup', () => {
            isDrawing = false;
        });
        screenshotCanvas.addEventListener('mouseleave', () => {
            if (isDrawing) {
                isDrawing = false;
            }
        });
    }

    if (cropScreenshotButton) {
        cropScreenshotButton.addEventListener('click', () => {
            if (!currentScreenshotImage || !screenshotOverlay || !screenshotCanvas || !screenshotCtx) {
                return;
            }
            let croppedImageUrl;
            const selectionWidth = Math.abs(endX - startX);
            const selectionHeight = Math.abs(endY - startY);

            if (startX !== undefined && startY !== undefined && selectionWidth > 0 && selectionHeight > 0) {
                const x = Math.min(startX, endX);
                const y = Math.min(startY, endY);
                const width = selectionWidth;
                const height = selectionHeight;

                const scaleX = currentScreenshotImage.naturalWidth / screenshotCanvas.width;
                const scaleY = currentScreenshotImage.naturalHeight / screenshotCanvas.height;

                const croppedCanvas = document.createElement('canvas');
                croppedCanvas.width = width * scaleX;
                croppedCanvas.height = height * scaleY;
                const croppedCtx = croppedCanvas.getContext('2d');
                croppedCtx.drawImage(
                    currentScreenshotImage,
                    x * scaleX, y * scaleY, width * scaleX, height * scaleY,
                    0, 0, croppedCanvas.width, croppedCanvas.height
                );
                croppedImageUrl = croppedCanvas.toDataURL('image/png');
            } else {
                croppedImageUrl = currentScreenshotImage.src;
            }
            
            // メモセクションのJSに画像を渡すためのカスタムイベントを発火させる
            const event = new CustomEvent('screenshotCropped', {
                detail: { imageUrl: croppedImageUrl }
            });
            document.dispatchEvent(event);

            screenshotOverlay.style.display = 'none';
            startX = startY = endX = endY = undefined;
            showCustomDialog('貼り付け完了', 'スクリーンショットがメモエリアに貼り付けられました。');
        });
    }

    if (pasteFullScreenshotButton) {
        pasteFullScreenshotButton.addEventListener('click', () => {
            if (!currentScreenshotImage || !screenshotOverlay) return;
            
            // メモセクションのJSに画像を渡すためのカスタムイベントを発火させる
            const event = new CustomEvent('screenshotCropped', {
                detail: { imageUrl: currentScreenshotImage.src }
            });
            document.dispatchEvent(event);

            screenshotOverlay.style.display = 'none';
            startX = startY = endX = endY = undefined;
            showCustomDialog('貼り付け完了', 'スクリーンショットがメモエリアに貼り付けられました。');
        });
    }

    if (cancelCropButton) {
        cancelCropButton.addEventListener('click', () => {
            if (screenshotOverlay) screenshotOverlay.style.display = 'none';
            startX = startY = endX = endY = undefined;
            showCustomDialog('キャンセル', 'スクリーンショットのトリミングをキャンセルしました。');
        });
    }
}

// DOMが完全にロードされるのを待ってから要素を注入し、機能を初期化します。
// script要素がdefer属性を持つか、bodyの最後にある場合、DOMContentLoadedは不要かもしれませんが、
// 念のためこのまかとします。
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
        toggleContentArea(request.section);
    } else if (request.action === "toggleSidebar") {
        // サイドバーの表示/非表示を切り替えるコマンド
        const contentArea = document.getElementById('tcg-content-area');
        const rightMenuContainer = document.getElementById('tcg-right-menu-container');
        const gameCanvas = document.querySelector('canvas#unity-canvas');

        if (!contentArea || !rightMenuContainer) return;

        if (contentArea.classList.contains('active')) {
            contentArea.classList.remove('active');
            contentArea.style.right = `-${SIDEBAR_WIDTH}px`;
            isMenuIconsVisible = false;
            updateMenuIconsVisibility();
        } else {
            contentArea.classList.add('active');
            contentArea.style.right = '0px';
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
    } else if (request.action === "captureScreenshot") {
        // スクリーンショット撮影前にサイドバーとメニューアイコンを閉じる
        const contentArea = document.getElementById('tcg-content-area');
        const rightMenuContainer = document.getElementById('tcg-right-menu-container');
        const gameCanvas = document.querySelector('canvas#unity-canvas');

        if (contentArea && contentArea.classList.contains('active')) {
            contentArea.classList.remove('active');
            contentArea.style.right = `-${SIDEBAR_WIDTH}px`;
            isSidebarOpen = false;
        }
        // メニューアイコンを隠す (矢印ボタンだけ表示)
        if (rightMenuContainer) {
            isMenuIconsVisible = false;
            updateMenuIconsVisibility();
        }
        if (gameCanvas) {
            gameCanvas.style.display = 'block';
        }
        document.body.classList.remove('game-focused-mode');
        chrome.storage.local.set({ isSidebarOpen: isSidebarOpen, isMenuIconsVisible: isMenuIconsVisible });


        // background.js にメッセージを送信してスクリーンショットをキャプチャ
        chrome.runtime.sendMessage({ action: "captureScreenshot" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("スクリーンショットのキャプチャに失敗しました:", chrome.runtime.lastError.message);
                showCustomDialog('エラー', `スクリーンショットのキャプチャに失敗しました: ${chrome.runtime.lastError.message}<br>拡張機能に必要な権限が不足している可能性があります。`);
                return;
            }
            if (response && response.success && response.screenshotUrl) {
                currentScreenshotImage = new Image();
                currentScreenshotImage.onload = () => {
                    // ここで screenshotCanvas が null でないことを確認
                    if (!screenshotCanvas || !screenshotCtx) {
                        showCustomDialog('エラー', 'スクリーンショットの表示に必要な要素が見つかりません。');
                        return;
                    }
                    const maxWidth = window.innerWidth * 0.9;
                    const maxHeight = window.innerHeight * 0.8;

                    const imgNaturalWidth = currentScreenshotImage.naturalWidth;
                    const imgNaturalHeight = currentScreenshotImage.naturalHeight;

                    let displayWidth = imgNaturalWidth;
                    let displayHeight = imgNaturalHeight;

                    if (displayWidth > maxWidth) {
                        displayWidth = maxWidth;
                        displayHeight = imgNaturalHeight * (maxWidth / imgNaturalWidth);
                    }

                    if (displayHeight > maxHeight) {
                        displayHeight = maxHeight;
                        displayWidth = displayWidth * (maxHeight / displayHeight);
                    }

                    screenshotCanvas.width = displayWidth;
                    screenshotCanvas.height = displayHeight;
                    screenshotCtx.drawImage(currentScreenshotImage, 0, 0, displayWidth, displayHeight);

                    if (screenshotOverlay) screenshotOverlay.style.display = 'flex';
                };
                currentScreenshotImage.onerror = (e) => {
                    console.error("スクリーンショット画像のロードに失敗しました:", e);
                    showCustomDialog('エラー', 'キャプチャした画像の表示に失敗しました。');
                };
                currentScreenshotImage.src = response.screenshotUrl;
            } else {
                console.error("スクリーンショットのキャプチャに失敗しました:", response ? response.error : "不明なエラー");
                showCustomDialog('エラー', `スクリーンショットのキャプチャに失敗しました: ${response ? response.error : '不明なエラー'}<br>拡張機能に必要な権限が不足している可能性があります。`);
            }
        });
    }
});
