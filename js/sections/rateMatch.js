// js/sections/rateMatch.js (レート戦セクションのロジック) - 安定化版 v2.8

// 初期化済みフラグ
let rateMatchInitialized = false;

window.initRateMatchSection = async function() {
    console.log("RateMatch section initialized (v2.8).");

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
            matchHistoryList.innerHTML = (assistant.userMatchHistory || []).map(r => `<li>${r}</li>`).join('') || '<li>対戦履歴はありません。</li>';
            
            loggedInUi.classList.toggle('state-pre-match', !currentMatchId && matchingStatusDiv.dataset.isMatching !== 'true');
            loggedInUi.classList.toggle('state-matching', matchingStatusDiv.dataset.isMatching === 'true');
            loggedInUi.classList.toggle('state-in-match', !!currentMatchId);

            if (currentMatchId) {
                opponentUsernameDisplay.textContent = opponentDisplayName || '不明';
            }
        }
    };
    
    // 初期化済みの場合、UI更新のみで終了
    if (rateMatchInitialized) {
        updateUIState();
        return;
    }

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
            waitForConnectionAndSend();
        } else {
            window.showCustomDialog('エラー', 'サーバーに接続していません。');
        }
    };
    
    // --- WebRTC関連 ---
    const setupPeerConnection = () => { /* ... 実装は変更なし ... */ };
    const setupDataChannelListeners = () => { /* ... 実装は変更なし ... */ };
    const displayChatMessage = (sender, message) => { /* ... 実装は変更なし ... */ };
    const clearMatchAndP2PConnection = () => { /* ... 実装は変更なし ... */ };

    // --- WebSocketイベントハンドラ ---
    const handleMatchFound = (e) => { /* ... 実装は変更なし ... */ };
    const handleSignalingData = (e) => { /* ... 実装は変更なし ... */ };
    const handleReportResultResponse = (e) => { /* ... 実装は変更なし ... */ };
    const handleRankingResponse = (e) => { /* ... 実装は変更なし ... */ };
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
    const onUpdateDisplayName = () => sendWebSocketMessage({ type: 'update_user_data', displayName: newDisplayNameInput.value });
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
    const onSendChat = () => { /* ... 実装は変更なし ... */ };
    const onReportResultClick = async (e) => { /* ... 実装は変更なし ... */ };
    const onRefreshRanking = () => sendWebSocketMessage({ type: 'get_ranking' });

    // --- イベントリスナー設定 ---
    const assistant = window.TCG_ASSISTANT;
    const addListener = (id, event, handler) => {
        document.getElementById(id)?.addEventListener(event, handler);
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

    assistant.addEventListener('loginStateChanged', updateUIState);
    assistant.addEventListener('ws-match_found', handleMatchFound);
    assistant.addEventListener('ws-webrtc_signal', handleSignalingData);
    assistant.addEventListener('ws-report_result_response', handleReportResultResponse);
    assistant.addEventListener('ws-ranking_response', handleRankingResponse);
    assistant.addEventListener('ws-queue_status', handleQueueStatus);
    assistant.addEventListener('ws-error', handleError);
    
    // --- 初期化 ---
    updateUIState();
    if (assistant.isLoggedIn) {
        sendWebSocketMessage({ type: 'get_ranking' });
    }
    
    rateMatchInitialized = true; // 初期化完了フラグを立てる
};

void 0;
