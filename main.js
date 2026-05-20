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
    stage: 1,
    timeLeft: 60,
    isStarted: false,
    isGameOver: false,
    isClearing: false, // ステージクリア演出中かどうか
    engine: null,
    render: null,
    runner: null,
    dropQueue: [], // 落下待ちのボールリスト
    dropTimer: null,
    gameTimer: null,
    goTimer: null,
    mouseConstraint: null,
    draggedBody: null,
    lastShakeTime: 0,
    background: {
        particles: [],
        polygons: []
    },
    effects: [] // 火花パーティクルなどのエフェクト
};

// Matter.js のモジュールエイリアス
const Engine = Matter.Engine,
      Render = Matter.Render,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Composite = Matter.Composite,
      Mouse = Matter.Mouse,
      MouseConstraint = Matter.MouseConstraint;

/**
 * 8種類のボールの定義
 * レベル1（最小）からレベル8（最大）までのサイズと配色を設定します。
 * 配色は design_improvement_plan.md に基づいています。
 */
const BALL_TYPES = [
    { level: 1, radius: 15, color: '#A020F0', highlight: '#E0B0FF', shadow: '#6000A0', name: 'Amethyst' },
    { level: 2, radius: 25, color: '#FF69B4', highlight: '#FFB6C1', shadow: '#C71585', name: 'Rose Quartz' },
    { level: 3, radius: 35, color: '#00CED1', highlight: '#AFEEEE', shadow: '#008B8B', name: 'Aquamarine' },
    { level: 4, radius: 45, color: '#32CD32', highlight: '#98FB98', shadow: '#006400', name: 'Emerald' },
    { level: 5, radius: 55, color: '#FF8C00', highlight: '#FFD700', shadow: '#B8860B', name: 'Citrine' },
    { level: 6, radius: 65, color: '#FF4500', highlight: '#FFA07A', shadow: '#8B0000', name: 'Ruby' },
    { level: 7, radius: 80, color: '#1E90FF', highlight: '#87CEFA', shadow: '#00008B', name: 'Sapphire' },
    { level: 8, radius: 100, color: '#FFD700', highlight: '#FFFACD', shadow: '#DAA520', name: 'Gold' }
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
            background: 'transparent', // 透明にしてCSS的背景色を活かす
            clearCanvas: false // beforeRender で描画した背景を残すため
        }
    });

    Render.run(Game.render);

    // Runner の作成と実行
    Game.runner = Runner.create();
    Runner.run(Game.runner, Game.engine);

    // 壁と床の作成（非表示にしてCSSの枠を活かす）
    const wallOptions = {
        isStatic: true,
        render: { visible: false } // 見えなくする
    };
    const groundOptions = {
        isStatic: true,
        render: { fillStyle: '#dcdde1' } // 床だけ少し色をつけるか、あるいはvisible: false
    };

    const wallThickness = 60;

    const ground = Bodies.rectangle(width / 2, height + wallThickness / 2 - 10, width, wallThickness, groundOptions);
    const leftWall = Bodies.rectangle(0 - wallThickness / 2, height / 2, wallThickness, height * 2, wallOptions);
    const rightWall = Bodies.rectangle(width + wallThickness / 2, height / 2, wallThickness, height * 2, wallOptions);
    // ボールが上から飛び出さないように蓋を追加（出現位置y=50より上に設置）
    const ceiling = Bodies.rectangle(width / 2, -wallThickness / 2 - 200, width * 2, wallThickness, wallOptions);

    Composite.add(Game.engine.world, [ground, leftWall, rightWall, ceiling]);

    // マウス制約の追加（ボールを掴めるようにする）
    setupMouseConstraint(container);

    // 衝突イベントの登録
    Matter.Events.on(Game.engine, 'collisionStart', handleCollision);

    // 画面外（特に下）に落ちたボールを復帰させるための監視
    Matter.Events.on(Game.engine, 'afterUpdate', checkOutOfBounds);

    // 背景の初期化
    initBackground(width, height);

    // 背景の描画処理を追加
    Matter.Events.on(Game.render, 'beforeRender', function() {
        drawBackground(Game.render.context, width, height);
    });

    // エフェクトの描画処理を追加
    Matter.Events.on(Game.render, 'afterRender', function() {
        drawEffects(Game.render.context);
    });

    /**
     * 重複実行を防ぐためのイベントハンドララッパー
     * @param {Function} fn - 実行する関数
     */
    const handleAction = (e, fn) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
    };

    // リスタートボタンのイベントリスナー登録
    const restartButton = document.getElementById('restart-button');
    if (restartButton) {
        // pointerdown で処理を行う。重複を防ぐため click は listen しないか、preventDefault する。
        restartButton.addEventListener('pointerdown', (e) => handleAction(e, restartGame));
        restartButton.addEventListener('click', (e) => e.preventDefault());
    }

    // スタートボタンのイベントリスナー登録
    const startButton = document.getElementById('start-button');
    if (startButton) {
        startButton.addEventListener('pointerdown', (e) => handleAction(e, startGame));
        startButton.addEventListener('click', (e) => e.preventDefault());
    }

    // 音声ファイルの事前読み込み
    loadAudioBuffer('assets/sounds/merge.mp3').then(buffer => {
        mergeAudioBuffer = buffer;
        console.log("合体音の読み込みが完了しました");
    });
    loadAudioBuffer('assets/sounds/clear.mp3').then(buffer => {
        clearAudioBuffer = buffer;
        console.log("クリア音の読み込みが完了しました");
    });
    loadAudioBuffer('assets/sounds/foul.mp3').then(buffer => {
        foulAudioBuffer = buffer;
        console.log("ゲームオーバー音の読み込みが完了しました");
    });

    // ボールのリッチな3D描画処理
    Matter.Events.on(Game.render, 'afterRender', function() {
        const context = Game.render.context;
        const bodies = Composite.allBodies(Game.engine.world);

        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            if (body.label && body.label.startsWith('ball_')) {
                const levelStr = body.label.split('_')[1];
                const level = parseInt(levelStr, 10);
                const ballType = BALL_TYPES.find(b => b.level === level);

                if (ballType) {
                    const { x, y } = body.position;
                    const r = ballType.radius;

                    context.save();
                    context.translate(x, y);
                    context.rotate(body.angle);

                    // 1. 外側の淡いグロー効果
                    context.shadowBlur = 15;
                    context.shadowColor = ballType.color;

                    // 2. 本体（ベースカラー）の描画
                    context.beginPath();
                    context.arc(0, 0, r, 0, Math.PI * 2);
                    context.fillStyle = ballType.color;
                    context.fill();

                    // シャドウのリセット（これ以降の描画に影をつけない）
                    context.shadowBlur = 0;

                    // 3. 3D感を出すための放射状グラデーション
                    // 中心から少し左上にずらした位置にハイライトを配置
                    const gradient = context.createRadialGradient(
                        -r * 0.3, -r * 0.3, r * 0.1,
                        0, 0, r
                    );
                    gradient.addColorStop(0, ballType.highlight); // ハイライト
                    gradient.addColorStop(0.5, ballType.color);    // ベースカラー
                    gradient.addColorStop(1, ballType.shadow);     // シャドウ（縁）

                    context.beginPath();
                    context.arc(0, 0, r, 0, Math.PI * 2);
                    context.fillStyle = gradient;
                    context.fill();

                    // 4. 表面の光沢（Specular Highlight）
                    context.beginPath();
                    context.ellipse(-r * 0.35, -r * 0.35, r * 0.25, r * 0.15, Math.PI * 0.25, 0, Math.PI * 2);
                    context.fillStyle = 'rgba(255, 255, 255, 0.4)';
                    context.fill();

                    context.restore();
                }
            }
        }
    });

}

