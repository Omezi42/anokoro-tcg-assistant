// js/content.js

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

// スクリーンショットオーバーレイ関連の要素をグローバルで定義
const screenshotOverlay = document.createElement('div');
screenshotOverlay.id = 'screenshot-overlay';
screenshotOverlay.className = 'tcg-modal-overlay'; // tcg-modal-overlay クラスを適用
screenshotOverlay.style.display = 'none'; // 初期状態は非表示
screenshotOverlay.innerHTML = `
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
`;
document.body.appendChild(screenshotOverlay); // bodyに直接追加

const screenshotCanvas = document.getElementById('screenshot-canvas');
const cropScreenshotButton = document.getElementById('crop-screenshot-button');
const pasteFullScreenshotButton = document.getElementById('paste-full-screenshot-button');
const cancelCropButton = document.getElementById('cancel-crop-button');

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
        const existingOverlay = document.getElementById('tcg-custom-dialog-overlay');
        if (existingOverlay) {
            existingOverlay.remove(); // 既存のダイアログがあれば削除
        }

        const overlay = document.createElement('div');
        overlay.id = 'tcg-custom-dialog-overlay';
        overlay.className = 'tcg-modal-overlay';
        overlay.innerHTML = `
            <div class="tcg-modal-content">
                <h3>${title}</h3>
                <p>${message}</p>
                <button id="tcg-dialog-ok-button">OK</button>
                ${isConfirm ? '<button id="tcg-dialog-cancel-button" style="margin-left: 10px; background-color: #6c757d;">キャンセル</button>' : ''}
            </div>
        `;
        document.body.appendChild(overlay);

        // ダイアログを表示するアニメーションクラスを追加
        setTimeout(() => overlay.classList.add('show'), 10);

        const okButton = document.getElementById('tcg-dialog-ok-button');
        okButton.addEventListener('click', () => {
            overlay.classList.remove('show');
            overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
            resolve(true);
        });

        if (isConfirm) {
            const cancelButton = document.getElementById('tcg-dialog-cancel-button');
            cancelButton.addEventListener('click', () => {
                overlay.classList.remove('show');
                overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
                resolve(false);
            });
        }
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
 * トグルボタンはコンテンツエリア内に移動します。
 */
