/**
 * クラウドワークスの公開検索結果から新着案件を集め、条件で判定してダイジェストを作る。
 *
 * - 検索結果ページ（/public/jobs/search）に埋め込まれた JSON から一覧を取得
 * - 詳細ページ（/public/jobs/<id>）の JobPosting から本文、埋め込み JSON から発注者情報を取得
 * - robots.txt で許可されたパスのみを、間隔を空けて少数だけ読む
 */
import type { Profile } from '../profile.js'
import type { Application } from '../propose/applications.js'
import { htmlToText, mdTable, splitSentences, yen } from '../util/text.js'
import {
  extractJob,
  INTERVIEW_LABEL,
  CONTINUITY_LABEL,
  type Job,
} from './extract.js'
import { payLabel } from './jobs.js'
import { scoreJob, type Verdict } from './score.js'

const BASE = 'https://crowdworks.jp'

export interface Listing {
  id: number
  title: string
  digest: string
  categoryId: number | null
  expiredOn: string | null
  releasedAt: string | null
  payment: Record<string, Record<string, number>>
  client: { userId: number; username: string }
  applicants: number | null
  hopeNumber: number | null
}

export interface ClientInfo {
  identityVerified: boolean | null
  averageScore: number | null
  finishedRate: number | null
  achievements: number | null
}

export interface Detail {
  description: string
  client: ClientInfo
}

function decodeAttr(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function dataAttr(html: string, id: string): unknown | null {
  const m = html.match(new RegExp(`id="${id}"[^>]*?\\sdata="([^"]*)"`))
  if (!m) return null
  try {
    return JSON.parse(decodeAttr(m[1]!))
  } catch {
    return null
  }
}

type Raw = Record<string, any>

/** 検索結果ページの埋め込み JSON から案件一覧を取り出す（PR 枠も含め、重複は除く）。 */
export function parseSearchHtml(html: string): Listing[] {
  const data = dataAttr(html, 'vue-container') as Raw | null
  const sr = data?.searchResult as Raw | undefined
  if (!sr) return []
  const all: Raw[] = [
    ...(sr.job_offers ?? []),
    ...(sr.pr_diamond ?? []),
    ...(sr.pr_platinum ?? []),
    ...(sr.pr_gold ?? []),
  ]
  const seen = new Set<number>()
  const out: Listing[] = []
  for (const r of all) {
    const jo = r.job_offer as Raw | undefined
    if (!jo?.id || seen.has(jo.id)) continue
    seen.add(jo.id)
    const pe = (r.entry?.project_entry ?? {}) as Raw
    out.push({
      id: jo.id,
      title: String(jo.title ?? ''),
      digest: String(jo.description_digest ?? ''),
      categoryId: jo.category_id ?? null,
      expiredOn: jo.expired_on ?? null,
      releasedAt: jo.last_released_at ?? null,
      payment: (r.payment ?? {}) as Listing['payment'],
      client: {
        userId: r.client?.user_id ?? 0,
        username: String(r.client?.username ?? ''),
      },
      applicants: pe.num_application_conditions ?? null,
      hopeNumber: pe.project_contract_hope_number ?? null,
    })
  }
  return out
}

/** 詳細ページから本文（JobPosting の description）と発注者情報を取り出す。 */
export function parseDetailHtml(html: string): Detail {
  let description = ''
  for (const m of html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  )) {
    try {
      const j = JSON.parse(m[1]!) as Raw
      if (j['@type'] === 'JobPosting' && typeof j.description === 'string') {
        description = htmlToText(decodeAttr(j.description))
        break
      }
    } catch {
      // 壊れた JSON-LD は無視
    }
  }
  const c = (dataAttr(html, 'client_detail_information_container') ?? {}) as Raw
  return {
    description,
    client: {
      identityVerified:
        typeof c.isIdentityVerified === 'boolean' ? c.isIdentityVerified : null,
      averageScore: typeof c.averageScore === 'number' ? c.averageScore : null,
      finishedRate:
        typeof c.projectFinishedRate === 'number'
          ? c.projectFinishedRate
          : null,
      achievements:
        typeof c.jobOfferAchievementCount === 'number'
          ? c.jobOfferAchievementCount
          : null,
    },
  }
}