/**
 * ゲームを開始します。スタートボタンから呼ばれます。
 */
function startGame() {
    if (Game.isStarted) return; // 二重起動防止

    console.log("ゲームを開始します。");

    // Web Audio API の自動再生制限を解除するため、ユーザーインタラクション時にAudioContextを再開
    if (audioCtx) {
        audioCtx.resume().then(() => {
            console.log("AudioContext状態:", audioCtx.state);
        }).catch(e => console.log("AudioContext再開エラー", e));
    }

    // スタートオーバーレイを非表示にする
    const startOverlay = document.getElementById('game-start-overlay');
    if (startOverlay) {
        startOverlay.style.display = 'none';
    }

    Game.isStarted = true;
    Game.stage = 1;
    Game.score = 0;
    Game.timeLeft = 60; // 初期時間を60秒に設定
    updateScore(0);

    startStage(Game.stage);
}

/**
 * 指定したステージを開始します。
 * @param {number} stageNum - ステージ番号
 */
function startStage(stageNum) {
    console.log(`ステージ ${stageNum} 開始`);
    Game.stage = stageNum;
    Game.isClearing = false;

    // ステージUI更新
    const stageElement = document.getElementById('stage');
    if (stageElement) stageElement.textContent = Game.stage;

    // 制限時間の決定
    if (stageNum > 1) {
        // ステージが次になる時、+10秒回復する
        Game.timeLeft += 10;
    }
    updateTimerUI();

    // ボーナスステージの判定
    let minLevel = 1;
    const randBonus2 = Math.random(); // 1/7の判定
    const randBonus1 = Math.random(); // 1/5の判定

    if (randBonus2 < 1/7) {
        // ボーナスステージ2: レベル1と2が発生しない
        minLevel = 3;
        console.log("ボーナスステージ2判定（レベル1, 2なし）");
    } else if (randBonus1 < 1/5) {
        // ボーナスステージ1: レベル1が発生しない
        minLevel = 2;
        console.log("ボーナスステージ1判定（レベル1なし）");
    }

    // ボールリストの生成
    const targetValue = 256; // 合計値
    Game.dropQueue = generateBallSequence(targetValue, minLevel);
    console.log(`生成されたボール数: ${Game.dropQueue.length}, 最小レベル: ${minLevel}`);

    // タイマー開始（ここではまだ開始せず、ボールが全て出た後の go!! 表示後に開始する）
    if (Game.gameTimer) {
        clearInterval(Game.gameTimer);
        Game.gameTimer = null;
    }
    if (Game.goTimer) {
        clearTimeout(Game.goTimer);
        Game.goTimer = null;
    }

    // 落下処理開始
    processDropQueue();
}

