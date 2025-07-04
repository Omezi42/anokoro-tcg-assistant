// js/sections/rateMatch.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initRateMatchSection = function(allCards, showCustomDialog) {
    console.log("RateMatch section initialized.");

    // === レート戦セクションのロジック ===
    // 各要素を関数内で取得
    const matchingButton = document.getElementById('matching-button');
    const cancelMatchingButton = document.getElementById('cancel-matching-button');
    const matchingStatusDiv = document.getElementById('matching-status');
    const preMatchUiDiv = document.getElementById('pre-match-ui');
    const postMatchUiDiv = document.getElementById('post-match-ui');
    const matchHistoryList = document.getElementById('match-history-list');

    const chatInput = document.getElementById('chat-input');
    const sendChatButton = document.getElementById('send-chat-button');
    const chatMessagesDiv = document.getElementById('chat-messages');
    const chatPhraseButtons = document.querySelectorAll('.chat-phrase-button');

    const winButton = document.getElementById('win-button');
    const loseButton = document.getElementById('lose-button');
    const cancelButton = document.getElementById('cancel-button');

    let matchingTimeout = null; // マッチング中のタイムアウトID

    // 初期状態ではマッチング後UIを非表示に
    if (postMatchUiDiv) {
        postMatchUiDiv.style.display = 'none';
    }

    // ローカルストレージから対戦履歴を読み込む関数
    const loadMatchHistory = () => {
        if (!matchHistoryList) return;
        chrome.storage.local.get(['matchHistory'], (result) => {
            const history = result.matchHistory || [];
            matchHistoryList.innerHTML = ''; // クリア
            if (history.length === 0) {
                matchHistoryList.innerHTML = '<li>まだ対戦履歴がありません。</li>';
            } else {
                history.forEach(record => {
                    const listItem = document.createElement('li');
                    listItem.textContent = record;
                    matchHistoryList.appendChild(listItem);
                });
            }
        });
    };

    // 対戦履歴を保存する関数
    const saveMatchHistory = (record) => {
        chrome.storage.local.get(['matchHistory'], (result) => {
            const history = result.matchHistory || [];
            history.unshift(record); // 最新のものを先頭に追加
            if (history.length > 10) { // 履歴を最新10件に制限
                history.pop();
            }
            chrome.storage.local.set({matchHistory: history}, () => {
                loadMatchHistory(); // 保存後に再読み込み
            });
        });
    };

    if (matchingButton) {
        matchingButton.onclick = async () => { // addEventListenerの代わりにonclickを使用
            // マッチング前UIを隠し、マッチングステータスを表示
            if (preMatchUiDiv) {
                preMatchUiDiv.style.display = 'none';
            }
            if (matchingStatusDiv) {
                matchingStatusDiv.style.display = 'flex';
            }
            if (postMatchUiDiv) {
                postMatchUiDiv.style.display = 'none';
            }

            await showCustomDialog('マッチング開始', '対戦相手を検索中です...');

            matchingTimeout = setTimeout(async () => {
                if (matchingStatusDiv) {
                    matchingStatusDiv.style.display = 'none';
                }
                if (postMatchUiDiv) {
                    postMatchUiDiv.style.display = 'block';
                    if (chatMessagesDiv) {
                        chatMessagesDiv.innerHTML = `
                            <p><strong>[システム]:</strong> 対戦が始まりました！</p>
                            <p><strong>[相手プレイヤー]:</strong> ルームID: ABC123DEF, 先攻お願いします！</p>
                        `;
                        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
                    }
                }
                chrome.runtime.sendMessage({ action: "matchFoundNotification" });

            }, 3000);
        };
    }

    if (cancelMatchingButton) {
        cancelMatchingButton.onclick = async () => { // addEventListenerの代わりにonclickを使用
            const confirmed = await showCustomDialog('マッチングキャンセル', 'マッチングをキャンセルしますか？', true);
            if (confirmed) {
                clearTimeout(matchingTimeout);
                if (matchingStatusDiv) {
                    matchingStatusDiv.style.display = 'none';
                }
                if (preMatchUiDiv) {
                    preMatchUiDiv.style.display = 'block';
                }
                await showCustomDialog('キャンセル完了', 'マッチングをキャンセルしました。');
            }
        };
    }

    if (sendChatButton) {
        sendChatButton.onclick = () => { // addEventListenerの代わりにonclickを使用
            if (!chatInput || !chatMessagesDiv) return;
            const message = chatInput.value.trim();
            if (message) {
                const newMessage = document.createElement('p');
                newMessage.innerHTML = `<strong>[あなた]:</strong> ${message}`;
                chatMessagesDiv.appendChild(newMessage);
                chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
                chatInput.value = '';
            }
        };
        if (chatInput) {
            chatInput.onkeypress = (e) => { // addEventListenerの代わりにonkeypressを使用
                if (e.key === 'Enter') {
                    sendChatButton.click();
                }
            };
        }
    }

    chatPhraseButtons.forEach(button => {
        button.onclick = () => { // addEventListenerの代わりにonclickを使用
            if (chatInput && sendChatButton) {
                chatInput.value = button.textContent;
                sendChatButton.click();
            }
        };
    });

    if (winButton) {
        winButton.onclick = async () => { // addEventListenerの代わりにonclickを使用
            const confirmed = await showCustomDialog('勝利報告', 'BO3の対戦で勝利を報告しますか？', true);
            if (confirmed) {
                saveMatchHistory(`${new Date().toLocaleString()} - BO3 勝利`);
                showCustomDialog('報告完了', '勝利を報告しました！');
                if (postMatchUiDiv) {
                    postMatchUiDiv.style.display = 'none';
                }
                if (preMatchUiDiv) {
                    preMatchUiDiv.style.display = 'block';
                }
            }
        };
    }

    if (loseButton) {
        loseButton.onclick = async () => { // addEventListenerの代わりにonclickを使用
            const confirmed = await showCustomDialog('敗北報告', 'BO3の対戦で敗北を報告しますか？', true);
            if (confirmed) {
                saveMatchHistory(`${new Date().toLocaleString()} - BO3 敗北`);
                showCustomDialog('報告完了', '敗北を報告しました。');
                if (postMatchUiDiv) {
                    postMatchUiDiv.style.display = 'none';
                }
                if (preMatchUiDiv) {
                    preMatchUiDiv.style.display = 'block';
                }
            }
        };
    }

    if (cancelButton) {
        cancelButton.onclick = async () => { // addEventListenerの代わりにonclickを使用
            const confirmed = await showCustomDialog('対戦中止', '対戦を中止しますか？', true);
            if (confirmed) {
                showCustomDialog('完了', '対戦を中止しました。');
                if (postMatchUiDiv) {
                    postMatchUiDiv.style.display = 'none';
                }
                if (preMatchUiDiv) {
                    preMatchUiDiv.style.display = 'block';
                }
            }
        };
    }

    loadMatchHistory();
}; // End of initRateMatchSection
