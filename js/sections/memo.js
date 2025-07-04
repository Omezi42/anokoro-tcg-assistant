// js/sections/memo.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initMemoSection = function(allCards, showCustomDialog) {
    console.log("Memo section initialized.");

    // === メモセクションのロジック ===
    // 各要素を関数内で取得
    const screenshotButton = document.getElementById('screenshot-button');
    const saveMemoButton = document.getElementById('save-memo-button');
    const memoTextArea = document.getElementById('memo-text-area');
    const savedMemosList = document.getElementById('saved-memos-list');
    const screenshotArea = document.getElementById('screenshot-area'); // 関数内で取得
    const memoSearchInput = document.getElementById('memo-search-input');
    const memoSearchButton = document.getElementById('memo-search-button');
    let editingMemoIndex = -1; // 編集中のメモのインデックス

    // 保存されたメモを読み込む関数
    const loadMemos = (filterQuery = '') => {
        if (!savedMemosList) return;
        chrome.storage.local.get(['savedMemos'], (result) => {
            const memos = result.savedMemos || [];
            savedMemosList.innerHTML = ''; // リストをクリア

            const filteredMemos = memos.filter(memo =>
                memo.content.toLowerCase().includes(filterQuery.toLowerCase()) ||
                memo.timestamp.includes(filterQuery)
            );

            if (filteredMemos.length === 0) {
                savedMemosList.innerHTML = '<li>まだメモがありません。</li>';
            } else {
                // 新しいメモが常に先頭に来るように逆順に表示
                [...filteredMemos].reverse().forEach((memo) => {
                    const memoItem = document.createElement('li');
                    memoItem.className = 'saved-memo-item';
                    const originalIndex = memos.findIndex(m => m.timestamp === memo.timestamp && m.content === memo.content);

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
                    button.onclick = async (event) => { // addEventListenerの代わりにonclickを使用
                        const originalIndexToDelete = parseInt(event.currentTarget.dataset.originalIndex);
                        const confirmed = await showCustomDialog('メモ削除', 'このメモを削除しますか？', true);
                        if (confirmed) {
                            deleteMemo(originalIndexToDelete);
                        }
                    };
                });
                // 編集ボタンのイベントリスナーを設定
                savedMemosList.querySelectorAll('.edit-memo-button').forEach(button => {
                    button.onclick = (event) => { // addEventListenerの代わりにonclickを使用
                        const originalIndexToEdit = parseInt(event.currentTarget.dataset.originalIndex);
                        editMemo(originalIndexToEdit);
                    };
                });
            }
        });
    };

    // メモを削除する関数
    const deleteMemo = (originalIndex) => {
        chrome.storage.local.get(['savedMemos'], (result) => {
            let memos = result.savedMemos || [];
            if (originalIndex > -1 && originalIndex < memos.length) {
                memos.splice(originalIndex, 1);
                chrome.storage.local.set({savedMemos: memos}, () => {
                    showCustomDialog('削除完了', 'メモを削除しました。');
                    if (memoSearchInput) loadMemos(memoSearchInput.value.trim());
                });
            }
        });
    };

    // メモを編集する関数
    const editMemo = (originalIndex) => {
        if (!memoTextArea) return;
        chrome.storage.local.get(['savedMemos'], (result) => {
            const memos = result.savedMemos || [];
            if (originalIndex > -1 && originalIndex < memos.length) {
                const memoToEdit = memos[originalIndex];
                memoTextArea.value = memoToEdit.content;
                // スクリーンショットも表示
                if (memoToEdit.screenshotUrl && screenshotArea) {
                    screenshotArea.innerHTML = `<img src="${memoToEdit.screenshotUrl}" alt="Screenshot">`;
                } else if (screenshotArea) {
                    screenshotArea.innerHTML = '<p>スクリーンショットがここに表示されます。</p>';
                }
                editingMemoIndex = originalIndex;
                showCustomDialog('メモ編集', 'メモを編集モードにしました。内容を変更して「メモを保存」ボタンを押してください。');
            }
        });
    };

    // main.jsから発火されるカスタムイベントをリッスン
    document.addEventListener('screenshotCropped', (event) => {
        if (screenshotArea) {
            screenshotArea.innerHTML = `<img src="${event.detail.imageUrl}" alt="Cropped Screenshot">`;
        }
    });

    if (screenshotButton) {
        screenshotButton.onclick = async () => { // addEventListenerの代わりにonclickを使用
            // main.jsのスクリーンショットキャプチャロジックをトリガー
            chrome.runtime.sendMessage({ action: "captureScreenshot" });
        };
    }

    if (saveMemoButton) {
        saveMemoButton.onclick = async () => { // addEventListenerの代わりにonclickを使用
            if (!memoTextArea || !screenshotArea) return;
            const memoContent = memoTextArea.value.trim();
            const currentScreenshot = screenshotArea.querySelector('img');
            const screenshotUrl = currentScreenshot ? currentScreenshot.src : null;

            if (memoContent || screenshotUrl) {
                chrome.storage.local.get(['savedMemos'], (result) => {
                    let memos = result.savedMemos || [];
                    const timestamp = new Date().toLocaleString();

                    if (editingMemoIndex !== -1) {
                        memos[editingMemoIndex].content = memoContent;
                        memos[editingMemoIndex].timestamp = timestamp;
                        memos[editingMemoIndex].screenshotUrl = screenshotUrl;
                        editingMemoIndex = -1;
                        showCustomDialog('保存完了', 'メモを更新しました！');
                    } else {
                        memos.push({ timestamp, content: memoContent, screenshotUrl });
                        showCustomDialog('保存完了', 'メモを保存しました！');
                    }

                    chrome.storage.local.set({ savedMemos: memos }, () => {
                        if (memoTextArea) memoTextArea.value = '';
                        if (screenshotArea) screenshotArea.innerHTML = '<p>スクリーンショットがここに表示されます。</p>';
                        if (memoSearchInput) loadMemos(memoSearchInput.value.trim());
                    });
                });
            } else {
                showCustomDialog('エラー', 'メモ内容が空か、スクリーンショットがありません。');
            }
        };
    }

    if (memoSearchButton) {
        memoSearchButton.onclick = () => { // addEventListenerの代わりにonclickを使用
            if (memoSearchInput) {
                const query = memoSearchInput.value.trim();
                loadMemos(query);
            }
        };
    }
    if (memoSearchInput) {
        memoSearchInput.onkeypress = (e) => { // addEventListenerの代わりにonkeypressを使用
            if (e.key === 'Enter') {
                if (memoSearchButton) memoSearchButton.click();
            }
        };
    }

    loadMemos();
}; // End of initMemoSection
