// js/sections/rateMatch.js (レート戦セクションのロジック) - 安定化版 v3.8

// 初期化済みフラグ
let rateMatchInitialized = false;
let lastKnownLoginState = false;

window.initRateMatchSection = function() {
    console.log("RateMatch section initialized (v3.8).");

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
    const sendChatButton = document.getElementById('send-chat-button');
    
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

        console.log("updateUIState called. isLoggedIn:", isLoggedIn);

        if (!authSection || !loggedInUi) return;

        if (isLoggedIn && !lastKnownLoginState) {
            window.showCustomDialog('ログイン成功', 'ようこそ！レート戦のマッチングが利用可能です。');
        }
        lastKnownLoginState = isLoggedIn;

        authSection.style.display = isLoggedIn ? 'none' : 'block';
        loggedInUi.style.display = isLoggedIn ? 'block' : 'none';

        if (isLoggedIn) {
            displayNameDisplay.textContent = assistant.currentDisplayName || assistant.currentUsername;
            newDisplayNameInput.value = assistant.currentDisplayName || assistant.currentUsername;
            rateDisplay.textContent = assistant.currentRate;
            matchHistoryList.innerHTML = (assistant.userMatchHistory || []).map(r => `<li>${r}</li>`).join('') || '<li>対戦履歴はありません。</li>';
            
            const isMatching = matchingStatusDiv.dataset.isMatching === 'true';
            loggedInUi.classList.remove('state-pre-match', 'state-matching', 'state-in-match');

            if (currentMatchId) {
                loggedInUi.classList.add('state-in-match');
                opponentUsernameDisplay.textContent = opponentDisplayName || '不明';
            } else if (isMatching) {
                loggedInUi.classList.add('state-matching');
            } else {
                loggedInUi.classList.add('state-pre-match');
            }
        }
    };
    
    // グローバルなWebSocket送信関数へのショートカット
    const sendWsMessage = window.TCG_ASSISTANT.sendWsMessage.bind(window.TCG_ASSISTANT);
    
    // --- WebRTC関連 (変更なし) ---
    const setupPeerConnection = () => {
        if (peerConnection) peerConnection.close();
        peerConnection = new RTCPeerConnection(iceServers);
        peerConnection.onicecandidate = (event) => { if (event.candidate) sendWsMessage({ type: 'webrtc_signal', to: opponentPlayerId, data: { type: 'ice_candidate', candidate: event.candidate } }); };
        peerConnection.onconnectionstatechange = () => { if (webrtcConnectionStatus) webrtcConnectionStatus.textContent = peerConnection.connectionState; };
        peerConnection.ondatachannel = (event) => { dataChannel = event.channel; setupDataChannelListeners(dataChannel); };
    };
    const setupDataChannelListeners = (channel) => {
        channel.onopen = () => { webrtcConnectionStatus.textContent = '接続完了'; chatInput.disabled = false; sendChatButton.disabled = false; displayChatMessage('system', '対戦相手と接続しました。'); };
        channel.onmessage = (event) => displayChatMessage('opponent', event.data);
        channel.onclose = () => { webrtcConnectionStatus.textContent = '切断'; chatInput.disabled = true; sendChatButton.disabled = true; displayChatMessage('system', '対戦相手との接続が切れました。'); };
    };
    const displayChatMessage = (sender, message) => {
        if (!chatMessagesDiv) return;
        const messageEl = document.createElement('div');
        messageEl.classList.add('chat-message', `chat-message-${sender}`);
        messageEl.textContent = message;
        chatMessagesDiv.appendChild(messageEl);
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    };
    const clearMatchAndP2PConnection = () => {
        if (dataChannel) dataChannel.close();
        if (peerConnection) peerConnection.close();
        peerConnection = null; dataChannel = null; currentMatchId = null; opponentPlayerId = null; opponentDisplayName = null; isWebRTCOfferInitiator = false;
        if (chatMessagesDiv) chatMessagesDiv.innerHTML = '';
        if (webrtcConnectionStatus) webrtcConnectionStatus.textContent = '未接続';
        updateUIState();
    };

    // --- WebSocketイベントハンドラ (変更なし) ---
    const handleMatchFound = async (e) => {
        const { matchId, opponentId, opponentDisplayName: oppName, initiator } = e.detail;
        currentMatchId = matchId; opponentPlayerId = opponentId; opponentDisplayName = oppName; isWebRTCOfferInitiator = initiator;
        if(matchingStatusDiv) matchingStatusDiv.dataset.isMatching = 'false';
        updateUIState();
        displayChatMessage('system', `対戦相手が見つかりました: ${opponentDisplayName}`);
        setupPeerConnection();
        if (isWebRTCOfferInitiator) {
            dataChannel = peerConnection.createDataChannel('chat');
            setupDataChannelListeners(dataChannel);
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            sendWsMessage({ type: 'webrtc_signal', to: opponentPlayerId, data: { type: 'offer', sdp: offer } });
        }
    };
    const handleSignalingData = async (e) => {
        const { from, data } = e.detail;
        if (!peerConnection) setupPeerConnection();
        if (data.type === 'offer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            sendWsMessage({ type: 'webrtc_signal', to: from, data: { type: 'answer', sdp: answer } });
        } else if (data.type === 'answer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } else if (data.type === 'ice_candidate') {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    };
    const handleReportResultResponse = (e) => {
        const { success, message, updatedUserData } = e.detail;
        if (success) {
            window.showCustomDialog('対戦結果', message);
            const eventDetail = { ...updatedUserData, type: 'user_update_response' };
            window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('loginSuccess', { detail: eventDetail }));
        } else {
            window.showCustomDialog('エラー', message || '結果報告に失敗しました。');
        }
        clearMatchAndP2PConnection();
        sendWsMessage({ type: 'get_ranking' });
    };
    const handleRankingResponse = (e) => {
        const { ranking } = e.detail;
        if (!rankingList) return;
        rankingList.innerHTML = '';
        if (ranking && ranking.length > 0) {
            ranking.forEach((player, index) => {
                const li = document.createElement('li');
                li.innerHTML = `<span class="rank">${index + 1}.</span> <span class="name">${player.display_name}</span> <span class="rate">${player.rate}</span>`;
                rankingList.appendChild(li);
            });
        } else {
            rankingList.innerHTML = '<li>まだランキングデータがありません。</li>';
        }
    };
    const handleError = (e) => window.showCustomDialog('サーバーエラー', e.detail.message);
    const handleQueueStatus = (e) => {
        const statusText = document.getElementById('matching-status-text');
        if (statusText) statusText.textContent = e.detail.message;
    };

    // --- DOMイベントハンドラ (変更なし) ---
    const onRegister = () => sendWsMessage({ type: 'register', username: registerUsernameInput.value, password: registerPasswordInput.value });
    const onLogin = () => sendWsMessage({ type: 'login', username: loginUsernameInput.value, password: loginPasswordInput.value });
    const onLogout = async () => { if (await window.showCustomDialog('ログアウト', 'ログアウトしますか？', true)) sendWsMessage({ type: 'logout' }); };
    const onUpdateDisplayName = () => { if (newDisplayNameInput.value) sendWsMessage({ type: 'update_user_data', displayName: newDisplayNameInput.value }); };
    const onMatchingClick = () => { if(matchingStatusDiv) matchingStatusDiv.dataset.isMatching = 'true'; updateUIState(); sendWsMessage({ type: 'join_queue' }); };
    const onCancelMatchingClick = () => { if(matchingStatusDiv) matchingStatusDiv.dataset.isMatching = 'false'; updateUIState(); sendWsMessage({ type: 'leave_queue' }); };
    const onSendChat = () => { if (dataChannel && dataChannel.readyState === 'open' && chatInput.value) { displayChatMessage('me', chatInput.value); dataChannel.send(chatInput.value); chatInput.value = ''; } };
    const onReportResultClick = async (e) => {
        const result = e.currentTarget.dataset.result;
        if (await window.showCustomDialog('結果報告の確認', `対戦結果を「${result === 'win' ? '勝利' : result === 'lose' ? '敗北' : '中止'}」として報告します。よろしいですか？`, true)) {
            sendWsMessage({ type: 'report_result', matchId: currentMatchId, result: result });
        }
    };
    const onRefreshRanking = () => sendWsMessage({ type: 'get_ranking' });

    // --- イベントリスナー設定 ---
    const assistant = window.TCG_ASSISTANT;
    const addListener = (id, event, handler) => {
        const element = document.getElementById(id);
        if (element) { element.removeEventListener(event, handler); element.addEventListener(event, handler); }
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

    if (!rateMatchInitialized) {
        assistant.addEventListener('loginStateChanged', updateUIState);
        assistant.addEventListener('ws-match_found', handleMatchFound);
        assistant.addEventListener('ws-webrtc_signal', handleSignalingData);
        assistant.addEventListener('ws-report_result_response', handleReportResultResponse);
        assistant.addEventListener('ws-ranking_response', handleRankingResponse);
        assistant.addEventListener('ws-queue_status', handleQueueStatus);
        assistant.addEventListener('ws-error', handleError);
    }
    
    // --- 初期化 ---
    updateUIState();
    if (window.TCG_ASSISTANT.isLoggedIn) {
        sendWsMessage({ type: 'get_ranking' });
    }
    
    rateMatchInitialized = true;
};

void 0;
