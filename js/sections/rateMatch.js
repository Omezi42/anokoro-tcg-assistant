// js/sections/rateMatch.js - 修正版 v2.5

window.initRateMatchSection = async function() {
    console.log("RateMatch section initialized (v2.5).");

    if (typeof browser === 'undefined') { var browser = chrome; }

    // === DOM要素の取得 ===
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
    const sendChatButton = document.getElementById('send-chat-button');
    const winButton = document.getElementById('win-button');
    const loseButton = document.getElementById('lose-button');
    const cancelButton = document.getElementById('cancel-button');

    // マッチング状態を管理するローカル変数
    let currentMatchId = null;
    let peerConnection = null;
    let dataChannel = null;
    let opponentPlayerId = null;
    let opponentDisplayName = null;
    let isWebRTCOfferInitiator = false;
    const iceServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    // === UI更新関数 ===
    const updateUIState = () => {
        if (!loggedInUi || !authSection) return;
        const assistant = window.TCG_ASSISTANT;
        
        const isLoggedIn = assistant.isLoggedIn;
        authSection.style.display = isLoggedIn ? 'none' : 'block';
        loggedInUi.style.display = isLoggedIn ? 'block' : 'none';

        if (isLoggedIn) {
            displayNameDisplay.textContent = assistant.currentDisplayName || assistant.currentUsername;
            newDisplayNameInput.value = assistant.currentDisplayName || assistant.currentUsername;
            rateDisplay.textContent = assistant.currentRate;
            matchHistoryList.innerHTML = assistant.userMatchHistory.length > 0
                ? assistant.userMatchHistory.map(record => `<li>${record}</li>`).join('')
                : '<li>まだ対戦履歴がありません。</li>';
            
            loggedInUi.classList.remove('state-pre-match', 'state-matching', 'state-in-match');
            if (currentMatchId) {
                loggedInUi.classList.add('state-in-match');
                opponentUsernameDisplay.textContent = opponentDisplayName || '不明';
            } else if (matchingStatusDiv.dataset.isMatching === 'true') {
                loggedInUi.classList.add('state-matching');
            } else {
                loggedInUi.classList.add('state-pre-match');
            }
        }
    };

    // === WebSocketメッセージ送信ヘルパー ===
    const sendWebSocketMessage = (payload) => {
        const ws = window.TCG_ASSISTANT.ws;
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
        } else {
            window.showCustomDialog('エラー', 'サーバーに接続していません。');
        }
    };
    
    // === WebRTC関連関数 ===
    const setupPeerConnection = () => {
        if (peerConnection) peerConnection.close();
        peerConnection = new RTCPeerConnection(iceServers);
        
        peerConnection.onicecandidate = e => {
            if (e.candidate) sendWebSocketMessage({ type: 'webrtc_signal', signal: e.candidate });
        };
        
        peerConnection.onconnectionstatechange = () => {
            if (webrtcConnectionStatus) webrtcConnectionStatus.textContent = peerConnection.connectionState;
            if (peerConnection.connectionState === 'connected') displayChatMessage('システム', 'P2P接続が確立されました！');
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
                .then(() => sendWebSocketMessage({ type: 'webrtc_signal', signal: peerConnection.localDescription }));
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
        currentMatchId = null; opponentPlayerId = null; opponentDisplayName = null; isWebRTCOfferInitiator = false;
        if (peerConnection) { peerConnection.close(); peerConnection = null; }
        dataChannel = null;
        matchingStatusDiv.dataset.isMatching = 'false';
        [winButton, loseButton, cancelButton].forEach(btn => btn.disabled = false);
        updateUIState();
    };

    // === WebSocketイベントハンドラ ===
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
            // ログイン成功時にグローバルステートが更新されるので、ここでは何もしない
            // main.jsがloginSuccessイベントを発行し、このセクションを含む全セクションが更新される
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

    // === DOMイベントハンドラ ===
    const onMatchingClick = () => {
        matchingStatusDiv.dataset.isMatching = 'true';
        updateUIState();
        sendWebSocketMessage({ type: 'join_queue' });
    };

    const onReportResultClick = async (e) => {
        const result = e.currentTarget.dataset.result;
        const confirmed = await window.showCustomDialog('確認', `結果を「${result}」として報告しますか？`, true);
        if (confirmed) {
            sendWebSocketMessage({ type: 'report_result', matchId: currentMatchId, result });
            [winButton, loseButton, cancelButton].forEach(btn => btn.disabled = true);
        }
    };

    // === イベントリスナー設定 ===
    const assistant = window.TCG_ASSISTANT;
    const addListener = (id, event, handler) => document.getElementById(id)?.addEventListener(event, handler);

    addListener('register-button', 'click', () => sendWebSocketMessage({ type: 'register', username: registerUsernameInput.value, password: registerPasswordInput.value }));
    addListener('login-button', 'click', () => sendWebSocketMessage({ type: 'login', username: loginUsernameInput.value, password: loginPasswordInput.value }));
    addListener('update-display-name-button', 'click', () => sendWebSocketMessage({ type: 'update_display_name', newDisplayName: newDisplayNameInput.value }));
    addListener('matching-button', 'click', onMatchingClick);
    addListener('cancel-matching-button-in-status', 'click', () => { matchingStatusDiv.dataset.isMatching = 'false'; updateUIState(); sendWebSocketMessage({ type: 'leave_queue' }); });
    addListener('send-chat-button', 'click', () => { if (chatInput.value) dataChannel.send(chatInput.value); chatInput.value = ''; });
    addListener('win-button', 'click', onReportResultClick);
    addListener('lose-button', 'click', onReportResultClick);
    addListener('cancel-button', 'click', onReportResultClick);
    addListener('refresh-ranking-button', 'click', () => sendWebSocketMessage({ type: 'get_ranking' }));

    // ★★★ 修正点 ★★★
    // loginStateChangedイベントでUI全体を更新
    assistant.removeEventListener('loginStateChanged', updateUIState);
    assistant.addEventListener('loginStateChanged', updateUIState);
    
    // WebSocketメッセージのリスナー
    const wsEvents = ['match_found', 'webrtc_signal', 'report_result_response', 'ranking_response', 'queue_status', 'error'];
    const handlers = {
        'ws-match_found': handleMatchFound,
        'ws-webrtc_signal': handleSignalingData,
        'ws-report_result_response': handleReportResultResponse,
        'ws-ranking_response': handleRankingResponse,
        'ws-queue_status': (e) => { if(document.getElementById('matching-status-text')) document.getElementById('matching-status-text').textContent = e.detail.message; },
        'ws-error': (e) => window.showCustomDialog('サーバーエラー', e.detail.message)
    };
    wsEvents.forEach(evt => {
        assistant.removeEventListener(`ws-${evt}`, handlers[`ws-${evt}`]);
        assistant.addEventListener(`ws-${evt}`, handlers[`ws-${evt}`]);
    });

    // --- 初期化処理 ---
    updateUIState();
    sendWebSocketMessage({ type: 'get_ranking' });
};

void 0;
