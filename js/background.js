// background.js

// Firefox互換性のためのbrowserオブジェクトのフォールバック
if (typeof browser === 'undefined') {
    var browser = chrome;
}

// 拡張機能がインストールされたときにメッセージをコンソールに出力します。
browser.runtime.onInstalled.addListener((details) => {
  console.log("あの頃の自作TCGアシスタントがインストールされました。");
  // 初回インストール時にオプションページを開く（任意）
  if (details.reason === browser.runtime.OnInstalledReason.INSTALL) {
    // browser.runtime.openOptionsPage(); // 設定ページを自動で開く場合
  }
});

// マッチング状態を管理する変数 (サービスワーカーのスコープ内で保持)
let currentMatchingTimeout = null;
let isUserMatching = false; // ユーザーがマッチング中かどうか
// ルームIDはUIから削除されたため、ここではシンプルなブール値でマッチ成立を管理
let currentMatchInfo = null; // 成立したマッチの情報 (roomIdは不要になったが、nullでないことでマッチ成立を示す)

// popup.jsやcontent.jsからのメッセージを受け取り、content.jsに転送したり、通知を作成したりします。
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 非同期処理のレスポンスを返すために sendResponse を保持
  // sendResponse は一度しか呼び出せないため、フラグで制御
  let responded = false;
  const sendAsyncResponse = (response) => {
      if (!responded) {
          sendResponse(response);
          responded = true;
      }
  };

  if (request.action === "showSection" && sender.tab) {
    // 特定のセクションを表示するリクエスト
    browser.tabs.sendMessage(sender.tab.id, {
      action: "showSection",
      section: request.section
    });
  } else if (request.action === "matchFoundNotification") {
    // 対戦相手が見つかった通知を作成します。
    browser.notifications.create('matchFound', {
      type: 'basic',
      iconUrl: 'images/icon128.png', // 拡張機能のアイコン
      title: '対戦相手が見つかりました！',
      message: '『あの頃の自作TCG』で対戦相手が見つかりました！ゲーム画面に戻りましょう。',
      priority: 2
    });
  } else if (request.action === "startMatching") {
    // マッチング開始リクエスト
    if (isUserMatching) {
        sendAsyncResponse({ success: false, error: "Already matching." });
        return;
    }
    isUserMatching = true;
    currentMatchInfo = null; // 新しいマッチング開始時は既存のマッチ情報をクリア
    console.log("Background: Matching started.");

    // 3秒後にマッチング完了をシミュレート
    currentMatchingTimeout = setTimeout(() => {
        isUserMatching = false; // マッチング終了
        currentMatchInfo = { matched: true }; // マッチが成立したことを示す
        console.log("Background: Match found!");

        // アクティブなタブにマッチング完了を通知
        browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                browser.tabs.sendMessage(tabs[0].id, {
                    action: "matchFound",
                    // roomIdは不要になったため削除
                });
            }
        });
        // 通知も作成
        browser.notifications.create('matchFound', {
            type: 'basic',
            iconUrl: 'images/icon128.png', // 拡張機能のアイコン
            title: '対戦相手が見つかりました！',
            message: '『あの頃の自作TCG』で対戦相手が見つかりました！ゲーム画面に戻りましょう。',
            priority: 2
        });

    }, 3000); // 3秒後にマッチング完了

    sendAsyncResponse({ success: true, message: "Matching started." });
    return true; // 非同期処理のため true を返す
  } else if (request.action === "cancelMatching") {
    // マッチングキャンセルリクエスト
    if (currentMatchingTimeout) {
        clearTimeout(currentMatchingTimeout);
        currentMatchingTimeout = null;
    }
    isUserMatching = false;
    currentMatchInfo = null; // キャンセル時はマッチ情報をクリア
    console.log("Background: Matching cancelled.");
    sendAsyncResponse({ success: true, message: "Matching cancelled." });
    return true; // 非同期処理のため true を返す
  } else if (request.action === "getMatchingStatus") {
    // マッチング状態の取得リクエスト
    sendAsyncResponse({ isMatching: isUserMatching, currentMatch: currentMatchInfo });
    return true; // 非同期処理のため true を返す
  } else if (request.action === "clearMatchInfo") {
    // マッチ情報をクリアするリクエスト (UIがマッチ後状態から抜ける際に呼び出す)
    currentMatchInfo = null;
    sendAsyncResponse({ success: true }); // 完了を通知
    return true;
  }
  else if (request.action === "injectSectionScript") {
      // content.js からのスクリプト注入リクエスト
      if (sender.tab && sender.tab.id && request.scriptPath && request.initFunctionName) {
          // Manifest V2: browser.tabs.executeScript を使用
          // code文字列の生成をより堅牢な形式に修正
          const scriptCode = `
              (function() {
                  // 既にスクリプトがロードされているかチェックするフラグ (initFunctionNameがwindowに存在するかで判断)
                  // ただし、initFunctionNameがwindowに存在しても、DOMが再ロードされている場合があるので、
                  // init関数内でイベントリスナーの重複登録防止は引き続き重要。
                  if (typeof window['${request.initFunctionName}'] === 'function' && window._injectedSectionScripts.has('${request.scriptPath}')) {
                      console.log('Background: Script ${request.scriptPath} already loaded, re-calling init function.');
                      window['${request.initFunctionName}']();
                  } else {
                      console.log('Background: Injecting script ${request.scriptPath} and calling init function.');
                      // スクリプトファイルを直接読み込む (fetchはcontent scriptからでは不可なので、backgroundから注入)
                      // この部分はbackground.jsが直接ファイルを注入する形式に変更
                      // browser.tabs.executeScript の file プロパティで直接注入
                  }
              })();
          `;
          
          browser.tabs.executeScript(sender.tab.id, {
              file: request.scriptPath // Manifest V2では 'file' プロパティで直接スクリプトファイルを指定
          }, () => {
              if (browser.runtime.lastError) {                  
                  console.error(`Failed to execute script ${request.scriptPath}:`, browser.runtime.lastError.message);
                  sendAsyncResponse({ success: false, error: browser.runtime.lastError.message });
                  return;
              }
              // スクリプトが注入された後、その中の初期化関数を呼び出す
              // initFunctionName を直接呼び出すコードを注入
              browser.tabs.executeScript(sender.tab.id, {
                  code: `
                      if (typeof window.${request.initFunctionName} === 'function') {
                          window.${request.initFunctionName}(); 
                      } else {
                          console.error('Background: Initialization function ${request.initFunctionName} not found on window object after script injection.');
                      }
                  `
              }, () => {
                  if (browser.runtime.lastError) {
                      console.error(`Failed to call init function ${request.initFunctionName}:`, browser.runtime.lastError.message);
                      sendAsyncResponse({ success: false, error: browser.runtime.lastError.message });
                      return;
                  }
                  sendAsyncResponse({ success: true });
              });
          });
      } else {
          sendAsyncResponse({ success: false, error: "Invalid parameters for script injection." });
      }
      return true; // 非同期処理のため true を返す
  }
  else if (request.action === "injectFirebaseSDKs") {
      // Firebase SDKsを動的に注入するリクエスト
      const scriptsToInject = [
          "js/lib/firebase/firebase-app.js",
          "js/lib/firebase/firebase-auth.js",
          "js/lib/firebase/firebase-firestore.js"
      ];

      const tabId = sender.tab.id; // リクエスト元のタブID

      const loadScript = (relativePath) => {
          return new Promise((res, rej) => {
              // Manifest V2: browser.tabs.executeScript を使用
              browser.tabs.executeScript(tabId, {
                  file: relativePath // Manifest V2では 'file' プロパティ
              }, (results) => {
                  if (browser.runtime.lastError) {
                      rej(new Error(browser.runtime.lastError.message));
                  } else if (results && results[0] && results[0].result === false) {
                      rej(new Error(`Script injection failed for ${relativePath}`));
                  } else {
                      res();
                  }
              });
          });
      };

      Promise.all(scriptsToInject.map(loadScript))
          .then(() => {
              console.log("Background: All Firebase SDKs injected successfully into content script.");
              sendAsyncResponse({ success: true });
          })
          .catch(error => {
              console.error("Background: Failed to inject Firebase SDKs:", error);
              sendAsyncResponse({ success: false, error: error.message });
          });
      return true; // 非同期処理のため true を返す
  }
});

