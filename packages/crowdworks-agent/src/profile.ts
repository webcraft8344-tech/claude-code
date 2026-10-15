import { p, readJson } from './util/store.js'

export type InterviewFormat = 'online' | 'onsite' | 'phone' | 'none'

export interface Strength {
  /** 募集要項のポイントキー（REQUIREMENT_DICT のキー）と対応させる */
  key: string
  label: string
  /** 提案文に入れる根拠（実績・数字） */
  evidence: string
}

export interface PortfolioItem {
  id: string
  title: string
  url: string
  genres: string[]
  tags: string[]
  summary: string
  date?: string
  chars?: number
}

export interface FeeTier {
  /** この金額（税込・円）までの部分に rate を適用。null は上限なし */
  upTo: number | null
  rate: number
}

export interface Profile {
  name: string
  /** 最低文字単価（円/文字） */
  minCharRate: number
  /** 最低時給換算（円/時） */
  minHourlyRate: number
  /** 1時間あたりの執筆文字数（取材・構成込みの時給換算に使用） */
  charsPerHour: number
  /** 取材1件あたりの追加工数（時間） */
  interviewHours: number
  /** 対応可能な取材形式 */
  interviewFormats: InterviewFormat[]
  preferredGenres: string[]
  ngGenres: string[]
  /** 応募判定のしきい値（0-100） */
  applyThreshold: number
  strengths: Strength[]
  portfolio: PortfolioItem[]
  /** 自己PRテンプレ。{{client}} {{title}} {{mapping}} {{portfolio}} {{name}} {{bid}} {{deadline}} を置換 */
  selfPrTemplate: string
  /** 短縮版の目安文字数 */
  shortProposalChars: number
  /** 毎朝のダイジェスト（cw digest）の検索条件 */
  search?: {
    /** クラウドワークスの検索キーワード（1語ずつ検索して結果をまとめる） */
    keywords: string[]
    /** 何時間以内に掲載・再掲載された案件を対象にするか */
    sinceHours?: number
    /** 詳細ページを読む最大件数（サイトへの負荷を抑えるため） */
    maxDetails?: number
    /** 対象にする仕事カテゴリID（空なら全カテゴリ）。既定はライティング系 */
    categoryIds?: number[]
    /**
     * 文章系の仕事が混ざるカテゴリ（文字起こし・SNS運用・動画台本など）。
     * タイトルが文章系の仕事（文字起こし・投稿文・台本など）と判断できたものだけ対象にする
     */
    extraCategoryIds?: number[]
  }
  fees: {
    /** クラウドワークスのシステム利用料（契約金額・税込に対する段階制） */
    tiers: FeeTier[]
    /** 振込手数料（楽天銀行 100円 / その他 500円 など。口座に合わせて変更） */
    transferFee: number
  }
}

/**
 * クラウドワークスのライティング系カテゴリ（記事・Webコンテンツ作成、ライティング全般、
 * SEOライティング、取材・インタビュー記事など）。体験談提供・アンケート・文字起こし・
 * データ入力などは含めない。
 */
export const WRITING_CATEGORY_IDS = [36, 37, 38, 39, 40, 41, 288]

/**
 * 文字起こし（55）、SNS運用・投稿（15, 57, 133, 303）、動画の企画・台本（283, 287, 293, 358）。
 * 画像制作や動画編集も混ざるため、タイトルで文章系の仕事だけを拾う。
 */
export const TEXT_ADJACENT_CATEGORY_IDS = [
  55, 15, 57, 133, 303, 283, 287, 293, 358,
]

export const DEFAULT_PROFILE: Profile = {
  name: '山田 花子',
  minCharRate: 1.5,
  minHourlyRate: 2000,
  charsPerHour: 1200,
  interviewHours: 2,
  interviewFormats: ['online', 'phone'],
  preferredGenres: ['採用', 'IT', '人事'],
  ngGenres: ['アダルト', 'ギャンブル', '投資勧誘'],
  applyThreshold: 60,
  strengths: [
    {
      key: 'interview',
      label: '取材力',
      evidence:
        '社員インタビュー記事を累計50本以上担当。オンライン取材で初対面の方からもエピソードを引き出す質問設計を得意としています',
    },
    {
      key: 'structure',
      label: '構成力',
      evidence:
        '取材前に仮構成を作成し、読者（求職者）の知りたい順に情報を並べる構成を提案しています',
    },
    {
      key: 'deadline',
      label: '納期厳守',
      evidence: 'これまで納期遅延ゼロ。進捗は中間報告でこまめに共有します',
    },
    {
      key: 'recruiting',
      label: '採用広報の知見',
      evidence:
        '人材業界での勤務経験があり、求人広告の表現規制（年齢・性別制限など）にも配慮して執筆できます',
    },
    {
      key: 'seo',
      label: 'SEO',
      evidence:
        'キーワード選定から見出し設計まで対応し、上位表示実績があります',
    },
    {
      key: 'continuity',
      label: '継続対応',
      evidence:
        '同一クライアントで1年以上の継続実績があり、トーンや表記ルールを蓄積して品質を安定させます',
    },
    {
      key: 'communication',
      label: '迅速なレスポンス',
      evidence: '平日は原則24時間以内に返信します',
    },
  ],
  portfolio: [],
  selfPrTemplate: [
    '{{client}} ご担当者様',
    '',
    'はじめまして、ライターの{{name}}と申します。「{{title}}」の募集を拝見し、応募いたしました。',
    '',
    '【本案件でお役に立てる点】',
    '{{mapping}}',
    '',
    '【参考記事】',
    '{{portfolio}}',
    '',
    '【条件】',
    '提示金額：{{bid}}／納期：{{deadline}}',
    '',
    'ご検討のほど、どうぞよろしくお願いいたします。',
  ].join('\n'),
  shortProposalChars: 400,
  search: {
    keywords: [
      '取材',
      'インタビュー記事',
      '経営者',
      '地域 記事',
      '教育 記事',
      'スポーツ 記事',
      '文字起こし',
      'SNS 投稿文',
      '台本',
      'シナリオ',
    ],
    sinceHours: 24,
    maxDetails: 40,
    categoryIds: WRITING_CATEGORY_IDS,
    extraCategoryIds: TEXT_ADJACENT_CATEGORY_IDS,
  },
  fees: {
    tiers: [
      { upTo: 100000, rate: 0.2 },
      { upTo: 200000, rate: 0.1 },
      { upTo: null, rate: 0.05 },
    ],
    transferFee: 500,
  },
}

export function loadProfile(): Profile {
  const loaded = readJson<Partial<Profile>>(p('profile.json'), {})
  return {
    ...DEFAULT_PROFILE,
    ...loaded,
    fees: { ...DEFAULT_PROFILE.fees, ...(loaded.fees ?? {}) },
  }
}