/** 支払い形式の構造化データを、抽出器が読める文に変換する。 */
export function paymentText(p: Listing['payment']): string {
  const w = p.fixed_price_writing_payment
  if (w) {
    return `1記事 ${w.article_price}円 文字数：${w.min_articles_length}文字`
  }
  const f = p.fixed_price_payment
  if (f)
    return `固定報酬制 ${f.min_budget}円 〜 ${f.max_budget ?? f.min_budget}円`
  const h = p.hourly_payment
  if (h)
    return `時間単価制 時給 ${h.min_hourly_wage}円 〜 ${h.max_hourly_wage ?? h.min_hourly_wage}円`
  const t = p.task_payment
  if (t)
    return `タスク形式 1件 ${t.task_price}円（作業目安${t.estimated_work_minutes}分）`
  return ''
}

/** 一覧と詳細から Job を組み立てる。報酬は構造化データを優先する。 */
export function buildJob(
  l: Listing,
  d: Detail | null,
  today = new Date(),
): Job {
  const text = [
    l.title,
    `${BASE}/public/jobs/${l.id}`,
    `クライアント：${l.client.username}`,
    paymentText(l.payment),
    d?.description || l.digest,
  ]
    .filter(Boolean)
    .join('\n')
  const job = extractJob(text, today)
  job.id = String(l.id)
  job.title = l.title
  job.client = l.client.username || null
  job.url = `${BASE}/public/jobs/${l.id}`
  if (l.expiredOn) job.applyBy = l.expiredOn
  const w = l.payment.fixed_price_writing_payment
  if (w?.article_price && w.min_articles_length) {
    job.payType = 'fixed'
    job.budgetMin = job.budgetMax = w.article_price
    job.charCount = w.min_articles_length
    job.charRate =
      Math.round((w.article_price / w.min_articles_length) * 100) / 100
    job.charRateEstimated = false
  }
  const f = l.payment.fixed_price_payment
  if (f?.min_budget) {
    job.payType = 'fixed'
    job.budgetMin = f.min_budget
    job.budgetMax = f.max_budget ?? f.min_budget
  }
  const h = l.payment.hourly_payment
  if (h?.min_hourly_wage) {
    job.payType = 'hourly'
    job.hourlyRate = h.min_hourly_wage
  }
  return job
}

/** 規約違反・詐欺的な案件の兆候。hard=true は応募対象から外す。 */
export function riskFlags(
  text: string,
  client: ClientInfo | null,
): { flag: string; hard: boolean }[] {
  const out: { flag: string; hard: boolean }[] = []
  if (
    /(マニュアル|教材|サポート|登録|研修)(費|料|代)|初期費用|購入(して|いただ)|有料(の)?(講座|コンサル)/.test(
      text,
    )
  )
    out.push({ flag: '応募者に費用負担を求める記述', hard: true })
  if (
    /公式LINE|LINE\s*ID|LINE(で|に|を|へ)(追加|登録|友だち|連絡|ご連絡|移動)/i.test(
      text,
    )
  )
    out.push({
      flag: '契約前のLINE誘導の可能性（外部連絡は規約違反）',
      hard: true,
    })
  if (/誰でも(簡単|稼げ)|スキマ時間で月\d+万|未経験でも月収/.test(text))
    out.push({ flag: '誇大な収入表現', hard: false })
  if (/テスト(ライティング)?[^。\n]{0,15}(無償|無報酬|報酬なし|0円)/.test(text))
    out.push({ flag: '無償テストライティング', hard: false })
  if (client?.identityVerified === false)
    out.push({ flag: '発注者が本人確認未完了', hard: false })
  if (client?.finishedRate != null && client.finishedRate < 80)
    out.push({
      flag: `発注者のプロジェクト完了率が${client.finishedRate}%`,
      hard: false,
    })
  return out
}

export type Rank = '◎応募推奨' | '○検討' | '×見送り'

export interface DigestItem {
  listing: Listing
  job: Job
  verdict: Verdict
  risks: { flag: string; hard: boolean }[]
  rank: Rank
  reason: string
  summary: string
  client: ClientInfo | null
}

export interface DigestResult {
  date: string
  keywords: string[]
  sinceHours: number
  totalListed: number
  fresh: number
  items: DigestItem[]
  prefiltered: { listing: Listing; reason: string }[]
}

/** 詳細を読む前に、報酬だけで明らかに条件外の案件をふるい落とす。 */
export function prefilter(l: Listing, profile: Profile): string | null {
  const cats = profile.search?.categoryIds
  if (cats?.length && l.categoryId !== null && !cats.includes(l.categoryId))
    return 'ライティング以外の仕事'
  if (
    /謝礼|ご意見|お聞かせ|協力者|聞かせてください|インタビューさせて|お話を(聞かせ|伺わせ)/.test(
      l.title,
    )
  )
    return 'インタビューを受ける側の募集'
  const w = l.payment.fixed_price_writing_payment
  if (w?.article_price && w.min_articles_length) {
    const rate = w.article_price / w.min_articles_length
    if (rate < profile.minCharRate * 0.7)
      return `文字単価${Math.round(rate * 100) / 100}円`
  }
  const h = l.payment.hourly_payment
  if (
    h &&
    (h.max_hourly_wage ?? h.min_hourly_wage) < profile.minHourlyRate * 0.7
  )
    return `時給${h.max_hourly_wage ?? h.min_hourly_wage}円`
  if (l.payment.task_payment) return 'タスク形式（単価が低い）'
  return null
}

