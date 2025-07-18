// js/sections/battleRecord.js
export function initialize() {
    if (document.body.dataset.battleRecordInitialized === 'true') {
        const activeTab = document.querySelector('.battle-record-tab-button.active')?.dataset.tab || 'replay';
        showBattleRecordTab(activeTab);
        return;
    }
    document.body.dataset.battleRecordInitialized = 'true';
    
    console.log("BattleRecord section initialized with all features.");

    const a = (typeof browser !== "undefined") ? browser : chrome;

    const state = {
        mediaRecorder: null,
        recordedChunks: [],
        replayStream: null,
        db: null,
    };

    const DB_NAME = 'TcgReplayDB';
    const DB_VERSION = 1;
    const META_STORE_NAME = 'replaysMeta';
    const CHUNKS_STORE_NAME = 'replayChunks';

    const getElement = (id) => document.getElementById(id);
    const elements = {
        sectionContainer: document.querySelector('#tcg-battleRecord-section') || document.body,
        startRecordBtn: getElement('start-replay-record-button'),
        stopRecordBtn: getElement('stop-replay-record-button'),
        recordStatus: getElement('record-status'),
        replaysList: getElement('replays-list'),
        replayPlayerWrapper: getElement('replay-player-wrapper'),
        replayVideo: getElement('replay-video'),
        closeReplayPlayerBtn: getElement('close-replay-player-button'),
        newDeckNameInput: getElement('new-deck-name'),
        newDeckTypeSelect: getElement('new-deck-type'),
        registerDeckBtn: getElement('register-deck-button'),
        registeredDecksList: getElement('registered-decks-list'),
        myDeckSelect: getElement('my-deck-select'),
        opponentDeckSelect: getElement('opponent-deck-select'),
        winLossSelect: getElement('win-loss-select'),
        firstSecondSelect: getElement('first-second-select'),
        notesTextarea: getElement('notes-textarea'),
        saveRecordBtn: getElement('save-battle-record-button'),
        battleRecordsList: getElement('battle-records-list'),
        statsContainer: getElement('battle-stats'),
        totalGames: getElement('total-games'),
        totalWins: getElement('total-wins'),
        totalLosses: getElement('total-losses'),
        winRate: getElement('win-rate'),
        minigameStatsContainer: getElement('minigame-stats-container'),
    };

    const openDB = () => new Promise((resolve, reject) => {
        if (state.db) return resolve(state.db);
        try {
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
            request.onsuccess = (e) => { state.db = e.target.result; resolve(state.db); };
        } catch (error) {
            reject("IndexedDB is not available in this context (e.g., private browsing).");
        }
    });

    const sendDataToServer = (data) => {
        const { ws } = window.tcgAssistant;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'update_user_data', ...data }));
        } else {
            console.error("WebSocket is not connected. Data could not be saved to server.");
        }
    };

    const getDecks = () => window.tcgAssistant.currentUserId ? (window.tcgAssistant.userRegisteredDecks || []) : JSON.parse(localStorage.getItem('registeredDecksLocal') || '[]');
    const saveDecks = (decks) => {
        if (window.tcgAssistant.currentUserId) {
            window.tcgAssistant.userRegisteredDecks = decks;
            sendDataToServer({ registeredDecks: decks });
        } else {
            localStorage.setItem('registeredDecksLocal', JSON.stringify(decks));
        }
    };
    const getRecords = () => window.tcgAssistant.currentUserId ? (window.tcgAssistant.userBattleRecords || []) : JSON.parse(localStorage.getItem('battleRecordsLocal') || '[]');
    const saveRecords = (records) => {
        if (window.tcgAssistant.currentUserId) {
            window.tcgAssistant.userBattleRecords = records;
            sendDataToServer({ battleRecords: records });
        } else {
            localStorage.setItem('battleRecordsLocal', JSON.stringify(records));
        }
    };

    const updateUIRecording = (isRecording) => {
        if (elements.startRecordBtn) elements.startRecordBtn.style.display = isRecording ? 'none' : 'inline-flex';
        if (elements.stopRecordBtn) elements.stopRecordBtn.style.display = isRecording ? 'inline-flex' : 'none';
        if (elements.recordStatus) {
            elements.recordStatus.textContent = isRecording ? "ステータス: 録画中..." : "ステータス: 待機中";
            elements.recordStatus.className = isRecording ? 'record-status-recording' : 'record-status-idle';
        }
    };

    const startRecording = async () => {
        try {
            state.replayStream = await navigator.mediaDevices.getDisplayMedia({ video: { mediaSource: "tab" }, audio: true });
            updateUIRecording(true);
            state.replayStream.getVideoTracks()[0].onended = () => stopRecording();
            state.recordedChunks = [];
            const supportedMimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
            if (!supportedMimeType) throw new Error("このブラウザでサポートされている録画コーデックが見つかりません。");
            
            state.mediaRecorder = new MediaRecorder(state.replayStream, { mimeType: supportedMimeType });
            state.mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) state.recordedChunks.push(event.data); };
            state.mediaRecorder.onstop = saveReplay;
            state.mediaRecorder.start();
        } catch (err) {
            console.error("Error starting recording:", err);
            window.showCustomDialog('録画エラー', `録画を開始できませんでした: ${err.message}`);
            updateUIRecording(false);
        }
    };

    const stopRecording = () => {
        state.mediaRecorder?.stop();
        state.replayStream?.getTracks().forEach(track => track.stop());
        state.replayStream = null;
        updateUIRecording(false);
    };

    const saveReplay = async () => {
        if(elements.recordStatus) elements.recordStatus.textContent = "ステータス: 処理中...";
        if (state.recordedChunks.length === 0) {
            updateUIRecording(false);
            return;
        }
        const replayId = `replay_${Date.now()}`;
        try {
            const db = await openDB();
            const tx = db.transaction([META_STORE_NAME, CHUNKS_STORE_NAME], 'readwrite');
            tx.objectStore(META_STORE_NAME).put({ id: replayId, timestamp: Date.now() });
            for (const chunk of state.recordedChunks) {
                tx.objectStore(CHUNKS_STORE_NAME).add({ replayId, chunk });
            }
            await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = (e) => reject(e.target.error); });
            state.recordedChunks = [];
            await updateReplayList();
            window.showCustomDialog('録画完了', 'リプレイが保存されました。');
        } catch (e) {
            window.showCustomDialog('保存エラー', `リプレイの保存に失敗しました: ${e.message || e}`);
        } finally {
            updateUIRecording(false);
        }
    };

    const updateReplayList = async () => {
        if (!elements.replaysList) return;
        try {
            const db = await openDB();
            const replays = await new Promise((resolve, reject) => {
                const request = db.transaction(META_STORE_NAME, 'readonly').objectStore(META_STORE_NAME).getAll();
                request.onsuccess = () => resolve(request.result.sort((a, b) => b.timestamp - a.timestamp));
                request.onerror = (e) => reject(e.target.error);
            });
            elements.replaysList.innerHTML = replays.length === 0 ? '<li>保存されたリプレイはありません。</li>' : replays.map(replay => `
                <li>
                    <div class="replay-item-info"><strong>${new Date(replay.timestamp).toLocaleString()}</strong></div>
                    <div class="replay-item-actions">
                        <button class="play-replay-button button-style" data-id="${replay.id}"><i class="fas fa-play"></i> 再生</button>
                        <button class="delete-replay-button button-style" data-id="${replay.id}"><i class="fas fa-trash"></i> 削除</button>
                    </div>
                </li>`).join('');
        } catch (error) {
            elements.replaysList.innerHTML = `<li>リプレイリストの読み込みに失敗しました。</li>`;
        }
    };

    const playReplay = async (replayId) => {
        if (!elements.replayPlayerWrapper || !elements.replayVideo) return;
        try {
            const db = await openDB();
            const chunks = await new Promise((resolve, reject) => {
                 const request = db.transaction(CHUNKS_STORE_NAME, 'readonly').objectStore(CHUNKS_STORE_NAME).index('replayId').getAll(replayId);
                 request.onsuccess = () => resolve(request.result.map(r => r.chunk));
                 request.onerror = (e) => reject(e.target.error);
            });
            if (chunks.length === 0) return window.showCustomDialog('エラー', '再生データが見つかりません。');
            
            elements.replayPlayerWrapper.style.display = 'block';
            const blob = new Blob(chunks, { type: chunks[0].type });
            elements.replayVideo.src = URL.createObjectURL(blob);
            elements.replayVideo.play();
        } catch (error) {
            window.showCustomDialog('再生エラー', `リプレイの再生中にエラーが発生しました: ${error.message}`);
        }
    };

    const deleteReplay = async (replayId) => {
        try {
            const db = await openDB();
            const tx = db.transaction([META_STORE_NAME, CHUNKS_STORE_NAME], 'readwrite');
            tx.objectStore(META_STORE_NAME).delete(replayId);
            const index = tx.objectStore(CHUNKS_STORE_NAME).index('replayId');
            const request = index.openKeyCursor(IDBKeyRange.only(replayId));
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    tx.objectStore(CHUNKS_STORE_NAME).delete(cursor.primaryKey);
                    cursor.continue();
                }
            };
            await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = (e) => rej(e.target.error); });
            await updateReplayList();
            window.showCustomDialog('成功', 'リプレイを削除しました。');
        } catch (error) {
            window.showCustomDialog('削除エラー', `リプレイの削除に失敗しました: ${error.message}`);
        }
    };

    const loadRegisteredDecks = async () => {
        const decks = getDecks();
        const sortedDecks = [...decks].sort((a, b) => a.name.localeCompare(b.name));
        if (elements.registeredDecksList) {
            elements.registeredDecksList.innerHTML = sortedDecks.length === 0 ? `<li>まだ登録されたデッキがありません。</li>` : sortedDecks.map(deck => `
                <li>${deck.name} (${deck.type}) <button class="delete-deck-button button-style" data-name="${deck.name}" title="削除"><i class="fas fa-trash-alt"></i></button></li>
            `).join('');
        }
        if (elements.myDeckSelect && elements.opponentDeckSelect) {
            const optionsHtml = sortedDecks.map(deck => `<option value="${deck.name}">${deck.name} (${deck.type})</option>`).join('');
            elements.myDeckSelect.innerHTML = '<option value="">登録済みデッキから選択</option>' + optionsHtml;
            elements.opponentDeckSelect.innerHTML = '<option value="">登録済みデッキから選択</option>' + optionsHtml;
        }
    };

    const loadBattleRecords = async () => {
        const records = getRecords();
        if (elements.battleRecordsList) {
            elements.battleRecordsList.innerHTML = records.length === 0 ? `<li>まだ対戦記録がありません。</li>` : [...records].reverse().map((record, revIdx) => {
                const origIdx = records.length - 1 - revIdx;
                return `<li>
                    <strong>${record.timestamp}</strong><br>
                    自分: ${record.myDeck} vs 相手: ${record.opponentDeck}<br>
                    結果: ${record.result === 'win' ? '勝利' : '敗北'} (${record.firstSecond === 'first' ? '先攻' : '後攻'})
                    <button class="delete-record-button button-style" data-index="${origIdx}" title="削除"><i class="fas fa-trash-alt"></i></button>
                </li>`;
            }).join('');
        }
        calculateAndDisplayStats(records);
    };

    const calculateAndDisplayStats = (records) => {
        if (!elements.statsContainer) return;
        const totalGames = records.length;
        const wins = records.filter(r => r.result === 'win').length;
        elements.totalGames.textContent = totalGames;
        elements.totalWins.textContent = wins;
        elements.totalLosses.textContent = totalGames - wins;
        elements.winRate.textContent = `${totalGames > 0 ? (wins / totalGames * 100).toFixed(1) : '0.0'}%`;
    };

    const displayMinigameStats = async () => {
        const container = elements.minigameStatsContainer;
        if (!container) return;
        const { minigameStats } = await a.storage.local.get({minigameStats: {}});
        const quizTypes = { cardName: 'カード名当て', enlarge: 'イラスト拡大', silhouette: 'シルエット', mosaic: 'モザイク' };
        let html = '<ul>';
        for (const [type, data] of Object.entries(minigameStats)) {
            const total = data.wins + data.losses;
            const winRate = total > 0 ? ((data.wins / total) * 100).toFixed(1) : '0.0';
            const avgHints = data.wins > 0 ? (data.totalHints / data.wins).toFixed(2) : '0.00';
            html += `<li><h4>${quizTypes[type] || type}</h4><p>プレイ回数: ${total}回</p><p>正解率: ${winRate}%</p>${type === 'cardName' ? `<p>平均ヒント数: ${avgHints}個</p>` : ''}</li>`;
        }
        html += '</ul>';
        container.innerHTML = Object.keys(minigameStats).length > 0 ? html : '<p>まだミニゲームのプレイ記録がありません。</p>';
    };

    const setupEventListeners = () => {
        elements.sectionContainer?.addEventListener('click', async (e) => {
            const target = e.target.closest('button');
            if (!target) return;
            const id = target.id;
            const classList = target.classList;

            if (id === 'start-replay-record-button') startRecording();
            else if (id === 'stop-replay-record-button') stopRecording();
            else if (id === 'close-replay-player-button') {
                if(elements.replayPlayerWrapper) elements.replayPlayerWrapper.style.display = 'none';
                if (elements.replayVideo) { elements.replayVideo.pause(); elements.replayVideo.src = ''; }
            }
            else if (classList.contains('play-replay-button')) playReplay(target.dataset.id);
            else if (classList.contains('delete-replay-button')) {
                if (await window.showCustomDialog('確認', 'このリプレイを本当に削除しますか？', true)) deleteReplay(target.dataset.id);
            }
            else if (id === 'register-deck-button') {
                const deckName = elements.newDeckNameInput.value.trim();
                const deckType = elements.newDeckTypeSelect.value;
                if (!deckName || !deckType) return window.showCustomDialog('エラー', 'デッキ名とタイプは必須です。');
                const decks = getDecks();
                if (decks.some(d => d.name === deckName)) return window.showCustomDialog('エラー', '同じ名前のデッキが既に登録されています。');
                saveDecks([...decks, { name: deckName, type: deckType }]);
                window.showCustomDialog('成功', 'デッキを登録しました。');
                elements.newDeckNameInput.value = '';
                await loadRegisteredDecks();
            }
            else if (classList.contains('delete-deck-button')) {
                const deckName = target.dataset.name;
                if (await window.showCustomDialog('確認', `デッキ「${deckName}」を削除しますか？`, true)) {
                    saveDecks(getDecks().filter(d => d.name !== deckName));
                    await loadRegisteredDecks();
                }
            }
            else if (id === 'save-battle-record-button') {
                if (!elements.myDeckSelect.value || !elements.opponentDeckSelect.value || !elements.firstSecondSelect.value) return window.showCustomDialog('エラー', '必須項目を入力してください。');
                const newRecord = { timestamp: new Date().toLocaleString(), myDeck: elements.myDeckSelect.value, opponentDeck: elements.opponentDeckSelect.value, result: elements.winLossSelect.value, firstSecond: elements.firstSecondSelect.value, notes: elements.notesTextarea.value.trim() };
                saveRecords([...getRecords(), newRecord]);
                window.showCustomDialog('成功', '対戦記録を保存しました。');
                elements.notesTextarea.value = '';
                showBattleRecordTab('past-records');
            }
            else if (classList.contains('delete-record-button')) {
                const index = parseInt(target.dataset.index, 10);
                if (await window.showCustomDialog('確認', 'この記録を削除しますか？', true)) {
                    const records = getRecords();
                    if (index >= 0 && index < records.length) {
                        records.splice(index, 1);
                        saveRecords(records);
                        await loadBattleRecords();
                    }
                }
            }
        });
        
        elements.sectionContainer?.querySelectorAll('.battle-record-tab-button').forEach(button => {
            button.addEventListener('click', () => showBattleRecordTab(button.dataset.tab));
        });
    };

    const showBattleRecordTab = (tabId) => {
        elements.sectionContainer?.querySelectorAll('.battle-record-tab-content').forEach(c => c.classList.remove('active'));
        elements.sectionContainer?.querySelectorAll('.battle-record-tab-button').forEach(b => b.classList.remove('active'));
        const targetContent = getElement(`battle-record-tab-${tabId}`);
        const targetButton = elements.sectionContainer?.querySelector(`.battle-record-tab-button[data-tab="${tabId}"]`);
        if (targetContent) targetContent.classList.add('active');
        if (targetButton) targetButton.classList.add('active');

        switch(tabId) {
            case 'replay': updateReplayList(); break;
            case 'deck-management': case 'new-record': loadRegisteredDecks(); break;
            case 'past-records': case 'stats-summary': loadBattleRecords(); break;
            case 'minigame-record': displayMinigameStats(); break;
        }
    };

    setupEventListeners();
    showBattleRecordTab('replay');
}
