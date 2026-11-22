# テキスト読み上げ（女性の声・日本語）

リールのナレーション用。2つのエンジンを使える。
- **VOICEVOX（標準・2026-10-14〜）**：抑揚と読み方が自然。声は **冥鳴ひまり（`vv:14`）**。**投稿に「VOICEVOX:冥鳴ひまり」のクレジット表記が必須**
- Kokoro-82M：予備。抑揚が平坦で機械的に聞こえるため、標準から外した

## VOICEVOX の準備
```bash
pip install https://github.com/VOICEVOX/voicevox_core/releases/download/0.16.4/voicevox_core-0.16.4-cp310-abi3-manylinux_2_34_x86_64.whl
mkdir -p tools/tts/voicevox/vvms && cd tools/tts/voicevox
curl -LO https://github.com/VOICEVOX/onnxruntime-builder/releases/download/voicevox_onnxruntime-1.17.3/voicevox_onnxruntime-linux-x64-1.17.3.tgz
tar xzf voicevox_onnxruntime-linux-x64-1.17.3.tgz && ln -s voicevox_onnxruntime-linux-x64-1.17.3/lib onnxruntime
curl -LO https://github.com/r9y9/open_jtalk/releases/download/v1.11.1/open_jtalk_dic_utf_8-1.11.tar.gz && tar xzf open_jtalk_dic_utf_8-1.11.tar.gz
curl -L -o vvms/1.vvm https://github.com/VOICEVOX/voicevox_vvm/releases/download/0.16.4/1.vvm   # 冥鳴ひまり
```
- 使う声：冥鳴ひまり（1.vvm・スタイルID 14）。ほかの候補：九州そら（2.vvm・16）、四国めたん（0.vvm・2）、春日部つむぎ（0.vvm・8）。どれも「VOICEVOX:名前」のクレジットで商用可（各キャラクターの規約を確認）
- 実行：`python3 narrate.py 入力.json 出力.json 音声.wav vv:14 1.0`
- 冥鳴ひまりは標準の速さだとゆっくりなので、シーンごとの `speed` を 1.15〜1.35 にする
- 抑揚は `narrate.py` で少し強め（intonation 1.15）、声の高さを少し低め（pitch -0.02）に設定済み

## Kokoro（予備）

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
