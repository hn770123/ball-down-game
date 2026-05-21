# 物理挙動および操作性改善計画書

## 1. 目的
ボール操作時の過度な連鎖反応を抑え、プレイヤーが意図した通りにボールを配置・合体させやすくするため、物理演算の挙動を調整します。具体的には、「水中」のような抵抗感と、ボール同士の「柔らかさ（めり込み）」を導入します。

## 2. 改修方針

### 2.1. 物理プロパティの調整
Matter.js の各プロパティを以下のように調整し、「エネルギーの喪失」と「柔らかさ」を表現します。

| プロパティ | 設定値 (水中モード) | 理由 |
| :--- | :--- | :--- |
| `frictionAir` (空気抵抗) | `0.1` 〜 `0.2` | 水中での抵抗をシミュレートし、ボールがすぐに静止するようにします。 |
| `restitution` (反発係数) | `0` | 跳ね返りを無くし、衝撃を吸収するようにします。 |
| `slop` (許容めり込み量) | `0.5` 〜 `1.0` | ボール同士がわずかに重なり合うことを許容し、柔らかさを表現します。 |
| `density` (密度) | `0.01` (現在の2倍) | ボールを重くし、他のボールに当たっても簡単には弾き飛ばされないようにします。 |

### 2.2. ステートによる挙動の切り替え
ゲームの進行状況に合わせて物性を変化させ、テンポと操作性を両立させます。

1.  **ボール出現フェーズ (Normal Mode)**:
    - ステージ開始から "go!!" が消えるまで。
    - テンポを維持するため、従来の軽快な動き（低抵抗・低密度）を維持します。
2.  **プレイ中フェーズ (Water Mode)**:
    - "go!!" 消去後から。
    - すべてのボール（既存および新規生成）に「水中モード」の物性を適用します。
    - ただし、**プレイヤーがドラッグ中のボール**のみ、`frictionAir` を `0.01` 程度に下げ、操作の遅延を感じさせないようにします。

### 2.3. 視覚的なフィードバック
物理挙動の変化をユーザーに伝えるため、"go!!" のタイミングで以下の演出を追加します。
- 背景のグラデーションに青色成分（例: `#001133`）を加え、水中に潜ったような深みを出します。
- 必要に応じて、背景のパーティクル（星屑）の移動速度を下げ、ゆったりとした動きに変更します。

---

## 3. 実装詳細（AIエージェントへの指示）

### 3.1. `Game` オブジェクトへのフラグ追加
- `Game.isWaterMode`: "go!!" 表示後に `true` になるフラグ。

### 3.2. 物理プロパティの一括適用
`showGoOverlay` の完了時（`startGameTimer` 呼び出し前後）に、ワールド内の全ボディに対して以下の更新を行います。
```javascript
const bodies = Composite.allBodies(Game.engine.world);
bodies.forEach(body => {
    if (body.label && body.label.startsWith('ball_')) {
        Matter.Body.set(body, {
            frictionAir: 0.15,
            restitution: 0,
            slop: 0.8,
            density: 0.01
        });
    }
});
```

### 3.3. 操作中のボールの抵抗調整
`beforeUpdate` イベント等で、現在ドラッグされているボールの抵抗を動的に変更します。
```javascript
Matter.Events.on(Game.engine, 'beforeUpdate', () => {
    const bodies = Composite.allBodies(Game.engine.world);
    bodies.forEach(body => {
        if (body.label && body.label.startsWith('ball_') && Game.isWaterMode) {
            if (Game.draggedBody && body.id === Game.draggedBody.id) {
                body.frictionAir = 0.02; // 操作中は抵抗を減らす
            } else {
                body.frictionAir = 0.15; // それ以外は水中抵抗
            }
        }
    });
});
```

### 3.4. 新規生成ボールへの適用
`dropBall` および `handleCollision`（合体処理）内で、`Game.isWaterMode` が `true` の場合は「水中モード」のプロパティで `Bodies.circle` を作成、または `Matter.Body.set` で適用します。

### 3.5. 背景の変更
`drawBackground` 関数内で、`Game.isWaterMode` に応じてグラデーションの色指定（`bgGradient.addColorStop`）を動的に変更します。
