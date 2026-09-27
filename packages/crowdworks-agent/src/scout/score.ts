import type { Profile } from '../profile.js'
import { daysBetween, jaccard, bigrams, toISODate } from '../util/text.js'
import type { Application } from '../propose/applications.js'
import { type Job, INTERVIEW_LABEL } from './extract.js'

export interface ScoreItem {
  label: string
  points: number
  note: string
}

export interface Duplicate {
  kind: 'client' | 'genre' | 'title'
  jobId: string
  title: string
  date: string
  status: string
  note: string
}

export interface Verdict {
  score: number
  decision: '応募する' | '見送る'
  hardStops: string[]
  items: ScoreItem[]
  duplicates: Duplicate[]
  /** 取材・執筆込みの想定時給（円/時） */
  estimatedHourly: number | null
}

/** 自分の条件でスコアリングし、応募可否を判定する。 */
export function scoreJob(
  job: Job,
  profile: Profile,
  history: Application[] = [],
  today = new Date(),
): Verdict {
  const items: ScoreItem[] = []
  const hardStops: string[] = []
  const add = (label: string, points: number, note: string) =>
    items.push({ label, points, note })

  add('基礎点', 50, '')

  // 文字単価
  if (job.charRate !== null) {
    const r = job.charRate
    const est = job.charRateEstimated ? '（報酬÷文字数で推定）' : ''
    if (r < profile.minCharRate * 0.7) {
      hardStops.push(
        `文字単価 ${r}円 が最低条件 ${profile.minCharRate}円 の7割未満`,
      )
      add('文字単価', -40, `${r}円/字${est}`)
    } else if (r < profile.minCharRate) {
      add('文字単価', -20, `${r}円/字${est} < 最低 ${profile.minCharRate}円`)
    } else if (r >= profile.minCharRate * 1.5) {
      add('文字単価', 25, `${r}円/字${est}（条件の1.5倍以上）`)
    } else {
      add('文字単価', 15, `${r}円/字${est}（条件クリア）`)
    }
  } else if (job.hourlyRate !== null) {
    const ok = job.hourlyRate >= profile.minHourlyRate
    add('時給', ok ? 15 : -20, `${job.hourlyRate}円/時`)
  } else {
    add('文字単価', -5, '報酬または文字数が不明（要確認）')
  }

  // 想定時給（取材工数込み）
  let estimatedHourly: number | null = null
  const pay = job.budgetMin ?? job.budgetMax
  if (pay !== null && job.charCount) {
    const hasInterview = !['none', 'unknown'].includes(job.interview)
    const hours =
      job.charCount / profile.charsPerHour +
      (hasInterview ? profile.interviewHours : 0)
    estimatedHourly = Math.round(pay / hours)
    if (estimatedHourly < profile.minHourlyRate) {
      add('想定時給', -10, `約${estimatedHourly}円/時（取材込み）`)
    } else {
      add('想定時給', 5, `約${estimatedHourly}円/時（取材込み）`)
    }
  }

  // 取材形式
  const iv = job.interview
  if (iv === 'online' || iv === 'onsite' || iv === 'phone' || iv === 'none') {
    if (profile.interviewFormats.includes(iv) || iv === 'none') {
      add('取材形式', 10, INTERVIEW_LABEL[iv])
    } else {
      hardStops.push(`${INTERVIEW_LABEL[iv]}には対応していない`)
      add('取材形式', -30, INTERVIEW_LABEL[iv])
    }
  } else if (iv === 'required') {
    add('取材形式', 0, '取材ありだが形式不明（質問で確認）')
  }

  // ジャンル
  const ng = job.genres.filter(g => profile.ngGenres.includes(g))
  if (ng.length) {
    hardStops.push(`NGジャンル: ${ng.join('、')}`)
    add('ジャンル', -50, ng.join('、'))
  }
  const pref = job.genres.filter(g => profile.preferredGenres.includes(g))
  if (pref.length)
    add('ジャンル', Math.min(25, pref.length * 12), `得意: ${pref.join('、')}`)

  // 継続性
  if (job.continuity === 'continuous') add('継続性', 10, '継続案件')

  // 納期
  if (job.deadline) {
    const d = daysBetween(toISODate(today), job.deadline)
    if (d < 0) hardStops.push('納期が過去日付')
    else if (d < 5) add('納期', -10, `残り${d}日と短い`)
  }
  if (job.applyBy && daysBetween(toISODate(today), job.applyBy) < 0) {
    hardStops.push('応募期限切れ')
  }

  // 強みとの一致
  const strengthKeys = new Set(profile.strengths.map(s => s.key))
  const matched = job.requirements.filter(r => strengthKeys.has(r))
  if (matched.length)
    add('強みの一致', Math.min(15, matched.length * 5), `${matched.length}項目`)

  const duplicates = findDuplicates(job, history, today)
  if (duplicates.some(d => d.kind === 'title')) {
    add('重複', -15, '過去に類似案件へ応募済み（再掲載の可能性）')
  }
  if (duplicates.some(d => d.kind === 'client' && d.status === 'won')) {
    add('重複', 10, '過去に受注実績のあるクライアント')
  }
  if (duplicates.some(d => d.kind === 'client' && d.status === 'lost')) {
    add('重複', -5, '過去に不採用だったクライアント（提案の切り口を変える）')
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      items.reduce((s, i) => s + i.points, 0),
    ),
  )
  const decision =
    hardStops.length === 0 && score >= profile.applyThreshold
      ? '応募する'
      : '見送る'
  return { score, decision, hardStops, items, duplicates, estimatedHourly }
}

/** 過去の応募とクライアント・ジャンル・タイトルの重複を調べる。 */
export function findDuplicates(
  job: Job,
  history: Application[],
  today = new Date(),
): Duplicate[] {
  const out: Duplicate[] = []
  const tb = bigrams(job.title)
  for (const a of history) {
    if (a.jobId === job.id) continue
    const base = {
      jobId: a.jobId,
      title: a.title,
      date: a.date,
      status: a.status,
    }
    if (
      job.client &&
      a.client &&
      normalizeClient(a.client) === normalizeClient(job.client)
    ) {
      out.push({
        ...base,
        kind: 'client',
        note: `同一クライアント（${a.client}）`,
      })
    }
    const sim = jaccard(tb, bigrams(a.title))
    if (sim >= 0.6) {
      out.push({
        ...base,
        kind: 'title',
        note: `タイトル類似度 ${Math.round(sim * 100)}%`,
      })
    }
    const g = job.genres.filter(x => (a.genres ?? []).includes(x))
    if (g.length && daysBetween(a.date, toISODate(today)) <= 30) {
      out.push({
        ...base,
        kind: 'genre',
        note: `直近30日に同ジャンル（${g.join('、')}）へ応募`,
      })
    }
  }
  return out
}

function normalizeClient(s: string): string {
  return s
    .replace(/(株式会社|有限会社|合同会社|\(株\)|（株）|\s)/g, '')
    .toLowerCase()
}
