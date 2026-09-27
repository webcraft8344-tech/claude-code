import { FACT_RE } from '../manuscript/keypoints.js'
import {
  countChars,
  escapeRegExp,
  findAll,
  mdTable,
  normalizeForParse,
} from '../util/text.js'
import {
  type ClientRules,
  NOTATION_GROUPS,
  OKURIGANA_GROUPS,
  type PatternRule,
  RISK_RULES,
  type Severity,
  TYPO_RULES,
} from './rules.js'

export interface Issue {
  category: string
  severity: Severity
  line: number
  match: string
  message: string
  context: string
}

const plain = (alt: string) => alt.replace(/\(\?[=!][^)]*\)/g, '')

/** 表記ゆれ・送り仮名ゆれ: 同一グループ内の複数表記の混在、または推奨外表記を検出。 */
export function checkNotation(text: string, rules: ClientRules = {}): Issue[] {
  const issues: Issue[] = []
  const preferred = new Set(rules.preferred ?? [])
  const run = (groups: string[][], category: string) => {
    for (const group of groups) {
      const present = group
        .map(alt => ({ alt, hits: findAll(text, new RegExp(alt, 'g')) }))
        .filter(x => x.hits.length)
      const pref = group.find(g => preferred.has(plain(g))) ?? group[0]!
      const mixed = present.length > 1
      for (const x of present) {
        if (x.alt === pref) continue
        // 推奨がクライアント指定 or 混在しているときだけ指摘（単独使用は info）
        const severity: Severity = mixed || preferred.size ? 'warning' : 'info'
        for (const h of x.hits) {
          issues.push({
            category,
            severity,
            line: h.line,
            match: h.match,
            message: `${mixed ? '表記が混在' : '推奨外の表記'}：「${plain(pref)}」に統一`,
            context: h.context,
          })
        }
      }
    }
  }
  run(NOTATION_GROUPS, '表記ゆれ')
  run(OKURIGANA_GROUPS, '送り仮名')

  // 数字の全角・半角混在
  const full = findAll(text, /[０-９]+/g)
  const half = findAll(text, /[0-9]+/g)
  if (full.length && half.length) {
    for (const h of full) {
      issues.push({
        category: '表記ゆれ',
        severity: 'warning',
        line: h.line,
        match: h.match,
        message: '数字の全角・半角が混在',
        context: h.context,
      })
    }
  }
  return issues
}

function runPatterns(text: string, rules: PatternRule[]): Issue[] {
  return rules.flatMap(r =>
    findAll(text, r.re).map(h => ({
      category: r.category,
      severity: r.severity,
      line: h.line,
      match: h.match,
      message: r.message,
      context: h.context,
    })),
  )
}

export function checkTypos(text: string): Issue[] {
  const issues = runPatterns(text, TYPO_RULES)
  // 同じ語尾が3文以上連続
  const ends = text
    .split(/(?<=[。！？])/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/[。！？」]+$/, '').slice(-2))
  for (let i = 2; i < ends.length; i++) {
    if (ends[i] && ends[i] === ends[i - 1] && ends[i] === ends[i - 2]) {
      issues.push({
        category: '文体',
        severity: 'info',
        line: 0,
        match: ends[i]!,
        message: `語尾「${ends[i]}」が3文連続`,
        context: '',
      })
    }
  }
  return issues
}

export function checkRisk(text: string): Issue[] {
  return runPatterns(text, RISK_RULES)
}

