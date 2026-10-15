import type { Job } from '../scout/extract.js'
import { INTERVIEW_LABEL } from '../scout/extract.js'
import { payLabel } from '../scout/jobs.js'

export interface MailVars {
  client: string
  contact: string
  myName: string
  title: string
  interviewee?: string
  dates?: string[]
  minutes?: number
  format?: string
  deadline?: string
  url?: string
  changes?: string[]
}

const sign = (v: MailVars) =>
  ['', '引き続きどうぞよろしくお願いいたします。', '', v.myName].join('\n')

/** メール・メッセージ下書きのテンプレート群（準備・納品・修正対応）。 */
export const MAIL_TEMPLATES: Record<
  string,
  { subject: (v: MailVars) => string; body: (v: MailVars) => string }
> = {
  'interview-request': {
    subject: v => `【取材のお願い】${v.title}`,
    body: v =>
      [
        `${v.client}`,
        `${v.contact} 様`,
        '',
        `このたび「${v.title}」の記事制作を担当いたします、ライターの${v.myName}です。`,
        `${v.interviewee ?? 'ご担当者様'}への取材についてご相談させてください。`,
        '',
        '■ 取材概要',
        `・形式：${v.format ?? 'オンライン（Zoom / Google Meet）'}`,
        `・所要時間：${v.minutes ?? 60}分程度`,
        '・内容：これまでのご経歴、現在のお仕事、入社理由、今後の展望など',
        '・事前に質問リストをお送りします（ご準備は不要です）',
        '',
        '■ ご候補日時',
        ...(v.dates?.length
          ? v.dates.map(d => `・${d}`)
          : ['・（候補日時を記入）']),
        '',
        '上記でご都合が合わない場合は、ご都合のよい日時をお知らせください。',
        sign(v),
      ].join('\n'),
  },
  schedule: {
    subject: v => `【日程調整】${v.title} 取材日程のご相談`,
    body: v =>
      [
        `${v.contact} 様`,
        '',
        'お世話になっております。' + v.myName + 'です。',
        '取材日程について、下記の候補からご都合のよい日時をお選びいただけますでしょうか。',
        '',
        ...(v.dates?.length
          ? v.dates.map((d, i) => `${i + 1}. ${d}`)
          : ['1. （候補日時）']),
        '',
        `所要時間は${v.minutes ?? 60}分程度を想定しております。`,
        '確定しましたら、会議URLと質問リストをお送りいたします。',
        sign(v),
      ].join('\n'),
  },
  'interview-confirm': {
    subject: v => `【取材日程確定・質問リスト送付】${v.title}`,
    body: v =>
      [
        `${v.contact} 様`,
        '',
        'お世話になっております。' + v.myName + 'です。',
        '取材日程のご調整、ありがとうございました。下記の通り確定いたしました。',
        '',
        `・日時：${v.dates?.[0] ?? '（確定日時）'}`,
        `・形式：${v.format ?? 'オンライン'}`,
        `・URL：${v.url ?? '（会議URL）'}`,
        '',
        '質問リストを添付いたします。当日は流れに沿って自由にお話しいただければ大丈夫です。',
        sign(v),
      ].join('\n'),
  },
  delivery: {
    subject: v => `【納品】${v.title}`,
    body: v =>
      [
        `${v.contact} 様`,
        '',
        'お世話になっております。' + v.myName + 'です。',
        `「${v.title}」の原稿が完成しましたので、納品いたします。`,
        '',
        `・納品物：${v.url ?? '原稿ファイル（添付）'}`,
        '・文字数：（文字数）',
        '',
        'ご確認いただき、修正点などございましたらお気軽にお申し付けください。',
        '取材対象者様の原稿確認が必要な場合は、その旨もお知らせいただけますと幸いです。',
        sign(v),
      ].join('\n'),
  },
  'revision-ack': {
    subject: v => `Re: ${v.title} 修正のご依頼について`,
    body: v =>
      [
        `${v.contact} 様`,
        '',
        'お世話になっております。' + v.myName + 'です。',
        '修正のご依頼、承知いたしました。ご確認いただきありがとうございます。',
        `${v.deadline ?? '（修正版の提出日）'}までに修正版をお送りいたします。`,
        '',
        '念のため、修正内容を下記の通り理解しております。認識違いがあればご指摘ください。',
        ...(v.changes?.length
          ? v.changes.map(c => `・${c}`)
          : ['・（修正依頼の要点）']),
        sign(v),
      ].join('\n'),
  },
  'revision-done': {
    subject: v => `【修正版送付】${v.title}`,
    body: v =>
      [
        `${v.contact} 様`,
        '',
        'お世話になっております。' + v.myName + 'です。',
        'ご依頼いただいた修正を反映いたしましたので、修正版をお送りします。',
        '',
        '■ 主な変更点',
        ...(v.changes?.length
          ? v.changes.map(c => `・${c}`)
          : ['・（変更点）']),
        '',
        '変更箇所がわかるよう、変更点一覧も添付しております。',
        '引き続き、お気づきの点がございましたらお知らせください。',
        sign(v),
      ].join('\n'),
  },
}

