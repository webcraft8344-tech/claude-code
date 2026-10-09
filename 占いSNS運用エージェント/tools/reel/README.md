# リール動画の自動生成

文字が順に現れる縦長（1080×1920・30fps・H.264）のリール動画を作るスクリプト。

## 使い方
```bash
cd tools/reel
npm install playwright-core@1.56 ffmpeg-static @fontsource/noto-serif-jp
node render.js r1.json out.mp4
```
- `rN.json`：場面（開始秒 `a`・終了秒 `b`・文字 `html`・演出 `fx`）と長さ `duration`
- 演出 `fx`：`symbols`（月・羅針盤・地図）／`circles`（三つの円）／`moonfull`・`moonwane`・`moonwax`（月の満ち欠け）
- `emblemPath` はエンブレムの SVG（`assets/emblem.svg`）
- Chromium は `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` を使う（環境に合わせて `render.js` を変更）
- `audio` を指定するとその音声を付ける（ナレーション）。指定しないと無音。曲は Instagram アプリ側で付ける

## 背景（2026-10-04 更新）
- 星雲（紫・青緑・金・紅）がゆっくり流れる／星のまたたき／立ちのぼる光の粒子／ときどき流れ星
- 回転する星図盤（エンブレム）
- 画面下に、顔を見せないフードの占い師が光る玉を抱くシルエット
- 署名は入れない

## ナレーション付き（2026-10-04 追加）
シーンに `say`（読み上げる文）を書いた設定（例：`r0v.json`）から、音声と尺を合わせた設定を作って書き出す。
```bash
python3 ../tts/narrate.py r0v.json r0n.json narr0.wav jf_alpha 0.9
node render.js r0n.json reel0-intro-voice.mp4
```
- 各シーンは、読み上げが収まるように自動で長くなる（話し始め 0.35秒・話し終わりの間 0.9秒）
- 音声の作り方は `tools/tts/README.md`
