import type { PortfolioItem, Profile, Strength } from '../profile.js'
import { type Job, REQUIREMENT_DICT } from '../scout/extract.js'
import { payLabel } from '../scout/jobs.js'
import { countChars, mdTable, splitSentences, yen } from '../util/text.js'

export interface MappingRow {
  requirementKey: string
  requirement: string
  strength: Strength | null
}

/** 募集要項の求めるポイントと自分の強みの対応表を作る。 */
export function buildMapping(job: Job, profile: Profile): MappingRow[] {
  const keys = job.requirements.length
    ? job.requirements
    : ['writing', 'deadline']
  return keys.map(k => ({
    requirementKey: k,
    requirement: REQUIREMENT_DICT[k]?.label ?? k,
    strength: profile.strengths.find(s => s.key === k) ?? null,
  }))
}

export function mappingTable(rows: MappingRow[]): string {
  return mdTable(
    ['募集要項のポイント', '自分の強み', '根拠・実績'],
    rows.map(r => [
      r.requirement,
      r.strength?.label ?? '（未対応：提案文で補足 or 見送り検討）',
      r.strength?.evidence ?? '-',
    ]),
  )
}

/** 案件に提示すべきポートフォリオ記事を選ぶ（ジャンル一致 > タグ一致 > 新しさ）。 */
export function selectPortfolio(
  job: Job,
  items: PortfolioItem[],
  limit = 3,
): { item: PortfolioItem; score: number; reasons: string[] }[] {
  const text = `${job.title}\n${job.rawText}`
  return items
    .map(item => {
      const reasons: string[] = []
      let score = 0
      const g = item.genres.filter(x => job.genres.includes(x))
      if (g.length) {
        score += g.length * 3
        reasons.push(`ジャンル一致: ${g.join('、')}`)
      }
      const tags = item.tags.filter(t => text.includes(t))
      if (tags.length) {
        score += tags.length
        reasons.push(`キーワード一致: ${tags.join('、')}`)
      }
      // 新しさは同点時の順位付けだけに使う（無関係な記事を選ばない）
      if (score > 0 && item.date) {
        const ageDays = (Date.now() - new Date(item.date).getTime()) / 86400000
        if (ageDays < 365) score += 0.5
      }
      return { item, score, reasons }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export interface ProposalOptions {
  bid?: number
  deadline?: string
}

export interface Proposal {
  long: string
  short: string
  mapping: MappingRow[]
  portfolio: PortfolioItem[]
  bid: number | null
}

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m)
}

/** 自己PRテンプレから案件特化の提案文（詳細版・短縮版）を生成する。 */
export function buildProposal(
  job: Job,
  profile: Profile,
  opts: ProposalOptions = {},
): Proposal {
  const mapping = buildMapping(job, profile)
  const portfolio = selectPortfolio(job, profile.portfolio).map(x => x.item)
  const bid = opts.bid ?? job.budgetMax ?? job.budgetMin ?? null
  const matched = mapping.filter(m => m.strength)

  const mappingLong = matched.length
    ? matched.map(m => `・${m.requirement}：${m.strength!.evidence}`).join('\n')
    : profile.strengths
        .slice(0, 3)
        .map(s => `・${s.label}：${s.evidence}`)
        .join('\n')
  // URL のない実績（紙媒体など）はタイトルと概要だけ載せる。該当なしなら見出しごと消す
  const portfolioLong = portfolio
    .map(p =>
      [`・${p.title}`, p.url && `  ${p.url}`, p.summary && `  ${p.summary}`]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n')

  const vars = {
    client: job.client ?? '',
    title: job.title,
    name: profile.name,
    mapping: mappingLong,
    portfolio: portfolioLong,
    bid: bid !== null ? yen(bid) : payLabel(job),
    deadline: opts.deadline ?? job.deadline ?? 'ご指定の納期',
  }
  const long = dropEmptySections(
    fill(profile.selfPrTemplate, vars).replace(/^ ご担当者様/m, 'ご担当者様'),
  )

  const shortVars = {
    ...vars,
    mapping: (matched.length ? matched : mapping)
      .slice(0, 3)
      .map(
        m => `・${m.requirement}：${firstSentence(m.strength?.evidence ?? '')}`,
      )
      .join('\n'),
    portfolio: portfolio.length
      ? portfolio
          .slice(0, 2)
          .map(p => `・${p.title}${p.url ? ` ${p.url}` : ''}`)
          .join('\n')
      : '',
  }
  const short = trimToChars(
    fill(profile.selfPrTemplate, shortVars).replace(
      /^ ご担当者様/m,
      'ご担当者様',
    ),
    profile.shortProposalChars,
  )
  return { long, short, mapping, portfolio, bid }
}

/** 中身が空になった【見出し】と連続する空行を取り除く。 */
export function dropEmptySections(text: string): string {
  return text
    .split('\n')
    .filter((l, i, a) => !(/^【/.test(l) && (a[i + 1] ?? '') === ''))
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n')
}

function firstSentence(s: string): string {
  return splitSentences(s)[0] ?? s
}

/**
 * 目安文字数まで短縮する。空行・見出し行・署名は残し、
 * 箇条書きを末尾から削っていく。
 */
export function trimToChars(text: string, target: number): string {
  const lines = text
    .split('\n')
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
  const isRemovable = (l: string) => /^[・-]/.test(l) || /^\s{2}/.test(l)
  while (countChars(lines.join('\n')) > target) {
    let idx = -1
    for (let i = lines.length - 1; i >= 0; i--) {
      if (isRemovable(lines[i]!)) {
        const sameBlock = lines.filter(x => isRemovable(x)).length
        if (sameBlock > 1) {
          idx = i
          break
        }
      }
    }
    if (idx < 0) break
    lines.splice(idx, 1)
  }
  return dropEmptySections(lines.join('\n'))
}

export function proposalMarkdown(job: Job, prop: Proposal): string {
  return [
    `# 提案文: ${job.title}`,
    '',
    `- 案件ID: ${job.id}`,
    `- 提示額: ${prop.bid !== null ? yen(prop.bid) : '-'}`,
    `- 詳細版: ${countChars(prop.long)}字 ／ 短縮版: ${countChars(prop.short)}字`,
    '',
    '## 求めるポイント × 自分の強み 対応表',
    '',
    mappingTable(prop.mapping),
    '',
    '## 提示するポートフォリオ',
    '',
    ...(prop.portfolio.length
      ? prop.portfolio.map(
          p => `- ${p.url ? `[${p.title}](${p.url})` : p.title} — ${p.summary}`,
        )
      : ['- （該当なし）']),
    '',
    '## 詳細版',
    '',
    '```text',
    prop.long,
    '```',
    '',
    '## 短縮版',
    '',
    '```text',
    prop.short,
    '```',
    '',
  ].join('\n')
}
