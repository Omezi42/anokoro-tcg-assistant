// js/sections/search.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initSearchSection = async function() {
    console.log("Search section initialized.");

    // Firefox互換性のためのbrowserオブジェクトのフォールバック
    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    // === 検索セクションのロジック ===
    // 各UI要素を関数内で取得
    const searchInput = document.getElementById('search-input');
    const performSearchButton = document.getElementById('perform-search-button');
    const searchResults = document.getElementById('search-results');
    const searchFilterType = document.getElementById('search-filter-type');
    const searchFilterSet = document.getElementById('search-filter-set');
    const searchTextTarget = document.getElementById('search-text-target');

    const autocompleteSuggestions = document.getElementById('autocomplete-suggestions');

    // あいまい検索の許容誤字脱字閾値
    const fuzzyThreshold = 2; // 例: 2文字までの違いを許容

    /**
     * 検索フィルターのセットオプションを動的に追加します。
     * window.allCardsから利用可能なセット名を抽出し、ドロップダウンに設定します。
     */
    function populateSearchFilters() {
        const sets = new Set();
        if (window.allCards) { // window.allCards がロードされていることを確認
            window.allCards.forEach(card => {
                if (card.info && card.info.length > 0) {
                    const setInfo = card.info.find(info => info.startsWith('このカードの収録セットは、'));
                    if (setInfo) {
                        const setName = setInfo.replace('このカードの収録セットは、', '').replace('です。', '');
                        sets.add(setName);
                    }
                }
            });
        }
        if (searchFilterSet) {
            searchFilterSet.innerHTML = '<option value="">全て</option>'; // デフォルトオプション
            Array.from(sets).sort().forEach(set => {
                const option = document.createElement('option');
                option.value = set;
                option.textContent = set;
                searchFilterSet.appendChild(option);
            });
        }
    }

    /**
     * カード情報を正規化するヘルパー関数。
     * 半角カタカナ、ひらがなを全角カタカナに変換し、スペースを削除します。
     * @param {string} text - 正規化する文字列。
     * @returns {string} 正規化された文字列。
     */
    function normalizeText(text) {
        // 半角カタカナを全角カタカナに変換
        text = text.replace(/[\uFF61-\uFF9F]/g, (s) => {
            return String.fromCharCode(s.charCodeAt(0) + 0x20);
        });
        // 全角ひらがなを全角カタカナに変換
        text = text.replace(/[\u3041-\u3096]/g, (s) => {
            return String.fromCharCode(s.charCodeAt(0) + 0x60);
        });
        // スペースを削除
        text = text.replace(/\s+/g, '');
        return text.toLowerCase();
    }

    /**
     * レーベンシュタイン距離を計算する関数 (あいまい検索用)。
     * 2つの文字列間の編集距離を返します。
     * @param {string} s1 - 文字列1。
     * @param {string} s2 - 文字列2。
     * @returns {number} レーベンシュタイン距離。
     */
    function levenshteinDistance(s1, s2) {
        s1 = normalizeText(s1);
        s2 = normalizeText(s2);

        const m = s1.length;
        const n = s2.length;
        const dp = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = (s1[i - 1] === s2[j - 1]) ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,      // deletion
                    dp[i][j - 1] + 1,      // insertion
                    dp[i - 1][j - 1] + cost // substitution
                );
            }
            // 検索クエリが長すぎる場合、パフォーマンスのために早期終了
            if (dp[i][n] > fuzzyThreshold + 1) { 
                return Infinity;
            }
        }
        return dp[m][n];
    }

    /**
     * カード検索を実行する関数。
     * 検索クエリとフィルターに基づいてカードを検索し、結果をUIに表示します。
     * @param {string} query - 検索クエリ。
     * @param {string} textTarget - テキスト検索対象 ('all', 'name', 'effect', 'lore')。
     * @param {string} typeFilter - カードタイプフィルター。
     * @param {string} setFilter - 収録セットフィルター。
     */
    async function performCardSearch(query, textTarget, typeFilter, setFilter) {
        if (!searchResults) return;
        searchResults.innerHTML = '<p><div class="spinner"></div> 検索中...</p>'; // ローディングスピナー表示

        const normalizedQuery = normalizeText(query);

        let filteredCards = window.allCards.filter(card => { // window.allCards を使用
            // テキスト検索
            let textMatches = true;
            if (query) {
                let cardText = '';
                switch (textTarget) {
                    case 'name':
                        cardText = card.name;
                        break;
                    case 'effect':
                        // カード効果情報を見つけて抽出
                        const effectInfo = card.info.find(info => info.startsWith("このカードの効果は、「"));
                        cardText = effectInfo ? effectInfo.replace("このカードの効果は、「", "").replace("」です。", "") : '';
                        break;
                    case 'lore':
                        // カード世界観情報を見つけて抽出
                        const loreInfo = card.info.find(info => info.startsWith("このカードの世界観は、「"));
                        cardText = loreInfo ? loreInfo.replace("このカードの世界観は、「", "").replace("」です。", "") : '';
                        break;
                    case 'all':
                    default:
                        // カード名、効果、世界観を結合して検索
                        const nameInfo = card.name;
                        const allEffectInfo = card.info.find(info => info.startsWith("このカードの効果は、「"));
                        const allLoreInfo = card.info.find(info => info.startsWith("このカードの世界観は、「"));
                        cardText = `${nameInfo} ${allEffectInfo || ''} ${allLoreInfo || ''}`;
                        break;
                }
                // レーベンシュタイン距離を使ったあいまい検索、または部分文字列検索
                textMatches = levenshteinDistance(cardText, normalizedQuery) <= fuzzyThreshold || normalizeText(cardText).includes(normalizedQuery);
            }

            // タイプフィルター
            const matchesType = !typeFilter || card.info.some(info => info.includes(`このカードは${typeFilter}`));

            // セットフィルター
            const matchesSet = !setFilter || card.info.some(info => info.includes(`このカードの収録セットは、${setFilter}`));

            return textMatches && matchesType && matchesSet;
        });

        if (filteredCards.length > 0) {
            let resultsHtml = `<p>「<strong>${query || '全てのカード'}</strong>」の検索結果 (${filteredCards.length}件):</p><ul>`;
            filteredCards.forEach(card => {
                resultsHtml += `<li><a href="#" class="card-name-link" data-card-name="${card.name}"><strong>${card.name}</strong></a><br>`;
                card.info.forEach(info => {
                    if (info.startsWith("このカードの効果は、「")) {
                        resultsHtml += `<strong>効果:</strong> ${info.replace("このカードの効果は、「", "").replace("」です。", "")}<br>`;
                    } else if (info.startsWith("このカードの世界観は、「")) {
                        resultsHtml += `<strong>世界観:</strong> ${info.replace("このカードの世界観は、「", "").replace("」です。", "")}<br>`;
                    }
                });
                resultsHtml += `</li>`;
            });
            resultsHtml += `</ul>`;
            searchResults.innerHTML = resultsHtml;

            // カード名リンクにイベントリスナーを追加
            searchResults.querySelectorAll('.card-name-link').forEach(link => {
                link.removeEventListener('click', handleCardNameLinkClick); // 既存のリスナーを削除
                link.addEventListener('click', handleCardNameLinkClick);
            });

        } else {
            // Gemini APIを呼び出して架空のカードを生成 (検索結果がない場合のみ)
            let chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: `TCGカードの検索機能です。以下の条件に合致する架空のカード名、効果、世界観の情報をJSON形式で3つ生成してください。もし情報が見つからない場合は「見つかりませんでした」と返してください。
            フォーマット：
            [{ "cardName": "カード名", "effect": "効果", "lore": "世界観" }]
            条件: キーワード: ${query || 'なし'}, テキスト対象: ${textTarget}, タイプ: ${typeFilter || '指定なし'}, セット: ${setFilter || '指定なし'}` }] });

            const payload = {
                contents: chatHistory,
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                "cardName": { "type": "STRING" },
                                "effect": { "type": "STRING" },
                                "lore": { "type": "STRING" }
                            },
                            "propertyOrdering": ["cardName", "effect", "lore"]
                        }
                    }
                }
            }

            const apiKey = ""; // Canvas環境で自動提供
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();

                if (result.candidates && result.candidates.length > 0 &&
                    result.candidates[0].content && result.candidates[0].content.parts &&
                    result.candidates[0].content.parts.length > 0) {
                    const jsonText = result.candidates[0].content.parts[0].text;
                    const parsedJson = JSON.parse(jsonText);

                    if (parsedJson.length > 0 && parsedJson[0].cardName !== "見つかりませんでした") {
                        let resultsHtml = `<p>「<strong>${query || '全てのカード'}</strong>」の検索結果 (AI生成):</p><ul>`;
                        parsedJson.forEach(card => {
                            resultsHtml += `<li><strong>カード名:</strong> ${card.cardName}<br><strong>効果:</strong> ${card.effect}<br><strong>世界観:</strong> ${card.lore}</li>`;
                        });
                        resultsHtml += `</ul>`;
                        searchResults.innerHTML = resultsHtml;
                    } else {
                        searchResults.innerHTML = '<p>検索結果が見つかりませんでした。</p>';
                    }
                } else {
                    searchResults.innerHTML = '<p>検索結果が見つかりませんでした。</p>';
                }
            } catch (error) {
                console.error("Search: Gemini API呼び出しエラー:", error);
                searchResults.innerHTML = '<p>検索中にエラーが発生しました。</p>';
            }
        }
    }

    /**
     * カード詳細を表示するポップアップを生成します。
     * @param {string} cardName - 表示するカードの名前。
     */
    function displayCardDetails(cardName) {
        const card = window.allCards.find(c => c.name === cardName); // window.allCards を使用
        if (!card) {
            window.showCustomDialog('エラー', 'カード詳細が見つかりませんでした。');
            return;
        }

        const detailHtml = `
            <h3>${card.name}</h3>
            <ul>
                ${card.info.map(info => `<li>${info}</li>`).join('')}
            </ul>
            <button id="close-card-detail-popup">閉じる</button>
        `;

        const popup = document.createElement('div');
        popup.className = 'card-detail-popup';
        popup.innerHTML = detailHtml;
        document.body.appendChild(popup);

        // イベントリスナーを再アタッチ
        popup.querySelector('#close-card-detail-popup').removeEventListener('click', handleCloseCardDetailPopupClick);
        popup.querySelector('#close-card-detail-popup').addEventListener('click', handleCloseCardDetailPopupClick);
    }

    // --- イベントハンドラ関数 ---
    function handleCardNameLinkClick(e) {
        e.preventDefault(); // デフォルトのリンク動作を防止
        const cardName = e.target.dataset.cardName;
        displayCardDetails(cardName);
    }

    function handleCloseCardDetailPopupClick(e) {
        e.target.closest('.card-detail-popup').remove(); // ポップアップを閉じる
    }

    function handlePerformSearchButtonClick() {
        if (!searchInput || !searchTextTarget || !searchFilterType || !searchFilterSet) return;
        const query = searchInput.value.trim();
        const textTarget = searchTextTarget.value;
        const typeFilter = searchFilterType.value;
        const setFilter = searchFilterSet.value;

        if (query || typeFilter || setFilter) {
            performCardSearch(query, textTarget, typeFilter, setFilter);
        } else {
            if (searchResults) searchResults.innerHTML = '<p>検索キーワードまたはフィルターを入力してください。</p>';
        }
    }

    function handleSearchInputInput() {
        const query = searchInput.value.trim().toLowerCase();
        autocompleteSuggestions.innerHTML = ''; // サジェストリストをクリア

        if (query.length > 0) {
            const suggestions = window.allCards.filter(card => // window.allCards を使用
                card.name.toLowerCase().includes(query)
            ).map(card => card.name);

            if (suggestions.length > 0) {
                autocompleteSuggestions.style.display = 'block';
                suggestions.slice(0, 5).forEach(suggestion => { // 最大5件表示
                    const div = document.createElement('div');
                    div.textContent = suggestion;
                    div.removeEventListener('click', handleAutocompleteSuggestionClick); // 既存のリスナーを削除
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
        searchInput.value = event.currentTarget.textContent; // 選択されたサジェストを入力フィールドに設定
        autocompleteSuggestions.style.display = 'none'; // サジェストリストを非表示に
        performSearchButton.click(); // オートコンプリート選択後、検索を実行
    }

    function handleSearchInputBlur() {
        // blurイベントはclickイベントより先に発火することがあるため、少し遅延させてリストを非表示にする
        setTimeout(() => {
            if (autocompleteSuggestions) autocompleteSuggestions.style.display = 'none';
        }, 100); 
    }

    // --- イベントリスナーの再アタッチ ---
    if (performSearchButton) {
        performSearchButton.removeEventListener('click', handlePerformSearchButtonClick);
        performSearchButton.addEventListener('click', handlePerformSearchButtonClick);
    }

    if (searchInput) {
        searchInput.removeEventListener('input', handleSearchInputInput);
        searchInput.addEventListener('input', handleSearchInputInput);
        searchInput.removeEventListener('blur', handleSearchInputBlur);
        searchInput.addEventListener('blur', handleSearchInputBlur);
    }

    // 検索フィルターを初期化（初回ロード時）
    populateSearchFilters();
};
void 0; // Explicitly return undefined for Firefox compatibility