function createRightSideMenu() {
    const menuContainer = document.createElement('div');
    menuContainer.id = 'tcg-right-menu-container';
    // 各メニューアイコンをHTMLに追加
    menuContainer.innerHTML = `
        <div class="tcg-menu-icons-wrapper">
            <button class="tcg-menu-icon" data-section="home" title="ホーム"><i class="fas fa-home"></i></button>
            <button class="tcg-menu-icon" data-section="rate-match" title="レート戦"><i class="fas fa-fist-raised"></i></button>
            <button class="tcg-menu-icon" data-section="memo" title="メモ"><i class="fas fa-clipboard"></i></button>
            <button class="tcg-menu-icon" data-section="search" title="検索"><i class="fas fa-search"></i></button>
            <button class="tcg-menu-icon" data-section="minigames" title="ミニゲーム"><i class="fas fa-gamepad"></i></button>
            <button class="tcg-menu-icon" data-section="battle-record" title="戦いの記録"><i class="fas fa-trophy"></i></button>
            <button class="tcg-menu-icon" data-section="deck" title="デッキ"><i class="fas fa-cube"></i></button>
        </div>
        <button class="tcg-menu-toggle-button" id="tcg-menu-toggle-button" title="メニューを隠す/表示">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;

    document.body.appendChild(menuContainer); // メニューコンテナをbodyに追加

    // DOMに追加された後に要素を取得
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
    const sectionTitleElement = document.getElementById('tcg-section-title');
    const menuIcons = rightMenuContainer.querySelectorAll('.tcg-menu-icon'); // アイコンリストを再取得

    if (!contentArea || !rightMenuContainer || !sectionTitleElement) return;

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

// 現在ロードされているセクションのスクリプトとCSSを追跡
const loadedSectionScripts = {};
const loadedSectionStyles = {};

/**
 * 指定されたセクションを表示し、他のセクションを非表示にします。
 * この関数は、右サイドのメニューアイコンがクリックされたときに呼び出されます。
 * @param {string} sectionId - 表示するセクションのID (例: "home", "rate-match")。
 */
async function showSection(sectionId) {
    console.log(`Attempting to show section: ${sectionId}`);
    // セクションタイトルを更新
    const sectionTitleElement = document.getElementById('tcg-section-title');
    if (sectionTitleElement) {
        sectionTitleElement.textContent = getSectionTitle(sectionId);
    }

    // すべてのセクションを非アクティブにする
    document.querySelectorAll('.tcg-section').forEach(section => {
        section.classList.remove('active');
    });

    // ターゲットセクションのコンテナ
    let targetSection = document.getElementById(`tcg-${sectionId}-section`);
    if (!targetSection) {
        // セクションコンテナがまだ存在しない場合、作成して追加
        targetSection = document.createElement('div');
        targetSection.id = `tcg-${sectionId}-section`;
        targetSection.className = 'tcg-section';
        document.getElementById('tcg-sections-wrapper').appendChild(targetSection);
        console.log(`Created new section container: tcg-${sectionId}-section`);
    }

    // セクションのHTMLをロード
    try {
        const htmlPath = chrome.runtime.getURL(`html/sections/${sectionId}/${sectionId}.html`);
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

    // セクションのCSSをロード
    const cssPath = chrome.runtime.getURL(`css/sections/${sectionId}/${sectionId}.css`);
    if (!loadedSectionStyles[cssPath]) {
        try {
            console.log(`Checking CSS existence: ${cssPath}`);
            const response = await fetch(cssPath, { method: 'HEAD' }); // HEADリクエストで存在確認
            if (response.ok) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = cssPath;
                document.head.appendChild(link);
                loadedSectionStyles[cssPath] = true;
                console.log(`CSS loaded and injected for section: ${sectionId}`);
            } else {
                console.warn(`CSS file not found or accessible: ${cssPath}`);
            }
        } catch (error) {
            console.warn(`Error loading CSS for section ${sectionId}: ${cssPath}`, error);
        }
    } else {
        console.log(`CSS already loaded for section: ${sectionId}`);
    }

    // セクションのJavaScriptをロード
    const jsPath = chrome.runtime.getURL(`js/sections/${sectionId}/${sectionId}.js`);
    const initFunctionName = `init${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}Section`;

    if (!loadedSectionScripts[jsPath]) {
        try {
            console.log(`Checking JS existence: ${jsPath}`);
            const response = await fetch(jsPath, { method: 'HEAD' }); // HEADリクエストで存在確認
            if (response.ok) {
                const script = document.createElement('script');
                script.src = jsPath;
                script.type = 'module'; // ESモジュールとしてロード
                document.body.appendChild(script);
                loadedSectionScripts[jsPath] = true;
                console.log(`JS script element appended for section: ${sectionId}`);

                // スクリプトがロードされてから初期化関数を呼び出す
                script.onload = () => {
                    console.log(`Script loaded: ${jsPath}`);
                    // グローバルスコープに公開された関数を呼び出す
                    if (typeof window[initFunctionName] === 'function') {
                        console.log(`Calling initialization function: ${initFunctionName}`);
                        // 必要な依存関係を渡す
                        window[initFunctionName](allCards, showCustomDialog, document.getElementById('screenshot-area'), screenshotOverlay, screenshotCanvas, screenshotCtx, currentScreenshotImage, startX, startY, endX, endY, isDrawing);
                    } else {
                        console.warn(`Initialization function ${initFunctionName} not found on window object after script load for section ${sectionId}. This might indicate a scoping issue in the section's JS file.`);
                    }
                };
                script.onerror = (e) => {
                    console.error(`Error loading script: ${jsPath}`, e);
                };
            } else {
                console.warn(`JavaScript file not found or accessible: ${jsPath}`);
            }
        } catch (error) {
            console.warn(`Error loading JavaScript for section ${sectionId}: ${jsPath}`, error);
        }
    } else {
        console.log(`JS already loaded for section: ${sectionId}. Attempting to re-call init function.`);
        // 既にロード済みの場合は、初期化関数を再実行
        if (typeof window[initFunctionName] === 'function') {
            console.log(`Re-calling initialization function: ${initFunctionName}`);
            window[initFunctionName](allCards, showCustomDialog, document.getElementById('screenshot-area'), screenshotOverlay, screenshotCanvas, screenshotCtx, currentScreenshotImage, startX, startY, endX, endY, isDrawing);
        } else {
            console.warn(`Initialization function ${initFunctionName} not found on window object for already loaded script for section ${sectionId}.`);
        }
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
        case 'rate-match': return 'レート戦';
        case 'memo': return 'メモ';
        case 'search': return '検索';
        case 'minigames': return 'ミニゲーム';
        case 'battle-record': return '戦いの記録';
        case 'deck': return 'デッキ分析';
        default: return 'あの頃の自作TCGアシスタント';
    }
}


