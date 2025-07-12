// js/sections/home.js - 修正版 v2.4

window.initHomeSection = async function() {
    console.log("Home section initialized (v2.4).");

    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    // === DOM要素の取得 ===
    const homeLoginStatus = document.getElementById('home-login-status');
    const homeLoginButton = document.getElementById('home-login-button');
    const homeLogoutButton = document.getElementById('home-logout-button');

    /**
     * ログイン状態に応じてホーム画面のUIを更新します。
     * @param {CustomEvent} [event] - loginStateChangedイベントオブジェクト（オプション）
     */
    const updateLoginStatusUI = (event) => {
        if (!homeLoginStatus || !homeLoginButton || !homeLogoutButton) return;

        // グローバルなTCG_ASSISTANTの状態を参照
        const assistant = window.TCG_ASSISTANT;
        
        if (assistant.isLoggedIn) {
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
    const onHomeLoginButtonClick = () => {
        // グローバルなtoggleContentArea関数を呼び出してレート戦セクションに移動
        if (window.toggleContentArea) {
            window.toggleContentArea('rateMatch', true);
        } else {
            console.error("Home: toggleContentArea function not available.");
        }
    };

    const onHomeLogoutButtonClick = async () => {
        const confirmed = await window.showCustomDialog('ログアウト', 'ログアウトしますか？', true);
        if (confirmed) {
            // WebSocketが接続中ならサーバーにログアウトリクエストを送信
            if (window.TCG_ASSISTANT.ws && window.TCG_ASSISTANT.ws.readyState === WebSocket.OPEN) {
                window.TCG_ASSISTANT.ws.send(JSON.stringify({ type: 'logout' }));
            } else {
                // 未接続でもローカルの状態をクリアするためにlogoutイベントを発行
                window.TCG_ASSISTANT.dispatchEvent(new CustomEvent('logout', { detail: { message: 'ログアウトしました。' }}));
            }
        }
    };

    // === イベントリスナー設定 ===
    homeLoginButton?.addEventListener('click', onHomeLoginButtonClick);
    homeLogoutButton?.addEventListener('click', onHomeLogoutButtonClick);

    // ★★★ 修正点 ★★★
    // main.jsのTCG_ASSISTANTインスタンスから発行されるイベントをリッスンするように変更
    window.TCG_ASSISTANT.removeEventListener('loginStateChanged', updateLoginStatusUI); // 重複登録を防止
    window.TCG_ASSISTANT.addEventListener('loginStateChanged', updateLoginStatusUI);

    // --- 初期化処理 ---
    // セクションが表示された瞬間に、現在のログイン状態でUIを正しく表示
    updateLoginStatusUI();
};

// Firefoxでのスクリプト注入エラーを防ぐため、戻り値を明示的にundefinedにする
void 0;
