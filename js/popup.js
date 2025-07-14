// js/popup.js

// Firefox互換性のためのbrowserオブジェクトのフォールバック
if (typeof browser === 'undefined') {
    var browser = chrome;
}

// ポップアップがロードされたときに実行されます
document.addEventListener('DOMContentLoaded', () => {
    const rateDisplay = document.getElementById('rate-display');
    const matchingCountDisplay = document.getElementById('matching-count-display');
    const goToGameButton = document.getElementById('go-to-game-button');
    const buttons = document.querySelectorAll('.popup-button');
    const optionsButton = document.getElementById('options-button');

    // --- データ取得・表示 ---

    // ユーザーのレートをストレージから取得して表示
    browser.storage.local.get('currentRate', (data) => {
        if (rateDisplay) {
            rateDisplay.textContent = data.currentRate || '----';
        }
    });

    // backgroundから現在のマッチング情報を取得して表示
    browser.runtime.sendMessage({ action: "get_matching_info" }, (response) => {
        if (browser.runtime.lastError) {
            console.error("Error getting matching info:", browser.runtime.lastError.message);
            if(matchingCountDisplay) matchingCountDisplay.textContent = '??人';
            return;
        }
        if (matchingCountDisplay) {
            matchingCountDisplay.textContent = `${response.count || 0}人`;
        }
    });

    // --- イベントリスナー ---

    // 「ゲームへ」ボタン
    if (goToGameButton) {
        goToGameButton.addEventListener('click', () => {
            browser.tabs.create({ url: "https://unityroom.com/games/anokorotcg" });
            window.close();
        });
    }

    // 各セクションボタン
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            const section = button.dataset.section;

            browser.tabs.query({active: true, currentWindow: true}, (tabs) => {
                const gameTab = tabs[0];
                if (gameTab && gameTab.id && gameTab.url && gameTab.url.startsWith('https://unityroom.com/games/anokorotcg')) {
                    browser.tabs.sendMessage(gameTab.id, {action: "showSection", section: section, forceOpenSidebar: true});
                } else {
                    alert('この拡張機能は「あの頃の自作TCG」のゲームページでのみ動作します。');
                }
                window.close();
            });
        });
    });

    // 設定ボタン
    if (optionsButton) {
        optionsButton.addEventListener('click', () => {
            browser.runtime.openOptionsPage();
        });
    }
});
