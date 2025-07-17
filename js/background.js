// js/background.js (Manifest V3)

const a = (typeof browser !== "undefined") ? browser : chrome;

if (typeof a === "undefined" || typeof a.runtime === "undefined") {
    console.error("TCG Assistant Background: Could not find browser/chrome runtime API.");
} else {
    a.runtime.onInstalled.addListener((details) => {
        console.log("あの頃の自作TCGアシスタントがインストールされました。");
    });

    a.runtime.onMessage.addListener((request, sender, sendResponse) => {
        const tabId = sender.tab?.id;
        let isAsync = false;

        switch (request.action) {
            case "showSection":
                if (tabId) a.tabs.sendMessage(tabId, { action: "showSection", section: request.section, forceOpenSidebar: request.forceOpenSidebar || false });
                break;

            case "toggleSidebar":
                if (tabId) a.tabs.sendMessage(tabId, { action: "toggleSidebar" });
                break;

            case "createNotification":
                a.notifications.create({
                    type: 'basic',
                    iconUrl: a.runtime.getURL('images/icon128.png'),
                    title: request.title || '通知',
                    message: request.message || ''
                });
                break;
            
            // FIX: Add a new case to handle fetching images as data URLs
            case 'fetchImageAsDataURL':
                fetch(request.url)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`Network response was not ok: ${response.statusText}`);
                        }
                        return response.blob();
                    })
                    .then(blob => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            sendResponse({ success: true, dataUrl: reader.result });
                        };
                        reader.onerror = () => {
                            sendResponse({ success: false, error: 'Failed to read blob as data URL.' });
                        };
                        reader.readAsDataURL(blob);
                    })
                    .catch(error => {
                        console.error('Fetch image error in background:', error);
                        sendResponse({ success: false, error: error.message });
                    });
                isAsync = true; // Mark as asynchronous
                break;

            default:
                break;
        }

        return isAsync;
    });

    a.commands.onCommand.addListener((command, tab) => {
        if (tab.url && tab.url.startsWith('https://unityroom.com/games/anokorotcg')) {
            if (command === "toggle-sidebar") {
                a.tabs.sendMessage(tab.id, { action: "toggleSidebar" });
            }
        } else {
            a.notifications.create({
                type: 'basic',
                iconUrl: a.runtime.getURL('images/icon128.png'),
                title: '操作不可',
                message: 'このコマンドは「あの頃の自作TCG」のゲームページでのみ有効です。'
            });
        }
    });
}