/** クライアント指定の表記ルール（社名・NGワード・置換）との照合。 */
export function checkClientRules(text: string, rules: ClientRules): Issue[] {
  const issues: Issue[] = []
  for (const c of rules.companyNames ?? []) {
    for (const w of c.wrong) {
      for (const h of findAll(text, new RegExp(escapeRegExp(w), 'g'))) {
        // 正式表記の一部として含まれる場合は除外
        if (h.context.includes(c.correct) && c.correct.includes(w)) continue
        issues.push({
          category: 'クライアント表記',
          severity: 'error',
          line: h.line,
          match: h.match,
          message: `社名表記：「${c.correct}」`,
          context: h.context,
        })
      }
    }
  }
  for (const ng of rules.ngWords ?? []) {
    for (const h of findAll(text, new RegExp(escapeRegExp(ng.word), 'g'))) {
      issues.push({
        category: 'NGワード',
        severity: 'error',
        line: h.line,
        match: h.match,
        message: `NGワード${ng.reason ? `（${ng.reason}）` : ''}${ng.suggest ? ` → 「${ng.suggest}」` : ''}`,
        context: h.context,
      })
    }
  }
  for (const [from, to] of Object.entries(rules.replacements ?? {})) {
    for (const h of findAll(text, new RegExp(escapeRegExp(from), 'g'))) {
      issues.push({
        category: 'クライアント表記',
        severity: 'warning',
        line: h.line,
        match: h.match,
        message: `→「${to}」`,
        context: h.context,
      })
    }
  }
  if (rules.style === 'です・ます調') {
    for (const h of findAll(text, /(?:である|だった|だ)。/g)) {
      issues.push({
        category: '文体',
        severity: 'warning',
        line: h.line,
        match: h.match,
        message: 'です・ます調指定だが常体の文末',
        context: h.context,
      })
    }
  }
  return issues
}

export interface CountReport {
  total: number
  target: number | null
  diffPct: number | null
  sections: {
    heading: string
    chars: number
    target: number | null
    diffPct: number | null
  }[]
}

