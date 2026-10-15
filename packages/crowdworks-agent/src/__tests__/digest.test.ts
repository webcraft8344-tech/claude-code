import { describe, expect, test } from 'bun:test'
import { DEFAULT_PROFILE } from '../profile'
import {
  buildJob,
  type DigestDeps,
  digestMarkdown,
  type Listing,
  parseDetailHtml,
  parseSearchHtml,
  prefilter,
  riskFlags,
  runDigest,
  workType,
} from '../scout/digest'

const enc = (o: unknown) =>
  JSON.stringify(o).replace(/&/g, '&amp;').replace(/"/g, '&quot;')

const offer = (
  id: number,
  title: string,
  payment: unknown,
  category = 37,
  released = '2026-10-11T09:00:00+09:00',
) => ({
  job_offer: {
    id,
    title,
    description_digest: `${title}の概要です。`,
    category_id: category,
    expired_on: '2026-10-20',
    last_released_at: released,
  },
  payment,
  entry: {
    project_entry: {
      num_contracts: 0,
      project_contract_hope_number: 2,
      num_application_conditions: 3,
    },
  },
  client: { user_id: 1, username: '株式会社テスト' },
})

const searchHtml = (offers: unknown[]) =>
  `<div id="vue-container" data="${enc({ searchResult: { job_offers: offers, pr_gold: [offers[0]], page: {} } })}"></div>`

const detailHtml = (
  description: string,
  client: Record<string, unknown> = {},
) =>
  `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', description: description.replace(/</g, '&lt;').replace(/>/g, '&gt;') })}</script>` +
  `<div id="client_detail_information_container" data="${enc({ isIdentityVerified: true, averageScore: 4.8, projectFinishedRate: 95, jobOfferAchievementCount: 20, ...client })}"></div>`

const W = (price: number, len: number) => ({
  fixed_price_writing_payment: {
    article_price: price,
    min_articles_length: len,
    max_articles_length: len,
  },
})

describe('parseSearchHtml / parseDetailHtml', () => {
  test('reads listings from the embedded JSON and dedupes PR slots', () => {
    const l = parseSearchHtml(
      searchHtml([
        offer(1, '経営者インタビュー記事', W(6000, 3000)),
        offer(
          2,
          'データ入力',
          { task_payment: { task_price: 50, estimated_work_minutes: 5 } },
          52,
        ),
      ]),
    )
    expect(l.map(x => x.id)).toEqual([1, 2])
    expect(l[0]!.client.username).toBe('株式会社テスト')
    expect(l[0]!.hopeNumber).toBe(2)
  })

  test('reads description and client stats from a detail page', () => {
    const d = parseDetailHtml(
      detailHtml(
        '<p>オンライン取材で経営者に話を聞きます。</p><p>継続依頼あり</p>',
        { projectFinishedRate: 60 },
      ),
    )
    expect(d.description).toContain('オンライン取材')
    expect(d.client.finishedRate).toBe(60)
    expect(d.client.identityVerified).toBe(true)
  })
})

describe('buildJob / prefilter / riskFlags', () => {
  test('uses structured writing payment for the char rate', () => {
    const [l] = parseSearchHtml(searchHtml([offer(1, '記事', W(4500, 3000))]))
    const j = buildJob(l!, null)
    expect(j.id).toBe('1')
    expect(j.charRate).toBe(1.5)
    expect(j.charRateEstimated).toBe(false)
    expect(j.url).toBe('https://crowdworks.jp/public/jobs/1')
  })

  test('drops low pay, non-writing categories and interviewee-style posts before reading details', () => {
    const mk = (title: string, payment: unknown, cat = 37) =>
      parseSearchHtml(searchHtml([offer(1, title, payment, cat)]))[0] as Listing
    expect(prefilter(mk('記事', W(1000, 3000)), DEFAULT_PROFILE)).toContain(
      '文字単価',
    )
    expect(prefilter(mk('入力', W(9000, 3000), 52), DEFAULT_PROFILE)).toBe(
      'ライティング以外の仕事',
    )
    expect(
      prefilter(
        mk('【謝礼1,000円】ご意見を募集', W(9000, 3000)),
        DEFAULT_PROFILE,
      ),
    ).toBe('インタビューを受ける側の募集')
    expect(prefilter(mk('取材記事', W(9000, 3000)), DEFAULT_PROFILE)).toBeNull()
  })

  test('flags fee demands and LINE redirection as hard stops', () => {
    expect(
      riskFlags('マニュアル代として3,000円をお支払いください', null)[0]!.hard,
    ).toBe(true)
    expect(riskFlags('詳細は公式LINEに追加してください', null)[0]!.hard).toBe(
      true,
    )
    expect(
      riskFlags('普通の案件', {
        identityVerified: false,
        averageScore: null,
        finishedRate: 50,
        achievements: 1,
      }).map(r => r.hard),
    ).toEqual([false, false])
  })
})

describe('runDigest', () => {
  test('fetches, filters by release time, scores and ranks', async () => {
    const now = new Date('2026-10-11T12:00:00+09:00')
    const pages: Record<string, string> = {}
    const search = searchHtml([
      offer(10, '地域企業の経営者インタビュー記事', W(9000, 3000)),
      offer(
        11,
        '取材記事（古い）',
        W(9000, 3000),
        37,
        '2026-10-01T09:00:00+09:00',
      ),
      offer(12, '低単価の記事', W(1000, 3000)),
      offer(13, '在宅ライター', W(6000, 3000)),
    ])
    pages['/public/jobs/10'] = detailHtml(
      '経営者インタビュー。オンライン取材。継続依頼あり。取材経験のある方。',
    )
    pages['/public/jobs/13'] = detailHtml(
      'ご応募の前に公式LINEに追加してください',
    )
    const fetched: string[] = []
    const deps: DigestDeps = {
      fetchText: async url => {
        fetched.push(url)
        if (url.includes('/search')) return search
        return pages[new URL(url).pathname] ?? ''
      },
      sleep: async () => {},
    }
    const r = await runDigest(
      DEFAULT_PROFILE,
      { keywords: ['取材'] },
      [],
      deps,
      now,
    )
    expect(r.fresh).toBe(3)
    expect(fetched.filter(u => u.includes('/public/jobs/1'))).toHaveLength(2) // 低単価は詳細を読まない
    expect(r.items.find(i => i.job.id === '10')!.rank).toBe('◎応募推奨')
    expect(r.items.find(i => i.job.id === '13')!.rank).toBe('×見送り')
    const md = digestMarkdown(r)
    expect(md).toContain('◎1件')
    expect(md).toContain('https://crowdworks.jp/public/jobs/10')
  })
})

describe('text-adjacent jobs', () => {
  test('keeps transcription / SNS copy / scripts in mixed categories, drops design and video editing', () => {
    const mk = (title: string, cat: number) =>
      parseSearchHtml(
        searchHtml([
          offer(
            1,
            title,
            { fixed_price_payment: { min_budget: 5000, max_budget: 5000 } },
            cat,
          ),
        ]),
      )[0] as Listing
    expect(
      prefilter(mk('インタビュー音声の文字起こし', 55), DEFAULT_PROFILE),
    ).toBeNull()
    expect(
      prefilter(mk('飲食店のInstagram投稿文ライター', 303), DEFAULT_PROFILE),
    ).toBeNull()
    expect(prefilter(mk('YouTube台本作成', 287), DEFAULT_PROFILE)).toBeNull()
    expect(
      prefilter(mk('SNS投稿画像の作成（Canva）', 303), DEFAULT_PROFILE),
    ).toBe('ライティング以外の仕事')
    expect(prefilter(mk('YouTube動画編集者募集', 293), DEFAULT_PROFILE)).toBe(
      'ライティング以外の仕事',
    )
    expect(workType(mk('インタビュー音声の文字起こし', 55))).toBe('文字起こし')
    expect(workType(mk('YouTube台本作成', 287))).toBe('台本・シナリオ')
  })
})