export function summarize(description: string, max = 110): string {
  const body = description
    .split('\n')
    .map(s => s.trim())
    .filter(
      s =>
        s &&
        !/^[=＝\-─━]{3,}$/.test(s) &&
        !/(ご覧いただき|ありがとうございます|はじめまして)/.test(s),
    )
    .join('')
  const s = splitSentences(body).slice(0, 2).join('')
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function rankOf(
  v: Verdict,
  risks: DigestItem['risks'],
  profile: Profile,
): { rank: Rank; reason: string } {
  if (risks.some(r => r.hard))
    return { rank: '×見送り', reason: risks.find(r => r.hard)!.flag }
  if (v.hardStops.length) return { rank: '×見送り', reason: v.hardStops[0]! }
  // 単価が読み取れない案件は、条件を満たすか分からないので「検討」止まりにする
  const priceKnown =
    v.estimatedHourly !== null ||
    v.items.some(
      i => (i.label === '文字単価' || i.label === '時給') && i.points > 0,
    )
  if (v.decision === '応募する' && priceKnown)
    return { rank: '◎応募推奨', reason: '' }
  if (v.decision === '応募する') return { rank: '○検討', reason: '' }
  if (v.score >= profile.applyThreshold - 15)
    return { rank: '○検討', reason: '' }
  const worst = [...v.items].sort((a, b) => a.points - b.points)[0]
  return {
    rank: '×見送り',
    reason:
      worst && worst.points < 0
        ? `${worst.label}（${worst.note}）`
        : `スコア${v.score}点`,
  }
}

export interface DigestDeps {
  fetchText: (url: string) => Promise<string>
  sleep: (ms: number) => Promise<void>
  log?: (msg: string) => void
}

export const defaultDeps: DigestDeps = {
  fetchText: async url => {
    const r = await fetch(url, {
      headers: {
        'user-agent': 'cw-digest/0.1 (personal daily job check)',
        'accept-language': 'ja',
      },
    })
    if (!r.ok) throw new Error(`${r.status} ${url}`)
    return r.text()
  },
  sleep: ms => new Promise(res => setTimeout(res, ms)),
  log: msg => process.stderr.write(`${msg}\n`),
}

export async function runDigest(
  profile: Profile,
  opts: {
    keywords?: string[]
    sinceHours?: number
    maxDetails?: number
    delayMs?: number
  },
  history: Application[] = [],
  deps: DigestDeps = defaultDeps,
  now = new Date(),
): Promise<DigestResult> {
  const keywords = opts.keywords ?? profile.search?.keywords ?? ['取材']
  const sinceHours = opts.sinceHours ?? profile.search?.sinceHours ?? 24
  const maxDetails = opts.maxDetails ?? profile.search?.maxDetails ?? 40
  const delay = opts.delayMs ?? 1500
  const cutoff = now.getTime() - sinceHours * 3600_000

  const byId = new Map<number, Listing>()
  let totalListed = 0
  for (const kw of keywords) {
    const url = `${BASE}/public/jobs/search?order=new&search%5Bkeywords%5D=${encodeURIComponent(kw)}`
    try {
      const list = parseSearchHtml(await deps.fetchText(url))
      totalListed += list.length
      for (const l of list) if (!byId.has(l.id)) byId.set(l.id, l)
      deps.log?.(`検索「${kw}」: ${list.length}件`)
    } catch (e) {
      deps.log?.(`検索「${kw}」に失敗: ${(e as Error).message}`)
    }
    await deps.sleep(delay)
  }

  const today = now.toISOString().slice(0, 10)
  const fresh = [...byId.values()].filter(l => {
    const t = l.releasedAt ? Date.parse(l.releasedAt) : Number.NaN
    const notExpired = !l.expiredOn || l.expiredOn >= today
    return notExpired && (Number.isNaN(t) || t >= cutoff)
  })

  const prefiltered: DigestResult['prefiltered'] = []
  const toDetail: Listing[] = []
  for (const l of fresh) {
    const why = prefilter(l, profile)
    if (why) prefiltered.push({ listing: l, reason: why })
    else toDetail.push(l)
  }

  const items: DigestItem[] = []
  for (const [i, l] of toDetail.entries()) {
    let detail: Detail | null = null
    if (i < maxDetails) {
      try {
        detail = parseDetailHtml(
          await deps.fetchText(`${BASE}/public/jobs/${l.id}`),
        )
      } catch (e) {
        deps.log?.(`詳細 ${l.id} の取得に失敗: ${(e as Error).message}`)
      }
      await deps.sleep(delay)
    }
    const job = buildJob(l, detail, now)
    const verdict = scoreJob(job, profile, history, now)
    const risks = riskFlags(
      `${l.title}\n${detail?.description ?? l.digest}`,
      detail?.client ?? null,
    )
    for (const r of risks.filter(x => !x.hard)) {
      verdict.items.push({ label: '注意', points: -5, note: r.flag })
      verdict.score = Math.max(0, verdict.score - 5)
    }
    const { rank, reason } = rankOf(verdict, risks, profile)
    items.push({
      listing: l,
      job,
      verdict,
      risks,
      rank,
      reason,
      summary: summarize(detail?.description || l.digest),
      client: detail?.client ?? null,
    })
  }
  items.sort((a, b) => b.verdict.score - a.verdict.score)
  return {
    date: today,
    keywords,
    sinceHours,
    totalListed,
    fresh: fresh.length,
    items,
    prefiltered,
  }
}

function line(it: DigestItem): string {
  const j = it.job
  const rate =
    j.charRate !== null
      ? `文字単価${j.charRate}円`
      : j.hourlyRate
        ? `時給${yen(j.hourlyRate)}`
        : '単価不明'
  return `${payLabel(j)}／${rate}／${INTERVIEW_LABEL[j.interview]}／${CONTINUITY_LABEL[j.continuity]}`
}

export function digestMarkdown(r: DigestResult): string {
  const by = (k: Rank) => r.items.filter(i => i.rank === k)
  const good = by('◎応募推奨')
  const maybe = by('○検討')
  const skipped = [
    ...by('×見送り').map(i => i.reason),
    ...r.prefiltered.map(p => p.reason),
  ]
  const reasonCounts = new Map<string, number>()
  for (const s of skipped) {
    const key =
      s
        .replace(/[\d.]+円.*$/, '')
        .replace(/（.*$/, '')
        .trim() || s
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1)
  }
  const out = [
    `# クラウドワークス新着ダイジェスト ${r.date}`,
    '',
    `検索：${r.keywords.join('・')}（過去${r.sinceHours}時間）／ 新着 ${r.fresh}件 → ◎${good.length}件・○${maybe.length}件・×${skipped.length}件`,
    '',
  ]
  const full = (it: DigestItem, n: number) => {
    const c = it.client
    const clientLine = c
      ? `本人確認${c.identityVerified ? '済' : '未'}・評価${c.averageScore?.toFixed(1) ?? '-'}・完了率${c.finishedRate ?? '-'}%`
      : '-'
    const plus = it.verdict.items
      .filter(x => x.points > 0 && x.label !== '基礎点')
      .map(x => `${x.label}（${x.note}）`)
    return [
      `### ${n}. ${it.listing.title}（${it.verdict.score}点）`,
      '',
      `- 条件：${line(it)}`,
      `- 想定時給：${it.verdict.estimatedHourly ? yen(it.verdict.estimatedHourly) : '-'}／応募 ${it.listing.applicants ?? '-'}人（募集${it.listing.hopeNumber ?? '-'}人）／締切 ${it.listing.expiredOn ?? '-'}`,
      `- 発注者：${it.listing.client.username}（${clientLine}）`,
      `- 内容：${it.summary}`,
      plus.length ? `- 評価点：${plus.join('、')}` : '',
      it.risks.length
        ? `- ⚠ 注意：${it.risks.map(x => x.flag).join('、')}`
        : '',
      `- ${it.job.url}`,
      '',
    ].filter(Boolean)
  }
  out.push('## ◎ 応募推奨', '')
  if (good.length) good.forEach((it, i) => out.push(...full(it, i + 1)))
  else out.push('該当なし', '')
  out.push('## ○ 検討', '')
  if (maybe.length) maybe.forEach((it, i) => out.push(...full(it, i + 1)))
  else out.push('該当なし', '')
  out.push('## × 見送り（理由別）', '')
  out.push(
    reasonCounts.size
      ? mdTable(
          ['理由', '件数'],
          [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]),
        )
      : 'なし',
    '',
  )
  return out.join('\n')
}
