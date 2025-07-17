// js/options.js

document.addEventListener('DOMContentLoaded', () => {
    const a = (typeof browser !== "undefined") ? browser : chrome;
    if (typeof a === "undefined" || typeof a.runtime === "undefined") {
        console.error("TCG Assistant Options: Could not find browser/chrome runtime API.");
        return;
    }

    const notificationToggle = document.getElementById('notification-toggle');
    const saveButton = document.getElementById('save-button');
    const saveStatus = document.getElementById('save-status');

    // 設定を読み込んでUIに反映
    const restoreOptions = () => {
        a.storage.sync.get({
            notifications: true // デフォルト値
        }, (items) => {
            if (notificationToggle) {
                notificationToggle.checked = items.notifications;
            }
        });
    };

    // 設定を保存
    const saveOptions = () => {
        const notifications = notificationToggle ? notificationToggle.checked : true;
        
        a.storage.sync.set({
            notifications: notifications
        }, () => {
            if (saveStatus) {
                saveStatus.textContent = '設定を保存しました！';
                setTimeout(() => {
                    saveStatus.textContent = '';
                }, 1500);
            }
        });
    };

    restoreOptions();
    if (saveButton) {
        saveButton.addEventListener('click', saveOptions);
    }
});
