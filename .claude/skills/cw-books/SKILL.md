---
name: cw-books
description: "クラウドワークス副業の経理・事務。報酬・システム利用料・振込予定額の自動計算と売上台帳への記録、月次の稼働時間・時給換算レポート、確定申告用の収支集計（副業所得）、請求・支払い状況の未処理チェックを行う。"
---

# 経理・事務（cw-books）

| やること | コマンド |
| --- | --- |
| 手数料の試算 | `bun run cw books fee 30000` |
| 契約を台帳に登録 | `bun run cw books add <ID> --amount 20000 [--due 2026-10-20]` |
| 状態を進める | `bun run cw books status <ID> delivered\|accepted\|paid [--date YYYY-MM-DD] [--pay-date 支払予定日]` |
| 稼働記録 | `bun run cw books log <ID> 2.5 --task 取材` |
| 経費 | `bun run cw books expense 1650 --category 通信費 --memo "Zoom"` |
| 出金（振込手数料） | `bun run cw books payout 50000` |
| 月次レポート | `bun run cw books month 2026-09` |
| 確定申告集計 | `bun run cw books tax 2026` |
| 未処理チェック | `bun run cw books pending` |
| 台帳一覧 | `bun run cw books list` |

## 手順・注意

- 手数料率・振込手数料は `profile.json` の `fees`（既定: 10万円以下の部分20%／10万超〜20万以下10%／20万超5%、振込500円）。**クラウドワークスの最新の料金表と、自分の出金口座の手数料をユーザーに確認してから**使う。
- 定期実行: 「毎週月曜に未処理チェック」のような依頼があれば `/loop` やスケジュール機能で `bun run cw books pending` を回す。
- 月次レポートでは時給換算が `profile.minHourlyRate` を下回る案件を指摘し、次回の提示額・案件選定へのフィードバックとしてまとめる。
- 確定申告集計は参考値。所得区分（雑所得／事業所得）、源泉徴収、家事按分などの最終判断は税務署・税理士に確認するよう必ず添える。
