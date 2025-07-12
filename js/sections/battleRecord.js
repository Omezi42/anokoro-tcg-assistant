// js/sections/battleRecord.js - 修正版 v2.1

window.initBattleRecordSection = async function() {
    console.log("BattleRecord section initialized (v2.1).");

    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    // --- DOM要素の取得 ---
    const myDeckSelect = document.getElementById('my-deck-select');
    const opponentDeckSelect = document.getElementById('opponent-deck-select');
    const winLossSelect = document.getElementById('win-loss-select');
    const firstSecondSelect = document.getElementById('first-second-select');
    const notesTextarea = document.getElementById('notes-textarea');
    const saveBattleRecordButton = document.getElementById('save-battle-record-button');
    const registeredDecksList = document.getElementById('registered-decks-list');
    const battleRecordsList = document.getElementById('battle-records-list');
    const newDeckNameInput = document.getElementById('new-deck-name');
    const newDeckTypeSelect = document.getElementById('new-deck-type');
    const registerDeckButton = document.getElementById('register-deck-button');
    const battleRecordTabButtons = document.querySelectorAll('.battle-record-tab-button');
    const battleRecordTabContents = document.querySelectorAll('.battle-record-tab-content');
    const selectedDeckForStats = document.getElementById('selected-deck-for-stats');
    const selectedDeckStatsDetail = document.getElementById('selected-deck-stats-detail');


    // --- データ表示関連 ---

    /** 登録済みデッキをUIに表示する */
    const displayRegisteredDecks = (decks) => {
        if (!registeredDecksList || !myDeckSelect || !opponentDeckSelect) return;

        registeredDecksList.innerHTML = '';
        myDeckSelect.innerHTML = '<option value="">登録済みデッキから選択</option>';
        opponentDeckSelect.innerHTML = '<option value="">登録済みデッキから選択</option>';

        if (!decks || decks.length === 0) {
            registeredDecksList.innerHTML = `<li>まだ登録されたデッキがありません。</li>`;
        } else {
            // デッキ名でソートして表示
            [...decks].sort((a, b) => a.name.localeCompare(b.name)).forEach((deck, index) => {
                // 元の配列でのインデックスを保持するために、ソート前のインデックスを探す
                const originalIndex = decks.findIndex(d => d.name === deck.name);
                
                const listItem = document.createElement('li');
                listItem.innerHTML = `${deck.name} (${deck.type}) <button class="delete-registered-deck-button" data-index="${originalIndex}" title="削除"><i class="fas fa-trash-alt"></i></button>`;
                registeredDecksList.appendChild(listItem);
                
                const option = document.createElement('option');
                option.value = deck.name;
                option.textContent = `${deck.name} (${deck.type})`;
                myDeckSelect.appendChild(option.cloneNode(true));
                opponentDeckSelect.appendChild(option);
            });
            registeredDecksList.querySelectorAll('.delete-registered-deck-button').forEach(button => button.addEventListener('click', handleDeleteRegisteredDeckClick));
        }
        updateSelectedDeckStatsDropdown(decks || []);
    };
    
    /** 戦績をUIに表示する */
    const displayBattleRecords = (records) => {
        if (!battleRecordsList) return;
        battleRecordsList.innerHTML = '';
        if (!records || records.length === 0) {
            battleRecordsList.innerHTML = `<li>まだ対戦記録がありません。</li>`;
        } else {
            [...records].reverse().forEach((record, reverseIndex) => {
                const originalIndex = records.length - 1 - reverseIndex;
                const listItem = document.createElement('li');
                listItem.className = 'battle-record-item';
                listItem.innerHTML = `
                    <strong>${record.timestamp}</strong><br>
                    自分のデッキ: ${record.myDeck} (${record.myDeckType || '不明'})<br>
                    相手のデッキ: ${record.opponentDeck} (${record.opponentDeckType || '不明'})<br>
                    結果: ${record.result === 'win' ? '勝利' : '敗北'} (${record.firstSecond === 'first' ? '先攻' : '後攻'})<br>
                    ${record.notes ? `メモ: ${record.notes}<br>` : ''}
                    <button class="delete-record-button" data-index="${originalIndex}" title="削除"><i class="fas fa-trash-alt"></i></button>`;
                battleRecordsList.appendChild(listItem);
            });
            battleRecordsList.querySelectorAll('.delete-record-button').forEach(button => button.addEventListener('click', handleDeleteBattleRecordClick));
        }
    };

    /** 統計情報を計算して表示する */
    const calculateAndDisplayStats = (records) => {
        const totalGamesSpan = document.getElementById('total-games');
        const totalWinsSpan = document.getElementById('total-wins');
        const winRateSpan = document.getElementById('win-rate');
        if(!totalGamesSpan || !totalWinsSpan || !winRateSpan) return;

        const totalGames = records.length;
        const totalWins = records.filter(r => r.result === 'win').length;
        
        totalGamesSpan.textContent = totalGames;
        totalWinsSpan.textContent = totalWins;
        winRateSpan.textContent = totalGames > 0 ? `${(totalWins / totalGames * 100).toFixed(1)}%` : '0.0%';
    };

    /** デッキ別詳細分析のドロップダウンを更新 */
    const updateSelectedDeckStatsDropdown = (decks) => {
        if (!selectedDeckForStats) return;
        const currentVal = selectedDeckForStats.value;
        selectedDeckForStats.innerHTML = '<option value="">全てのデッキ</option>';
        decks.sort((a, b) => a.name.localeCompare(b.name)).forEach(deck => {
            const option = document.createElement('option');
            option.value = deck.name;
            option.textContent = `${deck.name} (${deck.type})`;
            selectedDeckForStats.appendChild(option);
        });
        selectedDeckForStats.value = currentVal; // 以前の選択を維持
    };

    /** 選択されたデッキの詳細な勝率を表示 */
    const displaySelectedDeckStats = async (deckName) => {
        if (!selectedDeckStatsDetail) return;
        if (!deckName) {
            selectedDeckStatsDetail.innerHTML = '<p>デッキを選択して詳細な勝率を表示します。</p>';
            return;
        }

        const assistant = window.TCG_ASSISTANT;
        let records;
        if(assistant.isLoggedIn){
            records = assistant.userBattleRecords || [];
        } else {
            const result = await new Promise(resolve => browser.storage.local.get(['battleRecordsLocal'], resolve));
            records = result.battleRecordsLocal || [];
        }

        const gamesAsMyDeck = records.filter(r => r.myDeck === deckName);
        const myDeckWins = gamesAsMyDeck.filter(r => r.result === 'win').length;
        const myDeckWinRate = gamesAsMyDeck.length > 0 ? `${(myDeckWins / gamesAsMyDeck.length * 100).toFixed(1)}%` : '0.0%';

        let html = `<h4>「${deckName}」使用時</h4><p>勝率: ${myDeckWinRate} (${myDeckWins}勝 / ${gamesAsMyDeck.length}戦)</p>`;
        selectedDeckStatsDetail.innerHTML = html;
    };


    // --- データロード/保存関連 ---

    /** ログイン状態に応じて適切なデータソースからデッキ情報を取得 */
    const getDecks = async () => {
        const assistant = window.TCG_ASSISTANT;
        if (assistant.isLoggedIn) {
            return assistant.userRegisteredDecks || [];
        }
        const result = await new Promise(resolve => browser.storage.local.get(['registeredDecksLocal'], resolve));
        return result.registeredDecksLocal || [];
    };

    /** ログイン状態に応じて適切なデータソースから戦績を取得 */
    const getBattleRecords = async () => {
        const assistant = window.TCG_ASSISTANT;
        if (assistant.isLoggedIn) {
            return assistant.userBattleRecords || [];
        }
        const result = await new Promise(resolve => browser.storage.local.get(['battleRecordsLocal'], resolve));
        return result.battleRecordsLocal || [];
    };

    /** データを保存する (ログイン状態に応じて送信先を切り替え) */
    const saveData = async (type, dataToSave) => {
        const assistant = window.TCG_ASSISTANT;
        const payload = { type: 'update_user_data', userId: assistant.currentUserId };

        if (type === 'decks') payload.registeredDecks = dataToSave;
        if (type === 'records') payload.battleRecords = dataToSave;

        if (assistant.isLoggedIn) {
            if (!assistant.ws || assistant.ws.readyState !== WebSocket.OPEN) {
                await window.showCustomDialog('エラー', 'サーバーに接続していません。'); return;
            }
            assistant.ws.send(JSON.stringify(payload));
            if (type === 'decks') assistant.userRegisteredDecks = dataToSave;
            if (type === 'records') assistant.userBattleRecords = dataToSave;
        } else {
            const storageKey = type === 'decks' ? 'registeredDecksLocal' : 'battleRecordsLocal';
            await new Promise(resolve => browser.storage.local.set({ [storageKey]: dataToSave }, resolve));
        }
        // UIを更新
        handleLoginStateChange();
    };

    // --- イベントハンドラ ---

    const handleSaveBattleRecordClick = async () => {
        const myDeckOption = myDeckSelect.options[myDeckSelect.selectedIndex];
        const opponentDeckOption = opponentDeckSelect.options[opponentDeckSelect.selectedIndex];
        
        const newRecord = {
            timestamp: new Date().toLocaleString(),
            myDeck: myDeckSelect.value,
            myDeckType: myDeckOption?.textContent.match(/\((.*?)\)/)?.[1] || '',
            opponentDeck: opponentDeckSelect.value,
            opponentDeckType: opponentDeckOption?.textContent.match(/\((.*?)\)/)?.[1] || '',
            result: winLossSelect.value,
            firstSecond: firstSecondSelect.value,
            notes: notesTextarea.value.trim()
        };

        const records = await getBattleRecords();
        records.push(newRecord);
        await saveData('records', records);
        await window.showCustomDialog('保存完了', '対戦記録を保存しました。');
    };

    const handleRegisterDeckClick = async () => {
        const deckName = newDeckNameInput.value.trim();
        const deckType = newDeckTypeSelect.value;
        if (!deckName || !deckType) return;

        const decks = await getDecks();
        if (decks.some(d => d.name === deckName)) {
            window.showCustomDialog('エラー', '同じ名前のデッキが既に登録されています。'); return;
        }
        decks.push({ name: deckName, type: deckType });
        await saveData('decks', decks);
        await window.showCustomDialog('登録完了', 'デッキを登録しました。');
        newDeckNameInput.value = '';
    };
    
    const handleDeleteRegisteredDeckClick = async (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        const confirmed = await window.showCustomDialog('デッキ削除', 'このデッキを削除しますか？', true);
        if (confirmed) {
            const decks = await getDecks();
            decks.splice(index, 1);
            await saveData('decks', decks);
        }
    };

    const handleDeleteBattleRecordClick = async (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        const confirmed = await window.showCustomDialog('記録削除', 'この対戦記録を削除しますか？', true);
        if (confirmed) {
            const records = await getBattleRecords();
            records.splice(index, 1);
            await saveData('records', records);
        }
    };

    /** [修正] タブ切り替えロジック */
    const showBattleRecordTab = (tabId) => {
        battleRecordTabButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.tab === tabId);
        });
        battleRecordTabContents.forEach(content => {
            content.classList.toggle('active', content.id === `battle-record-tab-${tabId}`);
        });
    };

    /** ログイン状態が変更されたときに呼び出されるハンドラ */
    const handleLoginStateChange = async () => {
        const decks = await getDecks();
        const records = await getBattleRecords();
        displayRegisteredDecks(decks);
        displayBattleRecords(records);
        calculateAndDisplayStats(records);
    };

    // --- イベントリスナー設定 ---
    
    // [修正] タブボタンのイベントリスナーを確実に追加
    battleRecordTabButtons.forEach(button => {
        button.addEventListener('click', (e) => showBattleRecordTab(e.currentTarget.dataset.tab));
    });

    saveBattleRecordButton?.addEventListener('click', handleSaveBattleRecordClick);
    registerDeckButton?.addEventListener('click', handleRegisterDeckClick);
    selectedDeckForStats?.addEventListener('change', (e) => displaySelectedDeckStats(e.target.value));

    // [修正] グローバルなイベントリスナーの管理
    if (window.TCG_ASSISTANT._battleRecordLoginHandler) {
        window.TCG_ASSISTANT.removeEventListener('loginStateChanged', window.TCG_ASSISTANT._battleRecordLoginHandler);
    }
    window.TCG_ASSISTANT._battleRecordLoginHandler = handleLoginStateChange;
    window.TCG_ASSISTANT.addEventListener('loginStateChanged', window.TCG_ASSISTANT._battleRecordLoginHandler);

    // --- 初期化処理 ---
    handleLoginStateChange(); // 初期表示
    showBattleRecordTab('new-record'); // デフォルトタブを表示
};

void 0;
