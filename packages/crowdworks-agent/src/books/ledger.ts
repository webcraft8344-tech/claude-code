import type { FeeTier, Profile } from '../profile.js'
import { appendJsonl, p, readJsonl, writeJsonl } from '../util/store.js'
import { daysBetween, mdTable, toISODate, yen } from '../util/text.js'

/**
 * システム利用料を段階制で計算する（契約金額・税込）。
 * 既定値: 10万円以下の部分 20% / 10万超〜20万以下の部分 10% / 20万超の部分 5%。
 * 料率はクラウドワークスの改定に合わせて profile.json の fees.tiers で変更する。
 */
export function systemFee(amount: number, tiers: FeeTier[]): number {
  let fee = 0
  let lower = 0
  for (const t of tiers) {
    const upper = t.upTo ?? Number.POSITIVE_INFINITY
    if (amount <= lower) break
    fee += (Math.min(amount, upper) - lower) * t.rate
    lower = upper
  }
  return Math.floor(fee)
}

export type EntryStatus = 'contracted' | 'delivered' | 'accepted' | 'paid'

export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  contracted: '契約済',
  delivered: '納品済',
  accepted: '検収済（支払予定）',
  paid: '入金済',
}

export interface LedgerEntry {
  id: string
  jobId: string
  client: string
  title: string
  /** 契約金額（税込） */
  amount: number
  fee: number
  /** 手取り（振込手数料控除前） */
  net: number
  contractDate: string
  dueDate?: string
  deliveredDate?: string
  acceptedDate?: string
  /** 支払予定日（検収後の出金可能日など） */
  payDate?: string
  paidDate?: string
  status: EntryStatus
}

export interface WorkLog {
  date: string
  jobId: string
  hours: number
  task: string
}

export interface Expense {
  date: string
  category: string
  amount: number
  memo: string
}

export interface Payout {
  date: string
  amount: number
  transferFee: number
}

const F = {
  ledger: () => p('ledger.jsonl'),
  work: () => p('worklog.jsonl'),
  expenses: () => p('expenses.jsonl'),
  payouts: () => p('payouts.jsonl'),
}

export const loadLedger = () => readJsonl<LedgerEntry>(F.ledger())
export const loadWork = () => readJsonl<WorkLog>(F.work())
export const loadExpenses = () => readJsonl<Expense>(F.expenses())
export const loadPayouts = () => readJsonl<Payout>(F.payouts())

export function addLedger(
  input: {
    jobId: string
    client: string
    title: string
    amount: number
    dueDate?: string
    contractDate?: string
  },
  profile: Profile,
  today = new Date(),
): LedgerEntry {
  const fee = systemFee(input.amount, profile.fees.tiers)
  const entry: LedgerEntry = {
    id: `${input.jobId}-${loadLedger().length + 1}`,
    jobId: input.jobId,
    client: input.client,
    title: input.title,
    amount: input.amount,
    fee,
    net: input.amount - fee,
    contractDate: input.contractDate ?? toISODate(today),
    dueDate: input.dueDate,
    status: 'contracted',
  }
  appendJsonl(F.ledger(), entry)
  return entry
}

/** 状態を進める（納品→検収→入金）。 */
export function updateLedgerStatus(
  jobId: string,
  status: EntryStatus,
  date: string,
  payDate?: string,
): LedgerEntry {
  const rows = loadLedger()
  const row = rows.findLast(r => r.jobId === jobId)
  if (!row) throw new Error(`売上台帳に案件 ${jobId} がありません`)
  row.status = status
  if (status === 'delivered') row.deliveredDate = date
  if (status === 'accepted') {
    row.acceptedDate = date
    if (payDate) row.payDate = payDate
  }
  if (status === 'paid') row.paidDate = date
  writeJsonl(F.ledger(), rows)
  return row
}

export function logWork(w: WorkLog): void {
  appendJsonl(F.work(), w)
}
export function addExpense(e: Expense): void {
  appendJsonl(F.expenses(), e)
}
export function addPayout(
  amount: number,
  profile: Profile,
  date: string,
): Payout {
  const po = { date, amount, transferFee: profile.fees.transferFee }
  appendJsonl(F.payouts(), po)
  return po
}

