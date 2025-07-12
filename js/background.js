// background.js (バックグラウンドスクリプト) - 修正版 v2.3

if (typeof browser === 'undefined') {
    var browser = chrome;
}

browser.runtime.onInstalled.addListener(() => {
  console.log("Background: TCG Assistant installed.");
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "injectSectionScript") {
      if (sender.tab && sender.tab.id && request.scriptPath) {
          // ★修正点: Firefoxでのエラーを回避するため、browser.tabs.executeScriptを優先的に使用する
          // Manifest V3のscripting APIはここでは考慮せず、Firefox (MV2)で安定動作するコードに絞る
          browser.tabs.executeScript(sender.tab.id, {
              file: request.scriptPath
          }).then(results => {
              // 成功した場合でも、results[0]が複雑なオブジェクトだとエラーになることがあるため、
              // シンプルな成功応答を返す。
              console.log(`Background (V2/Firefox): Injected ${request.scriptPath} successfully.`);
              sendResponse({ success: true });
          }).catch(error => {
              console.error(`Background (V2/Firefox): Failed to inject ${request.scriptPath}.`, error);
              sendResponse({ success: false, error: error.message });
          });
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
