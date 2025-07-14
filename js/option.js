// js/options.js

// Firefox互換性のためのbrowserオブジェクトのフォールバック
if (typeof browser === 'undefined') {
    var browser = chrome;
}

document.addEventListener('DOMContentLoaded', () => {
    const notificationToggle = document.getElementById('notification-toggle');
    const saveButton = document.getElementById('save-button');
    const saveStatus = document.getElementById('save-status');

    // 設定を読み込んでUIに反映
    function restoreOptions() {
        browser.storage.sync.get({
            notifications: true // デフォルト値
        }, (items) => {
            if (notificationToggle) {
                notificationToggle.checked = items.notifications;
            }
        });
    }

    // 設定を保存
    function saveOptions() {
        const notifications = notificationToggle ? notificationToggle.checked : true;
        
        browser.storage.sync.set({
            notifications: notifications
        }, () => {
            // 保存完了メッセージを表示
            if (saveStatus) {
                saveStatus.textContent = '設定を保存しました！';
                setTimeout(() => {
                    saveStatus.textContent = '';
                }, 1500);
            }
        });
    }

    // イベントリスナーを設定
    restoreOptions();
    if (saveButton) {
        saveButton.addEventListener('click', saveOptions);
    }
});
