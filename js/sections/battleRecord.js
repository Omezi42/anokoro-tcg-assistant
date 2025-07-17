// js/sections/battleRecord.js

// モジュールとしてエクスポート
export function initialize() {
    // 既に初期化済みの場合は処理を中断
    if (document.body.dataset.battleRecordInitialized === 'true') {
        return;
    }
    document.body.dataset.battleRecordInitialized = 'true';
    
    console.log("BattleRecord section initialized.");

    const a = self.browser || self.chrome;

    // --- 状態管理 ---
    const state = {
        mediaRecorder: null,
        recordedChunks: [],
        replayStream: null,
        db: null,
        broadcastStream: null,
        // 視聴者ごとのPeerConnectionを管理
        spectatorConnections: new Map(), // spectatorId -> RTCPeerConnection
        // 自分が視聴している接続
        spectateConnection: null,
        currentRoomId: null,
    };

    // --- 定数 ---
    const DB_NAME = 'TcgReplayDB';
    const DB_VERSION = 1;
    const META_STORE_NAME = 'replaysMeta';
    const CHUNKS_STORE_NAME = 'replayChunks';
    const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    // --- DOM要素のキャッシュ ---
    const getElement = (id) => document.getElementById(id);
    const elements = {
        sectionContainer: getElement('tcg-battlerecord-section'),
        startRecordBtn: getElement('start-replay-record-button'),
        stopRecordBtn: getElement('stop-replay-record-button'),
        recordStatus: getElement('record-status'),
        replaysList: getElement('replays-list'),
        replayPlayerWrapper: getElement('replay-player-wrapper'),
        replayVideo: getElement('replay-video'),
        closeReplayPlayerBtn: getElement('close-replay-player-button'),
        startBroadcastBtn: getElement('start-broadcast-button'),
        stopBroadcastBtn: getElement('stop-broadcast-button'),
        broadcastStatus: getElement('broadcast-status'),
        broadcastRoomIdDisplay: getElement('broadcast-room-id-display'),
        broadcastListWrapper: getElement('broadcast-list-wrapper'),
        spectateView: getElement('spectate-view'),
        spectateVideo: getElement('spectate-video'),
        stopSpectateBtn: getElement('stop-spectate-button'),
        broadcastList: getElement('broadcast-list'),
        refreshBroadcastBtn: getElement('refresh-broadcast-list-button'),
        myDeckSelect: getElement('my-deck-select'),
        opponentDeckSelect: getElement('opponent-deck-select'),
        registeredDecksList: getElement('registered-decks-list'),
        battleRecordsList: getElement('battle-records-list'),
        statsContainer: getElement('battle-stats'),
    };

    // --- IndexedDB ---
    const openDB = () => new Promise((resolve, reject) => {
        if (state.db) return resolve(state.db);
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (e) => reject("DB Error: " + e.target.error.message);
        request.onupgradeneeded = (e) => {
            const tempDb = e.target.result;
            if (!tempDb.objectStoreNames.contains(META_STORE_NAME)) {
                tempDb.createObjectStore(META_STORE_NAME, { keyPath: 'id' });
            }
            if (!tempDb.objectStoreNames.contains(CHUNKS_STORE_NAME)) {
                const store = tempDb.createObjectStore(CHUNKS_STORE_NAME, { autoIncrement: true });
                store.createIndex('replayId', 'replayId', { unique: false });
            }
        };
        request.onsuccess = (e) => { state.db = e.target.result; resolve(state.db); };
    });

    // --- データ管理 (ログイン状態考慮) ---
    const getDecks = async () => window.tcgAssistant.currentUserId ? (window.tcgAssistant.userRegisteredDecks || []) : JSON.parse(localStorage.getItem('registeredDecksLocal') || '[]');
    const saveDecks = async (decks) => {
        if (window.tcgAssistant.currentUserId) {
            window.tcgAssistant.userRegisteredDecks = decks;
            // TODO: サーバーに保存する処理を実装
        } else {
            localStorage.setItem('registeredDecksLocal', JSON.stringify(decks));
        }
    };
    const getRecords = async () => window.tcgAssistant.currentUserId ? (window.tcgAssistant.userBattleRecords || []) : JSON.parse(localStorage.getItem('battleRecordsLocal') || '[]');
    const saveRecords = async (records) => {
        if (window.tcgAssistant.currentUserId) {
            window.tcgAssistant.userBattleRecords = records;
            // TODO: サーバーに保存する処理を実装
        } else {
            localStorage.setItem('battleRecordsLocal', JSON.stringify(records));
        }
    };

    // --- UI更新ヘルパー ---
    const updateUIRecording = (isRecording) => {
        if (elements.startRecordBtn) elements.startRecordBtn.style.display = isRecording ? 'none' : 'inline-flex';
        if (elements.stopRecordBtn) elements.stopRecordBtn.style.display = isRecording ? 'inline-flex' : 'none';
        if (elements.recordStatus) {
            elements.recordStatus.textContent = isRecording ? "ステータス: 録画中..." : "ステータス: 待機中";
            elements.recordStatus.className = isRecording ? 'record-status-recording' : 'record-status-idle';
        }
    };

    const updateUIBroadcast = (isBroadcasting) => {
        if(elements.startBroadcastBtn) elements.startBroadcastBtn.style.display = isBroadcasting ? 'none' : 'block';
        if(elements.stopBroadcastBtn) elements.stopBroadcastBtn.style.display = isBroadcasting ? 'block' : 'none';
        if(elements.broadcastStatus) elements.broadcastStatus.style.display = isBroadcasting ? 'block' : 'none';
        if (!isBroadcasting && elements.broadcastRoomIdDisplay) {
            elements.broadcastRoomIdDisplay.textContent = '';
        }
    };

    const updateUISpectate = (isSpectating) => {
        if(elements.broadcastListWrapper) elements.broadcastListWrapper.style.display = isSpectating ? 'none' : 'block';
        if(elements.spectateView) elements.spectateView.style.display = isSpectating ? 'block' : 'none';
    };

    // --- リプレイ機能 ---
    const startRecording = async () => {
        try {
            state.replayStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                preferCurrentTab: true,
                systemAudio: 'include'
            });
            updateUIRecording(true);
            state.replayStream.getVideoTracks()[0].onended = () => stopRecording();
            state.recordedChunks = [];
            const options = { mimeType: 'video/webm;codecs=vp9,opus' };
            state.mediaRecorder = new MediaRecorder(state.replayStream, options);
            state.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) state.recordedChunks.push(event.data);
            };
            state.mediaRecorder.onstop = saveReplay;
            state.mediaRecorder.start(5000); // 5秒ごとにチャンクを生成
        } catch (err) {
            console.error("Error starting recording:", err);
            window.showCustomDialog('録画エラー', `録画を開始できませんでした: ${err.message}`);
            updateUIRecording(false);
        }
    };

    const stopRecording = () => {
        if (state.mediaRecorder?.state === "recording") {
            state.mediaRecorder.stop();
        }
        state.replayStream?.getTracks().forEach(track => track.stop());
        state.replayStream = null;
        updateUIRecording(false);
    };

    const saveReplay = async () => {
        if(elements.recordStatus) elements.recordStatus.textContent = "ステータス: 処理中...";
        const replayId = `replay_${Date.now()}`;
        try {
            const db = await openDB();
            const metaTx = db.transaction(META_STORE_NAME, 'readwrite');
            metaTx.objectStore(META_STORE_NAME).put({ id: replayId, timestamp: Date.now() });
            
            const chunkTx = db.transaction(CHUNKS_STORE_NAME, 'readwrite');
            const chunkStore = chunkTx.objectStore(CHUNKS_STORE_NAME);
            for (const chunk of state.recordedChunks) {
                chunkStore.add({ replayId, chunk });
            }
            await new Promise((res, rej) => {
                chunkTx.oncomplete = res;
                chunkTx.onerror = rej;
            });
            state.recordedChunks = [];
            await updateReplayList();
            window.showCustomDialog('録画完了', 'リプレイが保存されました。');
        } catch (e) {
            window.showCustomDialog('保存エラー', `リプレイの保存に失敗しました: ${e.message}`);
        } finally {
            updateUIRecording(false);
        }
    };

    const updateReplayList = async () => {
        if (!elements.replaysList) return;
        try {
            const db = await openDB();
            const request = db.transaction(META_STORE_NAME, 'readonly').objectStore(META_STORE_NAME).getAll();
            const replays = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result.sort((a, b) => b.timestamp - a.timestamp));
                request.onerror = (e) => reject(e.target.error);
            });
            elements.replaysList.innerHTML = '';
            if (replays.length === 0) {
                elements.replaysList.innerHTML = '<li>保存されたリプレイはありません。</li>';
            } else {
                replays.forEach(replay => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <div class="replay-item-info"><strong>${new Date(replay.timestamp).toLocaleString()}</strong></div>
                        <div class="replay-item-actions">
                            <button class="play-replay-button button-style" data-id="${replay.id}"><i class="fas fa-play"></i> 再生</button>
                            <button class="delete-replay-button button-style" data-id="${replay.id}"><i class="fas fa-trash"></i> 削除</button>
                        </div>`;
                    elements.replaysList.appendChild(li);
                });
            }
        } catch (error) {
            console.error("Failed to update replay list:", error);
            elements.replaysList.innerHTML = `<li>リプレイリストの読み込みに失敗しました。</li>`;
        }
    };

    const playReplayWithMSE = async (replayId) => {
        if (!elements.replayPlayerWrapper || !elements.replayVideo) return;
        try {
            const db = await openDB();
            const request = db.transaction(CHUNKS_STORE_NAME, 'readonly').objectStore(CHUNKS_STORE_NAME).index('replayId').getAll(replayId);
            const chunks = await new Promise((resolve, reject) => {
                 request.onsuccess = () => resolve(request.result.map(r => r.chunk));
                 request.onerror = (e) => reject(e.target.error);
            });
            if (chunks.length === 0) return window.showCustomDialog('エラー', '再生データが見つかりません。');

            elements.replayPlayerWrapper.style.display = 'block';
            const mediaSource = new MediaSource();
            elements.replayVideo.src = URL.createObjectURL(mediaSource);
            mediaSource.addEventListener('sourceopen', () => {
                URL.revokeObjectURL(elements.replayVideo.src);
                const sourceBuffer = mediaSource.addSourceBuffer('video/webm;codecs=vp9,opus');
                const appendChunk = async (index) => {
                    if (index >= chunks.length) {
                        if (!sourceBuffer.updating) mediaSource.endOfStream();
                        return;
                    }
                    const buffer = await chunks[index].arrayBuffer();
                    sourceBuffer.appendBuffer(buffer);
                };
                sourceBuffer.onupdateend = () => appendChunk(chunks.indexOf(sourceBuffer.buffered) + 1);
                appendChunk(0);
            });
            elements.replayVideo.play();
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
            const chunkTx = db.transaction(CHUNKS_STORE_NAME, 'readwrite');
            const index = chunkTx.objectStore(CHUNKS_STORE_NAME).index('replayId');
            const request = index.openKeyCursor(IDBKeyRange.only(replayId));
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    chunkTx.objectStore(CHUNKS_STORE_NAME).delete(cursor.primaryKey);
                    cursor.continue();
                }
            };
            await Promise.all([
                new Promise(res => metaTx.oncomplete = res),
                new Promise(res => chunkTx.oncomplete = res)
            ]);
            await updateReplayList();
            window.showCustomDialog('成功', 'リプレイを削除しました。');
        } catch (error) {
            window.showCustomDialog('削除エラー', `リプレイの削除に失敗しました: ${error.message}`);
        }
    };

    // --- 観戦機能 ---
    const startBroadcast = async () => {
        if (!window.tcgAssistant.currentUserId) return window.showCustomDialog('エラー', '配信にはログインが必要です。');
        if (!window.tcgAssistant.ws || window.tcgAssistant.ws.readyState !== WebSocket.OPEN) return window.showCustomDialog('エラー', 'サーバーに接続していません。');
        
        try {
            updateUIBroadcast(true);
            state.broadcastStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, preferCurrentTab: true });
            state.broadcastStream.getVideoTracks()[0].onended = () => stopBroadcast();
            window.tcgAssistant.ws.send(JSON.stringify({ type: 'start_broadcast' }));
        } catch (err) {
            console.error("Broadcast failed to start:", err);
            window.showCustomDialog('配信エラー', `配信を開始できませんでした: ${err.message}`);
            updateUIBroadcast(false);
        }
    };

    const stopBroadcast = () => {
        if (window.tcgAssistant.ws && state.currentRoomId) {
            window.tcgAssistant.ws.send(JSON.stringify({ type: 'stop_broadcast', roomId: state.currentRoomId }));
        }
        state.broadcastStream?.getTracks().forEach(track => track.stop());
        state.spectatorConnections.forEach(pc => pc.close());
        state.spectatorConnections.clear();
        state.broadcastStream = null;
        state.currentRoomId = null;
        updateUIBroadcast(false);
    };
    
    const startSpectating = (roomId) => {
        if (!window.tcgAssistant.ws) return window.showCustomDialog('エラー', 'サーバーに接続していません。');
        stopSpectating(); // 既存の接続を閉じる
        state.currentRoomId = roomId;
        updateUISpectate(true);
        window.tcgAssistant.ws.send(JSON.stringify({ type: 'join_spectate_room', roomId }));
    };

    const stopSpectating = () => {
        state.spectateConnection?.close();
        state.spectateConnection = null;
        state.currentRoomId = null;
        updateUISpectate(false);
        if(elements.spectateVideo) elements.spectateVideo.srcObject = null;
    };
    
    const updateBroadcastList = (list) => {
        if (!elements.broadcastList) return;
        elements.broadcastList.innerHTML = '';
        if (!list || list.length === 0) {
            elements.broadcastList.innerHTML = '<li>現在、配信中のルームはありません。</li>';
            return;
        }
        list.forEach(room => {
            const li = document.createElement('li');
            li.className = 'broadcast-list-item';
            li.innerHTML = `
                <div class="broadcast-item-info">
                    <i class="fas fa-user-circle"></i>
                    <span>配信者: <strong>${room.broadcasterUsername}</strong></span>
                </div>
                <button class="start-spectate-button-in-list button-style" data-room-id="${room.roomId}"><i class="fas fa-eye"></i> 観戦する</button>`;
            elements.broadcastList.appendChild(li);
        });
    };

    // --- WebRTCハンドラ (観戦用) ---
    const handleNewSpectator = async ({ spectatorId }) => {
        console.log(`New spectator joined: ${spectatorId}`);
        const pc = new RTCPeerConnection(RTC_CONFIG);
        state.spectatorConnections.set(spectatorId, pc);

        state.broadcastStream.getTracks().forEach(track => pc.addTrack(track, state.broadcastStream));

        pc.onicecandidate = event => {
            if (event.candidate) {
                window.tcgAssistant.ws.send(JSON.stringify({
                    type: 'webrtc_signal_to_spectator',
                    roomId: state.currentRoomId,
                    spectatorId: spectatorId,
                    signal: { candidate: event.candidate }
                }));
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        window.tcgAssistant.ws.send(JSON.stringify({
            type: 'webrtc_signal_to_spectator',
            roomId: state.currentRoomId,
            spectatorId: spectatorId,
            signal: { sdp: pc.localDescription }
        }));
    };

    const handleSpectatorLeft = ({ spectatorId }) => {
        console.log(`Spectator left: ${spectatorId}`);
        const pc = state.spectatorConnections.get(spectatorId);
        if (pc) {
            pc.close();
            state.spectatorConnections.delete(spectatorId);
        }
    };

    const handleBroadcastSignal = async ({ from, signal }) => {
        // from が 'broadcaster' の場合、これは視聴者側の処理
        if (from === 'broadcaster' && signal.sdp) {
            state.spectateConnection = new RTCPeerConnection(RTC_CONFIG);
            state.spectateConnection.onicecandidate = event => {
                if (event.candidate) {
                    window.tcgAssistant.ws.send(JSON.stringify({
                        type: 'webrtc_signal_to_broadcaster',
                        roomId: state.currentRoomId,
                        signal: { candidate: event.candidate }
                    }));
                }
            };
            state.spectateConnection.ontrack = event => {
                if (elements.spectateVideo && elements.spectateVideo.srcObject !== event.streams[0]) {
                    elements.spectateVideo.srcObject = event.streams[0];
                }
            };
            await state.spectateConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await state.spectateConnection.createAnswer();
            await state.spectateConnection.setLocalDescription(answer);
            window.tcgAssistant.ws.send(JSON.stringify({
                type: 'webrtc_signal_to_broadcaster',
                roomId: state.currentRoomId,
                signal: { sdp: answer }
            }));
        } else if (from === 'broadcaster' && signal.candidate) {
            if (state.spectateConnection) {
                await state.spectateConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
        } 
        // from が spectatorId の場合、これは配信者側の処理
        else if (from && signal.sdp) { // Answer from spectator
            const pc = state.spectatorConnections.get(from);
            if (pc && pc.signalingState !== 'stable') {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            }
        } else if (from && signal.candidate) { // ICE from spectator
            const pc = state.spectatorConnections.get(from);
            if (pc) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
        }
    };

    // WebSocketメッセージの委譲
    const handleWsMessageForBroadcast = (message) => {
        switch(message.type) {
            case 'broadcast_started':
                state.currentRoomId = message.roomId;
                if(elements.broadcastRoomIdDisplay) elements.broadcastRoomIdDisplay.textContent = `ルームID: ${message.roomId}`;
                break;
            case 'new_spectator':
                handleNewSpectator(message);
                break;
            case 'spectator_left':
                handleSpectatorLeft(message);
                break;
            case 'broadcast_signal':
                handleBroadcastSignal(message);
                break;
            case 'broadcast_stopped':
                if (state.currentRoomId === message.roomId) {
                    window.showCustomDialog('配信終了', '配信者が配信を終了しました。');
                    stopSpectating();
                }
                break;
            case 'broadcast_list_update':
                updateBroadcastList(message.list);
                break;
        }
    };
    
    // --- イベントリスナー ---
    const setupEventListeners = () => {
        // イベント委譲
        elements.sectionContainer.addEventListener('click', async (e) => {
            const target = e.target.closest('button');
            if (!target) return;

            const id = target.id;
            const classList = target.classList;

            if (id === 'start-replay-record-button') startRecording();
            else if (id === 'stop-replay-record-button') stopRecording();
            else if (id === 'close-replay-player-button') {
                elements.replayPlayerWrapper.style.display = 'none';
                if (elements.replayVideo) { elements.replayVideo.pause(); elements.replayVideo.src = ''; }
            }
            else if (classList.contains('play-replay-button')) playReplayWithMSE(target.dataset.id);
            else if (classList.contains('delete-replay-button')) {
                if (await window.showCustomDialog('確認', 'このリプレイを本当に削除しますか？', true)) {
                    deleteReplay(target.dataset.id);
                }
            }
            else if (id === 'start-broadcast-button') startBroadcast();
            else if (id === 'stop-broadcast-button') stopBroadcast();
            else if (classList.contains('start-spectate-button-in-list')) startSpectating(target.dataset.roomId);
            else if (id === 'stop-spectate-button') stopSpectating();
            else if (id === 'refresh-broadcast-list-button') {
                if (window.tcgAssistant.ws?.readyState === WebSocket.OPEN) {
                    window.tcgAssistant.ws.send(JSON.stringify({ type: 'get_broadcast_list' }));
                }
            }
            // 他のボタンの処理...
        });
        
        // タブ切り替え
        elements.sectionContainer.querySelectorAll('.battle-record-tab-button').forEach(button => {
            button.addEventListener('click', () => showBattleRecordTab(button.dataset.tab));
        });
        
        // WebSocketメッセージリスナーを追加
        if (window.tcgAssistant.ws) {
            window.tcgAssistant.ws.addEventListener('message', (event) => {
                const message = JSON.parse(event.data);
                handleWsMessageForBroadcast(message);
            });
        }
    };

    const showBattleRecordTab = (tabId) => {
        elements.sectionContainer.querySelectorAll('.battle-record-tab-content').forEach(c => c.classList.remove('active'));
        elements.sectionContainer.querySelectorAll('.battle-record-tab-button').forEach(b => b.classList.remove('active'));
        const targetContent = getElement(`battle-record-tab-${tabId}`);
        const targetButton = elements.sectionContainer.querySelector(`.battle-record-tab-button[data-tab="${tabId}"]`);
        if (targetContent) targetContent.classList.add('active');
        if (targetButton) targetButton.classList.add('active');

        if (tabId === 'replay') updateReplayList();
        if (tabId === 'spectate' && window.tcgAssistant.ws?.readyState === WebSocket.OPEN) {
             window.tcgAssistant.ws.send(JSON.stringify({ type: 'get_broadcast_list' }));
        }
    };

    // --- 初期化 ---
    setupEventListeners();
    showBattleRecordTab('replay');
}