/**
 * ゲームのカウントダウンタイマーを開始します。
 */
function startGameTimer() {
    if (Game.gameTimer) clearInterval(Game.gameTimer);
    Game.gameTimer = setInterval(() => {
        if (Game.isGameOver || Game.isClearing) {
            clearInterval(Game.gameTimer);
            Game.gameTimer = null;
            return;
        }
        Game.timeLeft--;
        updateTimerUI();
        if (Game.timeLeft <= 0) {
            handleGameOver();
        }
    }, 1000);
}

/**
 * "go!!" の文字を表示し、1秒後に消してタイマーを開始します。
 */
function showGoOverlay() {
    const goOverlay = document.getElementById('go-overlay');
    if (goOverlay) {
        goOverlay.style.display = 'flex';
    }

    Game.goTimer = setTimeout(() => {
        if (goOverlay) {
            goOverlay.style.display = 'none';
        }
        Game.goTimer = null;
        startGameTimer();
    }, 1000);
}

/**
 * 落下待ちキューを処理します。
 */
function processDropQueue() {
    if (Game.isGameOver || !Game.isStarted || Game.isClearing) return;

    if (Game.dropQueue.length === 0) {
        // 全てのボールが出現し終わったら "go!!" を表示
        showGoOverlay();
        return;
    }

    // 一度に最大5個落とす
    const batchSize = Math.min(5, Game.dropQueue.length);
    const container = document.getElementById('game-container');
    const width = container.clientWidth;

    for (let i = 0; i < batchSize; i++) {
        const level = Game.dropQueue.shift();
        const ballType = BALL_TYPES.find(b => b.level === level);

        // 重ならないようにX座標を分散させる
        // 5分割したエリアの各中央付近
        const sectionWidth = width / batchSize;
        const x = sectionWidth * i + sectionWidth / 2 + (Math.random() * 20 - 10);

        dropBall(x, level);
    }

    // 次のバッチを0.5秒後に予約
    if (Game.dropQueue.length > 0) {
        Game.dropTimer = setTimeout(processDropQueue, 500);
    } else {
        // 最後のバッチを落とした後、少し待ってから "go!!" を表示（最後のボールが画面内に入る程度の猶予）
        Game.dropTimer = setTimeout(processDropQueue, 500);
    }
}

