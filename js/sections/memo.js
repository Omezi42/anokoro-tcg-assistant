// js/sections/memo.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initMemoSection = async function() { // async を追加
    console.log("Memo section initialized.");

    // Firefox互換性のためのbrowserオブジェクトのフォールバック
    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    // === メモセクションのロジック ===
    const saveMemoButton = document.getElementById('save-memo-button');
    const memoTextArea = document.getElementById('memo-text-area');
    const savedMemosList = document.getElementById('saved-memos-list');
    const screenshotArea = document.getElementById('screenshot-area');
    const memoSearchInput = document.getElementById('memo-search-input');
    const memoSearchButton = document.getElementById('memo-search-button');
    let editingMemoIndex = -1; // 編集中のメモのインデックス

    // ユーザーのメモデータを保持するグローバル変数
    // rateMatch.jsからログイン時にセットされることを期待
    window.userMemos = window.userMemos || [];

    // 保存されたメモを読み込む関数 (サーバーから)
    const loadMemos = (filterQuery = '') => {
        if (!savedMemosList) return;

        // ログインしていない場合はローカルストレージから読み込むか、表示を切り替える
        if (!window.currentUserId) {
            console.log("Memo: Not logged in. Displaying local memo data (if any).");
            browser.storage.local.get(['savedMemosLocal'], (result) => {
                const memos = result.savedMemosLocal || [];
                displayMemos(memos, filterQuery, false); // ローカルストレージからの表示
            });
            return;
        }

        console.log("Memo: Logged in. Loading memos from server data.");
        const memos = window.userMemos || []; // ログイン時にrateMatch.jsからセットされたデータを使用
        displayMemos(memos, filterQuery, true); // サーバーからの表示
    };

    // メモをUIに表示するヘルパー関数
    const displayMemos = (memos, filterQuery, isServerData) => {
        if (!savedMemosList) return;
        savedMemosList.innerHTML = ''; // リストをクリア

        const filteredMemos = memos.filter(memo =>
            memo.content.toLowerCase().includes(filterQuery.toLowerCase()) ||
            memo.timestamp.includes(filterQuery)
        );

        if (filteredMemos.length === 0) {
            savedMemosList.innerHTML = `<li>まだメモがありません。${isServerData ? '(ログイン済み)' : '(ローカル)'}</li>`;
        } else {
            // 新しいメモが常に先頭に来るように逆順に表示
            [...filteredMemos].reverse().forEach((memo) => {
                const originalIndex = memos.findIndex(m => m.timestamp === memo.timestamp && m.content === memo.content); // 元の配列のインデックス
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
            // 削除ボタンのイベントリスナーを設定
            savedMemosList.querySelectorAll('.delete-memo-button').forEach(button => {
                button.removeEventListener('click', handleDeleteMemoClick); // 既存のリスナーを削除
                button.addEventListener('click', handleDeleteMemoClick);
            });
            // 編集ボタンのイベントリスナーを設定
            savedMemosList.querySelectorAll('.edit-memo-button').forEach(button => {
                button.removeEventListener('click', handleEditMemoClick); // 既存のリスナーを削除
                button.addEventListener('click', handleEditMemoClick);
            });
        }
    };

    // メモをサーバーに保存する関数
    const saveMemosToServer = async (memosToSave) => {
        if (!window.currentUserId || !window.ws || window.ws.readyState !== WebSocket.OPEN) {
            console.warn("Memo: Not logged in or WebSocket not open. Cannot save memos to server.");
            await window.showCustomDialog('エラー', 'ログインしていないか、サーバーに接続していません。メモは保存されませんでした。');
            return;
        }
        window.userMemos = memosToSave; // グローバルデータを更新
        window.ws.send(JSON.stringify({
            type: 'update_user_data',
            userId: window.currentUserId,
            memos: window.userMemos
        }));
        await window.showCustomDialog('保存完了', 'メモをサーバーに保存しました！');
        loadMemos(memoSearchInput ? memoSearchInput.value.trim() : ''); // UIを再ロード
    };

    // メモをローカルストレージに保存する関数 (未ログイン時用)
    const saveMemosLocally = (memosToSave) => {
        browser.storage.local.set({ savedMemosLocal: memosToSave }, () => {
            window.showCustomDialog('保存完了', 'メモをローカルに保存しました！');
            loadMemos(memoSearchInput ? memoSearchInput.value.trim() : '');
        });
    };

    // メモを削除する関数 (サーバーまたはローカル)
    const deleteMemo = async (originalIndex) => {
        if (!memoTextArea) return;
        
        let memos = window.userMemos || []; // サーバーデータ優先

        if (!window.currentUserId) {
            // 未ログイン時はローカルストレージから取得
            const result = await browser.storage.local.get(['savedMemosLocal']);
            memos = result.savedMemosLocal || [];
        }

        if (originalIndex > -1 && originalIndex < memos.length) {
            memos.splice(originalIndex, 1);
            if (window.currentUserId) {
                await saveMemosToServer(memos); // サーバーに保存
            } else {
                saveMemosLocally(memos); // ローカルに保存
            }
            window.showCustomDialog('削除完了', 'メモを削除しました。');
        }
    };

    // メモを編集する関数
    const editMemo = (originalIndex) => {
        if (!memoTextArea) return;

        let memos = window.userMemos || []; // サーバーデータ優先

        if (!window.currentUserId) {
            // 未ログイン時はローカルストレージから取得
            browser.storage.local.get(['savedMemosLocal'], (result) => {
                memos = result.savedMemosLocal || [];
                if (originalIndex > -1 && originalIndex < memos.length) {
                    const memoToEdit = memos[originalIndex];
                    memoTextArea.value = memoToEdit.content;
                    if (memoToEdit.screenshotUrl && screenshotArea) {
                        screenshotArea.innerHTML = `<img src="${memoToEdit.screenshotUrl}" alt="Screenshot">`;
                    } else if (screenshotArea) {
                        screenshotArea.innerHTML = '<p>スクリーンショットがここに表示されます。（画像をここに貼り付けることもできます - Ctrl+V / Cmd+V）</p>';
                    }
                    editingMemoIndex = originalIndex;
                    window.showCustomDialog('メモ編集', 'メモを編集モードにしました。内容を変更して「メモを保存」ボタンを押してください。');
                }
            });
            return;
        }
        
        // ログイン済みの場合
        if (originalIndex > -1 && originalIndex < memos.length) {
            const memoToEdit = memos[originalIndex];
            memoTextArea.value = memoToEdit.content;
            if (memoToEdit.screenshotUrl && screenshotArea) {
                screenshotArea.innerHTML = `<img src="${memoToEdit.screenshotUrl}" alt="Screenshot">`;
            } else if (screenshotArea) {
                screenshotArea.innerHTML = '<p>スクリーンショットがここに表示されます。（画像をここに貼り付けることもできます - Ctrl+V / Cmd+V）</p>';
            }
            editingMemoIndex = originalIndex;
            window.showCustomDialog('メモ編集', 'メモを編集モードにしました。内容を変更して「メモを保存」ボタンを押してください。');
        }
    };

    // イベントハンドラ関数
    async function handleDeleteMemoClick(event) {
        const originalIndexToDelete = parseInt(event.currentTarget.dataset.originalIndex);
        const confirmed = await window.showCustomDialog('メモ削除', 'このメモを削除しますか？', true);
        if (confirmed) {
            await deleteMemo(originalIndexToDelete);
        }
    }

    function handleEditMemoClick(event) {
        const originalIndexToEdit = parseInt(event.currentTarget.dataset.originalIndex);
        editMemo(originalIndexToEdit);
    }

    async function handleSaveMemoButtonClick() {
        if (!memoTextArea || !screenshotArea) return;
        const memoContent = memoTextArea.value.trim();
        const currentScreenshot = screenshotArea.querySelector('img');
        const screenshotUrl = currentScreenshot ? currentScreenshot.src : null;

        if (!memoContent && !screenshotUrl) {
            window.showCustomDialog('エラー', 'メモ内容が空か、スクリーンショットがありません。');
            return;
        }

        let memos = window.userMemos || []; // サーバーデータ優先

        if (!window.currentUserId) {
            // 未ログイン時はローカルストレージから取得
            const result = await browser.storage.local.get(['savedMemosLocal']);
            memos = result.savedMemosLocal || [];
        }

        const timestamp = new Date().toLocaleString();
        if (editingMemoIndex !== -1) {
            // 編集モード
            memos[editingMemoIndex].content = memoContent;
            memos[editingMemoIndex].timestamp = timestamp;
            memos[editingMemoIndex].screenshotUrl = screenshotUrl;
            editingMemoIndex = -1;
        } else {
            // 新規保存
            memos.push({ timestamp, content: memoContent, screenshotUrl });
        }

        if (window.currentUserId) {
            await saveMemosToServer(memos); // サーバーに保存
        } else {
            saveMemosLocally(memos); // ローカルに保存
        }

        if (memoTextArea) memoTextArea.value = '';
        if (screenshotArea) screenshotArea.innerHTML = '<p>スクリーンショットがここに表示されます。（画像をここに貼り付けることもできます - Ctrl+V / Cmd+V）</p>';
    }

    function handleMemoSearchButtonClick() {
        if (memoSearchInput) {
            const query = memoSearchInput.value.trim();
            loadMemos(query);
        }
    }

    function handleMemoSearchInputKeypress(e) {
        if (e.key === 'Enter') {
            if (memoSearchButton) memoSearchButton.click();
        }
    }

    // main.jsから発火されるカスタムイベントをリッスン (このイベントはmain.jsから削除されるため、将来的には不要になる)
    document.removeEventListener('screenshotCropped', handleScreenshotCropped); // 既存のリスナーを削除
    document.addEventListener('screenshotCropped', handleScreenshotCropped);

    function handleScreenshotCropped(event) {
        if (screenshotArea) {
            screenshotArea.innerHTML = `<img src="${event.detail.imageUrl}" alt="Cropped Screenshot">`;
        }
    }

    // 画像貼り付けイベントリスナーを追加
    if (screenshotArea) {
        screenshotArea.removeEventListener('paste', handleImagePaste); // 重複防止
        screenshotArea.addEventListener('paste', handleImagePaste);
    }

    function handleImagePaste(event) {
        const items = event.clipboardData.items;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = (e) => {
                    const imageUrl = e.target.result;
                    if (screenshotArea) {
                        screenshotArea.innerHTML = `<img src="${imageUrl}" alt="Pasted Image">`;
                        window.showCustomDialog('貼り付け完了', '画像をメモエリアに貼り付けました。');
                    }
                };
                reader.readAsDataURL(blob);
                return;
            }
        }
        window.showCustomDialog('貼り付け失敗', 'クリップボードに画像がありませんでした。');
    }

    // イベントリスナーを再アタッチ
    if (saveMemoButton) {
        saveMemoButton.removeEventListener('click', handleSaveMemoButtonClick);
        saveMemoButton.addEventListener('click', handleSaveMemoButtonClick);
    }

    if (memoSearchButton) {
        memoSearchButton.removeEventListener('click', handleMemoSearchButtonClick);
        memoSearchButton.addEventListener('click', handleMemoSearchButtonClick);
    }
    if (memoSearchInput) {
        memoSearchInput.removeEventListener('keypress', handleMemoSearchInputKeypress);
        memoSearchInput.addEventListener('keypress', handleMemoSearchInputKeypress);
    }

    // ログイン状態が変更されたときにメモを再ロード
    document.removeEventListener('loginStateChanged', loadMemos);
    document.addEventListener('loginStateChanged', loadMemos);

    loadMemos(); // 初期ロード
}; // End of initMemoSection
void 0; // Explicitly return undefined for Firefox compatibility
