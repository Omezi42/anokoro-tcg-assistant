// js/sections/memo.js
export function initialize() {
    if (document.body.dataset.memoInitialized === 'true') return;
    document.body.dataset.memoInitialized = 'true';

    console.log("Memo section initialized.");

    const saveMemoButton = document.getElementById('save-memo-button');
    const memoTextArea = document.getElementById('memo-text-area');
    const savedMemosList = document.getElementById('saved-memos-list');
    const screenshotArea = document.getElementById('screenshot-area');
    const memoSearchInput = document.getElementById('memo-search-input');
    const memoSearchButton = document.getElementById('memo-search-button');
    let editingMemoIndex = -1;

    const sendMemosToServer = (memos) => {
        const { ws } = window.tcgAssistant;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'update_user_data', memos: memos }));
            console.log("Memos sent to server for saving.");
        } else {
            console.error("WebSocket is not connected. Memos could not be saved to server.");
            // Optionally, provide feedback to the user
            window.showCustomDialog('保存エラー', 'サーバーに接続されていないため、メモを保存できませんでした。');
        }
    };

    const getMemos = () => {
        return window.tcgAssistant.currentUserId 
            ? (window.tcgAssistant.userMemos || []) 
            : JSON.parse(localStorage.getItem('savedMemosLocal') || '[]');
    };

    const saveMemos = (memos) => {
        if (window.tcgAssistant.currentUserId) {
            window.tcgAssistant.userMemos = memos;
            sendMemosToServer(memos);
        } else {
            localStorage.setItem('savedMemosLocal', JSON.stringify(memos));
        }
        loadMemos();
    };

    const displayMemos = (memos, filterQuery = '') => {
        if (!savedMemosList) return;
        savedMemosList.innerHTML = '';
        const lowerCaseQuery = filterQuery.toLowerCase();
        const filteredMemos = memos.filter(memo =>
            (memo.content && memo.content.toLowerCase().includes(lowerCaseQuery)) ||
            (memo.timestamp && memo.timestamp.includes(filterQuery))
        );

        if (filteredMemos.length === 0) {
            savedMemosList.innerHTML = `<li>${filterQuery ? '一致するメモがありません。' : 'まだメモがありません。'}</li>`;
        } else {
            [...filteredMemos].reverse().forEach((memo) => {
                const originalIndex = memos.findIndex(m => m.timestamp === memo.timestamp && m.content === memo.content);
                const li = document.createElement('li');
                li.className = 'saved-memo-item';
                // Sanitize content before displaying
                const sanitizedContent = memo.content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                li.innerHTML = `
                    <strong>${memo.timestamp}</strong>
                    <p>${sanitizedContent || ''}</p>
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

    const loadMemos = () => {
        const query = memoSearchInput ? memoSearchInput.value.trim() : '';
        displayMemos(getMemos(), query);
    };

    saveMemoButton?.addEventListener('click', async () => {
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
        
        saveMemos(memos); // This will save and then reload the memos
        
        memoTextArea.value = '';
        screenshotArea.innerHTML = '<p>画像をここに貼り付け (Ctrl+V)</p>';
    });
    
    savedMemosList?.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const index = parseInt(target.dataset.index, 10);
        let memos = getMemos();
        if (target.classList.contains('delete-memo-button')) {
            memos.splice(index, 1);
            saveMemos(memos);
        } else if (target.classList.contains('edit-memo-button')) {
            const memoToEdit = memos[index];
            memoTextArea.value = memoToEdit.content;
            screenshotArea.innerHTML = memoToEdit.screenshotUrl ? `<img src="${memoToEdit.screenshotUrl}" alt="編集中の画像">` : '<p>画像をここに貼り付け (Ctrl+V)</p>';
            editingMemoIndex = index;
            memoTextArea.focus();
        }
    });

    screenshotArea?.addEventListener('paste', (event) => {
        const item = Array.from(event.clipboardData.items).find(i => i.type.startsWith('image/'));
        if (item) {
            event.preventDefault();
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = (e) => {
                screenshotArea.innerHTML = `<img src="${e.target.result}" alt="Pasted Image">`;
            };
            reader.readAsDataURL(blob);
        }
    });
    
    memoSearchButton?.addEventListener('click', loadMemos);
    memoSearchInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') loadMemos(); });
    
    document.addEventListener('loginStateChanged', loadMemos);
    loadMemos();
}
