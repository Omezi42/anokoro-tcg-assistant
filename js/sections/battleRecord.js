// js/sections/battleRecord.js - 修正版

window.initBattleRecordSection = async function() {
    console.log("BattleRecord section initialized.");

    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    // === DOM要素の取得 ===
    const myDeckSelect = document.getElementById('my-deck-select');
    const opponentDeckSelect = document.getElementById('opponent-deck-select');
    const winLossSelect = document.getElementById('win-loss-select');
    const firstSecondSelect = document.getElementById('first-second-select');
    const notesTextarea = document.getElementById('notes-textarea');
    const saveBattleRecordButton = document.getElementById('save-battle-record-button');
    const newDeckNameInput = document.getElementById('new-deck-name');
    const newDeckTypeSelect = document.getElementById('new-deck-type');
    const registerDeckButton = document.getElementById('register-deck-button');

    /**
     * ログイン状態が変更されたときに呼び出されるハンドラ
     */
    const handleLoginStateChange = () => {
        loadAndDisplayDecks();
        loadAndDisplayBattleRecords();
    };

    // === データ表示関連 ===
    const displayRegisteredDecks = (decks) => {
        const registeredDecksList = document.getElementById('registered-decks-list');
        if (!registeredDecksList || !myDeckSelect || !opponentDeckSelect) return;

        registeredDecksList.innerHTML = '';
        myDeckSelect.innerHTML = '<option value="">登録済みデッキから選択</option>';
        opponentDeckSelect.innerHTML = '<option value="">登録済みデッキから選択</option>';

        if (decks.length === 0) {
            registeredDecksList.innerHTML = `<li>まだ登録されたデッキがありません。</li>`;
        } else {
            decks.sort((a, b) => a.name.localeCompare(b.name)).forEach((deck, index) => {
                const listItem = document.createElement('li');
                listItem.innerHTML = `${deck.name} (${deck.type}) <button class="delete-registered-deck-button" data-index="${index}" title="削除"><i class="fas fa-trash-alt"></i></button>`;
                registeredDecksList.appendChild(listItem);
                
                const option = document.createElement('option');
                option.value = deck.name;
                option.textContent = `${deck.name} (${deck.type})`;
                myDeckSelect.appendChild(option.cloneNode(true));
                opponentDeckSelect.appendChild(option);
            });
            registeredDecksList.querySelectorAll('.delete-registered-deck-button').forEach(button => button.addEventListener('click', handleDeleteRegisteredDeckClick));
        }
    };
    
    const displayBattleRecords = (records) => {
        const battleRecordsList = document.getElementById('battle-records-list');
        if (!battleRecordsList) return;
        battleRecordsList.innerHTML = '';
        if (records.length === 0) {
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
                    <button class="delete-button" data-index="${originalIndex}" title="削除"><i class="fas fa-trash-alt"></i></button>`;
                battleRecordsList.appendChild(listItem);
            });
            battleRecordsList.querySelectorAll('.delete-button').forEach(button => button.addEventListener('click', handleDeleteBattleRecordClick));
        }
    };
    
    // === データロード関連 ===
    const loadAndDisplayDecks = async () => {
        const assistant = window.TCG_ASSISTANT;
        if (assistant.isLoggedIn) {
            displayRegisteredDecks(assistant.userRegisteredDecks || []);
        } else {
            browser.storage.local.get(['registeredDecksLocal'], (result) => {
                displayRegisteredDecks(result.registeredDecksLocal || []);
            });
        }
    };
    
    const loadAndDisplayBattleRecords = async () => {
        const assistant = window.TCG_ASSISTANT;
        if (assistant.isLoggedIn) {
            displayBattleRecords(assistant.userBattleRecords || []);
        } else {
            browser.storage.local.get(['battleRecordsLocal'], (result) => {
                displayBattleRecords(result.battleRecordsLocal || []);
            });
        }
    };

    // === データ保存関連 ===
    const saveData = async (type, dataToSave) => {
        const assistant = window.TCG_ASSISTANT;
        const payload = {
            type: 'update_user_data',
            userId: assistant.currentUserId,
        };

        if (type === 'decks') {
            payload.registeredDecks = dataToSave;
        } else if (type === 'records') {
            payload.battleRecords = dataToSave;
        }

        if (assistant.isLoggedIn) {
            if (!assistant.ws || assistant.ws.readyState !== WebSocket.OPEN) {
                await window.showCustomDialog('エラー', 'サーバーに接続していません。データは保存されませんでした。');
                return;
            }
            assistant.ws.send(JSON.stringify(payload));
            if(type === 'decks') assistant.userRegisteredDecks = dataToSave;
            if(type === 'records') assistant.userBattleRecords = dataToSave;
            await window.showCustomDialog('保存完了', 'サーバーにデータを保存しました！');
        } else {
            const storageKey = type === 'decks' ? 'registeredDecksLocal' : 'battleRecordsLocal';
            browser.storage.local.set({ [storageKey]: dataToSave }, () => {
                window.showCustomDialog('保存完了', 'データをローカルに保存しました！');
            });
        }
        handleLoginStateChange(); // UIを再描画
    };

    // === イベントハンドラ ===
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

        const assistant = window.TCG_ASSISTANT;
        let records;
        if (assistant.isLoggedIn) {
            records = [...(assistant.userBattleRecords || [])];
        } else {
            const result = await new Promise(resolve => browser.storage.local.get(['battleRecordsLocal'], resolve));
            records = result.battleRecordsLocal || [];
        }
        records.push(newRecord);
        await saveData('records', records);
    };

    const handleRegisterDeckClick = async () => {
        const deckName = newDeckNameInput.value.trim();
        const deckType = newDeckTypeSelect.value;
        if (!deckName || !deckType) return;

        const assistant = window.TCG_ASSISTANT;
        let decks;
        if (assistant.isLoggedIn) {
            decks = [...(assistant.userRegisteredDecks || [])];
        } else {
            const result = await new Promise(resolve => browser.storage.local.get(['registeredDecksLocal'], resolve));
            decks = result.registeredDecksLocal || [];
        }
        
        if (decks.some(d => d.name === deckName)) {
            window.showCustomDialog('エラー', '同じ名前のデッキが既に登録されています。');
            return;
        }
        decks.push({ name: deckName, type: deckType });
        await saveData('decks', decks);
    };
    
    const handleDeleteRegisteredDeckClick = async (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        const confirmed = await window.showCustomDialog('デッキ削除', 'このデッキを削除しますか？', true);
        if(confirmed){
            const assistant = window.TCG_ASSISTANT;
            let decks;
            if (assistant.isLoggedIn) {
                decks = [...(assistant.userRegisteredDecks || [])];
            } else {
                const result = await new Promise(resolve => browser.storage.local.get(['registeredDecksLocal'], resolve));
                decks = result.registeredDecksLocal || [];
            }
            decks.splice(index, 1);
            await saveData('decks', decks);
        }
    };

    const handleDeleteBattleRecordClick = async (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
         const confirmed = await window.showCustomDialog('記録削除', 'この対戦記録を削除しますか？', true);
        if(confirmed){
            const assistant = window.TCG_ASSISTANT;
            let records;
            if (assistant.isLoggedIn) {
                records = [...(assistant.userBattleRecords || [])];
            } else {
                const result = await new Promise(resolve => browser.storage.local.get(['battleRecordsLocal'], resolve));
                records = result.battleRecordsLocal || [];
            }
            records.splice(index, 1);
            await saveData('records', records);
        }
    };

    // === イベントリスナー設定 ===
    saveBattleRecordButton?.addEventListener('click', handleSaveBattleRecordClick);
    registerDeckButton?.addEventListener('click', handleRegisterDeckClick);

    // ★★★ 修正点 ★★★
    // ログイン状態の変更をリッスン
    window.TCG_ASSISTANT.removeEventListener('loginStateChanged', handleLoginStateChange);
    window.TCG_ASSISTANT.addEventListener('loginStateChanged', handleLoginStateChange);

    // --- 初期化処理 ---
    handleLoginStateChange(); // 初期表示
};

void 0;
