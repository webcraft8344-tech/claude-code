import { existsSync } from 'node:fs'
import {
  listDirs,
  p,
  readJson,
  readTextIfExists,
  writeJson,
  writeText,
} from '../util/store.js'
import { mdTable, toISODate, yen } from '../util/text.js'
import { CONTINUITY_LABEL, INTERVIEW_LABEL, type Job } from './extract.js'
import type { Verdict } from './score.js'

export function jobDir(id: string): string {
  return p('jobs', id)
}

export function saveJob(
  job: Job,
  verdict: Verdict,
  source: string,
  today = new Date(),
): string {
  const dir = jobDir(job.id)
  writeText(`${dir}/source.txt`, source)
  writeJson(`${dir}/job.json`, {
    ...job,
    rawText: undefined,
    verdict,
    savedAt: toISODate(today),
  })
  writeText(`${dir}/memo.md`, judgementMemo(job, verdict, today))
  return dir
}

export function loadJob(id: string): Job & { verdict?: Verdict } {
  const path = `${jobDir(id)}/job.json`
  if (!existsSync(path))
    throw new Error(`案件 ${id} が見つかりません（先に cw scout を実行）`)
  const j = readJson<Job & { verdict?: Verdict }>(path, {} as Job)
  j.rawText = readTextIfExists(`${jobDir(id)}/source.txt`) ?? ''
  return j
}

export function listJobs(): (Job & { verdict?: Verdict; savedAt?: string })[] {
  return listDirs(p('jobs'))
    .map(id =>
      readJson<(Job & { verdict?: Verdict; savedAt?: string }) | null>(
        `${jobDir(id)}/job.json`,
        null,
      ),
    )
    .filter(
      (j): j is Job & { verdict?: Verdict; savedAt?: string } => j !== null,
    )
}

export function payLabel(job: Job): string {
  if (job.payType === 'hourly' && job.hourlyRate)
    return `時給${yen(job.hourlyRate)}`
  if (job.budgetMin === null) return '不明'
  if (job.budgetMin === job.budgetMax) return yen(job.budgetMin)
  return `${yen(job.budgetMin)}〜${yen(job.budgetMax ?? job.budgetMin)}`
}

export function jobsTable(jobs: (Job & { verdict?: Verdict })[]): string {
  return mdTable(
    [
      '判定',
      'スコア',
      '案件ID',
      '案件',
      '報酬',
      '文字単価',
      '文字数',
      '納期',
      '取材',
      '継続',
    ],
    jobs.map(j => [
      j.verdict?.decision ?? '-',
      j.verdict?.score ?? '-',
      j.id,
      j.title.slice(0, 28),
      payLabel(j),
      j.charRate !== null
        ? `${j.charRate}${j.charRateEstimated ? '*' : ''}`
        : '-',
      j.charCount ?? '-',
      j.deadline ?? '-',
      INTERVIEW_LABEL[j.interview],
      CONTINUITY_LABEL[j.continuity],
    ]),
  )
}

export function judgementMemo(
  job: Job,
  v: Verdict,
  today = new Date(),
): string {
  const lines = [
    `# 判定メモ: ${job.title}`,
    '',
    `- 案件ID: ${job.id}`,
    `- URL: ${job.url ?? '-'}`,
    `- クライアント: ${job.client ?? '-'}`,
    `- 判定日: ${toISODate(today)}`,
    `- **判定: ${v.decision}（${v.score}点）**`,
    '',
    '## 抽出情報',
    '',
    mdTable(
      ['項目', '値'],
      [
        ['報酬', payLabel(job)],
        [
          '文字単価',
          job.charRate !== null
            ? `${job.charRate}円/字${job.charRateEstimated ? '（推定）' : ''}`
            : '不明',
        ],
        ['文字数', job.charCount ?? '不明'],
        ['想定時給', v.estimatedHourly ? yen(v.estimatedHourly) : '-'],
        ['納期', job.deadline ?? '不明'],
        ['応募期限', job.applyBy ?? '不明'],
        ['取材', INTERVIEW_LABEL[job.interview]],
        ['継続性', CONTINUITY_LABEL[job.continuity]],
        ['ジャンル', job.genres.join('、') || '-'],
        ['求めるポイント', job.requirements.join('、') || '-'],
      ],
    ),
    '',
    '## スコア内訳',
    '',
    mdTable(
      ['項目', '点', 'メモ'],
      v.items.map(i => [
        i.label,
        i.points > 0 ? `+${i.points}` : i.points,
        i.note,
      ]),
    ),
  ]
  if (v.hardStops.length) {
    lines.push(
      '',
      '## 見送り理由（足切り）',
      '',
      ...v.hardStops.map(s => `- ${s}`),
    )
  }
  if (v.duplicates.length) {
    lines.push(
      '',
      '## 過去応募との重複',
      '',
      ...v.duplicates.map(
        d =>
          `- [${d.kind}] ${d.date} ${d.title}（${d.jobId} / ${d.status}）: ${d.note}`,
      ),
    )
  }
  lines.push('', '## 自分用メモ', '', '- ', '')
  return lines.join('\n')
}
