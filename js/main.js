// js/main.js

(async () => {
    // スクリプトが複数回実行されるのを防ぐ
    if (window.tcgAssistantInitialized) {
        return;
    }
    window.tcgAssistantInitialized = true;

    console.log("main.js: Script loaded and initializing.");

    // FirefoxとChromeのAPI名前空間の互換性を確保
    const a = self.browser || self.chrome;

    // --- グローバルスコープのセットアップ ---
    window.tcgAssistant = {
        allCards: [],
        isSidebarOpen: false,
        uiInjected: false,
        currentRate: 1500,
        currentUsername: null,
        currentUserId: null,
        userMatchHistory: [],
        userMemos: [],
        userBattleRecords: [],
        userRegisteredDecks: [],
        ws: null,
        activeSection: 'home'
    };

    /**
     * 必要なリソース（CSS、フォント）をページに注入します。
     */
    const injectResources = () => {
        // Font Awesome
        const fontAwesomeLink = document.createElement('link');
        fontAwesomeLink.rel = 'stylesheet';
        fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
        document.head.appendChild(fontAwesomeLink);

        // Google Fonts
        const googleFontsLink = document.createElement('link');
        googleFontsLink.rel = 'stylesheet';
        googleFontsLink.href = 'https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700&display=swap';
        document.head.appendChild(googleFontsLink);
        console.log("main.js: Resources injected.");
    };

    /**
     * カスタムダイアログを表示します。
     * @param {string} title - ダイアログのタイトル
     * @param {string} message - 表示するメッセージ
     * @param {boolean} isConfirm - 確認ダイアログ（OK/キャンセル）かどうか
     * @returns {Promise<boolean>} OKでtrue、キャンセルでfalseを解決するPromise
     */
    window.showCustomDialog = (title, message, isConfirm = false) => {
        return new Promise((resolve) => {
            const overlay = document.getElementById('tcg-custom-dialog-overlay');
            if (!overlay) {
                console.error("Custom dialog overlay not found.");
                return resolve(false);
            }
            const dialogTitle = overlay.querySelector('#tcg-dialog-title');
            const dialogMessage = overlay.querySelector('#tcg-dialog-message');
            const buttonsWrapper = overlay.querySelector('#tcg-dialog-buttons');

            dialogTitle.textContent = title;
            dialogMessage.innerHTML = message;
            buttonsWrapper.innerHTML = ''; // ボタンをクリア

            const okButton = document.createElement('button');
            okButton.textContent = 'OK';
            okButton.onclick = () => {
                overlay.classList.remove('show');
                resolve(true);
            };
            buttonsWrapper.appendChild(okButton);

            if (isConfirm) {
                const cancelButton = document.createElement('button');
                cancelButton.textContent = 'キャンセル';
                cancelButton.onclick = () => {
                    overlay.classList.remove('show');
                    resolve(false);
                };
                buttonsWrapper.appendChild(cancelButton);
            }
            overlay.classList.add('show');
        });
    };

    /**
     * カード詳細モーダルを表示します。
     * @param {object} card - 表示するカードオブジェクト
     * @param {number} currentIndex - 現在のカードのインデックス
     * @param {Array} searchResults - 検索結果の全カード配列
     */
    window.showCardDetailModal = (card, currentIndex, searchResults) => {
        if (!card) return;
        
        const existingModal = document.getElementById('tcg-card-detail-modal-overlay');
        if (existingModal) existingModal.remove();

        const cardImageUrl = a.runtime.getURL(`images/cards/${encodeURIComponent(card.image_filename)}.png`);
        
        const getInfo = (prefix) => card.info.find(i => i.startsWith(prefix))?.replace(prefix, '').replace('です。', '') || 'N/A';
        const getEffect = () => card.info.find(i => i.startsWith("このカードの効果は、「"))?.replace("このカードの効果は、「", "").replace("」です。", "") || '（効果なし）';
        const getLore = () => card.info.find(i => i.startsWith("このカードの世界観は、「"))?.replace("このカードの世界観は、「", "").replace("」です。", "");

        const modalHtml = `
            <div class="tcg-card-detail-modal-content">
                <button id="tcg-card-detail-close-button" title="閉じる">&times;</button>
                <div class="card-preview-pane">
                     <img src="${cardImageUrl}" alt="${card.name}" onerror="this.src='https://placehold.co/200x280/eee/333?text=No+Image'">
                </div>
                <div class="card-info-pane">
                    <div class="card-info-header">
                        <div class="card-info-cost">${getInfo("このカードのコストは")}</div>
                        <h2>${card.name}</h2>
                    </div>
                    <div class="card-info-body">
                        <p class="card-info-effect">${getEffect()}</p>
                    </div>
                    <div class="card-info-footer">
                        <button id="lore-button" ${getLore() ? '' : 'style="display:none;"'}>世界観</button>
                        <div class="nav-buttons">
                            <button id="prev-card-button" ${currentIndex > 0 ? '' : 'disabled'}>前</button>
                            <button id="next-card-button" ${currentIndex < searchResults.length - 1 ? '' : 'disabled'}>次</button>
                        </div>
                    </div>
                </div>
            </div>`;

        const overlay = document.createElement('div');
        overlay.id = 'tcg-card-detail-modal-overlay';
        overlay.innerHTML = modalHtml;
        document.body.appendChild(overlay);

        const closeModal = () => overlay.remove();

        overlay.querySelector('#tcg-card-detail-close-button').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

        const loreButton = overlay.querySelector('#lore-button');
        if (loreButton) {
            loreButton.addEventListener('click', () => {
                const effectDisplay = overlay.querySelector('.card-info-effect');
                const isShowingLore = loreButton.textContent === '世界観';
                effectDisplay.textContent = isShowingLore ? getLore() : getEffect();
                loreButton.textContent = isShowingLore ? '効果' : '世界観';
            });
        }

        const prevButton = overlay.querySelector('#prev-card-button');
        if (prevButton && !prevButton.disabled) {
            prevButton.addEventListener('click', () => window.showCardDetailModal(searchResults[currentIndex - 1], currentIndex - 1, searchResults));
        }

        const nextButton = overlay.querySelector('#next-card-button');
        if (nextButton && !nextButton.disabled) {
            nextButton.addEventListener('click', () => window.showCardDetailModal(searchResults[currentIndex + 1], currentIndex + 1, searchResults));
        }
        
        setTimeout(() => overlay.classList.add('show'), 10);
    };

    /**
     * 指定されたセクションを表示します。
     * @param {string} sectionId - 表示するセクションのID
     */
    window.showSection = async (sectionId) => {
        if (!sectionId) return;
        console.log(`Showing section: ${sectionId}`);
        window.tcgAssistant.activeSection = sectionId;
        a.storage.local.set({ activeSection: sectionId });

        document.querySelectorAll('.tcg-menu-icon').forEach(icon => {
            icon.classList.toggle('active', icon.dataset.section === sectionId);
        });

        document.querySelectorAll('.tcg-section').forEach(section => {
            section.classList.remove('active');
        });

        const sectionsWrapper = document.getElementById('tcg-sections-wrapper');
        let targetSection = document.getElementById(`tcg-${sectionId}-section`);

        if (!targetSection) {
            targetSection = document.createElement('div');
            targetSection.id = `tcg-${sectionId}-section`;
            targetSection.className = 'tcg-section';
            sectionsWrapper.appendChild(targetSection);
        }

        if (targetSection.innerHTML.trim() === '') {
            try {
                const response = await fetch(a.runtime.getURL(`html/sections/${sectionId}.html`));
                if (!response.ok) throw new Error(`HTML fetch failed: ${response.statusText}`);
                targetSection.innerHTML = await response.text();
            } catch (error) {
                console.error(`Error loading HTML for section ${sectionId}:`, error);
                targetSection.innerHTML = `<p style="color: red;">セクションの読み込みに失敗しました。</p>`;
            }
        }
        
        targetSection.classList.add('active');

        // 対応するJSモジュールを動的にインポートして初期化
        try {
            const modulePath = a.runtime.getURL(`js/sections/${sectionId}.js`);
            const sectionModule = await import(modulePath);
            if (sectionModule.initialize) {
                sectionModule.initialize();
            }
        } catch (error) {
            console.error(`Error loading or initializing module for section ${sectionId}:`, error);
        }
    };

    /**
     * サイドバーの表示/非表示を切り替えます。
     * @param {string | null} sectionId - 表示するセクションID。nullの場合はトグル。
     * @param {boolean} forceOpen - 強制的に開くか
     */
    window.toggleSidebar = (sectionId = null, forceOpen = false) => {
        const contentArea = document.getElementById('tcg-content-area');
        const birdToggle = document.getElementById('tcg-menu-toggle-bird');
        if (!contentArea || !birdToggle) return;

        const shouldOpen = forceOpen || !window.tcgAssistant.isSidebarOpen;
        
        window.tcgAssistant.isSidebarOpen = shouldOpen;
        contentArea.classList.toggle('active', shouldOpen);
        birdToggle.classList.toggle('open', shouldOpen);
        a.storage.local.set({ isSidebarOpen: shouldOpen });

        if (shouldOpen) {
            const targetSection = sectionId || window.tcgAssistant.activeSection;
            window.showSection(targetSection);
        }
    };

    /**
     * 拡張機能のUIをページに挿入します。
     */
    const injectUI = async () => {
        if (window.tcgAssistant.uiInjected) return;

        const birdImageUrl = a.runtime.getURL('images/irust_桜小鳥.png');
        const uiHtml = `
            <div id="tcg-content-area">
                <div id="tcg-sidebar-header">
                    <button class="tcg-menu-icon" data-section="home" title="ホーム"><i class="fas fa-home"></i></button>
                    <button class="tcg-menu-icon" data-section="rateMatch" title="レート戦"><i class="fas fa-fist-raised"></i></button>
                    <button class="tcg-menu-icon" data-section="battleRecord" title="戦いの記録"><i class="fas fa-trophy"></i></button>
                    <button class="tcg-menu-icon" data-section="memo" title="メモ"><i class="fas fa-clipboard"></i></button>
                    <button class="tcg-menu-icon" data-section="search" title="検索"><i class="fas fa-search"></i></button>
                    <button class="tcg-menu-icon" data-section="minigames" title="ミニゲーム"><i class="fas fa-gamepad"></i></button>
                </div>
                <div id="tcg-sections-wrapper"></div>
            </div>
            <div id="tcg-menu-toggle-bird" style="background-image: url('${birdImageUrl}')" title="アシスタントメニュー"></div>
            <div id="tcg-custom-dialog-overlay">
                <div class="tcg-modal-content">
                    <h3 id="tcg-dialog-title"></h3>
                    <p id="tcg-dialog-message"></p>
                    <div class="dialog-buttons" id="tcg-dialog-buttons"></div>
                </div>
            </div>`;

        document.body.insertAdjacentHTML('beforeend', uiHtml);
        window.tcgAssistant.uiInjected = true;
        console.log("main.js: UI injected.");

        attachEventListeners();
        await initializeFeatures();
    };

    /**
     * UI要素にイベントリスナーを設定します。
     */
    const attachEventListeners = () => {
        document.getElementById('tcg-menu-toggle-bird').addEventListener('click', () => window.toggleSidebar());
        document.querySelectorAll('.tcg-menu-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                const sectionId = e.currentTarget.dataset.section;
                const contentArea = document.getElementById('tcg-content-area');
                // サイドバーが既に開いていて同じアイコンをクリックした場合は閉じる
                if (contentArea.classList.contains('active') && window.tcgAssistant.activeSection === sectionId) {
                    window.toggleSidebar();
                } else {
                    window.toggleSidebar(sectionId, true);
                }
            });
        });
    };

    /**
     * 拡張機能のコア機能を初期化します。
     */
    const initializeFeatures = async () => {
        try {
            const response = await fetch(a.runtime.getURL('json/cards.json'));
            window.tcgAssistant.allCards = await response.json();
            console.log(`main.js: ${window.tcgAssistant.allCards.length} cards loaded.`);
            document.dispatchEvent(new CustomEvent('cardsLoaded'));
        } catch (error) {
            console.error("main.js: Failed to load card data:", error);
            window.showCustomDialog('エラー', `カードデータの読み込みに失敗しました: ${error.message}`);
        }

        const result = await a.storage.local.get(['isSidebarOpen', 'activeSection']);
        window.tcgAssistant.activeSection = result.activeSection || 'home';
        if (result.isSidebarOpen) {
            window.toggleSidebar(null, true);
        } else {
            // アイコンのアクティブ状態だけ設定
            document.querySelectorAll('.tcg-menu-icon').forEach(icon => {
                icon.classList.toggle('active', icon.dataset.section === window.tcgAssistant.activeSection);
            });
        }
    };

    // --- メッセージリスナー ---
    a.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "showSection") {
            window.toggleSidebar(request.section, request.forceOpenSidebar);
        } else if (request.action === "toggleSidebar") {
            window.toggleSidebar();
        }
        return true; 
    });

    // --- 実行開始 ---
    injectResources();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectUI);
    } else {
        injectUI();
    }
})();