/** 売上計上日: 検収日 > 納品日 > 契約日（雑所得・事業所得とも役務完了時点で計上するのが原則） */
export function revenueDate(e: LedgerEntry): string | null {
  return e.acceptedDate ?? e.deliveredDate ?? null
}

export interface MonthlyReport {
  month: string
  entries: LedgerEntry[]
  revenue: number
  fees: number
  net: number
  hours: number
  hourly: number | null
  byJob: {
    jobId: string
    title: string
    net: number
    hours: number
    hourly: number | null
  }[]
}

export function monthlyReport(
  month: string,
  ledger: LedgerEntry[],
  work: WorkLog[],
): MonthlyReport {
  const entries = ledger.filter(e => revenueDate(e)?.startsWith(month))
  const w = work.filter(x => x.date.startsWith(month))
  const revenue = entries.reduce((s, e) => s + e.amount, 0)
  const fees = entries.reduce((s, e) => s + e.fee, 0)
  const net = revenue - fees
  const hours = Math.round(w.reduce((s, x) => s + x.hours, 0) * 10) / 10
  const jobIds = [
    ...new Set([...entries.map(e => e.jobId), ...w.map(x => x.jobId)]),
  ]
  const allWork = (id: string) =>
    work.filter(x => x.jobId === id).reduce((s, x) => s + x.hours, 0)
  return {
    month,
    entries,
    revenue,
    fees,
    net,
    hours,
    hourly: hours ? Math.round(net / hours) : null,
    byJob: jobIds.map(id => {
      const e = ledger.find(x => x.jobId === id)
      // 案件の時給は案件全体の稼働（月をまたぐ場合も）で計算
      const h = allWork(id)
      return {
        jobId: id,
        title: e?.title ?? '-',
        net: e?.net ?? 0,
        hours: h,
        hourly: h && e ? Math.round(e.net / h) : null,
      }
    }),
  }
}

export function monthlyMarkdown(r: MonthlyReport): string {
  return [
    `# 月次レポート ${r.month}`,
    '',
    mdTable(
      ['売上（税込）', '手数料', '手取り', '稼働時間', '時給換算'],
      [
        [
          yen(r.revenue),
          yen(r.fees),
          yen(r.net),
          `${r.hours}h`,
          r.hourly ? yen(r.hourly) : '-',
        ],
      ],
    ),
    '',
    '## 案件別',
    '',
    mdTable(
      ['案件ID', '案件', '手取り', '稼働(累計)', '時給'],
      r.byJob.map(j => [
        j.jobId,
        j.title.slice(0, 24),
        yen(j.net),
        `${j.hours}h`,
        j.hourly ? yen(j.hourly) : '-',
      ]),
    ),
    '',
  ].join('\n')
}

export interface TaxSummary {
  year: string
  revenue: number
  fees: number
  transferFees: number
  expenses: number
  byCategory: Record<string, number>
  income: number
  unpaidAtYearEnd: number
  notes: string[]
}

