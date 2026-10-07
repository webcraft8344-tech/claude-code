import { describe, expect, test } from 'bun:test'
import { changeList } from '../deliver/versions'
import { markdownToDocx, zipStore } from '../deliver/docx'
import { markdownToHtml, markdownToText } from '../deliver/export'
import { extractKeyPoints } from '../manuscript/keypoints'
import { buildOutline } from '../manuscript/outline'
import { cleanTranscript } from '../manuscript/transcript'
import { analyzeTone } from '../prep/tone'
import { buildQuestions } from '../prep/questions'
import { DEFAULT_PROFILE } from '../profile'
import { checkFacts, countBySection, proofread } from '../proofread/check'
import { buildProposal, trimToChars } from '../propose/proposal'
import { extractJob } from '../scout/extract'
import { countChars } from '../util/text'

describe('buildProposal', () => {
  test('maps requirements to strengths and produces a shorter short version', () => {
    const job = extractJob(
      '社員インタビュー記事 取材経験のある方 構成力 納期厳守 1記事20000円 3000文字',
    )
    const profile = {
      ...DEFAULT_PROFILE,
      portfolio: [
        {
          id: 'a',
          title: 'エンジニア社員インタビュー',
          url: 'https://example.com/a',
          genres: ['採用', 'IT'],
          tags: ['インタビュー'],
          summary: '要約',
        },
        {
          id: 'b',
          title: '飲食店紹介',
          url: 'https://example.com/b',
          genres: ['飲食'],
          tags: [],
          summary: '要約',
        },
      ],
    }
    const p = buildProposal(job, profile)
    expect(
      p.mapping.filter(m => m.strength).map(m => m.requirementKey),
    ).toEqual(expect.arrayContaining(['interview', 'structure', 'deadline']))
    expect(p.portfolio.map(x => x.id)).toEqual(['a'])
    expect(p.bid).toBe(20000)
    expect(countChars(p.short)).toBeLessThan(countChars(p.long))
    expect(p.long).toContain('https://example.com/a')
  })

  test('trimToChars removes bullets from the end but keeps one', () => {
    const text =
      '見出し\n・一つ目の項目です\n・二つ目の項目です\n・三つ目の項目です\n署名'
    const t = trimToChars(text, 12)
    expect(t).toContain('・一つ目')
    expect(t).not.toContain('三つ目')
    expect(t).toContain('署名')
  })
})

describe('buildQuestions', () => {
  test('picks role-specific questions', () => {
    const q = buildQuestions('入社3年目のエンジニア')
    expect(q.roles).toEqual(['エンジニア'])
    expect(q.sections.map(s => s.heading)).toContain('エンジニアとしての仕事')
  })
})

describe('analyzeTone', () => {
  test('detects polite style, first person and Q&A headings', () => {
    const r = analyzeTone(
      '## Q. 入社のきっかけは？\n私は前職で営業をしていました。転職を考えたのは3年前です。今はとても楽しいです。',
    )
    expect(r.dominantStyle).toBe('です・ます調')
    expect(r.firstPerson['私']).toBe(1)
    expect(r.headingStyles['Markdown見出し(#)']).toBe(1)
  })
})

describe('cleanTranscript', () => {
  const raw = `[00:00:01] 話者1: えーと、きっかけを教えてください。
[00:00:05] 話者2: あのー、前職では5年間働いていました。
なんか、社長の言葉に惹かれたのがきっかけです。
話者2: 意外と早く馴染めました。`

  test('removes fillers, maps speakers and merges consecutive utterances', () => {
    const r = cleanTranscript(raw, { 話者1: '聞き手', 話者2: '田中' })
    expect(r.utterances.map(u => u.speaker)).toEqual(['聞き手', '田中'])
    expect(r.utterances[1]!.text).toBe(
      '前職では5年間働いていました。社長の言葉に惹かれたのがきっかけです。意外と早く馴染めました。',
    )
    expect(r.fillersRemoved).toBe(3)
    expect(r.candidates.some(c => c.word === '意外')).toBe(true)
  })

  test('extracts key points and builds an outline with 3-4 headings', () => {
    const r = cleanTranscript(raw, { 話者1: '聞き手', 話者2: '田中' })
    const kp = extractKeyPoints(r.utterances)
    expect(kp.flatMap(k => k.facts)).toContain('5年間')
    expect(kp.every(k => k.speaker === '田中')).toBe(true)
    const o = buildOutline(kp, 3000, 4)
    expect(o.sections.length).toBe(4)
    expect(
      o.lead.chars +
        o.closing.chars +
        o.sections.reduce((n, s) => n + s.chars, 0),
    ).toBeCloseTo(3000, -1)
  })
})

