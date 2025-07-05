// js/sections/minigames.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initMinigamesSection = function(allCards, showCustomDialog) {
    console.log("Minigames section initialized.");

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

    // 各要素を関数内で取得
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

    // quizCanvasとquizCtxがnullでないことを確認
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

    // クイズ開始共通ロジック
    async function startQuiz(type) {
        if (allCards.length === 0) {
            await showCustomDialog('エラー', 'カードデータがロードされていません。');
            return;
        }
        resetQuiz();
        currentQuiz.type = type;

        let cardSelected = false;
        const maxAttemptsForImageLoad = 20;
        for (let i = 0; i < maxAttemptsForImageLoad; i++) {
            currentQuiz.card = allCards[Math.floor(Math.random() * allCards.length)];
            if (type !== 'cardName') {
                const cardName = currentQuiz.card.name;
                const imageUrl = chrome.runtime.getURL(`images/cards/${cardName}.png`);
                try {
                    const response = await fetch(imageUrl, { method: 'HEAD' });
                    if (response.ok) {
                        if (type === 'silhouette') {
                            const transparentImageUrl = chrome.runtime.getURL(`images/cards/${cardName}_transparent.png`);
                            const illustImageUrl = chrome.runtime.getURL(`images/cards/${cardName}_illust.png`);
                            const [transResponse, illustResponse] = await Promise.all([
                                fetch(transparentImageUrl, { method: 'HEAD' }),
                                fetch(illustImageUrl, { method: 'HEAD' })
                            ]);
                            if (transResponse.ok && illustResponse.ok) {
                                await loadImageForQuiz(cardName, type);
                                cardSelected = true;
                                break;
                            } else {
                                console.warn(`シルエットクイズに必要な画像が見つかりません: ${cardName}_transparent.png or ${cardName}_illust.png`);
                            }
                        } else {
                            await loadImageForQuiz(cardName, type);
                            cardSelected = true;
                            break;
                        }
                    } else {
                        console.warn(`画像ファイルが見つかりません: ${imageUrl}`);
                    }
                } catch (error) {
                    console.warn(`画像ファイルの確認中にエラーが発生しました: ${error}`);
                }
            } else {
                cardSelected = true;
                break;
            }
        }

        if (!cardSelected) {
            await showCustomDialog('エラー', 'クイズに必要な画像が利用可能なカードが見つかりませんでした。別のクイズを試すか、画像ファイルが正しく配置されているか確認してください。');
            resetQuiz();
            return;
        }

        if (quizDisplayArea) quizDisplayArea.style.display = 'block';
        if (quizImageArea) quizImageArea.style.display = 'none';

        if (quizTitle) quizTitle.textContent = getQuizTitle(type);

        if (type === 'cardName') {
            displayCardNameQuizHint();
        } else {
            if (quizImageArea) quizImageArea.style.display = 'flex';
            if (quizCanvas) quizCanvas.style.display = 'block';
            drawQuizImage();
        }
    }

    // クイズタイトル取得
    function getQuizTitle(type) {
        switch (type) {
            case 'cardName': return 'カード名当てクイズ';
            case 'enlarge': return 'イラスト拡大クイズ';
            case 'silhouette': return 'イラストシルエットクイズ';
            case 'mosaic': return 'イラストモザイク化クイズ';
            default: return 'ミニゲーム';
        }
    }

    // カード名当てクイズのヒント表示
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

    // 画像をCanvasにロード
    async function loadImageForQuiz(cardName, quizType) {
        return new Promise(async (resolve, reject) => {
            currentQuiz.fullCardImage = new Image();
            currentQuiz.fullCardImage.src = chrome.runtime.getURL(`images/cards/${cardName}.png`);

            let loadPromises = [
                new Promise((res, rej) => {
                    currentQuiz.fullCardImage.onload = res;
                    currentQuiz.fullCardImage.onerror = () => {
                        console.error(`フルカード画像のロードに失敗しました: ${currentQuiz.fullCardImage.src}`);
                        rej(new Error('Full card image load failed'));
                    };
                })
            ];

            if (quizType === 'silhouette') {
                currentQuiz.transparentIllustrationImage = new Image();
                currentQuiz.transparentIllustrationImage.src = chrome.runtime.getURL(`images/cards/${cardName}_transparent.png`);
                loadPromises.push(new Promise((res, rej) => {
                    currentQuiz.transparentIllustrationImage.onload = res;
                    currentQuiz.transparentIllustrationImage.onerror = () => {
                        console.error(`透過イラスト画像のロードに失敗しました: ${currentQuiz.transparentIllustrationImage.src}`);
                        rej(new Error('Transparent illustration image load failed'));
                    };
                }));

                currentQuiz.illustrationImage = new Image();
                currentQuiz.illustrationImage.src = chrome.runtime.getURL(`images/cards/${cardName}_illust.png`);
                loadPromises.push(new Promise((res, rej) => {
                    currentQuiz.illustrationImage.onload = res;
                    currentQuiz.illustrationImage.onerror = () => {
                        console.error(`イラスト背景画像のロードに失敗しました: ${currentQuiz.illustrationImage.src}`);
                        rej(new Error('Illustration background image load failed'));
                    };
                }));
            }

            try {
                await Promise.all(loadPromises);

                const parentWidth = quizImageArea ? (quizImageArea.clientWidth > 0 ? quizImageArea.clientWidth : 400) : 400;
                const parentHeight = quizImageArea ? (quizImageArea.clientHeight > 0 ? quizImageArea.clientHeight : 300) : 300;

                const imgNaturalWidth = currentQuiz.fullCardImage.naturalWidth;
                const imgNaturalHeight = currentQuiz.fullCardImage.naturalHeight;
                const aspectRatio = imgNaturalWidth / imgNaturalHeight;

                let drawWidth = parentWidth;
                let drawHeight = parentWidth / aspectRatio;

                if (drawHeight > parentHeight) {
                    drawHeight = parentHeight;
                    drawWidth = parentHeight * aspectRatio;
                }
                
                if (quizCanvas) {
                    quizCanvas.width = drawWidth;
                    quizCanvas.height = drawHeight;
    
                    const offscreenCanvas = document.createElement('canvas');
                    offscreenCanvas.width = imgNaturalWidth;
                    offscreenCanvas.height = imgNaturalHeight;
                    const offscreenCtx = offscreenCanvas.getContext('2d');
                    offscreenCtx.drawImage(currentQuiz.fullCardImage, 0, 0);
                    currentQuiz.originalImageData = offscreenCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
                }
                resolve();
            } catch (error) {
                console.error(`画像のロードに失敗しました: ${error}`);
                if (quizImageArea && quizCanvas) {
                    quizImageArea.innerHTML = `<p style="color: red;">画像のロードに失敗しました。<br>（${cardName}.png または ${cardName}_transparent.png または ${cardName}_illust.png）<br>コンソールで詳細を確認してください。</p><img src="https://placehold.co/${quizCanvas.width || 200}x${quizCanvas.height || 200}/eee/333?text=No+Image" alt="Placeholder Image">`;
                }
                reject(new Error('Image load failed'));
            }
        });
    }

    // クイズ画像をCanvasに描画
    function drawQuizImage() {
        if (!currentQuiz.quizCtx || !currentQuiz.quizCanvas || !currentQuiz.fullCardImage) return;

        const ctx = currentQuiz.quizCtx;
        const img = currentQuiz.fullCardImage;
        ctx.clearRect(0, 0, currentQuiz.quizCanvas.width, currentQuiz.quizCanvas.height);

        if (!img || !img.complete || img.naturalWidth === 0) {
            console.warn("画像がまだロードされていないか、無効です。");
            return;
        }

        const destX = 0;
        const destY = 0;
        const destWidth = currentQuiz.quizCanvas.width;
        const destHeight = currentQuiz.quizCanvas.height;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, currentQuiz.quizCanvas.width, currentQuiz.quizCanvas.height);

        switch (currentQuiz.type) {
            case 'enlarge':
                drawEnlargedImage(ctx, img, currentQuiz.attemptCount, destX, destY, destWidth, destHeight);
                break;
            case 'silhouette':
                drawSilhouetteImage(ctx, currentQuiz.illustrationImage, currentQuiz.transparentIllustrationImage, currentQuiz.quizCanvas.width, currentQuiz.quizCanvas.height); 
                break;
            case 'mosaic':
                drawMosaicImage(ctx, img, currentQuiz.attemptCount, destX, destY, destWidth, destHeight);
                break;
        }
    }

    // イラスト拡大クイズの描画ロジック
    function drawEnlargedImage(ctx, img, attempt, destX, destY, destWidth, destHeight) {
        const imgWidth = img.naturalWidth;
        const imgHeight = img.naturalHeight;

        const initialDisplaySize = 10;
        const sizeIncrement = 10;
        let displaySize = initialDisplaySize + attempt * sizeIncrement;

        if (displaySize > Math.min(imgWidth, imgHeight)) {
            displaySize = Math.min(imgWidth, imgHeight);
        }

        const sourceX = Math.floor(imgWidth / 2 - displaySize / 2);
        const sourceY = Math.floor(imgHeight * 0.25 - displaySize / 2);

        ctx.drawImage(
            img,
            sourceX, sourceY, displaySize, displaySize,
            destX, destY, destWidth, destHeight
        );
    }

    // イラストシルエットクイズの描画ロジック
    function drawSilhouetteImage(ctx, bgIllustrationImg, transparentImg, canvasWidth, canvasHeight) {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        function calculateDrawDims(image) {
            const imgAspectRatio = image.naturalWidth / image.naturalHeight;
            const canvasAspectRatio = canvasWidth / canvasHeight;

            let drawWidth, drawHeight, offsetX, offsetY;

            if (imgAspectRatio > canvasAspectRatio) {
                drawWidth = canvasWidth;
                drawHeight = canvasWidth / imgAspectRatio;
                offsetX = 0;
                offsetY = (canvasHeight - drawHeight) / 2;
            } else {
                drawHeight = canvasHeight;
                drawWidth = canvasHeight * imgAspectRatio;
                offsetX = (canvasWidth - drawWidth) / 2;
                offsetY = 0;
            }
            return { drawWidth, drawHeight, offsetX, offsetY };
        }

        if (bgIllustrationImg && bgIllustrationImg.complete && bgIllustrationImg.naturalWidth > 0) {
            const { drawWidth, drawHeight, offsetX, offsetY } = calculateDrawDims(bgIllustrationImg);
            ctx.drawImage(bgIllustrationImg, offsetX, offsetY, drawWidth, drawHeight);
        } else {
            console.error("シルエットクイズ用の背景イラスト画像がロードされていないか、無効です。");
            ctx.fillStyle = 'red';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('画像エラー', canvasWidth / 2, canvasHeight / 2);
            ctx.fillText('(背景イラスト画像が見つからないか無効です)', canvasWidth / 2, canvasHeight / 2 + 30);
            return;
        }

        let blackMaskAlpha = 1.0;

        if (blackMaskAlpha === 0) {
            return;
        }

        if (transparentImg && transparentImg.complete && transparentImg.naturalWidth > 0) {
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = canvasWidth;
            offscreenCanvas.height = canvasHeight;
            const offscreenCtx = offscreenCanvas.getContext('2d');

            const { drawWidth: transDrawWidth, drawHeight: transDrawHeight, offsetX: transOffsetX, offsetY: transOffsetY } = calculateDrawDims(transparentImg);
            offscreenCtx.drawImage(transparentImg, transOffsetX, transOffsetY, transDrawWidth, transDrawHeight);

            offscreenCtx.globalCompositeOperation = 'source-in';
            offscreenCtx.fillStyle = 'black';
            offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

            ctx.globalAlpha = blackMaskAlpha;
            ctx.drawImage(offscreenCanvas, 0, 0);
            ctx.globalAlpha = 1.0;
        } else {
            console.error("シルエットクイズ用の透過イラスト画像がロードされていないか、無効です。");
            ctx.fillStyle = 'red';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('画像エラー', canvasWidth / 2, canvasHeight / 2);
            ctx.fillText('(_transparent.pngが見つからないか無効です)', canvasWidth / 2, canvasHeight / 2 + 30);
        }
    }

    // イラストモザイク化クイズの描画ロジック
    function drawMosaicImage(ctx, img, attempt, destX, destY, destWidth, destHeight) {
        const pixelSizeLevels = [128, 64, 32, 16, 8, 4];
        const pixelSize = pixelSizeLevels[attempt] || 1;

        if (!currentQuiz.originalImageData || !quizCanvas) {
            ctx.drawImage(img, destX, destY, destWidth, destHeight);
            return;
        }

        const originalData = currentQuiz.originalImageData.data;
        const originalWidth = currentQuiz.originalImageData.width;
        const originalHeight = currentQuiz.originalImageData.height;

        ctx.clearRect(0, 0, quizCanvas.width, quizCanvas.height);
        
        const mosaicDrawWidth = destWidth;
        const mosaicDrawHeight = destHeight;
        const mosaicOffsetX = destX;
        const mosaicOffsetY = destY;

        for (let y = 0; y < originalHeight; y += pixelSize) {
            for (let x = 0; x < originalWidth; x += pixelSize) {
                let r = 0, g = 0, b = 0, a = 0;
                let count = 0;

                for (let dy = 0; dy < pixelSize && y + dy < originalHeight; dy++) {
                    for (let dx = 0; dx < pixelSize && x + dx < originalWidth; dx++) {
                        const i = ((y + dy) * originalWidth + (x + dx)) * 4;
                        r += originalData[i];
                        g += originalData[i + 1];
                        b += originalData[i + 2];
                        a += originalData[i + 3];
                        count++;
                    }
                }

                if (count > 0) {
                    r = Math.floor(r / count);
                    g = Math.floor(g / count);
                    b = Math.floor(b / count);
                    a = Math.floor(a / count);
                }

                ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
                
                const rectX = mosaicOffsetX + (x / originalWidth) * mosaicDrawWidth;
                const rectY = mosaicOffsetY + (y / originalHeight) * mosaicDrawHeight;
                const rectWidth = (pixelSize / originalWidth) * mosaicDrawWidth;
                const rectHeight = (pixelSize / originalHeight) * mosaicDrawHeight;

                ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
            }
        }
    }


    // 解答チェック
    function checkAnswer() {
        if (!quizAnswerInput || !quizResultArea || !currentQuiz.card) return;

        const userAnswer = quizAnswerInput.value.trim().toLowerCase();
        const correctAnswer = currentQuiz.card.name.toLowerCase();

        const toFullWidthKatakana = (str) => {
            return str.replace(/[\uFF61-\uFF9F]/g, (s) => {
                return String.fromCharCode(s.charCodeAt(0) + 0x20);
            });
        };
        const toFullWidthKatakanaFromHiragana = (str) => {
            return str.replace(/[\u3041-\u3096]/g, (s) => {
                return String.fromCharCode(s.charCodeAt(0) + 0x60);
            });
        };

        const normalizedUserAnswer = toFullWidthKatakana(toFullWidthKatakanaFromHiragana(userAnswer)).replace(/\s+/g, '');
        const normalizedCorrectAnswer = toFullWidthKatakana(toFullWidthKatakanaFromHiragana(correctAnswer)).replace(/\s+/g, '');

        if (normalizedUserAnswer === normalizedCorrectAnswer) {
            quizResultArea.textContent = '正解！';
            quizResultArea.classList.add('correct');
            quizResultArea.classList.remove('incorrect');
            endQuiz(true);
        } else {
            quizResultArea.textContent = '不正解...';
            quizResultArea.classList.add('incorrect');
            quizResultArea.classList.remove('correct');
            currentQuiz.attemptCount++;

            if (currentQuiz.type === 'cardName') {
                displayCardNameQuizHint();
            } else {
                if (currentQuiz.attemptCount < 5) {
                    drawQuizImage();
                    if (quizNextButton) quizNextButton.style.display = 'inline-block';
                    if (quizNextButton) quizNextButton.textContent = '次のヒント';
                } else {
                    endQuiz(false);
                }
            }
        }
    }

    // クイズ終了
    function endQuiz(isCorrect) {
        if (!quizAnswerInput || !quizSubmitButton || !quizNextButton || !quizAnswerDisplay || !currentQuiz.quizCtx || !currentQuiz.quizCanvas || !quizResetButton) return;

        quizAnswerInput.disabled = true;
        quizSubmitButton.style.display = 'none';
        quizNextButton.style.display = 'none';

        quizAnswerDisplay.innerHTML = `正解は「<strong>${currentQuiz.card.name}</strong>」でした！`;

        const ctx = currentQuiz.quizCtx;
        let finalImage = currentQuiz.fullCardImage;

        if (currentQuiz.type === 'enlarge' || currentQuiz.type === 'silhouette' || currentQuiz.type === 'mosaic') {
            finalImage = currentQuiz.fullCardImage;
        }

        if (finalImage) {
            ctx.clearRect(0, 0, currentQuiz.quizCanvas.width, currentQuiz.quizCanvas.height);

            const imgAspectRatio = finalImage.naturalWidth / finalImage.naturalHeight;
            const canvasAspectRatio = currentQuiz.quizCanvas.width / currentQuiz.quizCanvas.height;

            let drawWidth, drawHeight, offsetX, offsetY;

            if (imgAspectRatio > canvasAspectRatio) {
                drawWidth = currentQuiz.quizCanvas.width;
                drawHeight = currentQuiz.quizCanvas.width / imgAspectRatio;
                offsetX = 0;
                offsetY = (currentQuiz.quizCanvas.height - drawHeight) / 2;
            } else {
                drawHeight = currentQuiz.quizCanvas.height;
                drawWidth = canvasAspectRatio === 0 ? finalImage.naturalWidth : currentQuiz.quizCanvas.height * imgAspectRatio;
                offsetX = (currentQuiz.quizCanvas.width - drawWidth) / 2;
                offsetY = 0;
            }
            ctx.drawImage(finalImage, offsetX, offsetY, drawWidth, drawHeight);
        } else {
             console.error("最終表示用の画像がロードされていないか、無効です。");
             ctx.fillStyle = 'red';
             ctx.font = '20px Arial';
             ctx.textAlign = 'center';
             ctx.fillText('画像エラー', quizCanvas.width / 2, quizCanvas.height / 2);
             ctx.fillText('(_transparent.pngが見つからないか無効です)', canvasWidth / 2, canvasHeight / 2 + 30);
        }

        quizResetButton.style.display = 'inline-block';
    }

    // イベントリスナーを再アタッチ
    if (quizCardNameButton) {
        quizCardNameButton.removeEventListener('click', handleQuizCardNameClick);
        quizCardNameButton.addEventListener('click', handleQuizCardNameClick);
    }
    if (quizIllustrationEnlargeButton) {
        quizIllustrationEnlargeButton.removeEventListener('click', handleQuizIllustrationEnlargeClick);
        quizIllustrationEnlargeButton.addEventListener('click', handleQuizIllustrationEnlargeClick);
    }
    if (quizIllustrationSilhouetteButton) {
        quizIllustrationSilhouetteButton.removeEventListener('click', handleQuizIllustrationSilhouetteClick);
        quizIllustrationSilhouetteButton.addEventListener('click', handleQuizIllustrationSilhouetteClick);
    }
    if (quizIllustrationMosaicButton) {
        quizIllustrationMosaicButton.removeEventListener('click', handleQuizIllustrationMosaicClick);
        quizIllustrationMosaicButton.addEventListener('click', handleQuizIllustrationMosaicClick);
    }

    if (quizSubmitButton) {
        quizSubmitButton.removeEventListener('click', checkAnswer);
        quizSubmitButton.addEventListener('click', checkAnswer);
        if (quizAnswerInput) {
            quizAnswerInput.removeEventListener('keypress', handleQuizAnswerInputKeypress);
            quizAnswerInput.addEventListener('keypress', handleQuizAnswerInputKeypress);
        }
    }
    if (quizNextButton) {
        quizNextButton.removeEventListener('click', handleQuizNextClick);
        quizNextButton.addEventListener('click', handleQuizNextClick);
    }
    if (quizResetButton) {
        quizResetButton.removeEventListener('click', resetQuiz);
        quizResetButton.addEventListener('click', resetQuiz);
    }

    // イベントハンドラ関数
    function handleQuizCardNameClick() { startQuiz('cardName'); }
    function handleQuizIllustrationEnlargeClick() { startQuiz('enlarge'); }
    function handleQuizIllustrationSilhouetteClick() { startQuiz('silhouette'); }
    function handleQuizIllustrationMosaicClick() { startQuiz('mosaic'); }
    function handleQuizAnswerInputKeypress(e) { if (e.key === 'Enter') checkAnswer(); }
    function handleQuizNextClick() {
        if (currentQuiz.type === 'cardName') {
            displayCardNameQuizHint();
        } else {
            drawQuizImage();
            if (quizNextButton) quizNextButton.style.display = 'none';
        }
        if (quizResultArea) {
            quizResultArea.textContent = '';
            quizResultArea.className = 'quiz-result-area';
        }
    }


    resetQuiz(); // 初期状態ではクイズUIを非表示に
}; // End of initMinigamesSection
