// js/sections/minigames.js - 修正版 v2.6

window.initMinigamesSection = async function() {
    // カードデータがロードされるまで待機
    try {
        await window.TCG_ASSISTANT.cardDataReady;
        console.log("Minigames section initialized (v2.6). Card data is ready.");
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

    async function loadImageForQuiz(cardFileName, quizType) {
        const loadImage = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (err) => reject(new Error(`Failed to load image at ${src}.`));
            img.src = src;
        });

        let imageForSizing;

        const baseImageUrl = browser.runtime.getURL(`images/cards/${cardFileName}.png`);
        currentQuiz.fullCardImage = await loadImage(baseImageUrl);
        imageForSizing = currentQuiz.fullCardImage;

        if (quizType === 'silhouette') {
            const transImageUrl = browser.runtime.getURL(`images/cards/${cardFileName}_transparent.png`);
            const illustImageUrl = browser.runtime.getURL(`images/cards/${cardFileName}_illust.png`);
            [currentQuiz.transparentIllustrationImage, currentQuiz.illustrationImage] = await Promise.all([
                loadImage(transImageUrl),
                loadImage(illustImageUrl)
            ]);
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

    function drawEnlargedImage(ctx, img, attempt, destX, destY, destWidth, destHeight) {
        const displayRatioLevels = [0.02, 0.03, 0.05, 0.10, 0.15, 1.0];
        const displayRatio = displayRatioLevels[attempt] || 1.0;
        
        const sourceWidth = img.naturalWidth * displayRatio;
        const sourceHeight = img.naturalHeight * displayRatio;
        
        const centerX = img.naturalWidth / 2;
        const centerY = img.naturalHeight * 0.25;

        let sourceX = centerX - (sourceWidth / 2);
        let sourceY = centerY - (sourceHeight / 2);

        sourceX = Math.max(0, Math.min(sourceX, img.naturalWidth - sourceWidth));
        sourceY = Math.max(0, Math.min(sourceY, img.naturalHeight - sourceHeight));

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

    /**
     * [修正] クイズ終了時の画像表示ロジック
     * 答えのカード画像を表示する際に、アスペクト比を維持して中央に表示するように修正。
     */
    function endQuiz(isCorrect) {
        if (!quizAnswerInput || !quizSubmitButton || !quizNextButton || !quizAnswerDisplay || !quizResetButton) return;
        quizAnswerInput.disabled = true;
        quizSubmitButton.style.display = 'none';
        quizNextButton.style.display = 'none';
        quizAnswerDisplay.innerHTML = `正解は「<strong>${currentQuiz.card.name}</strong>」でした！`;

        if (currentQuiz.fullCardImage && quizCanvas) {
            const ctx = currentQuiz.quizCtx;
            const canvas = currentQuiz.quizCanvas;
            const img = currentQuiz.fullCardImage;

            // アスペクト比を計算
            const canvasRatio = canvas.width / canvas.height;
            const imgRatio = img.naturalWidth / img.naturalHeight;

            let drawWidth, drawHeight, offsetX, offsetY;

            // 画像がキャンバスに収まるようにサイズを計算（フィットさせる）
            if (imgRatio > canvasRatio) {
                // 画像がキャンバスより横長の場合
                drawWidth = canvas.width;
                drawHeight = drawWidth / imgRatio;
                offsetX = 0;
                offsetY = (canvas.height - drawHeight) / 2; // 上下中央に配置
            } else {
                // 画像がキャンバスより縦長（または同じ比率）の場合
                drawHeight = canvas.height;
                drawWidth = drawHeight * imgRatio;
                offsetX = (canvas.width - drawWidth) / 2; // 左右中央に配置
                offsetY = 0;
            }

            // キャンバスをクリアしてから画像を描画
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        }
        quizResetButton.style.display = 'inline-block';
    }

    const addClickListener = (id, handler) => {
        const element = document.getElementById(id);
        if (element) {
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
        quizAnswerInput.addEventListener('keypress', e => { if (e.key === 'Enter') checkAnswer(); });
    }
    
    resetQuiz();
};

// Firefoxでのスクリプト注入エラーを防ぐため、戻り値を明示的にundefinedにする
void 0;
