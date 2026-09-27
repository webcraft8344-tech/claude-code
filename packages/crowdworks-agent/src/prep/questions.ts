/**
 * 取材対象者の職種・役割に応じた質問リストのテンプレート。
 * `templates/questions.md` に追記した質問も cw prep で読み込まれる。
 */

export interface QuestionSet {
  role: string
  match: RegExp
  questions: string[]
}

export const COMMON_QUESTIONS = {
  opening: [
    '簡単に自己紹介と、現在のお仕事内容を教えてください',
    '入社（就任）されて何年目になりますか？その前はどのようなお仕事をされていましたか？',
  ],
  motivation: [
    '数ある企業の中で、この会社を選んだ決め手は何でしたか？',
    '入社前と入社後で、イメージとのギャップはありましたか？',
  ],
  closing: [
    '今後挑戦したいこと、目指している姿を教えてください',
    'この記事を読んでいる求職者の方へメッセージをお願いします',
    '最後に、言い残したことや特に伝えたいことはありますか？',
  ],
}

export const ROLE_QUESTIONS: QuestionSet[] = [
  {
    role: 'エンジニア',
    match: /エンジニア|開発|プログラマ|SE|技術|CTO/,
    questions: [
      '担当しているプロダクト・技術スタックと、チーム体制を教えてください',
      '開発で大切にしている価値観や、技術選定の進め方は？',
      'これまでで一番苦労した技術的課題と、どう乗り越えたかを教えてください',
      'エンジニアの成長を支える制度（勉強会、書籍購入など）はありますか？',
      'リモートワークやフレックスなど、働き方の実態は？',
    ],
  },
  {
    role: '営業',
    match: /営業|セールス|アカウント|カスタマーサクセス|CS/,
    questions: [
      '担当している顧客・商材と、1日の流れを教えてください',
      '受注が決まったときや、お客様から感謝された印象的なエピソードは？',
      '目標（数字）との向き合い方、チームでの支え合いはどうしていますか？',
      '成果を出すために工夫していることは？',
    ],
  },
  {
    role: '人事・採用担当',
    match: /人事|採用|HR|労務/,
    questions: [
      'どんな方と一緒に働きたいですか？求める人物像を教えてください',
      '選考で重視しているポイントは？',
      '入社後のオンボーディングや研修制度について教えてください',
      '社員の定着・活躍のために取り組んでいることは？',
    ],
  },
  {
    role: '経営者・役員',
    match: /社長|代表|CEO|役員|取締役|創業/,
    questions: [
      '創業（就任）の経緯と、事業に込めた想いを教えてください',
      '会社として大切にしている理念・価値観は、日々どう実践されていますか？',
      '今後の事業の展望と、そのために必要な人材は？',
      '社員に期待していること、一緒に働く仲間へのメッセージをお願いします',
    ],
  },
  {
    role: '管理職・マネージャー',
    match: /マネージャー|管理職|課長|部長|リーダー|マネジャー/,
    questions: [
      'チームの規模・役割と、マネジメントで意識していることは？',
      'メンバーの成長を感じた印象的なエピソードは？',
      'プレイヤーからマネージャーになって変わったことは？',
      '評価やフィードバックはどのように行っていますか？',
    ],
  },
  {
    role: '若手・新卒',
    match: /新卒|若手|1年目|2年目|内定|第二新卒/,
    questions: [
      '就職活動の軸と、入社を決めた理由を教えてください',
      '入社1年目で任された仕事と、そのとき感じたことは？',
      '先輩や上司のサポートで助けられたエピソードはありますか？',
      '学生時代の経験で、今の仕事に活きていることは？',
    ],
  },
  {
    role: '医療・介護職',
    match: /看護|介護|医師|薬剤|保育|ケア/,
    questions: [
      '現在の担当業務と、1日の流れを教えてください',
      '利用者さん・患者さんとの関わりで印象に残っている出来事は？',
      '夜勤やシフトなど、働き方と職場のサポート体制は？',
      '資格取得やキャリアアップの支援制度はありますか？',
    ],
  },
  {
    role: '販売・接客',
    match: /販売|接客|店長|ストア|店舗/,
    questions: [
      '店舗での役割と、1日の流れを教えてください',
      'お客様とのやりとりで嬉しかったエピソードは？',
      '店舗運営・売上づくりで工夫していることは？',
      'キャリアパス（店長・本部など）の実例を教えてください',
    ],
  },
  {
    role: '事務・バックオフィス',
    match: /事務|経理|総務|アシスタント|バックオフィス/,
    questions: [
      '担当業務と、関わる部署・人を教えてください',
      '業務改善や効率化で取り組んだことは？',
      '「縁の下の力持ち」としてやりがいを感じる瞬間は？',
      '働きやすさ（休暇、残業、在宅など）の実態は？',
    ],
  },
]

export interface QuestionList {
  roles: string[]
  sections: { heading: string; questions: string[] }[]
}

/** 職種・役割の文字列（例: "入社3年目のエンジニア"）から質問リストを組み立てる。 */
export function buildQuestions(
  roleText: string,
  extra: string[] = [],
): QuestionList {
  const sets = ROLE_QUESTIONS.filter(s => s.match.test(roleText))
  const sections = [
    { heading: 'アイスブレイク・経歴', questions: COMMON_QUESTIONS.opening },
    { heading: '入社理由・きっかけ', questions: COMMON_QUESTIONS.motivation },
    ...sets.map(s => ({
      heading: `${s.role}としての仕事`,
      questions: s.questions,
    })),
    ...(extra.length
      ? [{ heading: 'テンプレ集からの追加質問', questions: extra }]
      : []),
    { heading: '今後・メッセージ', questions: COMMON_QUESTIONS.closing },
  ]
  return { roles: sets.map(s => s.role), sections }
}

export function questionsMarkdown(
  roleText: string,
  list: QuestionList,
  minutes = 60,
): string {
  const total = list.sections.reduce((n, s) => n + s.questions.length, 0)
  const per = Math.max(2, Math.floor((minutes - 5) / total))
  let n = 0
  return [
    `# 質問リスト（${roleText}）`,
    '',
    `- 想定職種: ${list.roles.join('、') || '汎用'}`,
    `- 取材時間 ${minutes}分 / 質問 ${total}問（1問あたり目安 ${per}分）`,
    '- ★ = 必ず聞く質問。時間が押したら ★ 以外を省略',
    '',
    ...list.sections.flatMap(s => [
      `## ${s.heading}`,
      '',
      ...s.questions.map((q, i) => `${++n}. ${i === 0 ? '★ ' : ''}${q}`),
      '',
    ]),
    '## 深掘りの型',
    '',
    '- 「具体的には？」「たとえばどんな場面で？」→ エピソードを引き出す',
    '- 「そのとき、どう感じましたか？」→ 感情・価値観を引き出す',
    '- 「数字で言うと？」「何年／何人くらい？」→ 事実確認（原稿の事実照合用にメモ）',
    '',
  ].join('\n')
}
