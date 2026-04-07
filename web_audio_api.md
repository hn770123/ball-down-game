# 音声処理の改善（Web Audio APIへの移行）

## 概要
ボール合体時や消滅時の効果音再生において発生していた「処理落ち」および「モーションセンサー稼働時（シェイク時）に音が鳴らない」問題を解決するため、HTML5の `<audio>` タグによる再生から、より軽量で多重再生に強い **Web Audio API** を使用する方式へ移行しました。

## 変更ファイル
- `main.js`

## 変更内容の詳細

### 1. 音声の設定と再生関数の置き換え
ファイルの末尾にある `// --- 音声ファイルの設定 ---` 以降を、Web Audio API を用いた実装に丸ごと置き換えます。`cloneNode()` によるDOM要素の複製を廃止し、メモリ消費を抑えています。

**【変更後】**
```javascript
// --- 音声ファイルの設定 (Web Audio APIを使用) ---

// ブラウザ間の互換性を考慮してAudioContextを取得
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx; // AudioContextのインスタンス
let mergeAudioBuffer = null; // 合体音のデータ
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
