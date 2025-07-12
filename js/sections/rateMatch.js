// js/sections/rateMatch.js (レート戦セクションのロジック) - 修正版

window.initRateMatchSection = async function() {
    console.log("RateMatch section initialized (v2.0).");

    if (typeof browser === 'undefined') { var browser = chrome; }

    // === DOM要素の取得 ===
    const loggedInUi = document.getElementById('logged-in-ui');
    const authSection = document.getElementById('auth-section');
    const matchingButton = document.getElementById('matching-button');
    const matchingStatusDiv = document.getElementById('matching-status');
    const postMatchUiDiv = document.getElementById('post-match-ui');
    const rateDisplay = document.getElementById('rate-display');
    const displayNameDisplay = document.getElementById('display-name-display');
    const newDisplayNameInput = document.getElementById('new-display-name-input');
    const registerUsernameInput = document.getElementById('register-username');
    const registerPasswordInput = document.getElementById('register-password');
    const loginUsernameInput = document.getElementById('login-username');
    const loginPasswordInput = document.getElementById('login-password');
    const matchHistoryList = document.getElementById('match-history-list');
    const chatMessagesDiv = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChatButton = document.getElementById('send-chat-button');
    const opponentUsernameDisplay = document.getElementById('opponent-username-display');
    const webrtcConnectionStatus = document.getElementById('webrtc-connection-status');
    const rankingList = document.getElementById('ranking-list');
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

    /**
     * UIの表示状態を更新するメイン関数
     */
    window.updateUIState = () => {
        console.log(`RateMatch: Updating UI state. UserID: ${window.TCG_ASSISTANT.currentUserId}`);
        if (!loggedInUi || !authSection) return;

        // ログイン状態に応じてUIを切り替え
        // ★修正点: currentDisplayNameのチェックを外し、currentUserIdのみで判定
        if (window.TCG_ASSISTANT.currentUserId) {
            authSection.style.display = 'none';
            loggedInUi.style.display = 'block';
            loggedInUi.classList.remove('state-matching', 'state-in-match');

            displayNameDisplay.textContent = window.TCG_ASSISTANT.currentDisplayName || window.TCG_ASSISTANT.currentUsername;
            newDisplayNameInput.value = window.TCG_ASSISTANT.currentDisplayName || window.TCG_ASSISTANT.currentUsername;
            rateDisplay.textContent = window.TCG_ASSISTANT.currentRate;
            
            // マッチング状態に応じてさらにUIを切り替え
            if (currentMatchId) {
                loggedInUi.classList.add('state-in-match');
                opponentUsernameDisplay.textContent = opponentDisplayName || '不明';
            } else if (matchingStatusDiv.dataset.isMatching === 'true') {
                loggedInUi.classList.add('state-matching');
            } else {
                loggedInUi.classList.add('state-pre-match');
            }
            loadMatchHistory();
            fetchAndDisplayRanking();
        } else {
            authSection.style.display = 'block';
            loggedInUi.style.display = 'none';
            matchHistoryList.innerHTML = '<li>ログインすると対戦履歴が表示されます。</li>';
            rankingList.innerHTML = '<li>ログインするとランキングが表示されます。</li>';
        }
        document.dispatchEvent(new CustomEvent('loginStateChanged'));
    };
    
    /**
     * ログアウト時にUIをリセットする
     */
    window.handleLogoutOnDisconnect = () => {
        window.TCG_ASSISTANT.currentUserId = null;
        window.TCG_ASSISTANT.currentUsername = null;
        window.TCG_ASSISTANT.currentDisplayName = null;
        window.TCG_ASSISTANT.currentRate = 1500;
        window.TCG_ASSISTANT.userMatchHistory = [];
        window.TCG_ASSISTANT.userMemos = [];
        window.TCG_ASSISTANT.userBattleRecords = [];
        window.TCG_ASSISTANT.userRegisteredDecks = [];
        browser.storage.local.remove(['loggedInUserId', 'loggedInUsername']);
        clearMatchAndP2PConnection();
        updateUIState();
    };

    /**
     * 対戦履歴をロードして表示
     */
    const loadMatchHistory = () => {
        if (!matchHistoryList) return;
        const history = window.TCG_ASSISTANT.userMatchHistory || [];
        matchHistoryList.innerHTML = history.length > 0
            ? history.map(record => `<li>${record}</li>`).join('')
            : '<li>まだ対戦履歴がありません。</li>';
    };

    /**
     * チャットメッセージを表示
     * @param {string} sender - 送信者名 ('あなた' または相手の表示名)
     * @param {string} message - メッセージ内容
     */
    const displayChatMessage = (sender, message) => {
        if (!chatMessagesDiv) return;
        const p = document.createElement('p');
        p.innerHTML = `<strong>[${sender}]:</strong> ${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}`; // 簡単なサニタイズ
        chatMessagesDiv.appendChild(p);
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    };

    /**
     * ランキングデータを取得して表示
     */
    const fetchAndDisplayRanking = () => {
        if (!rankingList || !window.TCG_ASSISTANT.ws || window.TCG_ASSISTANT.ws.readyState !== WebSocket.OPEN) return;
        rankingList.innerHTML = '<li><div class="spinner small-spinner"></div> 読み込み中...</li>';
        window.TCG_ASSISTANT.ws.send(JSON.stringify({ type: 'get_ranking' }));
    };

    /**
     * マッチ情報とP2P接続をクリーンアップ
     */
    const clearMatchAndP2PConnection = () => {
        opponentPlayerId = null;
        opponentDisplayName = null;
        currentMatchId = null;
        isWebRTCOfferInitiator = false;
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        if (dataChannel) dataChannel = null;
        
        if (window.TCG_ASSISTANT.ws && window.TCG_ASSISTANT.ws.readyState === WebSocket.OPEN && window.TCG_ASSISTANT.currentUserId) {
            window.TCG_ASSISTANT.ws.send(JSON.stringify({ type: 'clear_match_info' }));
        }
        
        // UIリセット
        if (matchingStatusDiv) matchingStatusDiv.dataset.isMatching = 'false';
        if (winButton) winButton.disabled = false;
        if (loseButton) loseButton.disabled = false;
        if (cancelButton) cancelButton.disabled = false;
        updateUIState();
    };

    /**
     * WebSocketメッセージハンドラを設定
     */
    const setupWebSocketMessageHandler = () => {
        if (!window.TCG_ASSISTANT.ws) {
            console.error("RateMatch: WebSocket not available to set up message handler.");
            return;
        }
        window.TCG_ASSISTANT.ws.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            console.log("WebSocket [RateMatch]: Received", message);

            switch (message.type) {
                case 'register_response':
                case 'login_response':
                case 'auto_login_response':
                    if (message.success) {
                        Object.assign(window.TCG_ASSISTANT, {
                            currentUserId: message.userId,
                            currentUsername: message.username,
                            currentDisplayName: message.displayName,
                            currentRate: message.rate,
                            userMatchHistory: message.matchHistory || [],
                            userMemos: message.memos || [],
                            userBattleRecords: message.battleRecords || [],
                            userRegisteredDecks: message.registeredDecks || []
                        });
                        if (message.type !== 'auto_login_response') {
                           await window.showCustomDialog('成功', message.message);
                        }
                        if (message.type === 'login_response') {
                           browser.storage.local.set({ loggedInUserId: message.userId, loggedInUsername: message.username });
                        }
                    } else {
                        await window.showCustomDialog('失敗', message.message);
                    }
                    updateUIState();
                    break;

                case 'logout_response':
                    if (message.success) {
                        await window.showCustomDialog('ログアウト完了', message.message);
                        handleLogoutOnDisconnect();
                    }
                    break;

                case 'logout_forced':
                    await window.showCustomDialog('切断されました', message.message);
                    handleLogoutOnDisconnect();
                    break;
                
                case 'update_display_name_response':
                    if (message.success) {
                        window.TCG_ASSISTANT.currentDisplayName = message.displayName;
                        await window.showCustomDialog('成功', message.message);
                    } else {
                        await window.showCustomDialog('失敗', message.message);
                    }
                    updateUIState();
                    break;

                case 'queue_status':
                    if (matchingStatusDiv.querySelector('#matching-status-text')) {
                        matchingStatusDiv.querySelector('#matching-status-text').textContent = message.message;
                    }
                    break;

                case 'match_found':
                    opponentPlayerId = message.opponentUserId;
                    opponentDisplayName = message.opponentDisplayName;
                    currentMatchId = message.matchId;
                    isWebRTCOfferInitiator = message.isInitiator;
                    await window.showCustomDialog('対戦相手決定', `対戦相手: ${opponentDisplayName}<br>対戦を開始します！`);
                    matchingStatusDiv.dataset.isMatching = 'false';
                    updateUIState();
                    setupPeerConnection();
                    break;

                case 'webrtc_signal':
                    handleSignalingData(message.signal);
                    break;
                
                case 'report_result_response':
                    await window.showCustomDialog('結果報告', message.message);
                    if (message.result && (message.result.startsWith('resolved') || message.result === 'disputed')) {
                        window.TCG_ASSISTANT.currentRate = message.myNewRate;
                        window.TCG_ASSISTANT.userMatchHistory = message.myMatchHistory;
                        clearMatchAndP2PConnection();
                    }
                    break;

                case 'ranking_response':
                    if (message.success && rankingList) {
                        rankingList.innerHTML = message.rankingData.map((p, i) => 
                            `<li class="${p.userId === window.TCG_ASSISTANT.currentUserId ? 'current-user-ranking' : ''}">
                                <span class="ranking-rank">${i + 1}.</span> 
                                <span class="ranking-display-name">${p.displayName || p.username}</span> 
                                <span class="ranking-rate">(${p.rate})</span>
                            </li>`
                        ).join('');
                    }
                    break;

                case 'error':
                    await window.showCustomDialog('サーバーエラー', message.message);
                    if (matchingStatusDiv) matchingStatusDiv.dataset.isMatching = 'false';
                    updateUIState();
                    break;
            }
        };
    };

    /**
     * WebRTC PeerConnectionのセットアップ
     */
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
    
    /**
     * DataChannelのリスナー設定
     */
    const setupDataChannelListeners = () => {
        if (!dataChannel) return;
        dataChannel.onopen = () => {
            console.log("DataChannel is open");
            if (chatInput) chatInput.disabled = false;
            if (sendChatButton) sendChatButton.disabled = false;
            displayChatMessage('システム', 'チャットを開始できます。');
        };
        dataChannel.onmessage = e => displayChatMessage(opponentDisplayName, e.data);
        dataChannel.onclose = () => {
            console.log("DataChannel is closed");
            if (chatInput) chatInput.disabled = true;
            if (sendChatButton) sendChatButton.disabled = true;
            displayChatMessage('システム', 'チャット接続が切れました。');
        };
    };
    
    /**
     * シグナリングデータ処理
     * @param {object} signal - SDPまたはICE候補
     */
    const handleSignalingData = (signal) => {
        if (!peerConnection) return;
        if (signal.sdp) {
            peerConnection.setRemoteDescription(new RTCSessionDescription(signal))
                .then(() => {
                    if (signal.type === 'offer') {
                        return peerConnection.createAnswer();
                    }
                })
                .then(answer => {
                    if (answer) {
                        return peerConnection.setLocalDescription(answer);
                    }
                })
                .then(() => {
                    if (peerConnection.localDescription.type === 'answer' && window.TCG_ASSISTANT.ws) {
                        window.TCG_ASSISTANT.ws.send(JSON.stringify({ type: 'webrtc_signal', signal: peerConnection.localDescription }));
                    }
                }).catch(e => console.error("Signaling Error:", e));
        } else if (signal.candidate) {
            peerConnection.addIceCandidate(new RTCIceCandidate(signal)).catch(e => console.error("Add ICE Candidate Error:", e));
        }
    };


    // --- イベントハンドラ関数 ---
    const sendAuthRequest = (type, username, password) => {
        if (!username || !password) {
            window.showCustomDialog('エラー', 'ユーザー名とパスワードを入力してください。');
            return;
        }
        if (window.TCG_ASSISTANT.ws && window.TCG_ASSISTANT.ws.readyState === WebSocket.OPEN) {
            window.TCG_ASSISTANT.ws.send(JSON.stringify({ type, username, password }));
        } else {
            window.showCustomDialog('エラー', 'サーバーに接続していません。');
        }
    };

    const handleMatchingButtonClick = async () => {
        if (!window.TCG_ASSISTANT.currentUserId) {
            await window.showCustomDialog('エラー', 'レート戦を開始するにはログインしてください。');
            return;
        }
        matchingStatusDiv.dataset.isMatching = 'true';
        updateUIState();
        window.TCG_ASSISTANT.ws.send(JSON.stringify({ type: 'join_queue' }));
    };

    const handleCancelMatchingClick = async () => {
        const confirmed = await window.showCustomDialog('確認', 'マッチングをキャンセルしますか？', true);
        if (confirmed && window.TCG_ASSISTANT.ws) {
            window.TCG_ASSISTANT.ws.send(JSON.stringify({ type: 'leave_queue' }));
            matchingStatusDiv.dataset.isMatching = 'false';
            updateUIState();
        }
    };

    const handleSendChat = () => {
        const message = chatInput.value.trim();
        if (message && dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(message);
            displayChatMessage('あなた', message);
            chatInput.value = '';
        }
    };
    
    const handleReportResultClick = async (e) => {
        const result = e.currentTarget.dataset.result;
        const confirmed = await window.showCustomDialog('確認', `対戦結果を「${result === 'win' ? '勝利' : result === 'lose' ? '敗北' : '中止'}」として報告しますか？`, true);
        if (confirmed && window.TCG_ASSISTANT.ws && currentMatchId) {
            window.TCG_ASSISTANT.ws.send(JSON.stringify({ type: 'report_result', matchId: currentMatchId, result }));
            if (winButton) winButton.disabled = true;
            if (loseButton) loseButton.disabled = true;
            if (cancelButton) cancelButton.disabled = true;
        }
    };

    // --- イベントリスナー設定 ---
    document.getElementById('register-button')?.addEventListener('click', () => sendAuthRequest('register', registerUsernameInput.value, registerPasswordInput.value));
    document.getElementById('login-button')?.addEventListener('click', () => sendAuthRequest('login', loginUsernameInput.value, loginPasswordInput.value));
    document.getElementById('logout-button')?.addEventListener('click', () => {
        if (window.TCG_ASSISTANT.ws) window.TCG_ASSISTANT.ws.send(JSON.stringify({ type: 'logout' }));
    });
    document.getElementById('update-display-name-button')?.addEventListener('click', () => {
        if (window.TCG_ASSISTANT.ws) window.TCG_ASSISTANT.ws.send(JSON.stringify({ type: 'update_display_name', newDisplayName: newDisplayNameInput.value.trim() }));
    });
    matchingButton?.addEventListener('click', handleMatchingButtonClick);
    document.getElementById('cancel-matching-button-in-status')?.addEventListener('click', handleCancelMatchingClick);
    sendChatButton?.addEventListener('click', handleSendChat);
    chatInput?.addEventListener('keypress', e => e.key === 'Enter' && handleSendChat());
    document.querySelectorAll('.chat-phrase-button').forEach(btn => btn.addEventListener('click', () => {
        chatInput.value = btn.textContent;
        handleSendChat();
    }));
    winButton?.addEventListener('click', handleReportResultClick);
    loseButton?.addEventListener('click', handleReportResultClick);
    cancelButton?.addEventListener('click', handleReportResultClick);
    document.getElementById('refresh-ranking-button')?.addEventListener('click', fetchAndDisplayRanking);

    // --- 初期化処理 ---
    setupWebSocketMessageHandler();
    updateUIState();
};
