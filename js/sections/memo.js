// js/sections/memo.js - 修正版

window.initMemoSection = async function() {
    console.log("Memo section initialized.");

    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    // === DOM要素の取得 ===
    const saveMemoButton = document.getElementById('save-memo-button');
    const memoTextArea = document.getElementById('memo-text-area');
    const savedMemosList = document.getElementById('saved-memos-list');
    const screenshotArea = document.getElementById('screenshot-area');
    const memoSearchInput = document.getElementById('memo-search-input');
    const memoSearchButton = document.getElementById('memo-search-button');
    let editingMemoIndex = -1;

    /**
     * メモをUIに表示するヘルパー関数
     */
    const displayMemos = (memos, filterQuery = '') => {
        if (!savedMemosList) return;
        savedMemosList.innerHTML = '';

        const filteredMemos = memos.filter(memo =>
            memo.content.toLowerCase().includes(filterQuery.toLowerCase()) ||
            memo.timestamp.includes(filterQuery)
        );

        if (filteredMemos.length === 0) {
            savedMemosList.innerHTML = `<li>まだメモがありません。</li>`;
        } else {
            [...filteredMemos].reverse().forEach((memo) => {
                const originalIndex = memos.findIndex(m => m.timestamp === memo.timestamp && m.content === memo.content);
                if (originalIndex === -1) return;

                const memoItem = document.createElement('li');
                memoItem.className = 'saved-memo-item';
                memoItem.innerHTML = `
                    <strong>${memo.timestamp}</strong>: ${memo.content}
                    <button class="delete-memo-button" data-original-index="${originalIndex}" title="削除"><i class="fas fa-trash-alt"></i></button>
                    <button class="edit-memo-button" data-original-index="${originalIndex}" title="編集"><i class="fas fa-edit"></i></button>
                    ${memo.screenshotUrl ? `<br><img src="${memo.screenshotUrl}" alt="スクリーンショット" style="max-width: 100%; height: auto; margin-top: 10px; border-radius: 5px;">` : ''}
                `;
                savedMemosList.appendChild(memoItem);
            });
            
            savedMemosList.querySelectorAll('.delete-memo-button').forEach(button => {
                button.addEventListener('click', handleDeleteMemoClick);
            });
            savedMemosList.querySelectorAll('.edit-memo-button').forEach(button => {
                button.addEventListener('click', handleEditMemoClick);
            });
        }
    };

    /**
     * ログイン状態に基づいてメモをロードして表示する
     */
    const loadAndDisplayMemos = async () => {
        const assistant = window.TCG_ASSISTANT;
        const filterQuery = memoSearchInput ? memoSearchInput.value.trim() : '';

        if (assistant.isLoggedIn) {
            // ログイン済み: グローバルステートのデータを使用
            console.log("Memo: Logged in. Loading memos from server data.");
            displayMemos(assistant.userMemos || [], filterQuery);
        } else {
            // 未ログイン: ローカルストレージから読み込む
            console.log("Memo: Not logged in. Displaying local memo data.");
            browser.storage.local.get(['savedMemosLocal'], (result) => {
                displayMemos(result.savedMemosLocal || [], filterQuery);
            });
        }
    };

    /**
     * メモデータを保存する (ログイン状態に応じて送信先を切り替え)
     */
    const saveMemos = async (memosToSave) => {
        const assistant = window.TCG_ASSISTANT;
        if (assistant.isLoggedIn) {
            // サーバーに保存
            if (!assistant.ws || assistant.ws.readyState !== WebSocket.OPEN) {
                await window.showCustomDialog('エラー', 'サーバーに接続していません。メモは保存されませんでした。');
                return;
            }
            assistant.userMemos = memosToSave; // グローバルステートを更新
            assistant.ws.send(JSON.stringify({
                type: 'update_user_data', // バックエンドでこのタイプを処理する必要がある
                userId: assistant.currentUserId,
                memos: memosToSave
            }));
            await window.showCustomDialog('保存完了', 'メモをサーバーに保存しました！');
        } else {
            // ローカルに保存
            browser.storage.local.set({ savedMemosLocal: memosToSave }, () => {
                window.showCustomDialog('保存完了', 'メモをローカルに保存しました！');
            });
        }
        loadAndDisplayMemos();
    };

    // === イベントハンドラ ===
    const handleSaveMemoButtonClick = async () => {
        const memoContent = memoTextArea.value.trim();
        const currentScreenshot = screenshotArea.querySelector('img');
        const screenshotUrl = currentScreenshot ? currentScreenshot.src : null;

        if (!memoContent && !screenshotUrl) {
            window.showCustomDialog('エラー', 'メモ内容が空か、スクリーンショットがありません。');
            return;
        }

        const assistant = window.TCG_ASSISTANT;
        let memos;
        if (assistant.isLoggedIn) {
            memos = [...(assistant.userMemos || [])];
        } else {
            const result = await new Promise(resolve => browser.storage.local.get(['savedMemosLocal'], resolve));
            memos = result.savedMemosLocal || [];
        }

        const timestamp = new Date().toLocaleString();
        if (editingMemoIndex !== -1) {
            memos[editingMemoIndex].content = memoContent;
            memos[editingMemoIndex].timestamp = timestamp;
            memos[editingMemoIndex].screenshotUrl = screenshotUrl;
        } else {
            memos.push({ timestamp, content: memoContent, screenshotUrl });
        }

        await saveMemos(memos);

        memoTextArea.value = '';
        screenshotArea.innerHTML = '<p>スクリーンショットがここに表示されます。（画像をここに貼り付けることもできます - Ctrl+V / Cmd+V）</p>';
        editingMemoIndex = -1;
    };

    const handleDeleteMemoClick = async (event) => {
        const originalIndexToDelete = parseInt(event.currentTarget.dataset.originalIndex);
        const confirmed = await window.showCustomDialog('メモ削除', 'このメモを削除しますか？', true);
        if (confirmed) {
            const assistant = window.TCG_ASSISTANT;
            let memos;
            if (assistant.isLoggedIn) {
                memos = [...(assistant.userMemos || [])];
            } else {
                const result = await new Promise(resolve => browser.storage.local.get(['savedMemosLocal'], resolve));
                memos = result.savedMemosLocal || [];
            }
            if (originalIndexToDelete > -1 && originalIndexToDelete < memos.length) {
                memos.splice(originalIndexToDelete, 1);
                await saveMemos(memos);
            }
        }
    };

    const handleEditMemoClick = async (event) => {
        const originalIndexToEdit = parseInt(event.currentTarget.dataset.originalIndex);
        const assistant = window.TCG_ASSISTANT;
        let memos;
        if (assistant.isLoggedIn) {
            memos = assistant.userMemos || [];
        } else {
            const result = await new Promise(resolve => browser.storage.local.get(['savedMemosLocal'], resolve));
            memos = result.savedMemosLocal || [];
        }
        
        if (originalIndexToEdit > -1 && originalIndexToEdit < memos.length) {
            const memoToEdit = memos[originalIndexToEdit];
            memoTextArea.value = memoToEdit.content;
            screenshotArea.innerHTML = memoToEdit.screenshotUrl 
                ? `<img src="${memoToEdit.screenshotUrl}" alt="Screenshot">`
                : '<p>スクリーンショットがここに表示されます。（画像をここに貼り付けることもできます - Ctrl+V / Cmd+V）</p>';
            editingMemoIndex = originalIndexToEdit;
            window.showCustomDialog('メモ編集', '内容を変更して「メモを保存」ボタンを押してください。');
        }
    };

    const handleImagePaste = (event) => {
        const items = event.clipboardData.items;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    screenshotArea.innerHTML = `<img src="${e.target.result}" alt="Pasted Image">`;
                    window.showCustomDialog('貼り付け完了', '画像をメモエリアに貼り付けました。');
                };
                reader.readAsDataURL(item.getAsFile());
                return;
            }
        }
    };

    // === イベントリスナー設定 ===
    saveMemoButton?.addEventListener('click', handleSaveMemoButtonClick);
    memoSearchButton?.addEventListener('click', loadAndDisplayMemos);
    memoSearchInput?.addEventListener('keypress', (e) => e.key === 'Enter' && loadAndDisplayMemos());
    screenshotArea?.addEventListener('paste', handleImagePaste);

    // ★★★ 修正点 ★★★
    // loginStateChangedイベントをリッスンして、UIを更新
    window.TCG_ASSISTANT.removeEventListener('loginStateChanged', loadAndDisplayMemos); // 重複登録防止
    window.TCG_ASSISTANT.addEventListener('loginStateChanged', loadAndDisplayMemos);

    // --- 初期化処理 ---
    loadAndDisplayMemos();
};

void 0;
