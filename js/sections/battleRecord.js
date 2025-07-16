// js/sections/battleRecord.js

(function() {
    // このセクションが初期化済みかどうかを追跡するフラグ
    let isInitialized = false;

    // 初期化関数をグローバルに公開
    window.initBattleRecordSection = function() {
        // 既に初期化済みの場合は何もしない
        if (isInitialized) {
            return;
        }

        // --- グローバル変数 (このスコープ内) ---
        let mediaRecorder;
        let recordedChunks = [];
        let replayStream;
        let db;
        let broadcastStream;
        let peerConnection;
        let spectateConnection;
        let currentRoomId = null;

        // --- IndexedDB関連の定数 ---
        const DB_NAME = 'TcgReplayDB';
        const DB_VERSION = 1;
        const META_STORE_NAME = 'replaysMeta';
        const CHUNKS_STORE_NAME = 'replayChunks';
        const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

        // --- DOM要素の取得 ---
        const sectionContainer = document.getElementById('tcg-battlerecord-section');
        if (!sectionContainer) {
            console.error("BattleRecord section container (#tcg-battlerecord-section) not found!");
            return;
        }

        // =================================================================
        // データ管理 (ログイン状態を考慮)
        // =================================================================
        const getDecks = async () => window.currentUserId ? (window.userRegisteredDecks || []) : JSON.parse(localStorage.getItem('registeredDecksLocal') || '[]');
        const saveDecks = async (decks) => {
            if (window.currentUserId) {
                // TODO: Implement server-side save for window.userRegisteredDecks
                window.userRegisteredDecks = decks;
            } else {
                localStorage.setItem('registeredDecksLocal', JSON.stringify(decks));
            }
        };
        const getRecords = async () => window.currentUserId ? (window.userBattleRecords || []) : JSON.parse(localStorage.getItem('battleRecordsLocal') || '[]');
        const saveRecords = async (records) => {
            if (window.currentUserId) {
                // TODO: Implement server-side save for window.userBattleRecords
                window.userBattleRecords = records;
            } else {
                localStorage.setItem('battleRecordsLocal', JSON.stringify(records));
            }
        };

        // =================================================================
        // ヘルパー関数
        // =================================================================
        const openDB = () => new Promise((resolve, reject) => {
            if (db) return resolve(db);
            if (!window.indexedDB) return reject(new Error("IndexedDBがサポートされていません。"));
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (e) => reject("DB Error: " + e.target.error.message);
            request.onupgradeneeded = (e) => {
                const tempDb = e.target.result;
                if (!tempDb.objectStoreNames.contains(META_STORE_NAME)) tempDb.createObjectStore(META_STORE_NAME, { keyPath: 'id' });
                if (!tempDb.objectStoreNames.contains(CHUNKS_STORE_NAME)) {
                    const store = tempDb.createObjectStore(CHUNKS_STORE_NAME, { autoIncrement: true });
                    store.createIndex('replayId', 'replayId', { unique: false });
                }
            };
            request.onsuccess = (e) => { db = e.target.result; resolve(db); };
        });

        const updateUIForRecording = (isRecording) => {
            const startBtn = sectionContainer.querySelector('#start-replay-record-button');
            const stopBtn = sectionContainer.querySelector('#stop-replay-record-button');
            const statusEl = sectionContainer.querySelector('#record-status');
            if (startBtn) startBtn.style.display = isRecording ? 'none' : 'inline-flex';
            if (stopBtn) stopBtn.style.display = isRecording ? 'inline-flex' : 'none';
            if (statusEl) {
                statusEl.textContent = isRecording ? "ステータス: 録画中..." : "ステータス: 待機中";
                statusEl.className = isRecording ? 'record-status-recording' : 'record-status-idle';
            }
        };

        // =================================================================
        // リプレイ機能ロジック
        // =================================================================
        const startRecording = async () => {
            try {
                replayStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                    preferCurrentTab: true, systemAudio: 'include'
                });
                updateUIForRecording(true);
                replayStream.getVideoTracks()[0].onended = () => stopRecording();
                recordedChunks = [];
                const options = { mimeType: 'video/webm;codecs=vp9,opus' };
                if (!MediaRecorder.isTypeSupported(options.mimeType)) delete options.mimeType;
                mediaRecorder = new MediaRecorder(replayStream, options);
                mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) recordedChunks.push(event.data); };
                mediaRecorder.onstop = async () => {
                    sectionContainer.querySelector('#record-status').textContent = "ステータス: 処理中...";
                    const replayId = `replay_${Date.now()}`;
                    try {
                        const db = await openDB();
                        const metaTx = db.transaction(META_STORE_NAME, 'readwrite');
                        metaTx.objectStore(META_STORE_NAME).put({ id: replayId, timestamp: Date.now() });
                        await new Promise((res, rej) => { metaTx.oncomplete = res; metaTx.onerror = rej; });
                        const chunkTx = db.transaction(CHUNKS_STORE_NAME, 'readwrite');
                        const chunkStore = chunkTx.objectStore(CHUNKS_STORE_NAME);
                        for (const chunk of recordedChunks) chunkStore.add({ replayId, chunk });
                        await new Promise((res, rej) => { chunkTx.oncomplete = res; chunkTx.onerror = rej; });
                        recordedChunks = [];
                        await updateReplayList();
                        window.showCustomDialog('録画完了', 'リプレイが保存されました。');
                    } catch (e) { window.showCustomDialog('保存エラー', `リプレイの保存に失敗しました: ${e.message}`); }
                    finally { updateUIForRecording(false); }
                };
                mediaRecorder.start(5000);
            } catch (err) {
                console.error("Error starting recording:", err);
                window.showCustomDialog('録画エラー', `録画を開始できませんでした: ${err.message}`);
                updateUIForRecording(false);
            }
        };

        const stopRecording = () => {
            if (mediaRecorder?.state === "recording") mediaRecorder.stop();
            replayStream?.getTracks().forEach(track => track.stop());
            replayStream = null;
            updateUIForRecording(false);
        };
        
        const updateReplayList = async () => {
            const replaysListEl = sectionContainer.querySelector('#replays-list');
            if (!replaysListEl) return;
            try {
                const db = await openDB();
                const replays = await new Promise((resolve, reject) => {
                    const request = db.transaction(META_STORE_NAME, 'readonly').objectStore(META_STORE_NAME).getAll();
                    request.onsuccess = () => resolve(request.result.sort((a, b) => b.timestamp - a.timestamp));
                    request.onerror = (e) => reject(e.target.error);
                });
                replaysListEl.innerHTML = '';
                if (replays.length === 0) {
                    replaysListEl.innerHTML = '<li>保存されたリプレイはありません。</li>';
                } else {
                    replays.forEach(replay => {
                        const li = document.createElement('li');
                        li.innerHTML = `
                            <div class="replay-item-info"><strong>${new Date(replay.timestamp).toLocaleString()}</strong></div>
                            <div class="replay-item-actions">
                                <button class="play-replay-button button-style" data-id="${replay.id}"><i class="fas fa-play"></i> 再生</button>
                                <button class="delete-replay-button button-style" data-id="${replay.id}"><i class="fas fa-trash"></i> 削除</button>
                            </div>`;
                        replaysListEl.appendChild(li);
                    });
                }
            } catch (error) {
                console.error("Failed to update replay list:", error);
                replaysListEl.innerHTML = `<li>リプレイリストの読み込みに失敗しました: ${error.message}</li>`;
            }
        };

        const playReplayWithMSE = async (replayId) => {
            const replayPlayerWrapper = sectionContainer.querySelector('#replay-player-wrapper');
            const replayVideo = sectionContainer.querySelector('#replay-video');
            try {
                const db = await openDB();
                const chunks = await new Promise((resolve, reject) => {
                     const request = db.transaction(CHUNKS_STORE_NAME, 'readonly').objectStore(CHUNKS_STORE_NAME).index('replayId').getAll(replayId);
                     request.onsuccess = () => resolve(request.result.map(r => r.chunk));
                     request.onerror = (e) => reject(e.target.error);
                });
                if (chunks.length === 0) return window.showCustomDialog('エラー', '再生データが見つかりません。');

                replayPlayerWrapper.style.display = 'block';
                const mediaSource = new MediaSource();
                replayVideo.src = URL.createObjectURL(mediaSource);
                mediaSource.addEventListener('sourceopen', async () => {
                    URL.revokeObjectURL(replayVideo.src);
                    const mimeType = 'video/webm;codecs=vp9,opus';
                    if (!MediaSource.isTypeSupported(mimeType)) return window.showCustomDialog('再生エラー', 'ブラウザが再生フォーマットをサポートしていません。');
                    
                    const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
                    let i = 0;
                    const appendNextChunk = async () => {
                        if (sourceBuffer.updating || i >= chunks.length) {
                            if (!sourceBuffer.updating && mediaSource.readyState === 'open') mediaSource.endOfStream();
                            return;
                        }
                        try {
                            sourceBuffer.appendBuffer(await chunks[i].arrayBuffer());
                            i++;
                        } catch (error) { console.error("Buffer append error:", error); }
                    };
                    sourceBuffer.addEventListener('updateend', appendNextChunk);
                    await appendNextChunk();
                });
                replayVideo.play();
            } catch (error) {
                console.error("Error playing replay:", error);
                window.showCustomDialog('再生エラー', `リプレイの再生中にエラーが発生しました: ${error.message}`);
            }
        };

        const deleteReplay = async (replayId) => {
            try {
                const db = await openDB();
                const metaTx = db.transaction(META_STORE_NAME, 'readwrite');
                metaTx.objectStore(META_STORE_NAME).delete(replayId);
                await new Promise((res, rej) => { metaTx.oncomplete = res; metaTx.onerror = rej; });
                
                const chunkTx = db.transaction(CHUNKS_STORE_NAME, 'readwrite');
                const chunkStore = chunkTx.objectStore(CHUNKS_STORE_NAME);
                const index = chunkStore.index('replayId');
                const request = index.openKeyCursor(IDBKeyRange.only(replayId));
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (cursor) {
                        chunkStore.delete(cursor.primaryKey);
                        cursor.continue();
                    }
                };
                await new Promise((res, rej) => { chunkTx.oncomplete = res; chunkTx.onerror = rej; });
                await updateReplayList();
                window.showCustomDialog('成功', 'リプレイを削除しました。');
            } catch (error) {
                console.error("Failed to delete replay:", error);
                window.showCustomDialog('削除エラー', `リプレイの削除に失敗しました: ${error.message}`);
            }
        };

        // =================================================================
        // 観戦機能ロジック (WebRTC with WebSocket Signaling)
        // =================================================================
        const startBroadcast = async () => {
            if (!window.ws || window.ws.readyState !== WebSocket.OPEN) {
                return window.showCustomDialog('エラー', 'サーバーに接続していません。レート戦タブからログインしてください。');
            }
            try {
                broadcastStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                updateUIForBroadcast(true);
                broadcastStream.getVideoTracks()[0].onended = () => stopBroadcast();

                peerConnection = new RTCPeerConnection(RTC_CONFIG);
                broadcastStream.getTracks().forEach(track => peerConnection.addTrack(track, broadcastStream));

                peerConnection.onicecandidate = event => {
                    if (event.candidate) {
                        window.ws.send(JSON.stringify({
                            type: 'spectate_signal',
                            roomId: currentRoomId,
                            signal: { candidate: event.candidate }
                        }));
                    }
                };
                
                // サーバーに配信開始を通知し、ルームIDを受け取る
                window.ws.send(JSON.stringify({ type: 'start_broadcast' }));

            } catch (err) {
                console.error("Broadcast failed to start:", err);
                window.showCustomDialog('配信エラー', `配信を開始できませんでした: ${err.message}`);
                stopBroadcast();
            }
        };
        
        const stopBroadcast = () => {
            if (window.ws && window.ws.readyState === WebSocket.OPEN && currentRoomId) {
                window.ws.send(JSON.stringify({ type: 'stop_broadcast', roomId: currentRoomId }));
            }
            broadcastStream?.getTracks().forEach(track => track.stop());
            peerConnection?.close();
            peerConnection = null;
            broadcastStream = null;
            currentRoomId = null;
            updateUIForBroadcast(false);
        };

        const updateUIForBroadcast = (isBroadcasting) => {
            sectionContainer.querySelector('#start-broadcast-button').style.display = isBroadcasting ? 'none' : 'block';
            sectionContainer.querySelector('#stop-broadcast-button').style.display = isBroadcasting ? 'block' : 'none';
            sectionContainer.querySelector('#broadcast-status').style.display = isBroadcasting ? 'block' : 'none';
        };

        const startSpectating = async () => {
            if (!window.ws || window.ws.readyState !== WebSocket.OPEN) {
                return window.showCustomDialog('エラー', 'サーバーに接続していません。レート戦タブからログインしてください。');
            }
            const roomId = sectionContainer.querySelector('#spectate-room-id-input').value.trim();
            if (!roomId) return window.showCustomDialog('エラー', 'ルームIDを入力してください。');
            
            currentRoomId = roomId;
            updateUIForSpectate(true);

            window.ws.send(JSON.stringify({ type: 'join_spectate_room', roomId: roomId }));
        };

        const stopSpectating = () => {
            if (window.ws && window.ws.readyState === WebSocket.OPEN && currentRoomId) {
                window.ws.send(JSON.stringify({ type: 'leave_spectate_room', roomId: currentRoomId }));
            }
            spectateConnection?.close();
            spectateConnection = null;
            currentRoomId = null;
            updateUIForSpectate(false);
            const videoEl = sectionContainer.querySelector('#spectate-video');
            if(videoEl) videoEl.srcObject = null;
        };

        const updateUIForSpectate = (isSpectating) => {
            sectionContainer.querySelector('#spectate-form').style.display = isSpectating ? 'none' : 'flex';
            sectionContainer.querySelector('#spectate-view').style.display = isSpectating ? 'block' : 'none';
        };
        
        // WebSocketメッセージを処理するグローバルハンドラ
        window.handleSpectateSignal = async (message) => {
            const { roomId, signal } = message;

            // 自分が配信者側の場合
            if (peerConnection && signal.answer) {
                if (peerConnection.signalingState !== "stable") {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
                }
            }
            if (peerConnection && signal.candidate) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }

            // 自分が視聴者側の場合
            if (roomId === currentRoomId && signal.offer) {
                spectateConnection = new RTCPeerConnection(RTC_CONFIG);
                spectateConnection.onicecandidate = event => {
                    if (event.candidate) {
                        window.ws.send(JSON.stringify({
                            type: 'spectate_signal',
                            roomId: currentRoomId,
                            signal: { candidate: event.candidate }
                        }));
                    }
                };
                spectateConnection.ontrack = event => {
                    const videoEl = sectionContainer.querySelector('#spectate-video');
                    if (videoEl && videoEl.srcObject !== event.streams[0]) {
                        videoEl.srcObject = event.streams[0];
                    }
                };
                await spectateConnection.setRemoteDescription(new RTCSessionDescription(signal.offer));
                const answer = await spectateConnection.createAnswer();
                await spectateConnection.setLocalDescription(answer);
                window.ws.send(JSON.stringify({
                    type: 'spectate_signal',
                    roomId: currentRoomId,
                    signal: { answer: answer }
                }));
            }
            if (spectateConnection && signal.candidate) {
                await spectateConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
        };
        
        window.handleBroadcastStarted = async (message) => {
            currentRoomId = message.roomId;
            sectionContainer.querySelector('#broadcast-room-id').value = currentRoomId;
            
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            window.ws.send(JSON.stringify({
                type: 'spectate_signal',
                roomId: currentRoomId,
                signal: { offer: offer }
            }));
        };
        
        // =================================================================
        // 戦績・デッキ管理ロジック
        // =================================================================
        const loadRegisteredDecks = async () => {
            const decks = await getDecks();
            const registeredDecksList = sectionContainer.querySelector('#registered-decks-list');
            const myDeckSelect = sectionContainer.querySelector('#my-deck-select');
            const opponentDeckSelect = sectionContainer.querySelector('#opponent-deck-select');
            if (!registeredDecksList || !myDeckSelect || !opponentDeckSelect) return;
            const sortedDecks = [...decks].sort((a, b) => a.name.localeCompare(b.name));
            registeredDecksList.innerHTML = '';
            myDeckSelect.innerHTML = '<option value="">登録済みデッキから選択</option>';
            opponentDeckSelect.innerHTML = '<option value="">登録済みデッキから選択</option>';
            if (sortedDecks.length === 0) {
                registeredDecksList.innerHTML = `<li>まだ登録されたデッキがありません。</li>`;
            } else {
                sortedDecks.forEach(deck => {
                    const li = document.createElement('li');
                    li.innerHTML = `${deck.name} (${deck.type}) <button class="delete-deck-button button-style" data-name="${deck.name}" title="削除"><i class="fas fa-trash-alt"></i></button>`;
                    registeredDecksList.appendChild(li);
                    const option = `<option value="${deck.name}" data-type="${deck.type}">${deck.name} (${deck.type})</option>`;
                    myDeckSelect.innerHTML += option;
                    opponentDeckSelect.innerHTML += option;
                });
            }
        };

        const loadBattleRecords = async () => {
            const records = await getRecords();
            const battleRecordsList = sectionContainer.querySelector('#battle-records-list');
            if (!battleRecordsList) return;
            battleRecordsList.innerHTML = '';
            if (records.length === 0) {
                battleRecordsList.innerHTML = `<li>まだ対戦記録がありません。</li>`;
            } else {
                [...records].reverse().forEach((record, revIdx) => {
                    const origIdx = records.length - 1 - revIdx;
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <strong>${record.timestamp}</strong><br>
                        自分: ${record.myDeck} vs 相手: ${record.opponentDeck}<br>
                        結果: ${record.result === 'win' ? '勝利' : '敗北'} (${record.firstSecond === 'first' ? '先攻' : '後攻'})
                        <button class="delete-record-button button-style" data-index="${origIdx}" title="削除"><i class="fas fa-trash-alt"></i></button>`;
                    battleRecordsList.appendChild(li);
                });
            }
            calculateAndDisplayStats(records);
        };
        
        const calculateAndDisplayStats = (records) => {
            const container = sectionContainer.querySelector('#battle-stats');
            if (!container) return;
            const totalGames = records.length;
            const wins = records.filter(r => r.result === 'win').length;
            const losses = totalGames - wins;
            const winRate = totalGames > 0 ? (wins / totalGames * 100).toFixed(1) : '0.0';
            container.querySelector('#total-games').textContent = totalGames;
            container.querySelector('#total-wins').textContent = wins;
            container.querySelector('#total-losses').textContent = losses;
            container.querySelector('#win-rate').textContent = `${winRate}%`;
        };

        // =================================================================
        // タブ切り替え
        // =================================================================
        const showBattleRecordTab = (tabId) => {
            sectionContainer.querySelectorAll('.battle-record-tab-content').forEach(c => c.classList.remove('active'));
            sectionContainer.querySelectorAll('.battle-record-tab-button').forEach(b => b.classList.remove('active'));
            const targetContent = sectionContainer.querySelector(`#battle-record-tab-${tabId}`);
            const targetButton = sectionContainer.querySelector(`.battle-record-tab-button[data-tab="${tabId}"]`);
            if (targetContent) targetContent.classList.add('active');
            if (targetButton) targetButton.classList.add('active');

            if (tabId === 'replay') updateReplayList();
            else if (tabId === 'deck-management' || tabId === 'new-record') loadRegisteredDecks();
            else if (tabId === 'past-records' || tabId === 'stats-summary') loadBattleRecords();
        };

        // =================================================================
        // イベントリスナー設定 (イベント委譲)
        // =================================================================
        sectionContainer.addEventListener('click', async (event) => {
            const button = event.target.closest('button');
            if (!button) return;

            // タブ
            if (button.matches('.battle-record-tab-button')) showBattleRecordTab(button.dataset.tab);
            // リプレイ
            if (button.id === 'start-replay-record-button') startRecording();
            if (button.id === 'stop-replay-record-button') stopRecording();
            if (button.id === 'close-replay-player-button') {
                sectionContainer.querySelector('#replay-player-wrapper').style.display = 'none';
                const video = sectionContainer.querySelector('#replay-video');
                if (video) { video.pause(); video.src = ''; }
            }
            if (button.matches('.play-replay-button')) playReplayWithMSE(button.dataset.id);
            if (button.matches('.delete-replay-button')) {
                if (await window.showCustomDialog('確認', 'このリプレイを本当に削除しますか？', true)) {
                    deleteReplay(button.dataset.id);
                }
            }
            // 観戦
            if (button.id === 'start-broadcast-button') startBroadcast();
            if (button.id === 'stop-broadcast-button') stopBroadcast();
            if (button.id === 'start-spectate-button') startSpectating();
            if (button.id === 'stop-spectate-button') stopSpectating();
            if (button.id === 'copy-room-id-button') {
                const roomIdInput = sectionContainer.querySelector('#broadcast-room-id');
                roomIdInput.select();
                document.execCommand('copy');
                window.showCustomDialog('成功', 'ルームIDをコピーしました。');
            }
            if (button.id === 'register-deck-button') {
                const nameInput = sectionContainer.querySelector('#new-deck-name');
                const typeSelect = sectionContainer.querySelector('#new-deck-type');
                const deckName = nameInput.value.trim();
                const deckType = typeSelect.value;
                if (!deckName || !deckType) return window.showCustomDialog('エラー', 'デッキ名とタイプは必須です。');
                const decks = await getDecks();
                if (decks.some(d => d.name === deckName)) return window.showCustomDialog('エラー', '同じ名前のデッキが既に登録されています。');
                decks.push({ name: deckName, type: deckType });
                await saveDecks(decks);
                window.showCustomDialog('成功', 'デッキを登録しました。');
                nameInput.value = '';
                typeSelect.value = '';
                await loadRegisteredDecks();
            }
            if (button.matches('.delete-deck-button')) {
                const deckName = button.dataset.name;
                if (await window.showCustomDialog('確認', `デッキ「${deckName}」を削除しますか？`, true)) {
                    let decks = await getDecks();
                    decks = decks.filter(d => d.name !== deckName);
                    await saveDecks(decks);
                    await loadRegisteredDecks();
                }
            }
            // 戦績記録
            if (button.id === 'save-battle-record-button') {
                const myDeckSelect = sectionContainer.querySelector('#my-deck-select');
                const opponentDeckSelect = sectionContainer.querySelector('#opponent-deck-select');
                const winLossSelect = sectionContainer.querySelector('#win-loss-select');
                const firstSecondSelect = sectionContainer.querySelector('#first-second-select');
                const notesTextarea = sectionContainer.querySelector('#notes-textarea');
                if (!myDeckSelect.value || !opponentDeckSelect.value || !firstSecondSelect.value) return window.showCustomDialog('エラー', '必須項目を入力してください。');
                const newRecord = {
                    timestamp: new Date().toLocaleString(), myDeck: myDeckSelect.value, opponentDeck: opponentDeckSelect.value,
                    result: winLossSelect.value, firstSecond: firstSecondSelect.value, notes: notesTextarea.value.trim()
                };
                const records = await getRecords();
                records.push(newRecord);
                await saveRecords(records);
                window.showCustomDialog('成功', '対戦記録を保存しました。');
                notesTextarea.value = '';
                showBattleRecordTab('past-records');
            }
            if (button.matches('.delete-record-button')) {
                const index = parseInt(button.dataset.index, 10);
                if (await window.showCustomDialog('確認', 'この記録を削除しますか？', true)) {
                    const records = await getRecords();
                    if (index >= 0 && index < records.length) {
                        records.splice(index, 1);
                        await saveRecords(records);
                        await loadBattleRecords();
                    }
                }
            }
        });

        // =================================================================
        // 初期化
        // =================================================================
        showBattleRecordTab('replay');
        isInitialized = true;
    };
})();
