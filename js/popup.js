// js/popup.js

// Firefox互換性のためのbrowserオブジェクトのフォールバック
if (typeof browser === 'undefined') {
    var browser = chrome;
}

// ポップアップがロードされたときに実行されます
document.addEventListener('DOMContentLoaded', () => {
    // すべてのセクションボタンを取得
    const buttons = document.querySelectorAll('.popup-button');
    const optionsButton = document.getElementById('options-button');

    // 各セクションボタンにクリックイベントリスナーを追加
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            const section = button.dataset.section;

            // 現在アクティブなタブ（ゲームが実行されているタブ）を取得
            browser.tabs.query({active: true, currentWindow: true}, (tabs) => {
                const gameTab = tabs[0];
                if (gameTab && gameTab.url && gameTab.url.startsWith('https://unityroom.com/games/anokorotcg')) {
                    // 現在のタブが指定のゲームURLであれば、メッセージを送信し、指定されたセクションを表示するよう要求
                    browser.tabs.sendMessage(gameTab.id, {action: "showSection", section: section, forceOpenSidebar: true});
                } else {
                    // ゲームページでない場合はユーザーに通知
                    alert('この拡張機能は「あの頃の自作TCG」のゲームページでのみ動作します。');
                }
                // ポップアップを閉じる
                window.close();
            });
        });
    });

    // 設定ボタンにクリックイベントリスナーを追加
    if (optionsButton) {
        optionsButton.addEventListener('click', () => {
            browser.runtime.openOptionsPage();
        });
    }
});
