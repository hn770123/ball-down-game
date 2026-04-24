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
    dropInterval: 3000, // 初期落下間隔（ミリ秒）
    lastDropTime: 0,
    nextDropScoreThreshold: 1000, // 次の間隔短縮スコア閾値
    mouseConstraint: null,
    draggedBody: null
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
 * レベル1（最小）からレベル8（最大）までのサイズと色を設定します。
 */
const BALL_TYPES = [
    { level: 1, radius: 15, color: '#ff6b81', name: 'Pink', emoji: '😀' },   // 1. ピンク
    { level: 2, radius: 25, color: '#ff4757', name: 'Red', emoji: '😃' },    // 2. 赤
    { level: 3, radius: 35, color: '#1e90ff', name: 'Blue', emoji: '😄' },   // 3. 青
    { level: 4, radius: 45, color: '#9c88ff', name: 'Purple', emoji: '😁' }, // 4. 紫
    { level: 5, radius: 55, color: '#eccc68', name: 'Yellow', emoji: '😆' }, // 5. 黄色
    { level: 6, radius: 65, color: '#2ed573', name: 'Green', emoji: '🥹' },  // 6. 緑
    { level: 7, radius: 80, color: '#d2b48c', name: 'Brown', emoji: '☺️' },  // 7. 茶色（※色は適宜パステル調に調整）
    { level: 8, radius: 100, color: '#2f3542', name: 'Black', emoji: '😊' }  // 8. 黒
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
            background: 'transparent' // 透明にしてCSSの背景色を活かす
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

    // ゲームオーバー判定を定期的に実行
    Game.checkGameOverInterval = setInterval(checkGameOver, 1000);

    // リスタートボタンのイベントリスナー登録
    const restartButton = document.getElementById('restart-button');
    if (restartButton) {
        restartButton.addEventListener('click', restartGame);
    }

    // スタートボタンのイベントリスナー登録（ジェスチャーでの権限リクエスト用）
    const startButton = document.getElementById('start-button');
    if (startButton) {
        startButton.addEventListener('click', startGame);
    }

    // 最初はゲーム進行を停止（スタートボタンが押されるまで）
    Game.isStarted = false;

    // 音声ファイルの事前読み込み
    loadAudioBuffer('assets/sounds/merge_high.wav').then(buffer => {
        mergeHighAudioBuffer = buffer;
        console.log("合体音（高）の読み込みが完了しました");
    });
    loadAudioBuffer('assets/sounds/merge_low.wav').then(buffer => {
        mergeLowAudioBuffer = buffer;
        console.log("合体音（低）の読み込みが完了しました");
    });
    loadAudioBuffer('assets/sounds/destroy.wav').then(buffer => {
        destroyAudioBuffer = buffer;
        console.log("消滅音の読み込みが完了しました");
    });

    // 絵文字の描画処理を追加
    Matter.Events.on(Game.render, 'afterRender', function() {
        const context = Game.render.context;
        const bodies = Composite.allBodies(Game.engine.world);

        context.textAlign = 'center';
        context.textBaseline = 'middle';

        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            if (body.label && body.label.startsWith('ball_')) {
                const levelStr = body.label.split('_')[1];
                const level = parseInt(levelStr, 10);
                const ballType = BALL_TYPES.find(b => b.level === level);

                if (ballType && ballType.emoji) {
                    const fontSize = ballType.radius * 1.2; // ボールのサイズに合わせる
                    context.font = `${fontSize}px Arial`;

                    // 回転を考慮して描画
                    context.save();
                    context.translate(body.position.x, body.position.y);
                    context.rotate(body.angle);
                    context.fillText(ballType.emoji, 0, 0);
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
    console.log("ゲームを開始します。");

    // Web Audio API の自動再生制限を解除するため、ユーザーインタラクション時にAudioContextを再開
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
            console.log("AudioContextが再開されました");
        }).catch(e => console.log("AudioContext再開エラー", e));
    }

    // スタートオーバーレイを非表示にする
    const startOverlay = document.getElementById('game-start-overlay');
    if (startOverlay) {
        startOverlay.style.display = 'none';
    }

    Game.isStarted = true;

    // 自動落下の開始
    startAutoDrop();
}

/**
 * 自動落下ループを開始します。
 */
function startAutoDrop() {
    if (Game.autoDropTimeout) {
        clearTimeout(Game.autoDropTimeout);
    }

    const drop = () => {
        if (Game.isGameOver || !Game.isStarted) return;

        const container = document.getElementById('game-container');
        const width = container.clientWidth;

        // レベル1〜3からランダムに選択
        const level = Math.floor(Math.random() * 3) + 1;
        const ballType = BALL_TYPES.find(b => b.level === level);

        // 左右の壁に当たらない範囲でランダムなX座標を決定
        const margin = ballType.radius + 10;
        const x = Math.random() * (width - margin * 2) + margin;

        dropBall(x, level);

        // 次の落下を予約
        Game.autoDropTimeout = setTimeout(drop, Game.dropInterval);
    };

    Game.autoDropTimeout = setTimeout(drop, Game.dropInterval);
}

/**
 * 定期的に実行され、ボールがデッドラインを超えて静止しているか判定します。
 */
function checkGameOver() {
    if (Game.isGameOver || !Game.isStarted) return;

    const now = Date.now();

    // シェイク後3秒間はゲームオーバー判定を行わない（改善案A）
    if (Game.lastShakeTime && (now - Game.lastShakeTime < 3000)) {
        return;
    }

    const container = document.getElementById('game-container');
    const deadlineHeight = container.clientHeight * 0.15; // top: 15% に対応

    // ワールド内の全てのボディを取得
    const bodies = Composite.allBodies(Game.engine.world);

    // ゲームオーバーとみなす条件:
    // 1. ラベルが 'ball_' で始まる
    // 2. Y座標（上端 = position.y - radius）がデッドラインより上 (つまり、y の値が deadlineHeight より小さい)
    // 3. 速度がほぼ0（静止している）
    // 4. 生成から3秒（3000ms）以上経過していること

    for (const body of bodies) {
        if (body.label && body.label.startsWith('ball_')) {
            // 生成直後のボールは判定から除外する（3秒間の猶予）
            if (body.createdAt && (now - body.createdAt < 3000)) {
                continue;
            }

            // ボディの半径を取得 (circleの場合、boundsから計算可能ですが、簡易的に生成時の半径を用います)
            // body.circleRadius は設定に依存するため、ここでは bounds でチェックします
            const topY = body.bounds.min.y;

            if (topY < deadlineHeight) {
                // 速度（velocity）をチェック
                const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
                if (speed < 0.1) {
                    console.log("ゲームオーバーを検知しました", body);
                    handleGameOver();
                    break;
                }
            }
        }
    }
}

/**
 * ゲームオーバー処理を実行します。
 */
function handleGameOver() {
    if (Game.isGameOver) return;
    Game.isGameOver = true;

    // 定期チェックを停止
    if (Game.checkGameOverInterval) {
        clearInterval(Game.checkGameOverInterval);
    }

    // オーバーレイを表示
    const overlay = document.getElementById('game-over-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
    }
}

/**
 * ゲームをリセットしてリスタートします。
 */
function restartGame() {
    console.log("ゲームをリスタートします");

    // オーバーレイを非表示
    const overlay = document.getElementById('game-over-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }

    // スコアリセット
    Game.score = 0;
    Game.dropInterval = 3000;
    Game.nextDropScoreThreshold = 1000;
    updateScore(0);

    // ワールド内のボールをすべて削除
    const bodies = Composite.allBodies(Game.engine.world);
    const ballsToRemove = bodies.filter(b => b.label && b.label.startsWith('ball_'));
    Composite.remove(Game.engine.world, ballsToRemove);

    // 状態リセット
    Game.isGameOver = false;

    // 自動落下の再開
    startAutoDrop();

    // ゲームオーバー判定を再開
    Game.checkGameOverInterval = setInterval(checkGameOver, 1000);
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

                // レベル8（黒）の場合は特大ボーナスだけ入り、新たなボールは生成されない
                if (currentLevel === 8) {
                    console.log("最大ボール（黒）同士が衝突し、消滅しました！");
                    playSound(destroyAudioBuffer);
                    // 特大ボーナス（例: 1000点）
                    scoreToAdd += 1000;
                } else if (currentLevel < 8) {
                    console.log(`レベル ${currentLevel} のボール同士が合体しました！`);

                    // レベルに応じて音を使い分ける（レベル1-4は高音、5-7は低音）
                    if (currentLevel <= 4) {
                        playSound(mergeHighAudioBuffer);
                    } else {
                        playSound(mergeLowAudioBuffer);
                    }

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
                Game.draggedBody = nextDraggedBody;
                Game.mouseConstraint.body = nextDraggedBody;
            }

            if (scoreToAdd > 0) {
                updateScore(scoreToAdd);
            }
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

    // 1000点ごとに落下間隔を短くする (最小500ms)
    while (Game.score >= Game.nextDropScoreThreshold) {
        Game.dropInterval = Math.max(500, Game.dropInterval - 200);
        Game.nextDropScoreThreshold += 1000;
        console.log(`落下間隔が短縮されました: ${Game.dropInterval}ms`);
    }

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
let mergeHighAudioBuffer = null; // 合体音（高）のデータ
let mergeLowAudioBuffer = null; // 合体音（低）のデータ
let destroyAudioBuffer = null; // 消滅音のデータ

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
