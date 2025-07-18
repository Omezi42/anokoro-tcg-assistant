// js/sections/minigames.js

export function initialize() {
    if (document.body.dataset.minigamesInitialized === 'true') {
        return;
    }
    document.body.dataset.minigamesInitialized = 'true';
    console.log("Minigames section initializing...");

    let currentQuiz = {
        type: null, card: null, hintIndex: 0, attemptCount: 0,
        quizCanvas: null, quizCtx: null, fullCardImage: null, originalImageData: null,
        transparentCardImage: null // ★追加: 透明画像用のプロパティ
    };

    const quizCardNameButton = document.getElementById('quiz-card-name');
    const quizIllustrationEnlargeButton = document.getElementById('quiz-illustration-enlarge');
    const quizIllustrationSilhouetteButton = document.getElementById('quiz-illustration-silhouette');
    const quizIllustrationMosaicButton = document.getElementById('quiz-illustration-mosaic');
    const quizDisplayArea = document.getElementById('quiz-display-area');
    const quizTitle = document.getElementById('quiz-title'); // 修正済み
    const quizHintArea = document.getElementById('quiz-hint-area');
    const quizImageArea = document.getElementById('quiz-image-area');
    const quizCanvas = document.getElementById('quiz-canvas');
    const quizAnswerInput = document.getElementById('quiz-answer-input');
    const quizSubmitButton = document.getElementById('quiz-submit-button');
    const quizResultArea = document.getElementById('quiz-result-area');
    const quizAnswerDisplay = document.getElementById('quiz-answer-display');
    const quizNextButton = document.getElementById('quiz-next-button');
    const quizResetButton = document.getElementById('quiz-reset-button');

    if (!quizCardNameButton || !quizDisplayArea || !quizCanvas || !quizResetButton) {
        console.error("Minigames section is missing required elements.");
        return;
    }

    if (quizCanvas) {
        currentQuiz.quizCanvas = quizCanvas;
        currentQuiz.quizCtx = quizCanvas.getContext('2d');
    }

    function resetQuiz() {
        currentQuiz = { 
            ...currentQuiz, 
            type: null, 
            card: null, 
            hintIndex: 0, 
            attemptCount: 0, 
            fullCardImage: null, 
            originalImageData: null,
            transparentCardImage: null // ★追加: 透明画像プロパティのリセット
        };
        quizDisplayArea.style.display = 'none';
        quizTitle.textContent = '';
        quizHintArea.innerHTML = '';
        quizImageArea.style.display = 'none';
        quizCanvas.style.display = 'none';
        quizAnswerInput.value = '';
        quizResultArea.textContent = '';
        quizResultArea.className = 'quiz-result-area';
        quizAnswerDisplay.textContent = '';
        quizNextButton.style.display = 'none';
        quizSubmitButton.style.display = 'inline-block';
        quizAnswerInput.disabled = false;
    }

    async function startQuiz(type) {
        if (!window.tcgAssistant.allCards || window.tcgAssistant.allCards.length === 0) {
            await window.showCustomDialog('エラー', 'カードデータがロードされていません。');
            return;
        }
        resetQuiz();
        currentQuiz.type = type;
        currentQuiz.card = window.tcgAssistant.allCards[Math.floor(Math.random() * window.tcgAssistant.allCards.length)];
        quizDisplayArea.style.display = 'block';
        quizTitle.textContent = getQuizTitle(type);

        if (type === 'cardName') {
            displayCardNameQuizHint();
        } else {
            quizImageArea.style.display = 'flex';
            quizCanvas.style.display = 'block';
            try {
                await loadImageForQuiz(currentQuiz.card.name);
                drawQuizImage();
            } catch (error) {
                await window.showCustomDialog('エラー', `クイズ画像の読み込みに失敗しました: ${currentQuiz.card.name}`);
                resetQuiz();
            }
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
        if (!currentQuiz.card) return;
        let hintsToShow = currentQuiz.card.info.slice(0, currentQuiz.hintIndex + 1);
        quizHintArea.innerHTML = hintsToShow.join('<br>');
        currentQuiz.hintIndex++;
        if (currentQuiz.hintIndex >= currentQuiz.card.info.length) {
            quizHintArea.innerHTML += '<br><br>これ以上ヒントはありません。';
            endQuiz(false);
        }
    }

    // 画像取得をバックグラウンドに依頼する方式に変更し、リトライロジックを追加
    async function loadImageForQuiz(cardName) {
        const a = (typeof browser !== "undefined") ? browser : chrome;
        const loadImageFromDataUrl = (dataUrl) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (err) => reject(new Error(`Failed to load image from data URL: ${err}`));
            img.src = dataUrl;
        });
    
        const externalUrl = `https://omezi42.github.io/tcg-assistant-images/cards/${encodeURIComponent(cardName)}.png`;
        const MAX_RETRIES = 3; // 最大リトライ回数
        
        for (let i = 0; i < MAX_RETRIES; i++) {
            try {
                // 通常のカード画像をロード
                const response = await a.runtime.sendMessage({ action: "fetchImageAsDataURL", url: externalUrl });

                if (!response || !response.success) {
                    if (i < MAX_RETRIES - 1) {
                        console.warn(`Attempt ${i + 1} failed to fetch full image. Retrying...`, response?.error);
                        await new Promise(resolve => setTimeout(resolve, 200 * (i + 1))); 
                        continue; 
                    }
                    throw new Error(response.error || "Failed to fetch full image from background script after retries.");
                }
                currentQuiz.fullCardImage = await loadImageFromDataUrl(response.dataUrl);
                
                // ★シルエットクイズの場合のみ、透明画像をロード
                if (currentQuiz.type === 'silhouette') {
                    const transparentUrl = `https://omezi42.github.io/tcg-assistant-images/cards/${encodeURIComponent(cardName)}_transparent.png`;
                    const transparentResponse = await a.runtime.sendMessage({ action: "fetchImageAsDataURL", url: transparentUrl });
                    if (!transparentResponse || !transparentResponse.success) {
                        if (i < MAX_RETRIES - 1) {
                            console.warn(`Attempt ${i + 1} failed to fetch transparent image. Retrying...`, transparentResponse?.error);
                            await new Promise(resolve => setTimeout(resolve, 200 * (i + 1))); 
                            continue; 
                        }
                        throw new Error(transparentResponse.error || "Failed to fetch transparent image from background script after retries.");
                    }
                    currentQuiz.transparentCardImage = await loadImageFromDataUrl(transparentResponse.dataUrl);
                }
                
                // ★キャンバスの描画バッファサイズを、表示サイズに合わせる
                // これにより、CSSでキャンバスが拡大されても画像がぼやけなくなる
                if (quizCanvas && currentQuiz.fullCardImage) {
                    const img = currentQuiz.fullCardImage;
                    const parentWidth = quizImageArea.offsetWidth; 
                    const parentHeight = quizImageArea.offsetHeight;

                    let targetWidth, targetHeight;

                    // ★クイズタイプによってキャンバスのサイズ調整ロジックを分岐
                    if (currentQuiz.type === 'silhouette') {
                        // シルエットクイズの場合、切り取られた領域の比率に合わせる
                        const CROP_WIDTH = 457 - 20; // 437
                        const CROP_HEIGHT = 310 - 90; // 220
                        const croppedAspectRatio = CROP_WIDTH / CROP_HEIGHT;
                        const parentAspectRatio = parentWidth / parentHeight;

                        if (croppedAspectRatio > parentAspectRatio) {
                            targetWidth = parentWidth;
                            targetHeight = parentWidth / croppedAspectRatio;
                        } else {
                            targetHeight = parentHeight;
                            targetWidth = parentHeight * croppedAspectRatio;
                        }
                    } else {
                        // その他のクイズの場合、元のカード画像の比率に合わせる
                        const imgAspectRatio = img.naturalWidth / img.naturalHeight;
                        const parentAspectRatio = parentWidth / parentHeight;

                        if (imgAspectRatio > parentAspectRatio) {
                            targetWidth = parentWidth;
                            targetHeight = parentWidth / imgAspectRatio;
                        } else {
                            targetHeight = parentHeight;
                            targetWidth = parentHeight * imgAspectRatio;
                        }
                    }

                    quizCanvas.width = targetWidth;
                    quizCanvas.height = targetHeight;
                    
                    // originalImageDataは、モザイク処理のために元の画像全体から取得する
                    const tempOriginalCanvas = document.createElement('canvas');
                    tempOriginalCanvas.width = currentQuiz.fullCardImage.naturalWidth;
                    tempOriginalCanvas.height = currentQuiz.fullCardImage.naturalHeight;
                    const tempOriginalCtx = tempOriginalCanvas.getContext('2d');
                    tempOriginalCtx.drawImage(currentQuiz.fullCardImage, 0, 0);
                    currentQuiz.originalImageData = tempOriginalCtx.getImageData(0, 0, tempOriginalCanvas.width, tempOriginalCanvas.height);
                }
                return; 
            } catch (error) {
                if (i < MAX_RETRIES - 1) {
                    console.warn(`Attempt ${i + 1} caught error during image load. Retrying...`, error);
                    await new Promise(resolve => setTimeout(resolve, 200 * (i + 1))); 
                    continue; 
                }
                console.error("Error in loadImageForQuiz after all retries:", error);
                throw error; 
            }
        }
    }
    
    function drawQuizImage() {
        if (!currentQuiz.quizCtx || !currentQuiz.quizCanvas || !currentQuiz.fullCardImage) return;
        const ctx = currentQuiz.quizCtx;
        const img = currentQuiz.fullCardImage;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        switch (currentQuiz.type) {
            case 'enlarge': drawEnlargedImage(ctx, img, currentQuiz.attemptCount); break;
            case 'silhouette': drawSilhouetteImage(ctx, img); break; // imgはfullCardImage
            case 'mosaic': drawMosaicImage(ctx, currentQuiz.originalImageData, currentQuiz.attemptCount); break;
        }
    }

    // Helper function to calculate draw dimensions for 'object-fit: cover'
    // ★zoomFactor引数を追加 (シルエットクイズ用)
    function calculateCoverDrawDimensions(imgWidth, imgHeight, canvasWidth, canvasHeight, zoomFactor = 1) {
        const imgAspectRatio = imgWidth / imgHeight;
        const canvasAspectRatio = canvasWidth / canvasHeight;

        let scale;
        if (imgAspectRatio > canvasAspectRatio) {
            // 画像がキャンバスより横長の場合、高さに合わせて描画し、幅をクロップ
            scale = canvasHeight / imgHeight;
        } else {
            // 画像がキャンバスより縦長の場合、幅に合わせて描画し、高さをクロップ
            scale = canvasWidth / imgWidth;
        }

        // ★追加のズームファクターを適用
        scale *= zoomFactor; 

        const drawWidth = imgWidth * scale;
        const drawHeight = imgHeight * scale;
        const drawX = (canvasWidth - drawWidth) / 2;
        const drawY = (canvasHeight - drawHeight) / 2;

        return { drawX, drawY, drawWidth, drawHeight };
    }

    // Helper function to calculate draw dimensions for 'object-fit: contain'
    function calculateContainDrawDimensions(imgWidth, imgHeight, canvasWidth, canvasHeight) {
        const imgAspectRatio = imgWidth / imgHeight;
        const canvasAspectRatio = canvasWidth / canvasHeight;

        let drawWidth, drawHeight;

        if (imgAspectRatio > canvasAspectRatio) {
            // 画像がキャンバスより横長の場合、幅に合わせて描画
            drawWidth = canvasWidth;
            drawHeight = canvasWidth / imgAspectRatio;
        } else {
            // 画像がキャンバスより縦長の場合、高さに合わせて描画
            drawHeight = canvasHeight;
            drawWidth = canvasHeight * imgAspectRatio;
        }
        const drawX = (canvasWidth - drawWidth) / 2;
        const drawY = (canvasHeight - drawHeight) / 2;

        return { drawX, drawY, drawWidth, drawHeight };
    }

    function drawEnlargedImage(ctx, img, attempt) {
        // ズーム率を調整し、より深くズームインして大きく表示
        const zoom = [0.01, 0.015, 0.03, 0.05, 0.1, 0.2][attempt] || 0.25;
        
        // 元画像の表示する部分（ソース矩形）を計算
        const sourceWidth = img.naturalWidth * zoom;
        const sourceHeight = img.naturalHeight * zoom;
        const sourceX = (img.naturalWidth - sourceWidth) / 2;
        const sourceY = (img.naturalHeight - sourceHeight) / 4; // 画像の上部をフォーカスする

        const canvasWidth = ctx.canvas.width;
        const canvasHeight = ctx.canvas.height;
        
        // 描画先はキャンバス全体にフィット
        ctx.drawImage(
            img,
            sourceX, sourceY, sourceWidth, sourceHeight, // ソース矩形
            0, 0, canvasWidth, canvasHeight              // 描画先矩形 (キャンバス全体にフィット)
        );
    }
    
    // ★シルエットクイズの描画ロジック
    function drawSilhouetteImage(ctx, fullCardImg) { // `fullCardImg`はcurrentQuiz.fullCardImage
        if (!currentQuiz.transparentCardImage) {
            console.error("Transparent image not loaded for silhouette quiz.");
            return;
        }

        const canvasWidth = ctx.canvas.width;
        const canvasHeight = ctx.canvas.height;

        // クロップ領域の定義
        const CROP_X1 = 20;
        const CROP_Y1 = 90;
        const CROP_X2 = 457;
        const CROP_Y2 = 310;
        const CROP_WIDTH = CROP_X2 - CROP_X1; // 437
        const CROP_HEIGHT = CROP_Y2 - CROP_Y1; // 220

        // 背景（クロップされた元のカード画像）の描画サイズを計算 (cover)
        // ここではキャンバスサイズが既にクロップ領域の比率に設定されているため、
        // キャンバス全体に描画すればフィットする
        ctx.clearRect(0, 0, canvasWidth, canvasHeight); // キャンバスをクリア

        // 1. クロップされた元のカード画像を背景として描画
        // drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
        // ソース矩形は元のカード画像からイラスト部分を切り取る
        // 描画先矩形はキャンバス全体
        ctx.drawImage(
            fullCardImg,          // ソース画像 (元のカード全体画像)
            CROP_X1, CROP_Y1, CROP_WIDTH, CROP_HEIGHT, // ソースの矩形 (クロップ領域)
            0, 0, canvasWidth, canvasHeight // 描画先の矩形 (キャンバス全体)
        );

        // 2. 透明画像をシルエット化して、その上に描画
        const tempCanvas = document.createElement('canvas');
        // 一時キャンバスもメインキャンバスと同じサイズにする
        tempCanvas.width = canvasWidth; 
        tempCanvas.height = canvasHeight; 
        const tempCtx = tempCanvas.getContext('2d');

        // 透明画像を一時キャンバスに描画し、シルエット化（黒塗り）
        // transparentCardImageは、イラスト部分のみの画像なので、それを一時キャンバス全体にスケール
        tempCtx.drawImage(
            currentQuiz.transparentCardImage, 
            0, 0, currentQuiz.transparentCardImage.naturalWidth, currentQuiz.transparentCardImage.naturalHeight, // ソース矩形 (透明画像全体)
            0, 0, tempCanvas.width, tempCanvas.height // 描画先矩形 (一時キャンバス全体)
        );

        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 0) { // 透明でないピクセル
                data[i] = 0;     // 赤
                data[i + 1] = 0; // 緑
                data[i + 2] = 0; // 青
            }
        }
        tempCtx.putImageData(imageData, 0, 0); // シルエット化したデータを一時キャンバスに戻す

        // シルエット化された画像をメインキャンバスの同じ位置に描画
        ctx.drawImage(tempCanvas, 0, 0);
    }

    function drawMosaicImage(ctx, originalImageData, attempt) {
        const pixelSize = [128, 96, 64, 48, 32][attempt] || 1;
        
        const originalWidth = originalImageData.width;
        const originalHeight = originalImageData.height;

        const canvasWidth = ctx.canvas.width;
        const canvasHeight = ctx.canvas.height;

        // モザイク画像をキャンバス全体にアスペクト比を維持しつつ覆うように描画
        // loadImageForQuizでキャンバスサイズが画像のアスペクト比に調整されているため、
        // 単純にキャンバス全体に描画すればクロップされずにフィットする
        ctx.clearRect(0, 0, canvasWidth, canvasHeight); // メインキャンバスをクリア

        // モザイクを元の解像度で描画するための一時キャンバスを作成
        const tempMosaicCanvas = document.createElement('canvas');
        tempMosaicCanvas.width = originalWidth;
        tempMosaicCanvas.height = originalHeight;
        const tempMosaicCtx = tempMosaicCanvas.getContext('2d');

        // 一時キャンバスにモザイクを描画
        for (let y = 0; y < originalHeight; y += pixelSize) {
            for (let x = 0; x < originalWidth; x += pixelSize) {
                const i = (y * originalWidth + x) * 4;
                tempMosaicCtx.fillStyle = `rgba(${originalImageData.data[i]},${originalImageData.data[i+1]},${originalImageData.data[i+2]},${originalImageData.data[i+3]/255})`;
                tempMosaicCtx.fillRect(x, y, pixelSize, pixelSize);
            }
        }

        // モザイク化された一時キャンバスを、メインキャンバスにスケールして描画
        // キャンバスは既にアスペクト比が調整されているため、0,0からcanvas.width,canvas.heightで描画
        ctx.drawImage(tempMosaicCanvas, 0, 0, canvasWidth, canvasHeight);
    }

    function checkAnswer() {
        if (!quizAnswerInput || !quizResultArea || !currentQuiz.card) return;
        const userAnswer = quizAnswerInput.value.trim();
        const correctAnswer = currentQuiz.card.name;
        const normalize = (str) => str.toLowerCase().replace(/\s/g, '').replace(/[\u30a1-\u30f6]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60));
        
        if (normalize(userAnswer) === normalize(correctAnswer)) {
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
                currentQuiz.attemptCount < 5 ? drawQuizImage() : endQuiz(false);
            }
        }
    }

    function endQuiz(isCorrect) {
        quizAnswerInput.disabled = true;
        quizSubmitButton.style.display = 'none';
        quizNextButton.style.display = 'none';
        quizAnswerDisplay.innerHTML = `正解は「<strong>${currentQuiz.card.name}</strong>」でした！`;
        if (currentQuiz.fullCardImage && currentQuiz.quizCtx) {
            const ctx = currentQuiz.quizCtx;
            
            const img = currentQuiz.fullCardImage;
            const parentWidth = quizImageArea.offsetWidth;
            const parentHeight = quizImageArea.offsetHeight;

            let targetWidth, targetHeight;
            const imgAspectRatio = img.naturalWidth / img.naturalHeight;
            const parentAspectRatio = parentWidth / parentHeight;

            // 答え合わせの際は常に元のカード画像の比率に合わせてキャンバスサイズを調整
            if (imgAspectRatio > parentAspectRatio) {
                targetWidth = parentWidth;
                targetHeight = parentWidth / imgAspectRatio;
            } else {
                targetHeight = parentHeight;
                targetWidth = parentHeight * imgAspectRatio;
            }

            quizCanvas.width = targetWidth; // キャンバスの幅を再設定
            quizCanvas.height = targetHeight; // キャンバスの高さを再設定

            ctx.clearRect(0, 0, quizCanvas.width, quizCanvas.height); // 新しい寸法でキャンバスをクリア
            
            // 新しいキャンバスサイズに基づいて描画寸法を計算
            const { drawX, drawY, drawWidth, drawHeight } = calculateContainDrawDimensions(img.naturalWidth, img.naturalHeight, quizCanvas.width, quizCanvas.height);

            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
        }
        quizResetButton.style.display = 'inline-block';
    }
    
    quizCardNameButton.addEventListener('click', () => startQuiz('cardName'));
    quizIllustrationEnlargeButton.addEventListener('click', () => startQuiz('enlarge'));
    quizIllustrationSilhouetteButton.addEventListener('click', () => startQuiz('silhouette'));
    quizIllustrationMosaicButton.addEventListener('click', () => startQuiz('mosaic'));
    quizSubmitButton.addEventListener('click', checkAnswer);
    quizAnswerInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') checkAnswer(); });
    quizResetButton.addEventListener('click', resetQuiz);

    resetQuiz();
}
