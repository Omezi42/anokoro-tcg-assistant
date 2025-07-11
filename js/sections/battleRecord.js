// js/sections/battleRecord.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initBattleRecordSection = async function() {
    console.log("BattleRecord section initialized.");

    // Firefox互換性のためのbrowserオブジェクトのフォールバック
    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    // === 戦いの記録セクションのロジック ===
    // 各要素を関数内で取得
    const myDeckSelect = document.getElementById('my-deck-select');
    const opponentDeckSelect = document.getElementById('opponent-deck-select');
    const winLossSelect = document.getElementById('win-loss-select');
    const firstSecondSelect = document.getElementById('first-second-select');
    const notesTextarea = document.getElementById('notes-textarea');
    const saveBattleRecordButton = document.getElementById('save-battle-record-button');

    const selectedDeckForStats = document.getElementById('selected-deck-for-stats'); 
    const selectedDeckStatsDetail = document.getElementById('selected-deck-stats-detail');

    const newDeckNameInput = document.getElementById('new-deck-name');
    const newDeckTypeSelect = document.getElementById('new-deck-type');
    const registerDeckButton = document.getElementById('register-deck-button');

    let battleRecordTabButtons = document.querySelectorAll('.battle-record-tab-button');
    let battleRecordTabContents = document.querySelectorAll('.battle-record-tab-content');

    // ユーザーのデータ (rateMatch.jsからログイン時にセットされることを期待)
    // window.userBattleRecords と window.userRegisteredDecks は main.js で初期化される

    /**
     * 戦績をロードして集計を更新する関数 (サーバーから、または未ログイン時はローカルから)
     */
    const loadBattleRecords = () => {
        const battleRecordsList = document.getElementById('battle-records-list');
        if (!battleRecordsList) return;

        let records;
        if (!window.currentUserId) {
            console.log("BattleRecord: Not logged in. Displaying local battle record data (if any).");
            browser.storage.local.get(['battleRecordsLocal'], (result) => {
                records = result.battleRecordsLocal || [];
                displayBattleRecords(records, false); // ローカルストレージからの表示
                calculateAndDisplayStats(records, window.userRegisteredDecks || []); // ローカルデータで統計も更新
            });
            return;
        }

        console.log("BattleRecord: Logged in. Loading battle records from server data.");
        records = window.userBattleRecords || []; // ログイン時にrateMatch.jsからセットされたデータを使用
        displayBattleRecords(records, true); // サーバーからの表示
        calculateAndDisplayStats(records, window.userRegisteredDecks || []); // サーバーデータで統計も更新
    };

    /**
     * 戦績をUIに表示するヘルパー関数
     * @param {Array<Object>} records - 表示する対戦記録の配列
     * @param {boolean} isServerData - サーバーデータかどうか (表示メッセージ用)
     */
    const displayBattleRecords = (records, isServerData) => {
        const battleRecordsList = document.getElementById('battle-records-list');
        if (!battleRecordsList) return;

        battleRecordsList.innerHTML = '';

        if (records.length === 0) {
            battleRecordsList.innerHTML = `<li>まだ対戦記録がありません。${isServerData ? '(ログイン済み)' : '(ローカル)'}</li>`;
        } else {
            // 最新が上に来るように逆順に表示するが、data-indexは元の配列のインデックスを保持
            [...records].reverse().forEach((record, reverseIndex) => {
                // 元の配列におけるインデックスを計算
                const originalIndex = records.length - 1 - reverseIndex;
                const listItem = document.createElement('li');
                listItem.className = 'battle-record-item';
                listItem.innerHTML = `
                        <strong>${record.timestamp}</strong><br>
                        自分のデッキ: ${record.myDeck} (${record.myDeckType || '不明'})<br>
                        相手のデッキ: ${record.opponentDeck} (${record.opponentDeckType || '不明'})<br>
                        結果: ${record.result === 'win' ? '勝利' : '敗北'} (${record.firstSecond === 'first' ? '先攻' : record.firstSecond === 'second' ? '後攻' : '不明'})<br>
                        ${record.notes ? `メモ: ${record.notes}<br>` : ''}
                        <button class="delete-button" data-index="${originalIndex}" title="削除"><i class="fas fa-trash-alt"></i></button>
                    `;
                battleRecordsList.appendChild(listItem);
            });

            battleRecordsList.querySelectorAll('.delete-button').forEach(button => {
                button.removeEventListener('click', handleDeleteBattleRecordClick); // 既存のリスナーを削除
                button.addEventListener('click', handleDeleteBattleRecordClick);
            });
        }
    };

    /**
     * 統計情報を計算して表示する関数
     * @param {Array<Object>} records - 対戦記録の配列
     * @param {Array<Object>} registeredDecks - 登録済みデッキの配列
     */
    const calculateAndDisplayStats = (records, registeredDecks) => {
        const totalGamesSpan = document.getElementById('total-games');
        const totalWinsSpan = document.getElementById('total-wins');
        const totalLossesSpan = document.getElementById('total-losses');
        const winRateSpan = document.getElementById('win-rate');
        const firstWinRateSpan = document.getElementById('first-win-rate');
        const secondWinRateSpan = document.getElementById('second-win-rate');
        const myDeckTypeWinRatesDiv = document.getElementById('my-deck-type-win-rates');
        const opponentDeckTypeWinRatesDiv = document.getElementById('opponent-deck-type-win-rates');

        let totalGames = records.length;
        let totalWins = 0;
        let totalLosses = 0;
        let firstGames = 0;
        let firstWins = 0;
        let secondGames = 0;
        let secondWins = 0;
        const myDeckTypeStats = {};
        const opponentDeckTypeStats = {};

        records.forEach(record => {
            if (record.result === 'win') {
                totalWins++;
            } else {
                totalLosses++;
            }

            if (record.firstSecond === 'first') {
                firstGames++;
                if (record.result === 'win') {
                    firstWins++;
                }
            } else if (record.firstSecond === 'second') {
                secondGames++;
                if (record.result === 'win') {
                    secondWins++;
                }
            }

            if (record.myDeckType) {
                if (!myDeckTypeStats[record.myDeckType]) {
                    myDeckTypeStats[record.myDeckType] = { total: 0, wins: 0 };
                }
                myDeckTypeStats[record.myDeckType].total++;
                if (record.result === 'win') {
                    myDeckTypeStats[record.myDeckType].wins++;
                }
            }

            if (record.opponentDeckType) {
                if (!opponentDeckTypeStats[record.opponentDeckType]) {
                    opponentDeckTypeStats[record.opponentDeckType] = { total: 0, wins: 0 };
                }
                opponentDeckTypeStats[record.opponentDeckType].total++;
                if (record.result === 'win') {
                    opponentDeckTypeStats[record.opponentDeckType].wins++;
                }
            }
        });

        if (totalGamesSpan) totalGamesSpan.textContent = totalGames;
        if (totalWinsSpan) totalWinsSpan.textContent = totalWins;
        if (totalLossesSpan) totalLossesSpan.textContent = totalLosses;
        if (winRateSpan) winRateSpan.textContent = totalGames > 0 ? `${(totalWins / totalGames * 100).toFixed(2)}%` : '0.00%';
        if (firstWinRateSpan) firstWinRateSpan.textContent = firstGames > 0 ? `${(firstWins / firstGames * 100).toFixed(2)}%` : '0.00%';
        if (secondWinRateSpan) secondWinRateSpan.textContent = secondGames > 0 ? `${(secondWins / secondGames * 100).toFixed(2)}%` : '0.00%';

        let myDeckTypeHtml = '<ul>';
        const sortedMyDeckTypes = Object.keys(myDeckTypeStats).sort();
        if (sortedMyDeckTypes.length === 0) {
            myDeckTypeHtml += '<li>データがありません。</li>';
        } else {
            sortedMyDeckTypes.forEach(type => {
                const stats = myDeckTypeStats[type];
                const rate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(2) : '0.00';
                myDeckTypeHtml += `<li>${type}: ${rate}% (${stats.wins} / ${stats.total})</li>`;
            });
        }
        myDeckTypeHtml += '</ul>';
        if (myDeckTypeWinRatesDiv) myDeckTypeWinRatesDiv.innerHTML = myDeckTypeHtml;

        let opponentDeckTypeHtml = '<ul>';
        const sortedOpponentDeckTypes = Object.keys(opponentDeckTypeStats).sort();
        if (sortedOpponentDeckTypes.length === 0) {
            opponentDeckTypeHtml += '<li>データがありません。</li>';
        } else {
            sortedOpponentDeckTypes.forEach(type => {
                const stats = opponentDeckTypeStats[type];
                const rate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(2) : '0.00';
                opponentDeckTypeHtml += `<li>${type}: ${rate}% (${stats.wins} / ${stats.total})</li>`;
            });
        }
        opponentDeckTypeHtml += '</ul>';
        if (opponentDeckTypeWinRatesDiv) opponentDeckTypeWinRatesDiv.innerHTML = opponentDeckTypeHtml;
        
        updateSelectedDeckStatsDropdown(registeredDecks); // ドロップダウンも更新
    };

    /**
     * 戦績データをサーバーに保存します。
     * @param {Array<Object>} recordsToSave - 保存する対戦記録の配列。
     */
    const saveBattleRecordsToServer = async (recordsToSave) => {
        // ログイン状態とWebSocket接続を確認
        if (!window.currentUserId || !window.ws || window.ws.readyState !== WebSocket.OPEN) {
            console.warn("BattleRecord: Not logged in or WebSocket not open. Cannot save battle records to server.");
            await window.showCustomDialog('エラー', 'ログインしていないか、サーバーに接続していません。対戦記録は保存されませんでした。');
            return;
        }
        window.userBattleRecords = recordsToSave; // グローバルデータを更新
        window.ws.send(JSON.stringify({
            type: 'update_user_data',
            userId: window.currentUserId,
            battleRecords: window.userBattleRecords
        }));
        await window.showCustomDialog('保存完了', '対戦記録をサーバーに保存しました！');
        loadBattleRecords(); // UIを再ロード
    };

    /**
     * 戦績データをローカルストレージに保存します (未ログイン時用)。
     * @param {Array<Object>} recordsToSave - 保存する対戦記録の配列。
     */
    const saveBattleRecordsLocally = (recordsToSave) => {
        browser.storage.local.set({ battleRecordsLocal: recordsToSave }, () => {
            window.showCustomDialog('保存完了', '対戦記録をローカルに保存しました！');
            loadBattleRecords();
        });
    };

    /**
     * 対戦記録を削除します (ログイン状態に応じてサーバーまたはローカル)。
     * @param {number} index - 削除する記録のインデックス。
     */
    const deleteBattleRecord = async (index) => {
        let records;
        if (window.currentUserId) {
            records = window.userBattleRecords || []; // サーバーデータ優先
        } else {
            const result = await browser.storage.local.get(['battleRecordsLocal']);
            records = result.battleRecordsLocal || [];
        }

        if (index > -1 && index < records.length) {
            records.splice(index, 1);
            if (window.currentUserId) {
                await saveBattleRecordsToServer(records);
            } else {
                saveBattleRecordsLocally(records);
            }
            // showCustomDialog は saveBattleRecordsToServer/Locally から呼ばれる
        }
    };

    /**
     * 登録済みデッキをロードして表示する関数 (サーバーから、または未ログイン時はローカルから)
     */
    const loadRegisteredDecks = () => {
        const registeredDecksList = document.getElementById('registered-decks-list');
        const myDeckSelect = document.getElementById('my-deck-select');
        const opponentDeckSelect = document.getElementById('opponent-deck-select');

        if (!registeredDecksList || !myDeckSelect || !opponentDeckSelect) return;

        let decks;
        if (!window.currentUserId) {
            console.log("BattleRecord: Not logged in. Displaying local registered decks (if any).");
            browser.storage.local.get(['registeredDecksLocal'], (result) => {
                decks = result.registeredDecksLocal || [];
                displayRegisteredDecks(decks, myDeckSelect, opponentDeckSelect, false);
            });
            return;
        }

        console.log("BattleRecord: Logged in. Loading registered decks from server data.");
        decks = window.userRegisteredDecks || []; // ログイン時にrateMatch.jsからセットされたデータを使用
        displayRegisteredDecks(decks, myDeckSelect, opponentDeckSelect, true);
    };

    /**
     * 登録済みデッキをUIに表示するヘルパー関数
     * @param {Array<Object>} decks - 表示するデッキの配列。
     * @param {HTMLElement} myDeckSelect - 自分のデッキ選択ドロップダウン。
     * @param {HTMLElement} opponentDeckSelect - 相手のデッキ選択ドロップダウン。
     * @param {boolean} isServerData - サーバーデータかどうか (表示メッセージ用)。
     */
    const displayRegisteredDecks = (decks, myDeckSelect, opponentDeckSelect, isServerData) => {
        const registeredDecksList = document.getElementById('registered-decks-list');
        if (!registeredDecksList || !myDeckSelect || !opponentDeckSelect) return;

        registeredDecksList.innerHTML = '';
        myDeckSelect.innerHTML = '<option value="">登録済みデッキから選択</option>';
        opponentDeckSelect.innerHTML = '<option value="">登録済みデッキから選択</option>';

        if (decks.length === 0) {
            registeredDecksList.innerHTML = `<li>まだ登録されたデッキがありません。${isServerData ? '(ログイン済み)' : '(ローカル)'}</li>`;
        } else {
            decks.sort((a, b) => a.name.localeCompare(b.name)).forEach((deck, index) => {
                const listItem = document.createElement('li');
                listItem.innerHTML = `
                    ${deck.name} (${deck.type}) 
                    <button class="delete-registered-deck-button" data-index="${index}" title="削除"><i class="fas fa-trash-alt"></i></button>
                `;
                registeredDecksList.appendChild(listItem);

                const optionMy = document.createElement('option');
                optionMy.value = deck.name;
                optionMy.textContent = `${deck.name} (${deck.type})`;
                myDeckSelect.appendChild(optionMy);

                const optionOpponent = document.createElement('option');
                optionOpponent.value = deck.name;
                optionOpponent.textContent = `${deck.name} (${deck.type})`;
                opponentDeckSelect.appendChild(optionOpponent);
            });

            registeredDecksList.querySelectorAll('.delete-registered-deck-button').forEach(button => {
                button.removeEventListener('click', handleDeleteRegisteredDeckClick); // 既存のリスナーを削除
                button.addEventListener('click', handleDeleteRegisteredDeckClick);
            });
        }
        updateSelectedDeckStatsDropdown(decks); // デッキ選択ドロップダウンも更新
    };

    /**
     * 登録済みデッキデータをサーバーに保存します。
     * @param {Array<Object>} decksToSave - 保存する登録デッキの配列。
     */
    const saveRegisteredDecksToServer = async (decksToSave) => {
        // ログイン状態とWebSocket接続を確認
        if (!window.currentUserId || !window.ws || window.ws.readyState !== WebSocket.OPEN) {
            console.warn("BattleRecord: Not logged in or WebSocket not open. Cannot save registered decks to server.");
            await window.showCustomDialog('エラー', 'ログインしていないか、サーバーに接続していません。デッキは保存されませんでした。');
            return;
        }
        window.userRegisteredDecks = decksToSave; // グローバルデータを更新
        window.ws.send(JSON.stringify({
            type: 'update_user_data',
            userId: window.currentUserId,
            registeredDecks: window.userRegisteredDecks
        }));
        await window.showCustomDialog('登録完了', 'デッキをサーバーに登録しました！');
        loadRegisteredDecks(); // UIを再ロード
    };

    /**
     * 登録済みデッキデータをローカルストレージに保存します (未ログイン時用)。
     * @param {Array<Object>} decksToSave - 保存する登録デッキの配列。
     */
    const saveRegisteredDecksLocally = (decksToSave) => {
        browser.storage.local.set({ registeredDecksLocal: decksToSave }, () => {
            window.showCustomDialog('登録完了', 'デッキをローカルに登録しました！');
            loadRegisteredDecks();
        });
    };

    /**
     * 登録済みデッキを削除します (ログイン状態に応じてサーバーまたはローカル)。
     * @param {number} index - 削除するデッキのインデックス。
     */
    const deleteRegisteredDeck = async (index) => {
        let decks;
        if (window.currentUserId) {
            decks = window.userRegisteredDecks || []; // サーバーデータ優先
        } else {
            const result = await browser.storage.local.get(['registeredDecksLocal']);
            decks = result.registeredDecksLocal || [];
        }

        if (index > -1 && index < decks.length) {
            decks.splice(index, 1);
            if (window.currentUserId) {
                await saveRegisteredDecksToServer(decks);
            } else {
                saveRegisteredDecksLocally(decks);
            }
            // showCustomDialog は saveRegisteredDecksToServer/Locally から呼ばれる
            loadBattleRecords(); // 統計情報も更新されるように
        }
    };

    /**
     * デッキ別詳細分析のドロップダウンを更新
     * @param {Array<Object>} registeredDecks - 登録済みデッキの配列。
     */
    const updateSelectedDeckStatsDropdown = (registeredDecks) => {
        const selectedDeckForStats = document.getElementById('selected-deck-for-stats');
        if (!selectedDeckForStats) return;

        selectedDeckForStats.innerHTML = '<option value="">全てのデッキ</option>';
        registeredDecks.sort((a, b) => a.name.localeCompare(b.name)).forEach(deck => {
            const option = document.createElement('option');
            option.value = deck.name;
            option.textContent = `${deck.name} (${deck.type})`;
            selectedDeckForStats.appendChild(option);
        });
        displaySelectedDeckStats(selectedDeckForStats.value);
    };

    /**
     * 選択されたデッキの詳細な勝率を表示
     * @param {string} deckName - 選択されたデッキ名。
     */
    const displaySelectedDeckStats = (deckName) => {
        const records = window.userBattleRecords || []; // サーバーデータ優先
        const selectedDeckStatsDetail = document.getElementById('selected-deck-stats-detail');
        if (!selectedDeckStatsDetail) return;

        let html = '';

        if (!deckName) {
            selectedDeckStatsDetail.innerHTML = '<p>デッキを選択して詳細な勝率を表示します。</p>';
            return;
        }

        const gamesAsMyDeck = records.filter(record => record.myDeck === deckName);
        const gamesAsOpponentDeck = records.filter(record => record.opponentDeck === deckName);

        let myDeckTotal = gamesAsMyDeck.length;
        let myDeckWins = gamesAsMyDeck.filter(record => record.result === 'win').length;
        let myDeckWinRate = myDeckTotal > 0 ? ((myDeckWins / myDeckTotal) * 100).toFixed(2) : '0.00';

        html += `<h4>「${deckName}」の統計 (自分のデッキとして使用時)</h4>`;
        html += `<p>総対戦数: ${myDeckTotal}</p>`;
        html += `<p>勝利数: ${myDeckWins}</p>`;
        html += `<p>勝率: ${myDeckWinRate}%</p>`;

        if (myDeckTotal > 0) {
            html += `<h5>相手デッキタイプ別勝率</h5><ul>`;
            const opponentTypes = {};
            gamesAsMyDeck.forEach(record => {
                if (!opponentTypes[record.opponentDeckType]) {
                    opponentTypes[record.opponentDeckType] = { total: 0, wins: 0 };
                }
                opponentTypes[record.opponentDeckType].total++;
                if (record.result === 'win') {
                    opponentTypes[record.opponentDeckType].wins++;
                }
            });
            for (const type in opponentTypes) {
                const stats = opponentTypes[type];
                const rate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(2) : '0.00';
                html += `<li>vs ${type}: ${rate}% (${stats.wins}勝 / ${stats.total}戦)</li>`;
            }
            html += `</ul>`;
        }

        let opponentDeckTotal = gamesAsOpponentDeck.length;
        let opponentDeckWins = gamesAsOpponentDeck.filter(record => record.result === 'win').length; // 相手が勝った数 (自分が負けた数)
        let opponentDeckLosses = gamesAsOpponentDeck.filter(record => record.result === 'lose').length; // 相手が負けた数 (自分が勝った数)
        let opponentDeckWinRate = opponentDeckTotal > 0 ? ((opponentDeckWins / opponentDeckTotal) * 100).toFixed(2) : '0.00';

        html += `<h4>「${deckName}」の統計 (相手のデッキとして使用時)</h4>`;
        html += `<p>総対戦数: ${opponentDeckTotal}</p>`;
        html += `<p>相手勝利数: ${opponentDeckWins} (自分が負けた数)</p>`;
        html += `<p>相手勝率: ${opponentDeckWinRate}%</p>`;
        // ここにさらに詳細な分析を追加することも可能

        selectedDeckStatsDetail.innerHTML = html;
    };

    // タブ切り替え関数
    function showBattleRecordTab(tabId) {
        // 関数内で要素を再取得
        battleRecordTabButtons = document.querySelectorAll('.battle-record-tab-button');
        battleRecordTabContents = document.querySelectorAll('.battle-record-tab-content');

        if (!battleRecordTabButtons.length || !battleRecordTabContents.length) return;

        battleRecordTabButtons.forEach(button => {
            if (button.dataset.tab === tabId) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
        battleRecordTabContents.forEach(content => {
            if (content.id === `battle-record-tab-${tabId}`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
        // 各タブに切り替わった際にデータを再ロード
        if (tabId === 'stats-summary') {
            loadBattleRecords(); // 勝率集計を再ロード (グラフはなし)
            loadRegisteredDecks(); // デッキ選択ドロップダウンも更新
        } else if (tabId === 'deck-management') {
            loadRegisteredDecks(); // デッキリストを再ロード
        } else if (tabId === 'past-records') {
            loadBattleRecords(); // 過去の記録リストも更新 (集計は不要だがリスト表示のために)
        } else if (tabId === 'new-record') {
            loadRegisteredDecks(); // 新規記録時もデッキ選択肢を更新
        }
    }


    // --- イベントハンドラ関数 ---
    async function handleSaveBattleRecordClick() {
        if (!myDeckSelect || !opponentDeckSelect || !winLossSelect || !firstSecondSelect || !notesTextarea) {
            await window.showCustomDialog('エラー', '自分のデッキ名、相手のデッキ名、勝敗、先攻/後攻は必須です。');
            return;
        }
        const myDeck = myDeckSelect.value;
        const opponentDeck = opponentDeckSelect.value;
        const myDeckType = myDeckSelect.value ? myDeckSelect.options[myDeckSelect.selectedIndex].textContent.match(/\((.*?)\)/)?.[1] || '' : '';
        const opponentDeckType = opponentDeckSelect.value ? opponentDeckSelect.options[opponentDeckSelect.selectedIndex].textContent.match(/\((.*?)\)/)?.[1] || '' : '';
        
        const result = winLossSelect.value;
        const firstSecond = firstSecondSelect.value;
        const notes = notesTextarea.value.trim();

        const newRecord = {
            timestamp: new Date().toLocaleString(),
            myDeck: myDeck,
            myDeckType: myDeckType,
            opponentDeck: opponentDeck,
            opponentDeckType: opponentDeckType,
            result: result,
            firstSecond: firstSecond,
            notes: notes
        };

        let records;
        if (window.currentUserId) {
            records = window.userBattleRecords || []; // サーバーデータ優先
        } else {
            const res = await browser.storage.local.get(['battleRecordsLocal']);
            records = res.battleRecordsLocal || [];
        }
        records.push(newRecord);

        if (window.currentUserId) {
            await saveBattleRecordsToServer(records);
        } else {
            saveBattleRecordsLocally(records);
        }

        // UIをリセット
        if (myDeckSelect) myDeckSelect.value = '';
        if (opponentDeckSelect) opponentDeckSelect.value = '';
        if (winLossSelect) winLossSelect.value = 'win';
        if (firstSecondSelect) firstSecondSelect.value = '';
        if (notesTextarea) notesTextarea.value = '';
    }

    async function handleRegisterDeckClick() {
        if (!newDeckNameInput || !newDeckTypeSelect) {
            await window.showCustomDialog('エラー', 'デッキ名とデッキタイプは必須です。');
            return;
        }
        const deckName = newDeckNameInput.value.trim();
        const deckType = newDeckTypeSelect.value;

        let decks;
        if (window.currentUserId) {
            decks = window.userRegisteredDecks || []; // サーバーデータ優先
        } else {
            const res = await browser.storage.local.get(['registeredDecksLocal']);
            decks = res.registeredDecksLocal || [];
        }

        if (decks.some(deck => deck.name === deckName)) {
            window.showCustomDialog('エラー', '同じ名前のデッキが既に登録されています。');
            return;
        }

        decks.push({ name: deckName, type: deckType });

        if (window.currentUserId) {
            await saveRegisteredDecksToServer(decks);
        } else {
            saveRegisteredDecksLocally(decks);
        }

        // UIをリセット
        if (newDeckNameInput) newDeckNameInput.value = '';
        if (newDeckTypeSelect) newDeckTypeSelect.value = '';
    }

    async function handleDeleteBattleRecordClick(event) {
        const indexToDelete = parseInt(event.currentTarget.dataset.index);
        const confirmed = await window.showCustomDialog('記録削除', 'この対戦記録を削除しますか？', true);
        if (confirmed) {
            await deleteBattleRecord(indexToDelete);
        }
    }

    async function handleDeleteRegisteredDeckClick(event) {
        const indexToDelete = parseInt(event.currentTarget.dataset.index);
        const confirmed = await window.showCustomDialog('デッキ削除', 'このデッキを登録リストから削除しますか？', true);
        if (confirmed) {
            await deleteRegisteredDeck(indexToDelete);
        }
    }

    function handleMyDeckSelectChange(event) { /* 特に何もしない */ }
    function handleOpponentDeckSelectChange(event) { /* 特に何もしない */ }
    function handleSelectedDeckForStatsChange(event) {
        // ログイン状態に応じて適切なデッキリストを渡す
        const decks = window.currentUserId ? (window.userRegisteredDecks || []) : (browser.storage.local.get(['registeredDecksLocal']).then(res => res.registeredDecksLocal || []));
        if (decks.then) { // Promiseの場合
            decks.then(d => displaySelectedDeckStats(event.target.value, d));
        } else { // 配列の場合
            displaySelectedDeckStats(event.target.value, decks);
        }
    }

    // --- イベントリスナーの再アタッチ ---
    if (saveBattleRecordButton) {
        saveBattleRecordButton.removeEventListener('click', handleSaveBattleRecordClick);
        saveBattleRecordButton.addEventListener('click', handleSaveBattleRecordClick);
    }

    if (registerDeckButton) {
        registerDeckButton.removeEventListener('click', handleRegisterDeckClick);
        registerDeckButton.addEventListener('click', handleRegisterDeckClick);
    }

    if (myDeckSelect) {
        myDeckSelect.removeEventListener('change', handleMyDeckSelectChange);
        myDeckSelect.addEventListener('change', handleMyDeckSelectChange);
    }
    if (opponentDeckSelect) {
        opponentDeckSelect.removeEventListener('change', handleOpponentDeckSelectChange);
        opponentDeckSelect.addEventListener('change', handleOpponentDeckSelectChange);
    }
    if (selectedDeckForStats) {
        selectedDeckForStats.removeEventListener('change', handleSelectedDeckForStatsChange);
        selectedDeckForStats.addEventListener('change', handleSelectedDeckForStatsChange);
    }

    // タブボタンのイベントリスナーをここで設定
    battleRecordTabButtons.forEach(button => {
        button.removeEventListener('click', handleBattleRecordTabClick); // 既存のリスナーを削除
        button.addEventListener('click', handleBattleRecordTabClick);
    });

    function handleBattleRecordTabClick(event) {
        showBattleRecordTab(event.currentTarget.dataset.tab);
    }

    // ログイン状態が変更されたときにデータを再ロード
    document.removeEventListener('loginStateChanged', () => {
        loadRegisteredDecks();
        loadBattleRecords();
    });
    document.addEventListener('loginStateChanged', () => {
        loadRegisteredDecks();
        loadBattleRecords();
    });

    // 初回ロード時に各データをロード
    loadRegisteredDecks();
    loadBattleRecords();

    // デフォルトで「新しい対戦記録」タブを表示
    showBattleRecordTab('new-record');
};
void 0; // Explicitly return undefined for Firefox compatibility
