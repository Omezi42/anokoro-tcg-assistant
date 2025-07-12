// js/sections/home.js - 修正版 v2.2

window.initHomeSection = async function() {
    console.log("Home section initialized (v2.2).");

    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    // === DOM要素の取得 ===
    const homeLoginStatus = document.getElementById('home-login-status');
    const homeLoginButton = document.getElementById('home-login-button');
    const homeLogoutButton = document.getElementById('home-logout-button');

    /**
     * ログイン状態に応じてホーム画面のUIを更新します。
     */
    const updateLoginStatusUI = () => {
        if (!homeLoginStatus || !homeLoginButton || !homeLogoutButton) return;

        const assistant = window.TCG_ASSISTANT;
        if (assistant.currentUserId) {
            // ログイン済みの場合
            homeLoginStatus.innerHTML = `現在、<strong>${assistant.currentDisplayName || assistant.currentUsername}</strong> としてログイン中です。`;
            homeLoginButton.style.display = 'none';
            homeLogoutButton.style.display = 'inline-block';
        } else {
            // 未ログインの場合
            homeLoginStatus.innerHTML = 'レート戦や戦績記録などの機能を利用するには、レート戦セクションからログインしてください。';
            homeLoginButton.style.display = 'inline-block';
            homeLogoutButton.style.display = 'none';
        }
    };

    // === DOMイベントハンドラ ===
    /**
     * ホーム画面の「ログイン/登録」ボタンがクリックされたときの処理。
     * レート戦セクションに移動してログインを促します。
     */
    const onHomeLoginButtonClick = () => {
        if (window.toggleContentArea) {
            window.toggleContentArea('rateMatch', true);
        } else {
            console.error("Home: toggleContentArea function not available.");
        }
    };

    /**
     * ホーム画面の「ログアウト」ボタンがクリックされたときの処理。
     * WebSocketを通じてログアウトリクエストを送信します。
     */
    const onHomeLogoutButtonClick = async () => {
        const confirmed = await window.showCustomDialog('ログアウト', 'ログアウトしますか？', true);
        if (confirmed) {
            if (window.TCG_ASSISTANT.ws && window.TCG_ASSISTANT.ws.readyState === WebSocket.OPEN) {
                window.TCG_ASSISTANT.ws.send(JSON.stringify({ type: 'logout' }));
            } else {
                // WebSocketが接続されていない場合でも、ローカルの状態はクリアする
                window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout', { detail: { message: 'ログアウトしました。' }}));
            }
        }
    };

    // === イベントリスナー設定 ===
    // DOM要素へのイベントリスナー
    homeLoginButton?.addEventListener('click', onHomeLoginButtonClick);
    homeLogoutButton?.addEventListener('click', onHomeLogoutButtonClick);

    // グローバルなTCG_ASSISTANTオブジェクトへのイベントリスナー
    // ログイン状態が変更されたらUIを更新する
    window.TCG_ASSISTANT.addEventListener('loginStateChanged', updateLoginStatusUI);

    // --- 初期化処理 ---
    // セクションが表示されたときに現在の状態でUIを即時更新
    updateLoginStatusUI();
};
