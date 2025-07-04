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
            console.error("Custom dialog elements not found.");
            return resolve(false); // エラー時はfalseを返す
        }

        dialogTitle.textContent = title;
        dialogMessage.innerHTML = message; // HTMLを許可するためにinnerHTMLを使用
        cancelButton.style.display = isConfirm ? 'inline-block' : 'none';

        // 既存のイベントリスナーを削除
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
 * この関数はcontent.jsのグローバルスコープに配置されます。
 */
function updateMenuIconsVisibility() {
    const menuContainer = document.getElementById('tcg-right-menu-container');
    const menuIconsWrapper = menuContainer ? menuContainer.querySelector('.tcg-menu-icons-wrapper') : null;
    const toggleButton = document.getElementById('tcg-menu-toggle-button');
    const toggleIcon = toggleButton ? toggleButton.querySelector('i') : null;

    if (!menuContainer || !menuIconsWrapper || !toggleIcon) return;

    if (isMenuIconsVisible) { // Icons should be visible and container expanded
        menuContainer.classList.remove('collapsed');
        menuContainer.classList.add('expanded');
        menuIconsWrapper.classList.remove('hidden');
        menuIconsWrapper.classList.add('visible');
        toggleIcon.classList.replace('fa-chevron-left', 'fa-chevron-right'); // Right arrow
    } else { // Icons should be hidden and container collapsed
        menuContainer.classList.remove('expanded');
        menuContainer.classList.add('collapsed');
        menuIconsWrapper.classList.remove('visible');
        menuIconsWrapper.classList.add('hidden');
        toggleIcon.classList.replace('fa-chevron-right', 'fa-chevron-left'); // Left arrow
    }
}

/**
 * 右サイドメニュー（アイコン群）を作成・挿入します。
 */
function createRightSideMenu() {
    const menuContainer = document.getElementById('tcg-right-menu-container');
    if (!menuContainer) {
        console.error("tcg-right-menu-container not found in HTML.");
        return;
    }

    const menuIconsWrapper = menuContainer.querySelector('.tcg-menu-icons-wrapper');
    const menuIcons = menuIconsWrapper.querySelectorAll('.tcg-menu-icon');
    const toggleButton = document.getElementById('tcg-menu-toggle-button');

    // 各メニューアイコンにクリックイベントリスナーを設定
    menuIcons.forEach(iconButton => {
        iconButton.addEventListener('click', (event) => {
            const sectionId = event.currentTarget.dataset.section;
            toggleContentArea(sectionId); // 全てのアイコンクリックでtoggleContentAreaを呼び出す
        });
    });

    // メニューアイコンの表示状態をロード
    chrome.storage.local.get(['isMenuIconsVisible'], (result) => {
        isMenuIconsVisible = result.isMenuIconsVisible !== undefined ? result.isMenuIconsVisible : true;
        updateMenuIconsVisibility(); // 初期状態を適用
    });

    // トグルボタンのクリックイベントリスナー
    toggleButton.addEventListener('click', () => {
        isMenuIconsVisible = !isMenuIconsVisible;
        updateMenuIconsVisibility();
        chrome.storage.local.set({ isMenuIconsVisible: isMenuIconsVisible });
    });


    // サイドバーの開閉状態とアクティブなセクションをロードし、UIを初期化
    chrome.storage.local.get(['isSidebarOpen', 'activeSection', 'isMenuIconsVisible'], (result) => {
        isSidebarOpen = result.isSidebarOpen !== undefined ? result.isSidebarOpen : false;
        const activeSection = result.activeSection || 'home'; // デフォルトはホーム
        // isMenuIconsVisibleの初期値をisSidebarOpenに連動させる
        isMenuIconsVisible = result.isMenuIconsVisible !== undefined ? result.isMenuIconsVisible : isSidebarOpen;

        const contentArea = document.getElementById('tcg-content-area');
        const gameCanvas = document.querySelector('canvas#unity-canvas');
        const rightMenuContainer = document.getElementById('tcg-right-menu-container');

        // まず、すべてのメニューアイコンのアクティブ状態をリセット
        if (rightMenuContainer) {
            rightMenuContainer.querySelectorAll('.tcg-menu-icon').forEach(btn => btn.classList.remove('active'));
        }

        // メニューコンテナの初期状態を適用
        updateMenuIconsVisibility(); // isMenuIconsVisibleに基づいてクラスを適用

        if (isSidebarOpen) {
            // サイドバーが開いている状態を復元
            if (contentArea) {
                contentArea.classList.add('active');
                contentArea.style.right = '0px'; // ゲーム画面に重なるように配置
            }
            if (gameCanvas) {
                gameCanvas.style.display = 'block'; // ゲーム画面は表示のまま
            }
            document.body.classList.remove('game-focused-mode');
            
            // アクティブなセクションのコンテンツを表示
            showSection(activeSection); // This will activate the content section

            // そして、対応するメニューアイコンをアクティブにする
            if (rightMenuContainer) {
                const initialActiveIcon = rightMenuContainer.querySelector(`.tcg-menu-icon[data-section="${activeSection}"]`);
                if (initialActiveIcon) {
                    initialActiveIcon.classList.add('active');
                }
            }

        } else {
            // サイドバーが閉じている状態を復元
            if (contentArea) {
                contentArea.classList.remove('active');
                contentArea.style.right = `-${SIDEBAR_WIDTH}px`; // 完全に画面外に隠す
            }
            if (gameCanvas) {
                gameCanvas.style.display = 'block'; // ゲーム画面は表示のまま
            }
            document.body.classList.remove('game-focused-mode');

            // 閉じた状態でも、最後にアクティブだったアイコンをハイライトしておく
            if (rightMenuContainer) {
                const initialActiveIcon = rightMenuContainer.querySelector(`.tcg-menu-icon[data-section="${activeSection}"]`);
                if (initialActiveIcon) {
                    initialActiveIcon.classList.add('active');
                }
            }
        }
    });
}

