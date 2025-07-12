// js/sections/minigames.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initMinigamesSection = async function() {
    // ★修正点: カードデータがロードされるまで待機
    try {
        await window.TCG_ASSISTANT.cardDataReady;
        console.log("Minigames section initialized (v2.0). Card data is ready.");
    } catch (error) {
        console.error("Minigames: Failed to wait for card data.", error);
        await window.showCustomDialog('エラー', 'クイズの初期化に必要なカードデータの読み込みに失敗しました。');
        return;
    }

    // Firefox互換性のためのbrowserオブジェクトのフォールバック
    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    // 現在のクイズの状態を管理する変数
    let currentQuiz = {
        type: null, // 'cardName', 'enlarge', 'silhouette', 'mosaic'
        card: null,
        hintIndex: 0,
        attemptCount: 0, // イラストクイズ用
        quizCanvas: null,
        quizCtx: null,
        fullCardImage: null, // フルカード画像用 (例: cardName.png)
        transparentIllustrationImage: null, // 透過イラスト画像用 (シルエット用: cardName_transparent.png)
        illustrationImage: null, // シルエットクイズの背景イラスト画像用 (cardName_illust.png)
        originalImageData: null // モザイク化クイズ用 (これはフルカード画像から取得)
    };

    // 各UI要素を関数内で取得
    const quizCardNameButton = document.getElementById('quiz-card-name');
    const quizIllustrationEnlargeButton = document.getElementById('quiz-illustration-enlarge');
    const quizIllustrationSilhouetteButton = document.getElementById('quiz-illustration-silhouette');
    const quizIllustrationMosaicButton = document.getElementById('quiz-illustration-mosaic');

    const quizDisplayArea = document.getElementById('quiz-display-area');
    const quizTitle = document.getElementById('quiz-title');
    const quizHintArea = document.getElementById('quiz-hint-area');
    const quizImageArea = document.getElementById('quiz-image-area');
    const quizCanvas = document.getElementById('quiz-canvas');
    const quizAnswerInput = document.getElementById('quiz-answer-input');
    const quizSubmitButton = document.getElementById('quiz-submit-button');
    const quizResultArea = document.getElementById('quiz-result-area');
    const quizAnswerDisplay = document.getElementById('quiz-answer-display');
    const quizNextButton = document.getElementById('quiz-next-button');
    const quizResetButton = document.getElementById('quiz-reset-button');

    // quizCanvasとquizCtxがnullでないことを確認し、設定
    if (quizCanvas) {
        currentQuiz.quizCanvas = quizCanvas;
        currentQuiz.quizCtx = quizCanvas.getContext('2d');
    }

    /**
     * クイズの初期化
     * クイズの状態をリセットし、UIを初期表示に戻します。
     */
    function resetQuiz() {
        currentQuiz.type = null;
        currentQuiz.card = null;
        currentQuiz.hintIndex = 0;
        currentQuiz.attemptCount = 0;
        currentQuiz.fullCardImage = null;
        currentQuiz.transparentIllustrationImage = null;
        currentQuiz.illustrationImage = null;
        currentQuiz.originalImageData = null;

        // UI要素の表示状態と内容をリセット
        if (quizDisplayArea) quizDisplayArea.style.display = 'none';
        if (quizTitle) quizTitle.textContent = '';
        if (quizHintArea) quizHintArea.innerHTML = '';
        if (quizImageArea) quizImageArea.style.display = 'none';
        if (quizCanvas) quizCanvas.style.display = 'none';
        if (quizAnswerInput) quizAnswerInput.value = '';
        if (quizResultArea) {
            quizResultArea.textContent = '';
            quizResultArea.className = 'quiz-result-area'; // クラスもリセット
        }
        if (quizAnswerDisplay) quizAnswerDisplay.textContent = '';
        if (quizNextButton) quizNextButton.style.display = 'none';
        if (quizSubmitButton) quizSubmitButton.style.display = 'inline-block'; // 解答ボタンを表示
        if (quizAnswerInput) quizAnswerInput.disabled = false; // 入力フィールドを有効化
    }

    /**
     * クイズを開始します。
     * @param {string} type - クイズのタイプ ('cardName', 'enlarge', 'silhouette', 'mosaic')
     */
    async function startQuiz(type) {
        // ★修正点: ここに来る時点でallCardsはロード済みのはずだが、念のためチェック
        if (!window.TCG_ASSISTANT.allCards || window.TCG_ASSISTANT.allCards.length === 0) {
            await window.showCustomDialog('エラー', 'カードデータが利用できません。');
            return;
        }
        resetQuiz(); // クイズ状態をリセット
        currentQuiz.type = type;

        let cardSelected = false;
        const maxAttemptsForImageLoad = 20; // 画像が見つかるまで試行する最大回数

        // クイズ用のカードをランダムに選択し、必要な画像をロード
        for (let i = 0; i < maxAttemptsForImageLoad; i++) {
            currentQuiz.card = window.TCG_ASSISTANT.allCards[Math.floor(Math.random() * window.TCG_ASSISTANT.allCards.length)];
            if (type !== 'cardName') { // イラストクイズの場合
                const cardFileName = currentQuiz.card.image_filename; // image_filenameを使用
                const imageUrl = browser.runtime.getURL(`images/cards/${cardFileName}.png`);
                try {
                    // フルカード画像の存在確認
                    const response = await fetch(imageUrl, { method: 'HEAD' });
                    if (response.ok) {
                        // 必要な画像をロード
                        await loadImageForQuiz(cardFileName, type);
                        cardSelected = true;
                        break;
                    } else {
                        console.warn(`Minigames: 画像ファイルが見つかりません: ${imageUrl}`);
                    }
                } catch (error) {
                    console.warn(`Minigames: 画像ファイルの確認中にエラーが発生しました: ${error}`);
                }
            } else { // カード名当てクイズの場合、画像は必須ではない
                cardSelected = true;
                break;
            }
        }

        // 適切なカードが見つからなかった場合
        if (!cardSelected) {
            await window.showCustomDialog('エラー', 'クイズに必要な画像が利用可能なカードが見つかりませんでした。別のクイズを試すか、画像ファイルが正しく配置されているか確認してください。');
            resetQuiz(); // クイズをリセット
            return;
        }

        // クイズUIを表示
        if (quizDisplayArea) quizDisplayArea.style.display = 'block';
        if (quizImageArea) quizImageArea.style.display = 'none'; // 初期状態では非表示

        if (quizTitle) quizTitle.textContent = getQuizTitle(type); // クイズタイトルを設定

        if (type === 'cardName') {
            displayCardNameQuizHint(); // カード名当てクイズのヒントを表示
        } else { // イラストクイズの場合
            if (quizImageArea) quizImageArea.style.display = 'flex'; // 画像エリアを表示
            if (quizCanvas) quizCanvas.style.display = 'block'; // Canvasを表示
            drawQuizImage(); // クイズ画像を描画
        }
    }

    /**
     * クイズのタイトルを返します。
     * @param {string} type - クイズのタイプ。
     * @returns {string} クイズのタイトル。
     */
    function getQuizTitle(type) {
        switch (type) {
            case 'cardName': return 'カード名当てクイズ';
            case 'enlarge': return 'イラスト拡大クイズ';
            case 'silhouette': return 'イラストシルエットクイズ';
            case 'mosaic': return 'イラストモザイク化クイズ';
            default: return 'ミニゲーム';
        }
    }

    /**
     * カード名当てクイズのヒントを表示します。
     */
    function displayCardNameQuizHint() {
        if (!currentQuiz.card || !quizHintArea || !quizNextButton) return;
        if (currentQuiz.hintIndex < currentQuiz.card.info.length) {
            quizHintArea.innerHTML += (currentQuiz.hintIndex > 0 ? '<br>' : '') + currentQuiz.card.info[currentQuiz.hintIndex];
            currentQuiz.hintIndex++;
            quizNextButton.style.display = 'none'; // ヒント表示後は「次のヒント」ボタンは非表示
        } else {
            quizHintArea.innerHTML += '<br><br>これ以上ヒントはありません。';
            endQuiz(false); // ヒントがなくなったらクイズ終了
        }
    }

    /**
     * クイズに必要な画像をCanvasにロードします。
     * @param {string} cardFileName - カードの画像ファイル名 (拡張子なし)。
     * @param {string} quizType - クイズのタイプ。
     * @returns {Promise<void>} 画像ロードが完了したら解決するPromise。
     */
    async function loadImageForQuiz(cardFileName, quizType) {
        // 画像ロードロジックは変更なし
        // ... (省略) ...
    }

    // ... (drawQuizImage, drawEnlargedImage, drawSilhouetteImage, drawMosaicImage, checkAnswer, endQuizなどの他の関数は変更なし) ...
    
    // イベントリスナーの再アタッチも変更なし
    // ... (省略) ...

    resetQuiz(); // 初期状態ではクイズUIを非表示に
};
// void 0; は不要
