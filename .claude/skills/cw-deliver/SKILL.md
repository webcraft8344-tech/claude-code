---
name: cw-deliver
description: "納品・修正対応。原稿を納品用フォーマット（Word/.docx、Googleドキュメント用HTML、テキスト）へ変換、初稿・修正稿のバージョン保存と変更点一覧の自動作成、納品メール・修正対応メッセージの下書きを行う。"
---

# 納品・修正対応（cw-deliver）

## 納品

1. 納品前に `cw-proof` を通す（🔴要修正ゼロ）。
2. 版を保存: `bun run cw version save <ID> <原稿.md> --label 初稿`
3. 形式変換: `bun run cw export <原稿.md> --job <ID> --format docx|html|txt|md`
   - Word → `docx`
   - Googleドキュメント → `docx` か `html` を Drive にアップロードして「Googleドキュメントで開く」（Google Drive コネクタがあれば、ユーザー確認のうえアップロードまで代行してよい）
   - テキスト・入稿用 → `txt`（見出しは【】形式）
4. 納品メッセージ: `bun run cw mail delivery --job <ID> --contact <担当者> [--url 共有URL]` → 文字数などを埋めて提示。
5. 経理: `bun run cw books status <ID> delivered`

## 修正対応

1. 修正依頼の文面を受け取り、依頼を箇条書きに分解してユーザーに確認:
   `bun run cw mail revision-ack --job <ID> --contact <担当者> --deadline <提出日> --changes "依頼1;依頼2"`
2. 修正を反映したら版を保存: `bun run cw version save <ID> <修正稿.md> --label 修正稿1`
   → `versions/changes_v1_to_v2.md`（修正/追加/削除の一覧、見出し単位）が自動生成される
3. 変更点一覧を見て、依頼の漏れ・依頼外の変更がないか確認。
4. 修正版送付: `bun run cw mail revision-done --job <ID> --contact <担当者> --changes "変更1;変更2"`
5. 修正依頼に「今後の方針」（表記・トーンの好み）が含まれていれば記録:
   `bun run cw client hints <クライアント名> <修正依頼.txt>` と、`rules.json` への反映。

任意の2版の比較は `bun run cw version diff <ID> v1 v3`。
