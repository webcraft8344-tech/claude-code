# ランキング表リール（リスト獲得用）

参考動画の型：表を約2秒ずつ4ページ切り替える → 「長押しで止めて確認」 → 最後に「星座をコメント」で受け取り。

## 作り方
```bash
python3 rank.py                      # 相性の順位（top48.json）を作る
# page.html の NODE_MODULES / ASSETS を実際のパスに置き換える（フォント・エンブレム）
node shot.js <tools/reel のパス>      # p0〜p3（表）と p4（受け取りの案内）の画像を作る
ffmpeg -f concat -safe 0 -i list.txt -f lavfi -i anullsrc=r=44100:cl=stereo -t 11.6 \
  -c:v libx264 -pix_fmt yuv420p -r 30 -c:a aac out.mp4
```
- 順位の考え方（`rank.py`）：二つの星座の角度（180°＞0°＞120°＞90°＞150°＞60°＞30°）を土台に、不動宮（想いが続く）と水の星座（情が深い）に加点。テーマを変えるときは、ここの重みとタイトルを変える
- 音は無音。曲は Instagram アプリで付ける
