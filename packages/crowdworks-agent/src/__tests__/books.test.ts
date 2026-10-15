import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type LedgerEntry,
  monthlyReport,
  pendingCheck,
  systemFee,
  taxSummary,
} from '../books/ledger'
import { analyzeWins } from '../knowledge/analyze'
import {
  harvestTemplates,
  portfolioFromArticle,
  preferenceHints,
} from '../knowledge/library'
import { DEFAULT_PROFILE } from '../profile'
import type { Application } from '../propose/applications'
import {
  appendApplication,
  loadApplications,
  updateApplicationStatus,
} from '../propose/applications'

const tiers = DEFAULT_PROFILE.fees.tiers

describe('systemFee', () => {
  test('applies tiered rates to each portion', () => {
    expect(systemFee(10000, tiers)).toBe(2000)
    expect(systemFee(100000, tiers)).toBe(20000)
    expect(systemFee(150000, tiers)).toBe(25000)
    expect(systemFee(300000, tiers)).toBe(35000)
  })
})

const entry = (o: Partial<LedgerEntry>): LedgerEntry => ({
  id: 'x',
  jobId: 'j1',
  client: 'C',
  title: 'T',
  amount: 20000,
  fee: 4000,
  net: 16000,
  contractDate: '2026-08-20',
  status: 'contracted',
  ...o,
})

describe('reports', () => {
  test('monthly report uses accepted/delivered date and hourly conversion', () => {
    const r = monthlyReport(
      '2026-09',
      [
        entry({
          status: 'accepted',
          deliveredDate: '2026-08-31',
          acceptedDate: '2026-09-02',
        }),
      ],
      [
        { date: '2026-08-25', jobId: 'j1', hours: 4, task: '取材' },
        { date: '2026-09-01', jobId: 'j1', hours: 4, task: '修正' },
      ],
    )
    expect(r.revenue).toBe(20000)
    expect(r.hours).toBe(4)
    expect(r.hourly).toBe(4000)
    expect(r.byJob[0]!.hourly).toBe(2000) // 案件全体 8h
  })

  test('tax summary subtracts fees, transfer fees and expenses', () => {
    const t = taxSummary(
      '2026',
      [
        entry({
          status: 'paid',
          deliveredDate: '2026-03-01',
          paidDate: '2026-03-20',
        }),
      ],
      [{ date: '2026-04-01', category: '通信費', amount: 1000, memo: '' }],
      [{ date: '2026-03-21', amount: 16000, transferFee: 500 }],
    )
    expect(t.income).toBe(20000 - 4000 - 500 - 1000)
    expect(t.byCategory['支払手数料']).toBe(4500)
  })

  test('pending check flags overdue delivery, acceptance wait and unpaid', () => {
    const today = new Date(2026, 8, 27)
    const items = pendingCheck(
      [
        entry({ jobId: 'a', dueDate: '2026-09-20' }),
        entry({ jobId: 'b', status: 'delivered', deliveredDate: '2026-09-10' }),
        entry({
          jobId: 'c',
          status: 'accepted',
          acceptedDate: '2026-09-11',
          payDate: '2026-09-25',
        }),
        entry({ jobId: 'd', status: 'paid', paidDate: '2026-09-01' }),
      ],
      today,
    )
    expect(items.map(i => i.jobId).sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('knowledge', () => {
  test('analyzeWins computes lift per feature', () => {
    const base = { title: 't', client: null, bid: 10000, budget: 10000 }
    const apps: Application[] = [
      {
        ...base,
        date: '2026-09-01',
        jobId: '1',
        genres: ['採用'],
        status: 'won',
        proposalChars: 450,
      },
      {
        ...base,
        date: '2026-09-02',
        jobId: '2',
        genres: ['採用'],
        status: 'won',
        proposalChars: 480,
      },
      {
        ...base,
        date: '2026-09-03',
        jobId: '3',
        genres: ['IT'],
        status: 'lost',
        proposalChars: 900,
      },
      {
        ...base,
        date: '2026-09-04',
        jobId: '4',
        genres: ['IT'],
        status: 'lost',
        proposalChars: 950,
      },
      {
        ...base,
        date: '2026-09-05',
        jobId: '5',
        genres: ['IT'],
        status: 'applied',
      },
    ]
    const r = analyzeWins(apps)
    expect(r.decided).toBe(4)
    expect(r.overall).toBe(0.5)
    const saiyo = r.stats.find(
      s => s.feature === 'ジャンル' && s.value === '採用',
    )!
    expect(saiyo.lift).toBe(2)
    expect(
      r.stats.find(s => s.feature === '提案文の長さ' && s.value === '800字超')!
        .rate,
    ).toBe(0)
  })

  test('portfolioFromArticle summarizes lead and detects genres', () => {
    const item = portfolioFromArticle(
      '# T\n採用担当の田中さんに聞きました。社員インタビューです。\n## 入社のきっかけ\n本文',
      {
        title: 'T',
        url: 'https://example.com',
      },
    )
    expect(item.genres).toContain('採用')
    expect(item.summary).toContain('入社のきっかけ')
  })

  test('harvestTemplates collects questions, headings and repeated phrases', () => {
    const h = harvestTemplates([
      '## 入社の決め手\n聞き手：入社の決め手は何ですか？\n本当にありがたいことに、仲間に恵まれました。',
      '## 今後の目標\n聞き手：今後の目標は？\n本当にありがたいことに、挑戦できています。',
    ])
    expect(h.headings).toEqual(['入社の決め手', '今後の目標'])
    expect(h.questions).toContain('入社の決め手は何ですか？')
    expect(h.phrases[0]!.phrase).toBe('本当にありがたいことに')
  })

  test('preferenceHints picks instruction sentences', () => {
    expect(
      preferenceHints('全体的に良いです。見出しは疑問形に統一してください。'),
    ).toEqual(['見出しは疑問形に統一してください。'])
  })
})

describe('applications log', () => {
  let dir: string
  const prev = process.env.CW_HOME
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'cw-test-'))
    process.env.CW_HOME = dir
  })
  afterAll(() => {
    if (prev === undefined) delete process.env.CW_HOME
    else process.env.CW_HOME = prev
    rmSync(dir, { recursive: true, force: true })
  })

  test('appends and updates status', () => {
    appendApplication({
      date: '2026-09-27',
      jobId: 'j9',
      title: 't',
      client: null,
      genres: [],
      bid: 1,
      budget: 1,
      status: 'applied',
    })
    updateApplicationStatus('j9', 'won', 'メモ', new Date(2026, 8, 30))
    const rows = loadApplications()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('won')
    expect(rows[0]!.resultDate).toBe('2026-09-30')
  })
})
