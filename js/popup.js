// js/popup.js

document.addEventListener('DOMContentLoaded', () => {
    // FirefoxとChromeのAPI名前空間の互換性を確保
    const a = self.browser || self.chrome;

    const rateDisplay = document.getElementById('rate-display');
    const goToGameButton = document.getElementById('go-to-game-button');
    const buttons = document.querySelectorAll('.popup-button');
    const optionsButton = document.getElementById('options-button');

    // レートをストレージから取得して表示
    a.storage.local.get('currentRate', (data) => {
        if (rateDisplay) {
            rateDisplay.textContent = data.currentRate || '----';
        }
    });
    
    // backgroundにメッセージを送るヘルパー
    const sendMessageToActiveTab = (message) => {
        a.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const gameTab = tabs.find(tab => tab.url && tab.url.startsWith('https://unityroom.com/games/anokorotcg'));
            if (gameTab && gameTab.id) {
                a.tabs.sendMessage(gameTab.id, message);
            } else {
                // ゲームページが開かれていない場合、新しいタブで開く
                a.tabs.create({ url: "https://unityroom.com/games/anokorotcg" });
            }
        });
    };

    // 「ゲームへ」ボタン
    if (goToGameButton) {
        goToGameButton.addEventListener('click', () => {
            sendMessageToActiveTab({ action: "noop" }); // noopはタブをアクティブにするか開くだけ
            window.close();
        });
    }

    // 各セクションボタン
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            const section = button.dataset.section;
            sendMessageToActiveTab({ action: "showSection", section: section, forceOpenSidebar: true });
            window.close();
        });
    });

    // 設定ボタン
    if (optionsButton) {
        optionsButton.addEventListener('click', () => {
            a.runtime.openOptionsPage();
        });
    }
});
