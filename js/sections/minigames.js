// js/sections/minigames.js
export function initialize() {
    if (document.body.dataset.minigamesInitialized === 'true') {
        setupEventListeners(); // Re-attach listeners if section is re-initialized
        return;
    }
    document.body.dataset.minigamesInitialized = 'true';

    console.log("Minigames section initialized.");
    
    const a = (typeof browser !== "undefined") ? browser : chrome;

    const currentQuiz = {
        type: null, card: null, hintIndex: 0, attemptCount: 0,
        quizCanvas: null, quizCtx: null, fullCardImage: null,
        originalImageData: null
    };

    const getElement = (id) => document.getElementById(id);
    const elements = {
        quizCardNameButton: getElement('quiz-card-name'),
        quizIllustrationEnlargeButton: getElement('quiz-illustration-enlarge'),
        quizIllustrationSilhouetteButton: getElement('quiz-illustration-silhouette'),
        quizIllustrationMosaicButton: getElement('quiz-illustration-mosaic'),
        quizDisplayArea: getElement('quiz-display-area'),
        quizTitle: getElement('quiz-title'),
        quizHintArea: getElement('quiz-hint-area'),
        quizImageArea: getElement('quiz-image-area'),
        quizCanvas: getElement('quiz-canvas'),
        quizAnswerInput: getElement('quiz-answer-input'),
        quizSubmitButton: getElement('quiz-submit-button'),
        quizResultArea: getElement('quiz-result-area'),
        quizAnswerDisplay: getElement('quiz-answer-display'),
        quizNextButton: getElement('quiz-next-button'),
        quizResetButton: getElement('quiz-reset-button'),
    };

    if (elements.quizCanvas) {
        currentQuiz.quizCanvas = elements.quizCanvas;
        currentQuiz.quizCtx = elements.quizCanvas.getContext('2d');
    }

    function resetQuiz() {
        Object.assign(currentQuiz, {
            type: null, card: null, hintIndex: 0, attemptCount: 0,
            fullCardImage: null, originalImageData: null
        });

        if (elements.quizDisplayArea) elements.quizDisplayArea.style.display = 'none';
        if (elements.quizTitle) elements.quizTitle.textContent = '';
        if (elements.quizHintArea) elements.quizHintArea.innerHTML = '';
        if (elements.quizImageArea) elements.quizImageArea.style.display = 'none';
        if (elements.quizCanvas) elements.quizCanvas.style.display = 'none';
        if (elements.quizAnswerInput) {
            elements.quizAnswerInput.value = '';
            elements.quizAnswerInput.disabled = false;
        }
        if (elements.quizResultArea) {
            elements.quizResultArea.textContent = '';
            elements.quizResultArea.className = 'quiz-result-area';
        }
        if (elements.quizAnswerDisplay) elements.quizAnswerDisplay.textContent = '';
        if (elements.quizNextButton) elements.quizNextButton.style.display = 'none';
        if (elements.quizSubmitButton) elements.quizSubmitButton.style.display = 'inline-block';
        if (elements.quizResetButton) elements.quizResetButton.textContent = 'リセット';
    }

    async function startQuiz(type) {
        const { allCards } = window.tcgAssistant;
        if (!allCards || allCards.length === 0) {
            return window.showCustomDialog('エラー', 'カードデータがまだ読み込まれていません。少し待ってからもう一度お試しください。');
        }
        resetQuiz();
        currentQuiz.type = type;

        let cardFound = false;

        if (type === 'cardName') {
            currentQuiz.card = allCards[Math.floor(Math.random() * allCards.length)];
            cardFound = true;
        } else {
            const imageCards = allCards
                .filter(c => c.image_filename)
                .sort(() => 0.5 - Math.random()); 

            if (imageCards.length === 0) {
                return window.showCustomDialog('エラー', 'クイズに適した画像付きカードが見つかりません。');
            }

            for (const card of imageCards) {
                try {
                    await loadImageForQuiz(card.image_filename);
                    currentQuiz.card = card;
                    cardFound = true;
                    break;
                } catch (error) {
                    console.warn(`Failed to load image for ${card.name}, trying next card. Error:`, error);
                }
            }
        }

        if (!cardFound) {
            return window.showCustomDialog('エラー', 'クイズの開始に失敗しました。有効なカードが見つかりません。');
        }

        if (elements.quizDisplayArea) elements.quizDisplayArea.style.display = 'block';
        if (elements.quizTitle) elements.quizTitle.textContent = getQuizTitle(type);

        if (type === 'cardName') {
            displayCardNameQuizHint();
        } else {
            if (elements.quizImageArea) elements.quizImageArea.style.display = 'flex';
            if (elements.quizCanvas) elements.quizCanvas.style.display = 'block';
            drawQuizImage();
        }
    }

    function getQuizTitle(type) {
        const titles = {
            cardName: 'カード名当てクイズ', enlarge: 'イラスト拡大クイズ',
            silhouette: 'イラストシルエットクイズ', mosaic: 'イラストモザイク化クイズ'
        };
        return titles[type] || 'ミニゲーム';
    }

    function displayCardNameQuizHint() {
        if (!currentQuiz.card || !elements.quizHintArea) return;
        
        const hintsToShow = currentQuiz.card.info.slice(0, currentQuiz.hintIndex + 1);
        elements.quizHintArea.innerHTML = hintsToShow.join('<br>');

        currentQuiz.hintIndex++;
        if (currentQuiz.hintIndex >= currentQuiz.card.info.length) {
            elements.quizHintArea.innerHTML += '<br><br>これ以上ヒントはありません。';
            endQuiz(false);
        }
    }

    async function loadImageForQuiz(imageFilename) {
        const imageUrl = `https://omezi42.github.io/tcg-assistant-images/cards/${encodeURIComponent(imageFilename)}.png`;
        
        // FIX: Request the background script to fetch the image to bypass CORS
        const response = await a.runtime.sendMessage({
            action: 'fetchImageAsDataURL',
            url: imageUrl
        });

        if (!response || !response.success) {
            throw new Error(response.error || 'Failed to fetch image from background script.');
        }

        const dataUrl = response.dataUrl;

        const loadImage = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            // No crossOrigin needed for data URLs
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image from data URL.`));
            img.src = src;
        });
        
        currentQuiz.fullCardImage = await loadImage(dataUrl);

        if (elements.quizCanvas) {
            const canvas = elements.quizCanvas;
            const img = currentQuiz.fullCardImage;
            const parentWidth = elements.quizImageArea.clientWidth;
            const parentHeight = elements.quizImageArea.clientHeight;
            const imgAspectRatio = img.naturalWidth / img.naturalHeight;
            let drawWidth = parentWidth;
            let drawHeight = parentWidth / imgAspectRatio;
            if (drawHeight > parentHeight) {
                drawHeight = parentHeight;
                drawWidth = parentHeight * imgAspectRatio;
            }
            canvas.width = drawWidth;
            canvas.height = drawHeight;
            
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = img.naturalWidth;
            offscreenCanvas.height = img.naturalHeight;
            const offscreenCtx = offscreenCanvas.getContext('2d');
            offscreenCtx.drawImage(img, 0, 0);
            currentQuiz.originalImageData = offscreenCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        }
    }

    function drawQuizImage() {
        if (!currentQuiz.quizCtx || !currentQuiz.quizCanvas || !currentQuiz.fullCardImage) return;
        const { quizCtx: ctx, quizCanvas: canvas, fullCardImage: img, attemptCount } = currentQuiz;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        switch (currentQuiz.type) {
            case 'enlarge': drawEnlargedImage(ctx, img, attemptCount, canvas.width, canvas.height); break;
            case 'silhouette': drawSilhouetteImage(ctx, img, canvas.width, canvas.height); break;
            case 'mosaic': drawMosaicImage(ctx, attemptCount, canvas.width, canvas.height); break;
        }
    }

    function drawEnlargedImage(ctx, img, attempt, canvasWidth, canvasHeight) {
        const zoomLevels = [0.05, 0.1, 0.2, 0.4, 0.7, 1.0];
        const zoom = zoomLevels[attempt] || 1.0;
        
        const sourceWidth = img.naturalWidth * zoom;
        const sourceHeight = img.naturalHeight * zoom;
        const sourceX = (img.naturalWidth - sourceWidth) / 2;
        const sourceY = (img.naturalHeight - sourceHeight) / 4;

        ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvasWidth, canvasHeight);
    }

    function drawSilhouetteImage(ctx, img, canvasWidth, canvasHeight) {
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = img.naturalWidth;
        offscreenCanvas.height = img.naturalHeight;
        const offscreenCtx = offscreenCanvas.getContext('2d');
        
        offscreenCtx.drawImage(img, 0, 0);
        const imageData = offscreenCtx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] !== 0) {
                data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
            }
        }
        offscreenCtx.putImageData(imageData, 0, 0);
        ctx.drawImage(offscreenCanvas, 0, 0, canvasWidth, canvasHeight);
    }

    function drawMosaicImage(ctx, attempt, canvasWidth, canvasHeight) {
        const pixelSizeLevels = [64, 32, 16, 8, 4, 1];
        const pixelSize = pixelSizeLevels[attempt] || 1;
        const originalData = currentQuiz.originalImageData;
        if (!originalData) return;

        const originalWidth = originalData.width;
        const originalHeight = originalData.height;

        for (let y = 0; y < originalHeight; y += pixelSize) {
            for (let x = 0; x < originalWidth; x += pixelSize) {
                const i = (y * originalWidth + x) * 4;
                ctx.fillStyle = `rgba(${originalData.data[i]}, ${originalData.data[i+1]}, ${originalData.data[i+2]}, ${originalData.data[i+3] / 255})`;
                ctx.fillRect((x / originalWidth) * canvasWidth, (y / originalHeight) * canvasHeight, (pixelSize / originalWidth) * canvasWidth, (pixelSize / originalHeight) * canvasHeight);
            }
        }
    }

    function normalizeText(text = '') {
        return text.replace(/[\uFF61-\uFF9F]/g, s => String.fromCharCode(s.charCodeAt(0) + 0x20))
                   .replace(/[\u3041-\u3096]/g, s => String.fromCharCode(s.charCodeAt(0) + 0x60))
                   .replace(/\s+/g, '')
                   .toLowerCase();
    }

    async function updateMinigameStats(type, isCorrect, hintsUsed) {
        const { minigameStats } = await a.storage.local.get({minigameStats: {}});
        if (!minigameStats[type]) {
            minigameStats[type] = { wins: 0, losses: 0, totalHints: 0 };
        }
        if (isCorrect) {
            minigameStats[type].wins++;
            minigameStats[type].totalHints += hintsUsed;
        } else {
            minigameStats[type].losses++;
        }
        await a.storage.local.set({ minigameStats: minigameStats });
    }

    function checkAnswer() {
        if (!elements.quizAnswerInput || !elements.quizResultArea || !currentQuiz.card) return;

        const userAnswer = normalizeText(elements.quizAnswerInput.value);
        const correctAnswer = normalizeText(currentQuiz.card.name);

        if (userAnswer === correctAnswer) {
            elements.quizResultArea.textContent = '正解！';
            elements.quizResultArea.className = 'quiz-result-area correct';
            endQuiz(true);
        } else {
            elements.quizResultArea.textContent = '不正解...';
            elements.quizResultArea.className = 'quiz-result-area incorrect';
            currentQuiz.attemptCount++;
            
            if (currentQuiz.type === 'cardName') {
                displayCardNameQuizHint();
            } else {
                if (currentQuiz.attemptCount < 5) {
                    drawQuizImage();
                    if (elements.quizNextButton) {
                        elements.quizNextButton.style.display = 'inline-block';
                        elements.quizNextButton.textContent = '次のヒント';
                    }
                } else {
                    endQuiz(false);
                }
            }
        }
    }

    function endQuiz(isCorrect) {
        if (!elements.quizAnswerInput || !elements.quizSubmitButton || !elements.quizNextButton || !elements.quizAnswerDisplay) return;

        updateMinigameStats(currentQuiz.type, isCorrect, currentQuiz.hintIndex);

        elements.quizAnswerInput.disabled = true;
        elements.quizSubmitButton.style.display = 'none';
        elements.quizNextButton.style.display = 'none';
        elements.quizAnswerDisplay.innerHTML = `正解は「<strong>${currentQuiz.card.name}</strong>」でした！`;

        if (currentQuiz.type !== 'cardName' && currentQuiz.fullCardImage) {
            const ctx = currentQuiz.quizCtx;
            const canvas = currentQuiz.quizCanvas;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(currentQuiz.fullCardImage, 0, 0, canvas.width, canvas.height);
        }
        
        if (elements.quizResetButton) elements.quizResetButton.textContent = '次の問題へ';
    }
    
    const handleQuizNextClick = () => {
        if (currentQuiz.type === 'cardName') {
            displayCardNameQuizHint();
        } else {
            drawQuizImage();
            if (elements.quizNextButton) elements.quizNextButton.style.display = 'none';
        }
        if (elements.quizResultArea) {
            elements.quizResultArea.textContent = '';
            elements.quizResultArea.className = 'quiz-result-area';
        }
    };
    const handleResetClick = () => {
        if (currentQuiz.type) {
            startQuiz(currentQuiz.type);
        } else {
            resetQuiz();
        }
    };

    function setupEventListeners() {
        elements.quizCardNameButton?.addEventListener('click', () => startQuiz('cardName'));
        elements.quizIllustrationEnlargeButton?.addEventListener('click', () => startQuiz('enlarge'));
        elements.quizIllustrationSilhouetteButton?.addEventListener('click', () => startQuiz('silhouette'));
        elements.quizIllustrationMosaicButton?.addEventListener('click', () => startQuiz('mosaic'));
        elements.quizSubmitButton?.addEventListener('click', checkAnswer);
        elements.quizAnswerInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') checkAnswer(); });
        elements.quizNextButton?.addEventListener('click', handleQuizNextClick);
        elements.quizResetButton?.addEventListener('click', handleResetClick);
    }

    setupEventListeners();
    resetQuiz();
}
