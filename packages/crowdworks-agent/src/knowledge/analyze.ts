import type { Application } from '../propose/applications.js'
import { mdTable } from '../util/text.js'

export interface FeatureStat {
  feature: string
  value: string
  n: number
  won: number
  rate: number
  lift: number
}

type Extractor = (a: Application) => string[]

const bucket = (
  n: number | undefined,
  edges: number[],
  unit: string,
): string => {
  if (n === undefined) return '不明'
  for (const e of edges) if (n <= e) return `〜${e}${unit}`
  return `${edges.at(-1)}${unit}超`
}

const FEATURES: Record<string, Extractor> = {
  ジャンル: a => (a.genres.length ? a.genres : ['なし']),
  提案文の長さ: a => [bucket(a.proposalChars, [300, 500, 800], '字')],
  バリアント: a => [
    a.variant === 'short' ? '短縮版' : a.variant === 'long' ? '詳細版' : '不明',
  ],
  提示額比: a => [
    a.bid && a.budget
      ? bucket(Math.round((a.bid / a.budget) * 100), [80, 95, 100], '%')
      : '不明',
  ],
  使った強み: a => a.strengthsUsed ?? [],
  ポートフォリオ本数: a => [String(a.portfolioIds?.length ?? 0)],
  曜日: a =>
    ['日', '月', '火', '水', '木', '金', '土']
      .slice(new Date(a.date).getDay())
      .slice(0, 1),
}

/** 受注・不採用の結果から、特徴ごとの受注率とリフト（全体比）を集計する。 */
export function analyzeWins(
  apps: Application[],
  minN = 2,
): { overall: number; decided: number; stats: FeatureStat[] } {
  const decided = apps.filter(
    a => a.status === 'won' || a.status === 'lost' || a.status === 'no_reply',
  )
  const won = decided.filter(a => a.status === 'won').length
  const overall = decided.length ? won / decided.length : 0
  const stats: FeatureStat[] = []
  for (const [feature, ex] of Object.entries(FEATURES)) {
    const groups = new Map<string, { n: number; won: number }>()
    for (const a of decided) {
      for (const v of ex(a)) {
        const g = groups.get(v) ?? { n: 0, won: 0 }
        g.n++
        if (a.status === 'won') g.won++
        groups.set(v, g)
      }
    }
    for (const [value, g] of groups) {
      if (g.n < minN) continue
      const rate = g.won / g.n
      stats.push({
        feature,
        value,
        n: g.n,
        won: g.won,
        rate,
        lift: overall ? rate / overall : 0,
      })
    }
  }
  return {
    overall,
    decided: decided.length,
    stats: stats.sort((a, b) => b.lift - a.lift),
  }
}

export function winsMarkdown(r: ReturnType<typeof analyzeWins>): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`
  const good = r.stats.filter(s => s.lift >= 1.2)
  const bad = r.stats.filter(s => s.lift <= 0.8)
  const row = (s: FeatureStat) => [
    s.feature,
    s.value,
    s.n,
    s.won,
    pct(s.rate),
    `×${s.lift.toFixed(2)}`,
  ]
  const H = ['特徴', '値', '件数', '受注', '受注率', '全体比']
  return [
    '# 提案文の勝ちパターン分析',
    '',
    `- 結果確定: ${r.decided}件 ／ 全体受注率: ${pct(r.overall)}`,
    r.decided < 10
      ? '- ⚠ サンプルが少ないため参考値です（10件以上で傾向が安定）'
      : '',
    '',
    '## 勝ちパターン（受注率が全体の1.2倍以上）',
    '',
    good.length ? mdTable(H, good.map(row)) : '該当なし',
    '',
    '## 負けパターン（0.8倍以下）',
    '',
    bad.length ? mdTable(H, bad.map(row)) : '該当なし',
    '',
    '## 全特徴',
    '',
    r.stats.length ? mdTable(H, r.stats.map(row)) : 'データなし',
    '',
  ].join('\n')
}
