# crowdworks-agent

クラウドワークス副業（取材記事・採用記事ライティング）の業務を、案件探索から経理まで自動化するエージェント。

- **`cw` CLI**（このパッケージ）: 抽出・スコアリング・集計・校正・形式変換・記録など、毎回同じ結果になるべき処理を担当。外部依存なし。
- **Claude Code スキル**（`.claude/skills/cw-*`）と **エージェント**（`.claude/agents/crowdworks-agent.md`）: 提案文や初稿の執筆、企業調査（WebSearch/WebFetch）、定性的なチェックを担当し、CLI を呼び出して結果を保存する。

```
ユーザー ──▶ crowdworks-agent（Claude） ──▶ cw-* スキルの手順 ──▶ bun run cw ...  ──▶ $CW_HOME のファイル
                  ▲                                                                     │
                  └──────────────── 判定メモ・提案文・校正レポートなどを読む ◀────────────┘
```

## セットアップ

```bash
bun run cw init          # ~/crowdworks-agent/profile.json を作成（CW_HOME で変更可）
```

`profile.json` を自分用に編集する:

| キー | 内容 |
| --- | --- |
| `minCharRate` / `minHourlyRate` | 最低文字単価（円/字）・最低時給換算 |
| `charsPerHour` / `interviewHours` | 時給換算に使う執筆速度と取材1件の工数 |
| `interviewFormats` | 対応できる取材形式（`online` `onsite` `phone` `none`） |
| `preferredGenres` / `ngGenres` | 得意ジャンル・受けないジャンル |
| `applyThreshold` | 「応募する」と判定するスコア（0-100） |
| `strengths` | 強み（`key` は募集要項ポイントと対応: interview / structure / deadline / communication / seo / recruiting / writing / revision / continuity / wordpress / photo / transcription） |
| `selfPrTemplate` | 自己PRテンプレ（`{{client}}` `{{title}}` `{{mapping}}` `{{portfolio}}` `{{name}}` `{{bid}}` `{{deadline}}`） |
| `fees` | システム利用料の段階料率・振込手数料（最新の料金表・自分の口座に合わせる） |

## 業務と対応コマンド

| 業務 | コマンド | スキル |
| --- | --- | --- |
| 1. 案件の抽出・一覧化・スコアリング・判定・重複チェック・判定メモ保存 | `cw scout <file...>` / `cw scout list` | cw-scout |
| 2. 提案文（詳細版・短縮版）・強み対応表・ポートフォリオ選定 | `cw propose <id>` | cw-propose |
| 2. 応募履歴ログ・結果記録 | `cw apply <id>` / `cw result <id> won` / `cw apps --csv` | cw-propose |
| 3. 企業調査メモ・ヒアリングシート・進行チェックリスト・質問リスト | `cw prep <id> --role "..."` | cw-prep |
| 3. トーン＆マナー分析 | `cw tone <記事...>` | cw-prep |
| 3. 取材依頼・日程調整メール | `cw mail interview-request\|schedule\|interview-confirm` | cw-prep |
| 4. 文字起こし整形・要点抽出・構成案 | `cw transcript <file> --job <id> --map "話者1=聞き手"` | cw-manuscript |
| 4. タイトル案 | `cw titles --person --role --company --phrase` | cw-manuscript |
| 5. 表記ゆれ・誤字・送り仮名・NGワード・社名・文字数配分・事実照合・規制表現 | `cw rules <id>` / `cw proof <原稿> --job <id>` | cw-proof |
| 6. Word/Googleドキュメント(HTML)/テキスト変換 | `cw export <原稿> --format docx\|html\|txt` | cw-deliver |
| 6. 版保存・変更点一覧 | `cw version save\|list\|diff` | cw-deliver |
| 6. 納品・修正対応メッセージ | `cw mail delivery\|revision-ack\|revision-done` | cw-deliver |
| 7. 手数料・手取り計算、売上台帳、稼働、経費、出金 | `cw books fee\|add\|status\|log\|expense\|payout` | cw-books |
| 7. 月次レポート・確定申告集計・未処理チェック | `cw books month\|tax\|pending` | cw-books |
| 8. 勝ちパターン分析 | `cw wins` | cw-knowledge |
| 8. ポートフォリオ化・テンプレ集・クライアントメモ | `cw portfolio add` / `cw templates harvest` / `cw client note\|hints\|show` | cw-knowledge |

`bun run cw help` で全オプションを表示。

## データ構成（`$CW_HOME`）

```
profile.json            条件・強み・ポートフォリオ・自己PRテンプレ・手数料
portfolio.md            実績リスト
applications.jsonl      応募履歴
ledger.jsonl            売上台帳（契約→納品→検収→入金）
worklog.jsonl / expenses.jsonl / payouts.jsonl
reports/                月次レポート・確定申告集計
templates/              questions.md / headings.md / phrases.md / rules.example.json
clients/<名>.md          クライアント別メモ（<名>.rules.json で共通表記ルール）
jobs/<案件ID>/
  source.txt memo.md job.json   案件本文・判定メモ
  proposal.md proposal_final.md 提案文
  rules.json                    表記ルール
  prep/                         質問・ヒアリング・チェックリスト・調査・トーン
  mail/                         メール下書き
  manuscript/                   文字起こし整形・要点・構成案・下書き・取材メモ
  proof.md                      校正レポート
  versions/                     v1_初稿.md, v2_修正稿1.md, changes_v1_to_v2.md
  delivery/                     納品ファイル
```

## 判定・計算の仕様

- **文字単価**: 明記があればその値、なければ「1記事あたり報酬（下限）÷ 文字数」で推定（一覧では `*` 付き）。
- **スコア**: 基礎50点 ± 文字単価・想定時給（取材工数込み）・取材形式・ジャンル・継続性・納期・強みの一致・過去応募との重複。最低単価の7割未満、対応外の取材形式、NGジャンル、期限切れは足切り。
- **重複チェック**: 同一クライアント（法人格表記を除いて比較）、タイトル類似度60%以上、直近30日の同ジャンル応募。
- **システム利用料**: 契約金額（税込）に対して段階制（既定: 10万円以下の部分20%、10万超〜20万以下10%、20万超5%）。
- **売上計上日**: 検収日（なければ納品日）。確定申告集計は参考値で、最終判断は税務署・税理士に確認。
- **規制表現チェック**: 職業安定法（的確表示）、労働施策総合推進法（年齢制限）、男女雇用機会均等法（性別制限・性別を想起させる職種名）、差別表現の辞書ベースの注意喚起。法的判断ではない。

## 開発

```bash
bun test packages/crowdworks-agent
```
