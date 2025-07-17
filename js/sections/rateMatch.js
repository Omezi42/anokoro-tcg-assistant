// js/sections/rateMatch.js

// モジュールとしてエクスポート
export function initialize() {
    // 既に初期化済みの場合は処理を中断
    if (document.body.dataset.rateMatchInitialized === 'true') {
        // ログイン状態が変わった可能性があるため、UIは更新する
        const updateUIEvent = new CustomEvent('updateRateMatchUI');
        document.dispatchEvent(updateUIEvent);
        return;
    }
    document.body.dataset.rateMatchInitialized = 'true';

    console.log("RateMatch section initialized.");

    // APIオブジェクトを取得
    const a = self.browser || self.chrome;

    // --- DOM要素の取得 ---
    const getElement = (id) => document.getElementById(id);
    const elements = {
        authSection: getElement('auth-section'),
        loggedInUi: getElement('logged-in-ui'),
        registerUsernameInput: getElement('register-username'),
        registerPasswordInput: getElement('register-password'),
        registerButton: getElement('register-button'),
        loginUsernameInput: getElement('login-username'),
        loginPasswordInput: getElement('login-password'),
        loginButton: getElement('login-button'),
        logoutButton: getElement('logout-button'),
        matchingButton: getElement('matching-button'),
        cancelMatchingButton: getElement('cancel-matching-button-in-status'),
        matchingStatusDiv: getElement('matching-status'),
        preMatchUiDiv: getElement('pre-match-ui'),
        postMatchUiDiv: getElement('post-match-ui'),
        matchHistoryList: getElement('match-history-list'),
        rankingList: getElement('ranking-list'),
        refreshRankingButton: getElement('refresh-ranking-button'),
        usernameContainer: getElement('username-container'),
        editUsernameButton: getElement('edit-username-button'),
        editUsernameForm: getElement('edit-username-form'),
        newUsernameInput: getElement('new-username-input'),
        saveUsernameButton: getElement('save-username-button'),
        cancelEditUsernameButton: getElement('cancel-edit-username-button'),
        chatInput: getElement('chat-input'),
        sendChatButton: getElement('send-chat-button'),
        chatMessagesDiv: getElement('chat-messages'),
        winButton: getElement('win-button'),
        loseButton: getElement('lose-button'),
        cancelButton: getElement('cancel-button'),
        rateDisplay: getElement('rate-display'),
        usernameDisplay: getElement('username-display'),
        opponentUsernameDisplay: getElement('opponent-username-display'),
        webrtcConnectionStatus: getElement('webrtc-connection-status'),
    };
    const chatPhraseButtons = document.querySelectorAll('.chat-phrase-button');

    // --- 状態管理 ---
    let currentMatch = {
        id: null,
        opponentUserId: null,
        opponentUsername: null,
        isInitiator: false,
        peerConnection: null,
        dataChannel: null
    };

    const RENDER_WS_URL = 'wss://anokoro-tcg-api.onrender.com';

    // --- WebSocket接続 ---
    const connectWebSocket = () => {
        if (window.tcgAssistant.ws && window.tcgAssistant.ws.readyState === WebSocket.OPEN) {
            console.log("WebSocket is already connected.");
            // 接続済みでも自動ログインを試みる
            a.storage.local.get(['loggedInUserId', 'loggedInUsername'], (result) => {
                if (result.loggedInUserId && result.loggedInUsername) {
                    window.tcgAssistant.ws.send(JSON.stringify({ type: 'auto_login', userId: result.loggedInUserId, username: result.loggedInUsername }));
                }
            });
            return;
        }
        if (window.tcgAssistant.ws && window.tcgAssistant.ws.readyState === WebSocket.CONNECTING) {
            console.log("WebSocket is connecting.");
            return;
        }

        window.tcgAssistant.ws = new WebSocket(RENDER_WS_URL);
        const ws = window.tcgAssistant.ws;

        ws.onopen = () => {
            console.log("WebSocket connected to server.");
            a.storage.local.get(['loggedInUserId', 'loggedInUsername'], (result) => {
                if (result.loggedInUserId && result.loggedInUsername) {
                    ws.send(JSON.stringify({ type: 'auto_login', userId: result.loggedInUserId, username: result.loggedInUsername }));
                } else {
                    updateUI();
                }
            });
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log("WebSocket message received:", message);
            handleWebSocketMessage(message);
        };

        ws.onclose = () => {
            console.log("WebSocket disconnected.");
            clearMatchState();
            updateUI();
            // 5秒後に再接続を試みる
            setTimeout(connectWebSocket, 5000);
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            window.showCustomDialog('エラー', 'マッチングサーバーへの接続に失敗しました。');
        };
    };

    // --- UI更新 ---
    const updateUI = () => {
        const { currentUserId, currentUsername, currentRate, userMatchHistory } = window.tcgAssistant;
        const isLoggedIn = currentUserId && currentUsername;

        if (elements.authSection) elements.authSection.style.display = isLoggedIn ? 'none' : 'block';
        if (elements.loggedInUi) elements.loggedInUi.style.display = isLoggedIn ? 'block' : 'none';

        if (isLoggedIn) {
            if (elements.usernameDisplay) elements.usernameDisplay.textContent = currentUsername;
            if (elements.rateDisplay) elements.rateDisplay.textContent = currentRate;
            
            if (currentMatch.id) { // 対戦中
                if(elements.preMatchUiDiv) elements.preMatchUiDiv.style.display = 'none';
                if(elements.matchingStatusDiv) elements.matchingStatusDiv.style.display = 'none';
                if(elements.postMatchUiDiv) elements.postMatchUiDiv.style.display = 'block';
                if(elements.opponentUsernameDisplay) elements.opponentUsernameDisplay.textContent = currentMatch.opponentUsername || '不明';
            } else if (elements.matchingStatusDiv && elements.matchingStatusDiv.style.display === 'flex') { // マッチング待機中
                if(elements.preMatchUiDiv) elements.preMatchUiDiv.style.display = 'none';
                if(elements.postMatchUiDiv) elements.postMatchUiDiv.style.display = 'none';
            } else { // 待機状態
                if(elements.preMatchUiDiv) elements.preMatchUiDiv.style.display = 'block';
                if(elements.matchingStatusDiv) elements.matchingStatusDiv.style.display = 'none';
                if(elements.postMatchUiDiv) elements.postMatchUiDiv.style.display = 'none';
            }
            loadMatchHistory(userMatchHistory);
        }
    };
    
    const loadMatchHistory = (history) => {
        if (!elements.matchHistoryList) return;
        elements.matchHistoryList.innerHTML = '';
        if (!history || history.length === 0) {
            elements.matchHistoryList.innerHTML = '<li>まだ対戦履歴がありません。</li>';
            return;
        }
        history.forEach(record => {
            const li = document.createElement('li');
            li.textContent = record;
            elements.matchHistoryList.appendChild(li);
        });
    };

    const displayRanking = (rankingData) => {
        if (!elements.rankingList) return;
        elements.rankingList.innerHTML = '';
        if (!rankingData || rankingData.length === 0) {
            elements.rankingList.innerHTML = '<li>ランキングデータがありません。</li>';
            return;
        }
        rankingData.forEach((user, index) => {
            const li = document.createElement('li');
            if (user.username === window.tcgAssistant.currentUsername) {
                li.classList.add('current-user');
            }
            li.innerHTML = `
                <span class="rank">${index + 1}.</span>
                <span class="username">${user.username}</span>
                <span class="rate">${user.rate} Rate</span>
            `;
            elements.rankingList.appendChild(li);
        });
    };
    
    const displayChatMessage = (sender, message) => {
        if (!elements.chatMessagesDiv) return;
        const p = document.createElement('p');
        p.innerHTML = `<strong>[${sender}]:</strong> ${message}`;
        elements.chatMessagesDiv.appendChild(p);
        elements.chatMessagesDiv.scrollTop = elements.chatMessagesDiv.scrollHeight;
    };

    // --- 状態クリア ---
    const clearMatchState = () => {
        if (currentMatch.peerConnection) {
            currentMatch.peerConnection.close();
        }
        currentMatch = {
            id: null,
            opponentUserId: null,
            opponentUsername: null,
            isInitiator: false,
            peerConnection: null,
            dataChannel: null
        };
    };

    // --- WebRTC関連 ---
    const createPeerConnection = async () => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                window.tcgAssistant.ws.send(JSON.stringify({
                    type: 'webrtc_signal',
                    targetUserId: currentMatch.opponentUserId,
                    signal: { candidate: event.candidate }
                }));
            }
        };

        pc.onconnectionstatechange = () => {
            if(elements.webrtcConnectionStatus) elements.webrtcConnectionStatus.textContent = pc.connectionState;
            if (pc.connectionState === 'connected') {
                displayChatMessage('システム', 'P2P接続が確立しました！');
            } else if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
                displayChatMessage('システム', 'P2P接続が切れました。');
            }
        };
        
        pc.ondatachannel = (event) => {
            currentMatch.dataChannel = event.channel;
            setupDataChannelListeners();
        };

        currentMatch.peerConnection = pc;
    };
    
    const setupDataChannelListeners = () => {
        const dc = currentMatch.dataChannel;
        if (!dc) return;

        dc.onopen = () => {
            displayChatMessage('システム', 'チャットを開始できます。');
            if(elements.chatInput) elements.chatInput.disabled = false;
            if(elements.sendChatButton) elements.sendChatButton.disabled = false;
        };

        dc.onmessage = (event) => {
            displayChatMessage(currentMatch.opponentUsername, event.data);
        };

        dc.onclose = () => {
            displayChatMessage('システム', 'チャットが切断されました。');
            if(elements.chatInput) elements.chatInput.disabled = true;
            if(elements.sendChatButton) elements.sendChatButton.disabled = true;
        };
    };

    const handleWebRTCSignal = async (message) => {
        const { signal } = message;
        
        if (!currentMatch.peerConnection) {
            await createPeerConnection();
        }
        const pc = currentMatch.peerConnection;

        try {
            if (signal.sdp) {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                if (signal.sdp.type === 'offer') {
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    window.tcgAssistant.ws.send(JSON.stringify({
                        type: 'webrtc_signal',
                        targetUserId: currentMatch.opponentUserId,
                        signal: { sdp: pc.localDescription }
                    }));
                }
            } else if (signal.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
        } catch (error) {
            console.error("WebRTC Signal Error:", error);
        }
    };

    // --- WebSocketメッセージハンドラ ---
    const handleWebSocketMessage = async (message) => {
        switch (message.type) {
            case 'register_response':
            case 'login_response':
            case 'auto_login_response':
                if (message.success) {
                    window.tcgAssistant.currentUserId = message.userId;
                    window.tcgAssistant.currentUsername = message.username;
                    window.tcgAssistant.currentRate = message.rate;
                    window.tcgAssistant.userMatchHistory = message.matchHistory || [];
                    window.tcgAssistant.userMemos = message.memos || [];
                    window.tcgAssistant.userBattleRecords = message.battleRecords || [];
                    window.tcgAssistant.userRegisteredDecks = message.registeredDecks || [];
                    
                    if (message.type !== 'auto_login_response') {
                        await window.showCustomDialog(message.type === 'register_response' ? '登録成功' : 'ログイン成功', message.message);
                    }
                    
                    a.storage.local.set({ loggedInUserId: message.userId, loggedInUsername: message.username });
                    document.dispatchEvent(new CustomEvent('loginStateChanged', { detail: { isLoggedIn: true } }));
                } else {
                    await window.showCustomDialog('認証失敗', message.message);
                    a.storage.local.remove(['loggedInUserId', 'loggedInUsername']);
                }
                updateUI();
                break;

            case 'logout_response':
                clearMatchState();
                Object.assign(window.tcgAssistant, { currentUserId: null, currentUsername: null, currentRate: 1500, userMatchHistory: [], userMemos: [], userBattleRecords: [], userRegisteredDecks: [] });
                await window.showCustomDialog('ログアウト完了', message.message);
                a.storage.local.remove(['loggedInUserId', 'loggedInUsername']);
                document.dispatchEvent(new CustomEvent('loginStateChanged', { detail: { isLoggedIn: false } }));
                updateUI();
                break;
            
            case 'change_username_response':
                if (message.success) {
                    window.tcgAssistant.currentUsername = message.newUsername;
                    await window.showCustomDialog('成功', message.message);
                    if(elements.usernameContainer) elements.usernameContainer.style.display = 'flex';
                    if(elements.editUsernameForm) elements.editUsernameForm.style.display = 'none';
                } else {
                    await window.showCustomDialog('失敗', message.message);
                }
                updateUI();
                break;

            case 'match_found':
                clearMatchState();
                currentMatch.id = message.matchId;
                currentMatch.opponentUserId = message.opponentUserId;
                currentMatch.opponentUsername = message.opponentUsername;
                currentMatch.isInitiator = message.isInitiator;
                
                await window.showCustomDialog('対戦相手発見！', `${message.opponentUsername}さんとの対戦が始まります。`);
                
                if (elements.chatMessagesDiv) elements.chatMessagesDiv.innerHTML = `<p><strong>[システム]:</strong> ${message.opponentUsername}さんと接続中...</p>`;
                if (elements.chatInput) elements.chatInput.disabled = true;
                if (elements.sendChatButton) elements.sendChatButton.disabled = true;

                updateUI();

                if (currentMatch.isInitiator) {
                    await createPeerConnection();
                    currentMatch.dataChannel = currentMatch.peerConnection.createDataChannel('chat');
                    setupDataChannelListeners();
                    const offer = await currentMatch.peerConnection.createOffer();
                    await currentMatch.peerConnection.setLocalDescription(offer);
                    window.tcgAssistant.ws.send(JSON.stringify({
                        type: 'webrtc_signal',
                        targetUserId: currentMatch.opponentUserId,
                        signal: { sdp: offer }
                    }));
                }
                break;

            case 'webrtc_signal':
                handleWebRTCSignal(message);
                break;

            case 'report_result_response':
                if (message.success) {
                    await window.showCustomDialog('結果報告', message.message);
                    if (message.result.startsWith('resolved')) {
                        window.tcgAssistant.currentRate = message.myNewRate;
                        window.tcgAssistant.userMatchHistory = message.myMatchHistory;
                        clearMatchState();
                        updateUI();
                    }
                } else {
                    await window.showCustomDialog('報告エラー', message.message);
                }
                break;

            case 'ranking_data':
                if (message.success) displayRanking(message.data);
                break;
                
            case 'error':
                await window.showCustomDialog('サーバーエラー', message.message);
                break;
        }
    };
    
    // --- イベントハンドラ ---
    const addEventListeners = () => {
        const eventMap = {
            'register-button': handleRegister,
            'login-button': handleLogin,
            'logout-button': handleLogout,
            'matching-button': handleStartMatching,
            'cancel-matching-button-in-status': handleCancelMatching,
            'send-chat-button': handleSendChat,
            'win-button': () => handleReportResult('win'),
            'lose-button': () => handleReportResult('lose'),
            'cancel-button': () => handleReportResult('cancel'),
            'refresh-ranking-button': requestRanking,
            'edit-username-button': () => {
                if(elements.usernameContainer) elements.usernameContainer.style.display = 'none';
                if(elements.editUsernameForm) elements.editUsernameForm.style.display = 'flex';
                if(elements.newUsernameInput) {
                    elements.newUsernameInput.value = window.tcgAssistant.currentUsername;
                    elements.newUsernameInput.focus();
                }
            },
            'save-username-button': handleSaveUsername,
            'cancel-edit-username-button': () => {
                if(elements.usernameContainer) elements.usernameContainer.style.display = 'flex';
                if(elements.editUsernameForm) elements.editUsernameForm.style.display = 'none';
            },
        };

        for (const [id, handler] of Object.entries(eventMap)) {
            if (elements[id.replace(/-/g, '_').replace(/_button$/, 'Button')]) {
                elements[id.replace(/-/g, '_').replace(/_button$/, 'Button')].addEventListener('click', handler);
            }
        }
        
        if (elements.chatInput) {
            elements.chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleSendChat();
            });
        }

        chatPhraseButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                if (elements.chatInput) elements.chatInput.value = e.currentTarget.textContent;
                handleSendChat();
            });
        });
    };
    
    // --- ハンドラ関数 ---
    async function handleRegister() {
        const username = elements.registerUsernameInput.value.trim();
        const password = elements.registerPasswordInput.value.trim();
        if (!username || !password) return window.showCustomDialog('入力エラー', 'ユーザー名とパスワードを入力してください。');
        window.tcgAssistant.ws.send(JSON.stringify({ type: 'register', username, password }));
    }

    async function handleLogin() {
        const username = elements.loginUsernameInput.value.trim();
        const password = elements.loginPasswordInput.value.trim();
        if (!username || !password) return window.showCustomDialog('入力エラー', 'ユーザー名とパスワードを入力してください。');
        window.tcgAssistant.ws.send(JSON.stringify({ type: 'login', username, password }));
    }

    async function handleLogout() {
        if (await window.showCustomDialog('確認', 'ログアウトしますか？', true)) {
            window.tcgAssistant.ws.send(JSON.stringify({ type: 'logout' }));
        }
    }

    function handleStartMatching() {
        if(elements.preMatchUiDiv) elements.preMatchUiDiv.style.display = 'none';
        if(elements.matchingStatusDiv) elements.matchingStatusDiv.style.display = 'flex';
        window.tcgAssistant.ws.send(JSON.stringify({ type: 'join_queue' }));
    }

    function handleCancelMatching() {
        if(elements.preMatchUiDiv) elements.preMatchUiDiv.style.display = 'block';
        if(elements.matchingStatusDiv) elements.matchingStatusDiv.style.display = 'none';
        window.tcgAssistant.ws.send(JSON.stringify({ type: 'leave_queue' }));
    }

    function handleSendChat() {
        const message = elements.chatInput.value.trim();
        if (message && currentMatch.dataChannel && currentMatch.dataChannel.readyState === 'open') {
            currentMatch.dataChannel.send(message);
            displayChatMessage('あなた', message);
            elements.chatInput.value = '';
        }
    }
    
    async function handleReportResult(result) {
        const confirmed = await window.showCustomDialog('結果報告', `対戦結果を「${result === 'win' ? '勝利' : (result === 'lose' ? '敗北' : '中止')}」として報告しますか？`, true);
        if (confirmed) {
            window.tcgAssistant.ws.send(JSON.stringify({ type: 'report_result', matchId: currentMatch.id, result }));
        }
    }

    function handleSaveUsername() {
        const newUsername = elements.newUsernameInput.value.trim();
        if (!newUsername || newUsername === window.tcgAssistant.currentUsername) {
            if(elements.usernameContainer) elements.usernameContainer.style.display = 'flex';
            if(elements.editUsernameForm) elements.editUsernameForm.style.display = 'none';
            return;
        }
        window.tcgAssistant.ws.send(JSON.stringify({ type: 'change_username', newUsername }));
    }

    function requestRanking() {
        if (window.tcgAssistant.ws && window.tcgAssistant.ws.readyState === WebSocket.OPEN) {
            window.tcgAssistant.ws.send(JSON.stringify({ type: 'get_ranking' }));
        }
    }

    // --- 初期化処理 ---
    connectWebSocket();
    addEventListeners();
    updateUI();
    requestRanking();
    
    // UI更新用のカスタムイベントリスナー
    document.addEventListener('updateRateMatchUI', updateUI);
}
