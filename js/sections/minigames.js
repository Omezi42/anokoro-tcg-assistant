// js/sections/minigames.js - 修正版 v2.4

window.initMinigamesSection = async function() {
    // カードデータがロードされるまで待機
    try {
        await window.TCG_ASSISTANT.cardDataReady;
        console.log("Minigames section initialized (v2.4). Card data is ready.");
    } catch (error) {
        console.error("Minigames: Failed to wait for card data.", error);
        await window.showCustomDialog('エラー', 'クイズの初期化に必要なカードデータの読み込みに失敗しました。');
        return;
    }

    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    // 現在のクイズの状態を管理する変数
    let currentQuiz = {
        type: null,
        card: null,
        hintIndex: 0,
        attemptCount: 0,
        quizCanvas: null,
        quizCtx: null,
        fullCardImage: null,
        transparentIllustrationImage: null,
        illustrationImage: null,
        originalImageData: null
    };

    // UI要素の取得
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

    if (quizCanvas) {
        currentQuiz.quizCanvas = quizCanvas;
        currentQuiz.quizCtx = quizCanvas.getContext('2d');
    }

    function resetQuiz() {
        Object.assign(currentQuiz, {
            type: null, card: null, hintIndex: 0, attemptCount: 0,
            fullCardImage: null, transparentIllustrationImage: null,
            illustrationImage: null, originalImageData: null
        });
        if (quizDisplayArea) quizDisplayArea.style.display = 'none';
        if (quizTitle) quizTitle.textContent = '';
        if (quizHintArea) quizHintArea.innerHTML = '';
        if (quizImageArea) quizImageArea.style.display = 'none';
        if (quizCanvas) quizCanvas.style.display = 'none';
        if (quizAnswerInput) quizAnswerInput.value = '';
        if (quizResultArea) {
            quizResultArea.textContent = '';
            quizResultArea.className = 'quiz-result-area';
        }
        if (quizAnswerDisplay) quizAnswerDisplay.textContent = '';
        if (quizNextButton) quizNextButton.style.display = 'none';
        if (quizSubmitButton) quizSubmitButton.style.display = 'inline-block';
        if (quizAnswerInput) quizAnswerInput.disabled = false;
    }

    async function startQuiz(type) {
        if (!window.TCG_ASSISTANT.allCards || window.TCG_ASSISTANT.allCards.length === 0) {
            await window.showCustomDialog('エラー', 'カードデータが利用できません。');
            return;
        }
        resetQuiz();
        currentQuiz.type = type;

        let cardSelected = false;
        const maxAttempts = 30;

        for (let i = 0; i < maxAttempts; i++) {
            currentQuiz.card = window.TCG_ASSISTANT.allCards[Math.floor(Math.random() * window.TCG_ASSISTANT.allCards.length)];
            
            const cardFileName = currentQuiz.card.name;
            if (!cardFileName || (type === 'cardName' && (!currentQuiz.card.info || currentQuiz.card.info.length === 0))) {
                console.warn(`Card has no name or no hints. Skipping.`);
                continue;
            }

            if (type !== 'cardName') {
                try {
                    await loadImageForQuiz(cardFileName, type);
                    cardSelected = true;
                    break;
                } catch (error) {
                    console.warn(`Failed to load images for ${cardFileName}:`, error.message);
                }
            } else {
                cardSelected = true;
                break;
            }
        }

        if (!cardSelected) {
            await window.showCustomDialog('エラー', 'クイズに適したカードが見つかりませんでした。');
            resetQuiz();
            return;
        }

        if (quizDisplayArea) quizDisplayArea.style.display = 'block';
        if (quizTitle) quizTitle.textContent = getQuizTitle(type);

        if (type === 'cardName') {
            currentQuiz.hintIndex = 0;
            displayCardNameQuizHint();
        } else {
            if (quizImageArea) quizImageArea.style.display = 'flex';
            if (quizCanvas) quizCanvas.style.display = 'block';
            drawQuizImage();
        }
    }

    function getQuizTitle(type) {
        const titles = {
            cardName: 'カード名当てクイズ',
            enlarge: 'イラスト拡大クイズ',
            silhouette: 'イラストシルエットクイズ',
            mosaic: 'イラストモザイク化クイズ'
        };
        return titles[type] || 'ミニゲーム';
    }

    /**
     * [修正] カード名当てクイズのヒント表示ロジック
     * 複数のヒントが一度に表示される問題を修正。
     * これまでのヒントをすべて再構築して表示することで、一貫性を保ちます。
     */
    function displayCardNameQuizHint() {
        if (!currentQuiz.card || !quizHintArea) return;

        let hintsHtml = '';
        for (let i = 0; i <= currentQuiz.hintIndex; i++) {
            if (currentQuiz.card.info[i]) {
                hintsHtml += (i > 0 ? '<br>' : '') + currentQuiz.card.info[i];
            }
        }
        quizHintArea.innerHTML = hintsHtml;

        if (currentQuiz.hintIndex >= currentQuiz.card.info.length - 1) {
            quizHintArea.innerHTML += '<br><br>これ以上ヒントはありません。';
            endQuiz(false);
        }
    }

    /**
     * [修正] シルエットクイズの画像読み込みとアスペクト比計算
     * イラスト部分の正しいアスペクト比を維持するように修正。
     */
    async function loadImageForQuiz(cardFileName, quizType) {
        const loadImage = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (err) => reject(new Error(`Failed to load image at ${src}.`));
            img.src = src;
        });

        let imageForSizing; // アスペクト比の計算に使用する画像

        const baseImageUrl = browser.runtime.getURL(`images/cards/${cardFileName}.png`);
        currentQuiz.fullCardImage = await loadImage(baseImageUrl);
        imageForSizing = currentQuiz.fullCardImage; // デフォルトはカード全体の画像

        if (quizType === 'silhouette') {
            const transImageUrl = browser.runtime.getURL(`images/cards/${cardFileName}_transparent.png`);
            const illustImageUrl = browser.runtime.getURL(`images/cards/${cardFileName}_illust.png`);
            [currentQuiz.transparentIllustrationImage, currentQuiz.illustrationImage] = await Promise.all([
                loadImage(transImageUrl),
                loadImage(illustImageUrl)
            ]);
            // シルエットクイズでは、イラスト画像のいずれかを使用してアスペクト比を決定
            imageForSizing = currentQuiz.illustrationImage || currentQuiz.transparentIllustrationImage;
        }
        
        if(quizCanvas && imageForSizing && imageForSizing.naturalWidth > 0) {
            const parentWidth = quizImageArea.clientWidth > 0 ? quizImageArea.clientWidth : 400;
            const parentHeight = quizImageArea.clientHeight > 0 ? quizImageArea.clientHeight : 300;
            const aspectRatio = imageForSizing.naturalWidth / imageForSizing.naturalHeight;
            let drawWidth = parentWidth;
            let drawHeight = parentWidth / aspectRatio;
            if (drawHeight > parentHeight) {
                drawHeight = parentHeight;
                drawWidth = parentHeight * aspectRatio;
            }
            quizCanvas.width = drawWidth;
            quizCanvas.height = drawHeight;

            // モザイククイズ用に、カード全体の画像データを保持
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = currentQuiz.fullCardImage.naturalWidth;
            offscreenCanvas.height = currentQuiz.fullCardImage.naturalHeight;
            const offscreenCtx = offscreenCanvas.getContext('2d');
            offscreenCtx.drawImage(currentQuiz.fullCardImage, 0, 0);
            currentQuiz.originalImageData = offscreenCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        }
    }

    function drawQuizImage() {
        if (!currentQuiz.quizCtx || !currentQuiz.quizCanvas || !currentQuiz.fullCardImage) return;
        const ctx = currentQuiz.quizCtx;
        ctx.clearRect(0, 0, quizCanvas.width, quizCanvas.height);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, quizCanvas.width, quizCanvas.height);

        switch (currentQuiz.type) {
            case 'enlarge':
                drawEnlargedImage(ctx, currentQuiz.fullCardImage, currentQuiz.attemptCount, 0, 0, quizCanvas.width, quizCanvas.height);
                break;
            case 'silhouette':
                drawSilhouetteImage(ctx, currentQuiz.illustrationImage, currentQuiz.transparentIllustrationImage, quizCanvas.width, quizCanvas.height);
                break;
            case 'mosaic':
                drawMosaicImage(ctx, currentQuiz.originalImageData, currentQuiz.attemptCount, 0, 0, quizCanvas.width, quizCanvas.height);
                break;
        }
    }

    /**
     * [修正] 拡大クイズの描画ロジックと拡大率
     * 拡大率を「2%, 3%, 5%, 10%, 15%」の順に変更。
     * 表示領域の割合（displayRatio）として扱い、小さいほど拡大率が高い（ズームイン）状態になります。
     */
    function drawEnlargedImage(ctx, img, attempt, destX, destY, destWidth, destHeight) {
        const displayRatioLevels = [0.02, 0.03, 0.05, 0.10, 0.15, 1.0];
        const displayRatio = displayRatioLevels[attempt] || 1.0;
        
        const sourceWidth = img.naturalWidth * displayRatio;
        const sourceHeight = img.naturalHeight * displayRatio;
        const sourceX = (img.naturalWidth - sourceWidth) / 2;
        const sourceY = (img.naturalHeight - sourceHeight) / 2;

        ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);
    }

    function drawSilhouetteImage(ctx, bgImg, transImg, canvasWidth, canvasHeight) {
        if (bgImg) ctx.drawImage(bgImg, 0, 0, canvasWidth, canvasHeight);
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = canvasWidth;
        offscreenCanvas.height = canvasHeight;
        const offscreenCtx = offscreenCanvas.getContext('2d');
        offscreenCtx.drawImage(transImg, 0, 0, canvasWidth, canvasHeight);
        offscreenCtx.globalCompositeOperation = 'source-in';
        offscreenCtx.fillStyle = 'black';
        offscreenCtx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(offscreenCanvas, 0, 0);
    }

    /**
     * [修正] モザイククイズの難易度調整
     * モザイクのピクセルサイズを大きくして、初期状態をより難しくしました。
     */
    function drawMosaicImage(ctx, originalData, attempt, destX, destY, destWidth, destHeight) {
        if (!originalData) return;
        const pixelSizeLevels = [128, 80, 48, 24, 8, 1];
        const pixelSize = pixelSizeLevels[attempt] || 1;
        const originalWidth = originalData.width;
        const originalHeight = originalData.height;

        for (let y = 0; y < originalHeight; y += pixelSize) {
            for (let x = 0; x < originalWidth; x += pixelSize) {
                const i = (y * originalWidth + x) * 4;
                const r = originalData.data[i];
                const g = originalData.data[i + 1];
                const b = originalData.data[i + 2];
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                const rectX = (x / originalWidth) * destWidth;
                const rectY = (y / originalHeight) * destHeight;
                const rectWidth = (pixelSize / originalWidth) * destWidth;
                const rectHeight = (pixelSize / originalHeight) * destHeight;
                ctx.fillRect(rectX, rectY, rectWidth + 1, rectHeight + 1);
            }
        }
    }

    function checkAnswer() {
        if (!quizAnswerInput || !quizResultArea || !currentQuiz.card) return;
        const userAnswer = quizAnswerInput.value.trim().toLowerCase().replace(/\s+/g, '');
        const correctAnswer = currentQuiz.card.name.toLowerCase().replace(/\s+/g, '');
        if (userAnswer === correctAnswer) {
            quizResultArea.textContent = '正解！';
            quizResultArea.className = 'quiz-result-area correct';
            endQuiz(true);
        } else {
            quizResultArea.textContent = '不正解...';
            quizResultArea.className = 'quiz-result-area incorrect';
            currentQuiz.attemptCount++;
            if (currentQuiz.type === 'cardName') {
                currentQuiz.hintIndex++;
                displayCardNameQuizHint();
            } else {
                if (currentQuiz.attemptCount < 5) {
                    drawQuizImage();
                } else {
                    endQuiz(false);
                }
            }
        }
    }

    function endQuiz(isCorrect) {
        if (!quizAnswerInput || !quizSubmitButton || !quizNextButton || !quizAnswerDisplay || !quizResetButton) return;
        quizAnswerInput.disabled = true;
        quizSubmitButton.style.display = 'none';
        quizNextButton.style.display = 'none';
        quizAnswerDisplay.innerHTML = `正解は「<strong>${currentQuiz.card.name}</strong>」でした！`;
        if (currentQuiz.fullCardImage && quizCanvas) {
            const ctx = currentQuiz.quizCtx;
            ctx.clearRect(0, 0, quizCanvas.width, quizCanvas.height);
            ctx.drawImage(currentQuiz.fullCardImage, 0, 0, quizCanvas.width, quizCanvas.height);
        }
        quizResetButton.style.display = 'inline-block';
    }

    const addClickListener = (id, handler) => {
        const element = document.getElementById(id);
        if (element) {
            // イベントリスナーの重複を防ぐため、一度削除してから追加
            element.removeEventListener('click', handler);
            element.addEventListener('click', handler);
        }
    };
    addClickListener('quiz-card-name', () => startQuiz('cardName'));
    addClickListener('quiz-illustration-enlarge', () => startQuiz('enlarge'));
    addClickListener('quiz-illustration-silhouette', () => startQuiz('silhouette'));
    addClickListener('quiz-illustration-mosaic', () => startQuiz('mosaic'));
    addClickListener('quiz-submit-button', checkAnswer);
    addClickListener('quiz-reset-button', resetQuiz);
    
    if (quizAnswerInput) {
        quizAnswerInput.removeEventListener('keypress', checkAnswer);
        quizAnswerInput.addEventListener('keypress', e => e.key === 'Enter' && checkAnswer());
    }
    
    resetQuiz();
};

// Firefoxでのスクリプト注入エラーを防ぐため、戻り値を明示的にundefinedにする
void 0;
