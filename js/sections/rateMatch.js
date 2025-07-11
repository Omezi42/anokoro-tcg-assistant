// js/sections/rateMatch.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initRateMatchSection = async function() { // async を追加
    console.log("RateMatch section initialized.");

    // Firebaseが利用可能になるまで待機
    if (typeof firebase === 'undefined' || !firebase.firestore || !firebase.auth || !window.db || !window.auth || !window.currentUserId) {
        console.log("Firebase SDKs or global instances not yet ready. Waiting for firebaseAuthReady event...");
        await new Promise(resolve => document.addEventListener('firebaseAuthReady', resolve, { once: true }));
        console.log("Firebase is now ready!");
    }

    // Firefox互換性のためのbrowserオブジェクトのフォールバック (main.jsにもありますが、念のためここでも)
    if (typeof browser === 'undefined') {
        var browser = chrome;
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

    let currentRate = 1500; // 仮の初期レート

    // --- WebSocket & WebRTC Variables ---
    // ReplitサーバーのWebSocket URLに置き換えてください！
    const REPLIT_WS_URL = 'https://8b8f6d6b-0ed0-4b33-9c7f-a5f4fa7b86f7-00-u0oyrmlyl7jd.pike.replit.dev/'; // ★★★ ここをReplitのURLに置き換える ★★★

    let ws = null; // WebSocket接続
    let peerConnection = null; // WebRTC PeerConnection
    let dataChannel = null; // WebRTC DataChannel for chat
    let localPlayerId = null; // 自身のプレイヤーID
    let opponentPlayerId = null; // 相手のプレイヤーID
    let isWebRTCOfferInitiator = false; // WebRTCのOfferを作成する側かどうかのフラグ

    // STUNサーバーの設定 (P2P接続を助けるための無料サーバー)
    const iceServers = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            // 必要であれば他の無料STUNサーバーを追加
        ]
    };
    // --- End WebSocket & WebRTC Variables ---


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
        browser.storage.local.get(['matchHistory'], (result) => {
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
        browser.storage.local.get(['matchHistory'], (result) => {
            const history = result.slice(0, 9); // 最新10件に制限 (unshift前に制限)
            history.unshift(record); // 最新のものを先頭に追加
            browser.storage.local.set({matchHistory: history}, () => {
                loadMatchHistory(); // 保存後に再読み込み
            });
        });
    };

    // マッチング状態をUIに反映する関数
    const updateMatchingUI = () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            // WebSocket接続が開いている場合
            if (isWebRTCOfferInitiator || opponentPlayerId) { // マッチング成立後
                 if (preMatchUiDiv) preMatchUiDiv.style.display = 'none';
                 if (matchingStatusDiv) matchingStatusDiv.style.display = 'none';
                 if (postMatchUiDiv) postMatchUiDiv.style.display = 'block';
                 if (chatMessagesDiv && chatMessagesDiv.dataset.initialized !== 'true') {
                     chatMessagesDiv.innerHTML = `
                         <p><strong>[システム]:</strong> 対戦が始まりました！</p>
                         <p><strong>[システム]:</strong> WebRTC接続を確立中...</p>
                     `;
                     chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
                     chatMessagesDiv.dataset.initialized = 'true';
                 }
            } else { // マッチング待ち中
                if (preMatchUiDiv) preMatchUiDiv.style.display = 'none';
                if (matchingStatusDiv) matchingStatusDiv.style.display = 'flex';
                if (postMatchUiDiv) postMatchUiDiv.style.display = 'none';
            }
        } else {
            // WebSocketが切断されているか、まだ開いていない場合
            if (preMatchUiDiv) preMatchUiDiv.style.display = 'block';
            if (matchingStatusDiv) matchingStatusDiv.style.display = 'none';
            if (postMatchUiDiv) postMatchUiDiv.style.display = 'none';
            if (chatMessagesDiv) chatMessagesDiv.dataset.initialized = 'false'; // リセット
        }
    };

    // チャットメッセージをUIに表示する関数
    const displayChatMessage = (senderId, message) => {
        if (!chatMessagesDiv) return;
        const messageElement = document.createElement('p');
        const displaySender = senderId === localPlayerId ? 'あなた' : '相手プレイヤー'; 
        messageElement.innerHTML = `<strong>[${displaySender}]:</strong> ${message}`;
        chatMessagesDiv.appendChild(messageElement);
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight; // スクロールを一番下へ
    };

    // --- WebSocket Connection Setup ---
    const connectWebSocket = () => {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            console.log("WebSocket already open or connecting.");
            return;
        }
        ws = new WebSocket(REPLIT_WS_URL);

        ws.onopen = () => {
            console.log("WebSocket connected to Replit server.");
            // 接続後、Replitサーバーから自身のIDが送られてくるのを待つ
            updateMatchingUI();
        };

        ws.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            console.log("WebSocket message received:", message.type);

            switch (message.type) {
                case 'your_id':
                    localPlayerId = message.id;
                    console.log("My player ID:", localPlayerId);
                    if (userIdDisplay) userIdDisplay.textContent = localPlayerId.substring(0, 8) + '...'; // IDの一部を表示
                    break;
                case 'queue_status':
                    console.log("Queue status:", message.message);
                    // UI更新はupdateMatchingUIでまとめて行う
                    break;
                case 'match_found':
                    opponentPlayerId = message.opponentId;
                    isWebRTCOfferInitiator = message.isInitiator;
                    console.log(`Match found! Opponent: ${opponentPlayerId}, Initiator: ${isWebRTCOfferInitiator}`);
                    window.showCustomDialog('対戦相手決定', `対戦相手が見つかりました！対戦を開始しましょう！`);
                    updateMatchingUI();
                    await setupPeerConnection(); // WebRTC接続のセットアップを開始
                    break;
                case 'webrtc_signal':
                    // WebRTCシグナリングメッセージを受信
                    if (peerConnection) {
                        try {
                            if (message.signal.sdp) {
                                // SDP (Offer or Answer)
                                await peerConnection.setRemoteDescription(new RTCSessionDescription(message.signal));
                                console.log("WebRTC: Remote description set.");
                                if (!isWebRTCOfferInitiator && message.signal.type === 'offer') {
                                    // Offerを受け取った側はAnswerを作成して送信
                                    const answer = await peerConnection.createAnswer();
                                    await peerConnection.setLocalDescription(answer);
                                    ws.send(JSON.stringify({ type: 'webrtc_signal', signal: peerConnection.localDescription }));
                                    console.log("WebRTC: Answer created and sent.");
                                }
                            } else if (message.signal.candidate) {
                                // ICE candidate
                                await peerConnection.addIceCandidate(new RTCIceCandidate(message.signal));
                                console.log("WebRTC: ICE candidate added.");
                            }
                        } catch (e) {
                            console.error("WebRTC: Error processing signaling message:", e);
                        }
                    }
                    break;
                case 'chat_message':
                    // WebSocket経由でのチャットメッセージ（P2P DataChannelが確立されるまでのフォールバック）
                    displayChatMessage(message.senderId, message.message);
                    break;
                default:
                    console.warn("Unknown message type from server:", message.type);
            }
        };

        ws.onclose = () => {
            console.log("WebSocket disconnected.");
            localPlayerId = null;
            opponentPlayerId = null;
            isWebRTCOfferInitiator = false;
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
            if (dataChannel) {
                dataChannel = null;
            }
            updateMatchingUI();
            // 切断されたら自動再接続を試みる（任意）
            // setTimeout(connectWebSocket, 5000); 
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            window.showCustomDialog('エラー', 'マッチングサーバーへの接続に失敗しました。Replitサーバーが起動しているか確認してください。');
        };
    };
    // --- End WebSocket Connection Setup ---


    // --- WebRTC PeerConnection Setup ---
    const setupPeerConnection = async () => {
        peerConnection = new RTCPeerConnection(iceServers);

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // ICE候補をWebSocketサーバー経由で相手に送信
                ws.send(JSON.stringify({ type: 'webrtc_signal', signal: event.candidate }));
                console.log("WebRTC: Sending ICE candidate.");
            }
        };

        peerConnection.onnegotiationneeded = async () => {
            if (isWebRTCOfferInitiator) {
                try {
                    // Offerを作成して送信
                    const offer = await peerConnection.createOffer();
                    await peerConnection.setLocalDescription(offer);
                    ws.send(JSON.stringify({ type: 'webrtc_signal', signal: peerConnection.localDescription }));
                    console.log("WebRTC: Offer created and sent.");
                } catch (e) {
                    console.error("WebRTC: Error creating or sending offer:", e);
                }
            }
        };

        peerConnection.ondatachannel = (event) => {
            // 相手からDataChannelが送られてきた場合
            dataChannel = event.channel;
            setupDataChannelListeners();
            console.log("WebRTC: DataChannel received from remote peer.");
        };

        if (isWebRTCOfferInitiator) {
            // Offer側はDataChannelを自分で作成
            dataChannel = peerConnection.createDataChannel("chat");
            setupDataChannelListeners();
            console.log("WebRTC: DataChannel created by initiator.");
        }
    };

    const setupDataChannelListeners = () => {
        if (!dataChannel) return;

        dataChannel.onopen = () => {
            console.log("WebRTC: DataChannel is open!");
            displayChatMessage('システム', 'P2P接続が確立されました！チャットを開始できます。');
            if (chatInput) chatInput.disabled = false;
            if (sendChatButton) sendChatButton.disabled = false;
        };

        dataChannel.onmessage = (event) => {
            // DataChannel経由でチャットメッセージを受信
            displayChatMessage(opponentPlayerId, event.data);
            console.log("WebRTC: Chat message received via DataChannel:", event.data);
        };

        dataChannel.onclose = () => {
            console.log("WebRTC: DataChannel closed.");
            displayChatMessage('システム', 'P2P接続が切断されました。');
            if (chatInput) chatInput.disabled = true;
            if (sendChatButton) sendChatButton.disabled = true;
        };

        dataChannel.onerror = (error) => {
            console.error("WebRTC: DataChannel error:", error);
            displayChatMessage('システム', `P2P接続エラー: ${error.message}`);
        };
    };
    // --- End WebRTC PeerConnection Setup ---


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
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            await window.showCustomDialog('エラー', 'サーバーに接続していません。ページをリロードしてください。');
            return;
        }
        if (localPlayerId) {
            ws.send(JSON.stringify({ type: 'join_queue' }));
            await window.showCustomDialog('オンラインマッチング開始', '対戦相手を検索中です...');
            updateMatchingUI();
        } else {
            await window.showCustomDialog('エラー', 'プレイヤーIDが取得できませんでした。');
        }
    }

    async function handleCancelMatchingButtonClick() {
        const confirmed = await window.showCustomDialog('マッチングキャンセル', 'マッチングをキャンセルしますか？', true);
        if (confirmed) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'leave_queue' }));
                await window.showCustomDialog('キャンセル完了', 'マッチングをキャンセルしました。');
            } else {
                await window.showCustomDialog('エラー', 'サーバーに接続していません。');
            }
            // WebRTC接続もクリーンアップ
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
            if (dataChannel) {
                dataChannel = null;
            }
            opponentPlayerId = null;
            isWebRTCOfferInitiator = false;
            updateMatchingUI(); // UIを更新
        }
    }

    async function handleSendChatButtonClick() {
        if (!chatInput || !dataChannel || dataChannel.readyState !== 'open') {
            await window.showCustomDialog('エラー', 'チャットを送信できません。P2P接続が確立されているか確認してください。');
            return;
        }
        const message = chatInput.value.trim();
        if (message) {
            dataChannel.send(message); // DataChannel経由で送信
            displayChatMessage(localPlayerId, message); // 自分のメッセージは即座に表示
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
            saveMatchHistory(`${new Date().toLocaleString()} - BO3 勝利 (レート: ${oldRate} → ${currentRate})`);
            await window.showCustomDialog('報告完了', `勝利を報告しました！<br>レート: ${oldRate} → ${currentRate} (+30)`);
            
            // マッチ情報をクリアするメッセージをサーバーに送信
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'clear_match_info' }));
            }
            // WebRTC接続もクリーンアップ
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
            if (dataChannel) {
                dataChannel = null;
            }
            opponentPlayerId = null;
            isWebRTCOfferInitiator = false;
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
            
            // マッチ情報をクリアするメッセージをサーバーに送信
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'clear_match_info' }));
            }
            // WebRTC接続もクリーンアップ
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
            if (dataChannel) {
                dataChannel = null;
            }
            opponentPlayerId = null;
            isWebRTCOfferInitiator = false;
            updateMatchingUI(); // UIを元の状態に戻す
        }
    }

    async function handleCancelBattleButtonClick() {
        const confirmed = await window.showCustomDialog('対戦中止', '対戦を中止しますか？', true);
        if (confirmed) {
            await window.showCustomDialog('完了', '対戦を中止しました。');
            
            // マッチ情報をクリアするメッセージをサーバーに送信
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'clear_match_info' }));
            }
            // WebRTC接続もクリーンアップ
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
            if (dataChannel) {
                dataChannel = null;
            }
            opponentPlayerId = null;
            isWebRTCOfferInitiator = false;
            updateMatchingUI(); // UIを元の状態に戻す
        }
    }

    // 初期ロード時の処理
    updateRateDisplay(); // 初期レート表示
    loadMatchHistory();
    connectWebSocket(); // WebSocket接続を開始
    updateMatchingUI(); // 初期ロード時にUIを更新

    // Firebase Auth Readyイベント後にUIを更新
    if (window.currentUserId) { // 既に認証済みの場合
        userIdDisplay.textContent = window.currentUserId;
    }
    document.addEventListener('firebaseAuthReady', () => {
        userIdDisplay.textContent = window.currentUserId;
        updateMatchingUI(); // Firebase認証後にUIを再更新して状態を反映
    });

}; // End of initRateMatchSection
void 0; // Explicitly return undefined for Firefox compatibility
