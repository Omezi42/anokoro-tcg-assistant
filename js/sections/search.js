// js/sections/search.js

window.initSearchSection = async function() {
    console.log("Search section initialized.");

    // === DOM要素の取得 ===
    const searchInput = document.getElementById('search-input');
    const performSearchButton = document.getElementById('perform-search-button');
    const searchResults = document.getElementById('search-results');
    const searchFilterType = document.getElementById('search-filter-type');
    const searchFilterSet = document.getElementById('search-filter-set');
    const searchTextTarget = document.getElementById('search-text-target');
    const autocompleteSuggestions = document.getElementById('autocomplete-suggestions');
    const fuzzyThresholdSlider = document.getElementById('fuzzy-threshold-slider');
    const fuzzyThresholdValue = document.getElementById('fuzzy-threshold-value');

    // 最後に実行された検索結果を保持するための変数
    let lastFilteredCards = [];

    // --- ヘルパー関数 ---

    /**
     * 検索フィルターの「セット」ドロップダウンを動的に生成します。
     */
    function populateSearchFilters() {
        if (!window.allCards || window.allCards.length === 0) {
            console.warn("Card data not available for filters.");
            return;
        }
        const sets = new Set();
        window.allCards.forEach(card => {
            const setInfo = card.info.find(info => info.startsWith('このカードの収録セットは、'));
            if (setInfo) {
                const setName = setInfo.replace('このカードの収録セットは、', '').replace('です。', '');
                sets.add(setName);
            }
        });
        if (searchFilterSet) {
            const currentValue = searchFilterSet.value;
            searchFilterSet.innerHTML = '<option value="">全て</option>';
            Array.from(sets).sort().forEach(set => {
                const option = document.createElement('option');
                option.value = set;
                option.textContent = set;
                searchFilterSet.appendChild(option);
            });
            searchFilterSet.value = currentValue;
        }
    }

    /**
     * 文字列を正規化します。
     * @param {string} text - 正規化する文字列
     * @returns {string} 正規化された文字列
     */
    function normalizeText(text) {
        if (typeof text !== 'string') return '';
        // 半角カタカナを全角カタカナに、ひらがなをカタカナに変換し、スペースを削除して小文字化
        return text.replace(/[\uFF61-\uFF9F]/g, s => String.fromCharCode(s.charCodeAt(0) + 0x20))
                   .replace(/[\u3041-\u3096]/g, s => String.fromCharCode(s.charCodeAt(0) + 0x60))
                   .replace(/\s+/g, '')
                   .toLowerCase();
    }

    /**
     * レーベンシュタイン距離を計算します。
     * @param {string} s1 - 文字列1
     * @param {string} s2 - 文字列2
     * @returns {number} ２つの文字列の距離
     */
    function levenshteinDistance(s1, s2) {
        const m = s1.length;
        const n = s2.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(null));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
            }
        }
        return dp[m][n];
    }

    // --- メインロジック ---

    /**
     * カード検索を実行し、結果を表示します。
     */
    function performCardSearch() {
        if (!searchResults || !searchInput || !searchTextTarget || !searchFilterType || !searchFilterSet) return;
        
        if (!window.allCards || window.allCards.length === 0) {
            searchResults.innerHTML = '<p>カードデータが読み込まれていません。少し待ってから再度お試しください。</p>';
            return;
        }

        searchResults.innerHTML = '<p><div class="spinner"></div> 検索中...</p>';
        
        const query = searchInput.value.trim();
        const textTarget = searchTextTarget.value;
        const typeFilter = searchFilterType.value;
        const setFilter = searchFilterSet.value;
        const fuzzyThreshold = parseInt(fuzzyThresholdSlider.value, 10);
        
        if (!query && !typeFilter && !setFilter) {
            searchResults.innerHTML = '<p>検索キーワードまたはフィルターを入力してください。</p>';
            return;
        }

        lastFilteredCards = window.allCards.filter(card => {
            let textMatches = true;
            if (query) {
                let cardText = '';
                switch (textTarget) {
                    case 'name': cardText = card.name; break;
                    case 'effect': cardText = card.info.find(info => info.startsWith("このカードの効果は、「")) || ''; break;
                    case 'lore': cardText = card.info.find(info => info.startsWith("このカードの世界観は、「")) || ''; break;
                    default: cardText = card.name + ' ' + card.info.join(' '); break;
                }
                const normalizedCardText = normalizeText(cardText);
                const normalizedQuery = normalizeText(query);
                // 修正：部分一致検索とあいまい検索を正しく組み合わせる
                textMatches = normalizedCardText.includes(normalizedQuery) || levenshteinDistance(normalizedCardText, normalizedQuery) <= fuzzyThreshold;
            }
            const typeMatches = !typeFilter || card.info.some(info => info.includes(`このカードは${typeFilter}`));
            const setMatches = !setFilter || card.info.some(info => info.includes(`このカードの収録セットは、${setFilter}`));
            return textMatches && typeMatches && setMatches;
        });

        displaySearchResults(lastFilteredCards, query);
    }

    /**
     * 検索結果をHTMLとして整形し、表示します。
     * @param {Array} cards - フィルタリングされたカードの配列
     * @param {string} query - 元の検索クエリ
     */
    function displaySearchResults(cards, query) {
        if (!searchResults) return;
        if (cards.length > 0) {
            let resultsHtml = `<p>「<strong>${query || 'フィルター条件'}</strong>」の検索結果 (${cards.length}件):</p><ul>`;
            cards.forEach((card, index) => {
                resultsHtml += `<li><a href="#" class="card-name-link" data-card-index="${index}"><strong>${card.name}</strong></a></li>`;
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

    /**
     * オートコンプリートの候補を表示します。
     */
    function handleAutocomplete() {
        if (!searchInput || !autocompleteSuggestions) return;
        const query = searchInput.value.trim().toLowerCase();
        autocompleteSuggestions.innerHTML = '';
        if (query.length < 1) {
            autocompleteSuggestions.style.display = 'none';
            return;
        }
        const suggestions = window.allCards
            .filter(card => card.name.toLowerCase().includes(query))
            .map(card => card.name);

        if (suggestions.length > 0) {
            autocompleteSuggestions.style.display = 'block';
            suggestions.slice(0, 5).forEach(suggestion => {
                const div = document.createElement('div');
                div.textContent = suggestion;
                div.addEventListener('click', () => {
                    searchInput.value = suggestion;
                    autocompleteSuggestions.style.display = 'none';
                    performCardSearch();
                });
                autocompleteSuggestions.appendChild(div);
            });
        } else {
            autocompleteSuggestions.style.display = 'none';
        }
    }

    // --- イベントハンドラ ---

    function handleCardNameLinkClick(e) {
        e.preventDefault();
        const index = parseInt(e.target.closest('.card-name-link').dataset.cardIndex, 10);
        const card = lastFilteredCards[index];
        
        if (card && typeof window.showCardDetailModal === 'function') {
            window.showCardDetailModal(card, index, lastFilteredCards);
        } else {
            window.showCustomDialog('エラー', 'カード詳細の表示機能が見つかりませんでした。');
        }
    }
    
    // --- イベントリスナーの設定 ---
    
    const setupEventListeners = () => {
        if (performSearchButton) {
            performSearchButton.removeEventListener('click', performCardSearch);
            performSearchButton.addEventListener('click', performCardSearch);
        }
        if (searchInput) {
            searchInput.removeEventListener('keypress', handleEnterKey);
            searchInput.addEventListener('keypress', handleEnterKey);
            
            searchInput.removeEventListener('input', handleAutocomplete);
            searchInput.addEventListener('input', handleAutocomplete);

            searchInput.removeEventListener('blur', handleBlur);
            searchInput.addEventListener('blur', handleBlur);
        }
        if (fuzzyThresholdSlider) {
            fuzzyThresholdSlider.removeEventListener('input', updateFuzzyValue);
            fuzzyThresholdSlider.addEventListener('input', updateFuzzyValue);
        }
    };

    function handleEnterKey(e) {
        if (e.key === 'Enter') {
            performCardSearch();
        }
    }

    function handleBlur() {
        setTimeout(() => {
            if (autocompleteSuggestions) autocompleteSuggestions.style.display = 'none';
        }, 150);
    }
    
    function updateFuzzyValue(e) {
        if(fuzzyThresholdValue) {
            fuzzyThresholdValue.textContent = e.target.value;
        }
    }

    // --- 初期化処理 ---
    populateSearchFilters();
    setupEventListeners();
};

void 0;