describe('proofread', () => {
  test('flags notation mix, typos, client rules and risky expressions', () => {
    const text =
      '教えて下さい。教えてください。レビューを見れる。サンプル社は業界No.1です。30歳までの方を募集。営業マンが活躍。御社の強み。'
    const r = proofread(text, {
      companyNames: [{ correct: '株式会社サンプル', wrong: ['サンプル社'] }],
      ngWords: [{ word: '御社' }],
    })
    const msgs = r.issues.map(i => `${i.category}:${i.match}`)
    expect(msgs).toEqual(
      expect.arrayContaining([
        '表記ゆれ:下さい',
        '誤字・文法:見れる',
        'クライアント表記:サンプル社',
        '誇張:業界No.1',
        '求人広告規制:30歳まで',
        '差別・配慮:営業マン',
        'NGワード:御社',
      ]),
    )
  })

  test('does not flag a lone variant as a mix', () => {
    const r = proofread('ご確認ください。')
    expect(r.issues.filter(i => i.category === '表記ゆれ')).toEqual([])
  })

  test('counts characters per section against targets', () => {
    const c = countBySection(
      'リード文です。\n## 見出し1\nあいうえお\n## 見出し2\nかきくけこさしすせそ',
      { targetChars: 20, sectionRatios: [1, 1, 2] },
    )
    expect(c.total).toBe(30) // 見出し記号・改行は除外、見出し文字は含む
    expect(c.sections.map(s => s.chars)).toEqual([7, 5, 10])
    expect(c.sections.map(s => s.target)).toEqual([5, 5, 10])
  })

  test('finds numbers and departments missing from interview notes', () => {
    const m = checkFacts(
      '入社7年目。開発部のメンバー15人と、営業企画部で働く。',
      'メモ：入社5年目、開発部12人',
    )
    expect(m.map(x => x.fact)).toEqual(
      expect.arrayContaining(['7年目', '15人', '営業企画部']),
    )
    expect(m.find(x => x.fact === '15人')!.nearest).toContain('12人')
    expect(m.map(x => x.fact)).not.toContain('開発部')
  })
})

describe('delivery', () => {
  test('changeList groups modifications, additions and deletions', () => {
    const c = changeList(
      '## A\n一文目。二文目。\n## B\n三文目。',
      '## A\n一文目。二文目を直した。\n## B\n三文目。四文目。',
    )
    expect(c.map(x => [x.kind, x.section])).toEqual([
      ['修正', 'A'],
      ['追加', 'B'],
    ])
  })

  test('markdown converters', () => {
    expect(markdownToText('# T\n## H\n- a **b**')).toBe('T\n【H】\n・a b')
    expect(markdownToHtml('## H\n- a\n- b\ntext')).toContain(
      '<h2>H</h2>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n<p>text</p>',
    )
  })

  test('zipStore writes a valid archive and docx contains headings', () => {
    const z = zipStore([{ name: 'a.txt', data: 'hello' }])
    expect(new DataView(z.buffer).getUint32(0, true)).toBe(0x04034b50)
    expect(new DataView(z.buffer).getUint32(z.length - 22, true)).toBe(
      0x06054b50,
    )
    const docx = new TextDecoder().decode(markdownToDocx('# タイトル\n本文'))
    expect(docx).toContain('<w:pStyle w:val="Heading1"/>')
    expect(docx).toContain('タイトル')
  })
})

describe('portfolio without URLs', () => {
  test('lists URL-less achievements and drops unrelated or empty sections', () => {
    const today = new Date().toISOString().slice(0, 10)
    const item = (id: string, genres: string[]) => ({
      id,
      title: `新聞掲載：${id}`,
      url: '',
      genres,
      tags: [],
      summary: `${id}の概要`,
      date: today,
    })
    const job = extractJob(
      '地元企業の社長インタビュー 取材経験のある方 1記事15000円 3000文字',
    )
    const p = buildProposal(job, {
      ...DEFAULT_PROFILE,
      portfolio: [item('経営者', ['経営者']), item('教育', ['教育'])],
    })
    expect(p.portfolio.map(x => x.id)).toEqual(['経営者'])
    expect(p.long).toContain('・新聞掲載：経営者\n  経営者の概要')
    const empty = buildProposal(job, { ...DEFAULT_PROFILE, portfolio: [] })
    expect(empty.long).not.toContain('【参考記事】')
    expect(empty.long).not.toContain('\n\n\n')
  })
})
