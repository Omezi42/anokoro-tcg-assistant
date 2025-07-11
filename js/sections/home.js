// js/sections/home.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initHomeSection = async function() { // async を維持
    console.log("Home section initialized.");

    // Firefox互換性のためのbrowserオブジェクトのフォールバック
    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    const homeLoginStatus = document.getElementById('home-login-status');
    const homeLoginButton = document.getElementById('home-login-button');
    const homeLogoutButton = document.getElementById('home-logout-button');

    // ログイン状態を更新する関数
    const updateLoginStatusUI = () => {
        if (window.currentUserId && window.currentUsername) {
            if (homeLoginStatus) homeLoginStatus.innerHTML = `現在、<strong>${window.currentUsername}</strong> としてログイン中。`;
            if (homeLoginButton) homeLoginButton.style.display = 'none';
            if (homeLogoutButton) homeLogoutButton.style.display = 'inline-block';
        } else {
            if (homeLoginStatus) homeLoginStatus.innerHTML = 'ログインしていません。レート戦機能を利用するにはログインが必要です。';
            if (homeLoginButton) homeLoginButton.style.display = 'inline-block';
            if (homeLogoutButton) homeLogoutButton.style.display = 'none';
        }
    };

    // イベントリスナーを再アタッチ
    if (homeLoginButton) {
        homeLoginButton.removeEventListener('click', handleHomeLoginButtonClick);
        homeLoginButton.addEventListener('click', handleHomeLoginButtonClick);
    }
    if (homeLogoutButton) {
        homeLogoutButton.removeEventListener('click', handleHomeLogoutButtonClick);
        homeLogoutButton.addEventListener('click', handleHomeLogoutButtonClick);
    }

    // イベントハンドラ関数
    function handleHomeLoginButtonClick() {
        // レート戦セクションに移動してログインを促す
        if (window.toggleContentArea) {
            window.toggleContentArea('rateMatch', true); // 強制的にサイドバーを開く
        } else {
            console.error("toggleContentArea function not available.");
        }
    }

    async function handleHomeLogoutButtonClick() {
        // rateMatch.jsのログアウト処理を呼び出す
        if (window.handleLogoutButtonClickFromRateMatch) {
            await window.handleLogoutButtonClickFromRateMatch();
        } else {
            console.error("handleLogoutButtonClickFromRateMatch function not available.");
            await window.showCustomDialog('エラー', 'ログアウト機能が利用できません。レート戦セクションからお試しください。');
        }
    }

    // ログイン状態が変更されたときにUIを更新
    document.removeEventListener('loginStateChanged', updateLoginStatusUI);
    document.addEventListener('loginStateChanged', updateLoginStatusUI);

    updateLoginStatusUI(); // 初期ロード時にもUIを更新
};
void 0; // Explicitly return undefined for Firefox compatibility
