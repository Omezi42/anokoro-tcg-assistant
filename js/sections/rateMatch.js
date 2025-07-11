// js/sections/rateMatch.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initRateMatchSection = async function() {
    console.log("RateMatch section initialized.");

    // Firefox互換性のためのbrowserオブジェクトのフォールバック (main.jsにもありますが、念のためここでも)
    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    // === レート戦セクションのロジック ===
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

    const rateDisplay = document.getElementById('rate-display');
    const userIdDisplay = document.getElementById('user-id-display'); // ユーザーID表示要素
    const usernameDisplay = document.getElementById('username-display'); // ユーザー名表示要素

    // --- 新しい認証UI要素 ---
    const authSection = document.getElementById('auth-section');
    const loggedInUi = document.getElementById('logged-in-ui');
    const registerUsernameInput = document.getElementById('register-username');
    const registerPasswordInput = document.getElementById('register-password');
    const registerButton = document.getElementById('register-button');
    const loginUsernameInput = document.getElementById('login-username');
    const loginPasswordInput = document.getElementById('login-password');
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    // --- End 新しい認証UI要素 ---

    // グローバルなログイン状態変数 (main.jsからアクセスされる)
    window.currentRate = window.currentRate || 1500; // ログイン中のユーザーのレート
    window.currentUsername = window.currentUsername || null; // ログイン中のユーザー名
    window.currentUserId = window.currentUserId || null; // ログイン中のユーザーID (サーバーが発行)
    window.userMatchHistory = window.userMatchHistory || []; // ログイン中のユーザーの対戦履歴
    window.userMemos = window.userMemos || []; // ログイン中のユーザーのメモ
    window.userBattleRecords = window.userBattleRecords || []; // ログイン中のユーザーの対戦記録
    window.userRegisteredDecks = window.userRegisteredDecks || []; // ログイン中のユーザーの登録デッキ

    // WebSocketインスタンスをグローバルに保持
    window.ws = window.ws || null;


    // --- WebSocket & WebRTC Variables ---
    // RailwayサーバーのWebSocket URLに置き換えてください！
    const RAILWAY_WS_URL = 'wss://your-service-name-xxxx.up.railway.app'; // ★★★ ここをあなたのRailwayのURLに置き換える ★★★

    let peerConnection = null; // WebRTC PeerConnection
    let dataChannel = null; // WebRTC DataChannel for chat
    let opponentPlayerId = null; // 相手のユーザーID
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

    // UIの表示状態を更新する関数
    const updateUIState = () => {
        if (window.currentUserId && window.currentUsername) {
            // ログイン済み
            if (authSection) authSection.style.display = 'none';
            if (loggedInUi) loggedInUi.style.display = 'block';
            if (usernameDisplay) usernameDisplay.textContent = window.currentUsername;
            if (userIdDisplay) userIdDisplay.textContent = window.currentUserId.substring(0, 8) + '...'; // IDの一部を表示

            // マッチングUIの表示
            if (opponentPlayerId) { // マッチング成立後
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
            } else { // マッチング待ち中またはマッチング前
                if (preMatchUiDiv) preMatchUiDiv.style.display = 'block'; // マッチングボタンを表示
                if (matchingStatusDiv) matchingStatusDiv.style.display = 'none';
                if (postMatchUiDiv) postMatchUiDiv.style.display = 'none';
                if (matchingButton) matchingButton.disabled = false;
                if (cancelMatchingButton) cancelMatchingButton.disabled = true;
                if (chatMessagesDiv) chatMessagesDiv.dataset.initialized = 'false'; // リセット
            }
        } else {
            // 未ログイン
            if (authSection) authSection.style.display = 'block';
            if (loggedInUi) loggedInUi.style.display = 'none';
            if (preMatchUiDiv) preMatchUiDiv.style.display = 'none';
            if (matchingStatusDiv) matchingStatusDiv.style.display = 'none';
            if (postMatchUiDiv) postMatchUiDiv.style.display = 'none';
            if (chatMessagesDiv) chatMessagesDiv.dataset.initialized = 'false'; // リセット
        }
        updateRateDisplay();
        loadMatchHistory(); // ログイン状態に応じて履歴をロード
        // ログイン状態変更イベントを発火
        document.dispatchEvent(new CustomEvent('loginStateChanged'));
    };

    // レート表示を更新する関数
    const updateRateDisplay = () => {
        if (rateDisplay) {
            rateDisplay.textContent = window.currentRate;
        }
    };

    // ローカルストレージから対戦履歴を読み込む関数
    const loadMatchHistory = () => {
        if (!matchHistoryList) return;
        // ログインしている場合はサーバーから取得した履歴を表示
        // 未ログインの場合は「履歴なし」を表示
        if (window.currentUserId && window.userMatchHistory) {
            const history = window.userMatchHistory;
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
        } else {
            matchHistoryList.innerHTML = '<li>ログインすると対戦履歴が表示されます。</li>';
        }
    };

    // 対戦履歴をサーバーに保存する関数
    const saveMatchHistoryToServer = async (record) => {
        if (!window.currentUserId || !window.ws || window.ws.readyState !== WebSocket.OPEN) {
            console.warn("Not logged in or WebSocket not open. Cannot save match history.");
            return;
        }
        // 既存の履歴に新しいレコードを追加
        const history = window.userMatchHistory || [];
        history.unshift(record); // 最新のものを先頭に追加
        window.userMatchHistory = history.slice(0, 10); // 最新10件に制限

        window.ws.send(JSON.stringify({
            type: 'update_user_data',
            userId: window.currentUserId,
            matchHistory: window.userMatchHistory
        }));
        loadMatchHistory(); // UIを更新
    };

    // チャットメッセージをUIに表示する関数
    const displayChatMessage = (senderId, message) => {
        if (!chatMessagesDiv) return;
        const messageElement = document.createElement('p');
        const displaySender = senderId === window.currentUserId ? 'あなた' : '相手プレイヤー'; 
        messageElement.innerHTML = `<strong>[${displaySender}]:</strong> ${message}`;
        chatMessagesDiv.appendChild(messageElement);
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight; // スクロールを一番下へ
    };

    // --- WebSocket Connection Setup ---
    const connectWebSocket = () => {
        // グローバルなwsインスタンスが既に存在し、接続中またはオープンであれば再接続しない
        if (window.ws && (window.ws.readyState === WebSocket.OPEN || window.ws.readyState === WebSocket.CONNECTING)) {
            console.log("WebSocket already open or connecting (global instance).");
            return;
        }
        window.ws = new WebSocket(RAILWAY_WS_URL);

        window.ws.onopen = () => {
            console.log("WebSocket connected to Railway server.");
            // 接続後、ローカルストレージに保存されたログイン情報があれば自動ログインを試みる
            browser.storage.local.get(['loggedInUserId', 'loggedInUsername'], (result) => {
                if (result.loggedInUserId && result.loggedInUsername) {
                    // サーバーに自動ログインリクエストを送信
                    window.ws.send(JSON.stringify({
                        type: 'auto_login',
                        userId: result.loggedInUserId,
                        username: result.loggedInUsername
                    }));
                    console.log("Attempting auto-login with cached credentials.");
                } else {
                    updateUIState(); // 未ログイン状態のUIを表示
                }
            });
        };

        window.ws.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            console.log("WebSocket message received:", message.type);

            switch (message.type) {
                case 'register_response':
                    if (message.success) {
                        await window.showCustomDialog('登録成功', message.message);
                        if (registerUsernameInput) registerUsernameInput.value = '';
                        if (registerPasswordInput) registerPasswordInput.value = '';
                    } else {
                        await window.showCustomDialog('登録失敗', message.message);
                    }
                    break;
                case 'login_response':
                    if (message.success) {
                        window.currentUserId = message.userId;
                        window.currentUsername = message.username;
                        window.currentRate = message.rate;
                        window.userMatchHistory = message.matchHistory || [];
                        window.userMemos = message.memos || [];
                        window.userBattleRecords = message.battleRecords || [];
                        window.userRegisteredDecks = message.registeredDecks || [];
                        await window.showCustomDialog('ログイン成功', message.message);
                        // ログイン情報をローカルストレージに保存 (タブ/ブラウザ再起動時の自動ログイン用)
                        browser.storage.local.set({ loggedInUserId: window.currentUserId, loggedInUsername: window.currentUsername });
                    } else {
                        await window.showCustomDialog('ログイン失敗', message.message);
                    }
                    updateUIState();
                    break;
                case 'auto_login_response': // 自動ログインの応答
                    if (message.success) {
                        window.currentUserId = message.userId;
                        window.currentUsername = message.username;
                        window.currentRate = message.rate;
                        window.userMatchHistory = message.matchHistory || [];
                        window.userMemos = message.memos || [];
                        window.userBattleRecords = message.battleRecords || [];
                        window.userRegisteredDecks = message.registeredDecks || [];
                        console.log("Auto-login successful.");
                    } else {
                        console.log("Auto-login failed:", message.message);
                        browser.storage.local.remove(['loggedInUserId', 'loggedInUsername']); // キャッシュをクリア
                    }
                    updateUIState();
                    break;
                case 'logout_response':
                    if (message.success) {
                        window.currentUserId = null;
                        window.currentUsername = null;
                        window.currentRate = 1500; // 初期レートに戻す
                        window.userMatchHistory = [];
                        window.userMemos = [];
                        window.userBattleRecords = [];
                        window.userRegisteredDecks = [];
                        await window.showCustomDialog('ログアウト完了', message.message);
                        browser.storage.local.remove(['loggedInUserId', 'loggedInUsername']); // ローカルストレージから削除
                    } else {
                        await window.showCustomDialog('ログアウト失敗', message.message);
                    }
                    updateUIState();
                    break;
                case 'logout_forced':
                    window.currentUserId = null;
                    window.currentUsername = null;
                    window.currentRate = 1500;
                    window.userMatchHistory = [];
                    window.userMemos = [];
                    window.userBattleRecords = [];
                    window.userRegisteredDecks = [];
                    browser.storage.local.remove(['loggedInUserId', 'loggedInUsername']);
                    await window.showCustomDialog('切断されました', message.message);
                    updateUIState();
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
                    break;
                case 'queue_status':
                    console.log("Queue status:", message.message);
                    matchingStatusDiv.textContent = message.message; // ステータス表示を更新
                    // UI更新はupdateUIStateでまとめて行う
                    break;
                case 'match_found':
                    opponentPlayerId = message.opponentUserId; // 相手のユーザーID
                    isWebRTCOfferInitiator = message.isInitiator;
                    console.log(`Match found! Opponent: ${opponentPlayerId}, Initiator: ${isWebRTCOfferInitiator}`);
                    await window.showCustomDialog('対戦相手決定', `対戦相手が見つかりました！対戦を開始しましょう！`);
                    updateUIState();
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
                                    window.ws.send(JSON.stringify({ type: 'webrtc_signal', signal: peerConnection.localDescription }));
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
                case 'update_user_data_response':
                    if (message.success) {
                        console.log("User data updated on server.");
                        // サーバーから返された最新のデータでローカルを更新
                        window.currentRate = message.userData.rate;
                        window.userMatchHistory = message.userData.matchHistory;
                        window.userMemos = message.userData.memos;
                        window.userBattleRecords = message.userData.battleRecords;
                        window.userRegisteredDecks = message.userData.registeredDecks;
                        updateRateDisplay();
                        loadMatchHistory(); // レート戦の履歴を更新
                        document.dispatchEvent(new CustomEvent('loginStateChanged')); // 他のセクションにデータ更新を通知
                    } else {
                        console.error("Failed to update user data on server:", message.message);
                    }
                    break;
                case 'error':
                    await window.showCustomDialog('エラー', message.message);
                    break;
                default:
                    console.warn("Unknown message type from server:", message.type);
            }
        };

        window.ws.onclose = () => {
            console.log("WebSocket disconnected.");
            // ログアウト状態にはしないが、マッチング関連の状態はリセット
            opponentPlayerId = null;
            isWebRTCOfferInitiator = false;
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
            if (dataChannel) {
                dataChannel = null;
            }
            updateUIState();
            // 切断されたら自動再接続を試みる（任意）
            // setTimeout(connectWebSocket, 5000); 
        };

        window.ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            window.showCustomDialog('エラー', 'マッチングサーバーへの接続に失敗しました。Railwayサーバーが起動しているか確認してください。');
        };
    };
    // --- End WebSocket Connection Setup ---


    // --- WebRTC PeerConnection Setup ---
    const setupPeerConnection = async () => {
        peerConnection = new RTCPeerConnection(iceServers);

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // ICE候補をWebSocketサーバー経由で相手に送信
                window.ws.send(JSON.stringify({ type: 'webrtc_signal', signal: event.candidate }));
                console.log("WebRTC: Sending ICE candidate.");
            }
        };

        peerConnection.onnegotiationneeded = async () => {
            if (isWebRTCOfferInitiator) {
                try {
                    // Offerを作成して送信
                    const offer = await peerConnection.createOffer();
                    await peerConnection.setLocalDescription(offer);
                    window.ws.send(JSON.stringify({ type: 'webrtc_signal', signal: peerConnection.localDescription }));
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
    // 認証関連
    if (registerButton) {
        registerButton.removeEventListener('click', handleRegisterButtonClick);
        registerButton.addEventListener('click', handleRegisterButtonClick);
    }
    if (loginButton) {
        loginButton.removeEventListener('click', handleLoginButtonClick);
        loginButton.addEventListener('click', handleLoginButtonClick);
    }
    if (logoutButton) {
        logoutButton.removeEventListener('click', handleLogoutButtonClick);
        logoutButton.addEventListener('click', handleLogoutButtonClick);
    }
    // home.jsから呼び出せるようにグローバルに公開
    window.handleLogoutButtonClickFromRateMatch = handleLogoutButtonClick;


    // マッチング関連
    if (matchingButton) {
        matchingButton.removeEventListener('click', handleMatchingButtonClick);
        matchingButton.addEventListener('click', handleMatchingButtonClick);
    }
    if (cancelMatchingButton) {
        cancelMatchingButton.removeEventListener('click', handleCancelMatchingButtonClick);
        cancelMatchingButton.addEventListener('click', handleCancelMatchingButtonClick);
    }

    // チャット関連
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

    // 対戦結果報告関連
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
    async function handleRegisterButtonClick() {
        const username = registerUsernameInput ? registerUsernameInput.value.trim() : '';
        const password = registerPasswordInput ? registerPasswordInput.value.trim() : '';
        if (!username || !password) {
            await window.showCustomDialog('エラー', 'ユーザー名とパスワードを入力してください。');
            return;
        }
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify({ type: 'register', username, password }));
        } else {
            await window.showCustomDialog('エラー', 'サーバーに接続していません。ページをリロードしてください。');
        }
    }

    async function handleLoginButtonClick() {
        const username = loginUsernameInput ? loginUsernameInput.value.trim() : '';
        const password = loginPasswordInput ? loginPasswordInput.value.trim() : '';
        if (!username || !password) {
            await window.showCustomDialog('エラー', 'ユーザー名とパスワードを入力してください。');
            return;
        }
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify({ type: 'login', username, password }));
        } else {
            await window.showCustomDialog('エラー', 'サーバーに接続していません。ページをリロードしてください。');
        }
    }

    async function handleLogoutButtonClick() {
        const confirmed = await window.showCustomDialog('ログアウト', 'ログアウトしますか？', true);
        if (confirmed) {
            if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                window.ws.send(JSON.stringify({ type: 'logout' }));
            } else {
                await window.showCustomDialog('エラー', 'サーバーに接続していません。');
            }
        }
    }

    async function handleMatchingButtonClick() {
        if (!window.currentUserId) {
            await window.showCustomDialog('エラー', 'レート戦を開始するにはログインしてください。');
            return;
        }
        if (!window.ws || window.ws.readyState !== WebSocket.OPEN) {
            await window.showCustomDialog('エラー', 'サーバーに接続していません。ページをリロードしてください。');
            return;
        }
        window.ws.send(JSON.stringify({ type: 'join_queue', userId: window.currentUserId }));
        matchingStatusDiv.textContent = '対戦相手を検索中です...';
        if (matchingButton) matchingButton.disabled = true;
        if (cancelMatchingButton) cancelMatchingButton.disabled = false;
        updateUIState();
    }

    async function handleCancelMatchingButtonClick() {
        const confirmed = await window.showCustomDialog('マッチングキャンセル', 'マッチングをキャンセルしますか？', true);
        if (confirmed) {
            if (window.ws && window.ws.readyState === WebSocket.OPEN && window.currentUserId) {
                window.ws.send(JSON.stringify({ type: 'leave_queue', userId: window.currentUserId }));
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
            updateUIState(); // UIを更新
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
            displayChatMessage(window.currentUserId, message); // 自分のメッセージは即座に表示
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
            const oldRate = window.currentRate;
            window.currentRate += 30; // 仮のレート増加
            updateRateDisplay();
            await saveMatchHistoryToServer(`${new Date().toLocaleString()} - BO3 勝利 (レート: ${oldRate} → ${window.currentRate})`);
            await window.showCustomDialog('報告完了', `勝利を報告しました！<br>レート: ${oldRate} → ${window.currentRate} (+30)`);

            // サーバーにレート更新を通知
            if (window.ws && window.ws.readyState === WebSocket.OPEN && window.currentUserId) {
                window.ws.send(JSON.stringify({ type: 'update_user_data', userId: window.currentUserId, rate: window.currentRate }));
                window.ws.send(JSON.stringify({ type: 'clear_match_info' })); // マッチ情報をクリア
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
            updateUIState(); // UIを元の状態に戻す
        }
    }

    async function handleLoseButtonClick() {
        const confirmed = await window.showCustomDialog('敗北報告', 'BO3の対戦で敗北を報告しますか？', true);
        if (confirmed) {
            const oldRate = window.currentRate;
            window.currentRate -= 20; // 仮のレート減少
            updateRateDisplay();
            await saveMatchHistoryToServer(`${new Date().toLocaleString()} - BO3 敗北 (レート: ${oldRate} → ${window.currentRate})`);
            await window.showCustomDialog('報告完了', `敗北を報告しました。<br>レート: ${oldRate} → ${window.currentRate} (-20)`);

            // サーバーにレート更新を通知
            if (window.ws && window.ws.readyState === WebSocket.OPEN && window.currentUserId) {
                window.ws.send(JSON.stringify({ type: 'update_user_data', userId: window.currentUserId, rate: window.currentRate }));
                window.ws.send(JSON.stringify({ type: 'clear_match_info' })); // マッチ情報をクリア
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
            updateUIState(); // UIを元の状態に戻す
        }
    }

    async function handleCancelBattleButtonClick() {
        const confirmed = await window.showCustomDialog('対戦中止', '対戦を中止しますか？', true);
        if (confirmed) {
            await window.showCustomDialog('完了', '対戦を中止しました。');

            // サーバーにレート更新を通知
            if (window.ws && window.ws.readyState === WebSocket.OPEN && window.currentUserId) {
                // レート変更なしでユーザーデータを更新（履歴は保存済み）
                window.ws.send(JSON.stringify({ type: 'clear_match_info' })); // マッチ情報をクリア
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
            updateUIState(); // UIを元の状態に戻す
        }
    }

    // 初期ロード時の処理
    connectWebSocket(); // WebSocket接続を開始
    updateUIState(); // 初期UI状態を更新

    // Firebase Auth ReadyイベントはReplit DB認証では不要になるが、
    // 他のセクションでFirebase Authを使用している場合は残す。
    // このファイルでは直接使用しないため、関連コードは削除/コメントアウト。
    // document.addEventListener('firebaseAuthReady', () => {
    //     // Firebase Auth Ready時の処理（Replit DB認証では不要）
    // });

}; // End of initRateMatchSection
void 0; // Explicitly return undefined for Firefox compatibility