/**
 * 合計値が targetValue になるようなボールの配列を生成します。
 * @param {number} targetValue - 目標合計値
 * @param {number} minLevel - 最小ボールレベル (1〜3)
 */
function generateBallSequence(targetValue, minLevel = 1) {
    const sequence = [];
    let currentTotal = 0;

    while (currentTotal < targetValue) {
        // 残りが必要な値より大きいレベルが出ないように制限
        const remainingValue = targetValue - currentTotal;
        const maxAvailableLevel = Math.floor(Math.log2(remainingValue)) + 1;
        const maxLevel = Math.min(3, maxAvailableLevel);

        // minLevelがmaxLevelを超えないように調整（端数調整のため）
        const effectiveMinLevel = Math.min(minLevel, maxLevel);

        // effectiveMinLevel から maxLevel の範囲でランダムに選択
        const level = Math.floor(Math.random() * (maxLevel - effectiveMinLevel + 1)) + effectiveMinLevel;

        sequence.push(level);
        currentTotal += Math.pow(2, level - 1);
    }

    // シャッフル
    for (let i = sequence.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
    }

    return sequence;
}

/**
 * タイマーUIを更新します。
 */
function updateTimerUI() {
    const timerElement = document.getElementById('timer');
    if (timerElement) {
        timerElement.textContent = Game.timeLeft;
        if (Game.timeLeft <= 10) {
            timerElement.style.color = '#ff4757'; // 残り少なくなったら赤く
        } else {
            timerElement.style.color = '#ff6b81';
        }
    }
}

/**
 * ゲームオーバー処理を実行します。
 */
function handleGameOver() {
    if (Game.isGameOver || Game.isClearing) return;
    Game.isGameOver = true;

    // ゲームオーバー音を再生
    playSound(foulAudioBuffer);

    // タイマー類を停止
    if (Game.gameTimer) {
        clearInterval(Game.gameTimer);
        Game.gameTimer = null;
    }
    if (Game.dropTimer) {
        clearTimeout(Game.dropTimer);
        Game.dropTimer = null;
    }
    if (Game.goTimer) {
        clearTimeout(Game.goTimer);
        Game.goTimer = null;
    }

    // go!! オーバーレイを隠す
    const goOverlay = document.getElementById('go-overlay');
    if (goOverlay) goOverlay.style.display = 'none';

    // オーバーレイを表示
    const overlay = document.getElementById('game-over-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
    }
}

/**
 * 画面外に出たボールをチェックし、必要であれば復帰させます。
 */
function checkOutOfBounds() {
    if (!Game.isStarted || Game.isGameOver) return;

    const bodies = Composite.allBodies(Game.engine.world);
    const container = document.getElementById('game-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    bodies.forEach(body => {
        if (body.label && body.label.startsWith('ball_')) {
            // 左右または下に大きくはみ出した場合
            if (body.position.y > height + 100 || body.position.x < -100 || body.position.x > width + 100) {
                console.log("ボールが画面外に出たため復帰させます:", body.label);

                const levelStr = body.label.split('_')[1];
                const level = parseInt(levelStr, 10);

                // 元のボールを削除
                Composite.remove(Game.engine.world, body);

                // 新しく上から落とす
                const x = Math.random() * (width - 100) + 50;
                dropBall(x, level);
            }
        }
    });
}

