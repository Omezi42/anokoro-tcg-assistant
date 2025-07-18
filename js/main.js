// js/main.js

(async () => {
    // スクリプトが複数回実行されるのを防ぐ
    if (window.tcgAssistantInitialized) {
        return;
    }
    window.tcgAssistantInitialized = true;

    console.log("main.js: Script loaded and initializing.");

    const a = (typeof browser !== "undefined") ? browser : chrome;
    if (typeof a === "undefined" || typeof a.runtime === "undefined") {
        console.error("TCG Assistant: Could not find browser/chrome runtime API. Extension features will not work.");
        return;
    }

    // --- グローバルスコープのセットアップ ---
    window.tcgAssistant = {
        allCards: [],
        trivia: [],
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
        activeSection: 'home',
        // 画像取得用のヘルパー関数をグローバルに定義
        fetchImage: async (url) => {
            try {
                const response = await a.runtime.sendMessage({ action: "fetchImageAsDataURL", url });
                if (response && response.success) {
                    return response.dataUrl;
                }
                throw new Error(response?.error || 'Background script returned an error.');
            } catch (e) {
                console.error(`Failed to communicate with background script for image fetch: ${url}`, e);
                window.showCustomDialog("通信エラー", `拡張機能のバックグラウンドプロセスとの通信に失敗しました。拡張機能を再読み込みしてください。<br><br>エラー: ${e.message}`);
                return null;
            }
        }
    };

    // --- 共通関数の定義 ---

    const injectResources = () => {
        const fontAwesomeLink = document.createElement('link');
        fontAwesomeLink.rel = 'stylesheet';
        fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
        document.head.appendChild(fontAwesomeLink);

        const googleFontsLink = document.createElement('link');
        googleFontsLink.rel = 'stylesheet';
        googleFontsLink.href = 'https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700&display=swap';
        document.head.appendChild(googleFontsLink);
    };

    window.showCustomDialog = (title, message, isConfirm = false) => {
        return new Promise((resolve) => {
            const overlay = document.getElementById('tcg-custom-dialog-overlay');
            if (!overlay) return resolve(false);
            const dialogTitle = overlay.querySelector('#tcg-dialog-title');
            const dialogMessage = overlay.querySelector('#tcg-dialog-message');
            const buttonsWrapper = overlay.querySelector('#tcg-dialog-buttons');
            dialogTitle.textContent = title;
            dialogMessage.innerHTML = message;
            buttonsWrapper.innerHTML = '';
            const okButton = document.createElement('button');
            okButton.textContent = isConfirm ? 'はい' : 'OK';
            okButton.onclick = () => { overlay.classList.remove('show'); resolve(true); };
            buttonsWrapper.appendChild(okButton);
            if (isConfirm) {
                const cancelButton = document.createElement('button');
                cancelButton.textContent = 'キャンセル';
                cancelButton.onclick = () => { overlay.classList.remove('show'); resolve(false); };
                buttonsWrapper.appendChild(cancelButton);
            }
            overlay.classList.add('show');
        });
    };

    // カード詳細モーダル表示（画像取得をバックグラウンドに依頼）
    window.showCardDetailModal = async (card, currentIndex, searchResults) => {
        if (!card) return;
        
        const existingModal = document.getElementById('tcg-card-detail-modal-overlay');
        if (existingModal) existingModal.remove();

        const externalUrl = `https://omezi42.github.io/tcg-assistant-images/cards/${encodeURIComponent(card.name)}.png`;
        const cardImageUrl = await window.tcgAssistant.fetchImage(externalUrl) || 'https://placehold.co/200x280/eee/333?text=No+Image';
        
        const getInfo = (prefix) => card.info.find(i => i.startsWith(prefix))?.replace(prefix, '').replace('です。', '') || 'N/A';
        const getEffect = () => card.info.find(i => i.startsWith("このカードの効果は、「"))?.replace("このカードの効果は、「", "").replace("」です。", "") || '（効果なし）';
        const getLore = () => card.info.find(i => i.startsWith("このカードの世界観は、「"))?.replace("このカードの世界観は、「", "").replace("」です。", "");

        const modalHtml = `
            <div class="tcg-card-detail-modal-content">
                <button id="tcg-card-detail-close-button" title="閉じる">&times;</button>
                <div class="card-preview-pane">
                     <img src="${cardImageUrl}" alt="${card.name}">
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
                const isShowingEffect = loreButton.textContent === '世界観';
                effectDisplay.textContent = isShowingEffect ? getLore() : getEffect();
                loreButton.textContent = isShowingEffect ? '効果' : '世界観';
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

    window.showSection = async (sectionId) => {
        if (!sectionId) return;
        window.tcgAssistant.activeSection = sectionId;
        a.storage.local.set({ activeSection: sectionId });

        document.querySelectorAll('.tcg-menu-icon').forEach(icon => icon.classList.toggle('active', icon.dataset.section === sectionId));
        document.querySelectorAll('.tcg-section').forEach(section => section.classList.remove('active'));

        const sectionsWrapper = document.getElementById('tcg-sections-wrapper');
        let targetSection = document.getElementById(`tcg-${sectionId}-section`);

        if (!targetSection) {
            targetSection = document.createElement('div');
            targetSection.id = `tcg-${sectionId}-section`;
            targetSection.className = 'tcg-section';
            sectionsWrapper.appendChild(targetSection);
        }

        const loadAndInit = async () => {
            try {
                const modulePath = a.runtime.getURL(`js/sections/${sectionId}.js`);
                const sectionModule = await import(modulePath);
                if (sectionModule && typeof sectionModule.initialize === 'function') {
                    sectionModule.initialize();
                }
            } catch (error) {
                console.error(`Error loading module for ${sectionId}:`, error);
            }
        };

        if (targetSection.innerHTML.trim() === '') {
            try {
                const response = await fetch(a.runtime.getURL(`html/sections/${sectionId}.html`));
                if (!response.ok) throw new Error(`HTML fetch failed: ${response.statusText}`);
                targetSection.innerHTML = await response.text();
                await loadAndInit();
            } catch (error) {
                targetSection.innerHTML = `<p style="color: red;">セクションの読み込みに失敗しました。</p>`;
            }
        } else {
            await loadAndInit();
        }
        
        targetSection.classList.add('active');
    };

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
            window.showSection(sectionId || window.tcgAssistant.activeSection);
        }
    };

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
            <div id="tcg-bird-container">
                <div id="tcg-menu-toggle-bird" style="background-image: url('${birdImageUrl}')" title="アシスタントメニュー"></div>
                <div id="tcg-bird-speech-bubble" class="hidden"></div>
            </div>
            <div id="tcg-custom-dialog-overlay">
                <div class="tcg-modal-content">
                    <h3 id="tcg-dialog-title"></h3>
                    <p id="tcg-dialog-message"></p>
                    <div class="dialog-buttons" id="tcg-dialog-buttons"></div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', uiHtml);
        window.tcgAssistant.uiInjected = true;
        attachEventListeners();
        await initializeFeatures();
    };

    const attachEventListeners = () => {
        const birdContainer = document.getElementById('tcg-bird-container');
        const birdToggle = document.getElementById('tcg-menu-toggle-bird');
        let isDragging = false, wasDragged = false, offsetX, offsetY;
        birdToggle.addEventListener('mousedown', (e) => {
            isDragging = true; wasDragged = false;
            birdToggle.classList.add('is-dragging');
            const rect = birdContainer.getBoundingClientRect();
            offsetX = e.clientX - rect.left; offsetY = e.clientY - rect.top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                wasDragged = true;
                const parentRect = document.body.getBoundingClientRect();
                let newX = e.clientX - offsetX;
                let newY = e.clientY - offsetY;
                newX = Math.max(0, Math.min(newX, parentRect.width - birdContainer.offsetWidth));
                newY = Math.max(0, Math.min(newY, parentRect.height - birdContainer.offsetHeight));
                birdContainer.style.left = `${newX}px`; birdContainer.style.top = `${newY}px`;
                birdContainer.style.right = 'auto'; birdContainer.style.bottom = 'auto';
            }
        });
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                birdToggle.classList.remove('is-dragging');
                a.storage.local.set({ birdPosition: { top: birdContainer.style.top, left: birdContainer.style.left } });
            }
        });
        birdToggle.addEventListener('click', (e) => {
            if (wasDragged) { e.stopPropagation(); wasDragged = false; return; }
            window.toggleSidebar();
        });
        birdToggle.addEventListener('dblclick', () => showRandomChatter());
        document.querySelectorAll('.tcg-menu-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                const sectionId = e.currentTarget.dataset.section;
                const contentArea = document.getElementById('tcg-content-area');
                if (contentArea.classList.contains('active') && window.tcgAssistant.activeSection === sectionId) {
                    window.toggleSidebar();
                } else {
                    window.toggleSidebar(sectionId, true);
                }
            });
        });
    };
    
    const showChatter = (html, answerCardName = null) => {
        const bubble = document.getElementById('tcg-bird-speech-bubble');
        if (!bubble) return;
        const container = document.getElementById('tcg-bird-container');
        const containerRect = container.getBoundingClientRect();
        bubble.classList.toggle('align-left', containerRect.left + (containerRect.width / 2) < window.innerWidth / 2);
        bubble.classList.toggle('align-right', containerRect.left + (containerRect.width / 2) >= window.innerWidth / 2);
        bubble.innerHTML = html;
        bubble.classList.remove('hidden');
        const hideBubble = () => { bubble.classList.add('hidden'); bubble.onclick = null; };
        if (answerCardName) {
            bubble.onclick = () => {
                bubble.innerHTML = `正解は「<strong>${answerCardName}</strong>」でした！<small>（クリックで閉じる）</small>`;
                bubble.onclick = hideBubble;
                setTimeout(hideBubble, 5000);
            };
        } else {
            bubble.onclick = hideBubble;
            setTimeout(hideBubble, 7000);
        }
    };

    const showLoreQuiz = () => {
        const cardsWithLore = window.tcgAssistant.allCards?.filter(c => c.info.some(i => i.startsWith("このカードの世界観は、「") && i.length > 20));
        if (!cardsWithLore || cardsWithLore.length === 0) return;
        const card = cardsWithLore[Math.floor(Math.random() * cardsWithLore.length)];
        const lore = card.info.find(i => i.startsWith("このカードの世界観は、「")).replace("このカードの世界観は、「", "").replace("」です。", "");
        showChatter(`「${lore}」<br>このカードはな～んだ？<small>（クリックで答えを見る）</small>`, card.name);
    };

    const showRandomChatter = () => {
        const { trivia, allCards } = window.tcgAssistant;
        if ((!allCards || allCards.length === 0) && (!trivia || trivia.length === 0)) return;
        if (Math.random() < 0.5 && trivia?.length > 0) {
            showChatter(trivia[Math.floor(Math.random() * trivia.length)]);
        } else if (allCards?.length > 0) {
            showLoreQuiz();
        }
    };

    const initializeFeatures = async () => {
        try {
            const cardResponse = await fetch(a.runtime.getURL('json/cards.json'));
            window.tcgAssistant.allCards = await cardResponse.json();
            const triviaResponse = await fetch(a.runtime.getURL('json/trivia.json'));
            window.tcgAssistant.trivia = await triviaResponse.json();
            document.dispatchEvent(new CustomEvent('cardsLoaded'));
        } catch (error) {
            window.showCustomDialog('エラー', `データ読み込みエラー: ${error.message}`);
        }
        const result = await a.storage.local.get(['isSidebarOpen', 'activeSection', 'birdPosition']);
        window.tcgAssistant.activeSection = result.activeSection || 'home';
        const birdContainer = document.getElementById('tcg-bird-container');
        if (result.birdPosition?.top && result.birdPosition?.left) {
            birdContainer.style.top = result.birdPosition.top;
            birdContainer.style.left = result.birdPosition.left;
        }
        if (result.isSidebarOpen) {
            window.toggleSidebar(null, true);
        } else {
            document.querySelectorAll('.tcg-menu-icon').forEach(icon => icon.classList.toggle('active', icon.dataset.section === window.tcgAssistant.activeSection));
        }
        setInterval(showRandomChatter, 90000);
    };

    a.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "showSection") {
            window.toggleSidebar(request.section, request.forceOpenSidebar);
        } else if (request.action === "toggleSidebar") {
            window.toggleSidebar();
        }
        return true; 
    });

    injectResources();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectUI);
    } else {
        injectUI();
    }
})();
