// js/sections/rateMatch.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initRateMatchSection = async function() {
    console.log("RateMatch section initialized.");

    // Firefox互換性のためのbrowserオブジェクトのフォールバック (main.jsにもありますが、念のためここでも)
    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    // === レート戦セクションのロジック ===
    // 各要素を関数内で取得
    const matchingButton = document.getElementById('matching-button');
    const cancelMatchingButtonInStatus = document.getElementById('cancel-matching-button-in-status'); // 新しいキャンセルボタン
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

    // --- 新しい対戦相手情報UI要素 ---
    const opponentUsernameDisplay = document.getElementById('opponent-username-display');
    const webrtcConnectionStatus = document.getElementById('webrtc-connection-status');
    // --- End 新しい対戦相手情報UI要素 ---


    // グローバルなログイン状態変数 (main.jsからアクセスされる)
    window.currentRate = window.currentRate || 1500;
    window.currentUsername = window.currentUsername || null;
    window.currentUserId = window.currentUserId || null; // サーバーが発行するUUID
    window.userMatchHistory = window.userMatchHistory || [];
    window.userMemos = window.userMemos || [];
    window.userBattleRecords = window.userBattleRecords || [];
    window.userRegisteredDecks = window.userRegisteredDecks || [];
    window.ws = window.ws || null; // WebSocketインスタンスもグローバルに

    // 現在のマッチIDを保持 (結果報告用)
    let currentMatchId = null;


    // --- WebSocket & WebRTC Variables ---
    const RENDER_WS_URL = 'wss://anokoro-tcg-api.onrender.com';

    let peerConnection = null; // WebRTC PeerConnection
    let dataChannel = null; // WebRTC DataChannel for chat
    let opponentPlayerId = null; // 相手のユーザーID (内部的に使用)
    let opponentUsername = null; // 相手のユーザー名 (UI表示用)
    let isWebRTCOfferInitiator = false; // WebRTCのOfferを作成する側かどうかのフラグ
    let iceCandidateBuffer = []; // **[FIX]** ICE候補を一時的に保存するバッファ

    // STUNサーバーの設定 (P2P接続を助けるための無料サーバー)
    const iceServers = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
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

            // マッチングUIの表示
            if (currentMatchId) { // マッチング成立後 (currentMatchIdがある場合)
                 if (preMatchUiDiv) preMatchUiDiv.style.display = 'none';
                 if (matchingStatusDiv) matchingStatusDiv.style.display = 'none';
                 if (postMatchUiDiv) postMatchUiDiv.style.display = 'block';
                 
                 // 対戦相手情報を表示
                 if (opponentUsernameDisplay) opponentUsernameDisplay.textContent = opponentUsername || '不明';

                 if (chatMessagesDiv && chatMessagesDiv.dataset.initialized !== 'true') {
                     chatMessagesDiv.innerHTML = `
                         <p><strong>[システム]:</strong> 対戦が始まりました！</p>
                         <p><strong>[システム]:</strong> WebRTC接続を確立中...</p>
                     `;
                     chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
                     chatMessagesDiv.dataset.initialized = 'true';
                 }
            } else if (matchingStatusDiv && matchingStatusDiv.style.display === 'flex') { // マッチング待機中
                // 既にマッチング待機中UIが表示されている場合、そのまま維持
                if (preMatchUiDiv) preMatchUiDiv.style.display = 'none';
                if (postMatchUiDiv) postMatchUiDiv.style.display = 'none';
            }
            else { // マッチング前 (デフォルト状態)
                if (preMatchUiDiv) preMatchUiDiv.style.display = 'block';
                if (matchingStatusDiv) matchingStatusDiv.style.display = 'none';
                if (postMatchUiDiv) postMatchUiDiv.style.display = 'none';
            }
            if (chatMessagesDiv) chatMessagesDiv.dataset.initialized = 'false'; // リセット
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

    // 対戦履歴を読み込む関数
    const loadMatchHistory = () => {
        if (!matchHistoryList) return;
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

    // チャットメッセージをUIに表示する関数
    const displayChatMessage = (senderId, message) => {
        if (!chatMessagesDiv) return;
        const messageElement = document.createElement('p');
        const displaySender = (senderId === window.currentUserId) ? 'あなた' : (opponentUsername || '相手プレイヤー'); 
        messageElement.innerHTML = `<strong>[${displaySender}]:</strong> ${message}`;
        chatMessagesDiv.appendChild(messageElement);
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight; // スクロールを一番下へ
    };

    // --- WebSocket Connection Setup ---
    const connectWebSocket = () => {
        if (window.ws && (window.ws.readyState === WebSocket.OPEN || window.ws.readyState === WebSocket.CONNECTING)) {
            console.log("WebSocket already open or connecting (global instance).");
            return;
        }
        window.ws = new WebSocket(RENDER_WS_URL);

        window.ws.onopen = () => {
            console.log("WebSocket connected to server.");
            browser.storage.local.get(['loggedInUserId', 'loggedInUsername'], (result) => {
                if (result.loggedInUserId && result.loggedInUsername) {
                    window.ws.send(JSON.stringify({
                        type: 'auto_login',
                        userId: result.loggedInUserId,
                        username: result.loggedInUsername
                    }));
                    console.log("Attempting auto-login with cached credentials.");
                } else {
                    updateUIState();
                }
            });
        };

        window.ws.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            console.log("WebSocket message received:", message.type);

            switch (message.type) {
                case 'register_response':
                case 'login_response':
                case 'auto_login_response':
                case 'logout_response':
                case 'logout_forced':
                    handleAuthMessages(message);
                    break;
                case 'queue_status':
                    console.log("Queue status:", message.message);
                    if(matchingStatusDiv) matchingStatusDiv.textContent = message.message;
                    break;
                case 'match_found':
                    opponentPlayerId = message.opponentUserId;
                    opponentUsername = message.opponentUsername;
                    currentMatchId = message.matchId;
                    isWebRTCOfferInitiator = message.isInitiator;
                    console.log(`Match found! Opponent: ${opponentPlayerId} (${opponentUsername}), Initiator: ${isWebRTCOfferInitiator}, MatchId: ${currentMatchId}`);
                    await window.showCustomDialog('対戦相手決定', `対戦相手が見つかりました！対戦を開始しましょう！`);
                    updateUIState();
                    await setupPeerConnection();
                    break;
                case 'webrtc_signal':
                    await handleWebRTCSignal(message.signal);
                    break;
                case 'update_user_data_response':
                    if (message.success) {
                        console.log("User data updated on server.");
                        window.currentRate = message.userData.rate;
                        window.userMatchHistory = message.userData.matchHistory;
                        window.userMemos = message.userData.memos;
                        window.userBattleRecords = message.userData.battleRecords;
                        window.userRegisteredDecks = message.userData.registeredDecks;
                        updateRateDisplay();
                        loadMatchHistory();
                        document.dispatchEvent(new CustomEvent('loginStateChanged'));
                    } else {
                        console.error("Failed to update user data on server:", message.message);
                    }
                    break;
                case 'report_result_response':
                    if (message.success) {
                        await window.showCustomDialog('結果報告', message.message);
                        if (message.result && (message.result.startsWith('resolved') || message.result === 'disputed')) {
                            window.currentRate = message.myNewRate;
                            window.userMatchHistory = message.myMatchHistory;
                            updateRateDisplay();
                            loadMatchHistory();
                            clearMatchAndP2PConnection();
                            updateUIState();
                        }
                    } else {
                        await window.showCustomDialog('結果報告失敗', message.message);
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
            clearMatchAndP2PConnection();
            updateUIState();
        };

        window.ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            window.showCustomDialog('エラー', 'マッチングサーバーへの接続に失敗しました。サーバーが起動しているか確認してください。');
        };
    };
    // --- End WebSocket Connection Setup ---

    // --- Auth Message Handler ---
    const handleAuthMessages = async (message) => {
        switch(message.type) {
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
            case 'auto_login_response':
                if (message.success) {
                    window.currentUserId = message.userId;
                    window.currentUsername = message.username;
                    window.currentRate = message.rate;
                    window.userMatchHistory = message.matchHistory || [];
                    window.userMemos = message.memos || [];
                    window.userBattleRecords = message.battleRecords || [];
                    window.userRegisteredDecks = message.registeredDecks || [];
                    if (message.type === 'login_response') {
                        await window.showCustomDialog('ログイン成功', message.message);
                    }
                    browser.storage.local.set({ loggedInUserId: window.currentUserId, loggedInUsername: window.currentUsername });
                } else {
                    await window.showCustomDialog('ログイン失敗', message.message);
                    browser.storage.local.remove(['loggedInUserId', 'loggedInUsername']);
                }
                updateUIState();
                break;
            case 'logout_response':
            case 'logout_forced':
                window.currentUserId = null;
                window.currentUsername = null;
                window.currentRate = 1500;
                window.userMatchHistory = [];
                window.userMemos = [];
                window.userBattleRecords = [];
                window.userRegisteredDecks = [];
                await window.showCustomDialog(message.type === 'logout_response' ? 'ログアウト完了' : '切断されました', message.message);
                browser.storage.local.remove(['loggedInUserId', 'loggedInUsername']);
                clearMatchAndP2PConnection();
                updateUIState();
                break;
        }
    };
    
    // --- WebRTC Handlers ---
    const handleWebRTCSignal = async (signal) => {
        if (!peerConnection) {
            console.error("Received WebRTC signal but peerConnection is not initialized.");
            return;
        }
        try {
            if (signal.sdp) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
                console.log("WebRTC: Remote description set.");

                // **[FIX]** Process any buffered ICE candidates now that remote description is set
                iceCandidateBuffer.forEach(candidate => {
                    peerConnection.addIceCandidate(candidate).catch(e => console.error("Error adding buffered ICE candidate:", e));
                });
                iceCandidateBuffer = []; // Clear the buffer

                if (signal.type === 'offer') {
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    window.ws.send(JSON.stringify({ type: 'webrtc_signal', signal: peerConnection.localDescription }));
                    console.log("WebRTC: Answer created and sent.");
                }
            } else if (signal.candidate) {
                // **[FIX]** Buffer candidates if remote description is not yet set
                if (peerConnection.remoteDescription) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(signal));
                    console.log("WebRTC: ICE candidate added.");
                } else {
                    iceCandidateBuffer.push(new RTCIceCandidate(signal));
                    console.log("WebRTC: ICE candidate buffered.");
                }
            }
        } catch (e) {
            console.error("WebRTC: Error processing signaling message:", e);
        }
    };

    const setupPeerConnection = async () => {
        clearMatchAndP2PConnection(); // Clear any previous connection
        peerConnection = new RTCPeerConnection(iceServers);

        peerConnection.onconnectionstatechange = () => {
            if (webrtcConnectionStatus) {
                webrtcConnectionStatus.textContent = peerConnection.connectionState;
                console.log("WebRTC connection state changed:", peerConnection.connectionState);
                if (peerConnection.connectionState === 'connected') {
                    displayChatMessage('システム', 'P2P接続が確立されました！');
                } else if (['failed', 'disconnected', 'closed'].includes(peerConnection.connectionState)) {
                    displayChatMessage('システム', `P2P接続が${peerConnection.connectionState}状態になりました。`);
                    if (chatInput) chatInput.disabled = true;
                    if (sendChatButton) sendChatButton.disabled = true;
                }
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                window.ws.send(JSON.stringify({ type: 'webrtc_signal', signal: event.candidate }));
                console.log("WebRTC: Sending ICE candidate.");
            }
        };

        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            setupDataChannelListeners();
            console.log("WebRTC: DataChannel received from remote peer.");
        };

        if (isWebRTCOfferInitiator) {
            dataChannel = peerConnection.createDataChannel("chat");
            setupDataChannelListeners();
            console.log("WebRTC: DataChannel created by initiator.");
            
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            window.ws.send(JSON.stringify({ type: 'webrtc_signal', signal: peerConnection.localDescription }));
            console.log("WebRTC: Offer created and sent.");
        }
    };

    const setupDataChannelListeners = () => {
        if (!dataChannel) return;

        dataChannel.onopen = () => {
            console.log("WebRTC: DataChannel is open!");
            displayChatMessage('システム', 'P2Pチャットを開始できます。');
            if (chatInput) chatInput.disabled = false;
            if (sendChatButton) sendChatButton.disabled = false;
        };

        dataChannel.onmessage = (event) => {
            displayChatMessage(opponentPlayerId, event.data);
            console.log("WebRTC: Chat message received via DataChannel:", event.data);
        };

        dataChannel.onclose = () => {
            console.log("WebRTC: DataChannel closed.");
            displayChatMessage('システム', 'P2Pチャットが切断されました。');
            if (chatInput) chatInput.disabled = true;
            if (sendChatButton) sendChatButton.disabled = true;
        };

        dataChannel.onerror = (error) => {
            console.error("WebRTC: DataChannel error:", error);
            displayChatMessage('システム', `P2P接続エラー: ${error.message}`);
        };
    };

    const clearMatchAndP2PConnection = () => {
        opponentPlayerId = null;
        opponentUsername = null;
        currentMatchId = null;
        isWebRTCOfferInitiator = false;
        iceCandidateBuffer = []; // **[FIX]** Clear buffer on cleanup
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
            console.log("WebRTC: PeerConnection closed during cleanup.");
        }
        if (dataChannel) {
            dataChannel = null;
            console.log("WebRTC: DataChannel cleared during cleanup.");
        }
        if (window.ws && window.ws.readyState === WebSocket.OPEN && window.currentUserId) {
            window.ws.send(JSON.stringify({ type: 'clear_match_info' }));
        }
    };
    // --- End WebRTC Handlers ---


    // --- Event Listeners Setup ---
    const addEventListeners = () => {
        if (registerButton) registerButton.addEventListener('click', handleRegisterButtonClick);
        if (loginButton) loginButton.addEventListener('click', handleLoginButtonClick);
        if (logoutButton) logoutButton.addEventListener('click', handleLogoutButtonClick);
        window.handleLogoutButtonClickFromRateMatch = handleLogoutButtonClick;

        if (matchingButton) matchingButton.addEventListener('click', handleMatchingButtonClick);
        if (cancelMatchingButtonInStatus) cancelMatchingButtonInStatus.addEventListener('click', handleCancelMatchingButtonClick);

        if (sendChatButton) sendChatButton.addEventListener('click', handleSendChatButtonClick);
        if (chatInput) chatInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleSendChatButtonClick());
        chatPhraseButtons.forEach(button => button.addEventListener('click', handleChatPhraseButtonClick));

        if (winButton) winButton.addEventListener('click', () => handleReportResultClick('win'));
        if (loseButton) loseButton.addEventListener('click', () => handleReportResultClick('lose'));
        if (cancelButton) cancelButton.addEventListener('click', () => handleReportResultClick('cancel'));
    };
    // --- End Event Listeners Setup ---

    // --- Event Handlers ---
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
        if (preMatchUiDiv) preMatchUiDiv.style.display = 'none';
        if (matchingStatusDiv) matchingStatusDiv.style.display = 'flex';
        if(matchingStatusDiv) matchingStatusDiv.textContent = '対戦相手を検索中です...';
        if (postMatchUiDiv) postMatchUiDiv.style.display = 'none';
        if (matchingButton) matchingButton.disabled = true;
        if (cancelMatchingButtonInStatus) cancelMatchingButtonInStatus.disabled = false;

        window.ws.send(JSON.stringify({ type: 'join_queue', userId: window.currentUserId }));
    }

    async function handleCancelMatchingButtonClick() {
        const confirmed = await window.showCustomDialog('マッチングキャンセル', 'マッチングをキャンセルしますか？', true);
        if (confirmed) {
            if (window.ws && window.ws.readyState === WebSocket.OPEN && window.currentUserId) {
                window.ws.send(JSON.stringify({ type: 'leave_queue', userId: window.currentUserId }));
            } else {
                await window.showCustomDialog('エラー', 'サーバーに接続していません。');
            }
            clearMatchAndP2PConnection();
            updateUIState();
        }
    }

    async function handleSendChatButtonClick() {
        if (!chatInput || !dataChannel || dataChannel.readyState !== 'open') {
            await window.showCustomDialog('エラー', 'チャットを送信できません。P2P接続が確立されているか確認してください。');
            return;
        }
        const message = chatInput.value.trim();
        if (message) {
            dataChannel.send(message);
            displayChatMessage(window.currentUserId, message);
            chatInput.value = '';
        }
    }

    function handleChatPhraseButtonClick(event) {
        if (chatInput && sendChatButton) {
            chatInput.value = event.currentTarget.textContent;
            handleSendChatButtonClick();
        }
    }

    async function handleReportResultClick(resultToReport) {
        const confirmationMessages = {
            win: '対戦に勝利したことを報告しますか？',
            lose: '対戦に敗北したことを報告しますか？',
            cancel: '対戦を中止したことを報告しますか？'
        };
        const confirmed = await window.showCustomDialog('結果報告', confirmationMessages[resultToReport], true);
        if (!confirmed) return;

        if (!window.currentUserId || !window.ws || window.ws.readyState !== WebSocket.OPEN || !currentMatchId) {
            await window.showCustomDialog('エラー', 'ログインしていないか、有効なマッチ中です。');
            return;
        }

        window.ws.send(JSON.stringify({
            type: 'report_result',
            userId: window.currentUserId,
            matchId: currentMatchId,
            result: resultToReport
        }));
        await window.showCustomDialog('報告送信', '対戦結果をサーバーに報告しました。相手の報告を待っています。');
    }
    // --- End Event Handlers ---

    // --- Initial Load ---
    addEventListeners();
    connectWebSocket();
    updateUIState();
    // --- End Initial Load ---

};
void 0; // Explicitly return undefined for Firefox compatibility