/** 確定申告用の年間集計（副業・雑所得/事業所得の収支）。 */
export function taxSummary(
  year: string,
  ledger: LedgerEntry[],
  expenses: Expense[],
  payouts: Payout[],
): TaxSummary {
  const entries = ledger.filter(e => revenueDate(e)?.startsWith(year))
  const revenue = entries.reduce((s, e) => s + e.amount, 0)
  const fees = entries.reduce((s, e) => s + e.fee, 0)
  const transferFees = payouts
    .filter(x => x.date.startsWith(year))
    .reduce((s, x) => s + x.transferFee, 0)
  const ex = expenses.filter(e => e.date.startsWith(year))
  const byCategory: Record<string, number> = { 支払手数料: fees + transferFees }
  for (const e of ex)
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount
  const expTotal = ex.reduce((s, e) => s + e.amount, 0)
  const income = revenue - fees - transferFees - expTotal
  const unpaidAtYearEnd = entries
    .filter(e => !e.paidDate || e.paidDate > `${year}-12-31`)
    .reduce((s, e) => s + e.amount, 0)
  const notes = [
    '収入は「検収日（なければ納品日）」基準で計上しています（入金日ではありません）。',
    unpaidAtYearEnd
      ? `年末時点の未入金 ${yen(unpaidAtYearEnd)} も今年の収入に含まれます（売掛金）。`
      : '',
    income > 200000
      ? '給与所得者で副業所得が20万円を超えるため、確定申告が必要です。'
      : '副業所得が20万円以下でも、住民税の申告は別途必要です（確定申告が不要な場合）。',
    '源泉徴収された報酬がある場合は、支払調書・取引明細で源泉税額を確認してください。',
    '最終判断は税務署・税理士にご確認ください。',
  ].filter(Boolean)
  return {
    year,
    revenue,
    fees,
    transferFees,
    expenses: expTotal,
    byCategory,
    income,
    unpaidAtYearEnd,
    notes,
  }
}

export function taxMarkdown(t: TaxSummary): string {
  return [
    `# 確定申告用 収支集計 ${t.year}年`,
    '',
    mdTable(
      ['項目', '金額'],
      [
        ['総収入金額', yen(t.revenue)],
        ['システム利用料', yen(t.fees)],
        ['振込手数料', yen(t.transferFees)],
        ['その他経費', yen(t.expenses)],
        ['**所得金額**', `**${yen(t.income)}**`],
      ],
    ),
    '',
    '## 経費内訳',
    '',
    mdTable(
      ['科目', '金額'],
      Object.entries(t.byCategory).map(([k, v]) => [k, yen(v)]),
    ),
    '',
    '## 注意',
    '',
    ...t.notes.map(n => `- ${n}`),
    '',
  ].join('\n')
}

export interface PendingItem {
  jobId: string
  title: string
  status: string
  issue: string
  days: number
}

/** 請求・支払い状況の未処理チェック。 */
export function pendingCheck(
  ledger: LedgerEntry[],
  today = new Date(),
  acceptWaitDays = 7,
): PendingItem[] {
  const t = toISODate(today)
  const out: PendingItem[] = []
  for (const e of ledger) {
    const base = {
      jobId: e.jobId,
      title: e.title,
      status: ENTRY_STATUS_LABEL[e.status],
    }
    if (e.status === 'contracted' && e.dueDate) {
      const d = daysBetween(t, e.dueDate)
      if (d < 0) out.push({ ...base, issue: '納期超過（未納品）', days: -d })
      else if (d <= 2)
        out.push({ ...base, issue: `納期まで残り${d}日`, days: d })
    }
    if (e.status === 'delivered' && e.deliveredDate) {
      const d = daysBetween(e.deliveredDate, t)
      if (d >= acceptWaitDays)
        out.push({
          ...base,
          issue: `納品から${d}日経過・検収待ち（検収依頼を送る）`,
          days: d,
        })
    }
    if (e.status === 'accepted') {
      const due = e.payDate
      if (due && daysBetween(due, t) > 0)
        out.push({
          ...base,
          issue: `支払予定日 ${due} を過ぎても未入金`,
          days: daysBetween(due, t),
        })
      if (!due) out.push({ ...base, issue: '支払予定日が未登録', days: 0 })
    }
  }
  return out.sort((a, b) => b.days - a.days)
}

export function ledgerTable(rows: LedgerEntry[]): string {
  return mdTable(
    [
      '案件ID',
      'クライアント',
      '案件',
      '契約額',
      '手数料',
      '手取り',
      '状態',
      '納品',
      '入金',
    ],
    rows.map(r => [
      r.jobId,
      r.client,
      r.title.slice(0, 20),
      yen(r.amount),
      yen(r.fee),
      yen(r.net),
      ENTRY_STATUS_LABEL[r.status],
      r.deliveredDate ?? '-',
      r.paidDate ?? '-',
    ]),
  )
}
