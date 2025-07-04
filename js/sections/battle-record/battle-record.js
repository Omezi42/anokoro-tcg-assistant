// js/sections/battle-record/battle-record.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initBattleRecordSection = function(allCards, showCustomDialog) {
    // === 戦いの記録セクションのロジック ===
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


    // 戦績をロードして集計を更新する関数
    const loadBattleRecords = () => {
        chrome.storage.local.get(['battleRecords'], (result) => {
            const records = result.battleRecords || [];
            const battleRecordsList = document.getElementById('battle-records-list');
            const totalGamesSpan = document.getElementById('total-games');
            const totalWinsSpan = document.getElementById('total-wins');
            const totalLossesSpan = document.getElementById('total-losses');
            const winRateSpan = document.getElementById('win-rate');
            const firstWinRateSpan = document.getElementById('first-win-rate');
            const secondWinRateSpan = document.getElementById('second-win-rate');
            const myDeckTypeWinRatesDiv = document.getElementById('my-deck-type-win-rates');
            const opponentDeckTypeWinRatesDiv = document.getElementById('opponent-deck-type-win-rates');

            if (!battleRecordsList) return;

            battleRecordsList.innerHTML = '';

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


            if (records.length === 0) {
                battleRecordsList.innerHTML = '<li>まだ対戦記録がありません。</li>';
            } else {
                battleRecordsList.innerHTML = '';
                [...records].reverse().forEach((record, reverseIndex) => {
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
                    button.addEventListener('click', async (event) => {
                        const indexToDelete = parseInt(event.currentTarget.dataset.index);
                        const confirmed = await showCustomDialog('記録削除', 'この対戦記録を削除しますか？', true);
                        if (confirmed) {
                            deleteBattleRecord(indexToDelete);
                        }
                    });
                });
            }
            updateSelectedDeckStatsDropdown();
        });
    };

    // 戦績を削除する関数
    const deleteBattleRecord = (index) => {
        chrome.storage.local.get(['battleRecords'], (result) => {
            let records = result.battleRecords || [];
            if (index > -1 && index < records.length) {
                records.splice(index, 1);
                chrome.storage.local.set({ battleRecords: records }, () => {
                    showCustomDialog('削除完了', '対戦記録を削除しました。');
                    loadBattleRecords();
                });
            }
        });
    };

    // 登録済みデッキをロードして表示する関数
    const loadRegisteredDecks = () => {
        chrome.storage.local.get(['registeredDecks'], (result) => {
            const decks = result.registeredDecks || [];
            const registeredDecksList = document.getElementById('registered-decks-list');
            const myDeckSelect = document.getElementById('my-deck-select');
            const opponentDeckSelect = document.getElementById('opponent-deck-select');

            if (!registeredDecksList || !myDeckSelect || !opponentDeckSelect) return;

            registeredDecksList.innerHTML = '';

            myDeckSelect.innerHTML = '<option value="">登録済みデッキから選択</option>';
            opponentDeckSelect.innerHTML = '<option value="">登録済みデッキから選択</option>';

            if (decks.length === 0) {
                registeredDecksList.innerHTML = '<li>まだ登録されたデッキがありません。</li>';
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
                    button.addEventListener('click', async (event) => {
                        const indexToDelete = parseInt(event.currentTarget.dataset.index);
                        const confirmed = await showCustomDialog('デッキ削除', 'このデッキを登録リストから削除しますか？', true);
                        if (confirmed) {
                            deleteRegisteredDeck(indexToDelete);
                        }
                    });
                });
            }
            updateSelectedDeckStatsDropdown();
        });
    };

    // 登録済みデッキを削除する関数
    const deleteRegisteredDeck = (index) => {
        chrome.storage.local.get(['registeredDecks'], async (result) => {
            let decks = result.registeredDecks || [];
            if (index > -1 && index < decks.length) {
                decks.splice(index, 1);
                await chrome.storage.local.set({ registeredDecks: decks });
                showCustomDialog('削除完了', 'デッキを削除しました。');
                loadRegisteredDecks();
                loadBattleRecords();
            }
        });
    };

    // デッキ別詳細分析のドロップダウンを更新
    const updateSelectedDeckStatsDropdown = () => {
        chrome.storage.local.get(['registeredDecks'], (result) => {
            const decks = result.registeredDecks || [];
            const selectedDeckForStats = document.getElementById('selected-deck-for-stats');
            if (!selectedDeckForStats) return;

            selectedDeckForStats.innerHTML = '<option value="">全てのデッキ</option>';
            decks.sort((a, b) => a.name.localeCompare(b.name)).forEach(deck => {
                const option = document.createElement('option');
                option.value = deck.name;
                option.textContent = `${deck.name} (${deck.type})`;
                selectedDeckForStats.appendChild(option);
            });
            displaySelectedDeckStats(selectedDeckForStats.value);
        });
    };

    // 選択されたデッキの詳細な勝率を表示
    const displaySelectedDeckStats = (deckName) => {
        chrome.storage.local.get(['battleRecords'], (result) => {
            const records = result.battleRecords || [];
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
            let opponentDeckWins = gamesAsOpponentDeck.filter(record => record.result === 'win').length;
            let opponentDeckWinRate = opponentDeckTotal > 0 ? ((opponentDeckWins / opponentDeckTotal) * 100).toFixed(2) : '0.00';

            html += `<h4>「${deckName}」の統計 (相手のデッキとして使用時)</h4>`;
            html += `<p>総対戦数: ${opponentDeckTotal}</p>`;
            html += `<p>相手勝利数: ${opponentDeckWins} (自分が負けた数)</p>`;
            html += `<p>相手勝率: ${opponentDeckWinRate}%</p>`;

            selectedDeckStatsDetail.innerHTML = html;
        });
    };

    // タブ切り替え関数
    function showBattleRecordTab(tabId) {
        if (!battleRecordTabButtons.length || !battleRecordTabContents.length) {
            battleRecordTabButtons = document.querySelectorAll('.battle-record-tab-button');
            battleRecordTabContents = document.querySelectorAll('.battle-record-tab-content');
            if (!battleRecordTabButtons.length || !battleRecordTabContents.length) return;
        }

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
        if (tabId === 'stats-summary') {
            loadBattleRecords();
            updateSelectedDeckStatsDropdown();
        } else if (tabId === 'deck-management') {
            loadRegisteredDecks();
        } else if (tabId === 'past-records') {
            loadBattleRecords();
        }
    }


    // イベントリスナー
    battleRecordTabButtons.forEach(button => {
        button.addEventListener('click', () => {
            showBattleRecordTab(button.dataset.tab);
        });
    });

    if (saveBattleRecordButton) {
        saveBattleRecordButton.addEventListener('click', async () => {
            if (!myDeckSelect || !opponentDeckSelect || !winLossSelect || !firstSecondSelect || !notesTextarea) return;
            const myDeck = myDeckSelect.value;
            const opponentDeck = opponentDeckSelect.value;
            const myDeckType = myDeckSelect.value ? myDeckSelect.options[myDeckSelect.selectedIndex].textContent.match(/\((.*?)\)/)?.[1] || '' : '';
            const opponentDeckType = opponentDeckSelect.value ? opponentDeckSelect.options[opponentDeckSelect.selectedIndex].textContent.match(/\((.*?)\)/)?.[1] || '' : '';
            
            const result = winLossSelect.value;
            const firstSecond = firstSecondSelect.value;
            const notes = notesTextarea.value.trim();

            if (!myDeck || !opponentDeck || !result || !firstSecond) {
                showCustomDialog('エラー', '自分のデッキ名、相手のデッキ名、勝敗、先攻/後攻は必須です。');
                return;
            }

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

            chrome.storage.local.get(['battleRecords'], (res) => {
                const records = res.battleRecords || [];
                records.push(newRecord);
                chrome.storage.local.set({ battleRecords: records }, () => {
                    showCustomDialog('保存完了', '対戦記録を保存しました！');
                    if (myDeckSelect) myDeckSelect.value = '';
                    if (opponentDeckSelect) opponentDeckSelect.value = '';
                    if (winLossSelect) winLossSelect.value = 'win';
                    if (firstSecondSelect) firstSecondSelect.value = '';
                    if (notesTextarea) notesTextarea.value = '';
                    loadBattleRecords();
                });
            });
        });
    }

    if (registerDeckButton) {
        registerDeckButton.addEventListener('click', registerDeck);
    }
    
    // デッキを登録する関数
    const registerDeck = async () => {
        if (!newDeckNameInput || !newDeckTypeSelect) return;
        const deckName = newDeckNameInput.value.trim();
        const deckType = newDeckTypeSelect.value;

        if (!deckName || !deckType) {
            showCustomDialog('エラー', 'デッキ名とデッキタイプは必須です。');
            return;
        }

        chrome.storage.local.get(['registeredDecks'], async (result) => {
            const decks = result.registeredDecks || [];
            if (decks.some(deck => deck.name === deckName)) {
                showCustomDialog('エラー', '同じ名前のデッキが既に登録されています。');
                return;
            }

            decks.push({ name: deckName, type: deckType });
            await chrome.storage.local.set({ registeredDecks: decks });
            showCustomDialog('登録完了', `デッキ「${deckName}」を登録しました！`);
            if (newDeckNameInput) newDeckNameInput.value = '';
            if (newDeckTypeSelect) newDeckTypeSelect.value = '';
            loadRegisteredDecks();
        });
    };

    if (myDeckSelect) {
        myDeckSelect.addEventListener('change', (event) => {
            // No specific logic needed here as type is extracted on save
        });
    }
    if (opponentDeckSelect) {
        opponentDeckSelect.addEventListener('change', (event) => {
            // No specific logic needed here as type is extracted on save
        });
    }
    if (selectedDeckForStats) {
        selectedDeckForStats.addEventListener('change', (event) => {
            displaySelectedDeckStats(event.target.value);
        });
    }

    // 初回ロード時に各データをロード
    loadRegisteredDecks(); // これによりmyDeckSelectとopponentDeckSelectが初期化される
    loadBattleRecords(); // これにより集計と過去の記録リストが初期化される

    // デフォルトで「新しい対戦記録」タブを表示
    showBattleRecordTab('new-record');
}; // End of initBattleRecordSection
