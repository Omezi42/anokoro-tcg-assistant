// js/sections/memo.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initMemoSection = async function() { // async を追加
    console.log("Memo section initialized.");

    // === メモセクションのロジック ===
    // 各要素を関数内で取得
    // const screenshotButton = document.getElementById('screenshot-button'); // スクリーンショットボタンは削除
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
                    button.removeEventListener('click', handleDeleteMemoClick); // 既存のリスナーを削除
                    button.addEventListener('click', handleDeleteMemoClick);
                });
                // 編集ボタンのイベントリスナーを設定
                savedMemosList.querySelectorAll('.edit-memo-button').forEach(button => {
                    button.removeEventListener('click', handleEditMemoClick); // 既存のリスナーを削除
                    button.addEventListener('click', handleEditMemoClick);
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
                    window.showCustomDialog('削除完了', 'メモを削除しました。');
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
                    screenshotArea.innerHTML = '<p>スクリーンショットがここに表示されます。（画像をここに貼り付けることもできます - Ctrl+V / Cmd+V）</p>';
                }
                editingMemoIndex = originalIndex;
                window.showCustomDialog('メモ編集', 'メモを編集モードにしました。内容を変更して「メモを保存」ボタンを押してください。');
            }
        });
    };

    // イベントハンドラ関数
    async function handleDeleteMemoClick(event) {
        // data-original-index を originalIndex に修正
        const originalIndexToDelete = parseInt(event.currentTarget.dataset.originalIndex);
        const confirmed = await window.showCustomDialog('メモ削除', 'このメモを削除しますか？', true);
        if (confirmed) {
            deleteMemo(originalIndexToDelete);
        }
    }

    function handleEditMemoClick(event) {
        // data-original-index を originalIndex に修正
        const originalIndexToEdit = parseInt(event.currentTarget.dataset.originalIndex);
        editMemo(originalIndexToEdit);
    }

    // スクリーンショットボタンのクリックハンドラは削除
    // async function handleScreenshotButtonClick() {
    //     chrome.runtime.sendMessage({ action: "captureScreenshot" });
    // }

    async function handleSaveMemoButtonClick() {
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
                    window.showCustomDialog('保存完了', 'メモを更新しました！');
                } else {
                    memos.push({ timestamp, content: memoContent, screenshotUrl });
                    window.showCustomDialog('保存完了', 'メモを保存しました！');
                }

                chrome.storage.local.set({ savedMemos: memos }, () => {
                    if (memoTextArea) memoTextArea.value = '';
                    if (screenshotArea) screenshotArea.innerHTML = '<p>スクリーンショットがここに表示されます。（画像をここに貼り付けることもできます - Ctrl+V / Cmd+V）</p>';
                    if (memoSearchInput) loadMemos(memoSearchInput.value.trim());
                });
            });
        } else {
            window.showCustomDialog('エラー', 'メモ内容が空か、スクリーンショットがありません。');
        }
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
    // if (screenshotButton) { // スクリーンショットボタンは削除
    //     screenshotButton.removeEventListener('click', handleScreenshotButtonClick);
    //     screenshotButton.addEventListener('click', handleScreenshotButtonClick);
    // }

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

    loadMemos();
}; // End of initMemoSection
void 0; // Explicitly return undefined for Firefox compatibility
