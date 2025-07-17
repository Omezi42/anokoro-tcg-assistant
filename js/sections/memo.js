// js/sections/memo.js
export function initialize() {
    if (document.body.dataset.memoInitialized === 'true') return;
    document.body.dataset.memoInitialized = 'true';

    console.log("Memo section initialized.");

    const a = (typeof browser !== "undefined") ? browser : chrome;
    const saveMemoButton = document.getElementById('save-memo-button');
    const memoTextArea = document.getElementById('memo-text-area');
    const savedMemosList = document.getElementById('saved-memos-list');
    const screenshotArea = document.getElementById('screenshot-area');
    const memoSearchInput = document.getElementById('memo-search-input');
    const memoSearchButton = document.getElementById('memo-search-button');
    let editingMemoIndex = -1;

    // ログイン状態に応じてメモの取得元を切り替える
    const getMemos = () => {
        return window.tcgAssistant.currentUserId 
            ? (window.tcgAssistant.userMemos || []) 
            : JSON.parse(localStorage.getItem('savedMemosLocal') || '[]');
    };

    // メモを保存する
    const saveMemos = (memos) => {
        if (window.tcgAssistant.currentUserId) {
            window.tcgAssistant.userMemos = memos;
            // TODO: WebSocket経由でサーバーに保存する処理を実装
            console.log("Memos saved to memory, server-side save needed.");
        } else {
            localStorage.setItem('savedMemosLocal', JSON.stringify(memos));
        }
    };

    // メモリストをUIに表示する
    const displayMemos = (memos, filterQuery = '') => {
        if (!savedMemosList) return;
        savedMemosList.innerHTML = '';
        const filteredMemos = memos.filter(memo =>
            (memo.content && memo.content.toLowerCase().includes(filterQuery.toLowerCase())) ||
            (memo.timestamp && memo.timestamp.includes(filterQuery))
        );

        if (filteredMemos.length === 0) {
            savedMemosList.innerHTML = `<li>まだメモがありません。</li>`;
        } else {
            [...filteredMemos].reverse().forEach((memo) => {
                const originalIndex = memos.findIndex(m => m.timestamp === memo.timestamp && m.content === memo.content);
                const li = document.createElement('li');
                li.className = 'saved-memo-item';
                li.innerHTML = `
                    <strong>${memo.timestamp}</strong>
                    <p>${memo.content || ''}</p>
                    ${memo.screenshotUrl ? `<img src="${memo.screenshotUrl}" alt="スクリーンショット" style="max-width: 100%; border-radius: 8px; margin-top: 10px;">` : ''}
                    <div class="memo-actions">
                        <button class="edit-memo-button" data-index="${originalIndex}" title="編集"><i class="fas fa-edit"></i></button>
                        <button class="delete-memo-button" data-index="${originalIndex}" title="削除"><i class="fas fa-trash-alt"></i></button>
                    </div>
                `;
                savedMemosList.appendChild(li);
            });
        }
    };

    const loadMemos = () => displayMemos(getMemos(), memoSearchInput.value.trim());

    // イベントリスナー
    saveMemoButton.addEventListener('click', async () => {
        const memoContent = memoTextArea.value.trim();
        const screenshotImg = screenshotArea.querySelector('img');
        const screenshotUrl = screenshotImg ? screenshotImg.src : null;
        if (!memoContent && !screenshotUrl) return window.showCustomDialog('エラー', '内容が空です。');

        let memos = getMemos();
        const timestamp = new Date().toLocaleString();
        if (editingMemoIndex > -1 && memos[editingMemoIndex]) {
            memos[editingMemoIndex] = { ...memos[editingMemoIndex], content: memoContent, timestamp, screenshotUrl };
            editingMemoIndex = -1;
        } else {
            memos.push({ timestamp, content: memoContent, screenshotUrl });
        }
        saveMemos(memos);
        memoTextArea.value = '';
        screenshotArea.innerHTML = '<p>画像をここに貼り付け (Ctrl+V)</p>';
        loadMemos();
    });
    
    savedMemosList.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const index = parseInt(target.dataset.index, 10);
        let memos = getMemos();
        if (target.classList.contains('delete-memo-button')) {
            memos.splice(index, 1);
            saveMemos(memos);
            loadMemos();
        } else if (target.classList.contains('edit-memo-button')) {
            const memoToEdit = memos[index];
            memoTextArea.value = memoToEdit.content;
            screenshotArea.innerHTML = memoToEdit.screenshotUrl ? `<img src="${memoToEdit.screenshotUrl}" alt="編集中の画像">` : '<p>画像をここに貼り付け (Ctrl+V)</p>';
            editingMemoIndex = index;
            memoTextArea.focus();
        }
    });

    screenshotArea.addEventListener('paste', (event) => {
        const item = Array.from(event.clipboardData.items).find(i => i.type.startsWith('image/'));
        if (item) {
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = (e) => {
                screenshotArea.innerHTML = `<img src="${e.target.result}" alt="Pasted Image">`;
            };
            reader.readAsDataURL(blob);
        }
    });
    
    memoSearchButton.addEventListener('click', loadMemos);
    memoSearchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') loadMemos(); });
    
    document.addEventListener('loginStateChanged', loadMemos);
    loadMemos();
}
