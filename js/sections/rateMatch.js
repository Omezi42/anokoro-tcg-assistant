// js/sections/rateMatch.js (レート戦セクションのロジック)

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initRateMatchSection = async function() {
    console.log("RateMatch section initialized.");

    // Firefox互換性のためのbrowserオブジェクトのフォールバック (main.jsにもありますが、念のためここでも)
    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    // === DOM要素の取得 ===
    const matchingButton = document.getElementById('matching-button');
    const cancelMatchingButtonInStatus = document.getElementById('cancel-matching-button-in-status'); // マッチング待機中のキャンセルボタン
    const matchingStatusDiv = document.getElementById('matching-status');
    const matchingStatusTextSpan = document.getElementById('matching-status-text'); // マッチングステータステキスト表示用
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

    // --- 認証UI要素 ---
    const authSection = document.getElementById('auth-section');
    const loggedInUi = document.getElementById('logged-in-ui');
    const registerUsernameInput = document.getElementById('register-username');
    const registerPasswordInput = document.getElementById('register-password');
    const registerButton = document.getElementById('register-button');
    const loginUsernameInput = document.getElementById('login-username');
    const loginPasswordInput = document.getElementById('login-password');
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');

    // --- 対戦相手情報UI要素 ---
    const opponentUsernameDisplay = document.getElementById('opponent-username-display');
    const webrtcConnectionStatus = document.getElementById('webrtc-connection-status');

    // --- ランキングUI要素 ---
    const rankingDisplayDiv = document.getElementById('ranking-display'); // ランキング表示用div (親要素)
    const rankingList = document.getElementById('ranking-list'); // ランキングol要素
    const refreshRankingButton = document.getElementById('refresh-ranking-button'); // ランキング更新ボタン


    // グローバルなログイン状態変数 (main.jsで初期化され、ここで参照・更新される)
    // window.currentRate, window.currentUsername, window.currentUserId, etc.
    // window.ws は main.js で初期化されるWebSocketインスタンス

    // 現在のマッチIDを保持 (結果報告用)
    let currentMatchId = null;


    // --- WebSocket & WebRTC 関連変数 ---
    // RenderサーバーのWebSocket URLに置き換える必要があります！
    const RENDER_WS_URL = 'wss://anokoro-tcg-api.onrender.com'; // ★★★ ここをあなたのRenderのURLに置き換える ★★★

    let peerConnection = null; // WebRTC PeerConnectionインスタンス
    let dataChannel = null; // WebRTC DataChannelインスタンス
    let opponentPlayerId = null; // 相手のユーザーID (内部的に使用)
    let opponentUsername = null; // 相手のユーザー名 (UI表示用)
    let isWebRTCOfferInitiator = false; // WebRTCのOfferを作成する側かどうかのフラグ

    // STUNサーバーの設定 (P2P接続を助けるための無料サーバー)
    const iceServers = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            // 必要であれば他の無料STUNサーバーを追加
        ]
    };

    // --- UI状態更新関数 ---
    /**
     * ログイン状態、マッチング状態に応じてUIの表示を更新します。
     * グローバル変数 (window.currentUserId, currentMatchId) に依存します。
     */
    const updateUIState = () => {
        // ログイン状態に応じて認証UIとメインUIを切り替え
        if (window.currentUserId && window.currentUsername) {
            if (authSection) authSection.style.display = 'none';
            if (loggedInUi) loggedInUi.style.display = 'block';
            if (usernameDisplay) usernameDisplay.textContent = window.currentUsername; // 表示名を表示
            if (logoutButton) logoutButton.style.display = 'block'; // ログアウトボタンを表示
        } else {
            if (authSection) authSection.style.display = 'block';
            if (loggedInUi) loggedInUi.style.display = 'none';
            if (logoutButton) logoutButton.style.display = 'none'; // ログアウトボタンを非表示
        }

        // マッチング状態に応じてレート戦UIを切り替え
        if (window.currentUserId && window.currentUsername) { // ログインしている場合のみ
            if (currentMatchId) { // マッチング成立後
                if (preMatchUiDiv) preMatchUiDiv.style.display = 'none';
                if (matchingStatusDiv) matchingStatusDiv.style.display = 'none';
                if (postMatchUiDiv) postMatchUiDiv.style.display = 'block';
                
                // 対戦相手情報を表示
                if (opponentUsernameDisplay) opponentUsernameDisplay.textContent = opponentUsername || '不明';

                // チャットエリアの初期化（一度だけ行う）
                if (chatMessagesDiv && chatMessagesDiv.dataset.initialized !== 'true') {
                    chatMessagesDiv.innerHTML = `
                        <p><strong>[システム]:</strong> 対戦が始まりました！</p>
                        <p><strong>[システム]:</strong> WebRTC接続を確立中...</p>
                    `;
                    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
                    chatMessagesDiv.dataset.initialized = 'true';
                }
                // チャット入力と送信ボタンの有効化はDataChannelオープン時に行う
                if (chatInput) chatInput.disabled = true;
                if (sendChatButton) sendChatButton.disabled = true;

            } else if (matchingStatusDiv && matchingStatusDiv.style.display === 'flex') { // マッチング待機中
                // マッチングボタンを押した直後にこの状態になる
                if (preMatchUiDiv) preMatchUiDiv.style.display = 'none';
                if (matchingStatusDiv) matchingStatusDiv.style.display = 'flex'; // マッチング中UIを表示
                if (postMatchUiDiv) postMatchUiDiv.style.display = 'none';
                if (matchingButton) matchingButton.disabled = true; // マッチング中は無効
                if (cancelMatchingButtonInStatus) cancelMatchingButtonInStatus.disabled = false; // キャンセルボタンは有効
            }
            else { // マッチング前 (デフォルト状態)
                if (preMatchUiDiv) preMatchUiDiv.style.display = 'block';
                if (matchingStatusDiv) matchingStatusDiv.style.display = 'none';
                if (postMatchUiDiv) postMatchUiDiv.style.display = 'none';
                if (matchingButton) matchingButton.disabled = false; // マッチングボタンを有効
                if (cancelMatchingButtonInStatus) cancelMatchingButtonInStatus.disabled = true; // キャンセルボタンは無効
            }
            if (chatMessagesDiv) chatMessagesDiv.dataset.initialized = 'false'; // チャットエリアの初期化フラグリセット
        } else { // 未ログインの場合、すべてのマッチングUIを非表示
            if (authSection) authSection.style.display = 'block';
            if (loggedInUi) loggedInUi.style.display = 'none';
            if (preMatchUiDiv) preMatchUiDiv.style.display = 'none';
            if (matchingStatusDiv) matchingStatusDiv.style.display = 'none';
            if (postMatchUiDiv) postMatchUiDiv.style.display = 'none';
            if (chatMessagesDiv) chatMessagesDiv.dataset.initialized = 'false'; // リセット
        }
        updateRateDisplay();
        loadMatchHistory(); // ログイン状態に応じて履歴をロード
        fetchAndDisplayRanking(); // ランキングを更新
        // ログイン状態変更イベントを発火
        document.dispatchEvent(new CustomEvent('loginStateChanged'));
    };

    /**
     * レート表示を更新します。
     */
    const updateRateDisplay = () => {
        if (rateDisplay) {
            rateDisplay.textContent = window.currentRate;
        }
    };

    /**
     * 対戦履歴をロードし、UIに表示します。
     * ログイン状態に応じてサーバーデータまたはローカルデータを使用します。
     */
    const loadMatchHistory = () => {
        if (!matchHistoryList) return;
        if (window.currentUserId && window.userMatchHistory) {
            // ログインしている場合はサーバーから取得した履歴を表示
            const history = window.userMatchHistory;
            matchHistoryList.innerHTML = ''; // リストをクリア
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
            // 未ログインの場合は「ログインすると表示」メッセージ
            matchHistoryList.innerHTML = '<li>ログインすると対戦履歴が表示されます。</li>';
        }
    };

    /**
     * 対戦履歴をサーバーに保存します。
     * @param {string} record - 保存する対戦記録文字列。
     */
    const saveMatchHistoryToServer = async (record) => {
        if (!window.currentUserId || !window.ws || window.ws.readyState !== WebSocket.OPEN) {
            console.warn("Match History: Not logged in or WebSocket not open. Cannot save match history.");
            return;
        }
        // 既存の履歴に新しいレコードを追加
        const history = window.userMatchHistory || [];
        history.unshift(record); // 最新のものを先頭に追加
        window.userMatchHistory = history.slice(0, 10); // 最新10件に制限

        window.ws.send(JSON.stringify({
            type: 'update_user_data',
            userId: window.currentUserId,
            matchHistory: window.userMatchHistory
        }));
        loadMatchHistory(); // UIを更新
    };

    /**
     * チャットメッセージをUIに表示します。
     * @param {string} senderId - 送信者のユーザーID。
     * @param {string} message - メッセージ内容。
     */
    const displayChatMessage = (senderId, message) => {
        if (!chatMessagesDiv) return;
        const messageElement = document.createElement('p');
        // 自分のメッセージは「あなた」、相手のメッセージは相手の表示名を表示
        const displaySender = (senderId === window.currentUserId) ? 'あなた' : (opponentUsername || '相手プレイヤー'); 
        messageElement.innerHTML = `<strong>[${displaySender}]:</strong> ${message}`;
        chatMessagesDiv.appendChild(messageElement);
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight; // スクロールを一番下へ
    };

    /**
     * ランキングデータをサーバーから取得し、UIに表示します。
     */
    const fetchAndDisplayRanking = () => {
        if (!rankingList) return;
        if (!window.currentUserId || !window.ws || window.ws.readyState !== WebSocket.OPEN) {
            rankingList.innerHTML = '<li>ログインするとランキングが表示されます。</li>';
            return;
        }
        rankingList.innerHTML = '<li><div class="spinner small-spinner"></div> ランキングを読み込み中...</li>'; // スピナー表示
        window.ws.send(JSON.stringify({ type: 'get_ranking' }));
        console.log("Ranking: Requested ranking from server.");
    };

    /**
     * ランキング応答メッセージを処理し、UIを更新します。
     * @param {Object} message - サーバーからのランキング応答メッセージ。
     */
    const handleRankingResponse = (message) => {
        if (!rankingList) return;
        if (message.success && message.rankingData) {
            rankingList.innerHTML = ''; // クリア
            if (message.rankingData.length === 0) {
                rankingList.innerHTML = '<li>まだランキングデータがありません。</li>';
            } else {
                let rankHtml = '';
                message.rankingData.forEach((player, index) => {
                    const isCurrentUser = (window.currentUserId === player.userId); // ユーザーIDで比較
                    rankHtml += `<li class="${isCurrentUser ? 'current-user-ranking' : ''}">
                                    <span class="ranking-rank">${index + 1}.</span> 
                                    <span class="ranking-display-name">${player.displayName || player.username}</span> 
                                    <span class="ranking-rate"> (${player.rate})</span>
                                </li>`;
                });
                rankingList.innerHTML = rankHtml;
            }
        } else {
            rankingList.innerHTML = `<li>ランキングの取得に失敗しました: ${message.message || '不明なエラー'}</li>`;
            console.error("Ranking: Failed to get ranking:", message.message);
        }
    };


    // --- WebSocket接続設定 ---
    /**
     * WebSocketサーバーへの接続を確立します。
     * 既に接続中またはオープンな場合は再接続しません。
     */
    const connectWebSocket = () => {
        // グローバルなwsインスタンスが既に存在し、接続中またはオープンであれば再接続しない
        if (window.ws && (window.ws.readyState === WebSocket.OPEN || window.ws.readyState === WebSocket.CONNECTING)) {
            console.log("WebSocket: Already open or connecting (global instance). Skipping new connection attempt.");
            return;
        }
        window.ws = new WebSocket(RENDER_WS_URL); // RenderサーバーのURLを使用

        window.ws.onopen = () => {
            console.log("WebSocket: Connected to Render server.");
            // 接続後、ローカルストレージに保存されたログイン情報があれば自動ログインを試みる
            browser.storage.local.get(['loggedInUserId', 'loggedInUsername'], (result) => {
                if (result.loggedInUserId && result.loggedInUsername) {
                    // サーバーに自動ログインリクエストを送信
                    window.ws.send(JSON.stringify({
                        type: 'auto_login',
                        userId: result.loggedInUserId,
                        username: result.loggedInUsername // usernameも送信（サーバーがdisplay_nameを決定するため）
                    }));
                    console.log("WebSocket: Attempting auto-login with cached credentials.");
                } else {
                    updateUIState(); // 未ログイン状態のUIを表示
                }
            });
        };

        window.ws.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            console.log("WebSocket: Message received:", message.type, message); // 受信メッセージ全体をログ出力

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
                        window.currentUserId = message.userId;
                        window.currentUsername = message.username; // usernameも保持
                        window.currentDisplayName = message.displayName; // display_nameを設定
                        window.currentRate = message.rate;
                        window.userMatchHistory = message.matchHistory || [];
                        window.userMemos = message.memos || [];
                        window.userBattleRecords = message.battleRecords || [];
                        window.userRegisteredDecks = message.registeredDecks || [];
                        await window.showCustomDialog('ログイン成功', message.message);
                        // ログイン情報をローカルストレージに保存 (タブ/ブラウザ再起動時の自動ログイン用)
                        browser.storage.local.set({ loggedInUserId: window.currentUserId, loggedInUsername: window.currentUsername }); // usernameを保存
                    } else {
                        await window.showCustomDialog('ログイン失敗', message.message);
                    }
                    updateUIState(); // UI状態を更新
                    break;
                case 'auto_login_response': // 自動ログインの応答
                    if (message.success) {
                        window.currentUserId = message.userId;
                        window.currentUsername = message.username; // usernameも保持
                        window.currentDisplayName = message.displayName; // display_nameを設定
                        window.currentRate = message.rate;
                        window.userMatchHistory = message.matchHistory || [];
                        window.userMemos = message.memos || [];
                        window.userBattleRecords = message.battleRecords || [];
                        window.userRegisteredDecks = message.registeredDecks || [];
                        console.log("WebSocket: Auto-login successful.");
                    } else {
                        console.log("WebSocket: Auto-login failed:", message.message);
                        browser.storage.local.remove(['loggedInUserId', 'loggedInUsername']); // キャッシュをクリア
                    }
                    updateUIState(); // UI状態を更新
                    break;
                case 'logout_response':
                    if (message.success) {
                        window.currentUserId = null;
                        window.currentUsername = null;
                        window.currentDisplayName = null; // display_nameもクリア
                        window.currentRate = 1500; // 初期レートに戻す
                        window.userMatchHistory = [];
                        window.userMemos = [];
                        window.userBattleRecords = [];
                        window.userRegisteredDecks = [];
                        await window.showCustomDialog('ログアウト完了', message.message);
                        browser.storage.local.remove(['loggedInUserId', 'loggedInUsername']); // ローカルストレージから削除
                    } else {
                        await window.showCustomDialog('ログアウト失敗', message.message);
                    }
                    updateUIState(); // UI状態を更新
                    break;
                case 'logout_forced':
                    window.currentUserId = null;
                    window.currentUsername = null;
                    window.currentDisplayName = null; // display_nameもクリア
                    window.currentRate = 1500;
                    window.userMatchHistory = [];
                    window.userMemos = [];
                    window.userBattleRecords = [];
                    window.userRegisteredDecks = [];
                    browser.storage.local.remove(['loggedInUserId', 'loggedInUsername']);
                    await window.showCustomDialog('切断されました', message.message);
                    updateUIState(); // UI状態を更新
                    // WebRTC接続もクリーンアップ
                    if (peerConnection) {
                        peerConnection.close();
                        peerConnection = null;
                    }
                    if (dataChannel) {
                        dataChannel = null;
                    }
                    opponentPlayerId = null;
                    opponentUsername = null; // 相手ユーザー名もクリア
                    isWebRTCOfferInitiator = false;
                    currentMatchId = null; // マッチIDもクリア
                    break;
                case 'update_display_name_response': // 表示名変更応答
                    if (message.success) {
                        window.currentDisplayName = message.displayName;
                        await window.showCustomDialog('表示名更新', message.message);
                    } else {
                        await window.showCustomDialog('表示名更新失敗', message.message);
                    }
                    updateUIState(); // UIを更新して表示名を反映
                    break;
                case 'queue_status':
                    console.log("Queue status:", message.message);
                    if (matchingStatusTextSpan) matchingStatusTextSpan.textContent = message.message; // spanを更新
                    // UI更新はupdateUIStateでまとめて行う
                    break;
                case 'match_found':
                    opponentPlayerId = message.opponentUserId; // 相手のユーザーID
                    opponentUsername = message.opponentDisplayName; // 相手の表示名を設定
                    currentMatchId = message.matchId; // 現在のマッチIDを保存
                    isWebRTCOfferInitiator = message.isInitiator;
                    console.log(`Match found! Opponent: ${opponentPlayerId} (${opponentUsername}), Initiator: ${isWebRTCOfferInitiator}, MatchId: ${currentMatchId}`);
                    await window.showCustomDialog('対戦相手決定', `対戦相手が見つかりました！対戦を開始しましょう！`);
                    updateUIState(); // マッチ成立後のUIに切り替え
                    await setupPeerConnection(); // WebRTC接続のセットアップを開始
                    break;
                case 'webrtc_signal':
                    // WebRTCシグナリングメッセージを受信
                    if (peerConnection) {
                        try {
                            if (message.signal.sdp) {
                                // SDP (Offer or Answer)
                                await peerConnection.setRemoteDescription(new RTCSessionDescription(message.signal));
                                console.log("WebRTC: Remote description set. Type:", message.signal.type);
                                if (!isWebRTCOfferInitiator && message.signal.type === 'offer') {
                                    // Offerを受け取った側はAnswerを作成して送信
                                    const answer = await peerConnection.createAnswer();
                                    await peerConnection.setLocalDescription(answer);
                                    window.ws.send(JSON.stringify({ type: 'webrtc_signal', signal: peerConnection.localDescription }));
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
                        window.currentRate = message.userData.rate;
                        window.userMatchHistory = message.userData.matchHistory;
                        window.userMemos = message.userData.memos;
                        window.userBattleRecords = message.userData.battleRecords;
                        window.userRegisteredDecks = message.userData.registeredDecks;
                        updateRateDisplay();
                        loadMatchHistory(); // レート戦の履歴を更新
                        document.dispatchEvent(new CustomEvent('loginStateChanged')); // 他のセクションにデータ更新を通知
                    } else {
                        console.error("Failed to update user data on server:", message.message);
                    }
                    break;
                case 'report_result_response': // 結果報告の応答
                    if (message.success) {
                        await window.showCustomDialog('結果報告', message.message);
                        if (message.result && message.result.startsWith('resolved')) { // 結果が確定した場合のみレートと履歴を更新
                            window.currentRate = message.myNewRate;
                            window.userMatchHistory = message.myMatchHistory;
                            updateRateDisplay();
                            loadMatchHistory();
                            // マッチ情報とP2P接続をクリア
                            clearMatchAndP2PConnection();
                            updateUIState(); // UIを元の状態に戻す
                        } else if (message.result === 'pending') {
                            // 相手の報告を待っている状態
                            // 特にUI変更なし、ダイアログ表示のみ
                        } else if (message.result === 'disputed' || message.result.startsWith('disputed_')) {
                            // 結果不一致の場合
                            window.currentRate = message.myNewRate; // レート変更なしの場合も更新される
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
                case 'ranking_response': // ランキング応答
                    handleRankingResponse(message);
                    break;
                default:
                    console.warn("Unknown message type from server:", message.type);
            }
        };

        window.ws.onclose = () => {
            console.log("WebSocket disconnected.");
            // ログアウト状態にはしないが、マッチング関連の状態はリセット
            clearMatchAndP2PConnection();
            updateUIState();
            // 切断されたら自動再接続を試みる（任意）
            // setTimeout(connectWebSocket, 5000); 
        };

        window.ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            window.showCustomDialog('エラー', 'マッチングサーバーへの接続に失敗しました。Renderサーバーが起動しているか確認してください。');
        };
    };

    // --- WebRTC PeerConnection Setup ---
    /**
     * WebRTC PeerConnectionをセットアップします。
     * 既存の接続があればクリーンアップしてから新しい接続を作成します。
     */
    const setupPeerConnection = async () => {
        // 既存のPeerConnectionがあればクリーンアップ
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
            console.log("WebRTC: Existing PeerConnection closed.");
        }
        if (dataChannel) {
            dataChannel = null;
            console.log("WebRTC: Existing DataChannel cleared.");
        }

        peerConnection = new RTCPeerConnection(iceServers);
        console.log("WebRTC: New RTCPeerConnection created.");

        // WebRTC接続状態の変更を監視
        peerConnection.onconnectionstatechange = () => {
            if (webrtcConnectionStatus) {
                webrtcConnectionStatus.textContent = peerConnection.connectionState;
                console.log("WebRTC connection state changed:", peerConnection.connectionState);
                if (peerConnection.connectionState === 'connected') {
                    displayChatMessage('システム', 'P2P接続が確立されました！');
                    if (chatInput) chatInput.disabled = false;
                    if (sendChatButton) sendChatButton.disabled = false;
                } else if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'closed') {
                    displayChatMessage('システム', `P2P接続が${peerConnection.connectionState}状態になりました。`);
                    if (chatInput) chatInput.disabled = true;
                    if (sendChatButton) sendChatButton.disabled = true;
                }
            }
        };

        // ICE候補収集状態の変更を監視 (デバッグ用)
        peerConnection.onicegatheringstatechange = () => {
            console.log("WebRTC ICE Gathering state changed:", peerConnection.iceGatheringState);
            if (webrtcConnectionStatus) { // ICE Gatheringの状態もUIに反映
                webrtcConnectionStatus.textContent = `ICE収集: ${peerConnection.iceGatheringState}`;
            }
        };

        // ICE接続状態の変更を監視 (デバッグ用)
        peerConnection.oniceconnectionstatechange = () => {
            console.log("WebRTC ICE Connection state changed:", peerConnection.iceConnectionState);
            if (webrtcConnectionStatus) { // ICE Connectionの状態もUIに反映
                webrtcConnectionStatus.textContent = `ICE接続: ${peerConnection.iceConnectionState}`;
            }
        };


        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // ICE候補をWebSocketサーバー経由で相手に送信
                window.ws.send(JSON.stringify({ type: 'webrtc_signal', signal: event.candidate }));
                console.log("WebRTC: Sending ICE candidate.");
            }
        };

        peerConnection.onnegotiationneeded = async () => {
            if (isWebRTCOfferInitiator) {
                try {
                    // Offerを作成して送信
                    const offer = await peerConnection.createOffer();
                    await peerConnection.setLocalDescription(offer);
                    window.ws.send(JSON.stringify({ type: 'webrtc_signal', signal: peerConnection.localDescription }));
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

    /**
     * DataChannelのイベントリスナーを設定します。
     */
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

    /**
     * マッチ情報とP2P接続をクリアし、UIを初期状態に戻します。
     */
    const clearMatchAndP2PConnection = () => {
        opponentPlayerId = null;
        opponentUsername = null;
        currentMatchId = null;
        isWebRTCOfferInitiator = false;
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
            console.log("WebRTC: PeerConnection closed during cleanup.");
        }
        if (dataChannel) {
            dataChannel = null;
            console.log("WebRTC: DataChannel cleared during cleanup.");
        }
        // サーバーにもマッチ情報クリアを通知
        // このメッセージはサーバー側で相手のopponent_ws_idをクリアするために必要
        if (window.ws && window.ws.readyState === WebSocket.OPEN && window.currentUserId) {
            window.ws.send(JSON.stringify({ type: 'clear_match_info' }));
        }
    };

    // --- イベントリスナーの再アタッチ ---
    // 認証関連ボタン
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
    // home.jsから呼び出せるようにグローバルに公開
    window.handleLogoutButtonClickFromRateMatch = handleLogoutButtonClick;

    // 表示名変更ボタン
    const newDisplayNameInput = document.getElementById('new-display-name-input');
    const updateDisplayNameButton = document.getElementById('update-display-name-button');
    if (updateDisplayNameButton) {
        updateDisplayNameButton.removeEventListener('click', handleUpdateDisplayNameClick);
        updateDisplayNameButton.addEventListener('click', handleUpdateDisplayNameClick);
    }


    // マッチング関連ボタン
    if (matchingButton) {
        matchingButton.removeEventListener('click', handleMatchingButtonClick);
        matchingButton.addEventListener('click', handleMatchingButtonClick);
    }
    if (cancelMatchingButtonInStatus) { // マッチング待機中のキャンセルボタン
        cancelMatchingButtonInStatus.removeEventListener('click', handleCancelMatchingButtonClick);
        cancelMatchingButtonInStatus.addEventListener('click', handleCancelMatchingButtonClick);
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
        winButton.removeEventListener('click', handleReportResultClick); // 共通ハンドラに変更
        winButton.addEventListener('click', handleReportResultClick);
    }
    if (loseButton) {
        loseButton.removeEventListener('click', handleReportResultClick); // 共通ハンドラに変更
        loseButton.addEventListener('click', handleReportResultClick);
    }
    if (cancelButton) {
        cancelButton.removeEventListener('click', handleReportResultClick); // 共通ハンドラに変更
        cancelButton.addEventListener('click', handleReportResultClick);
    }

    // ランキング更新ボタン
    if (refreshRankingButton) {
        refreshRankingButton.removeEventListener('click', fetchAndDisplayRanking);
        refreshRankingButton.addEventListener('click', fetchAndDisplayRanking);
    }


    // --- イベントハンドラ関数定義 ---
    /**
     * アカウント登録ボタンのクリックハンドラ。
     * ユーザー名とパスワードをサーバーに送信してアカウントを登録します。
     */
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

    /**
     * ログインボタンのクリックハンドラ。
     * ユーザー名とパスワードをサーバーに送信してログインします。
     */
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

    /**
     * ログアウトボタンのクリックハンドラ。
     * ログアウト確認後、サーバーにログアウトメッセージを送信します。
     */
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

    /**
     * 表示名更新ボタンのクリックハンドラ。
     * 新しい表示名をサーバーに送信して更新します。
     */
    async function handleUpdateDisplayNameClick() {
        const newDisplayName = newDisplayNameInput ? newDisplayNameInput.value.trim() : '';
        if (!newDisplayName) {
            await window.showCustomDialog('エラー', '新しい表示名を入力してください。');
            return;
        }
        if (newDisplayName.length > 20) { // 表示名の長さに制限を設ける
            await window.showCustomDialog('エラー', '表示名は20文字以内で入力してください。');
            return;
        }
        if (!window.currentUserId || !window.ws || window.ws.readyState !== WebSocket.OPEN) {
            await window.showCustomDialog('エラー', 'ログインしているか、サーバーに接続していません。');
            return;
        }
        window.ws.send(JSON.stringify({ type: 'update_display_name', userId: window.currentUserId, newDisplayName: newDisplayName }));
    }


    /**
     * オンラインマッチングボタンのクリックハンドラ。
     * マッチングキューに参加し、UIを更新します。
     */
    async function handleMatchingButtonClick() {
        if (!window.currentUserId) {
            await window.showCustomDialog('エラー', 'レート戦を開始するにはログインしてください。');
            return;
        }
        if (!window.ws || window.ws.readyState !== WebSocket.OPEN) {
            await window.showCustomDialog('エラー', 'サーバーに接続していません。ページをリロードしてください。');
            return;
        }
        // UIをマッチング待機中に即座に更新
        if (preMatchUiDiv) preMatchUiDiv.style.display = 'none';
        if (matchingStatusDiv) matchingStatusDiv.style.display = 'flex'; // マッチング中UIを表示
        if (matchingStatusTextSpan) matchingStatusTextSpan.textContent = '対戦相手を検索中です...'; // テキストも更新
        if (postMatchUiDiv) postMatchUiDiv.style.display = 'none';
        if (matchingButton) matchingButton.disabled = true; // マッチングボタンを無効化
        if (cancelMatchingButtonInStatus) cancelMatchingButtonInStatus.disabled = false; // キャンセルボタンを有効化

        // マッチング開始リクエストをサーバーに送信
        window.ws.send(JSON.stringify({ type: 'join_queue', userId: window.currentUserId }));
    }

    /**
     * マッチングキャンセルボタンのクリックハンドラ。
     * マッチングキューから離脱し、UIをリセットします。
     */
    async function handleCancelMatchingButtonClick() {
        const confirmed = await window.showCustomDialog('マッチングキャンセル', 'マッチングをキャンセルしますか？', true);
        if (confirmed) {
            if (window.ws && window.ws.readyState === WebSocket.OPEN && window.currentUserId) {
                window.ws.send(JSON.stringify({ type: 'leave_queue', userId: window.currentUserId }));
            } else {
                await window.showCustomDialog('エラー', 'サーバーに接続していません。');
            }
            clearMatchAndP2PConnection(); // P2P接続もクリア
            updateUIState(); // UIを元の状態に戻す
        }
    }

    /**
     * チャット送信ボタンのクリックハンドラ。
     * DataChannel経由でメッセージを送信します。
     */
    async function handleSendChatButtonClick() {
        if (!chatInput || !dataChannel || dataChannel.readyState !== 'open') {
            await window.showCustomDialog('エラー', 'チャットを送信できません。P2P接続が確立されているか確認してください。');
            return;
        }
        const message = chatInput.value.trim();
        if (message) {
            dataChannel.send(message); // DataChannel経由で送信
            displayChatMessage(window.currentUserId, message); // 自分のメッセージは即座に表示
            chatInput.value = '';
        }
    }

    /**
     * チャット入力フィールドでのEnterキー押下ハンドラ。
     */
    function handleChatInputKeypress(e) {
        if (e.key === 'Enter') {
            sendChatButton.click();
        }
    }

    /**
     * 定型文チャットボタンのクリックハンドラ。
     */
    function handleChatPhraseButtonClick(event) {
        if (chatInput && sendChatButton) {
            chatInput.value = event.currentTarget.textContent;
            sendChatButton.click();
        }
    }

    /**
     * 結果報告ボタン（勝利、敗北、中止）の共通ハンドラ。
     * サーバーに結果を報告し、相手の報告を待ちます。
     * @param {Event} event - クリックイベント。
     */
    async function handleReportResultClick(event) {
        const reportType = event.currentTarget.id.replace('-button', ''); // 'win', 'lose', 'cancel'
        let confirmationMessage = '';
        let resultToReport = '';

        if (reportType === 'win') {
            confirmationMessage = '対戦に勝利したことを報告しますか？';
            resultToReport = 'win';
        } else if (reportType === 'lose') {
            confirmationMessage = '対戦に敗北したことを報告しますか？';
            resultToReport = 'lose';
        } else if (reportType === 'cancel') {
            confirmationMessage = '対戦を中止したことを報告しますか？';
            resultToReport = 'cancel';
        }

        const confirmed = await window.showCustomDialog('結果報告', confirmationMessage, true);
        if (!confirmed) return;

        if (!window.currentUserId || !window.ws || window.ws.readyState !== WebSocket.OPEN || !currentMatchId) {
            await window.showCustomDialog('エラー', 'ログインしているか、有効なマッチ中です。');
            return;
        }

        // サーバーに結果を報告
        window.ws.send(JSON.stringify({
            type: 'report_result',
            userId: window.currentUserId,
            matchId: currentMatchId,
            result: resultToReport
        }));
        if (webrtcConnectionStatus) webrtcConnectionStatus.textContent = '結果報告済み、相手の報告を待機中...'; // UIに報告済み状態を表示
        await window.showCustomDialog('報告送信', '対戦結果をサーバーに報告しました。相手の報告を待っています。');
        // ボタンを無効化して二重報告を防ぐ
        if (winButton) winButton.disabled = true;
        if (loseButton) loseButton.disabled = true;
        if (cancelButton) cancelButton.disabled = true;
    }


    // --- 初期ロード時の処理 ---
    connectWebSocket(); // WebSocket接続を開始
    updateUIState(); // 初期UI状態を更新

    // Firebase Auth ReadyイベントはReplit DB認証では不要になるが、
    // 他のセクションでFirebase Authを使用している場合は残す。
    // このファイルでは直接使用しないため、関連コードは削除/コメントアウト。
    // document.addEventListener('firebaseAuthReady', () => {
    //     // Firebase Auth Ready時の処理（Replit DB認証では不要）
    // });

}; // End of initRateMatchSection
void 0; // Explicitly return undefined for Firefox compatibility
