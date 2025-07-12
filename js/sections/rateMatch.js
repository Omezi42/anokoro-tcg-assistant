// js/sections/rateMatch.js (レート戦セクションのロジック) - 安定化版 v2.7

window.initRateMatchSection = async function() {
    console.log("RateMatch section initialized (v2.7).");

    if (typeof browser === 'undefined') { var browser = chrome; }

    // --- DOM要素の取得 ---
    const loggedInUi = document.getElementById('logged-in-ui');
    const authSection = document.getElementById('auth-section');
    const displayNameDisplay = document.getElementById('display-name-display');
    const newDisplayNameInput = document.getElementById('new-display-name-input');
    const rateDisplay = document.getElementById('rate-display');
    const matchHistoryList = document.getElementById('match-history-list');
    const rankingList = document.getElementById('ranking-list');
    const registerUsernameInput = document.getElementById('register-username');
    const registerPasswordInput = document.getElementById('register-password');
    const loginUsernameInput = document.getElementById('login-username');
    const loginPasswordInput = document.getElementById('login-password');
    const matchingStatusDiv = document.getElementById('matching-status');
    const opponentUsernameDisplay = document.getElementById('opponent-username-display');
    const webrtcConnectionStatus = document.getElementById('webrtc-connection-status');
    const chatMessagesDiv = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const winButton = document.getElementById('win-button');
    const loseButton = document.getElementById('lose-button');
    const cancelButton = document.getElementById('cancel-button');
    
    // --- 状態管理 ---
    let currentMatchId = null;
    let peerConnection = null;
    let dataChannel = null;
    let opponentPlayerId = null;
    let opponentDisplayName = null;
    let isWebRTCOfferInitiator = false;
    const iceServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    // --- UI更新 ---
    const updateUIState = () => {
        const assistant = window.TCG_ASSISTANT;
        const isLoggedIn = assistant.isLoggedIn;

        authSection.style.display = isLoggedIn ? 'none' : 'block';
        loggedInUi.style.display = isLoggedIn ? 'block' : 'none';

        if (isLoggedIn) {
            displayNameDisplay.textContent = assistant.currentDisplayName || assistant.currentUsername;
            newDisplayNameInput.value = assistant.currentDisplayName || assistant.currentUsername;
            rateDisplay.textContent = assistant.currentRate;
            matchHistoryList.innerHTML = assistant.userMatchHistory.map(r => `<li>${r}</li>`).join('') || '<li>対戦履歴はありません。</li>';
            
            loggedInUi.classList.toggle('state-pre-match', !currentMatchId && matchingStatusDiv.dataset.isMatching !== 'true');
            loggedInUi.classList.toggle('state-matching', matchingStatusDiv.dataset.isMatching === 'true');
            loggedInUi.classList.toggle('state-in-match', !!currentMatchId);

            if (currentMatchId) {
                opponentUsernameDisplay.textContent = opponentDisplayName || '不明';
            }
        }
    };

    // --- WebSocketメッセージ送信 ---
    const sendWebSocketMessage = (payload) => {
        const ws = window.TCG_ASSISTANT.ws;

        const waitForConnectionAndSend = (timeout = 5000) => {
            const startTime = Date.now();
            const interval = setInterval(() => {
                const currentWs = window.TCG_ASSISTANT.ws;
                if (currentWs && currentWs.readyState === WebSocket.OPEN) {
                    clearInterval(interval);
                    currentWs.send(JSON.stringify(payload));
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(interval);
                    window.showCustomDialog('エラー', 'サーバーへの接続がタイムアウトしました。');
                }
            }, 100);
        };

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
        } else if (ws && ws.readyState === WebSocket.CONNECTING) {
            console.log("WebSocket is connecting. Waiting to send message...");
            waitForConnectionAndSend();
        } else {
            window.showCustomDialog('エラー', 'サーバーに接続していません。');
        }
    };
    
    // --- WebRTC関連 ---
    const setupPeerConnection = () => {
        if (peerConnection) peerConnection.close();
        peerConnection = new RTCPeerConnection(iceServers);
        
        peerConnection.onicecandidate = e => {
            if (e.candidate) sendWebSocketMessage({ type: 'webrtc_signal', signal: e.candidate });
        };
        
        peerConnection.onconnectionstatechange = () => {
            if (webrtcConnectionStatus) webrtcConnectionStatus.textContent = peerConnection.connectionState;
            if (peerConnection.connectionState === 'connected') {
                displayChatMessage('システム', 'P2P接続が確立されました！');
            }
        };
        
        peerConnection.ondatachannel = e => {
            dataChannel = e.channel;
            setupDataChannelListeners();
        };
        
        if (isWebRTCOfferInitiator) {
            dataChannel = peerConnection.createDataChannel("chat");
            setupDataChannelListeners();
            peerConnection.createOffer()
                .then(offer => peerConnection.setLocalDescription(offer))
                .then(() => sendWebSocketMessage({ type: 'webrtc_signal', signal: peerConnection.localDescription }))
                .catch(err => console.error("Offer creation error:", err));
        }
    };
    
    const setupDataChannelListeners = () => {
        if (!dataChannel) return;
        dataChannel.onopen = () => displayChatMessage('システム', 'チャットを開始できます。');
        dataChannel.onmessage = e => displayChatMessage(opponentDisplayName, e.data);
        dataChannel.onclose = () => displayChatMessage('システム', 'チャット接続が切れました。');
    };

    const displayChatMessage = (sender, message) => {
        const p = document.createElement('p');
        p.innerHTML = `<strong>[${sender.replace(/</g, "&lt;")}]:</strong> ${message.replace(/</g, "&lt;")}`;
        chatMessagesDiv.appendChild(p);
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    };

    const clearMatchAndP2PConnection = () => {
        currentMatchId = null; 
        opponentPlayerId = null; 
        opponentDisplayName = null; 
        isWebRTCOfferInitiator = false;
        if (peerConnection) { 
            peerConnection.close(); 
            peerConnection = null; 
        }
        dataChannel = null;
        matchingStatusDiv.dataset.isMatching = 'false';
        if(winButton) winButton.disabled = false;
        if(loseButton) loseButton.disabled = false;
        if(cancelButton) cancelButton.disabled = false;
        updateUIState();
    };

    // --- WebSocketイベントハンドラ ---
    const handleMatchFound = (e) => {
        const msg = e.detail;
        currentMatchId = msg.matchId;
        opponentPlayerId = msg.opponentUserId;
        opponentDisplayName = msg.opponentDisplayName;
        isWebRTCOfferInitiator = msg.isInitiator;
        window.showCustomDialog('対戦相手決定', `対戦相手: ${opponentDisplayName}<br>対戦を開始します！`);
        matchingStatusDiv.dataset.isMatching = 'false';
        updateUIState();
        setupPeerConnection();
    };

    const handleSignalingData = (e) => {
        const signal = e.detail.signal;
        if (!peerConnection) return;
        if (signal.sdp) {
            peerConnection.setRemoteDescription(new RTCSessionDescription(signal))
                .then(() => { if (signal.type === 'offer') return peerConnection.createAnswer(); })
                .then(answer => { if (answer) return peerConnection.setLocalDescription(answer); })
                .then(() => { if (peerConnection.localDescription.type === 'answer') sendWebSocketMessage({ type: 'webrtc_signal', signal: peerConnection.localDescription });})
                .catch(err => console.error("Signaling Error:", err));
        } else if (signal.candidate) {
            peerConnection.addIceCandidate(new RTCIceCandidate(signal)).catch(err => console.error("Add ICE Candidate Error:", err));
        }
    };

    const handleReportResultResponse = (e) => {
        const msg = e.detail;
        window.showCustomDialog('結果報告', msg.message);
        if (msg.result?.startsWith('resolved') || msg.result === 'disputed') {
            const assistant = window.TCG_ASSISTANT;
            assistant.currentRate = msg.myNewRate;
            assistant.userMatchHistory = msg.myMatchHistory;
            assistant.dispatchEvent(new CustomEvent('loginStateChanged', { detail: { isLoggedIn: true } }));
            clearMatchAndP2PConnection();
        }
    };

    const handleRankingResponse = (e) => {
        if (e.detail.success && rankingList) {
            rankingList.innerHTML = e.detail.rankingData.map((p, i) => 
                `<li class="${p.userId === window.TCG_ASSISTANT.currentUserId ? 'current-user-ranking' : ''}">
                    ${i + 1}. ${p.displayName || p.username} (${p.rate})
                </li>`
            ).join('') || '<li>ランキングデータがありません。</li>';
        }
    };

    const handleError = (e) => window.showCustomDialog('サーバーエラー', e.detail.message);

    const handleQueueStatus = (e) => {
        const statusText = document.getElementById('matching-status-text');
        if (statusText) statusText.textContent = e.detail.message;
    };

    // --- DOMイベントハンドラ ---
    const onRegister = () => sendWebSocketMessage({ type: 'register', username: registerUsernameInput.value, password: registerPasswordInput.value });
    const onLogin = () => sendWebSocketMessage({ type: 'login', username: loginUsernameInput.value, password: loginPasswordInput.value });
    const onLogout = async () => {
        const confirmed = await window.showCustomDialog('ログアウト', 'ログアウトしますか？', true);
        if (confirmed) sendWebSocketMessage({ type: 'logout' });
    };
    const onUpdateDisplayName = () => sendWebSocketMessage({ type: 'update_display_name', newDisplayName: newDisplayNameInput.value });
    const onMatchingClick = () => {
        matchingStatusDiv.dataset.isMatching = 'true';
        updateUIState();
        sendWebSocketMessage({ type: 'join_queue' });
    };
    const onCancelMatchingClick = () => {
        matchingStatusDiv.dataset.isMatching = 'false';
        updateUIState();
        sendWebSocketMessage({ type: 'leave_queue' });
    };
    const onSendChat = () => {
        if (chatInput.value && dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(chatInput.value);
            displayChatMessage('あなた', chatInput.value);
            chatInput.value = '';
        }
    };
    const onReportResultClick = async (e) => {
        const result = e.currentTarget.dataset.result;
        const confirmed = await window.showCustomDialog('確認', `結果を「${result}」として報告しますか？`, true);
        if (confirmed) {
            sendWebSocketMessage({ type: 'report_result', matchId: currentMatchId, result });
            if(winButton) winButton.disabled = true;
            if(loseButton) loseButton.disabled = true;
            if(cancelButton) cancelButton.disabled = true;
        }
    };
    const onRefreshRanking = () => sendWebSocketMessage({ type: 'get_ranking' });

    // --- イベントリスナー設定 ---
    const assistant = window.TCG_ASSISTANT;
    const addListener = (id, event, handler) => {
        const element = document.getElementById(id);
        if (element) {
            element.removeEventListener(event, handler);
            element.addEventListener(event, handler);
        }
    };
    
    addListener('register-button', 'click', onRegister);
    addListener('login-button', 'click', onLogin);
    addListener('logout-button', 'click', onLogout);
    addListener('update-display-name-button', 'click', onUpdateDisplayName);
    addListener('matching-button', 'click', onMatchingClick);
    addListener('cancel-matching-button-in-status', 'click', onCancelMatchingClick);
    addListener('send-chat-button', 'click', onSendChat);
    addListener('chat-input', 'keypress', (e) => { if (e.key === 'Enter') onSendChat(); });
    addListener('win-button', 'click', onReportResultClick);
    addListener('lose-button', 'click', onReportResultClick);
    addListener('cancel-button', 'click', onReportResultClick);
    addListener('refresh-ranking-button', 'click', onRefreshRanking);

    const wsEvents = {
        'ws-match_found': handleMatchFound,
        'ws-webrtc_signal': handleSignalingData,
        'ws-report_result_response': handleReportResultResponse,
        'ws-ranking_response': handleRankingResponse,
        'ws-queue_status': handleQueueStatus,
        'ws-error': handleError
    };

    for (const [event, handler] of Object.entries(wsEvents)) {
        assistant.removeEventListener(event, handler);
        assistant.addEventListener(event, handler);
    }
    
    assistant.removeEventListener('loginStateChanged', updateUIState);
    assistant.addEventListener('loginStateChanged', updateUIState);
    
    // --- 初期化 ---
    updateUIState();
    if (assistant.isLoggedIn) {
        sendWebSocketMessage({ type: 'get_ranking' });
    }
};

void 0;
