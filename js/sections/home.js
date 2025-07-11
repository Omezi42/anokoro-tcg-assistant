// js/sections/home.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initHomeSection = async function() {
    console.log("Home section initialized.");

    // Firefox互換性のためのbrowserオブジェクトのフォールバック
    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    // 各要素を取得
    const homeLoginStatus = document.getElementById('home-login-status');
    const homeLoginButton = document.getElementById('home-login-button');
    const homeLogoutButton = document.getElementById('home-logout-button');

    /**
     * ログイン状態を更新し、UIに反映します。
     */
    const updateLoginStatusUI = () => {
        if (window.currentUserId && window.currentUsername) {
            // ログイン済み
            if (homeLoginStatus) homeLoginStatus.innerHTML = `現在、<strong>${window.currentUsername}</strong> としてログイン中。`;
            if (homeLoginButton) homeLoginButton.style.display = 'none';
            if (homeLogoutButton) homeLogoutButton.style.display = 'inline-block';
        } else {
            // 未ログイン
            if (homeLoginStatus) homeLoginStatus.innerHTML = 'ログインしていません。レート戦機能を利用するにはログインが必要です。';
            if (homeLoginButton) homeLoginButton.style.display = 'inline-block';
            if (homeLogoutButton) homeLogoutButton.style.display = 'none';
        }
    };

    // --- イベントハンドラ関数 ---
    /**
     * ホーム画面のログイン/登録ボタンクリックハンドラ。
     * レート戦セクションに移動してログインを促します。
     */
    function handleHomeLoginButtonClick() {
        if (window.toggleContentArea) {
            window.toggleContentArea('rateMatch', true); // 強制的にサイドバーを開き、レート戦セクションへ
        } else {
            console.error("Home: toggleContentArea function not available.");
            window.showCustomDialog('エラー', 'UI切り替え機能が利用できません。');
        }
    }

    /**
     * ホーム画面のログアウトボタンクリックハンドラ。
     * rateMatch.jsのログアウト処理を呼び出します。
     */
    async function handleHomeLogoutButtonClick() {
        if (window.handleLogoutButtonClickFromRateMatch) {
            await window.handleLogoutButtonClickFromRateMatch();
        } else {
            console.error("Home: handleLogoutButtonClickFromRateMatch function not available.");
            await window.showCustomDialog('エラー', 'ログアウト機能が利用できません。レート戦セクションからお試しください。');
        }
    }

    // --- イベントリスナーの再アタッチ ---
    if (homeLoginButton) {
        homeLoginButton.removeEventListener('click', handleHomeLoginButtonClick);
        homeLoginButton.addEventListener('click', handleHomeLoginButtonClick);
    }
    if (homeLogoutButton) {
        homeLogoutButton.removeEventListener('click', handleHomeLogoutButtonClick);
        homeLogoutButton.addEventListener('click', handleHomeLogoutButtonClick);
    }

    // ログイン状態が変更されたときにUIを更新
    document.removeEventListener('loginStateChanged', updateLoginStatusUI);
    document.addEventListener('loginStateChanged', updateLoginStatusUI);

    updateLoginStatusUI(); // 初期ロード時にもUIを更新
};
void 0; // Explicitly return undefined for Firefox compatibility
