// js/sections/rateMatch.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initRateMatchSection = async function() { // async を追加
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

    const rateDisplay = document.getElementById('rate-display'); // レート表示要素

    let currentRate = 1500; // 仮の初期レート

    // 初期状態ではマッチング後UIを非表示に
    if (postMatchUiDiv) {
        postMatchUiDiv.style.display = 'none';
    }

    // レート表示を更新する関数
    const updateRateDisplay = () => {
        if (rateDisplay) {
            rateDisplay.textContent = currentRate;
        }
    };

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

    // マッチング状態をバックグラウンドから取得し、UIを更新する
    const updateMatchingUI = async () => {
        const response = await chrome.runtime.sendMessage({ action: "getMatchingStatus" });
        if (response && response.isMatching) {
            // マッチング中のUIを表示
            if (preMatchUiDiv) preMatchUiDiv.style.display = 'none';
            if (matchingStatusDiv) matchingStatusDiv.style.display = 'flex';
            if (postMatchUiDiv) postMatchUiDiv.style.display = 'none';
        } else if (response && response.currentMatch) {
            // マッチが成立している場合のUIを表示
            if (preMatchUiDiv) preMatchUiDiv.style.display = 'none';
            if (matchingStatusDiv) matchingStatusDiv.style.display = 'none';
            if (postMatchUiDiv) {
                postMatchUiDiv.style.display = 'block';
                if (chatMessagesDiv && chatMessagesDiv.dataset.initialized !== 'true') { // 二重初期化防止
                    chatMessagesDiv.innerHTML = `
                        <p><strong>[システム]:</strong> 対戦が始まりました！</p>
                        <p><strong>[相手プレイヤー]:</strong> 先攻お願いします！</p>
                    `;
                    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
                    chatMessagesDiv.dataset.initialized = 'true'; // 初期化済みマーク
                }
            }
        }
        else {
            // マッチング中でない、かつマッチも成立していない通常のUI
            if (preMatchUiDiv) preMatchUiDiv.style.display = 'block';
            if (matchingStatusDiv) matchingStatusDiv.style.display = 'none';
            if (postMatchUiDiv) postMatchUiDiv.style.display = 'none';
            if (chatMessagesDiv) chatMessagesDiv.dataset.initialized = 'false'; // リセット
            // マッチ情報がクリアされたことをバックグラウンドに通知
            // このブロックは、UIが既にクリアされている状態（例：拡張機能が再ロードされた）で
            // バックグラウンドのマッチ情報が残っていた場合にのみ実行されるべき
            // 勝利/敗北/キャンセル時は各ハンドラで明示的にclearMatchInfoを呼ぶ
            // chrome.runtime.sendMessage({ action: "clearMatchInfo" });
        }
    };

    // イベントリスナーを再アタッチ
    if (matchingButton) {
        matchingButton.removeEventListener('click', handleMatchingButtonClick); // 既存のリスナーを削除
        matchingButton.addEventListener('click', handleMatchingButtonClick);
    }

    if (cancelMatchingButton) {
        cancelMatchingButton.removeEventListener('click', handleCancelMatchingButtonClick);
        cancelMatchingButton.addEventListener('click', handleCancelMatchingButtonClick);
    }

    if (sendChatButton) {
        sendChatButton.removeEventListener('click', handleSendChatButtonClick);
        sendChatButton.addEventListener('click', handleSendChatButtonClick);
        if (chatInput) {
            chatInput.removeEventListener('keypress', handleChatInputKeypress);
            chatInput.addEventListener('keypress', handleChatInputKeypress);
        }
    }

    chatPhraseButtons.forEach(button => {
        button.removeEventListener('click', handleChatPhraseButtonClick);
        button.addEventListener('click', handleChatPhraseButtonClick);
    });

    if (winButton) {
        winButton.removeEventListener('click', handleWinButtonClick);
        winButton.addEventListener('click', handleWinButtonClick);
    }

    if (loseButton) {
        loseButton.removeEventListener('click', handleLoseButtonClick);
        loseButton.addEventListener('click', handleLoseButtonClick);
    }

    if (cancelButton) {
        cancelButton.removeEventListener('click', handleCancelBattleButtonClick);
        cancelButton.addEventListener('click', handleCancelBattleButtonClick);
    }

    // イベントハンドラ関数
    async function handleMatchingButtonClick() {
        // バックグラウンドスクリプトにマッチング開始を要求
        const response = await chrome.runtime.sendMessage({ action: "startMatching" });
        if (response && response.success) {
            await window.showCustomDialog('マッチング開始', '対戦相手を検索中です...');
            updateMatchingUI(); // UIをマッチング中状態に更新
        } else {
            await window.showCustomDialog('エラー', response.error || 'マッチングを開始できませんでした。');
            updateMatchingUI(); // UIを元の状態に戻す
        }
    }

    async function handleCancelMatchingButtonClick() {
        const confirmed = await window.showCustomDialog('マッチングキャンセル', 'マッチングをキャンセルしますか？', true);
        if (confirmed) {
            // バックグラウンドスクリプトにマッチングキャンセルを要求
            const response = await chrome.runtime.sendMessage({ action: "cancelMatching" });
            if (response && response.success) {
                await window.showCustomDialog('キャンセル完了', 'マッチングをキャンセルしました。');
            } else {
                await window.showCustomDialog('エラー', response.error || 'マッチングをキャンセルできませんでした。');
            }
            updateMatchingUI(); // UIを更新
        }
    }

    function handleSendChatButtonClick() {
        if (!chatInput || !chatMessagesDiv) return;
        const message = chatInput.value.trim();
        if (message) {
            const newMessage = document.createElement('p');
            newMessage.innerHTML = `<strong>[あなた]:</strong> ${message}`;
            chatMessagesDiv.appendChild(newMessage);
            chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
            chatInput.value = '';
        }
    }

    function handleChatInputKeypress(e) {
        if (e.key === 'Enter') {
            sendChatButton.click();
        }
    }

    function handleChatPhraseButtonClick(event) {
        if (chatInput && sendChatButton) {
            chatInput.value = event.currentTarget.textContent;
            sendChatButton.click();
        }
    }

    async function handleWinButtonClick() {
        const confirmed = await window.showCustomDialog('勝利報告', 'BO3の対戦で勝利を報告しますか？', true);
        if (confirmed) {
            const oldRate = currentRate;
            currentRate += 30; // 仮のレート増加
            updateRateDisplay();
            saveMatchHistory(`${new Date().toLocaleString()} - BO3 勝利 (レート: ${oldRate} -> ${currentRate})`);
            await window.showCustomDialog('報告完了', `勝利を報告しました！<br>レート: ${oldRate} → ${currentRate} (+30)`);
            
            // マッチ情報をクリアするメッセージをバックグラウンドに送信
            await chrome.runtime.sendMessage({ action: "clearMatchInfo" });
            updateMatchingUI(); // UIを元の状態に戻す
        }
    }

    async function handleLoseButtonClick() {
        const confirmed = await window.showCustomDialog('敗北報告', 'BO3の対戦で敗北を報告しますか？', true);
        if (confirmed) {
            const oldRate = currentRate;
            currentRate -= 20; // 仮のレート減少
            updateRateDisplay();
            saveMatchHistory(`${new Date().toLocaleString()} - BO3 敗北 (レート: ${oldRate} → ${currentRate})`);
            await window.showCustomDialog('報告完了', `敗北を報告しました。<br>レート: ${oldRate} → ${currentRate} (-20)`);
            
            // マッチ情報をクリアするメッセージをバックグラウンドに送信
            await chrome.runtime.sendMessage({ action: "clearMatchInfo" });
            updateMatchingUI(); // UIを元の状態に戻す
        }
    }

    async function handleCancelBattleButtonClick() {
        const confirmed = await window.showCustomDialog('対戦中止', '対戦を中止しますか？', true);
        if (confirmed) {
            await window.showCustomDialog('完了', '対戦を中止しました。');
            
            // マッチ情報をクリアするメッセージをバックグラウンドに送信
            await chrome.runtime.sendMessage({ action: "clearMatchInfo" });
            updateMatchingUI(); // UIを元の状態に戻す
        }
    }

    updateRateDisplay(); // 初期レート表示
    loadMatchHistory();
    updateMatchingUI(); // 初期ロード時にマッチング状態をチェックしてUIを更新

    // main.jsでマッチング完了通知を処理するため、ここでのリスナーは不要
}; // End of initRateMatchSection