/**
 * コンテンツエリアの表示/非表示を切り替えます。
 * @param {string} sectionId - 表示するセクションのID。
 */
function toggleContentArea(sectionId) {
    const contentArea = document.getElementById('tcg-content-area');
    const rightMenuContainer = document.getElementById('tcg-right-menu-container');
    const gameCanvas = document.querySelector('canvas#unity-canvas');
    const menuIcons = rightMenuContainer.querySelectorAll('.tcg-menu-icon'); // アイコンリストを再取得

    if (!contentArea || !rightMenuContainer) return;

    const currentActiveIcon = rightMenuContainer.querySelector('.tcg-menu-icon.active');
    const clickedIcon = rightMenuContainer.querySelector(`.tcg-menu-icon[data-section="${sectionId}"]`);

    const isContentAreaActive = contentArea.classList.contains('active');
    const isSameIconAlreadyActiveAndClicked = isContentAreaActive && (currentActiveIcon && currentActiveIcon.dataset.section === sectionId);

    console.log('toggleContentArea called with sectionId:', sectionId);
    console.log('isContentAreaActive:', isContentAreaActive);
    console.log('currentActiveIcon:', currentActiveIcon ? currentActiveIcon.dataset.section : 'none');
    console.log('clickedIcon:', clickedIcon ? clickedIcon.dataset.section : 'none');
    console.log('isSameIconAlreadyActiveAndClicked:', isSameIconAlreadyActiveAndClicked);


    // すべてのメニューアイコンのアクティブ状態を解除
    menuIcons.forEach(btn => btn.classList.remove('active'));

    if (isSameIconAlreadyActiveAndClicked) {
        // コンテンツエリアが開いていて、同じアイコンがクリックされた場合 -> コンテンツエリアを閉じる
        contentArea.classList.remove('active');
        contentArea.style.right = `-${SIDEBAR_WIDTH}px`;

        // メニューアイコンと背景を非表示にする
        isMenuIconsVisible = false; 
        updateMenuIconsVisibility(); 

        if (gameCanvas) {
            gameCanvas.style.display = 'block'; // ゲーム画面を再表示
        }
        document.body.classList.remove('game-focused-mode');
        isSidebarOpen = false;
        chrome.storage.local.set({ isSidebarOpen: isSidebarOpen, isMenuIconsVisible: isMenuIconsVisible });
        console.log('Sidebar closed, menu icons and background are hidden.');

    } else {
        // コンテンツエリアが閉じている場合、または異なるセクションのアイコンがクリックされた場合
        contentArea.classList.add('active');
        contentArea.style.right = '0px';

        // メニューアイコンと背景を表示する
        isMenuIconsVisible = true; 
        updateMenuIconsVisibility(); 

        if (gameCanvas) {
            gameCanvas.style.display = 'block'; // ゲーム画面は表示のまま
        }
        document.body.classList.remove('game-focused-mode');
        isSidebarOpen = true;
        chrome.storage.local.set({ isSidebarOpen: isSidebarOpen, activeSection: sectionId, isMenuIconsVisible: isMenuIconsVisible });

        // ターゲットセクションのコンテンツを表示
        showSection(sectionId);

        // クリックされたアイコンをアクティブにする
        if (clickedIcon) {
            clickedIcon.classList.add('active');
            console.log('Icon activated:', clickedIcon.dataset.section);
        }
        console.log('Sidebar opened/switched to:', sectionId);
    }
}