/**
 * 各コンテンツセクションを含むメインコンテンツエリアを作成・挿入します。
 */
function createContentArea() {
    const contentArea = document.createElement('div');
    contentArea.id = 'tcg-content-area';

    contentArea.innerHTML = `
        <div class="tcg-content-header">
            <h2 id="tcg-section-title"></h2>
            <button class="tcg-close-sidebar-button" title="サイドバーを閉じる"><i class="fas fa-times"></i></button>
        </div>
        <div id="tcg-sections-wrapper">
            <!-- 各セクションのHTMLがここに動的にロードされます -->
        </div>
    `;
    document.body.appendChild(contentArea);

    // サイドバーを閉じるボタンのイベントリスナー
    const closeSidebarButton = document.querySelector('.tcg-close-sidebar-button');
    if (closeSidebarButton) {
        closeSidebarButton.addEventListener('click', () => {
            const contentArea = document.getElementById('tcg-content-area');
            const rightMenuContainer = document.getElementById('tcg-right-menu-container');
            const gameCanvas = document.querySelector('canvas#unity-canvas');

            if (contentArea) {
                contentArea.classList.remove('active');
                contentArea.style.right = `-${SIDEBAR_WIDTH}px`;
            }
            // メニューアイコンと背景を非表示にする
            if (rightMenuContainer) {
                isMenuIconsVisible = false;
                updateMenuIconsVisibility();
            }
            if (gameCanvas) {
                gameCanvas.style.display = 'block';
            }
            document.body.classList.remove('game-focused-mode');
            isSidebarOpen = false;
            chrome.storage.local.set({ isSidebarOpen: isSidebarOpen, isMenuIconsVisible: isMenuIconsVisible });

            // 全てのアイコンからactiveクラスを削除
            if (rightMenuContainer) {
                rightMenuContainer.querySelectorAll('.tcg-menu-icon').forEach(btn => btn.classList.remove('active'));
            }
        });
    }
}

/**
 * 拡張機能の各種機能を初期化し、イベントリスナーを設定します。
 */
async function initializeExtensionFeatures() {
    // cards.jsonを読み込む
    try {
        const response = await fetch(chrome.runtime.getURL('json/cards.json'));
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
    if (screenshotCanvas) {
        screenshotCtx = screenshotCanvas.getContext('2d');

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
            const screenshotAreaElement = document.getElementById('screenshot-area'); // メモセクションのscreenshot-areaを取得
            if (!screenshotAreaElement || !currentScreenshotImage || !screenshotOverlay || !screenshotCanvas || !screenshotCtx) {
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
            const screenshotAreaElement = document.getElementById('screenshot-area'); // メモセクションのscreenshot-areaを取得
            if (!screenshotAreaElement || !currentScreenshotImage || !screenshotOverlay) return;
            
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
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        createRightSideMenu();
        createContentArea();
        initializeExtensionFeatures();
        // 初期表示セクションをロード
        chrome.storage.local.get(['activeSection'], (result) => {
            const activeSection = result.activeSection || 'home';
            showSection(activeSection);
        });
    });
} else {
    createRightSideMenu();
    createContentArea();
    initializeExtensionFeatures();
    // 初期表示セクションをロード
    chrome.storage.local.get(['activeSection'], (result) => {
        const activeSection = result.activeSection || 'home';
        showSection(activeSection);
    });
}

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

            if (gameCanvas) {
                gameCanvas.style.display = 'block';
            }
            document.body.classList.remove('game-focused-mode');
            isSidebarOpen = false;
            rightMenuContainer.querySelectorAll('.tcg-menu-icon').forEach(btn => btn.classList.remove('active'));
        } else {
            contentArea.classList.add('active');
            contentArea.style.right = '0px';
            isMenuIconsVisible = true; 
            updateMenuIconsVisibility(); 

            if (gameCanvas) {
                gameCanvas.style.display = 'block';
            }
            document.body.classList.remove('game-focused-mode');
            isSidebarOpen = true;
            
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
            isMenuIconsVisible = false; // メニューアイコンは非表示状態
            updateMenuIconsVisibility(); // これでメニューアイコンラッパーが非表示になる
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
