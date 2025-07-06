// js/sections/rateMatch.js

// Firebase関連のインポート
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, addDoc, getDocs } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initRateMatchSection = async function() { // async を追加
    console.log("RateMatch section initialized.");

    // Firebaseが利用可能になるまで待機
    if (!window.db || !window.auth || !window.currentUserId) {
        console.log("Firebase not yet ready. Waiting for firebaseAuthReady event...");
        await new Promise(resolve => document.addEventListener('firebaseAuthReady', resolve, { once: true }));
        console.log("Firebase is now ready!");
    }

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
    const userIdDisplay = document.getElementById('user-id-display'); // ユーザーID表示要素
    const roomIdInput = document.getElementById('room-id-input'); // ルームID入力
    const createRoomButton = document.getElementById('create-room-button'); // ルーム作成ボタン
    const joinRoomButton = document.getElementById('join-room-button'); // ルーム参加ボタン

    let currentRate = 1500; // 仮の初期レート
    let currentRoomId = null; // 現在参加中のルームID
    let unsubscribeRoomListener = null; // ルームリスナーの購読解除関数
    let unsubscribeChatListener = null; // チャットリスナーの購読解除関数

    // ユーザーIDを表示
    if (userIdDisplay) {
        userIdDisplay.textContent = window.currentUserId || '取得中...';
        document.addEventListener('firebaseAuthReady', () => {
            userIdDisplay.textContent = window.currentUserId;
        });
    }

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
            currentRoomId = response.currentMatch.roomId; // バックグラウンドからルームIDを取得
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
                    setupRoomListeners(currentRoomId); // ルームが確定したらリスナーを設定
                }
            }
        }
        else {
            // マッチング中でない、かつマッチも成立していない通常のUI
            if (preMatchUiDiv) preMatchUiDiv.style.display = 'block';
            if (matchingStatusDiv) matchingStatusDiv.style.display = 'none';
            if (postMatchUiDiv) postMatchUiDiv.style.display = 'none';
            if (chatMessagesDiv) chatMessagesDiv.dataset.initialized = 'false'; // リセット
            // ルームリスナーを解除
            if (unsubscribeRoomListener) {
                unsubscribeRoomListener();
                unsubscribeRoomListener = null;
            }
            if (unsubscribeChatListener) {
                unsubscribeChatListener();
                unsubscribeChatListener = null;
            }
            currentRoomId = null; // ルームIDをクリア
        }
    };

    // Firebase Firestoreのパスヘルパー関数
    const getRoomsCollectionRef = () => {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        return collection(window.db, `artifacts/${appId}/public/data/rooms`);
    };

    const getRoomDocRef = (roomId) => {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        return doc(window.db, `artifacts/${appId}/public/data/rooms/${roomId}`);
    };

    const getMessagesCollectionRef = (roomId) => {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        return collection(window.db, `artifacts/${appId}/public/data/rooms/${roomId}/messages`);
    };

    // ルームのリスナーを設定 (参加者リストなど)
    const setupRoomListeners = (roomId) => {
        if (!window.db) {
            console.error("Firestore DB is not initialized.");
            return;
        }
        console.log(`Setting up listeners for room: ${roomId}`);

        const roomDocRef = getRoomDocRef(roomId);
        unsubscribeRoomListener = onSnapshot(roomDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const roomData = docSnap.data();
                console.log("Room data updated:", roomData);
                // ここでルームの参加者リストなどをUIに表示するロジックを追加可能
            } else {
                console.log("Room does not exist or was deleted.");
                // ルームが削除された場合、UIをリセット
                window.showCustomDialog('ルーム終了', '参加していたルームが終了しました。');
                chrome.runtime.sendMessage({ action: "clearMatchInfo" }); // バックグラウンドのマッチ情報もクリア
                updateMatchingUI();
            }
        }, (error) => {
            console.error("Error listening to room updates:", error);
            window.showCustomDialog('エラー', `ルーム情報の取得中にエラーが発生しました: ${error.message}`);
        });

        // チャットメッセージのリスナーを設定
        const messagesColRef = getMessagesCollectionRef(roomId);
        unsubscribeChatListener = onSnapshot(query(messagesColRef), (snapshot) => {
            snapshot.docChanges().forEach(change => {
                const messageData = change.doc.data();
                if (change.type === "added") {
                    console.log("New message:", messageData);
                    displayChatMessage(messageData.senderId, messageData.message, messageData.timestamp);
                }
                // 他のchange.type (modified, removed) も処理可能
            });
        }, (error) => {
            console.error("Error listening to chat messages:", error);
            window.showCustomDialog('エラー', `チャットメッセージの取得中にエラーが発生しました: ${error.message}`);
        });
    };

    // チャットメッセージをUIに表示する関数
    const displayChatMessage = (senderId, message, timestamp) => {
        if (!chatMessagesDiv) return;
        const messageElement = document.createElement('p');
        const displaySender = senderId === window.currentUserId ? 'あなた' : senderId.substring(0, 8) + '...'; // 自分のメッセージは「あなた」と表示
        messageElement.innerHTML = `<strong>[${displaySender}]:</strong> ${message}`;
        chatMessagesDiv.appendChild(messageElement);
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight; // スクロールを一番下へ
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

    if (createRoomButton) {
        createRoomButton.removeEventListener('click', handleCreateRoomButtonClick);
        createRoomButton.addEventListener('click', handleCreateRoomButtonClick);
    }
    if (joinRoomButton) {
        joinRoomButton.removeEventListener('click', handleJoinRoomButtonClick);
        joinRoomButton.addEventListener('click', handleJoinRoomButtonClick);
    }


    // イベントハンドラ関数
    async function handleMatchingButtonClick() {
        // マッチング開始をバックグラウンドに要求 (Firestoreマッチングロジックに置き換えられる可能性あり)
        const response = await chrome.runtime.sendMessage({ action: "startMatching" });
        if (response && response.success) {
            await window.showCustomDialog('オンラインマッチング開始', '対戦相手を検索中です...');
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

    async function handleCreateRoomButtonClick() {
        if (!window.db || !window.currentUserId) {
            await window.showCustomDialog('エラー', 'Firebaseが初期化されていません。');
            return;
        }

        const roomId = roomIdInput.value.trim() || crypto.randomUUID().substring(0, 8); // 入力がなければランダムなID
        const roomDocRef = getRoomDocRef(roomId);

        try {
            const docSnap = await getDoc(roomDocRef);
            if (docSnap.exists()) {
                await window.showCustomDialog('エラー', `ルームID「${roomId}」は既に存在します。別のIDを試すか、参加してください。`);
                return;
            }

            await setDoc(roomDocRef, {
                createdAt: new Date().toISOString(),
                creatorId: window.currentUserId,
                players: [window.currentUserId],
                status: 'waiting' // waiting, playing, finished
            });
            currentRoomId = roomId;
            await window.showCustomDialog('ルーム作成完了', `ルーム「${roomId}」を作成しました！`);
            
            // UIをマッチ後状態に切り替え
            if (preMatchUiDiv) preMatchUiDiv.style.display = 'none';
            if (matchingStatusDiv) matchingStatusDiv.style.display = 'none';
            if (postMatchUiDiv) postMatchUiDiv.style.display = 'block';

            if (chatMessagesDiv) {
                chatMessagesDiv.innerHTML = `<p><strong>[システム]:</strong> ルーム「${currentRoomId}」に参加しました。他のプレイヤーの参加を待っています。</p>`;
                chatMessagesDiv.dataset.initialized = 'true';
            }
            setupRoomListeners(currentRoomId);

        } catch (error) {
            console.error("Error creating room:", error);
            await window.showCustomDialog('エラー', `ルーム作成中にエラーが発生しました: ${error.message}`);
        }
    }

    async function handleJoinRoomButtonClick() {
        if (!window.db || !window.currentUserId) {
            await window.showCustomDialog('エラー', 'Firebaseが初期化されていません。');
            return;
        }

        const roomId = roomIdInput.value.trim();
        if (!roomId) {
            await window.showCustomDialog('エラー', '参加するルームIDを入力してください。');
            return;
        }

        const roomDocRef = getRoomDocRef(roomId);

        try {
            const docSnap = await getDoc(roomDocRef);
            if (!docSnap.exists()) {
                await window.showCustomDialog('エラー', `ルームID「${roomId}」は見つかりませんでした。`);
                return;
            }

            const roomData = docSnap.data();
            if (roomData.players.includes(window.currentUserId)) {
                await window.showCustomDialog('情報', `既にルーム「${roomId}」に参加しています。`);
            } else {
                // プレイヤーをルームに追加
                await updateDoc(roomDocRef, {
                    players: [...roomData.players, window.currentUserId]
                });
                await window.showCustomDialog('ルーム参加完了', `ルーム「${roomId}」に参加しました！`);
            }
            currentRoomId = roomId;

            // UIをマッチ後状態に切り替え
            if (preMatchUiDiv) preMatchUiDiv.style.display = 'none';
            if (matchingStatusDiv) matchingStatusDiv.style.display = 'none';
            if (postMatchUiDiv) postMatchUiDiv.style.display = 'block';

            if (chatMessagesDiv) {
                chatMessagesDiv.innerHTML = `<p><strong>[システム]:</strong> ルーム「${currentRoomId}」に参加しました。</p>`;
                chatMessagesDiv.dataset.initialized = 'true';
            }
            setupRoomListeners(currentRoomId);

        } catch (error) {
            console.error("Error joining room:", error);
            await window.showCustomDialog('エラー', `ルーム参加中にエラーが発生しました: ${error.message}`);
        }
    }


    async function handleSendChatButtonClick() {
        if (!chatInput || !chatMessagesDiv || !currentRoomId || !window.db || !window.currentUserId) {
            await window.showCustomDialog('エラー', 'チャットを送信できません。ルームに参加しているか確認してください。');
            return;
        }
        const message = chatInput.value.trim();
        if (message) {
            try {
                await addDoc(getMessagesCollectionRef(currentRoomId), {
                    senderId: window.currentUserId,
                    message: message,
                    timestamp: new Date().toISOString()
                });
                chatInput.value = '';
            } catch (error) {
                console.error("Error sending message:", error);
                await window.showCustomDialog('エラー', `メッセージ送信中にエラーが発生しました: ${error.message}`);
            }
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
            
            // マッチ情報をクリアするメッセージをバックグラウンドに送信し、その完了を待つ
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
            
            // マッチ情報をクリアするメッセージをバックグラウンドに送信し、その完了を待つ
            await chrome.runtime.sendMessage({ action: "clearMatchInfo" });
            updateMatchingUI(); // UIを元の状態に戻す
        }
    }

    async function handleCancelBattleButtonClick() {
        const confirmed = await window.showCustomDialog('対戦中止', '対戦を中止しますか？', true);
        if (confirmed) {
            await window.showCustomDialog('完了', '対戦を中止しました。');
            
            // マッチ情報をクリアするメッセージをバックグラウンドに送信し、その完了を待つ
            await chrome.runtime.sendMessage({ action: "clearMatchInfo" });
            updateMatchingUI(); // UIを元の状態に戻す
        }
    }

    updateRateDisplay(); // 初期レート表示
    loadMatchHistory();
    updateMatchingUI(); // 初期ロード時にマッチング状態をチェックしてUIを更新

    // main.jsでマッチング完了通知を処理するため、ここでのリスナーは不要
    // Firebase Auth Readyイベント後にUIを更新
    if (window.currentUserId) { // 既に認証済みの場合
        userIdDisplay.textContent = window.currentUserId;
    }
    document.addEventListener('firebaseAuthReady', () => {
        userIdDisplay.textContent = window.currentUserId;
        updateMatchingUI(); // Firebase認証後にUIを再更新して状態を反映
    });

}; // End of initRateMatchSection
