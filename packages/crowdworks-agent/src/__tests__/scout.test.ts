import { describe, expect, test } from 'bun:test'
import { DEFAULT_PROFILE } from '../profile'
import type { Application } from '../propose/applications'
import { extractJob } from '../scout/extract'
import { findDuplicates, scoreJob } from '../scout/score'

const TODAY = new Date(2026, 8, 27)

const JOB_TEXT = `【社員インタビュー】採用サイト掲載記事の執筆（オンライン取材あり）
https://crowdworks.jp/public/jobs/12345678
クライアント：株式会社サンプルテック
固定報酬制 15,000円 〜 20,000円
文字数：3,000文字程度
納期：2026年10月20日
応募期限：10月5日
Zoomでのオンライン取材（60分）をお願いします。継続して月2本程度ご依頼予定です。
取材経験のある方、構成力のある方、納期厳守できる方を歓迎します。`

describe('extractJob', () => {
  test('extracts id, pay, char count, dates, interview and continuity', () => {
    const j = extractJob(JOB_TEXT, TODAY)
    expect(j.id).toBe('12345678')
    expect(j.client).toBe('株式会社サンプルテック')
    expect(j.payType).toBe('fixed')
    expect(j.budgetMin).toBe(15000)
    expect(j.budgetMax).toBe(20000)
    expect(j.charCount).toBe(3000)
    expect(j.charRate).toBe(5)
    expect(j.charRateEstimated).toBe(true)
    expect(j.deadline).toBe('2026-10-20')
    expect(j.applyBy).toBe('2026-10-05')
    expect(j.interview).toBe('online')
    expect(j.continuity).toBe('continuous')
    expect(j.genres).toContain('採用')
    expect(j.requirements).toEqual(
      expect.arrayContaining(['interview', 'structure', 'deadline']),
    )
  })

  test('parses explicit per-character rate and no-interview jobs', () => {
    const j = extractJob('SEO記事 文字単価1.2円 5000文字 取材なし 単発', TODAY)
    expect(j.payType).toBe('per_char')
    expect(j.charRate).toBe(1.2)
    expect(j.charRateEstimated).toBe(false)
    expect(j.budgetMin).toBe(6000)
    expect(j.interview).toBe('none')
    expect(j.continuity).toBe('single')
  })

  test('parses saved HTML (og:title, canonical, full-width digits)', () => {
    const html = `<html><head><meta property="og:title" content="採用記事ライター募集 | クラウドワークス">
<link rel="canonical" href="https://crowdworks.jp/public/jobs/999001"></head>
<body><div>固定報酬制</div><div>１０，０００円 〜 ２０，０００円</div><p>文字数：4000字</p><p>対面取材あり</p></body></html>`
    const j = extractJob(html, TODAY)
    expect(j.id).toBe('999001')
    expect(j.title).toBe('採用記事ライター募集')
    expect(j.budgetMax).toBe(20000)
    expect(j.charCount).toBe(4000)
    expect(j.interview).toBe('onsite')
  })

  test('parses hourly jobs', () => {
    const j = extractJob('時間単価制 1,500円 〜 2,000円 文字起こし', TODAY)
    expect(j.payType).toBe('hourly')
    expect(j.hourlyRate).toBe(1500)
  })

  test('falls back to a stable local id', () => {
    const a = extractJob('IDのない案件\n報酬 5000円', TODAY)
    const b = extractJob('IDのない案件\n報酬 5000円', TODAY)
    expect(a.id).toMatch(/^local-/)
    expect(a.id).toBe(b.id)
  })
})

describe('scoreJob', () => {
  test('recommends applying to a well-paid matching job', () => {
    const v = scoreJob(extractJob(JOB_TEXT, TODAY), DEFAULT_PROFILE, [], TODAY)
    expect(v.decision).toBe('応募する')
    expect(v.hardStops).toEqual([])
    expect(v.estimatedHourly).toBeGreaterThan(DEFAULT_PROFILE.minHourlyRate)
  })

  test('hard-stops low char rate and unsupported interview formats', () => {
    const v = scoreJob(
      extractJob('記事作成 文字単価0.5円 3000文字 対面取材', TODAY),
      DEFAULT_PROFILE,
      [],
      TODAY,
    )
    expect(v.decision).toBe('見送る')
    expect(v.hardStops.length).toBe(2)
  })

  test('hard-stops NG genres', () => {
    const v = scoreJob(
      extractJob('ギャンブル系記事 文字単価3円 3000文字', TODAY),
      DEFAULT_PROFILE,
      [],
      TODAY,
    )
    expect(v.decision).toBe('見送る')
    expect(v.hardStops.join()).toContain('NGジャンル')
  })
})

describe('findDuplicates', () => {
  test('detects same client, similar title and same genre', () => {
    const job = extractJob(JOB_TEXT, TODAY)
    const history: Application[] = [
      {
        date: '2026-09-20',
        jobId: '111',
        title: '【社員インタビュー】採用サイト掲載記事の執筆',
        client: 'サンプルテック株式会社',
        genres: ['採用'],
        bid: 10000,
        budget: 10000,
        status: 'lost',
      },
    ]
    const kinds = findDuplicates(job, history, TODAY).map(d => d.kind)
    expect(kinds).toEqual(expect.arrayContaining(['client', 'title', 'genre']))
  })
})