/** 文字数カウントと見出しごとの配分チェック（# / ## / ### 見出し単位）。 */
export function countBySection(
  text: string,
  rules: ClientRules = {},
): CountReport {
  const total = countChars(text)
  const target = rules.targetChars ?? null
  const parts: { heading: string; body: string[] }[] = [
    { heading: '（冒頭・リード）', body: [] },
  ]
  for (const line of text.split('\n')) {
    const m =
      line.match(/^#{2,3}\s+(.+)/) ??
      line.match(/^【(.+)】\s*$/) ??
      line.match(/^■\s*(.+)/)
    if (m) parts.push({ heading: m[1]!.trim(), body: [] })
    else if (!/^#\s/.test(line)) parts.at(-1)!.body.push(line)
  }
  const secs = parts.filter(
    (s, i) => i > 0 || countChars(s.body.join('\n')) > 0,
  )
  const ratios = rules.sectionRatios
  const pct = (a: number, b: number | null) =>
    b ? Math.round(((a - b) / b) * 100) : null
  return {
    total,
    target,
    diffPct: pct(total, target),
    sections: secs.map((s, i) => {
      const chars = countChars(s.body.join('\n'))
      let t: number | null = null
      if (target) {
        t =
          ratios?.[i] !== undefined
            ? Math.round(
                (target * ratios[i]!) / ratios.reduce((a, b) => a + b, 0),
              )
            : Math.round(target / secs.length)
      }
      return { heading: s.heading, chars, target: t, diffPct: pct(chars, t) }
    }),
  }
}

/** 部署・組織名 */
const DEPT_RE =
  /[一-龯ァ-ヶA-Za-z0-9ー・]{1,12}(?:事業部|本部|部|課|室|グループ|チーム|センター|支店|営業所)(?![分品屋署下門])/g

function extractFacts(text: string): Set<string> {
  const t = normalizeForParse(text)
  const facts = new Set<string>()
  for (const m of t.match(FACT_RE) ?? []) facts.add(m.replace(/\s/g, ''))
  for (const m of t.match(/(?:19|20)\d{2}年/g) ?? []) facts.add(m)
  for (const m of t.match(DEPT_RE) ?? []) facts.add(m)
  return facts
}

export interface FactMismatch {
  fact: string
  kind: '数字' | '部署名'
  line: number
  context: string
  nearest: string[]
}

/** 取材メモ（文字起こし含む）と原稿の事実照合。原稿にしかない数字・部署名を列挙する。 */
export function checkFacts(draft: string, memo: string): FactMismatch[] {
  const memoFacts = extractFacts(memo)
  const memoNorm = normalizeForParse(memo).replace(/\s/g, '')
  const out: FactMismatch[] = []
  const seen = new Set<string>()
  for (const f of extractFacts(draft)) {
    if (memoFacts.has(f) || memoNorm.includes(f) || seen.has(f)) continue
    seen.add(f)
    const isDept = !/\d|[一二三四五六七八九十百千]/.test(f.slice(0, 1))
    const unit = f.replace(/^[\d.一二三四五六七八九十百千]+/, '')
    const nearest = [...memoFacts]
      .filter(m => (isDept ? m.slice(-2) === f.slice(-2) : m.endsWith(unit)))
      .slice(0, 5)
    const hit = findAll(
      normalizeForParse(draft),
      new RegExp(escapeRegExp(f)),
    )[0]
    out.push({
      fact: f,
      kind: isDept ? '部署名' : '数字',
      line: hit?.line ?? 0,
      context: hit?.context ?? '',
      nearest,
    })
  }
  return out
}

export interface ProofReport {
  issues: Issue[]
  count: CountReport
  facts: FactMismatch[] | null
}

export function proofread(
  text: string,
  rules: ClientRules = {},
  memo?: string,
): ProofReport {
  const issues = [
    ...checkClientRules(text, rules),
    ...checkRisk(text),
    ...checkTypos(text),
    ...checkNotation(text, rules),
  ]
  return {
    issues,
    count: countBySection(text, rules),
    facts: memo ? checkFacts(text, memo) : null,
  }
}

const SEV_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 }
const SEV_LABEL: Record<Severity, string> = {
  error: '🔴要修正',
  warning: '🟡要確認',
  info: '⚪参考',
}

export function proofMarkdown(r: ProofReport): string {
  const sorted = [...r.issues].sort(
    (a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.line - b.line,
  )
  const bySev = (s: Severity) => r.issues.filter(i => i.severity === s).length
  const out = [
    '# 校正レポート',
    '',
    `- 要修正 ${bySev('error')}件 ／ 要確認 ${bySev('warning')}件 ／ 参考 ${bySev('info')}件`,
    `- 文字数: ${r.count.total}字${r.count.target ? `（目標 ${r.count.target}字、${fmtPct(r.count.diffPct)}）` : ''}`,
    '',
    '## 指摘一覧',
    '',
    sorted.length
      ? mdTable(
          ['重要度', '分類', '行', '該当', '指摘', '前後'],
          sorted.map(i => [
            SEV_LABEL[i.severity],
            i.category,
            i.line || '-',
            i.match,
            i.message,
            i.context,
          ]),
        )
      : '指摘なし',
    '',
    '## 見出しごとの文字数',
    '',
    mdTable(
      ['見出し', '文字数', '目安', '差'],
      r.count.sections.map(s => [
        s.heading,
        s.chars,
        s.target ?? '-',
        fmtPct(s.diffPct),
      ]),
    ),
    '',
  ]
  if (r.facts) {
    out.push(
      '## 事実照合（取材メモにない数字・部署名）',
      '',
      r.facts.length
        ? mdTable(
            ['種別', '原稿の表記', '行', '前後', 'メモ内の近い表記'],
            r.facts.map(f => [
              f.kind,
              f.fact,
              f.line || '-',
              f.context,
              f.nearest.join('、') || '-',
            ]),
          )
        : '不一致なし',
      '',
    )
  }
  return out.join('\n')
}

function fmtPct(p: number | null): string {
  if (p === null) return '-'
  const mark = Math.abs(p) > 10 ? ' ⚠' : ''
  return `${p > 0 ? '+' : ''}${p}%${mark}`
}