/**
 * ステージクリア（全消し）を判定します。
 */
function checkClear() {
    if (!Game.isStarted || Game.isGameOver || Game.isClearing) return;

    // 落下待ちのボールがなく、かつフィールド上にボールが存在しない場合
    const bodies = Composite.allBodies(Game.engine.world);
    const ballsInField = bodies.filter(b => b.label && b.label.startsWith('ball_'));

    if (Game.dropQueue.length === 0 && ballsInField.length === 0) {
        handleClear();
    }
}

/**
 * ステージクリア処理を実行します。
 */
function handleClear() {
    Game.isClearing = true;

    // クリア音を再生
    playSound(clearAudioBuffer);

    // タイマー停止
    if (Game.gameTimer) {
        clearInterval(Game.gameTimer);
        Game.gameTimer = null;
    }
    if (Game.goTimer) {
        clearTimeout(Game.goTimer);
        Game.goTimer = null;
    }

    // go!! オーバーレイを隠す
    const goOverlay = document.getElementById('go-overlay');
    if (goOverlay) goOverlay.style.display = 'none';

    // クリアオーバーレイを表示
    const clearOverlay = document.getElementById('clear-overlay');
    if (clearOverlay) {
        clearOverlay.style.display = 'flex';
    }

    console.log("ステージクリア！！");

    // 2秒後に次ステージへ
    setTimeout(() => {
        if (clearOverlay) {
            clearOverlay.style.display = 'none';
        }
        startStage(Game.stage + 1);
    }, 2000);
}

/**
 * ゲームをリセットしてリスタートします。
 */
function restartGame() {
    console.log("ゲームをリスタートします");

    // オーバーレイを非表示
    const gameOverOverlay = document.getElementById('game-over-overlay');
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';
    const clearOverlay = document.getElementById('clear-overlay');
    if (clearOverlay) clearOverlay.style.display = 'none';
    const goOverlay = document.getElementById('go-overlay');
    if (goOverlay) goOverlay.style.display = 'none';

    // タイマー類をクリア
    if (Game.gameTimer) {
        clearInterval(Game.gameTimer);
        Game.gameTimer = null;
    }
    if (Game.dropTimer) {
        clearTimeout(Game.dropTimer);
        Game.dropTimer = null;
    }
    if (Game.goTimer) {
        clearTimeout(Game.goTimer);
        Game.goTimer = null;
    }

    // スコア・ステージリセット
    Game.score = 0;
    Game.stage = 1;
    updateScore(0);

    // ワールド内のボールをすべて削除
    const bodies = Composite.allBodies(Game.engine.world);
    const ballsToRemove = bodies.filter(b => b.label && b.label.startsWith('ball_'));
    Composite.remove(Game.engine.world, ballsToRemove);

    // 状態リセット
    Game.isGameOver = false;
    Game.isStarted = false;
    Game.isClearing = false;

    // ゲーム開始処理を呼ぶ
    startGame();
}

/**
 * 指定した座標とレベルからボールを落下させる処理です。
 *
 * @param {number} x - 落とすボールのx座標（ピクセル）
 * @param {number} level - 落とすボールのレベル（1〜3）
 */
function dropBall(x, level) {
    if (Game.isGameOver || !Game.isStarted) return;

    const ballType = BALL_TYPES.find(b => b.level === level);
    if (!ballType) return;

    const y = -50; // 画面外上部から落下させる

    // 新しいボールのボディを作成
    const newBall = Bodies.circle(x, y, ballType.radius, {
        restitution: 0.3,
        friction: 0.5,
        density: 0.005,
        render: { fillStyle: ballType.color },
        label: `ball_${ballType.level}`
    });

    newBall.createdAt = Date.now();
    Composite.add(Game.engine.world, newBall);
}

/**
 * マウス制約（ドラッグ操作）のセットアップ
 */
