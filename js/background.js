// js/background.js (Manifest V3)

// FirefoxとChromeのAPI名前空間の互換性を確保
const a = self.browser || self.chrome;

// インストール時の処理
a.runtime.onInstalled.addListener((details) => {
    console.log("あの頃の自作TCGアシスタントがインストールされました。");
    if (details.reason === a.runtime.OnInstalledReason.INSTALL) {
        // a.runtime.openOptionsPage(); // 初回インストール時に設定ページを開く場合
    }
});

// メッセージリスナー
a.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const tabId = sender.tab?.id;
    if (!tabId) {
        console.error("メッセージの送信元タブが見つかりません。", request);
        return;
    }

    // 非同期応答のためにtrueを返す
    let isAsync = false;

    switch (request.action) {
        case "showSection":
            a.tabs.sendMessage(tabId, {
                action: "showSection",
                section: request.section,
                forceOpenSidebar: request.forceOpenSidebar || false
            });
            break;

        case "toggleSidebar":
             a.tabs.sendMessage(tabId, { action: "toggleSidebar" });
             break;

        case "createNotification":
            a.notifications.create({
                type: 'basic',
                iconUrl: a.runtime.getURL('images/icon128.png'),
                title: request.title || '通知',
                message: request.message || ''
            });
            break;

        case "injectSectionScript":
            // Manifest V3では、content scriptから直接動的にスクリプトを読み込むため、
            // このメッセージは不要になりました。main.jsが直接import()を使います。
            // 互換性のために残していますが、将来的には削除を検討します。
            console.log("injectSectionScriptはV3では非推奨です。");
            sendResponse({ success: true, message: "V3では何もしません。" });
            break;

        // その他のバックグラウンドタスク...
        default:
            console.warn(`不明なアクションを受信しました: ${request.action}`);
            break;
    }

    return isAsync; // 非同期応答がある場合はtrueを返す
});

// コマンドリスナー
a.commands.onCommand.addListener((command, tab) => {
    if (tab.url && tab.url.startsWith('https://unityroom.com/games/anokorotcg')) {
        if (command === "toggle-sidebar") {
            a.tabs.sendMessage(tab.id, { action: "toggleSidebar" });
        }
    } else {
        // ゲームページでない場合は通知
        a.notifications.create({
            type: 'basic',
            iconUrl: a.runtime.getURL('images/icon128.png'),
            title: '操作不可',
            message: 'このコマンドは「あの頃の自作TCG」のゲームページでのみ有効です。'
        });
    }
});
