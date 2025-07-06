// js/sections/deckAnalysis.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initDeckAnalysisSection = async function() { // async を追加
    console.log("DeckAnalysis section initialized.");

    // allCards は main.js でロードされ、グローバル変数 window.allCards として利用可能
    // ここで allCards の再ロードは不要。window.allCards を直接使用する。
    if (!window.allCards || window.allCards.length === 0) {
        console.warn("DeckAnalysis section: window.allCards が空または無効です。一部機能が制限される可能性があります。");
        // この時点で allCards がない場合、機能が動作しない可能性があるため、ユーザーに通知することも検討
        // window.showCustomDialog('警告', 'カードデータがロードされていません。拡張機能の初期化が完了しているか確認してください。');
    }

    // === デッキ分析UIを初期化し、イベントリスナーを設定します。 ===
    // 各要素を関数内で取得
    const deckAnalysisImageUpload = document.getElementById('deck-analysis-image-upload');
    const recognizeDeckAnalysisButton = document.getElementById('recognize-deck-analysis-button');
    const recognizedDeckAnalysisList = document.getElementById('recognized-deck-analysis-list');
    const deckAnalysisSummary = document.getElementById('deck-analysis-summary');
    const suggestedCardsDiv = document.getElementById('suggested-cards');

    if (!deckAnalysisImageUpload || !recognizeDeckAnalysisButton || !recognizedDeckAnalysisList || !deckAnalysisSummary || !suggestedCardsDiv) {
        console.error("Deck analysis UI elements not found. Skipping initialization.");
        return;
    }

    // 初期状態をリセット
    recognizedDeckAnalysisList.innerHTML = '<p>認識されたデッキリストがここに表示されます。</p>';
    deckAnalysisSummary.innerHTML = '<p>分析結果がここに表示されます。</p>';
    suggestedCardsDiv.innerHTML = '<p>分析後におすすめカードが表示されます。</p>';
    recognizeDeckAnalysisButton.disabled = true;

    // イベントリスナーを再アタッチ
    // 既存のリスナーを削除してから追加することで、複数回初期化されてもリスナーが重複しないようにする
    if (deckAnalysisImageUpload) {
        deckAnalysisImageUpload.removeEventListener('change', handleDeckAnalysisImageUploadChange);
        deckAnalysisImageUpload.addEventListener('change', handleDeckAnalysisImageUploadChange);
    }

    const deckAnalysisSection = document.getElementById('tcg-deckAnalysis-section');
    if (deckAnalysisSection) {
        deckAnalysisSection.removeEventListener('paste', handleDeckAnalysisSectionPaste);
        deckAnalysisSection.addEventListener('paste', handleDeckAnalysisSectionPaste);
    }

    if (recognizeDeckAnalysisButton) {
        recognizeDeckAnalysisButton.removeEventListener('click', handleRecognizeDeckAnalysisButtonClick);
        recognizeDeckAnalysisButton.addEventListener('click', handleRecognizeDeckAnalysisButtonClick);
    }

    // イベントハンドラ関数
    function handleDeckAnalysisImageUploadChange() {
        if (deckAnalysisImageUpload.files.length > 0) {
            recognizeDeckAnalysisButton.disabled = false;
        } else {
            recognizeDeckAnalysisButton.disabled = true;
        }
    }

    async function handleDeckAnalysisSectionPaste(event) {
        const items = event.clipboardData.items;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const base64ImageData = e.target.result.split(',')[1];
                    await processDeckImage(base64ImageData, blob.type);
                };
                reader.readAsDataURL(blob);
                return;
            }
        }
        window.showCustomDialog('貼り付け失敗', 'クリップボードに画像がありませんでした。');
    }

    async function handleRecognizeDeckAnalysisButtonClick() {
        if (!deckAnalysisImageUpload.files || deckAnalysisImageUpload.files.length === 0) {
            window.showCustomDialog('エラー', 'デッキ画像をアップロードしてください。');
            return;
        }

        const file = deckAnalysisImageUpload.files[0];
        const reader = new FileReader();

        reader.onload = async (e) => {
            const base64ImageData = e.target.result.split(',')[1];
            await processDeckImage(base64ImageData, file.type);
        };
        reader.readAsDataURL(file);
    }

    async function processDeckImage(base64ImageData, mimeType) {
        recognizedDeckAnalysisList.innerHTML = '<p><div class="spinner"></div> 画像認識中...</p>';
        deckAnalysisSummary.innerHTML = '<p>分析結果がここに表示されます。</p>';
        suggestedCardsDiv.innerHTML = '<p>分析後におすすめカードが表示されます。</p>';

        let chatHistory = [];
        chatHistory.push({ role: "user", parts: [{ text: "この画像に写っているTCGカードのカード名を全てリストアップしてください。カード名のみをJSON配列形式で返してください。例: [\"カード名1\", \"カード名2\"]。もしカード名が複数行に分かれている場合は、結合して一つのカード名としてください。画像が不鮮明な場合でも、推測できる範囲でカード名を抽出してください。" },
            {
                inlineData: {
                    mimeType: mimeType,
                    data: base64ImageData
                }
            }
        ]});

        const payload = {
            contents: chatHistory,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "ARRAY",
                    items: { "type": "STRING" }
                }
            }
        };

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
                let recognizedCardNames;
                try {
                    recognizedCardNames = JSON.parse(jsonText);
                    if (!Array.isArray(recognizedCardNames)) {
                        throw new Error("API response is not an array.");
                    }
                } catch (parseError) {
                    console.error("Failed to parse recognized card names JSON:", parseError, "Raw JSON:", jsonText);
                    recognizedDeckAnalysisList.innerHTML = '<p>カード認識結果の解析に失敗しました。</p>';
                    return;
                }

                if (recognizedCardNames.length > 0) {
                    let recognizedHtml = '<h4>認識されたカード:</h4><ul>';
                    recognizedCardNames.forEach(cardName => {
                        recognizedHtml += `<li>${cardName}</li>`;
                    });
                    recognizedHtml += '</ul>';
                    recognizedDeckAnalysisList.innerHTML = recognizedHtml;

                    analyzeDeck(recognizedCardNames);

                } else {
                    recognizedDeckAnalysisList.innerHTML = '<p>カードを認識できませんでした。</p>';
                    deckAnalysisSummary.innerHTML = '<p>分析結果がここに表示されます。</p>';
                    suggestedCardsDiv.innerHTML = '<p>分析後におすすめカードが表示されます。</p>';
                }
            } else {
                recognizedDeckAnalysisList.innerHTML = '<p>画像認識に失敗しました。APIからの応答がありませんでした。</p>';
                deckAnalysisSummary.innerHTML = '<p>分析結果がここに表示されます。</p>';
                suggestedCardsDiv.innerHTML = '<p>分析後におすすめカードが表示されます。</p>';
            }
        } catch (error) {
            console.error("画像認識API呼び出しエラー:", error);
            recognizedDeckAnalysisList.innerHTML = '<p>画像認識中にエラーが発生しました。インターネット接続を確認してください。</p>';
            deckAnalysisSummary.innerHTML = '<p>分析結果がここに表示されます。</p>';
            suggestedCardsDiv.innerHTML = '<p>分析後におすすめカードが表示されます。</p>';
        }
    }

    /**
     * 認識されたカードリストからデッキを分析し、結果を表示します。
     * @param {string[]} cardNames - 認識されたカード名の配列。
     */
    function analyzeDeck(cardNames) {
        const deckAnalysisSummary = document.getElementById('deck-analysis-summary');
        const suggestedCardsDiv = document.getElementById('suggested-cards');

        if (!deckAnalysisSummary || !suggestedCardsDiv) return;

        // グローバルな window.allCards を使用
        const deckCards = window.allCards.filter(card => cardNames.includes(card.name));

        if (deckCards.length === 0) {
            deckAnalysisSummary.innerHTML = '<p>認識されたカードに対応するデータが見つかりませんでした。</p>';
            suggestedCardsDiv.innerHTML = '<p>分析後におすすめカードが表示されます。</p>';
            return;
        }

        // コストカーブの計算
        const costCurve = {};
        for (let i = 0; i <= 10; i++) { // 0コストから10コストまで
            costCurve[i] = 0;
        }
        costCurve['11+'] = 0; // 11コスト以上

        deckCards.forEach(card => {
            const costInfo = card.info.find(info => info.startsWith('このカードのコストは'));
            if (costInfo) {
                const costMatch = costInfo.match(/コストは(\d+)/);
                if (costMatch) {
                    const cost = parseInt(costMatch[1]);
                    if (cost <= 10) {
                        costCurve[cost]++;
                    } else {
                        costCurve['11+']++;
                    }
                }
            }
        });

        // タイプ別集計
        const typeDistribution = {};
        const cardTypes = ['モンスター', '魔法', '罠', 'エネルギー', 'フィールド']; // 主要なカードタイプ
        const speciesTypes = new Set(); // 種別（属性/カテゴリ）

        deckCards.forEach(card => {
            const typeInfo = card.info.find(info => 
                info.startsWith('このカードはモンスターです。') ||
                info.startsWith('このカードは魔法です。') ||
                info.startsWith('このカードは罠です。') ||
                info.startsWith('このカードはエネルギーです。') ||
                info.startsWith('このカードはフィールドです。')
            );
            if (typeInfo) {
                let type = '';
                if (typeInfo.includes('モンスター')) type = 'モンスター';
                else if (typeInfo.includes('魔法')) type = '魔法';
                else if (typeInfo.includes('罠')) type = '罠';
                else if (typeInfo.includes('エネルギー')) type = 'エネルギー';
                else if (typeInfo.includes('フィールド')) type = 'フィールド';
                
                typeDistribution[type] = (typeDistribution[type] || 0) + 1;
            }

            const speciesInfo = card.info.find(info => info.startsWith('このカードの種別は'));
            if (speciesInfo) {
                const speciesText = speciesInfo.replace('このカードの種別は', '').replace('です。', '');
                speciesText.split(',').forEach(s => {
                    const trimmedSpecies = s.trim();
                    if (trimmedSpecies && trimmedSpecies !== '無い') { // 「無い」は除外
                        speciesTypes.add(trimmedSpecies);
                    }
                });
            }
        });

        // 分析結果の表示
        let summaryHtml = `<h4>デッキ枚数: ${deckCards.length}枚</h4>`;
        summaryHtml += `<h5>コストカーブ:</h5><ul>`;
        for (const cost in costCurve) {
            summaryHtml += `<li>${cost}コスト: ${costCurve[cost]}枚</li>`;
        }
        summaryHtml += `</ul>`;

        summaryHtml += `<h5>タイプ別枚数:</h5><ul>`;
        cardTypes.forEach(type => {
            summaryHtml += `<li>${type}: ${typeDistribution[type] || 0}枚</li>`;
        });
        summaryHtml += `</ul>`;

        if (speciesTypes.size > 0) {
            summaryHtml += `<h5>主要な種別:</h5><ul>`;
            Array.from(speciesTypes).sort().forEach(species => {
                summaryHtml += `<li>${species}</li>`; // ここもsummaryHtmlに追加
            });
            summaryHtml += `</ul>`;
        } else {
            summaryHtml += `<p>主要な種別は見つかりませんでした。</p>`;
        }

        deckAnalysisSummary.innerHTML = summaryHtml;

        // おすすめカードのサジェスト
        suggestCards(deckCards, Array.from(speciesTypes));
    }

    /**
     * デッキの分析結果に基づいておすすめカードをサジェストします。
     * (簡易的なルールベースのサジェスト)
     * @param {Object[]} deckCards - デッキ内のカードオブジェクトの配列。
     * @param {string[]} deckSpeciesTypes - デッキ内の主要な種別（属性/カテゴリ）の配列。
     */
    async function suggestCards(deckCards, deckSpeciesTypes) {
        const suggestedCardsDiv = document.getElementById('suggested-cards');
        if (!suggestedCardsDiv) return;

        let suggestions = [];
        const totalCards = deckCards.length;
        const monsterCount = deckCards.filter(card => card.info.some(info => info.includes('このカードはモンスターです。'))).length;
        const magicCount = deckCards.filter(card => card.info.some(info => info.includes('このカードは魔法です。'))).length;
        const trapCount = deckCards.filter(card => card.info.some(info => info.includes('このカードは罠です。'))).length;
        const energyCount = deckCards.filter(card => card.info.some(info => info.includes('このカードはエネルギーです。'))).length;
        const fieldCount = deckCards.filter(card => card.info.some(info => info.includes('このカードはフィールドです。'))).length;

        // 例: デッキ枚数が少ない場合
        if (totalCards < 40) { // 一般的なデッキ枚数を想定
            suggestions.push("デッキ枚数を40枚以上にすることをおすすめします。");
        }

        // 例: モンスターが少ない場合
        if (monsterCount / totalCards < 0.4) { // モンスター比率が低い場合
            suggestions.push("より多くのモンスターカードを追加して、盤面展開力を高めることを検討してください。");
            const monsterSuggestions = window.allCards.filter(card => // window.allCards を使用
                card.info.some(info => info.includes('このカードはモンスターです。')) &&
                !deckCards.some(deckCard => deckCard.name === card.name) // デッキにないカード
            ).slice(0, 3).map(card => card.name);
            if (monsterSuggestions.length > 0) {
                suggestions.push(`おすすめモンスター: ${monsterSuggestions.join(', ')}`);
            }
        }

        // 例: ドローソースが少ない場合 (効果に「引く」を含むカードを検出)
        const drawCards = deckCards.filter(card => card.info.some(info => info.includes('枚引く')));
        if (drawCards.length < 3) { // ドローソースが少ない場合
            suggestions.push("手札の補充を助けるドローソースカードの追加を検討してください。");
            const drawSuggestions = window.allCards.filter(card => // window.allCards を使用
                card.info.some(info => info.includes('枚引く')) &&
                !deckCards.some(deckCard => deckCard.name === card.name)
            ).slice(0, 2).map(card => card.name);
            if (drawSuggestions.length > 0) {
                suggestions.push(`おすすめドローソース: ${drawSuggestions.join(', ')}`);
            }
        }

        // 例: 特定の種別（属性）に特化している場合、その種別のサポートカードを提案
        if (deckSpeciesTypes.length > 0) {
            deckSpeciesTypes.forEach(species => {
                const speciesSupportCards = window.allCards.filter(card => // window.allCards を使用
                    card.info.some(info => info.includes(`[${species}]`)) && // その種別をサポートする効果
                    !deckCards.some(deckCard => deckCard.name === card.name) && // デッキにないカード
                    !card.info.some(info => info.includes('このカードはモンスターです。')) // モンスター以外のサポートカードを優先
                ).slice(0, 2).map(card => card.name);
                if (speciesSupportCards.length > 0) {
                    suggestions.push(`「${species}」タイプのサポートとして、${speciesSupportCards.join(', ')} などのカードを検討してください。`);
                }
            });
        }

        // 例: コストカーブの偏り
        const lowCostCards = deckCards.filter(card => {
            const costInfo = card.info.find(info => info.startsWith('このカードのコストは'));
            if (costInfo) {
                const costMatch = costInfo.match(/コストは(\d+)/);
                if (costMatch) {
                    const cost = parseInt(costMatch[1]);
                    return cost <= 2;
                }
            }
            return false;
        }).length;

        const highCostCards = deckCards.filter(card => {
            const costInfo = card.info.find(info => info.startsWith('このカードのコストは'));
            if (costInfo) {
                const costMatch = costInfo.match(/コストは(\d+)/);
                if (costMatch) {
                    const cost = parseInt(costMatch[1]);
                    return cost >= 7;
                }
            }
            return false;
        }).length;

        if (lowCostCards / totalCards < 0.2) {
            suggestions.push("序盤の展開を安定させるために、低コストのカードを増やすことを検討してください。");
        } else if (highCostCards / totalCards > 0.3 && energyCount < 5) { // 高コストが多いのにエネルギーが少ない
            suggestions.push("高コストカードが多いようです。エネルギーカードの枚数を増やすことを検討してください。");
        }


        if (suggestions.length > 0) {
            let suggestionHtml = `<h4>以下の点を検討してみてください:</h4><ul>`;
            suggestions.forEach(s => {
                suggestionHtml += `<li>${s}</li>`;
            });
            suggestionHtml += `</ul>`;
            suggestedCardsDiv.innerHTML = suggestionHtml;
        } else {
            suggestedCardsDiv.innerHTML = '<p>現在のデッキはバランスが良いようです！</p>';
        }
    }
}; // End of initDeckAnalysisSection