function setupMouseConstraint(container) {
    const mouse = Mouse.create(container);

    // スクロールを妨げないように、マウスイベントのデフォルト動作を維持する場合の設定
    // ただしゲーム画面内ではドラッグしたいので、適切に調整
    mouse.element.removeEventListener("mousewheel", mouse.mousewheel);
    mouse.element.removeEventListener("DOMMouseScroll", mouse.mousewheel);

    Game.mouseConstraint = MouseConstraint.create(Game.engine, {
        mouse: mouse,
        constraint: {
            stiffness: 0.2,
            render: {
                visible: false
            }
        }
    });

    Composite.add(Game.engine.world, Game.mouseConstraint);

    // ドラッグ開始時のイベント
    Matter.Events.on(Game.mouseConstraint, 'startdrag', (event) => {
        const body = event.body;
        if (body.label && body.label.startsWith('ball_')) {
            Game.draggedBody = body;
            console.log("ボールを掴みました:", body.label);
        } else {
            // ボール以外（壁など）は掴めないようにする
            Game.mouseConstraint.body = null;
            Game.draggedBody = null;
        }
    });

    // ドラッグ終了時のイベント
    Matter.Events.on(Game.mouseConstraint, 'enddrag', (event) => {
        Game.draggedBody = null;
        console.log("ボールを離しました");
    });

    // レンダラーにマウスを同期させる
    Game.render.mouse = mouse;
}

/**
 * 衝突イベントのハンドラー。
 * 同じレベルのボール同士が衝突した際、合体処理を行います。
 * 物理エンジンの計算中のため、ボディの追加削除は `Matter.Events.on(engine, 'afterUpdate', ...)`
 * などのタイミングで行うのが理想的ですが、簡易的な実装として `setTimeout` を使用して
 * 現在の物理ステップの直後に処理を遅延させます。
 *
 * @param {object} event - Matter.js のイベントオブジェクト
 */
