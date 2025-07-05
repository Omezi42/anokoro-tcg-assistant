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
    // HTMLから要素を取得するのではなく、動的に生成する
    const menuContainer = document.createElement('div');
    menuContainer.id = 'tcg-right-menu-container';
    menuContainer.innerHTML = `
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
    `;
    document.body.appendChild(menuContainer);

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
    const tcgSectionsWrapper = document.getElementById('tcg-sections-wrapper');
    let targetSection = document.getElementById(`tcg-${sectionId}-section`);

    // セクションコンテナが存在しない場合は動的に作成
    if (!targetSection) {
        targetSection = document.createElement('div');
        targetSection.id = `tcg-${sectionId}-section`;
        targetSection.className = 'tcg-section';
        if (tcgSectionsWrapper) {
            tcgSectionsWrapper.appendChild(targetSection);
            console.log(`Created new section container: tcg-${sectionId}-section`);
        } else {
            console.error("tcg-sections-wrapper not found. Cannot append new section.");
            return;
        }
    }

    // セクションのHTMLをロード
    try {
        const htmlPath = chrome.runtime.getURL(`html/sections/${sectionId}.html`); // 各セクションのHTMLを個別にロード
        console.log(`Fetching HTML from: ${htmlPath}`);
        const response = await fetch(htmlPath);
        if (!response.ok) {
            throw new Error(`Failed to load HTML for ${sectionId}: ${response.statusText} (${response.status})`);
        }
        const htmlContent = await response.text();
        targetSection.innerHTML = htmlContent;
        console.log(`HTML loaded and injected for section: ${sectionId}`);
    } catch (error) {
        console.error(`Error loading HTML for section ${sectionId}:`, error);
        targetSection.innerHTML = `<p style="color: red;">セクションの読み込みに失敗しました: ${sectionId}<br>エラー: ${error.message}</p>`;
        return; // HTMLロード失敗時は後続処理を中断
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
    // UIのHTML構造を文字列として定義
    const uiHtml = `
        <!-- 右サイドメニューのコンテナ -->
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

        <!-- コンテンツ表示エリア -->
        <div id="tcg-content-area">
            <div id="tcg-sections-wrapper">
                <!-- 各セクションのHTMLコンテンツがここに動的にロードされます -->
                <!-- 初期表示のホームセクションのコンテンツを直接記述 -->
                <div id="tcg-home-section" class="tcg-section active">
                    <h2 class="section-title">ホーム</h2>
                    <p>あの頃の自作TCGアシスタントへようこそ！</p>
                    <p>この拡張機能は、unityroomの『あの頃の自作TCG』をより深く、より楽しくプレイするための様々な機能を提供します。</p>
                    <p>ゲーム体験を拡張し、あなたの戦略をサポートします！</p>

                    <h3>拡張機能でできること</h3>

                    <div class="feature-section">
                        <h4><i class="fas fa-fist-raised"></i> レート戦のサポート</h4>
                        <p>現在のレートやマッチング状況をリアルタイムで確認できます。対戦相手とのチャット機能や、勝利・敗北の報告もスムーズに行えます。</p>
                    </div>

                    <div class="feature-section">
                        <h4><i class="fas fa-clipboard"></i> 戦略メモ機能</h4>
                        <p>対戦中の気づきやアイデアをすぐにメモできます。スクリーンショット機能で、盤面状況を記録することも可能です。</p>
                    </div>

                    <div class="feature-section">
                        <h4><i class="fas fa-search"></i> カード検索機能</h4>
                        <p>あいまい検索や、カードタイプ・収録セットによる絞り込み検索で、目的のカード情報を素早く見つけられます。カードの詳細情報も一目で確認できます。</p>
                    </div>

                    <div class="feature-section">
                        <h4><i class="fas fa-gamepad"></i> ミニゲームで息抜き</h4>
                        <p>カード名当てクイズやイラストクイズなど、ちょっとした時間に楽しめるミニゲームで気分転換しましょう。</p>
                    </div>

                    <div class="feature-section">
                        <h4><i class="fas fa-trophy"></i> 戦いの記録</h4>
                        <p>自分のデッキと相手のデッキ、そして勝敗を記録し、戦績を管理できます。あなたの成長を可視化し、次の戦略に活かしましょう。</p>
                    </div>

                    <div class="feature-section">
                        <h4><i class="fas fa-cube"></i> デッキ分析</h4>
                        <p>デッキのスクリーンショットをアップロードして、デッキの構成を分析し、おすすめカードのサジェストを受け取ることができます。</p>
                    </div>

                    <p style="margin-top: 30px; text-align: center; font-style: italic; color: #666;">
                        この拡張機能は、あなたの『あの頃の自作TCG』ライフをより豊かにするために開発されています。
                    </p>

                    <h3>役立つリンク集</h3>
                    <ul>
                        <li><a href="https://unityroom.com/games/anokorotcg" target="_blank">『あの頃の自作TCG』ゲーム本体</a></li>
                        <li><a href="https://example.com/tcg-wiki" target="_blank">非公式Wiki (例)</a></li>
                        <li><a href="https://example.com/tcg-community" target="_blank">コミュニティフォーラム (例)</a></li>
                    </ul>
                </div>

                <!-- その他のセクションは動的にロードされる -->
                <div id="tcg-rateMatch-section" class="tcg-section"></div>
                <div id="tcg-memo-section" class="tcg-section"></div>
                <div id="tcg-search-section" class="tcg-section"></div>
                <div id="tcg-minigames-section" class="tcg-section"></div>
                <div id="tcg-battleRecord-section" class="tcg-section"></div>
                <div id="tcg-deckAnalysis-section" class="tcg-section"></div>
            </div>
        </div>
    `;

    // 既存のbodyの内容を保持しつつ、UIを挿入する
    const bodyContent = document.body.innerHTML;
    document.body.innerHTML = uiHtml + bodyContent; // UIをbodyの先頭に追加

    // UI要素がDOMに挿入された後に、グローバル変数に参照を割り当てる
    // index.htmlに静的に存在していた要素も、ここで改めて取得する
    screenshotOverlay = document.getElementById('screenshot-overlay');
    screenshotCanvas = document.getElementById('screenshot-canvas');
    cropScreenshotButton = document.getElementById('crop-screenshot-button');
    pasteFullScreenshotButton = document.getElementById('paste-full-screenshot-button');
    cancelCropButton = document.getElementById('cancel-crop-button');

    console.log("UI elements injected into the page.");

    // UI要素がDOMに挿入され、グローバル変数が割り当てられた後に初期化関数を呼び出す
    createRightSideMenu(); // 右サイドメニューのイベントリスナー設定
    initializeExtensionFeatures(); // カードデータロード、スクリーンショット関連初期化

    // 初期表示セクションをロード
    chrome.storage.local.get(['activeSection'], (result) => {
        const activeSection = result.activeSection || 'home';
        showSection(activeSection);
    });
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