// manifest.jsonで定義されたコマンドを処理します。
browser.commands.onCommand.addListener((command) => {
  browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url && tabs[0].url.startsWith('https://unityroom.com/games/anokorotcg')) {
      if (command === "open-home-section") {
        browser.tabs.sendMessage(tabs[0].id, { action: "showSection", section: "home" });
      } else if (command === "open-memo-section") {
        browser.tabs.sendMessage(tabs[0].id, { action: "showSection", section: "memo" });
      } else if (command === "toggle-sidebar") {
        browser.tabs.sendMessage(tabs[0].id, { action: "toggleSidebar" });
      }
    } else {
      // ゲームページでない場合はユーザーに通知（content.jsのカスタムダイアログをトリガー）
      if (tabs[0] && tabs[0].id) {
          // Manifest V2: browser.tabs.executeScript を使用
          browser.tabs.executeScript(tabs[0].id, {
              code: `
                function showCustomAlertDialog(title, message) {
                  const existingOverlay = document.getElementById('tcg-custom-dialog-overlay');
                  if (existingOverlay) {
                      existingOverlay.remove();
                  }
      
                  const overlay = document.createElement('div');
                  overlay.id = 'tcg-custom-dialog-overlay';
                  overlay.className = 'tcg-modal-overlay';
                  overlay.innerHTML = \`
                      <div class="tcg-modal-content">
                          <h3>\${title}</h3>
                          <p>\${message}</p>
                          <button id="tcg-dialog-ok-button">OK</button>
                      </div>
                  \`;
                  document.body.appendChild(overlay);
      
                  setTimeout(() => overlay.classList.add('show'), 10);
      
                  const okButton = document.getElementById('tcg-dialog-ok-button');
                  okButton.addEventListener('click', () => {
                      overlay.classList.remove('show');
                      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
                  });
                }
                showCustomAlertDialog('注意', 'この拡張機能は「あの頃の自作TCG」のゲームページでのみ動作します。');
              `
          }).catch(error => console.error("Failed to execute script:", error));
      }
    }
  });
});
// 通知を作成するヘルパー関数
function createNotification(id, title, message, iconUrl = "../images/icon128.png") {
    browser.notifications.create(id, {
        type: 'basic',
        iconUrl: browser.runtime.getURL(iconUrl),
        title: title,
        message: message,
        priority: 2
    });
}