export function renderMail(kind: string, v: MailVars): string {
  const t = MAIL_TEMPLATES[kind]
  if (!t)
    throw new Error(
      `未知のメール種別: ${kind}（${Object.keys(MAIL_TEMPLATES).join(' / ')}）`,
    )
  return `件名：${t.subject(v)}\n\n${t.body(v)}\n`
}

/** 受注後のヒアリングシート（クライアントへ確認する項目）。 */
export function hearingSheet(job: Job): string {
  const row = (q: string, hint = '') => `| ${q} | ${hint} | |`
  return [
    `# ヒアリングシート: ${job.title}`,
    '',
    `案件ID: ${job.id} ／ クライアント: ${job.client ?? '-'} ／ 報酬: ${payLabel(job)}`,
    '',
    '| 確認項目 | 補足 | 回答 |',
    '| --- | --- | --- |',
    row('記事の目的・ゴール', '母集団形成／ミスマッチ防止／ブランディング'),
    row('想定読者（ターゲット求職者）', '新卒／中途、職種、経験年数'),
    row('掲載媒体', '採用サイト／Wantedly／note／オウンドメディア'),
    row('取材対象者（氏名・部署・役職・入社年）', '表記を正式名称で'),
    row('取材形式・日程・所要時間', INTERVIEW_LABEL[job.interview]),
    row('取材の同席者', '広報・人事の同席有無'),
    row('文字数・見出し数', job.charCount ? `${job.charCount}字想定` : ''),
    row('トーン＆マナー・参考記事', '既存記事URL'),
    row('表記ルール（社名・NGワード・用字用語）', 'cw rules で登録'),
    row('写真の有無・撮影担当', ''),
    row('原稿確認フロー', '取材対象者チェックの有無、回数'),
    row('修正回数の上限', ''),
    row('納品形式', 'Word／Googleドキュメント／テキスト／WordPress入稿'),
    row('納期（初稿・最終稿）', job.deadline ?? ''),
    row('SEOキーワード', ''),
    '',
  ].join('\n')
}

/** 案件ごとの進行チェックリスト。 */
export function progressChecklist(job: Job): string {
  const hasInterview = !['none', 'unknown'].includes(job.interview)
  const steps: [string, string[]][] = [
    [
      '受注直後',
      [
        '契約内容・金額・納期を確認',
        'ヒアリングシート送付・回収',
        'クライアント公開情報の調査メモ作成',
        '既存記事のトーン分析',
        '表記ルールを登録（cw rules）',
      ],
    ],
    ...(hasInterview
      ? ([
          [
            '取材準備',
            [
              '取材依頼・日程調整メール送付',
              '質問リスト作成・事前送付',
              '録音の許可確認',
              '会議URL・録音ツールの動作確認',
            ],
          ],
          [
            '取材当日〜直後',
            [
              '取材実施・録音',
              '取材メモ（数字・固有名詞）を保存',
              '文字起こし→整形（cw transcript）',
              'お礼の連絡',
            ],
          ],
        ] as [string, string[]][])
      : []),
    [
      '原稿制作',
      [
        '要点抽出・エピソード選定',
        '構成案作成（必要ならクライアント確認）',
        '初稿執筆',
        'タイトル・見出し案の検討',
      ],
    ],
    [
      '校正',
      [
        'cw proof で表記・誤字・NG表現チェック',
        '文字数・見出し配分チェック',
        '取材メモとの事実照合',
        '声に出して通読',
      ],
    ],
    [
      '納品・修正',
      [
        '納品形式に変換（cw export）',
        '初稿を版保存（cw version save）',
        '納品メール送付',
        '修正対応→差分一覧を添付',
        '検収確認',
      ],
    ],
    [
      '事務',
      [
        '売上台帳に記録（cw books add）',
        '稼働時間を記録（cw books log）',
        '入金確認',
        'ポートフォリオ登録・クライアントメモ更新',
      ],
    ],
  ]
  return [
    `# 進行チェックリスト: ${job.title}`,
    '',
    `案件ID: ${job.id} ／ 納期: ${job.deadline ?? '未確認'}`,
    '',
    ...steps.flatMap(([h, items]) => [
      `## ${h}`,
      '',
      ...items.map(i => `- [ ] ${i}`),
      '',
    ]),
  ].join('\n')
}

/** 企業調査メモの雛形（WebSearch/WebFetch の結果を Claude が埋める）。 */
export function researchTemplate(job: Job): string {
  return [
    `# 企業調査メモ: ${job.client ?? job.title}`,
    '',
    '> 出典URLを必ず併記すること。推測は「（推測）」と明記。',
    '',
    '## 基本情報',
    '',
    '- 正式社名（表記）:',
    '- 設立 / 従業員数 / 所在地:',
    '- 事業内容（一文で）:',
    '',
    '## 企業理念・ミッション・バリュー',
    '',
    '- ',
    '',
    '## 採用サイトの訴求ポイント',
    '',
    '- 求める人物像:',
    '- 打ち出している制度・カルチャー:',
    '',
    '## 既存インタビュー記事',
    '',
    '| タイトル | URL | 登場人物 | 切り口 |',
    '| --- | --- | --- | --- |',
    '',
    '## 取材で深掘りしたい論点',
    '',
    '- ',
    '',
  ].join('\n')
}
