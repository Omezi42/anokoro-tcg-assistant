// js/sections/search.js
export function initialize() {
    if (document.body.dataset.searchInitialized === 'true') return;
    document.body.dataset.searchInitialized = 'true';

    console.log("Search section initialized.");

    const elements = {
        searchInput: document.getElementById('search-input'),
        performSearchButton: document.getElementById('perform-search-button'),
        searchResults: document.getElementById('search-results'),
        searchFilterType: document.getElementById('search-filter-type'),
        searchFilterSet: document.getElementById('search-filter-set'),
        searchTextTarget: document.getElementById('search-text-target'),
        autocompleteSuggestions: document.getElementById('autocomplete-suggestions'),
        fuzzyThresholdSlider: document.getElementById('fuzzy-threshold-slider'),
        fuzzyThresholdValue: document.getElementById('fuzzy-threshold-value')
    };
    let lastFilteredCards = [];

    const populateSearchFilters = () => {
        const cards = window.tcgAssistant.allCards;
        if (!cards || cards.length === 0) return;
        const sets = new Set(cards.map(c => c.info.find(i => i.startsWith('このカードの収録セットは、'))?.replace('このカードの収録セットは、', '').replace('です。', '')).filter(Boolean));
        elements.searchFilterSet.innerHTML = '<option value="">全て</option>';
        [...sets].sort().forEach(set => {
            const option = document.createElement('option');
            option.value = set;
            option.textContent = set;
            elements.searchFilterSet.appendChild(option);
        });
    };

    const normalizeText = (text = '') => text.replace(/[\uFF61-\uFF9F]/g, s => String.fromCharCode(s.charCodeAt(0) + 0x20)).replace(/[\u3041-\u3096]/g, s => String.fromCharCode(s.charCodeAt(0) + 0x60)).replace(/\s+/g, '').toLowerCase();
    
    const levenshteinDistance = (s1, s2) => {
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
    };

    const performCardSearch = () => {
        const { allCards } = window.tcgAssistant;
        if (!allCards || allCards.length === 0) {
            elements.searchResults.innerHTML = '<p>カードデータが読み込まれていません。</p>';
            return;
        }
        elements.searchResults.innerHTML = '<div class="spinner"></div>';
        
        const query = elements.searchInput.value.trim();
        const textTarget = elements.searchTextTarget.value;
        const typeFilter = elements.searchFilterType.value;
        const setFilter = elements.searchFilterSet.value;
        const fuzzyThreshold = parseInt(elements.fuzzyThresholdSlider.value, 10);

        lastFilteredCards = allCards.filter(card => {
            let textMatches = true;
            if (query) {
                let cardText;
                switch (textTarget) {
                    case 'name': cardText = card.name; break;
                    case 'effect': cardText = card.info.find(i => i.startsWith("このカードの効果は、「")) || ''; break;
                    case 'lore': cardText = card.info.find(i => i.startsWith("このカードの世界観は、「")) || ''; break;
                    default: cardText = card.name + ' ' + card.info.join(' '); break;
                }
                const normalizedCardText = normalizeText(cardText);
                const normalizedQuery = normalizeText(query);
                textMatches = normalizedCardText.includes(normalizedQuery) || levenshteinDistance(normalizedCardText, normalizedQuery) <= fuzzyThreshold;
            }
            const typeMatches = !typeFilter || card.info.some(info => info.includes(`このカードは${typeFilter}`));
            const setMatches = !setFilter || card.info.some(info => info.includes(`このカードの収録セットは、${setFilter}`));
            return textMatches && typeMatches && setMatches;
        });

        displaySearchResults(lastFilteredCards, query);
    };

    const displaySearchResults = (cards, query) => {
        if (cards.length > 0) {
            elements.searchResults.innerHTML = `<p>「<strong>${query || 'フィルター条件'}</strong>」の検索結果 (${cards.length}件):</p><ul>` +
                cards.map((card, index) => `<li><a href="#" class="card-name-link" data-index="${index}"><strong>${card.name}</strong></a></li>`).join('') +
                `</ul>`;
        } else {
            elements.searchResults.innerHTML = '<p>検索結果が見つかりませんでした。</p>';
        }
    };
    
    elements.searchResults.addEventListener('click', (e) => {
        const link = e.target.closest('.card-name-link');
        if (link) {
            e.preventDefault();
            const index = parseInt(link.dataset.index, 10);
            window.showCardDetailModal(lastFilteredCards[index], index, lastFilteredCards);
        }
    });

    elements.performSearchButton.addEventListener('click', performCardSearch);
    elements.searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performCardSearch(); });
    elements.fuzzyThresholdSlider.addEventListener('input', (e) => { elements.fuzzyThresholdValue.textContent = e.target.value; });

    if (window.tcgAssistant.allCards.length > 0) {
        populateSearchFilters();
    } else {
        document.addEventListener('cardsLoaded', populateSearchFilters, { once: true });
    }
}
