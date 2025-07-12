// background.js (バックグラウンドスクリプト) - 修正版 v2.1

if (typeof browser === 'undefined') {
    var browser = chrome;
}

browser.runtime.onInstalled.addListener(() => {
  console.log("Background: TCG Assistant installed.");
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // ★修正点: スクリプト注入ロジックを簡素化・安定化
  if (request.action === "injectSectionScript") {
      if (sender.tab && sender.tab.id && request.scriptPath) {
          // Manifest V2/V3互換の方法
          const scripting = browser.scripting || {
              executeScript: (target, details, callback) => {
                  browser.tabs.executeScript(target.tabId, details, (results) => {
                      if (callback) callback(results);
                  });
              }
          };
          
          scripting.executeScript({
              target: { tabId: sender.tab.id },
              files: [request.scriptPath]
          }, () => {
              if (browser.runtime.lastError) {
                  console.error(`Background: Failed to inject ${request.scriptPath}.`, browser.runtime.lastError.message);
                  sendResponse({ success: false, error: browser.runtime.lastError.message });
              } else {
                  console.log(`Background: Injected ${request.scriptPath} successfully.`);
                  sendResponse({ success: true });
              }
          });
      } else {
          sendResponse({ success: false, error: "Invalid parameters for script injection." });
      }
      return true; // 非同期応答のためにtrueを返す
  }
  // その他のメッセージハンドリングは削除 (main.jsで完結するため)
});

// manifest.jsonで定義されたコマンドを処理
browser.commands.onCommand.addListener((command) => {
  browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab && tab.id) {
        // コマンドを直接コンテンツスクリプトに転送する
        browser.tabs.sendMessage(tab.id, { action: "command", command: command }, (response) => {
            if (browser.runtime.lastError) {
                console.log("Command could not be sent, probably not on the game page.", browser.runtime.lastError.message);
            }
        });
    }
  });
});
