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

    let currentRate = 1500; // 仮の初期レート
    let currentUsername = null; // ログイン中のユーザー名
    let currentUserId = null; // ログイン中のユーザーID (サーバーが発行)

    // --- WebSocket & WebRTC Variables ---
    // RailwayサーバーのWebSocket URLに置き換えてください！
    const RAILWAY_WS_URL = 'production-asia-southeast1-eqsg3a.railway-registry.com/46a7cf96-56a6-4cff-865b-53cac7ec1a08:43282ad0-59d8-4770-8c7c-ccb2fcf0d60b'; // ★★★ ここをあなたのRailwayのURLに置き換える ★★★

    let ws = null; // WebSocket接続
    let peerConnection = null; // WebRTC PeerConnection
    let dataChannel = null; // WebRTC DataChannel for chat
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
        if (currentUserId && currentUsername) {
            // ログイン済み
            if (authSection) authSection.style.display = 'none';
            if (loggedInUi) loggedInUi.style.display = 'block';
            if (usernameDisplay) usernameDisplay.textContent = currentUsername;
            if (userIdDisplay) userIdDisplay.textContent = currentUserId.substring(0, 8) + '...'; // IDの一部を表示

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
    };

    // レート表示を更新する関数
    const updateRateDisplay = () => {
        if (rateDisplay) {
            rateDisplay.textContent = currentRate;
        }
    };

    // ローカルストレージから対戦履歴を読み込む関数
    const loadMatchHistory = () => {
        if (!matchHistoryList) return;
        // ログインしている場合はサーバーから取得した履歴を表示
        // 未ログインの場合は「履歴なし」を表示
        if (currentUserId && window.userMatchHistory) {
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
        if (!currentUserId || !ws || ws.readyState !== WebSocket.OPEN) {
            console.warn("Not logged in or WebSocket not open. Cannot save match history.");
            return;
        }
        // 既存の履歴に新しいレコードを追加
        const history = window.userMatchHistory || [];
        history.unshift(record); // 最新のものを先頭に追加
        window.userMatchHistory = history.slice(0, 10); // 最新10件に制限

        ws.send(JSON.stringify({
            type: 'update_user_data',
            userId: currentUserId,
            matchHistory: window.userMatchHistory
        }));
        loadMatchHistory(); // UIを更新
    };

    // チャットメッセージをUIに表示する関数
    const displayChatMessage = (senderId, message) => {
        if (!chatMessagesDiv) return;
        const messageElement = document.createElement('p');
        const displaySender = senderId === currentUserId ? 'あなた' : '相手プレイヤー'; 
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
        ws = new WebSocket(RAILWAY_WS_URL);

        ws.onopen = () => {
            console.log("WebSocket connected to Railway server.");
            // 接続後、ローカルストレージに保存されたログイン情報があれば自動ログインを試みる
            browser.storage.local.get(['loggedInUserId', 'loggedInUsername'], (result) => {
                if (result.loggedInUserId && result.loggedInUsername) {
                    // サーバーに自動ログインリクエストを送信
                    ws.send(JSON.stringify({
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

        ws.onmessage = async (event) => {
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
                        currentUserId = message.userId;
                        currentUsername = message.username;
                        currentRate = message.rate;
                        window.userMatchHistory = message.matchHistory || []; // グローバルに履歴を保存
                        await window.showCustomDialog('ログイン成功', message.message);
                        // ログイン情報をローカルストレージに保存 (タブ/ブラウザ再起動時の自動ログイン用)
                        browser.storage.local.set({ loggedInUserId: currentUserId, loggedInUsername: currentUsername });
                    } else {
                        await window.showCustomDialog('ログイン失敗', message.message);
                    }
                    updateUIState();
                    break;
                case 'auto_login_response': // 自動ログインの応答
                    if (message.success) {
                        currentUserId = message.userId;
                        currentUsername = message.username;
                        currentRate = message.rate;
                        window.userMatchHistory = message.matchHistory || [];
                        console.log("Auto-login successful.");
                    } else {
                        console.log("Auto-login failed:", message.message);
                        browser.storage.local.remove(['loggedInUserId', 'loggedInUsername']); // キャッシュをクリア
                    }
                    updateUIState();
                    break;
                case 'logout_response':
                    if (message.success) {
                        currentUserId = null;
                        currentUsername = null;
                        currentRate = 1500; // 初期レートに戻す
                        window.userMatchHistory = [];
                        await window.showCustomDialog('ログアウト完了', message.message);
                        browser.storage.local.remove(['loggedInUserId', 'loggedInUsername']); // ローカルストレージから削除
                    } else {
                        await window.showCustomDialog('ログアウト失敗', message.message);
                    }
                    updateUIState();
                    break;
                case 'logout_forced':
                    currentUserId = null;
                    currentUsername = null;
                    currentRate = 1500;
                    window.userMatchHistory = [];
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
                case 'update_user_data_response':
                    if (message.success) {
                        console.log("User data updated on server.");
                        // サーバーから返された最新のデータでローカルを更新
                        currentRate = message.userData.rate;
                        window.userMatchHistory = message.userData.matchHistory;
                        updateRateDisplay();
                        loadMatchHistory();
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

        ws.onclose = () => {
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

        ws.onerror = (error) => {
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
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'register', username, password }));
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
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'login', username, password }));
        } else {
            await window.showCustomDialog('エラー', 'サーバーに接続していません。ページをリロードしてください。');
        }
    }

    async function handleLogoutButtonClick() {
        const confirmed = await window.showCustomDialog('ログアウト', 'ログアウトしますか？', true);
        if (confirmed) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'logout' }));
            } else {
                await window.showCustomDialog('エラー', 'サーバーに接続していません。');
            }
        }
    }

    async function handleMatchingButtonClick() {
        if (!currentUserId) {
            await window.showCustomDialog('エラー', 'レート戦を開始するにはログインしてください。');
            return;
        }
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            await window.showCustomDialog('エラー', 'サーバーに接続していません。ページをリロードしてください。');
            return;
        }
        ws.send(JSON.stringify({ type: 'join_queue', userId: currentUserId }));
        matchingStatusDiv.textContent = '対戦相手を検索中です...';
        if (matchingButton) matchingButton.disabled = true;
        if (cancelMatchingButton) cancelMatchingButton.disabled = false;
        updateUIState();
    }

    async function handleCancelMatchingButtonClick() {
        const confirmed = await window.showCustomDialog('マッチングキャンセル', 'マッチングをキャンセルしますか？', true);
        if (confirmed) {
            if (ws && ws.readyState === WebSocket.OPEN && currentUserId) {
                ws.send(JSON.stringify({ type: 'leave_queue', userId: currentUserId }));
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
            displayChatMessage(currentUserId, message); // 自分のメッセージは即座に表示
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
            await saveMatchHistoryToServer(`${new Date().toLocaleString()} - BO3 勝利 (レート: ${oldRate} → ${currentRate})`);
            await window.showCustomDialog('報告完了', `勝利を報告しました！<br>レート: ${oldRate} → ${currentRate} (+30)`);

            // サーバーにレート更新を通知
            if (ws && ws.readyState === WebSocket.OPEN && currentUserId) {
                ws.send(JSON.stringify({ type: 'update_user_data', userId: currentUserId, rate: currentRate }));
                ws.send(JSON.stringify({ type: 'clear_match_info' })); // マッチ情報をクリア
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
            const oldRate = currentRate;
            currentRate -= 20; // 仮のレート減少
            updateRateDisplay();
            await saveMatchHistoryToServer(`${new Date().toLocaleString()} - BO3 敗北 (レート: ${oldRate} → ${currentRate})`);
            await window.showCustomDialog('報告完了', `敗北を報告しました。<br>レート: ${oldRate} → ${currentRate} (-20)`);

            // サーバーにレート更新を通知
            if (ws && ws.readyState === WebSocket.OPEN && currentUserId) {
                ws.send(JSON.stringify({ type: 'update_user_data', userId: currentUserId, rate: currentRate }));
                ws.send(JSON.stringify({ type: 'clear_match_info' })); // マッチ情報をクリア
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
            if (ws && ws.readyState === WebSocket.OPEN && currentUserId) {
                // レート変更なしでユーザーデータを更新（履歴は保存済み）
                ws.send(JSON.stringify({ type: 'clear_match_info' })); // マッチ情報をクリア
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

    // ページロード時にローカルストレージからログイン情報を読み込み、自動ログインを試みる
    // WebSocket接続が確立された後にサーバーにauto_loginリクエストを送信するように変更
    // browser.storage.local.get(['loggedInUserId', 'loggedInUsername'], (result) => {
    //     if (result.loggedInUserId && result.loggedInUsername) {
    //         currentUserId = result.loggedInUserId;
    //         currentUsername = result.loggedInUsername;
    //         console.log("Found cached login info. Will attempt auto-login after WS connection.");
    //     } else {
    //         updateUIState(); // 未ログイン状態のUIを表示
    //     }
    // });

    // Firebase Auth ReadyイベントはReplit DB認証では不要になるが、
    // 他のセクションでFirebase Authを使用している場合は残す。
    // このファイルでは直接使用しないため、関連コードは削除/コメントアウト。
    // document.addEventListener('firebaseAuthReady', () => {
    //     // Firebase Auth Ready時の処理（Replit DB認証では不要）
    // });

}; // End of initRateMatchSection
void 0; // Explicitly return undefined for Firefox compatibility
