// js/sections/rateMatch.js
export function initialize() {
    if (document.body.dataset.rateMatchInitialized === 'true') {
        document.dispatchEvent(new CustomEvent('updateRateMatchUI'));
        return;
    }
    document.body.dataset.rateMatchInitialized = 'true';

    console.log("RateMatch section initialized.");

    const a = (typeof browser !== "undefined") ? browser : chrome;

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
        queueCountDisplay: getElement('queue-count-display'), // 追加
    };
    const chatPhraseButtons = document.querySelectorAll('.chat-phrase-button');

    let currentMatch = { id: null, opponentUserId: null, opponentUsername: null, isInitiator: false, peerConnection: null, dataChannel: null };
    const RENDER_WS_URL = 'wss://anokoro-tcg-api.onrender.com';
    let lastKnownQueueCount = -1; // 最後に通知したキュー人数を保持

    const connectWebSocket = () => {
        const { ws } = window.tcgAssistant;
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        window.tcgAssistant.ws = new WebSocket(RENDER_WS_URL);
        const newWs = window.tcgAssistant.ws;

        newWs.onopen = () => {
            console.log("WebSocket connected.");
            requestRanking();
            a.storage.local.get(['loggedInUserId', 'loggedInUsername'], (result) => {
                if (result.loggedInUserId && result.loggedInUsername) {
                    newWs.send(JSON.stringify({ type: 'auto_login', userId: result.loggedInUserId, username: result.loggedInUsername }));
                }
            });
        };
        newWs.onmessage = (event) => handleWebSocketMessage(JSON.parse(event.data));
        newWs.onclose = () => {
            console.log("WebSocket disconnected.");
            clearMatchState();
            updateUI();
            // 切断時にキュー人数をリセット
            a.storage.local.set({ matchingCount: '--' });
            lastKnownQueueCount = -1; // リセット
            setTimeout(connectWebSocket, 5000);
        };
        newWs.onerror = (error) => console.error("WebSocket error:", error);
    };

    const updateUI = () => {
        const { currentUserId, currentUsername, currentRate, userMatchHistory } = window.tcgAssistant;
        const isLoggedIn = !!(currentUserId && currentUsername);

        elements.authSection.style.display = isLoggedIn ? 'none' : 'block';
        elements.loggedInUi.style.display = isLoggedIn ? 'block' : 'none';

        if (isLoggedIn) {
            elements.usernameDisplay.textContent = currentUsername;
            elements.rateDisplay.textContent = currentRate;
            
            const isMatching = elements.matchingStatusDiv.dataset.active === 'true';

            elements.preMatchUiDiv.style.display = !currentMatch.id && !isMatching ? 'block' : 'none';
            elements.matchingStatusDiv.style.display = isMatching ? 'flex' : 'none';
            elements.postMatchUiDiv.style.display = currentMatch.id ? 'block' : 'none';

            if (currentMatch.id) {
                elements.opponentUsernameDisplay.textContent = currentMatch.opponentUsername || '不明';
            }
            loadMatchHistory(userMatchHistory);
        }
        // マッチング人数をUIに表示
        a.storage.local.get('matchingCount', (data) => {
            if (elements.queueCountDisplay) {
                elements.queueCountDisplay.textContent = data.matchingCount !== undefined ? data.matchingCount : '--';
            }
        });
    };
    
    const loadMatchHistory = (history) => { 
        if (!elements.matchHistoryList) return;
        elements.matchHistoryList.innerHTML = '';
        if (!history || history.length === 0) {
            elements.matchHistoryList.innerHTML = '<li>まだ対戦履歴がありません。</li>';
            return;
        }
        history.slice(0, 10).forEach(record => {
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
        p.innerHTML = `<strong>[${sender}]:</strong> ${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}`;
        elements.chatMessagesDiv.appendChild(p);
        elements.chatMessagesDiv.scrollTop = elements.chatMessagesDiv.scrollHeight;
     };

    const clearMatchState = () => {
        currentMatch.peerConnection?.close();
        currentMatch = { id: null, opponentUserId: null, opponentUsername: null, isInitiator: false, peerConnection: null, dataChannel: null };
    };

    const createPeerConnection = async () => {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                window.tcgAssistant.ws.send(JSON.stringify({
                    type: 'webrtc_signal',
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
        dc.onmessage = (event) => displayChatMessage(currentMatch.opponentUsername, event.data);
        dc.onclose = () => {
            displayChatMessage('システム', 'チャットが切断されました。');
            if(elements.chatInput) elements.chatInput.disabled = true;
            if(elements.sendChatButton) elements.sendChatButton.disabled = true;
        };
    };

    const handleWebRTCSignal = async (message) => {
        const { signal } = message;
        if (!currentMatch.peerConnection) await createPeerConnection();
        const pc = currentMatch.peerConnection;

        try {
            if (signal.sdp) {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                if (signal.sdp.type === 'offer') {
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    window.tcgAssistant.ws.send(JSON.stringify({ type: 'webrtc_signal', signal: { sdp: pc.localDescription } }));
                }
            } else if (signal.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
        } catch (error) { console.error("WebRTC Signal Error:", error); }
    };

    const handleWebSocketMessage = async (message) => {
        switch (message.type) {
            case 'register_response':
                if (message.success) {
                    await window.showCustomDialog('登録成功', message.message);
                } else {
                    await window.showCustomDialog('登録失敗', message.message);
                }
                break;
                
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
                    
                    if (message.type === 'login_response') {
                        await window.showCustomDialog('ログイン成功', message.message);
                    }
                    
                    a.storage.local.set({ 
                        loggedInUserId: message.userId, 
                        loggedInUsername: message.username,
                        currentRate: message.rate
                    });
                    
                    document.dispatchEvent(new CustomEvent('loginStateChanged', { detail: { isLoggedIn: true } }));
                } else {
                    await window.showCustomDialog('認証失敗', message.message);
                    a.storage.local.remove(['loggedInUserId', 'loggedInUsername', 'currentRate']);
                }
                updateUI();
                break;

            case 'logout_response':
                clearMatchState();
                Object.assign(window.tcgAssistant, { currentUserId: null, currentUsername: null, currentRate: 1500, userMatchHistory: [], userMemos: [], userBattleRecords: [], userRegisteredDecks: [] });
                await window.showCustomDialog('ログアウト完了', message.message);
                a.storage.local.remove(['loggedInUserId', 'loggedInUsername', 'currentRate']);
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
                Object.assign(currentMatch, message);
                // 対戦相手決定時の通知
                a.storage.sync.get('notifications', (items) => {
                    if (items.notifications) {
                        a.runtime.sendMessage({ action: "matchFoundNotification" });
                    }
                });
                await window.showCustomDialog('対戦相手発見！', `${message.opponentUsername}さんとの対戦が始まります。`);
                if (elements.chatMessagesDiv) elements.chatMessagesDiv.innerHTML = `<p><strong>[システム]:</strong> ${message.opponentUsername}さんと接続中...</p>`;
                elements.matchingStatusDiv.dataset.active = 'false';
                updateUI();
                if (currentMatch.isInitiator) {
                    await createPeerConnection();
                    currentMatch.dataChannel = currentMatch.peerConnection.createDataChannel('chat');
                    setupDataChannelListeners();
                    const offer = await currentMatch.peerConnection.createOffer();
                    await currentMatch.peerConnection.setLocalDescription(offer);
                    window.tcgAssistant.ws.send(JSON.stringify({ type: 'webrtc_signal', signal: { sdp: offer } }));
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
            
            case 'queue_count_update': // キュー人数更新メッセージのハンドリングを追加
                const newQueueCount = message.count;
                window.tcgAssistant.matchingCount = newQueueCount;
                a.storage.local.set({ matchingCount: newQueueCount }); // ローカルストレージに保存
                
                if (elements.queueCountDisplay) {
                    elements.queueCountDisplay.textContent = newQueueCount;
                }

                // マッチキュー人数変動時の通知ロジック
                a.storage.sync.get('queueNotifications', (items) => {
                    if (items.queueNotifications) {
                        // 以前の人数と異なる場合のみ通知
                        if (lastKnownQueueCount !== newQueueCount) {
                            a.runtime.sendMessage({ action: "queueCountNotification", count: newQueueCount });
                        }
                    }
                    lastKnownQueueCount = newQueueCount; // 最後の人数を更新
                });
                break;
                
            case 'error':
                await window.showCustomDialog('サーバーエラー', message.message);
                break;
        }
    };
    
    const addEventListeners = () => {
        elements.registerButton?.addEventListener('click', handleRegister);
        elements.loginButton?.addEventListener('click', handleLogin);
        elements.logoutButton?.addEventListener('click', handleLogout);
        elements.matchingButton?.addEventListener('click', handleStartMatching);
        elements.cancelMatchingButton?.addEventListener('click', handleCancelMatching);
        elements.sendChatButton?.addEventListener('click', handleSendChat);
        elements.winButton?.addEventListener('click', () => handleReportResult('win'));
        elements.loseButton?.addEventListener('click', () => handleReportResult('lose'));
        elements.cancelButton?.addEventListener('click', () => handleReportResult('cancel'));
        elements.refreshRankingButton?.addEventListener('click', requestRanking);
        elements.editUsernameButton?.addEventListener('click', () => {
            elements.usernameContainer.style.display = 'none';
            elements.editUsernameForm.style.display = 'flex';
            elements.newUsernameInput.value = window.tcgAssistant.currentUsername;
            elements.newUsernameInput.focus();
        });
        elements.saveUsernameButton?.addEventListener('click', handleSaveUsername);
        elements.cancelEditUsernameButton?.addEventListener('click', () => {
            elements.usernameContainer.style.display = 'flex';
            elements.editUsernameForm.style.display = 'none';
        });
        elements.chatInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSendChat(); });
        chatPhraseButtons.forEach(b => b.addEventListener('click', (e) => {
            elements.chatInput.value = e.currentTarget.textContent;
            handleSendChat();
        }));
    };
    
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
        elements.matchingStatusDiv.dataset.active = 'true';
        updateUI();
        window.tcgAssistant.ws.send(JSON.stringify({ type: 'join_queue' }));
    }
    function handleCancelMatching() {
        elements.matchingStatusDiv.dataset.active = 'false';
        updateUI();
        window.tcgAssistant.ws.send(JSON.stringify({ type: 'leave_queue' }));
    }
    function handleSendChat() {
        const message = elements.chatInput.value.trim();
        if (message && currentMatch.dataChannel?.readyState === 'open') {
            currentMatch.dataChannel.send(message);
            displayChatMessage('あなた', message);
            elements.chatInput.value = '';
        }
    }
    async function handleReportResult(result) {
        const resultText = { win: '勝利', lose: '敗北', cancel: '中止' }[result];
        const confirmed = await window.showCustomDialog('結果報告', `対戦結果を「${resultText}」として報告しますか？`, true);
        if (confirmed) {
            window.tcgAssistant.ws.send(JSON.stringify({ type: 'report_result', matchId: currentMatch.id, result }));
        }
    }
    function handleSaveUsername() {
        const newUsername = elements.newUsernameInput.value.trim();
        if (!newUsername || newUsername === window.tcgAssistant.currentUsername) {
            elements.usernameContainer.style.display = 'flex';
            elements.editUsernameForm.style.display = 'none';
            return;
        }
        window.tcgAssistant.ws.send(JSON.stringify({ type: 'change_username', newUsername }));
    }
    function requestRanking() {
        if (window.tcgAssistant.ws?.readyState === WebSocket.OPEN) {
            console.log("Requesting ranking data...");
            window.tcgAssistant.ws.send(JSON.stringify({ type: 'get_ranking' }));
        } else {
            console.log("WebSocket not open, cannot request ranking.");
        }
    }
    
    window.handleRateMatchLogout = handleLogout;

    connectWebSocket();
    addEventListeners();
    updateUI(); // 初回ロード時にUIを更新
    
    document.addEventListener('updateRateMatchUI', updateUI);
}
