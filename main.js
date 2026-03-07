/**
 * main.js
 *
 * ボール合体パズルゲームのメインスクリプト。
 *
 * このファイルでは、以下の処理を管理します（現在は初期設定の枠組みのみ）。
 * - Matter.jsを用いた物理エンジンの初期化・更新
 * - ボールの生成・落下・合体処理
 * - ゲームの進行状況（スコア、Nextボール、ゲームオーバー判定）の管理
 * - ユーザーインターフェース（HTML/CSS要素）の更新
 *
 * @module SuikaGame
 */

/**
 * @namespace Game
 * ゲーム全体のグローバル状態や設定を管理するオブジェクト
 */
const Game = {
    score: 0,
    isGameOver: false,
    engine: null,
    render: null,
    runner: null,
    nextBallType: null
};

// Matter.js のモジュールエイリアス
const Engine = Matter.Engine,
      Render = Matter.Render,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Composite = Matter.Composite;

/**
 * 8種類のボールの定義
 * レベル1（最小）からレベル8（最大）までのサイズと色を設定します。
 */
const BALL_TYPES = [
    { level: 1, radius: 15, color: '#ff6b81', name: 'Pink' },   // 1. ピンク
    { level: 2, radius: 25, color: '#ff4757', name: 'Red' },    // 2. 赤
    { level: 3, radius: 35, color: '#1e90ff', name: 'Blue' },   // 3. 青
    { level: 4, radius: 45, color: '#9c88ff', name: 'Purple' }, // 4. 紫
    { level: 5, radius: 55, color: '#eccc68', name: 'Yellow' }, // 5. 黄色
    { level: 6, radius: 65, color: '#2ed573', name: 'Green' },  // 6. 緑
    { level: 7, radius: 80, color: '#d2b48c', name: 'Brown' },  // 7. 茶色（※色は適宜パステル調に調整）
    { level: 8, radius: 100, color: '#2f3542', name: 'Black' }  // 8. 黒
];

/**
 * ゲームの初期化処理を行います。
 * ウィンドウの読み込み完了時に呼び出され、Matter.jsのセットアップや
 * 初期UIの構築、イベントリスナーの登録を担当します。
 */
function init() {
    console.log("ゲーム初期化開始");

    const container = document.getElementById('game-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Matter.js エンジンの作成
    Game.engine = Engine.create();

    // Matter.js レンダラーの作成とコンテナへの追加
    Game.render = Render.create({
        element: container,
        engine: Game.engine,
        options: {
            width: width,
            height: height,
            wireframes: false, // 塗りつぶし描画を有効にする
            background: '#111' // デフォルト背景色（暗い色）
        }
    });

    Render.run(Game.render);

    // Runner の作成と実行
    Game.runner = Runner.create();
    Runner.run(Game.runner, Game.engine);

    // 壁と床の作成
    const wallOptions = {
        isStatic: true,
        render: { fillStyle: '#333' }
    };
    const groundOptions = {
        isStatic: true,
        render: { fillStyle: '#555' }
    };

    const wallThickness = 60;

    const ground = Bodies.rectangle(width / 2, height + wallThickness / 2 - 10, width, wallThickness, groundOptions);
    const leftWall = Bodies.rectangle(0 - wallThickness / 2, height / 2, wallThickness, height * 2, wallOptions);
    const rightWall = Bodies.rectangle(width + wallThickness / 2, height / 2, wallThickness, height * 2, wallOptions);

    Composite.add(Game.engine.world, [ground, leftWall, rightWall]);

    // 次のボールを決定してUIを更新
    setNextBallType();

    // TODO: 初期状態のUI描画、イベントリスナー登録
}

/**
 * 次に落下させるボール（レベル1〜3の中からランダム）を決定し、Game.nextBallTypeにセットします。
 */
function setNextBallType() {
    // 0, 1, 2 のいずれかをランダムに取得（レベル1〜3に対応）
    const randomIndex = Math.floor(Math.random() * 3);
    Game.nextBallType = BALL_TYPES[randomIndex];
    console.log(`次のボールが決定されました: レベル ${Game.nextBallType.level} (${Game.nextBallType.name})`);

    // UIのプレビュー表示を更新
    const previewElement = document.getElementById('next-ball-preview');
    if (previewElement && Game.nextBallType) {
        previewElement.style.backgroundColor = Game.nextBallType.color;
        // プレビューのサイズを調整（大きすぎないようにする）
        const previewSize = Game.nextBallType.radius;
        previewElement.style.width = `${previewSize}px`;
        previewElement.style.height = `${previewSize}px`;
        // プレビューコンテナの配置上、中央に表示されるようにマージンなどを調整
        previewElement.style.margin = 'auto';
    }
}

/**
 * 指定した座標からボールを落下させる処理です。
 * ユーザーのタップ操作などによりトリガーされます。
 *
 * @param {number} x - 落とすボールのx座標（ピクセル）
 */
function dropBall(x) {
    if (Game.isGameOver || !Game.nextBallType) return;
    console.log(`ボール落下処理: x座標 = ${x}`);

    const ballType = Game.nextBallType;
    const y = 50; // ボールの出現位置 (固定Y座標)

    // 新しいボールのボディを作成
    const newBall = Bodies.circle(x, y, ballType.radius, {
        restitution: 0.5, // 反発係数
        render: { fillStyle: ballType.color },
        label: `ball_${ballType.level}` // 後で衝突判定に使用
    });

    // ボールをMatter.jsの世界に追加
    Composite.add(Game.engine.world, newBall);

    // 次のボールを再設定
    setNextBallType();
}

/**
 * スコアを更新し、UIに反映させます。
 *
 * @param {number} points - 加算するスコア
 */
function updateScore(points) {
    Game.score += points;
    console.log(`スコア更新: 現在のスコア = ${Game.score}`);
    // TODO: HTMLのスコア要素を更新する処理
}

// ページの読み込みが完了したら初期化関数を呼び出す
window.addEventListener('load', init);

// 画面タップ・クリックイベント（ゲームコンテナに対する操作）
// スマホのタップにも対応するため pointerdown イベントを利用する
const gameContainer = document.getElementById('game-container');
gameContainer.addEventListener('pointerdown', (e) => {
    // コンテナ内のクリックされたx座標を取得
    const rect = gameContainer.getBoundingClientRect();
    let x = e.clientX - rect.left;

    // クリック位置が壁にめり込まないように補正
    const currentBallType = Game.nextBallType;
    if (currentBallType) {
        const radius = currentBallType.radius;
        const minX = radius;
        const maxX = rect.width - radius;

        if (x < minX) x = minX;
        if (x > maxX) x = maxX;
    }

    dropBall(x);
});