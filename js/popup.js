// popup.js

// Firefox互換性のためのbrowserオブジェクトのフォールバック
if (typeof browser === 'undefined') {
    var browser = chrome;
}

// ポップアップがロードされたときに実行されます
document.addEventListener('DOMContentLoaded', () => {
    // すべてのセクションボタンを取得
    const buttons = document.querySelectorAll('.section-button');

    // 各ボタンにクリックイベントリスナーを追加
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            // クリックされたボタンのdata-section属性からセクションIDを取得
            const section = button.dataset.section;

            // 現在アクティブなタブ（ゲームが実行されているタブ）を取得
            browser.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (tabs[0] && tabs[0].url && tabs[0].url.startsWith('https://unityroom.com/games/anokorotcg')) {
                    // 現在のタブが指定のゲームURLであれば、メッセージを送信し、指定されたセクションを表示するよう要求
                    browser.tabs.sendMessage(tabs[0].id, {action: "showSection", section: section});
                } else {
                    // ゲームページでない場合はユーザーに通知
                    // カスタムダイアログを使用するように変更
                    // alert('この拡張機能は「あの頃の自作TCG」のゲームページでのみ動作します。');
                    // Manifest V2のtabs.executeScriptを使用
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
                    });
                }
            });
            // ポップアップを閉じる
            window.close();
        });
    });
});