function handleCollision(event) {
    const pairs = event.pairs;

    // 今回のイベントで合体処理済みのボディIDを記録（多重合体を防ぐ）
    const mergedBodyIds = new Set();

    // イベントループ後に削除・追加するボディのリスト
    const bodiesToRemove = [];
    const bodiesToAdd = [];
    let scoreToAdd = 0;
    let nextDraggedBody = null;

    for (let i = 0; i < pairs.length; i++) {
        const bodyA = pairs[i].bodyA;
        const bodyB = pairs[i].bodyB;

        // すでに合体処理としてマークされたボディならスキップ
        if (mergedBodyIds.has(bodyA.id) || mergedBodyIds.has(bodyB.id)) {
            continue;
        }

        // 両方ともボールか（labelが 'ball_' で始まるか）確認
        if (bodyA.label.startsWith('ball_') && bodyB.label.startsWith('ball_')) {
            // 同じレベルのボールか判定
            if (bodyA.label === bodyB.label) {
                const currentLevelStr = bodyA.label.split('_')[1];
                const currentLevel = parseInt(currentLevelStr, 10);

                // 削除処理の記録
                mergedBodyIds.add(bodyA.id);
                mergedBodyIds.add(bodyB.id);
                bodiesToRemove.push(bodyA, bodyB);

                // 現在掴んでいるボールが合体対象かチェック
                const isDraggingA = (Game.draggedBody && Game.draggedBody.id === bodyA.id);
                const isDraggingB = (Game.draggedBody && Game.draggedBody.id === bodyB.id);

                // レベル8（金）の場合は特大ボーナスだけ入り、新たなボールは生成されない
                if (currentLevel === 8) {
                    console.log("最大ボール（金）同士が衝突し、消滅しました！");
                    // 火花エフェクトの生成
                    createSparkParticles((bodyA.position.x + bodyB.position.x) / 2, (bodyA.position.y + bodyB.position.y) / 2, '#FFD700');

                    // 消滅音は鳴らさない
                    // 特大ボーナス（例: 1000点）
                    scoreToAdd += 1000;
                } else if (currentLevel < 8) {
                    console.log(`レベル ${currentLevel} のボール同士が合体しました！`);

                    // 合体音を再生
                    playSound(mergeAudioBuffer);

                    // 新しいボール（レベル+1）の生成
                    const nextLevel = currentLevel + 1;
                    const nextBallType = BALL_TYPES.find(b => b.level === nextLevel);

                    if (nextBallType) {
                        // 中間点を計算
                        const newX = (bodyA.position.x + bodyB.position.x) / 2;
                        const newY = (bodyA.position.y + bodyB.position.y) / 2;

                        const newBall = Bodies.circle(newX, newY, nextBallType.radius, {
                            restitution: 0.3,
                            friction: 0.5,
                            density: 0.005,
                            render: { fillStyle: nextBallType.color },
                            label: `ball_${nextBallType.level}`
                        });

                        // 生成時刻を記録（ゲームオーバー判定の猶予時間用）
                        newBall.createdAt = Date.now();

                        bodiesToAdd.push(newBall);

                        // 掴んでいたボールが合体した場合、新しいボールを掴み状態にする
                        if (isDraggingA || isDraggingB) {
                            nextDraggedBody = newBall;
                        }
                    }

                    // 合体ポイント（例: レベル * 10 点）
                    scoreToAdd += currentLevel * 10;
                }
            }
        }
    }

    // 物理エンジンのステップ更新後に安全にボディの追加・削除、スコア更新を行う
    if (bodiesToRemove.length > 0 || bodiesToAdd.length > 0 || scoreToAdd > 0) {
        setTimeout(() => {
            if (bodiesToRemove.length > 0) {
                Composite.remove(Game.engine.world, bodiesToRemove);
            }
            if (bodiesToAdd.length > 0) {
                Composite.add(Game.engine.world, bodiesToAdd);
            }

            // 合体後のボールを掴み状態に更新
            if (nextDraggedBody) {
                // 1. MouseConstraint が認識する現在のボディを更新
                Game.draggedBody = nextDraggedBody;
                Game.mouseConstraint.body = nextDraggedBody;

                // 2. 内部的な物理制約の対象 (bodyB) を新しいボディに接続
                // これにより、Matter.js内部の制約が新しいボディを引き続き保持します
                Game.mouseConstraint.constraint.bodyB = nextDraggedBody;

                // 3. 掴み位置（オフセット）をリセット
                // これにより、合体後の新しいボールの中心がマウス/指の位置に吸い付きます
                Game.mouseConstraint.constraint.pointB = { x: 0, y: 0 };
            }

            if (scoreToAdd > 0) {
                updateScore(scoreToAdd);
            }

            // 合体・消滅後にクリア判定を行う
            checkClear();
        }, 0);
    }
}

/**
 * スコアを更新し、UIに反映させます。
 *
 * @param {number} points - 加算するスコア
 */
function updateScore(points) {
    Game.score += points;
    console.log(`スコア更新: 現在のスコア = ${Game.score}`);

    // HTMLのスコア要素を更新
    const scoreElement = document.getElementById('score');
    if (scoreElement) {
        scoreElement.textContent = Game.score;

        // アニメーションの再トリガー
        scoreElement.classList.remove('score-bump');
        // リフローを強制してアニメーションをリセット
        void scoreElement.offsetWidth;
        scoreElement.classList.add('score-bump');
    }
}

// ページの読み込みが完了したら初期化関数を呼び出す
window.addEventListener('load', init);

// --- 音声ファイルの設定 (Web Audio APIを使用) ---

// ブラウザ間の互換性を考慮してAudioContextを取得
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioCtx = new AudioContextClass(); // AudioContextのインスタンス
let mergeAudioBuffer = null; // 合体音のデータ
let clearAudioBuffer = null; // クリア音のデータ
let foulAudioBuffer = null; // ゲームオーバー音のデータ

/**
 * 音声ファイルを非同期で読み込み、デコードする関数
 * @param {string} url - 音声ファイルのパス
 * @returns {Promise<AudioBuffer|null>} デコードされた音声バッファ
 */
