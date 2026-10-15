/**
 * 校正ルール辞書。クライアント指定ルールは ClientRules（JSON）で上書き・追加する。
 */

/** 表記ゆれグループ（先頭が推奨表記。ClientRules.preferred で変更可） */
export const NOTATION_GROUPS: string[][] = [
  ['ください', '下さい'],
  ['いただく', '頂く'],
  ['いただき', '頂き'],
  ['できる', '出来る'],
  ['さまざま', '様々'],
  ['すべて', '全て'],
  ['あらかじめ', '予め'],
  ['いたします', '致します'],
  ['または', '又は'],
  ['および', '及び'],
  ['ならびに', '並びに'],
  ['ただし', '但し'],
  ['わかる', '分かる'],
  ['わから', '分から'],
  ['わかり', '分かり'],
  ['わかっ', '分かっ'],
  ['一緒', 'いっしょ'],
  ['コンピューター', 'コンピュータ(?!ー)'],
  ['サーバー', 'サーバ(?!ー)'],
  ['ユーザー', 'ユーザ(?!ー)'],
  ['メンバー', 'メンバ(?!ー)'],
  ['インターフェース', 'インタフェース', 'インターフェイス'],
  ['Webサイト', 'ウェブサイト', 'WEBサイト'],
  ['Eメール', 'eメール', 'E-mail'],
]

/** 送り仮名のゆれ（先頭が公用文の標準） */
export const OKURIGANA_GROUPS: string[][] = [
  ['行う', '行なう'],
  ['表す', '表わす'],
  ['終わる', '終る'],
  ['変わる', '変る'],
  ['取り扱い', '取扱い', '取扱(?![いう])'],
  ['申し込み', '申込み'],
  ['受け付け', '受付け'],
  ['問い合わせ', '問合せ', '問い合せ'],
  ['打ち合わせ', '打合せ', '打ち合せ'],
  ['話し合い', '話合い'],
  ['少ない', '少い'],
  ['必ず', '必らず'],
  ['短い', '短かい'],
  ['明らか', '明か(?![りすさしせ])'],
  ['押さえる', '押える'],
  ['起こる', '起る'],
  ['向かう', '向う'],
]

export type Severity = 'error' | 'warning' | 'info'

export interface PatternRule {
  id: string
  re: RegExp
  message: string
  severity: Severity
  category: string
}

/** 誤字・文法（機械的に検出できるもの） */
export const TYPO_RULES: PatternRule[] = [
  {
    id: 'ranuki',
    re: /(?:見れ|来れ|食べれ|出れ|寝れ|着れ|考えれ|起きれ|決めれ|居れ)(?:る|ない|ます|た)/g,
    message: 'ら抜き言葉',
    severity: 'warning',
    category: '誤字・文法',
  },
  {
    id: 'inuki',
    re: /(?:して|やって|思って|言って|働いて|持って)(?:る|ます|ない)(?![がのか])/g,
    message: 'い抜き言葉（話し言葉。発言引用内なら可）',
    severity: 'info',
    category: '誤字・文法',
  },
  {
    id: 'double-particle',
    re: /([をにがへ])\1/g,
    message: '助詞の重複',
    severity: 'error',
    category: '誤字・文法',
  },
  {
    id: 'double-punct',
    re: /[、。]{2,}|、。|。、/g,
    message: '句読点の重複',
    severity: 'error',
    category: '誤字・文法',
  },
  {
    id: 'double-keigo',
    re: /おっしゃられ|お伺いさせていただ|拝見させていただ|ご覧になられ|お見えになられ|おられ(?=ます)/g,
    message: '二重敬語',
    severity: 'warning',
    category: '誤字・文法',
  },
  {
    id: 'sasete',
    re: /させていただ/g,
    message: '「させていただく」の多用に注意',
    severity: 'info',
    category: '文体',
  },
  {
    id: 'zenkaku-space',
    re: /　/g,
    message: '全角スペース',
    severity: 'info',
    category: '体裁',
  },
  {
    id: 'halfwidth-kana',
    re: /[ｦ-ﾟ]+/g,
    message: '半角カナ',
    severity: 'error',
    category: '体裁',
  },
  {
    id: 'fullwidth-alnum',
    re: /[Ａ-Ｚａ-ｚ０-９]+/g,
    message: '全角英数字（半角に統一）',
    severity: 'warning',
    category: '体裁',
  },
  {
    id: 'no-no',
    re: /の[^、。\n]{1,6}の[^、。\n]{1,6}の[^、。\n]{1,6}の/g,
    message: '「の」の連続（4回以上）',
    severity: 'info',
    category: '文体',
  },
  {
    id: 'kotoga-dekiru',
    re: /することができ/g,
    message: '「することができる」→「できる」で簡潔に',
    severity: 'info',
    category: '文体',
  },
]

