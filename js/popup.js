// js/popup.js

document.addEventListener('DOMContentLoaded', () => {
    // FirefoxとChromeのAPI名前空間の互換性を確保
    const a = (typeof browser !== "undefined") ? browser : chrome;
    if (typeof a === "undefined" || typeof a.runtime === "undefined") {
        console.error("TCG Assistant Popup: Could not find browser/chrome runtime API.");
        return;
    }

    const rateDisplay = document.getElementById('rate-display');
    const matchingCountDisplay = document.getElementById('matching-count-display'); // 追加
    const goToGameButton = document.getElementById('go-to-game-button');
    const buttons = document.querySelectorAll('.popup-button');
    const optionsButton = document.getElementById('options-button');

    // レートとマッチング人数をストレージから取得して表示
    const updatePopupInfo = () => {
        a.storage.local.get(['currentRate', 'matchingCount'], (data) => {
            if (rateDisplay) {
                rateDisplay.textContent = data.currentRate || '----';
            }
            if (matchingCountDisplay) {
                matchingCountDisplay.textContent = data.matchingCount !== undefined ? data.matchingCount : '--';
            }
        });
    };

    // ストレージの変更を監視してUIをリアルタイムで更新
    a.storage.local.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && (changes.currentRate || changes.matchingCount)) {
            updatePopupInfo();
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

    // 初回表示時の情報更新
    updatePopupInfo();
});
