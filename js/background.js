// background.js

// FirefoxとChromeのAPI名前空間の互換性を確保
// 'browser'変数を宣言する前にグローバルな'browser'オブジェクトを参照するように修正
const browserAPI = (typeof window.browser !== "undefined") ? window.browser : window.chrome;

// 拡張機能がインストールされたときのリスナー
browserAPI.runtime.onInstalled.addListener(() => {
  console.log("TCG Assistant: Background Script Installed/Updated.");
});

// --- Message Listener ---
// コンテンツスクリプトからのメッセージを処理します。
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // 画像取得リクエストの処理 (CORSエラー回避のため)
    if (request.action === "fetchImageAsDataURL") {
        fetch(request.url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Network response was not ok for ${request.url}`);
                }
                return response.blob();
            })
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    // 読み込みが成功したら、Data URLをコンテンツスクリプトに返す
                    sendResponse({ success: true, dataUrl: reader.result });
                };
                reader.onerror = () => {
                    console.error("Background script: Failed to read blob.");
                    sendResponse({ success: false, error: 'Failed to read blob as data URL.' });
                };
                reader.readAsDataURL(blob);
            })
            .catch(error => {
                console.error('Background fetch error:', error);
                sendResponse({ success: false, error: error.message });
            });
        
        // 非同期で応答を返すため、trueを返す
        return true;
    }

    // デスクトップ通知のリクエスト処理
    if (request.action === "matchFoundNotification" || request.action === "queueCountNotification") {
        browserAPI.storage.sync.get({ notifications: true, queueNotifications: false }, (items) => {
            if (request.action === "matchFoundNotification" && items.notifications) {
                browserAPI.notifications.create('matchFound', {
                    type: 'basic',
                    iconUrl: browserAPI.runtime.getURL('images/icon128.png'),
                    title: '対戦相手が見つかりました！',
                    message: '『あの頃の自作TCG』で対戦相手が見つかりました！ゲーム画面に戻りましょう。',
                    priority: 2
                });
            } else if (request.action === "queueCountNotification" && items.queueNotifications) {
                browserAPI.notifications.create('queueUpdate', {
                    type: 'basic',
                    iconUrl: browserAPI.runtime.getURL('images/icon128.png'),
                    title: 'マッチキュー情報',
                    message: `現在のマッチキュー人数: ${request.count}人`,
                    priority: 1
                });
            }
        });
    }

    // テーマ適用リクエストの処理 (options.jsからmain.jsへ転送)
    if (request.action === "applyTheme") {
        browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const gameTab = tabs.find(tab => tab.url && tab.url.startsWith('https://unityroom.com/games/anokorotcg'));
            if (gameTab && gameTab.id) {
                browserAPI.tabs.sendMessage(gameTab.id, { action: "setTheme", theme: request.theme });
            }
        });
    }
});

// --- Command Listener ---
// manifest.jsonで定義されたキーボードショートカットを処理します。
browserAPI.commands.onCommand.addListener(async (command, tab) => {
    if (command !== "toggle-sidebar") return;

    try {
        if (tab.url && tab.url.startsWith('https://unityroom.com/games/anokorotcg')) {
            // アクティブなタブのコンテンツスクリプトにメッセージを送信
            await browserAPI.tabs.sendMessage(tab.id, { action: "toggleSidebar" });
        } else {
            // ゲームページでない場合はアラートを表示
            await browserAPI.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    // alert() の代わりにカスタムダイアログを推奨しますが、
                    // background scriptから直接コンテンツスクリプトの関数を呼び出すのは複雑なため、
                    // ここではブラウザのalertを使用します。
                    // 理想的には、main.jsのshowCustomDialogを呼び出すべきです。
                    alert('このショートカットは「あの頃の自作TCG」のゲームページでのみ利用できます。');
                }
            });
        }
    } catch (e) {
        // スクリプトを注入できないページ（例: about:addons）でのエラーを捕捉
        console.error(`Could not execute command "${command}" on tab ${tab.id}:`, e);
    }
});