// マッチング待機中のユーザー数を管理（デモ用）
let matchingUsersCount = 0;

// コンテンツスクリプトからのメッセージを受け取るリスナー
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start_matching") {
        matchingUsersCount++;
        createNotification(
            "matching-started",
            "マッチング開始",
            "対戦相手を探しています..."
        );
        sendResponse({status: "matching started"});
    } 
    else if (request.action === "cancel_matching") {
        matchingUsersCount = Math.max(0, matchingUsersCount - 1);
        sendResponse({status: "matching canceled"});
    }
    else if (request.action === "match_found") {
        matchingUsersCount = Math.max(0, matchingUsersCount - 2); // 自分と相手
         createNotification(
            "match-found",
            "対戦相手が見つかりました！",
            `${request.opponentName}さんとの対戦が始まります。`
        );
        sendResponse({status: "match found"});
    }
    else if (request.action === "get_matching_info") {
        // popup.jsからのリクエストに応答
        sendResponse({ count: matchingUsersCount });
    }
    else if (request.action === "injectSectionScript") {
        // Manifest V3 (Chrome) and Firefox
        if (browser.scripting && browser.scripting.executeScript) {
             browser.scripting.executeScript({
                target: { tabId: sender.tab.id },
                files: [request.scriptPath]
            }).then(() => {
                browser.scripting.executeScript({
                    target: { tabId: sender.tab.id },
                    func: (functionName) => {
                        if (typeof window[functionName] === 'function') {
                            window[functionName]();
                        }
                    },
                    args: [request.initFunctionName]
                });
                sendResponse({success: true});
            }).catch(error => {
                console.error(`Failed to inject script ${request.scriptPath}:`, error);
                sendResponse({success: false, error: error.message});
            });
        } else { // Manifest V2 (older Firefox)
            browser.tabs.executeScript(sender.tab.id, { file: request.scriptPath })
            .then(() => {
                 browser.tabs.executeScript(sender.tab.id, {
                    code: `if (typeof window['${request.initFunctionName}'] === 'function') { window['${request.initFunctionName}'](); }`
                });
                sendResponse({success: true});
            })
            .catch(error => {
                console.error(`Failed to inject script ${request.scriptPath}:`, error);
                sendResponse({success: false, error: error.message});
            });
        }
        return true; // Indicates that the response is sent asynchronously
    }
});
