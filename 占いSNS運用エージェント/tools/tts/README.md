# テキスト読み上げ（女性の声・日本語）

リールのナレーション用。無料・オフラインで動く Kokoro-82M（ONNX 版）を使う。

## 準備
```bash
pip install kokoro-onnx misaki[ja] pyopenjtalk-plus soundfile
cd tools/tts
# モデル（約330MB・リポジトリには入れない）
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

## 声の候補（日本語・女性）
| 声 | 印象 |
|----|------|
| `jf_alpha` | 落ち着いた大人の声。**標準**（紫苑の権威路線に合う） |
| `jf_gongitsune` | 語りかける、やや柔らかい声 |
| `jf_nezumi` | 明るく軽い声 |
| `jf_tebukuro` | 若く、やさしい声 |

速度は `0.9`（ゆっくりめ）が標準。

## 読みを正しくするコツ
- 読み間違えやすい名前はかなで書く（例：紫苑 →「しおん」）
- 「刻」は「とき」と読まれないので、読み上げ文では「時」と書く
- 読点（、）を多めに入れると、間ができて AI っぽさが減る

## 使い方
```bash
python3 narrate.py 入力.json 出力.json 音声.wav jf_alpha 0.9
```
入力の各シーンにある `say` を読み上げ、尺を合わせた `出力.json`（`audio` 付き）と `音声.wav` を作る。続きは `tools/reel/README.md`。
