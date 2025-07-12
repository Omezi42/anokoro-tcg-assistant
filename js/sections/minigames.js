// js/sections/minigames.js - 修正版 v2.1

window.initMinigamesSection = async function() {
    // カードデータがロードされるまで待機
    try {
        await window.TCG_ASSISTANT.cardDataReady;
        console.log("Minigames section initialized (v2.1). Card data is ready.");
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

    // クイズの初期化
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

    // クイズの開始
    async function startQuiz(type) {
        if (!window.TCG_ASSISTANT.allCards || window.TCG_ASSISTANT.allCards.length === 0) {
            await window.showCustomDialog('エラー', 'カードデータが利用できません。');
            return;
        }
        resetQuiz();
        currentQuiz.type = type;

        let cardSelected = false;
        const maxAttempts = 30; // 試行回数を増やす

        for (let i = 0; i < maxAttempts; i++) {
            currentQuiz.card = window.TCG_ASSISTANT.allCards[Math.floor(Math.random() * window.TCG_ASSISTANT.allCards.length)];
            
            // ★修正点: image_filenameの存在をチェック
            if (!currentQuiz.card.image_filename) {
                console.warn(`Card "${currentQuiz.card.name}" has no image_filename. Skipping.`);
                continue;
            }

            if (type !== 'cardName') {
                try {
                    // ★修正点: card.nameではなくcard.image_filenameを使用
                    await loadImageForQuiz(currentQuiz.card.image_filename, type);
                    cardSelected = true;
                    break;
                } catch (error) {
                    console.warn(`Failed to load images for ${currentQuiz.card.image_filename}:`, error.message);
                }
            } else {
                cardSelected = true;
                break;
            }
        }

        if (!cardSelected) {
            await window.showCustomDialog('エラー', 'クイズに必要な画像が利用可能なカードが見つかりませんでした。別のクイズを試すか、画像ファイルが正しく配置されているか確認してください。');
            resetQuiz();
            return;
        }

        if (quizDisplayArea) quizDisplayArea.style.display = 'block';
        if (quizTitle) quizTitle.textContent = getQuizTitle(type);

        if (type === 'cardName') {
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

    function displayCardNameQuizHint() {
        if (!currentQuiz.card || !quizHintArea || !quizNextButton) return;
        if (currentQuiz.hintIndex < currentQuiz.card.info.length) {
            quizHintArea.innerHTML += (currentQuiz.hintIndex > 0 ? '<br>' : '') + currentQuiz.card.info[currentQuiz.hintIndex];
            currentQuiz.hintIndex++;
            quizNextButton.style.display = 'none';
        } else {
            quizHintArea.innerHTML += '<br><br>これ以上ヒントはありません。';
            endQuiz(false);
        }
    }

    // 画像をロードする関数
    async function loadImageForQuiz(cardFileName, quizType) {
        const loadImage = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
            img.src = src;
        });

        const baseImageUrl = browser.runtime.getURL(`images/cards/${cardFileName}.png`);
        currentQuiz.fullCardImage = await loadImage(baseImageUrl);

        if (quizType === 'silhouette') {
            const transImageUrl = browser.runtime.getURL(`images/cards/${cardFileName}_transparent.png`);
            const illustImageUrl = browser.runtime.getURL(`images/cards/${cardFileName}_illust.png`);
            [currentQuiz.transparentIllustrationImage, currentQuiz.illustrationImage] = await Promise.all([
                loadImage(transImageUrl),
                loadImage(illustImageUrl)
            ]);
        }
        
        // Canvasのサイズ設定とオリジナル画像データの保存
        if(quizCanvas && currentQuiz.fullCardImage.naturalWidth > 0) {
            const parentWidth = quizImageArea.clientWidth > 0 ? quizImageArea.clientWidth : 400;
            const parentHeight = quizImageArea.clientHeight > 0 ? quizImageArea.clientHeight : 300;
            const aspectRatio = currentQuiz.fullCardImage.naturalWidth / currentQuiz.fullCardImage.naturalHeight;
            let drawWidth = parentWidth;
            let drawHeight = parentWidth / aspectRatio;
            if (drawHeight > parentHeight) {
                drawHeight = parentHeight;
                drawWidth = parentHeight * aspectRatio;
            }
            quizCanvas.width = drawWidth;
            quizCanvas.height = drawHeight;

            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = currentQuiz.fullCardImage.naturalWidth;
            offscreenCanvas.height = currentQuiz.fullCardImage.naturalHeight;
            const offscreenCtx = offscreenCanvas.getContext('2d');
            offscreenCtx.drawImage(currentQuiz.fullCardImage, 0, 0);
            currentQuiz.originalImageData = offscreenCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        }
    }

    // クイズ画像を描画する関数
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

    function drawEnlargedImage(ctx, img, attempt, destX, destY, destWidth, destHeight) {
        const zoomLevels = [0.05, 0.1, 0.2, 0.4, 0.7, 1.0]; // ズームレベル
        const zoom = zoomLevels[attempt] || 1.0;
        const sourceSize = Math.min(img.naturalWidth, img.naturalHeight) * (1.0 - zoom * 0.9);
        const sourceX = (img.naturalWidth - sourceSize) / 2;
        const sourceY = (img.naturalHeight - sourceSize) / 2;
        ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, destX, destY, destWidth, destHeight);
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

    function drawMosaicImage(ctx, originalData, attempt, destX, destY, destWidth, destHeight) {
        const pixelSizeLevels = [64, 32, 16, 8, 4, 1];
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

    // 解答をチェック
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

    // クイズの終了
    function endQuiz(isCorrect) {
        if (!quizAnswerInput || !quizSubmitButton || !quizNextButton || !quizAnswerDisplay || !quizResetButton) return;
        quizAnswerInput.disabled = true;
        quizSubmitButton.style.display = 'none';
        quizNextButton.style.display = 'none';
        quizAnswerDisplay.innerHTML = `正解は「<strong>${currentQuiz.card.name}</strong>」でした！`;
        if (currentQuiz.fullCardImage) {
            const ctx = currentQuiz.quizCtx;
            ctx.clearRect(0, 0, quizCanvas.width, quizCanvas.height);
            ctx.drawImage(currentQuiz.fullCardImage, 0, 0, quizCanvas.width, quizCanvas.height);
        }
        quizResetButton.style.display = 'inline-block';
    }

    // イベントリスナーの設定
    const addClickListener = (id, handler) => document.getElementById(id)?.addEventListener('click', handler);
    addClickListener('quiz-card-name', () => startQuiz('cardName'));
    addClickListener('quiz-illustration-enlarge', () => startQuiz('enlarge'));
    addClickListener('quiz-illustration-silhouette', () => startQuiz('silhouette'));
    addClickListener('quiz-illustration-mosaic', () => startQuiz('mosaic'));
    addClickListener('quiz-submit-button', checkAnswer);
    addClickListener('quiz-reset-button', resetQuiz);
    quizAnswerInput?.addEventListener('keypress', e => e.key === 'Enter' && checkAnswer());
    
    resetQuiz();
};
