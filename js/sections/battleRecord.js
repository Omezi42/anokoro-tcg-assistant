// js/sections/battleRecord.js
export function initialize() {
    if (document.body.dataset.battleRecordInitialized === 'true') {
        const activeTab = document.querySelector('.battle-record-tab-button.active')?.dataset.tab || 'replay';
        showBattleRecordTab(activeTab); // showBattleRecordTab がここで呼び出される可能性があるため、先に定義する
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

    // IndexedDBを開く/初期化する関数
    const openDB = () => new Promise((resolve, reject) => {
        // 常にIndexedDBへの接続を試み、アクティブな接続を確保
        console.log("Attempting to open IndexedDB (fresh attempt)...");
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (e) => {
            const errorMessage = "IndexedDB open error: " + e.target.error.message;
            console.error(errorMessage);
            reject(errorMessage);
        };
        request.onupgradeneeded = (e) => {
            console.log("IndexedDB upgrade needed.");
            const tempDb = e.target.result;
            if (!tempDb.objectStoreNames.contains(META_STORE_NAME)) {
                console.log(`Creating object store: ${META_STORE_NAME}`);
                tempDb.createObjectStore(META_STORE_NAME, { keyPath: 'id' });
            }
            if (!tempDb.objectStoreNames.contains(CHUNKS_STORE_NAME)) {
                console.log(`Creating object store: ${CHUNKS_STORE_NAME}`);
                const store = tempDb.createObjectStore(CHUNKS_STORE_NAME, { autoIncrement: true });
                store.createIndex('replayId', 'replayId', { unique: false });
            }
        };
        request.onsuccess = (e) => {
            state.db = e.target.result;
            console.log("IndexedDB opened successfully.");
            resolve(state.db);
        };
    });

    // ユーザーデータをサーバーに送信する関数
    const sendDataToServer = (data) => {
        const { ws } = window.tcgAssistant;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'update_user_data', ...data }));
        } else {
            console.error("WebSocket is not connected. Data could not be saved to server.");
        }
    };

    // デッキデータを取得する関数
    const getDecks = () => window.tcgAssistant.currentUserId ? (window.tcgAssistant.userRegisteredDecks || []) : JSON.parse(localStorage.getItem('registeredDecksLocal') || '[]');
    // デッキデータを保存する関数
    const saveDecks = (decks) => {
        if (window.tcgAssistant.currentUserId) {
            window.tcgAssistant.userRegisteredDecks = decks;
            sendDataToServer({ registeredDecks: decks });
        } else {
            localStorage.setItem('registeredDecksLocal', JSON.stringify(decks));
        }
    };
    // 対戦記録データを取得する関数
    const getRecords = () => window.tcgAssistant.currentUserId ? (window.tcgAssistant.userBattleRecords || []) : JSON.parse(localStorage.getItem('battleRecordsLocal') || '[]');
    // 対戦記録データを保存する関数
    const saveRecords = (records) => {
        if (window.tcgAssistant.currentUserId) {
            window.tcgAssistant.userBattleRecords = records;
            sendDataToServer({ battleRecords: records });
        } else {
            localStorage.setItem('battleRecordsLocal', JSON.stringify(records));
        }
    };

    // 録画中のUIを更新する関数
    const updateUIRecording = (isRecording) => {
        if (elements.startRecordBtn) elements.startRecordBtn.style.display = isRecording ? 'none' : 'inline-flex';
        if (elements.stopRecordBtn) elements.stopRecordBtn.style.display = isRecording ? 'inline-flex' : 'none';
        if (elements.recordStatus) {
            elements.recordStatus.textContent = isRecording ? "ステータス: 録画中..." : "ステータス: 待機中";
            elements.recordStatus.className = isRecording ? 'record-status-recording' : 'record-status-idle';
        }
    };

    // 録画を開始する関数
    const startRecording = async () => {
        try {
            // displayMediaで現在のタブのみを録画するように設定
            state.replayStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                preferCurrentTab: true, // Firefoxで現在のタブを優先
                systemAudio: 'include' // システム音声を録音に含める
            });
            updateUIRecording(true);
            // 録画が終了した際にストップするようにイベントリスナーを設定
            state.replayStream.getVideoTracks()[0].onended = () => stopRecording();
            state.recordedChunks = []; // 録画チャンクをリセット

            // サポートされているMIMEタイプを検出
            // より一般的なvideo/webmを優先し、コーデック指定はオプションとする
            let mimeType = 'video/webm';
            const preferredMimeType = 'video/webm;codecs=vp9,opus';
            if (MediaRecorder.isTypeSupported(preferredMimeType)) {
                mimeType = preferredMimeType;
            } else if (!MediaRecorder.isTypeSupported(mimeType)) {
                throw new Error("このブラウザでサポートされている録画フォーマットが見つかりません。");
            }
            
            // MediaRecorderのインスタンスを作成
            state.mediaRecorder = new MediaRecorder(state.replayStream, { mimeType: mimeType }); 
            state.mediaRecorder.ondataavailable = (event) => { 
                if (event.data.size > 0) { // データサイズが0より大きい場合のみチャンクを追加
                    state.recordedChunks.push(event.data); 
                    console.log(`[MediaRecorder] Data available: ${event.data.size} bytes. Total chunks: ${state.recordedChunks.length}`);
                } else {
                    console.log("[MediaRecorder] Data available event fired, but data size is 0.");
                }
            };
            state.mediaRecorder.onstop = async () => { // onstopイベントハンドラ内で直接保存処理を実行
                console.log("[MediaRecorder] Recording stopped event fired.");
                if(elements.recordStatus) elements.recordStatus.textContent = "ステータス: 処理中...";
                if (state.recordedChunks.length === 0) {
                    updateUIRecording(false);
                    console.warn("No recorded chunks to save. (Empty array)");
                    window.showCustomDialog('保存エラー', '録画データがありません。短い録画や、ブラウザの許可設定を確認してください。');
                    return;
                }
                console.log(`Recorded chunks length before saving: ${state.recordedChunks.length}`);
                const replayId = `replay_${Date.now()}`;
                try {
                    const db = await openDB();
                    console.log("IndexedDB instance obtained in saveReplay (onstop):", db);
                    if (!db) {
                        console.error("IndexedDB is not available or failed to open, cannot save replay.");
                        window.showCustomDialog('保存エラー', 'データベースに接続できませんでした。');
                        updateUIRecording(false);
                        return;
                    }
                    console.log("Attempting to save replay with db object:", db);
                    const tx = db.transaction([META_STORE_NAME, CHUNKS_STORE_NAME], 'readwrite');
                    console.log("IndexedDB transaction started.");
                    
                    // メタデータを保存
                    tx.objectStore(META_STORE_NAME).put({ id: replayId, timestamp: Date.now(), title: `リプレイ ${new Date().toLocaleString()}` }); // デフォルトタイトルを追加
                    console.log(`Saving replay metadata for ID: ${replayId}`);

                    // 録画チャンクを保存
                    for (const chunk of state.recordedChunks) {
                        tx.objectStore(CHUNKS_STORE_NAME).add({ replayId, chunk });
                    }
                    console.log(`Saving ${state.recordedChunks.length} chunks for replay ID: ${replayId}`);

                    // トランザクションの完了を待機
                    await new Promise((resolve, reject) => { 
                        tx.oncomplete = () => {
                            console.log(`Transaction for replay ID ${replayId} completed successfully.`);
                            resolve();
                        };
                        tx.onerror = (e) => {
                            console.error(`Transaction for replay ID ${replayId} failed:`, e.target.error);
                            reject(e.target.error);
                        };
                    });
                    
                    state.recordedChunks = []; // 保存後にチャンクをクリア
                    await updateReplayList(); // リプレイリストを更新
                    window.showCustomDialog('録画完了', 'リプレイが保存されました。');
                    console.log(`Replay ID ${replayId} saved and list updated.`);
                } catch (e) {
                    console.error("Error saving replay (onstop):", e);
                    window.showCustomDialog('保存エラー', `リプレイの保存に失敗しました: ${e.message || e}`);
                } finally {
                    updateUIRecording(false);
                }
            };
            state.mediaRecorder.onerror = (event) => {
                console.error("[MediaRecorder] Error during recording:", event.error);
                window.showCustomDialog('録画エラー', `録画中にエラーが発生しました: ${event.error.name} - ${event.error.message}`);
                updateUIRecording(false);
            };
            // start()メソッドにtimesliceを直接渡す (コンストラクタで指定済みのため冗長だが、念のため残す)
            state.mediaRecorder.start(); // timesliceはコンストラクタで指定済みなので引数なしで呼ぶ
            console.log("Recording started. MediaRecorder state:", state.mediaRecorder.state);
        } catch (err) {
            console.error("Error starting recording:", err);
            window.showCustomDialog('録画エラー', `録画を開始できませんでした: ${err.message}`);
            updateUIRecording(false);
        }
    };

    // 録画を停止する関数
    const stopRecording = () => {
        if (state.mediaRecorder && state.mediaRecorder.state === "recording") {
            state.mediaRecorder.stop(); // MediaRecorderが録画中であれば停止
        }
        state.replayStream?.getTracks().forEach(track => track.stop()); // すべてのトラックを停止
        state.replayStream = null;
        updateUIRecording(false);
        console.log("Recording stopped.");
    };

    // IndexedDBのカスタム入力ダイアログを表示する関数 (battleRecord.js内でのみ使用)
    const showLocalCustomInputDialog = (title, message, defaultValue = '') => {
        return new Promise((resolve) => {
            const overlay = document.getElementById('tcg-custom-dialog-overlay');
            if (!overlay) {
                console.error("Custom dialog overlay not found.");
                return resolve(null);
            }
            const dialogTitle = overlay.querySelector('#tcg-dialog-title');
            const dialogMessage = overlay.querySelector('#tcg-dialog-message');
            const buttonsWrapper = overlay.querySelector('#tcg-dialog-buttons');

            dialogTitle.textContent = title;
            // メッセージと入力フィールドをHTMLとして設定
            dialogMessage.innerHTML = `<p>${message}</p><input type="text" id="tcg-dialog-input" value="${defaultValue}" style="width: calc(100% - 24px); padding: 10px; margin-top: 10px; border: 1px solid var(--color-border); border-radius: 8px;">`;
            
            const inputElement = dialogMessage.querySelector('#tcg-dialog-input');

            buttonsWrapper.innerHTML = ''; // 既存のボタンをクリア
            const okButton = document.createElement('button');
            okButton.textContent = 'OK';
            okButton.onclick = () => { 
                overlay.classList.remove('show'); 
                resolve(inputElement.value); 
                // ダイアログを閉じた後に、入力フィールドをクリーンアップ
                dialogMessage.innerHTML = ''; 
            };
            buttonsWrapper.appendChild(okButton);

            const cancelButton = document.createElement('button');
            cancelButton.textContent = 'キャンセル';
            cancelButton.onclick = () => { 
                overlay.classList.remove('show'); 
                resolve(null); 
                // ダイアログを閉じた後に、入力フィールドをクリーンアップ
                dialogMessage.innerHTML = ''; 
            };
            buttonsWrapper.appendChild(cancelButton);

            overlay.classList.add('show');
            inputElement.focus(); // 入力フィールドにフォーカス
            inputElement.select(); // デフォルトテキストを選択して編集しやすくする
        });
    };

    // リプレイの名前を変更する関数
    const renameReplay = async (replayId) => {
        try {
            const db = await openDB();
            const tx = db.transaction(META_STORE_NAME, 'readwrite');
            const store = tx.objectStore(META_STORE_NAME);
            const request = store.get(replayId);

            request.onsuccess = async (event) => {
                const replay = event.target.result;
                if (replay) {
                    const newTitle = await showLocalCustomInputDialog('リプレイ名の変更', '新しいリプレイ名を入力してください:', replay.title || '');
                    if (newTitle !== null && newTitle.trim() !== '') {
                        replay.title = newTitle.trim();
                        const updateRequest = store.put(replay);
                        updateRequest.onsuccess = async () => {
                            console.log(`Replay ID ${replayId} renamed to: ${newTitle}`);
                            await updateReplayList();
                            window.showCustomDialog('成功', 'リプレイ名を変更しました。');
                        };
                        updateRequest.onerror = (e) => {
                            console.error("Error updating replay title in DB:", e.target.error);
                            window.showCustomDialog('エラー', `リプレイ名の変更に失敗しました: ${e.target.error.message}`);
                        };
                    } else if (newTitle !== null) { // OKが押されたが空の場合
                        window.showCustomDialog('エラー', 'リプレイ名は空にできません。');
                    }
                } else {
                    window.showCustomDialog('エラー', '指定されたリプレイが見つかりません。');
                }
            };
            request.onerror = (e) => {
                console.error("Error fetching replay for rename:", e.target.error);
                window.showCustomDialog('エラー', `リプレイの取得に失敗しました: ${e.target.error.message}`);
            };
        } catch (error) {
            console.error("Error in renameReplay function:", error);
            window.showCustomDialog('エラー', `リプレイ名の変更中にエラーが発生しました: ${error.message}`);
        }
    };


    // リプレイリストを更新する関数
    const updateReplayList = async () => {
        if (!elements.replaysList) return;
        try {
            const db = await openDB(); // IndexedDBを開く
            if (!db) {
                console.error("IndexedDB is not available for updateReplayList.");
                elements.replaysList.innerHTML = `<li>リプレイリストの読み込みに失敗しました。（DB接続エラー）</li>`;
                return;
            }
            const replays = await new Promise((resolve, reject) => {
                const request = db.transaction(META_STORE_NAME, 'readonly').objectStore(META_STORE_NAME).getAll();
                request.onsuccess = () => {
                    const result = request.result.sort((a, b) => b.timestamp - a.timestamp);
                    console.log("Fetched replays metadata:", result); // 取得したメタデータをログ出力
                    resolve(result);
                };
                request.onerror = (e) => {
                    console.error("Error fetching replays metadata:", e.target.error);
                    reject(e.target.error);
                };
            });
            // リプレイリストのHTMLを生成
            elements.replaysList.innerHTML = replays.length === 0 ? '<li>保存されたリプレイはありません。</li>' : replays.map(replay => `
                <li>
                    <div class="replay-item-info"><strong>${replay.title || new Date(replay.timestamp).toLocaleString()}</strong></div>
                    <div class="replay-item-actions">
                        <button class="play-replay-button button-style" data-id="${replay.id}"><i class="fas fa-play"></i> 再生</button>
                        <button class="rename-replay-button button-style" data-id="${replay.id}"><i class="fas fa-edit"></i> 名前変更</button>
                        <button class="delete-replay-button button-style" data-id="${replay.id}"><i class="fas fa-trash"></i> 削除</button>
                    </div>
                </li>`).join('');
            console.log("Replay list updated on UI.");
        }
        catch (error) {
            console.error("Error updating replay list:", error);
            elements.replaysList.innerHTML = `<li>リプレイリストの読み込みに失敗しました。</li>`;
        }
    };

    // リプレイを再生する関数
    const playReplay = async (replayId) => {
        if (!elements.replayPlayerWrapper || !elements.replayVideo) return;
        try {
            const db = await openDB();
            if (!db) {
                console.error("IndexedDB is not available for playReplay.");
                window.showCustomDialog('再生エラー', 'データベースに接続できませんでした。');
                return;
            }
            const chunks = await new Promise((resolve, reject) => {
                 // replayIdインデックスを使用してチャンクを取得
                 const request = db.transaction(CHUNKS_STORE_NAME, 'readonly').objectStore(CHUNKS_STORE_NAME).index('replayId').getAll(replayId);
                 request.onsuccess = () => resolve(request.result.map(r => r.chunk));
                 request.onerror = (e) => reject(e.target.error);
            });
            if (chunks.length === 0) {
                window.showCustomDialog('エラー', '再生データが見つかりません。');
                console.warn(`No chunks found for replay ID: ${replayId}`);
                return;
            }
            
            elements.replayPlayerWrapper.style.display = 'block';
            // チャンクからBlobを作成し、ビデオ要素のソースに設定
            const blob = new Blob(chunks, { type: chunks[0].type });
            elements.replayVideo.src = URL.createObjectURL(blob);
            elements.replayVideo.play();
            console.log(`Playing replay ID: ${replayId}`);
        } catch (error) {
            console.error("Error playing replay:", error);
            window.showCustomDialog('再生エラー', `リプレイの再生中にエラーが発生しました: ${e.message}`);
        }
    };

    // リプレイを削除する関数
    const deleteReplay = async (replayId) => {
        try {
            const db = await openDB();
            const tx = db.transaction([META_STORE_NAME, CHUNKS_STORE_NAME], 'readwrite');
            
            // メタデータを削除
            tx.objectStore(META_STORE_NAME).delete(replayId);
            console.log(`Deleting replay metadata for ID: ${replayId}`);

            // チャンクを削除
            const index = tx.objectStore(CHUNKS_STORE_NAME).index('replayId');
            const request = index.openKeyCursor(IDBKeyRange.only(replayId));
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    tx.objectStore(CHUNKS_STORE_NAME).delete(cursor.primaryKey);
                    cursor.continue();
                }
            };
            
            await new Promise((res, rej) => { 
                tx.oncomplete = () => {
                    console.log(`Transaction for deleting replay ID ${replayId} completed.`);
                    res();
                };
                tx.onerror = (e) => {
                    console.error(`Transaction for deleting replay ID ${replayId} failed:`, e.target.error);
                    rej(e.target.error);
                };
            });
            await updateReplayList(); // 削除後にリストを更新
            window.showCustomDialog('成功', 'リプレイを削除しました。');
            console.log(`Replay ID ${replayId} deleted and list updated.`);
        } catch (error) {
            console.error("Error deleting replay:", error);
            window.showCustomDialog('削除エラー', `リプレイの削除に失敗しました: ${e.message}`);
        }
    };

    // 登録済みデッキをロードする関数
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

    // 対戦記録をロードする関数
    const loadBattleRecords = async () => {
        const records = getRecords();
        if (elements.battleRecordsList) {
            elements.battleRecordsList.innerHTML = records.length === 0 ? `<li>まだ対戦記録がありません。</li>` : [...records].reverse().map((record, revIdx) => {
                const origIdx = records.length - 1 - revIdx; // 元のインデックスを計算
                return `<li>
                    <strong>${record.timestamp}</strong><br>
                    自分: ${record.myDeck} vs 相手: ${record.opponentDeck}<br>
                    結果: ${record.result === 'win' ? '勝利' : '敗北'} (${record.firstSecond === 'first' ? '先攻' : '後攻'})
                    <button class="delete-record-button button-style" data-index="${origIdx}" title="削除"><i class="fas fa-trash-alt"></i></button>
                </li>`;
            }).join('');
        }
        calculateAndDisplayStats(records); // 統計情報を計算して表示
    };

    // 統計情報を計算して表示する関数
    const calculateAndDisplayStats = (records) => {
        if (!elements.statsContainer) return;
        const totalGames = records.length;
        const wins = records.filter(r => r.result === 'win').length;
        const firstWins = records.filter(r => r.firstSecond === 'first' && r.result === 'win').length;
        const firstGames = records.filter(r => r.firstSecond === 'first').length;
        const secondWins = records.filter(r => r.firstSecond === 'second' && r.result === 'win').length;
        const secondGames = records.filter(r => r.firstSecond === 'second').length;

        elements.totalGames.textContent = totalGames;
        elements.totalWins.textContent = wins;
        elements.totalLosses.textContent = totalGames - wins;
        elements.winRate.textContent = `${totalGames > 0 ? (wins / totalGames * 100).toFixed(1) : '0.0'}%`;
        elements.firstWinRate.textContent = `${firstGames > 0 ? (firstWins / firstGames * 100).toFixed(1) : '0.0'}%`;
        elements.secondWinRate.textContent = `${secondGames > 0 ? (secondWins / secondGames * 100).toFixed(1) : '0.0'}%`;

        // デッキタイプ別勝率の計算と表示 (自分のデッキ)
        const myDeckWinRates = {};
        records.forEach(record => {
            if (!myDeckWinRates[record.myDeck]) {
                myDeckWinRates[record.myDeck] = { wins: 0, total: 0 };
            }
            myDeckWinRates[record.myDeck].total++;
            if (record.result === 'win') {
                myDeckWinRates[record.myDeck].wins++;
            }
        });
        const myDeckRatesHtml = Object.entries(myDeckWinRates).map(([deckName, stats]) => {
            const rate = stats.total > 0 ? (stats.wins / stats.total * 100).toFixed(1) : '0.0';
            return `<p>${deckName}: ${rate}% (${stats.wins}勝/${stats.total}戦)</p>`;
        }).join('');
        const myDeckTypeWinRatesDiv = getElement('my-deck-type-win-rates');
        if (myDeckTypeWinRatesDiv) myDeckTypeWinRatesDiv.innerHTML = myDeckRatesHtml || '<p>データなし</p>';

        // デッキタイプ別勝率の計算と表示 (相手のデッキ)
        const opponentDeckWinRates = {};
        records.forEach(record => {
            if (!opponentDeckWinRates[record.opponentDeck]) {
                opponentDeckWinRates[record.opponentDeck] = { wins: 0, total: 0 };
            }
            opponentDeckWinRates[record.opponentDeck].total++;
            if (record.result === 'lose') { // 相手のデッキタイプに対する自分の勝利
                opponentDeckWinRates[record.opponentDeck].wins++;
            }
        });
        const opponentDeckRatesHtml = Object.entries(opponentDeckWinRates).map(([deckName, stats]) => {
            const rate = stats.total > 0 ? (stats.wins / stats.total * 100).toFixed(1) : '0.0';
            return `<p>${deckName}: ${rate}% (${stats.wins}勝/${stats.total}戦)</p>`;
        }).join('');
        const opponentDeckTypeWinRatesDiv = getElement('opponent-deck-type-win-rates');
        if (opponentDeckTypeWinRatesDiv) opponentDeckTypeWinRatesDiv.innerHTML = opponentDeckRatesHtml || '<p>データなし</p>';
    };

    // ミニゲームの統計情報を表示する関数
    const displayMinigameStats = async () => {
        const container = elements.minigameStatsContainer;
        if (!container) return;
        // ローカルストレージからミニゲームの統計データを取得
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

    // イベントリスナーを設定する関数
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
            else if (classList.contains('rename-replay-button')) renameReplay(target.dataset.id); // 名前変更ボタンのイベントハンドラを追加
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
                showBattleRecordTab('past-records'); // 記録保存後、過去の記録タブに切り替える
            }
            else if (classList.contains('delete-record-button')) {
                const index = parseInt(target.dataset.index, 10);
                if (await window.showCustomDialog('確認', 'この記録を削除しますか？', true)) {
                    const records = getRecords();
                    if (index >= 0 && index < records.length) {
                        records.splice(index, 1);
                        saveRecords(records);
                        await loadBattleRecords(); // 削除後にリストを再ロード
                    }
                }
            }
        });
        
        // タブボタンのイベントリスナーを設定
        elements.sectionContainer?.querySelectorAll('.battle-record-tab-button').forEach(button => {
            button.addEventListener('click', () => showBattleRecordTab(button.dataset.tab));
        });
    };

    // タブを切り替える関数
    const showBattleRecordTab = (tabId) => {
        elements.sectionContainer?.querySelectorAll('.battle-record-tab-content').forEach(c => c.classList.remove('active'));
        elements.sectionContainer?.querySelectorAll('.battle-record-tab-button').forEach(b => b.classList.remove('active'));
        const targetContent = getElement(`battle-record-tab-${tabId}`);
        const targetButton = elements.sectionContainer?.querySelector(`.battle-record-tab-button[data-tab="${tabId}"]`);
        if (targetContent) targetContent.classList.add('active');
        if (targetButton) targetButton.classList.add('active');

        // タブが切り替わった際に、各タブのデータをロード
        switch(tabId) {
            case 'replay': updateReplayList(); break;
            case 'deck-management': case 'new-record': loadRegisteredDecks(); break;
            case 'past-records': case 'stats-summary': loadBattleRecords(); break;
            case 'minigame-record': displayMinigameStats(); break;
        }
    };

    // 初期化処理
    setupEventListeners();
    showBattleRecordTab('replay'); // 初期表示はリプレイタブ
}