async function loadAudioBuffer(url) {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await audioCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.error(`音声の読み込みに失敗しました: ${url}`, e);
        return null;
    }
}

/**
 * デコード済みのバッファを使用して音声を再生する関数
 * @param {AudioBuffer} buffer - 再生する音声のバッファデータ
 */
function playSound(buffer) {
    // コンテキストやバッファが存在しない場合は処理しない
    if (!audioCtx || !buffer) return;

    // iOSなどの仕様でAudioContextがサスペンド（一時停止）状態になっている場合は再開する
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    // 音声を再生するためのソースを作成
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    // 出力先（スピーカー）に接続して再生開始
    source.connect(audioCtx.destination);
    source.start(0);
}

/**
 * 背景のパーティクルとポリゴンを初期化します。
 */
function initBackground(width, height) {
    // 星屑（パーティクル）の生成
    Game.background.particles = [];
    for (let i = 0; i < 50; i++) {
        Game.background.particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            size: Math.random() * 2,
            speed: 0.1 + Math.random() * 0.3,
            opacity: 0.1 + Math.random() * 0.5
        });
    }

    // ポリゴン風の装飾（静的な三角形をいくつか配置）
    Game.background.polygons = [];
    for (let i = 0; i < 15; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const size = 100 + Math.random() * 200;
        Game.background.polygons.push({
            points: [
                { x: x + (Math.random() - 0.5) * size, y: y + (Math.random() - 0.5) * size },
                { x: x + (Math.random() - 0.5) * size, y: y + (Math.random() - 0.5) * size },
                { x: x + (Math.random() - 0.5) * size, y: y + (Math.random() - 0.5) * size }
            ],
            color: `rgba(100, 50, 150, ${0.05 + Math.random() * 0.05})` // 少し明るい紫色に
        });
    }
}

/**
 * 背景を描画します。
 */
function drawBackground(context, width, height) {
    // 背景グラデーションの描画
    const bgGradient = context.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#1A0033');
    bgGradient.addColorStop(0.5, '#0D001A');
    bgGradient.addColorStop(1, '#000000');
    context.fillStyle = bgGradient;
    context.fillRect(0, 0, width, height);

    // ポリゴンの描画
    Game.background.polygons.forEach(poly => {
        context.beginPath();
        context.moveTo(poly.points[0].x, poly.points[0].y);
        context.lineTo(poly.points[1].x, poly.points[1].y);
        context.lineTo(poly.points[2].x, poly.points[2].y);
        context.closePath();
        context.fillStyle = poly.color;
        context.fill();
    });

    // パーティクルの更新と描画
    context.fillStyle = '#FFFFFF';
    Game.background.particles.forEach(p => {
        p.y += p.speed;
        if (p.y > height) p.y = 0;

        // 明滅効果を追加
        const twinkle = 0.5 + Math.sin(Date.now() * 0.002 + p.x) * 0.5;
        context.globalAlpha = p.opacity * twinkle;

        context.beginPath();
        context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        context.fill();
    });
    context.globalAlpha = 1.0;
}

/**
 * 火花パーティクルを生成します。
 */
function createSparkParticles(x, y, color) {
    for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 5;
        Game.effects.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 2 + Math.random() * 3,
            color: color,
            life: 1.0, // 寿命 (1.0 -> 0.0)
            decay: 0.02 + Math.random() * 0.03
        });
    }
}

/**
 * エフェクトを描画・更新します。
 */
function drawEffects(context) {
    for (let i = Game.effects.length - 1; i >= 0; i--) {
        const p = Game.effects[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1; // 重力
        p.life -= p.decay;

        if (p.life <= 0) {
            Game.effects.splice(i, 1);
            continue;
        }

        context.globalAlpha = p.life;
        context.fillStyle = p.color;
        context.shadowBlur = 10;
        context.shadowColor = p.color;
        context.beginPath();
        context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
    }
    context.globalAlpha = 1.0;
}
