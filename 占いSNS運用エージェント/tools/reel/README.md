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
- 音声は無音。曲は Instagram アプリ側で付ける
