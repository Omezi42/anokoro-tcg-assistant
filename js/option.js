// js/options.js

document.addEventListener('DOMContentLoaded', () => {
    const a = (typeof browser !== "undefined") ? browser : chrome;
    if (typeof a === "undefined" || typeof a.runtime === "undefined") {
        console.error("TCG Assistant Options: Could not find browser/chrome runtime API.");
        return;
    }

    const notificationToggle = document.getElementById('notification-toggle');
    const queueNotificationToggle = document.getElementById('queue-notification-toggle');
    const themeSelect = document.getElementById('theme-select'); // テーマ選択要素を追加
    const saveButton = document.getElementById('save-button');
    const saveStatus = document.getElementById('save-status');

    // 設定を読み込んでUIに反映
    const restoreOptions = () => {
        a.storage.sync.get({
            notifications: true, // デフォルト値
            queueNotifications: false, // 新しいオプションのデフォルト値はオフ
            selectedTheme: 'default' // テーマのデフォルト値
        }, (items) => {
            if (notificationToggle) {
                notificationToggle.checked = items.notifications;
            }
            if (queueNotificationToggle) {
                queueNotificationToggle.checked = items.queueNotifications;
            }
            if (themeSelect) { // テーマ選択要素が存在する場合に設定を反映
                themeSelect.value = items.selectedTheme;
            }
        });
    };

    // 設定を保存
    const saveOptions = () => {
        const notifications = notificationToggle ? notificationToggle.checked : true;
        const queueNotifications = queueNotificationToggle ? queueNotificationToggle.checked : false;
        const selectedTheme = themeSelect ? themeSelect.value : 'default'; // 選択されたテーマを取得
        
        a.storage.sync.set({
            notifications: notifications,
            queueNotifications: queueNotifications,
            selectedTheme: selectedTheme // テーマ設定を保存
        }, () => {
            if (saveStatus) {
                saveStatus.textContent = '設定を保存しました！';
                setTimeout(() => {
                    saveStatus.textContent = '';
                }, 1500);
            }
            // テーマ変更をmain.jsに通知するためにメッセージを送信
            // background.jsを介してmain.jsにメッセージを転送する必要がある
            a.runtime.sendMessage({ action: "applyTheme", theme: selectedTheme });
        });
    };

    restoreOptions();
    if (saveButton) {
        saveButton.addEventListener('click', saveOptions);
    }

    // テーマ選択が変更されたら自動的に保存する（オプション）
    if (themeSelect) {
        themeSelect.addEventListener('change', saveOptions);
    }
});
