import { appendJsonl, p, readJsonl, writeJsonl } from '../util/store.js'
import { mdTable, toISODate, yen } from '../util/text.js'

export type ApplicationStatus =
  | 'applied'
  | 'won'
  | 'lost'
  | 'withdrawn'
  | 'no_reply'

export interface Application {
  date: string
  jobId: string
  title: string
  client: string | null
  genres: string[]
  /** 提示額（円） */
  bid: number | null
  /** 募集時の予算上限（提示額の比較用） */
  budget: number | null
  status: ApplicationStatus
  resultDate?: string
  /** 提案文の文字数・使用バリアント */
  proposalChars?: number
  variant?: 'short' | 'long'
  strengthsUsed?: string[]
  portfolioIds?: string[]
  note?: string
}

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: '応募中',
  won: '受注',
  lost: '不採用',
  withdrawn: '辞退',
  no_reply: '返信なし',
}

const file = () => p('applications.jsonl')

export function loadApplications(): Application[] {
  return readJsonl<Application>(file())
}

export function appendApplication(a: Application): void {
  appendJsonl(file(), a)
}

/** 結果（受注/不採用など）を更新する。 */
export function updateApplicationStatus(
  jobId: string,
  status: ApplicationStatus,
  note?: string,
  today = new Date(),
): Application {
  const rows = loadApplications()
  const idx = rows.findLastIndex(r => r.jobId === jobId)
  if (idx < 0) throw new Error(`応募履歴に案件 ${jobId} がありません`)
  const row = rows[idx]!
  row.status = status
  row.resultDate = toISODate(today)
  if (note) row.note = note
  writeJsonl(file(), rows)
  return row
}

export function applicationsTable(rows: Application[]): string {
  return mdTable(
    ['日付', '案件ID', '案件', 'クライアント', '提示額', '結果'],
    rows.map(r => [
      r.date,
      r.jobId,
      r.title.slice(0, 30),
      r.client ?? '-',
      r.bid !== null ? yen(r.bid) : '-',
      STATUS_LABEL[r.status],
    ]),
  )
}

export function applicationsCsv(rows: Application[]): string {
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const header = [
    '日付',
    '案件ID',
    '案件',
    'クライアント',
    'ジャンル',
    '提示額',
    '結果',
    '結果日',
    'メモ',
  ]
  return [
    header.map(q).join(','),
    ...rows.map(r =>
      [
        r.date,
        r.jobId,
        r.title,
        r.client,
        r.genres.join('/'),
        r.bid,
        STATUS_LABEL[r.status],
        r.resultDate,
        r.note,
      ]
        .map(q)
        .join(','),
    ),
  ].join('\n')
}
