// js/sections/rateMatch.js (レート戦セクションのロジック) - 修正版 v2.3

window.initRateMatchSection = async function() {
    console.log("RateMatch section initialized (v2.3).");

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
    
    // マッチング関連UI
    const matchingStatusDiv = document.getElementById('matching-status');
    const postMatchUiDiv = document.getElementById('post-match-ui');
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
        if (assistant.currentUserId) {
            authSection.style.display = 'none';
            loggedInUi.style.display = 'block';
            
            displayNameDisplay.textContent = assistant.currentDisplayName || assistant.currentUsername;
            newDisplayNameInput.value = assistant.currentDisplayName || assistant.currentUsername;
            rateDisplay.textContent = assistant.currentRate;
            
            matchHistoryList.innerHTML = assistant.userMatchHistory.length > 0
                ? assistant.userMatchHistory.map(record => `<li>${record}</li>`).join('')
                : '<li>まだ対戦履歴がありません。</li>';

            // マッチング状態クラスの管理
            loggedInUi.classList.remove('state-pre-match', 'state-matching', 'state-in-match');
            if (currentMatchId) {
                loggedInUi.classList.add('state-in-match');
                opponentUsernameDisplay.textContent = opponentDisplayName || '不明';
            } else if (matchingStatusDiv.dataset.isMatching === 'true') {
                loggedInUi.classList.add('state-matching');
            } else {
                loggedInUi.classList.add('state-pre-match');
            }

        } else {
            authSection.style.display = 'block';
            loggedInUi.style.display = 'none';
        }
    };

    // === WebSocketイベントハンドラ ===
    const handleMatchFound = (e) => {
        const message = e.detail;
        opponentPlayerId = message.opponentUserId;
        opponentDisplayName = message.opponentDisplayName;
        currentMatchId = message.matchId;
        isWebRTCOfferInitiator = message.isInitiator;
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
                .then(() => {
                    if (signal.type === 'offer') return peerConnection.createAnswer();
                })
                .then(answer => {
                    if (answer) return peerConnection.setLocalDescription(answer);
                })
                .then(() => {
                    if (peerConnection.localDescription.type === 'answer' && window.TCG_ASSISTANT.ws) {
                        window.TCG_ASSISTANT.ws.send(JSON.stringify({ type: 'webrtc_signal', signal: peerConnection.localDescription }));
                    }
                }).catch(err => console.error("Signaling Error:", err));
        } else if (signal.candidate) {
            peerConnection.addIceCandidate(new RTCIceCandidate(signal)).catch(err => console.error("Add ICE Candidate Error:", err));
        }
    };
    
    const handleReportResultResponse = (e) => {
        const message = e.detail;
        window.showCustomDialog('結果報告', message.message);
        if (message.result && (message.result.startsWith('resolved') || message.result === 'disputed')) {
            window.TCG_ASSISTANT.currentRate = message.myNewRate;
            window.TCG_ASSISTANT.userMatchHistory = message.myMatchHistory;
            clearMatchAndP2PConnection();
        }
    };

    const handleRankingResponse = (e) => {
        const message = e.detail;
        if (message.success && rankingList) {
            rankingList.innerHTML = message.rankingData.map((p, i) => 
                `<li class="${p.userId === window.TCG_ASSISTANT.currentUserId ? 'current-user-ranking' : ''}">
                    <span class="ranking-rank">${i + 1}.</span> 
                    <span class="ranking-display-name">${p.displayName || p.username}</span> 
                    <span class="ranking-rate">(${p.rate})</span>
                </li>`
            ).join('') || '<li>ランキングデータがありません。</li>';
        }
    };

    const handleQueueStatus = (e) => {
        const message = e.detail;
        const statusText = matchingStatusDiv.querySelector('#matching-status-text');
        if(statusText) statusText.textContent = message.message;
    };

    const handleError = (e) => {
        window.showCustomDialog('サーバーエラー', e.detail.message);
        matchingStatusDiv.dataset.isMatching = 'false';
        updateUIState();
    };


    // === WebRTC関連関数 ===
    const setupPeerConnection = () => {
        if (peerConnection) peerConnection.close();
        peerConnection = new RTCPeerConnection(iceServers);

        peerConnection.onicecandidate = e => {
            if (e.candidate && window.TCG_ASSISTANT.ws) {
                window.TCG_ASSISTANT.ws.send(JSON.stringify({ type: 'webrtc_signal', signal: e.candidate }));
            }
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
                .then(() => {
                    if (window.TCG_ASSISTANT.ws) {
                       window.TCG_ASSISTANT.ws.send(JSON.stringify({ type: 'webrtc_signal', signal: peerConnection.localDescription }));
                    }
                });
        }
    };
    
    const setupDataChannelListeners = () => {
        if (!dataChannel) return;
        dataChannel.onopen = () => {
            if (chatInput) chatInput.disabled = false;
            if (sendChatButton) sendChatButton.disabled = false;
            displayChatMessage('システム', 'チャットを開始できます。');
        };
        dataChannel.onmessage = e => displayChatMessage(opponentDisplayName, e.data);
        dataChannel.onclose = () => {
            if (chatInput) chatInput.disabled = true;
            if (sendChatButton) sendChatButton.disabled = true;
            displayChatMessage('システム', 'チャット接続が切れました。');
        };
    };

    const displayChatMessage = (sender, message) => {
        if (!chatMessagesDiv) return;
        const p = document.createElement('p');
        p.innerHTML = `<strong>[${sender.replace(/</g, "&lt;")}]:</strong> ${message.replace(/</g, "&lt;")}`;
        chatMessagesDiv.appendChild(p);
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    };

    const clearMatchAndP2PConnection = () => {
        opponentPlayerId = null;
        opponentDisplayName = null;
        currentMatchId = null;
        isWebRTCOfferInitiator = false;
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        dataChannel = null;
        
        if (window.TCG_ASSISTANT.ws?.readyState === WebSocket.OPEN && window.TCG_ASSISTANT.currentUserId) {
            window.TCG_ASSISTANT.ws.send(JSON.stringify({ type: 'clear_match_info' }));
        }
        
        matchingStatusDiv.dataset.isMatching = 'false';
        if (winButton) winButton.disabled = false;
        if (loseButton) loseButton.disabled = false;
        if (cancelButton) cancelButton.disabled = false;
        updateUIState();
    };

    // === DOMイベントハンドラ ===
    const sendWebSocketMessage = (payload) => {
        if (window.TCG_ASSISTANT.ws && window.TCG_ASSISTANT.ws.readyState === WebSocket.OPEN) {
            window.TCG_ASSISTANT.ws.send(JSON.stringify(payload));
        } else {
            window.showCustomDialog('エラー', 'サーバーに接続していません。');
        }
    };

    const onRegisterClick = () => {
        const username = registerUsernameInput.value.trim();
        const password = registerPasswordInput.value.trim();
        if (!username || !password) return window.showCustomDialog('エラー', 'ユーザー名とパスワードを入力してください。');
        sendWebSocketMessage({ type: 'register', username, password });
    };

    const onLoginClick = () => {
        const username = loginUsernameInput.value.trim();
        const password = loginPasswordInput.value.trim();
        if (!username || !password) return window.showCustomDialog('エラー', 'ユーザー名とパスワードを入力してください。');
        sendWebSocketMessage({ type: 'login', username, password });
    };

    const onLogoutClick = () => sendWebSocketMessage({ type: 'logout' });
    
    const onUpdateDisplayNameClick = () => {
        const newDisplayName = newDisplayNameInput.value.trim();
        if (!newDisplayName) return window.showCustomDialog('エラー', '新しい表示名を入力してください。');
        sendWebSocketMessage({ type: 'update_display_name', newDisplayName });
    };

    const onMatchingClick = () => {
        if (!window.TCG_ASSISTANT.currentUserId) return window.showCustomDialog('エラー', 'レート戦を開始するにはログインしてください。');
        matchingStatusDiv.dataset.isMatching = 'true';
        updateUIState();
        sendWebSocketMessage({ type: 'join_queue' });
    };

    const onCancelMatchingClick = async () => {
        const confirmed = await window.showCustomDialog('確認', 'マッチングをキャンセルしますか？', true);
        if (confirmed) {
            sendWebSocketMessage({ type: 'leave_queue' });
            matchingStatusDiv.dataset.isMatching = 'false';
            updateUIState();
        }
    };

    const onSendChat = () => {
        const message = chatInput.value.trim();
        if (message && dataChannel?.readyState === 'open') {
            dataChannel.send(message);
            displayChatMessage('あなた', message);
            chatInput.value = '';
        }
    };

    const onReportResultClick = async (e) => {
        const result = e.currentTarget.dataset.result;
        const resultText = {'win': '勝利', 'lose': '敗北', 'cancel': '中止'}[result];
        const confirmed = await window.showCustomDialog('確認', `対戦結果を「${resultText}」として報告しますか？`, true);
        if (confirmed && currentMatchId) {
            sendWebSocketMessage({ type: 'report_result', matchId: currentMatchId, result });
            winButton.disabled = true;
            loseButton.disabled = true;
            cancelButton.disabled = true;
        }
    };
    
    const onRefreshRanking = () => {
        if (window.TCG_ASSISTANT.currentUserId) {
            sendWebSocketMessage({ type: 'get_ranking' });
        }
    };

    // === イベントリスナー設定 ===
    // DOM要素へのイベントリスナー
    document.getElementById('register-button')?.addEventListener('click', onRegisterClick);
    document.getElementById('login-button')?.addEventListener('click', onLoginClick);
    document.getElementById('logout-button')?.addEventListener('click', onLogoutClick);
    document.getElementById('update-display-name-button')?.addEventListener('click', onUpdateDisplayNameClick);
    document.getElementById('matching-button')?.addEventListener('click', onMatchingClick);
    document.getElementById('cancel-matching-button-in-status')?.addEventListener('click', onCancelMatchingClick);
    sendChatButton?.addEventListener('click', onSendChat);
    chatInput?.addEventListener('keypress', e => e.key === 'Enter' && onSendChat());
    document.querySelectorAll('.chat-phrase-button').forEach(btn => btn.addEventListener('click', () => {
        chatInput.value = btn.textContent;
        onSendChat();
    }));
    winButton?.addEventListener('click', onReportResultClick);
    loseButton?.addEventListener('click', onReportResultClick);
    cancelButton?.addEventListener('click', onReportResultClick);
    document.getElementById('refresh-ranking-button')?.addEventListener('click', onRefreshRanking);

    // グローバルなTCG_ASSISTANTオブジェクトへのイベントリスナー
    const assistant = window.TCG_ASSISTANT;
    assistant.addEventListener('loginStateChanged', updateUIState);
    assistant.addEventListener('ws-match_found', handleMatchFound);
    assistant.addEventListener('ws-webrtc_signal', handleSignalingData);
    assistant.addEventListener('ws-report_result_response', handleReportResultResponse);
    assistant.addEventListener('ws-ranking_response', handleRankingResponse);
    assistant.addEventListener('ws-queue_status', handleQueueStatus);
    assistant.addEventListener('ws-error', handleError);
    
    // --- 初期化処理 ---
    updateUIState();
    onRefreshRanking(); // セクション表示時にランキングを自動更新
};