// 現在ロードされているセクションのスクリプトを追跡
const loadedSectionScripts = {};

/**
 * 指定されたセクションを表示し、他のセクションを非表示にします。
 * @param {string} sectionId - 表示するセクションのID (例: "home", "rateMatch")。
 */
async function showSection(sectionId) {
    console.log(`Attempting to show section: ${sectionId}`);
    
    // すべてのセクションを非アクティブにする
    document.querySelectorAll('.tcg-section').forEach(section => {
        section.classList.remove('active');
    });

    // ターゲットセクションのコンテナ
    const targetSection = document.getElementById(`tcg-${sectionId}-section`);
    if (!targetSection) {
        console.error(`Target section container tcg-${sectionId}-section not found in index.html.`);
        return;
    }

    // homeセクションはHTMLに直接埋め込まれているため、innerHTMLは更新しない
    if (sectionId !== 'home') {
        try {
            // index.html に直接記述されている各セクションのコンテンツを切り替えるため、
            // ここではinnerHTMLの更新は不要。
            // ただし、もしセクションが空の場合に備えて、コンテンツを埋めるロジックは残す。
            if (targetSection.innerHTML.trim() === '') {
                 // これは、もし将来的にセクションのHTMLを外部ファイルからロードする方針に戻した場合のためのプレースホルダー
                 // 現状ではindex.htmlに全セクションが記述されているため、通常は空ではない
                 targetSection.innerHTML = `<h2 class="section-title">${getSectionTitle(sectionId)}</h2><p>コンテンツをロード中...</p>`;
            }

        } catch (error) {
            console.error(`Error loading HTML for section ${sectionId}:`, error);
            targetSection.innerHTML = `<p style="color: red;">セクションの読み込みに失敗しました: ${sectionId}<br>エラー: ${error.message}</p>`;
            return; // HTMLロード失敗時は後続処理を中断
        }
    } else {
        // homeセクションの場合、innerHTMLは変更しない（index.htmlに直接記述されているため）
        console.log("Home section is directly in index.html, skipping HTML injection.");
    }


    // セクションのJavaScriptをロード
    const jsPath = chrome.runtime.getURL(`js/sections/${sectionId}.js`); // 例: js/sections/home.js
    const initFunctionName = `init${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}Section`;

    if (!loadedSectionScripts[jsPath]) {
        try {
            console.log(`Checking JS existence: ${jsPath}`);
            const script = document.createElement('script');
            script.src = jsPath;
            document.body.appendChild(script);
            loadedSectionScripts[jsPath] = true;
            console.log(`JS script element appended for section: ${sectionId}`);

            // スクリプトがロードされてから初期化関数を呼び出す
            script.onload = () => {
                console.log(`Script loaded: ${jsPath}`);
                // DOMが完全に更新されるのを待つためにsetTimeout(0)を使用
                setTimeout(() => {
                    if (typeof window[initFunctionName] === 'function') {
                        console.log(`Calling initialization function: ${initFunctionName}`);
                        // 各セクションのJSはDOM要素を自身で取得するため、引数はallCardsとshowCustomDialogのみ
                        window[initFunctionName](allCards, showCustomDialog);
                    } else {
                        console.warn(`Initialization function ${initFunctionName} not found on window object after script load for section ${sectionId}. This might indicate a scoping issue in the section's JS file.`);
                    }
                }, 0); // 0ms delay to allow DOM to settle
            };
            script.onerror = (e) => {
                console.error(`Error loading script: ${jsPath}`, e);
            };
        } catch (error) {
            console.warn(`Error loading JavaScript for section ${sectionId}: ${jsPath}`, error);
        }
    } else {
        console.log(`JS already loaded for section: ${sectionId}. Attempting to re-call init function.`);
        // 既にロード済みの場合は、初期化関数を再実行
        setTimeout(() => {
            if (typeof window[initFunctionName] === 'function') {
                console.log(`Re-calling initialization function: ${initFunctionName}`);
                window[initFunctionName](allCards, showCustomDialog);
            } else {
                console.warn(`Initialization function ${initFunctionName} not found on window object for already loaded script for section ${sectionId}.`);
            }
        }, 0); // 0ms delay to allow DOM to settle
    }

    // 指定されたセクションをアクティブにする
    targetSection.classList.add('active');
    console.log(`Section tcg-${sectionId}-section is now active.`);

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
 * 拡張機能の各種機能を初期化し、イベントリスナーを設定します。
 */
async function initializeExtensionFeatures() {
    // cards.jsonを読み込む
    try {
        const response = await fetch(chrome.runtime.getURL('json/cards.json')); // パスを修正
        allCards = await response.json();
        if (!Array.isArray(allCards) || allCards.length === 0) {
            console.warn("カードデータが空または無効です。一部機能が制限される可能性があります。");
        } else {
            console.log("カードデータがロードされました:", allCards.length + "枚");
        }
    } catch (error) {
        console.error("カードデータのロードに失敗しました:", error);
    }

    // screenshotCanvasのコンテキストを初期化
    // これらの要素はUI注入後に取得されるため、ここで直接参照しない
    // screenshotOverlay, screenshotCanvas, cropScreenshotButton, pasteFullScreenshotButton, cancelCropButton
    // がnullでないことを確認してからイベントリスナーを設定する
    const currentScreenshotOverlay = document.getElementById('screenshot-overlay');
    const currentScreenshotCanvas = document.getElementById('screenshot-canvas');
    const currentCropScreenshotButton = document.getElementById('crop-screenshot-button');
    const currentPasteFullScreenshotButton = document.getElementById('paste-full-screenshot-button');
    const currentCancelCropButton = document.getElementById('cancel-crop-button');

    if (currentScreenshotCanvas) {
        screenshotCtx = currentScreenshotCanvas.getContext('2d');

        currentScreenshotCanvas.addEventListener('mousedown', (e) => {
            const rect = currentScreenshotCanvas.getBoundingClientRect();
            const xInCanvas = e.clientX - rect.left;
            const yInCanvas = e.clientY - rect.top;

            if (xInCanvas >= 0 && xInCanvas <= currentScreenshotCanvas.width &&
                yInCanvas >= 0 && yInCanvas <= currentScreenshotCanvas.height) {
                startX = xInCanvas;
                startY = yInCanvas;
                endX = xInCanvas; // 初期化
                endY = yInCanvas; // 初期化
                isDrawing = true;
            }
        });

        currentScreenshotCanvas.addEventListener('mousemove', (e) => {
            if (!isDrawing || !screenshotCtx || !currentScreenshotImage) return;
            
            const rect = currentScreenshotCanvas.getBoundingClientRect();
            const xInCanvas = e.clientX - rect.left;
            const yInCanvas = e.clientY - rect.top;

            endX = Math.max(0, Math.min(currentScreenshotCanvas.width, xInCanvas));
            endY = Math.max(0, Math.min(currentScreenshotCanvas.height, yInCanvas));

            screenshotCtx.clearRect(0, 0, currentScreenshotCanvas.width, currentScreenshotCanvas.height);
            screenshotCtx.drawImage(currentScreenshotImage, 0, 0, currentScreenshotCanvas.width, currentScreenshotCanvas.height);
            
            const width = endX - startX;
            const height = endY - startY;
            screenshotCtx.strokeStyle = 'red';
            screenshotCtx.lineWidth = 2;
            screenshotCtx.strokeRect(startX, startY, width, height);
        });

        currentScreenshotCanvas.addEventListener('mouseup', () => {
            isDrawing = false;
        });
        currentScreenshotCanvas.addEventListener('mouseleave', () => {
            if (isDrawing) {
                isDrawing = false;
            }
        });
    }

    if (currentCropScreenshotButton) {
        currentCropScreenshotButton.addEventListener('click', () => {
            // メモセクションのscreenshot-areaは各セクションのJSで取得するため、ここでは直接参照しない
            if (!currentScreenshotImage || !currentScreenshotOverlay || !currentScreenshotCanvas || !screenshotCtx) {
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

                const scaleX = currentScreenshotImage.naturalWidth / currentScreenshotCanvas.width;
                const scaleY = currentScreenshotImage.naturalHeight / currentScreenshotCanvas.height;

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

            currentScreenshotOverlay.style.display = 'none';
            startX = startY = endX = endY = undefined;
            showCustomDialog('貼り付け完了', 'スクリーンショットがメモエリアに貼り付けられました。');
        });
    }

    if (currentPasteFullScreenshotButton) {
        currentPasteFullScreenshotButton.addEventListener('click', () => {
            // メモセクションのscreenshot-areaは各セクションのJSで取得するため、ここでは直接参照しない
            if (!currentScreenshotImage || !currentScreenshotOverlay) return;
            
            // メモセクションのJSに画像を渡すためのカスタムイベントを発火させる
            const event = new CustomEvent('screenshotCropped', {
                detail: { imageUrl: currentScreenshotImage.src }
            });
            document.dispatchEvent(event);

            currentScreenshotOverlay.style.display = 'none';
            startX = startY = endX = endY = undefined;
            showCustomDialog('貼り付け完了', 'スクリーンショットがメモエリアに貼り付けられました。');
        });
    }

    if (currentCancelCropButton) {
        currentCancelCropButton.addEventListener('click', () => {
            if (currentScreenshotOverlay) currentScreenshotOverlay.style.display = 'none';
            startX = startY = endX = endY = undefined;
            showCustomDialog('キャンセル', 'スクリーンショットのトリミングをキャンセルしました。');
        });
    }
}

/**
 * 拡張機能のUIをウェブページに挿入します。
 */
async function injectUIIntoPage() {
    try {
        const response = await fetch(chrome.runtime.getURL('html/index.html'));
        if (!response.ok) {
            throw new Error(`Failed to load index.html: ${response.statusText}`);
        }
        const htmlContent = await response.text();
        
        // 一時的なコンテナを作成し、HTMLコンテンツを解析
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        // 必要なUIコンテナをbodyに直接追加
        const rightMenuContainer = tempDiv.querySelector('#tcg-right-menu-container');
        const contentArea = tempDiv.querySelector('#tcg-content-area');
        const customDialogOverlay = tempDiv.querySelector('#tcg-custom-dialog-overlay');
        const screenshotOverlayElement = tempDiv.querySelector('#screenshot-overlay'); // screenshotOverlayElementに名前変更

        if (rightMenuContainer) document.body.appendChild(rightMenuContainer);
        if (contentArea) document.body.appendChild(contentArea);
        if (customDialogOverlay) document.body.appendChild(customDialogOverlay);
        if (screenshotOverlayElement) document.body.appendChild(screenshotOverlayElement); // bodyに挿入

        console.log("UI elements injected into the page.");

        // グローバル変数にDOM要素を再割り当て
        Object.assign(window, {
            screenshotOverlay: document.getElementById('screenshot-overlay'),
            screenshotCanvas: document.getElementById('screenshot-canvas'),
            cropScreenshotButton: document.getElementById('crop-screenshot-button'),
            pasteFullScreenshotButton: document.getElementById('paste-full-screenshot-button'),
            cancelCropButton: document.getElementById('cancel-crop-button')
        });

        // UI要素がDOMに挿入された後に初期化関数を呼び出す
        createRightSideMenu();
        initializeExtensionFeatures();

        // 初期表示セクションをロード
        chrome.storage.local.get(['activeSection'], (result) => {
            const activeSection = result.activeSection || 'home';
            showSection(activeSection);
        });

    } catch (error) {
        console.error("Failed to inject UI into page:", error);
    }
}

// ページが完全にロードされ、アイドル状態になった後にUIを挿入
injectUIIntoPage();


// popup.jsからのメッセージを受け取るリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "showSection") {
        toggleContentArea(request.section);
    } else if (request.action === "toggleSidebar") {
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
