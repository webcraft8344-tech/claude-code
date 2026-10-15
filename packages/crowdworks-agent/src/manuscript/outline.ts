import type { EpisodeCategory, KeyPoint } from './keypoints.js'

export interface OutlineSection {
  heading: string
  chars: number
  points: string[]
}

export interface Outline {
  lead: OutlineSection
  sections: OutlineSection[]
  closing: OutlineSection
}

const SECTION_ORDER: {
  cat: EpisodeCategory
  heading: (p: string) => string
}[] = [
  {
    cat: 'きっかけ・入社理由',
    heading: () => '入社の決め手は「（キーフレーズ）」',
  },
  { cat: '仕事内容・やりがい', heading: () => '（仕事内容）のやりがいとは' },
  { cat: '苦労・転機', heading: () => '壁にぶつかったとき、支えになったもの' },
  { cat: '成長・学び', heading: () => '○年で身についた（スキル）' },
  {
    cat: '職場・カルチャー',
    heading: () => '（職場の特徴）なチームで働くということ',
  },
  { cat: '今後・メッセージ', heading: () => 'これから挑戦したいこと' },
]

/**
 * 要点から構成案（リード＋見出し3〜4本＋締め）を組み立てる。
 * 見出し文言は仮置き。Claude（cw-manuscript スキル）が発言内容に合わせて書き換える前提。
 */
export function buildOutline(
  points: KeyPoint[],
  totalChars = 3000,
  headings = 4,
): Outline {
  const n = Math.min(4, Math.max(3, headings))
  const available = SECTION_ORDER.filter(
    s => s.cat !== '今後・メッセージ' && points.some(p => p.category === s.cat),
  )
  const chosen = (
    available.length >= n - 1
      ? available
      : SECTION_ORDER.filter(s => s.cat !== '今後・メッセージ')
  ).slice(0, n - 1)
  chosen.push(SECTION_ORDER.find(s => s.cat === '今後・メッセージ')!)

  const leadChars = Math.round(totalChars * 0.1)
  const closingChars = Math.round(totalChars * 0.05)
  const per = Math.round(
    (totalChars - leadChars - closingChars) / chosen.length,
  )
  const top = (cat: string, k = 3) =>
    points
      .filter(p => p.category === cat)
      .slice(0, k)
      .map(p => p.sentence)

  return {
    lead: {
      heading: 'リード',
      chars: leadChars,
      points: points.slice(0, 2).map(p => p.sentence),
    },
    sections: chosen.map(s => ({
      heading: s.heading(''),
      chars: per,
      points: top(s.cat),
    })),
    closing: {
      heading: '締め',
      chars: closingChars,
      points: top('今後・メッセージ', 1),
    },
  }
}

export function outlineMarkdown(o: Outline): string {
  const sec = (s: OutlineSection, level = '##') => [
    `${level} ${s.heading}（目安 ${s.chars}字）`,
    '',
    ...(s.points.length
      ? s.points.map(p => `- ${p}`)
      : ['- （使うエピソードを選ぶ）']),
    '',
  ]
  return [
    '# 構成案',
    '',
    ...sec(o.lead),
    ...o.sections.flatMap(s => sec(s)),
    ...sec(o.closing),
  ].join('\n')
}

export interface TitleVars {
  person: string
  role: string
  company: string
  keyPhrase: string
  years?: string
}

/** タイトル案を型ごとに複数出す。 */
export function titlePatterns(v: TitleVars): { type: string; title: string }[] {
  const yrs = v.years ?? '入社○年目'
  return [
    {
      type: '発言引用型',
      title: `「${v.keyPhrase}」${v.company}の${v.role}が語る、仕事の本音`,
    },
    {
      type: '人物フォーカス型',
      title: `${yrs}の${v.role}・${v.person}さんが見つけた、${v.company}で働く意味`,
    },
    {
      type: '問いかけ型',
      title: `なぜ${v.person}さんは${v.company}を選んだのか？${v.role}のキャリアに迫る`,
    },
    {
      type: 'ビフォーアフター型',
      title: `未経験から${v.role}へ。${v.person}さんが${yrs}で掴んだもの`,
    },
    {
      type: '数字型',
      title: `${yrs}で任された3つの挑戦。${v.company} ${v.role}インタビュー`,
    },
    {
      type: '読者呼びかけ型',
      title: `${v.role}を目指すあなたへ。${v.company}の先輩が伝えたいこと`,
    },
  ]
}
