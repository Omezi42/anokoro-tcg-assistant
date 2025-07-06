// js/sections/home.js

// グローバルなallCardsとshowCustomDialog関数を受け取るための初期化関数
window.initHomeSection = async function() { // async を維持
    console.log("Home section initialized.");

    // allCards は main.js でロードされ、グローバル変数として利用可能
    // showCustomDialog も main.js でグローバル関数として定義されている
    // ここで allCards の再ロードは不要

    // ここにHomeセクション固有のJSロジックがあれば記述
    // 現在はHTMLに直接記述されているため、特別な要素操作は不要
};
