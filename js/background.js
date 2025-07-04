// background.js

// 拡張機能がインストールされたときにメッセージをコンソールに出力します。
chrome.runtime.onInstalled.addListener((details) => {
  console.log("あの頃の自作TCGアシスタントがインストールされました。");
  // 初回インストール時にオプションページを開く（任意）
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    // chrome.runtime.openOptionsPage(); // 設定ページを自動で開く場合
  }
});

// popup.jsやcontent.jsからのメッセージを受け取り、content.jsに転送したり、通知を作成したりします。
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showSection" && sender.tab) {
    // 特定のセクションを表示するリクエスト
    chrome.tabs.sendMessage(sender.tab.id, {
      action: "showSection",
      section: request.section
    });
  } else if (request.action === "matchFoundNotification") {
    // 対戦相手が見つかった通知を作成します。
    chrome.notifications.create('matchFound', {
      type: 'basic',
      iconUrl: 'images/icon128.png', // 拡張機能のアイコン
      title: '対戦相手が見つかりました！',
      message: '『あの頃の自作TCG』で対戦相手が見つかりました！ゲーム画面に戻りましょう。',
      priority: 2
    });
  } else if (request.action === "captureScreenshot") {
    // スクリーンショットをキャプチャするリクエスト
    // activeTab権限は、ユーザーが拡張機能のツールバーアイコンをクリックしたときに一時的に付与される
    // そのコンテキストで content.js からメッセージが送られてきた場合、sender.tab.id を使ってキャプチャを試みる
    // sender.tab.id はメッセージを送ってきたタブのIDなので、これを使ってキャプチャする
    if (sender.tab && sender.tab.id) {
        chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, (screenshotUrl) => {
            if (chrome.runtime.lastError) {
                console.error("スクリーンショットのキャプチャに失敗しました:", chrome.runtime.lastError.message);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
                return;
            }
            sendResponse({ success: true, screenshotUrl: screenshotUrl });
        });
    } else {
        sendResponse({ success: false, error: "No active tab found for screenshot." });
    }
    // 非同期処理のためtrueを返し、sendResponseを後で呼び出すことを示す
    return true;
  }
});

// manifest.jsonで定義されたコマンドを処理します。
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url && tabs[0].url.startsWith('https://unityroom.com/games/anokorotcg')) {
      if (command === "open-home-section") {
        chrome.tabs.sendMessage(tabs[0].id, { action: "showSection", section: "home" });
      } else if (command === "open-memo-section") {
        chrome.tabs.sendMessage(tabs[0].id, { action: "showSection", section: "memo" });
      } else if (command === "toggle-sidebar") {
        chrome.tabs.sendMessage(tabs[0].id, { action: "toggleSidebar" });
      }
    } else {
      // ゲームページでない場合はユーザーに通知（content.jsのカスタムダイアログをトリガー）
      // chrome.scripting.executeScript を使用して、現在のタブにスクリプトを注入
      if (tabs[0] && tabs[0].id) {
          chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              function: () => {
                function showCustomAlertDialog(title, message) {
                  const existingOverlay = document.getElementById('tcg-custom-dialog-overlay');
                  if (existingOverlay) {
                      existingOverlay.remove();
                  }
      
                  const overlay = document.createElement('div');
                  overlay.id = 'tcg-custom-dialog-overlay';
                  overlay.className = 'tcg-modal-overlay';
                  overlay.innerHTML = `
                      <div class="tcg-modal-content">
                          <h3>${title}</h3>
                          <p>${message}</p>
                          <button id="tcg-dialog-ok-button">OK</button>
                      </div>
                  `;
                  document.body.appendChild(overlay);
      
                  setTimeout(() => overlay.classList.add('show'), 10);
      
                  const okButton = document.getElementById('tcg-dialog-ok-button');
                  okButton.addEventListener('click', () => {
                      overlay.classList.remove('show');
                      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
                  });
                }
                showCustomAlertDialog('注意', 'この拡張機能は「あの頃の自作TCG」のゲームページでのみ動作します。');
              }
          }).catch(error => console.error("Failed to execute script:", error));
      }
    }
  });
});
