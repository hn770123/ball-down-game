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

    Composite.add(Game.engine.world, [ground, leftWall, rightWall]);

    // 次のボールを決定してUIを更新
    setNextBallType();

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
}

/**
 * ゲームを開始します。スタートボタンから呼ばれます。
 */
function startGame() {
    console.log("ゲームを開始します。");

    // iOS 13+ などのために DeviceMotionEvent.requestPermission をリクエスト
    requestMotionPermission();

    // スタートオーバーレイを非表示にする
    const startOverlay = document.getElementById('game-start-overlay');
    if (startOverlay) {
        startOverlay.style.display = 'none';
    }

    Game.isStarted = true;
}

/**
 * 定期的に実行され、ボールがデッドラインを超えて静止しているか判定します。
 */
function checkGameOver() {
    if (Game.isGameOver || !Game.isStarted) return;

    const container = document.getElementById('game-container');
    const deadlineHeight = container.clientHeight * 0.15; // top: 15% に対応

    // ワールド内の全てのボディを取得
    const bodies = Composite.allBodies(Game.engine.world);

    // ゲームオーバーとみなす条件:
    // 1. ラベルが 'ball_' で始まる
    // 2. Y座標（上端 = position.y - radius）がデッドラインより上 (つまり、y の値が deadlineHeight より小さい)
    // 3. 速度がほぼ0（静止している）
    // 4. 生成から3秒（3000ms）以上経過していること

    const now = Date.now();

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
    updateScore(0);

    // ワールド内のボールをすべて削除
    const bodies = Composite.allBodies(Game.engine.world);
    const ballsToRemove = bodies.filter(b => b.label && b.label.startsWith('ball_'));
    Composite.remove(Game.engine.world, ballsToRemove);

    // 状態リセット
    Game.isGameOver = false;

    // 次のボール再設定
    setNextBallType();

    // ゲームオーバー判定を再開
    Game.checkGameOverInterval = setInterval(checkGameOver, 1000);
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
    if (Game.isGameOver || !Game.isStarted || !Game.nextBallType) return;
    console.log(`ボール落下処理: x座標 = ${x}`);

    const ballType = Game.nextBallType;
    const y = 50; // ボールの出現位置 (固定Y座標)

    // 新しいボールのボディを作成
    const newBall = Bodies.circle(x, y, ballType.radius, {
        restitution: 0.3, // 反発係数（跳ねすぎないよう少し抑える）
        friction: 0.5,    // 摩擦を増やして転がりすぎを防ぐ
        density: 0.005,   // 密度
        render: { fillStyle: ballType.color },
        label: `ball_${ballType.level}` // 後で衝突判定に使用
    });

    // 生成時刻を記録（ゲームオーバー判定の猶予時間用）
    newBall.createdAt = Date.now();

    // ボールをMatter.jsの世界に追加
    Composite.add(Game.engine.world, newBall);

    // 次のボールを再設定
    setNextBallType();
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

                // レベル8（黒）の場合は特大ボーナスだけ入り、新たなボールは生成されない
                if (currentLevel === 8) {
                    console.log("最大ボール（黒）同士が衝突し、消滅しました！");
                    // 特大ボーナス（例: 1000点）
                    scoreToAdd += 1000;
                } else if (currentLevel < 8) {
                    console.log(`レベル ${currentLevel} のボール同士が合体しました！`);

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

// --- 操作性の向上と落下位置プレビューの実装 ---
const gameContainer = document.getElementById('game-container');
let isPointerDown = false;
let pointerX = 0;

// --- シェイク検知用変数 ---
let shakePermissionGranted = false;
let lastShakeTime = 0;
const SHAKE_THRESHOLD = 15; // 激しく振ったと判定するしきい値
const SHAKE_COOLDOWN = 500; // 連続で反応しないためのクールダウン時間 (ミリ秒)
let lastAcc = { x: null, y: null, z: null };

// プレビュー用のボール表示要素（HTMLに追加して操作するため取得/作成）
let previewBallElement = document.getElementById('drop-preview-ball');
if (!previewBallElement) {
    previewBallElement = document.createElement('div');
    previewBallElement.id = 'drop-preview-ball';
    previewBallElement.style.position = 'absolute';
    previewBallElement.style.borderRadius = '50%';
    previewBallElement.style.pointerEvents = 'none'; // イベントを透過
    previewBallElement.style.opacity = '0.5';        // 半透明
    previewBallElement.style.display = 'none';
    previewBallElement.style.transform = 'translate(-50%, -50%)'; // 中央揃え
    previewBallElement.style.zIndex = '10';
    gameContainer.appendChild(previewBallElement);
}

// 落下予定位置の縦線（ガイドライン）
let guidelineElement = document.getElementById('drop-guideline');
if (!guidelineElement) {
    guidelineElement = document.createElement('div');
    guidelineElement.id = 'drop-guideline';
    guidelineElement.style.position = 'absolute';
    guidelineElement.style.width = '2px';
    guidelineElement.style.height = '100%';
    guidelineElement.style.backgroundColor = 'rgba(255, 255, 255, 0.4)'; // 半透明の白線
    guidelineElement.style.borderLeft = '2px dashed rgba(200, 200, 200, 0.6)';
    guidelineElement.style.pointerEvents = 'none';
    guidelineElement.style.display = 'none';
    guidelineElement.style.transform = 'translateX(-50%)';
    guidelineElement.style.zIndex = '9';
    gameContainer.appendChild(guidelineElement);
}

// 入力座標の取得と制限
function getConstrainedX(e) {
    const rect = gameContainer.getBoundingClientRect();
    let clientX = e.clientX;
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
    }

    let x = clientX - rect.left;
    const currentBallType = Game.nextBallType;
    if (currentBallType) {
        const radius = currentBallType.radius;
        const minX = radius;
        const maxX = rect.width - radius;
        if (x < minX) x = minX;
        if (x > maxX) x = maxX;
    }
    return x;
}

// プレビューUIの更新
function updatePreviewUI(x) {
    if (Game.isGameOver || !Game.isStarted || !Game.nextBallType) {
        previewBallElement.style.display = 'none';
        guidelineElement.style.display = 'none';
        return;
    }

    const ballType = Game.nextBallType;
    const dropY = 50; // ボールの出現Y座標

    // プレビューボールのスタイル更新
    previewBallElement.style.display = 'block';
    previewBallElement.style.width = `${ballType.radius * 2}px`;
    previewBallElement.style.height = `${ballType.radius * 2}px`;
    previewBallElement.style.backgroundColor = ballType.color;
    previewBallElement.style.left = `${x}px`;
    previewBallElement.style.top = `${dropY}px`;

    // ガイドラインのスタイル更新
    guidelineElement.style.display = 'block';
    guidelineElement.style.left = `${x}px`;
    guidelineElement.style.top = `${dropY}px`;
}

// シェイク（加速度）イベントのリスナー
function handleDeviceMotion(event) {
    if (Game.isGameOver) return;

    // 重力を含まない加速度を取得（取得できない場合は重力込みの加速度を代用）
    let acc = event.acceleration;
    if (!acc || acc.x === null) {
        acc = event.accelerationIncludingGravity;
    }

    if (!acc || acc.x === null) return;

    if (lastAcc.x !== null) {
        // 加速度の変化量を計算
        const deltaX = Math.abs(acc.x - lastAcc.x);
        const deltaY = Math.abs(acc.y - lastAcc.y);
        const deltaZ = Math.abs(acc.z - lastAcc.z);

        // 変化量の合計がしきい値を超えたら「振った」とみなす
        if (deltaX + deltaY + deltaZ > SHAKE_THRESHOLD) {
            const now = Date.now();
            // クールダウン期間を過ぎているかチェック
            if (now - lastShakeTime > SHAKE_COOLDOWN) {
                lastShakeTime = now;
                applyShakeForceToBalls();
            }
        }
    }

    // 現在の加速度を保存して次回の計算に使う
    lastAcc = { x: acc.x, y: acc.y, z: acc.z };
}

// ボールに上向きの力を加える（ポップコーンのような挙動）
function applyShakeForceToBalls() {
    console.log("スマホのシェイクを検知しました！ボールを跳ねさせます。");

    // ワールド内のすべてのボディを取得
    const bodies = Composite.allBodies(Game.engine.world);

    bodies.forEach(body => {
        // ボールであるか判定
        if (body.label && body.label.startsWith('ball_')) {
            // 現在の速度を維持しつつ、上方向（yがマイナス）への力と少しのランダムな横方向の力を加える
            const forceX = (Math.random() - 0.5) * 0.05; // 左右にわずかに散らす
            const forceY = -0.05 - (Math.random() * 0.05); // 上方向にポンと跳ねる力

            // ボディの質量（mass）に比例して力を調整すると均等に跳ねるが、
            // あえて重いボールは少しだけしか跳ねないようにする場合は固定の力を与えたりする。
            // 今回は質量に関係なくある程度跳ねるように mass を掛けた力にする
            const appliedForce = {
                x: forceX * body.mass,
                y: forceY * body.mass
            };

            // Matter.jsのapplyForceを使ってボディの中心に力を加える
            Matter.Body.applyForce(body, body.position, appliedForce);
        }
    });
}

// デバイスモーションセンサーの権限リクエスト
function requestMotionPermission() {
    if (shakePermissionGranted) return;

    // iOS 13+ で DeviceMotionEvent.requestPermission が存在する場合
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('devicemotion', handleDeviceMotion);
                    shakePermissionGranted = true;
                    console.log("モーションセンサーのアクセスが許可されました。");
                } else {
                    console.log("モーションセンサーのアクセスが拒否されました。");
                }
            })
            .catch(console.error);
    } else {
        // Androidなど許可不要な場合はそのまま登録
        window.addEventListener('devicemotion', handleDeviceMotion);
        shakePermissionGranted = true;
        console.log("モーションセンサーを利用します（許可不要）。");
    }
}

// イベントリスナーの登録
// タッチ・マウスダウン開始
gameContainer.addEventListener('pointerdown', (e) => {
    if (Game.isGameOver || !Game.isStarted || !Game.nextBallType) return;
    isPointerDown = true;
    pointerX = getConstrainedX(e);
    updatePreviewUI(pointerX);
});

// タッチ・マウス移動
gameContainer.addEventListener('pointermove', (e) => {
    if (!isPointerDown || Game.isGameOver || !Game.isStarted || !Game.nextBallType) return;
    pointerX = getConstrainedX(e);
    updatePreviewUI(pointerX);
});

// タッチ・マウス離上
gameContainer.addEventListener('pointerup', (e) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    previewBallElement.style.display = 'none';
    guidelineElement.style.display = 'none';

    // 最終位置を確定させて落下
    pointerX = getConstrainedX(e);
    dropBall(pointerX);
});

// 画面外に出た場合もリセット
gameContainer.addEventListener('pointerleave', () => {
    if (!isPointerDown) return;
    isPointerDown = false;
    previewBallElement.style.display = 'none';
    guidelineElement.style.display = 'none';
});