/**
 * 採用記事で避けるべき表現。
 * - 職業安定法（的確な表示義務・虚偽誇大の禁止）
 * - 労働施策総合推進法（募集・採用における年齢制限の原則禁止）
 * - 男女雇用機会均等法（性別による制限・性別を想起させる職種名）
 * - 差別・偏見につながる表現
 */
export const RISK_RULES: PatternRule[] = [
  // 誇大・断定
  {
    id: 'absolute',
    re: /絶対に?|必ず(?:稼げ|成長|昇給|身につ)|100[%％]|確実に/g,
    message: '断定・保証表現（誇大表示のおそれ）',
    severity: 'warning',
    category: '誇張',
  },
  {
    id: 'no1',
    re: /(?:業界|日本|世界)(?:No\.?\s?1|ナンバーワン|一|トップ)|最高峰|唯一無二/g,
    message: 'No.1・最上級表現（客観的根拠と出典が必要）',
    severity: 'error',
    category: '誇張',
  },
  {
    id: 'easy-money',
    re: /誰でも(?:簡単|稼げ|できる)|楽して|簡単に(?:稼げ|高収入)|高収入保証|月収\d+万円以上可能/g,
    message: '収入・難易度の誇大表示（職業安定法の的確表示義務）',
    severity: 'error',
    category: '求人広告規制',
  },
  {
    id: 'zero-claims',
    re: /残業(?:ゼロ|0|なし)|離職率(?:ゼロ|0)|ノルマ(?:なし|一切なし)/g,
    message: '「ゼロ・なし」表現は事実確認必須（データの時期・範囲を明記）',
    severity: 'warning',
    category: '求人広告規制',
  },
  {
    id: 'at-home',
    re: /アットホームな職場|風通しの良い職場|やりがいのある仕事/g,
    message: '抽象的な決まり文句（具体的なエピソードで裏付ける）',
    severity: 'info',
    category: '表現の質',
  },
  // 年齢
  {
    id: 'age-limit',
    re: /\d{2}\s*(?:歳|才)\s*(?:まで|以下|未満|くらいまで)|\d{2}代(?:まで|の方(?:限定|のみ))|若い(?:方|人)(?:歓迎|限定|募集)|年齢不問ではありません/g,
    message: '年齢制限（労働施策総合推進法で原則禁止）',
    severity: 'error',
    category: '求人広告規制',
  },
  {
    id: 'age-hint',
    re: /\d{2}代(?:が中心|が活躍|の方歓迎)|若手(?:中心|が活躍)|平均年齢\d+歳/g,
    message: '年齢を想起させる表現（年齢制限と受け取られないよう注意）',
    severity: 'info',
    category: '求人広告規制',
  },
  // 性別
  {
    id: 'gender-limit',
    re: /(?:男性|女性)(?:のみ|限定|歓迎|募集|向け)|主婦(?:限定|歓迎)/g,
    message: '性別による制限（男女雇用機会均等法）',
    severity: 'error',
    category: '求人広告規制',
  },
  {
    id: 'gender-title',
    re: /営業マン|セールスマン|ウェイトレス|ウエイトレス|看護婦|保母|スチュワーデス|OL|カメラマン|ビジネスマン|サラリーマン|キャリアウーマン|女子社員|男手/g,
    message:
      '性別を想起させる職種名（営業職・看護師・保育士・客室乗務員・ビジネスパーソン等に）',
    severity: 'warning',
    category: '差別・配慮',
  },
  // 差別・偏見
  {
    id: 'discrimination',
    re: /日本人(?:のみ|限定)|健康な方(?:のみ|限定)|容姿端麗|独身(?:者|の方)(?:限定|歓迎)|既婚(?:者|の方)(?:限定|のみ)|体育会系(?:限定|のみ)|(?:片親|母子家庭|障害者)(?:でも|なのに)/g,
    message: '差別・不当な選別につながる表現',
    severity: 'error',
    category: '差別・配慮',
  },
  {
    id: 'offensive',
    re: /めくら|つんぼ|おし(?=[をがのは])|気違い|キチガイ|百姓|外人|ハーフ(?=の)|オカマ|ホモ/g,
    message: '差別語・不快語',
    severity: 'error',
    category: '差別・配慮',
  },
]

export interface ClientRules {
  /** 社名の正式表記と誤表記 */
  companyNames?: { correct: string; wrong: string[] }[]
  /** NGワード（理由・言い換え付き） */
  ngWords?: { word: string; reason?: string; suggest?: string }[]
  /** 置換ルール（誤→正） */
  replacements?: Record<string, string>
  /** 表記ゆれの推奨表記（NOTATION_GROUPS の推奨を上書き） */
  preferred?: string[]
  /** 目標文字数・許容誤差（%） */
  targetChars?: number
  tolerancePct?: number
  /** 見出しごとの配分比率（見出し順） */
  sectionRatios?: number[]
  /** 文体（「です・ます調」「だ・である調」） */
  style?: 'です・ます調' | 'だ・である調'
}
