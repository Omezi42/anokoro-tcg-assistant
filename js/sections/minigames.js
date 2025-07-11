// js/sections/minigames.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initMinigamesSection = async function() {
    console.log("Minigames section initialized.");

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
        // window.allCards が main.js でロードされていることを確認
        if (!window.allCards || window.allCards.length === 0) {
            await window.showCustomDialog('エラー', 'カードデータがロードされていません。拡張機能の初期化が完了しているか確認してください。');
            return;
        }
        resetQuiz(); // クイズ状態をリセット
        currentQuiz.type = type;

        let cardSelected = false;
        const maxAttemptsForImageLoad = 20; // 画像が見つかるまで試行する最大回数

        // クイズ用のカードをランダムに選択し、必要な画像をロード
        for (let i = 0; i < maxAttemptsForImageLoad; i++) {
            currentQuiz.card = window.allCards[Math.floor(Math.random() * window.allCards.length)]; // window.allCards を使用
            if (type !== 'cardName') { // イラストクイズの場合
                const cardName = currentQuiz.card.name;
                const imageUrl = browser.runtime.getURL(`images/cards/${cardName}.png`);
                try {
                    // フルカード画像の存在確認
                    const response = await fetch(imageUrl, { method: 'HEAD' });
                    if (response.ok) {
                        if (type === 'silhouette') {
                            // シルエットクイズに必要な透過画像と背景イラストの存在確認
                            const transparentImageUrl = browser.runtime.getURL(`images/cards/${cardName}_transparent.png`);
                            const illustImageUrl = browser.runtime.getURL(`images/cards/${cardName}_illust.png`);
                            const [transResponse, illustResponse] = await Promise.all([
                                fetch(transparentImageUrl, { method: 'HEAD' }),
                                fetch(illustImageUrl, { method: 'HEAD' })
                            ]);
                            if (transResponse.ok && illustResponse.ok) {
                                await loadImageForQuiz(cardName, type); // 画像をロード
                                cardSelected = true;
                                break;
                            } else {
                                console.warn(`Minigames: シルエットクイズに必要な画像が見つかりません: ${cardName}_transparent.png or ${cardName}_illust.png`);
                            }
                        } else { // 拡大クイズ、モザイククイズの場合
                            await loadImageForQuiz(cardName, type); // 画像をロード
                            cardSelected = true;
                            break;
                        }
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
     * @param {string} cardName - カード名。
     * @param {string} quizType - クイズのタイプ。
     * @returns {Promise<void>} 画像ロードが完了したら解決するPromise。
     */
    async function loadImageForQuiz(cardName, quizType) {
        return new Promise(async (resolve, reject) => {
            currentQuiz.fullCardImage = new Image();
            currentQuiz.fullCardImage.src = browser.runtime.getURL(`images/cards/${cardName}.png`);

            let loadPromises = [
                new Promise((res, rej) => {
                    currentQuiz.fullCardImage.onload = res;
                    currentQuiz.fullCardImage.onerror = () => {
                        console.error(`Minigames: フルカード画像のロードに失敗しました: ${currentQuiz.fullCardImage.src}`);
                        rej(new Error('Full card image load failed'));
                    };
                })
            ];

            if (quizType === 'silhouette') {
                currentQuiz.transparentIllustrationImage = new Image();
                currentQuiz.transparentIllustrationImage.src = browser.runtime.getURL(`images/cards/${cardName}_transparent.png`);
                loadPromises.push(new Promise((res, rej) => {
                    currentQuiz.transparentIllustrationImage.onload = res;
                    currentQuiz.transparentIllustrationImage.onerror = () => {
                        console.error(`Minigames: 透過イラスト画像のロードに失敗しました: ${currentQuiz.transparentIllustrationImage.src}`);
                        rej(new Error('Transparent illustration image load failed'));
                    };
                }));

                currentQuiz.illustrationImage = new Image();
                currentQuiz.illustrationImage.src = browser.runtime.getURL(`images/cards/${cardName}_illust.png`);
                loadPromises.push(new Promise((res, rej) => {
                    currentQuiz.illustrationImage.onload = res;
                    currentQuiz.illustrationImage.onerror = () => {
                        console.error(`Minigames: イラスト背景画像のロードに失敗しました: ${currentQuiz.illustrationImage.src}`);
                        rej(new Error('Illustration background image load failed'));
                    };
                }));
            }

            try {
                await Promise.all(loadPromises); // 全ての画像ロードを待機

                // Canvasのサイズを親要素に合わせて設定
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
    
                    // モザイククイズのためにオリジナル画像データを保存
                    const offscreenCanvas = document.createElement('canvas');
                    offscreenCanvas.width = imgNaturalWidth;
                    offscreenCanvas.height = imgNaturalHeight;
                    const offscreenCtx = offscreenCanvas.getContext('2d');
                    offscreenCtx.drawImage(currentQuiz.fullCardImage, 0, 0);
                    currentQuiz.originalImageData = offscreenCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
                }
                resolve();
            } catch (error) {
                console.error(`Minigames: 画像のロードに失敗しました: ${error}`);
                // 画像ロード失敗時のプレースホルダー表示
                if (quizImageArea && quizCanvas) {
                    quizImageArea.innerHTML = `<p style="color: red;">画像のロードに失敗しました。<br>（${cardName}.png または ${cardName}_transparent.png または ${cardName}_illust.png）<br>コンソールで詳細を確認してください。</p><img src="https://placehold.co/${quizCanvas.width || 200}x${quizCanvas.height || 200}/eee/333?text=No+Image" alt="Placeholder Image">`;
                }
                reject(new Error('Image load failed'));
            }
        });
    }

    /**
     * クイズ画像をCanvasに描画します。
     */
    function drawQuizImage() {
        if (!currentQuiz.quizCtx || !currentQuiz.quizCanvas || !currentQuiz.fullCardImage) return;

        const ctx = currentQuiz.quizCtx;
        const img = currentQuiz.fullCardImage;
        ctx.clearRect(0, 0, currentQuiz.quizCanvas.width, currentQuiz.quizCanvas.height); // Canvasをクリア

        if (!img || !img.complete || img.naturalWidth === 0) {
            console.warn("Minigames: 画像がまだロードされていないか、無効です。");
            return;
        }

        const destX = 0;
        const destY = 0;
        const destWidth = currentQuiz.quizCanvas.width;
        const destHeight = currentQuiz.quizCanvas.height;
        
        ctx.fillStyle = 'white'; // 背景を白で塗りつぶし
        ctx.fillRect(0, 0, currentQuiz.quizCanvas.width, currentQuiz.quizCanvas.height);

        // クイズタイプに応じて描画ロジックを分岐
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

    /**
     * イラスト拡大クイズの描画ロジック。
     * @param {CanvasRenderingContext2D} ctx - Canvasコンテキスト。
     * @param {HTMLImageElement} img - 元画像。
     * @param {number} attempt - 試行回数（拡大レベル）。
     * @param {number} destX - 描画先のX座標。
     * @param {number} destY - 描画先のY座標。
     * @param {number} destWidth - 描画先の幅。
     * @param {number} destHeight - 描画先の高さ。
     */
    function drawEnlargedImage(ctx, img, attempt, destX, destY, destWidth, destHeight) {
        const imgWidth = img.naturalWidth;
        const imgHeight = img.naturalHeight;

        const initialDisplaySize = 10; // 初期の表示サイズ
        const sizeIncrement = 10; // 試行ごとに増えるサイズ
        let displaySize = initialDisplaySize + attempt * sizeIncrement;

        // 表示サイズが画像サイズを超えないように制限
        if (displaySize > Math.min(imgWidth, imgHeight)) {
            displaySize = Math.min(imgWidth, imgHeight);
        }

        // 画像の中心付近を切り取る
        const sourceX = Math.floor(imgWidth / 2 - displaySize / 2);
        const sourceY = Math.floor(imgHeight * 0.25 - displaySize / 2); // カードイラストの上部を意識

        ctx.drawImage(
            img,
            sourceX, sourceY, displaySize, displaySize, // 元画像の切り取り範囲
            destX, destY, destWidth, destHeight // 描画先の範囲
        );
    }

    /**
     * イラストシルエットクイズの描画ロジック。
     * @param {CanvasRenderingContext2D} ctx - Canvasコンテキスト。
     * @param {HTMLImageElement} bgIllustrationImg - 背景イラスト画像。
     * @param {HTMLImageElement} transparentImg - 透過イラスト画像（シルエット用）。
     * @param {number} canvasWidth - Canvasの幅。
     * @param {number} canvasHeight - Canvasの高さ。
     */
    function drawSilhouetteImage(ctx, bgIllustrationImg, transparentImg, canvasWidth, canvasHeight) {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // 画像をCanvasにフィットさせるための描画寸法を計算するヘルパー関数
        function calculateDrawDims(image) {
            const imgAspectRatio = image.naturalWidth / image.naturalHeight;
            const canvasAspectRatio = canvasWidth / canvasHeight;

            let drawWidth, drawHeight, offsetX, offsetY;

            if (imgAspectRatio > canvasAspectRatio) {
                // 画像がCanvasより横長の場合、幅に合わせて高さを調整
                drawWidth = canvasWidth;
                drawHeight = canvasWidth / imgAspectRatio;
                offsetX = 0;
                offsetY = (canvasHeight - drawHeight) / 2;
            } else {
                // 画像がCanvasより縦長の場合、高さに合わせて幅を調整
                drawHeight = canvasHeight;
                drawWidth = canvasHeight * imgAspectRatio;
                offsetX = (canvasWidth - drawWidth) / 2;
                offsetY = 0;
            }
            return { drawWidth, drawHeight, offsetX, offsetY };
        }

        // 背景イラストを描画
        if (bgIllustrationImg && bgIllustrationImg.complete && bgIllustrationImg.naturalWidth > 0) {
            const { drawWidth, drawHeight, offsetX, offsetY } = calculateDrawDims(bgIllustrationImg);
            ctx.drawImage(bgIllustrationImg, offsetX, offsetY, drawWidth, drawHeight);
        } else {
            console.error("Minigames: シルエットクイズ用の背景イラスト画像がロードされていないか、無効です。");
            ctx.fillStyle = 'red';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('画像エラー', canvasWidth / 2, canvasHeight / 2);
            ctx.fillText('(背景イラスト画像が見つからないか無効です)', canvasWidth / 2, canvasHeight / 2 + 30);
            return;
        }

        let blackMaskAlpha = 1.0; // シルエットの不透明度（現在は常に1.0）

        if (blackMaskAlpha === 0) {
            return; // 透明なら描画しない
        }

        // 透過イラストを黒いシルエットとして描画
        if (transparentImg && transparentImg.complete && transparentImg.naturalWidth > 0) {
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = canvasWidth;
            offscreenCanvas.height = canvasHeight;
            const offscreenCtx = offscreenCanvas.getContext('2d');

            const { drawWidth: transDrawWidth, drawHeight: transDrawHeight, offsetX: transOffsetX, offsetY: transOffsetY } = calculateDrawDims(transparentImg);
            offscreenCtx.drawImage(transparentImg, transOffsetX, transOffsetY, transDrawWidth, transDrawHeight);

            offscreenCtx.globalCompositeOperation = 'source-in'; // 描画先と重なる部分のみ描画
            offscreenCtx.fillStyle = 'black'; // 黒で塗りつぶし
            offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

            ctx.globalAlpha = blackMaskAlpha; // 不透明度を設定
            ctx.drawImage(offscreenCanvas, 0, 0); // メインCanvasに描画
            ctx.globalAlpha = 1.0; // 不透明度をリセット
        } else {
            console.error("Minigames: シルエットクイズ用の透過イラスト画像がロードされていないか、無効です。");
            ctx.fillStyle = 'red';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('画像エラー', canvasWidth / 2, canvasHeight / 2);
            ctx.fillText('(_transparent.pngが見つからないか無効です)', canvasWidth / 2, canvasHeight / 2 + 30);
        }
    }

    /**
     * イラストモザイク化クイズの描画ロジック。
     * @param {CanvasRenderingContext2D} ctx - Canvasコンテキスト。
     * @param {HTMLImageElement} img - 元画像。
     * @param {number} attempt - 試行回数（モザイクの粗さレベル）。
     * @param {number} destX - 描画先のX座標。
     * @param {number} destY - 描画先のY座標。
     * @param {number} destWidth - 描画先の幅。
     * @param {number} destHeight - 描画先の高さ。
     */
    function drawMosaicImage(ctx, img, attempt, destX, destY, destWidth, destHeight) {
        const pixelSizeLevels = [128, 64, 32, 16, 8, 4]; // モザイクのピクセルサイズ
        const pixelSize = pixelSizeLevels[attempt] || 1; // 試行回数に応じたピクセルサイズ

        if (!currentQuiz.originalImageData || !quizCanvas) {
            ctx.drawImage(img, destX, destY, destWidth, destHeight); // オリジナルデータがない場合はそのまま描画
            return;
        }

        const originalData = currentQuiz.originalImageData.data;
        const originalWidth = currentQuiz.originalImageData.width;
        const originalHeight = currentQuiz.originalImageData.height;

        ctx.clearRect(0, 0, quizCanvas.width, quizCanvas.height); // Canvasをクリア
        
        const mosaicDrawWidth = destWidth;
        const mosaicDrawHeight = destHeight;
        const mosaicOffsetX = destX;
        const mosaicOffsetY = destY;

        // 画像をピクセルサイズで分割し、各ブロックの平均色で塗りつぶす
        for (let y = 0; y < originalHeight; y += pixelSize) {
            for (let x = 0; x < originalWidth; x += pixelSize) {
                let r = 0, g = 0, b = 0, a = 0;
                let count = 0;

                // 各ブロック内のピクセル色を平均化
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
                
                // モザイクブロックを描画
                const rectX = mosaicOffsetX + (x / originalWidth) * mosaicDrawWidth;
                const rectY = mosaicOffsetY + (y / originalHeight) * mosaicDrawHeight;
                const rectWidth = (pixelSize / originalWidth) * mosaicDrawWidth;
                const rectHeight = (pixelSize / originalHeight) * mosaicDrawHeight;

                ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
            }
        }
    }


    /**
     * 解答をチェックします。
     */
    function checkAnswer() {
        if (!quizAnswerInput || !quizResultArea || !currentQuiz.card) return;

        const userAnswer = quizAnswerInput.value.trim().toLowerCase();
        const correctAnswer = currentQuiz.card.name.toLowerCase();

        // 半角カタカナ、ひらがな、スペースを正規化するヘルパー関数
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
            endQuiz(true); // 正解でクイズ終了
        } else {
            quizResultArea.textContent = '不正解...';
            quizResultArea.classList.add('incorrect');
            quizResultArea.classList.remove('correct');
            currentQuiz.attemptCount++; // 試行回数を増やす

            if (currentQuiz.type === 'cardName') {
                displayCardNameQuizHint(); // カード名当てクイズなら次のヒント
            } else { // イラストクイズなら次のヒント（モザイク粗さ変更など）
                if (currentQuiz.attemptCount < 5) { // 試行回数に制限
                    drawQuizImage(); // 画像を再描画（ヒントレベル変更）
                    if (quizNextButton) quizNextButton.style.display = 'inline-block'; // 「次のヒント」ボタンを表示
                    if (quizNextButton) quizNextButton.textContent = '次のヒント';
                } else {
                    endQuiz(false); // 試行回数を超えたらクイズ終了
                }
            }
        }
    }

    /**
     * クイズを終了し、結果を表示します。
     * @param {boolean} isCorrect - 正解だったかどうか。
     */
    function endQuiz(isCorrect) {
        if (!quizAnswerInput || !quizSubmitButton || !quizNextButton || !quizAnswerDisplay || !currentQuiz.quizCtx || !currentQuiz.quizCanvas || !quizResetButton) return;

        quizAnswerInput.disabled = true; // 入力フィールドを無効化
        quizSubmitButton.style.display = 'none'; // 解答ボタンを非表示
        quizNextButton.style.display = 'none'; // 次のヒントボタンを非表示

        quizAnswerDisplay.innerHTML = `正解は「<strong>${currentQuiz.card.name}</strong>」でした！`; // 正解を表示

        const ctx = currentQuiz.quizCtx;
        let finalImage = currentQuiz.fullCardImage; // 最終的に表示する画像はフルカード画像

        // Canvasをクリアして最終画像を描画
        if (finalImage) {
            ctx.clearRect(0, 0, currentQuiz.quizCanvas.width, currentQuiz.quizCanvas.height);

            const imgAspectRatio = finalImage.naturalWidth / finalImage.naturalHeight;
            const canvasAspectRatio = currentQuiz.quizCanvas.width / currentQuiz.quizCanvas.height;

            let drawWidth, drawHeight, offsetX, offsetY;

            // 画像をCanvasにフィットさせるための描画寸法を計算
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
             console.error("Minigames: 最終表示用の画像がロードされていないか、無効です。");
             // エラー時のプレースホルダー表示
             ctx.fillStyle = 'red';
             ctx.font = '20px Arial';
             ctx.textAlign = 'center';
             ctx.fillText('画像エラー', quizCanvas.width / 2, quizCanvas.height / 2);
             ctx.fillText('(_transparent.pngが見つからないか無効です)', quizCanvas.width / 2, quizCanvas.height / 2 + 30);
        }

        if (quizResetButton) quizResetButton.style.display = 'inline-block'; // リセットボタンを表示
    }

    // --- イベントリスナーの再アタッチ ---
    // クイズ選択ボタン
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

    // 解答・次へ・リセットボタン
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

    // --- イベントハンドラ関数 ---
    function handleQuizCardNameClick() { startQuiz('cardName'); }
    function handleQuizIllustrationEnlargeClick() { startQuiz('enlarge'); }
    function handleQuizIllustrationSilhouetteClick() { startQuiz('silhouette'); }
    function handleQuizIllustrationMosaicClick() { startQuiz('mosaic'); }
    function handleQuizAnswerInputKeypress(e) { if (e.key === 'Enter') checkAnswer(); }
    function handleQuizNextClick() {
        if (currentQuiz.type === 'cardName') {
            displayCardNameQuizHint();
        } else {
            drawQuizImage(); // イラストクイズのヒント（モザイク粗さ変更など）
            if (quizNextButton) quizNextButton.style.display = 'none'; // ヒント表示後は非表示
        }
        if (quizResultArea) {
            quizResultArea.textContent = '';
            quizResultArea.className = 'quiz-result-area';
        }
    }

    resetQuiz(); // 初期状態ではクイズUIを非表示に
};
void 0; // Explicitly return undefined for Firefox compatibility
