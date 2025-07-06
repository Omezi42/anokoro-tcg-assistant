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
        sendResponse({ success: false, error: "Invalid parameters for script injection." });
    }
    // 非同期処理のためtrueを返し、sendResponseを後で呼び出すことを示す
    return true;
  } else if (request.action === "injectSectionScript") {
      // content.js からのスクリプト注入リクエスト
      if (sender.tab && sender.tab.id && request.scriptPath && request.initFunctionName) {
          chrome.scripting.executeScript({
              target: { tabId: sender.tab.id },
              files: [request.scriptPath] // 相対パスを直接使用
          }, () => {
              if (chrome.runtime.lastError) {                  
                  console.error(`Failed to execute script ${request.scriptPath}:`, chrome.runtime.lastError.message);
                  sendResponse({ success: false, error: chrome.runtime.lastError.message });
                  return;
              }
              // スクリプトが注入された後、その中の初期化関数を呼び出す
              chrome.scripting.executeScript({
                  target: { tabId: sender.tab.id },
                  function: (funcName, allCardsDataJson) => { // showCustomDialogCode を削除
                      // allCardsDataJson は JSON 文字列として渡されるのでパースする
                      const parsedAllCards = JSON.parse(allCardsDataJson);

                      // showCustomDialog は content.js のグローバル関数としてアクセスできるはず
                      const globalShowCustomDialog = window.showCustomDialog;

                      if (typeof window[funcName] === 'function') {
                          window[funcName](parsedAllCards, globalShowCustomDialog);
                      } else {
                          console.error(`Background: Initialization function ${funcName} not found on window object after script injection.`);
                      }
                  },
                  // allCards を JSON 文字列に変換して渡す。showCustomDialog は削除
                  args: [request.initFunctionName, JSON.stringify(request.allCards)] 
              }, () => {
                  if (chrome.runtime.lastError) {
                      console.error(`Failed to call init function ${request.initFunctionName}:`, chrome.runtime.lastError.message);
                      sendResponse({ success: false, error: chrome.runtime.lastError.message });
                      return;
                  }
                  sendResponse({ success: true });
              });
          });
      } else {
          sendResponse({ success: false, error: "Invalid parameters for script injection." });
      }
      return true; // 非同期処理のため
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
