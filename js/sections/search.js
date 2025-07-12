// js/sections/search.js - 修正版 v2.1

window.initSearchSection = async function() {
    try {
        await window.TCG_ASSISTANT.cardDataReady;
        console.log("Search section initialized (v2.1). Card data is ready.");
    } catch (error) {
        console.error("Search: Failed to wait for card data.", error);
        await window.showCustomDialog('エラー', '検索機能の初期化に必要なカードデータの読み込みに失敗しました。');
        return;
    }

    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    // --- UI要素の取得 ---
    const searchInput = document.getElementById('search-input');
    const performSearchButton = document.getElementById('perform-search-button');
    const searchResults = document.getElementById('search-results');
    const searchFilterType = document.getElementById('search-filter-type');
    const searchFilterSet = document.getElementById('search-filter-set');
    const searchTextTarget = document.getElementById('search-text-target');
    const fuzzySearchToggle = document.getElementById('fuzzy-search-toggle'); // あいまい検索チェックボックス
    const autocompleteSuggestions = document.getElementById('autocomplete-suggestions');

    /**
     * [追加] レーベンシュタイン距離を計算する関数 (あいまい検索用)
     * 2つの文字列間の編集距離（挿入、削除、置換の回数）を計算します。
     * @param {string} s1 - 文字列1
     * @param {string} s2 - 文字列2
     * @returns {number} - 編集距離
     */
    const levenshteinDistance = (s1, s2) => {
        s1 = s1.toLowerCase();
        s2 = s2.toLowerCase();
        const costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                } else {
                    if (j > 0) {
                        let newValue = costs[j - 1];
                        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                        }
                        costs[j - 1] = lastValue;
                        lastValue = newValue;
                    }
                }
            }
            if (i > 0) costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    };
    
    /**
     * 検索フィルターのセットオプションを動的に追加します。
     */
    function populateSearchFilters() {
        const sets = new Set();
        if (window.TCG_ASSISTANT.allCards) {
            window.TCG_ASSISTANT.allCards.forEach(card => {
                if (card.info && card.info.length > 0) {
                    const setInfo = card.info.find(info => info.startsWith('このカードの収録セットは、'));
                    if (setInfo) {
                        sets.add(setInfo.replace('このカードの収録セットは、', '').replace('です。', ''));
                    }
                }
            });
        }
        if (searchFilterSet) {
            searchFilterSet.innerHTML = '<option value="">全て</option>';
            Array.from(sets).sort().forEach(set => {
                const option = document.createElement('option');
                option.value = set;
                option.textContent = set;
                searchFilterSet.appendChild(option);
            });
        }
    }

    /**
     * [修正] カード検索のパフォーマンスとロジックを改善
     * - 処理をチャンクに分割し、UIのフリーズを防止
     * - あいまい検索モードのオン/オフに対応
     */
    async function performCardSearch(query, textTarget, typeFilter, setFilter) {
        if (!searchResults) return;
        searchResults.innerHTML = '<p><div class="spinner"></div> 検索中...</p>';

        // 検索処理を非同期に実行してUIのブロッキングを防ぐ
        await new Promise(resolve => setTimeout(resolve, 50));

        const normalizedQuery = query.toLowerCase();
        const isFuzzy = fuzzySearchToggle ? fuzzySearchToggle.checked : false;
        const fuzzyThreshold = 2; // あいまい検索の許容度

        const allCards = window.TCG_ASSISTANT.allCards;
        let filteredCards = [];
        const chunkSize = 100; // 一度に処理するカード数

        for (let i = 0; i < allCards.length; i += chunkSize) {
            const chunk = allCards.slice(i, i + chunkSize);
            const resultsInChunk = chunk.filter(card => {
                // フィルター条件
                const matchesType = !typeFilter || card.info.some(info => info.includes(`このカードは${typeFilter}`));
                if (!matchesType) return false;

                const matchesSet = !setFilter || card.info.some(info => info.includes(`このカードの収録セットは、${setFilter}`));
                if (!matchesSet) return false;

                // テキスト検索条件
                if (query) {
                    let cardText = '';
                    switch (textTarget) {
                        case 'name': cardText = card.name; break;
                        case 'effect': cardText = card.info.find(info => info.startsWith("このカードの効果は、「")) || ''; break;
                        case 'lore': cardText = card.info.find(info => info.startsWith("このカードの世界観は、「")) || ''; break;
                        default: cardText = `${card.name} ${card.info.join(' ')}`; break;
                    }
                    cardText = cardText.toLowerCase();

                    if (isFuzzy) {
                        // あいまい検索: 編集距離が閾値以下かチェック
                        return levenshteinDistance(cardText, normalizedQuery) <= fuzzyThreshold;
                    } else {
                        // 通常検索: 部分一致
                        return cardText.includes(normalizedQuery);
                    }
                }
                return true; // クエリがない場合はフィルターのみ適用
            });
            filteredCards.push(...resultsInChunk);

            // UIを更新するために一度処理を中断
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        displayResults(filteredCards, query);
    }

    /**
     * [新規] 検索結果を表示する関数
     */
    function displayResults(cards, query) {
        if (cards.length > 0) {
            let resultsHtml = `<p>「<strong>${query || '全てのカード'}</strong>」の検索結果 (${cards.length}件):</p><ul>`;
            cards.forEach(card => {
                resultsHtml += `<li><a href="#" class="card-name-link" data-card-name="${card.name}"><strong>${card.name}</strong></a><br>`;
                card.info.forEach(info => {
                    if (info.startsWith("このカードの効果は、「")) {
                        resultsHtml += `<strong>効果:</strong> ${info.replace("このカードの効果は、「", "").replace("」です。", "")}<br>`;
                    }
                });
                resultsHtml += `</li>`;
            });
            resultsHtml += `</ul>`;
            searchResults.innerHTML = resultsHtml;

            searchResults.querySelectorAll('.card-name-link').forEach(link => {
                link.addEventListener('click', handleCardNameLinkClick);
            });
        } else {
            searchResults.innerHTML = '<p>検索結果が見つかりませんでした。</p>';
        }
    }

    function displayCardDetails(cardName) {
        const card = window.TCG_ASSISTANT.allCards.find(c => c.name === cardName);
        if (!card) {
            window.showCustomDialog('エラー', 'カード詳細が見つかりませんでした。');
            return;
        }
        const detailHtml = `<h3>${card.name}</h3><ul>${card.info.map(info => `<li>${info}</li>`).join('')}</ul>`;
        window.showCustomDialog(card.name, detailHtml);
    }

    // --- イベントハンドラ ---
    function handleCardNameLinkClick(e) {
        e.preventDefault();
        displayCardDetails(e.target.dataset.cardName);
    }

    function handlePerformSearchButtonClick() {
        const query = searchInput.value.trim();
        const textTarget = searchTextTarget.value;
        const typeFilter = searchFilterType.value;
        const setFilter = searchFilterSet.value;
        performCardSearch(query, textTarget, typeFilter, setFilter);
    }

    function handleSearchInputInput() {
        const query = searchInput.value.trim().toLowerCase();
        autocompleteSuggestions.innerHTML = '';

        if (query.length > 0) {
            const suggestions = window.TCG_ASSISTANT.allCards
                .map(card => card.name)
                .filter(name => name.toLowerCase().includes(query));

            if (suggestions.length > 0) {
                autocompleteSuggestions.style.display = 'block';
                suggestions.slice(0, 5).forEach(suggestion => {
                    const div = document.createElement('div');
                    div.textContent = suggestion;
                    div.addEventListener('click', handleAutocompleteSuggestionClick);
                    autocompleteSuggestions.appendChild(div);
                });
            } else {
                autocompleteSuggestions.style.display = 'none';
            }
        } else {
            autocompleteSuggestions.style.display = 'none';
        }
    }

    function handleAutocompleteSuggestionClick(event) {
        searchInput.value = event.currentTarget.textContent;
        autocompleteSuggestions.style.display = 'none';
        performSearchButton.click();
    }

    function handleSearchInputBlur() {
        setTimeout(() => {
            if (autocompleteSuggestions) autocompleteSuggestions.style.display = 'none';
        }, 150); 
    }

    // --- イベントリスナー設定 ---
    const addListener = (element, event, handler) => {
        if(element) {
            element.removeEventListener(event, handler);
            element.addEventListener(event, handler);
        }
    };

    addListener(performSearchButton, 'click', handlePerformSearchButtonClick);
    addListener(searchInput, 'input', handleSearchInputInput);
    addListener(searchInput, 'blur', handleSearchInputBlur);
    addListener(searchInput, 'keypress', (e) => { if (e.key === 'Enter') handlePerformSearchButtonClick(); });

    // --- 初期化処理 ---
    populateSearchFilters();
};

void 0;
