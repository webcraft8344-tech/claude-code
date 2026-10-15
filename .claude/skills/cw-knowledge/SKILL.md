---
name: cw-knowledge
description: "ナレッジ蓄積・改善。受注・不採用の結果から提案文の勝ちパターンを分析、完成記事のポートフォリオ化（要約・実績リスト更新）、よく使う質問・構成・言い回しのテンプレ集の自動更新、クライアント別の注意事項・好みの記録を行う。"
---

# ナレッジ蓄積・改善（cw-knowledge）

## 勝ちパターン分析

1. `bun run cw wins` でジャンル・提案文の長さ・提示額比・使った強み・ポートフォリオ本数ごとの受注率とリフトを確認。
2. 受注案件と不採用案件の `jobs/<ID>/proposal_final.md`（または `proposal_sent.txt`）を読み比べ、定性的な違い（冒頭の書き出し、募集文への呼応度、確認質問の有無、具体的数字の有無）を3〜5点にまとめる。
3. 改善案を `profile.json` の `selfPrTemplate`・`strengths` への具体的な修正案として提示（反映はユーザー承認後）。

## ポートフォリオ化

- 公開された記事: `bun run cw portfolio add <記事.md> --title "<タイトル>" --url <URL> --tags 取材,エンジニア`
  → `profile.json` の portfolio と `portfolio.md`（実績リスト）を更新。要約は自動生成されるので、必要なら自然な1〜2文に整える。
- 実績公開不可の案件は登録しない（契約条件を確認）。

## テンプレ集

- `bun run cw templates harvest <完成原稿...> <文字起こし...>`
  → `templates/questions.md`（質問）・`headings.md`（見出し）・`phrases.md`（繰り返し使う言い回し）に重複なく追記。
- `questions.md` の質問は次回以降 `cw prep` の質問リストに自動で加わる。定期的に読み返し、良い質問に★を付け、使わないものは削る。

## クライアント別メモ

- `bun run cw client note <クライアント名> "<内容>" --category 好み|注意|連絡`
- 修正依頼から傾向を抽出: `bun run cw client hints <クライアント名> <修正依頼.txt>`
- 次の提案・執筆の前に `bun run cw client show <クライアント名>` を必ず読む。
