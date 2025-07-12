// background.js (バックグラウンドスクリプト) - 修正版 v2.2

if (typeof browser === 'undefined') {
    var browser = chrome;
}

browser.runtime.onInstalled.addListener(() => {
  console.log("Background: TCG Assistant installed.");
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "injectSectionScript") {
      if (sender.tab && sender.tab.id && request.scriptPath) {
          // ★修正点: Manifest V3のscripting APIを優先的に使用する
          if (browser.scripting && browser.scripting.executeScript) {
              browser.scripting.executeScript({
                  target: { tabId: sender.tab.id },
                  files: [request.scriptPath]
              }).then(() => {
                  console.log(`Background (V3): Injected ${request.scriptPath} successfully.`);
                  sendResponse({ success: true });
              }).catch(error => {
                  console.error(`Background (V3): Failed to inject ${request.scriptPath}.`, error);
                  sendResponse({ success: false, error: error.message });
              });
          } else {
              // Manifest V2 (tabs.executeScript) へのフォールバック
              browser.tabs.executeScript(sender.tab.id, {
                  file: request.scriptPath
              }, () => {
                  if (browser.runtime.lastError) {
                      console.error(`Background (V2): Failed to inject ${request.scriptPath}.`, browser.runtime.lastError.message);
                      sendResponse({ success: false, error: browser.runtime.lastError.message });
                  } else {
                      console.log(`Background (V2): Injected ${request.scriptPath} successfully.`);
                      sendResponse({ success: true });
                  }
              });
          }
      } else {
          sendResponse({ success: false, error: "Invalid parameters for script injection." });
      }
      return true; // 非同期応答のためにtrueを返す
  }
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
