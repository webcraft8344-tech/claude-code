import { mdTable, splitSentences } from '../util/text.js'

export interface ToneReport {
  sentences: number
  avgSentenceLength: number
  endings: Record<string, number>
  dominantStyle: 'です・ます調' | 'だ・である調' | '混在'
  firstPerson: Record<string, number>
  headingStyles: Record<string, number>
  qaFormat: boolean
  speakerLabels: string[]
  exclamationRate: number
  quoteRate: number
  sampleHeadings: string[]
}

const ENDING_PATTERNS: [string, RegExp][] = [
  ['です', /です[。！!？?」]?$/],
  ['ます', /ます[。！!？?」]?$/],
  ['ました', /ました[。！!？?」]?$/],
  ['でした', /でした[。！!？?」]?$/],
  ['ません', /ません[。！!？?」]?$/],
  ['だ', /だ[。！!」]?$/],
  ['である', /である[。」]?$/],
  ['だった', /だった[。」]?$/],
  ['体言止め', /[一-龯ァ-ヶー]+[。」]?$/],
  ['疑問形', /[か？?][。」]?$/],
  ['ね・よ', /[ねよ][。！!」]?$/],
]

const FIRST_PERSON = [
  '私',
  'わたし',
  '僕',
  'ぼく',
  '俺',
  '自分',
  'わたくし',
  '当社',
  '弊社',
  '私たち',
  '我々',
]

const HEADING_PATTERNS: [string, RegExp][] = [
  ['Markdown見出し(#)', /^#{1,4}\s/],
  ['【】見出し', /^【.+】/],
  ['■●◆見出し', /^[■●◆▼□◎]/],
  ['Q/A形式', /^(Q|Ｑ|A|Ａ)[.．:：\s]/],
  ['数字見出し(1.)', /^\d+[.．、]\s?\S/],
  ['問いかけ見出し(？で終わる)', /^.{4,40}[？?]$/],
]

/** 既存記事のトーン＆マナーを分析する（語尾・一人称・見出し・文の長さ）。 */
export function analyzeTone(text: string): ToneReport {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  const headingLines: string[] = []
  const headingStyles: Record<string, number> = {}
  for (const l of lines) {
    for (const [name, re] of HEADING_PATTERNS) {
      if (re.test(l) && l.length <= 60) {
        headingStyles[name] = (headingStyles[name] ?? 0) + 1
        headingLines.push(l)
        break
      }
    }
  }
  const body = lines.filter(l => !headingLines.includes(l)).join('\n')
  const sentences = splitSentences(body)
  const endings: Record<string, number> = {}
  for (const s of sentences) {
    const hit = ENDING_PATTERNS.find(([, re]) => re.test(s))
    const key = hit ? hit[0] : 'その他'
    endings[key] = (endings[key] ?? 0) + 1
  }
  const polite =
    (endings['です'] ?? 0) +
    (endings['ます'] ?? 0) +
    (endings['ました'] ?? 0) +
    (endings['でした'] ?? 0) +
    (endings['ません'] ?? 0)
  const plain =
    (endings['だ'] ?? 0) + (endings['である'] ?? 0) + (endings['だった'] ?? 0)
  const dominantStyle =
    polite > plain * 3
      ? 'です・ます調'
      : plain > polite * 3
        ? 'だ・である調'
        : '混在'

  const firstPerson: Record<string, number> = {}
  for (const w of FIRST_PERSON) {
    const re = w === '私' ? /私(?!たち|立|服|物|鉄|有)/g : new RegExp(w, 'g')
    const c = (body.match(re) ?? []).length
    if (c) firstPerson[w] = c
  }
  const speakerLabels = [
    ...new Set(
      lines
        .map(
          l =>
            l.match(/^([^\s「」]{1,12}?)[：:]\s*\S/)?.[1] ??
            l.match(/^(―|——|──)/)?.[1],
        )
        .filter((x): x is string => !!x),
    ),
  ].slice(0, 6)

  const totalChars = [...body].length || 1
  return {
    sentences: sentences.length,
    avgSentenceLength: sentences.length
      ? Math.round(
          sentences.reduce((n, s) => n + [...s].length, 0) / sentences.length,
        )
      : 0,
    endings,
    dominantStyle,
    firstPerson,
    headingStyles,
    qaFormat: (headingStyles['Q/A形式'] ?? 0) > 0 || speakerLabels.length >= 2,
    speakerLabels,
    exclamationRate: Math.round(
      ((body.match(/[！!]/g) ?? []).length / Math.max(1, sentences.length)) *
        100,
    ),
    quoteRate: Math.round(
      ((body.match(/「/g) ?? []).length / totalChars) * 1000,
    ),
    sampleHeadings: headingLines.slice(0, 8),
  }
}

export function toneMarkdown(r: ToneReport): string {
  const pct = (n: number) =>
    `${Math.round((n / Math.max(1, r.sentences)) * 100)}%`
  const top = Object.entries(r.endings).sort((a, b) => b[1] - a[1])
  return [
    '# トーン＆マナー分析',
    '',
    `- 文体: **${r.dominantStyle}**`,
    `- 平均文長: ${r.avgSentenceLength}字（${r.sentences}文）`,
    `- 一人称: ${
      Object.entries(r.firstPerson)
        .map(([k, v]) => `${k}(${v})`)
        .join('、') || '検出なし'
    }`,
    `- インタビュー形式: ${r.qaFormat ? `Q&A／話者ラベルあり（${r.speakerLabels.join('、') || '-'}）` : '地の文中心'}`,
    `- 感嘆符: 100文あたり ${r.exclamationRate}回 ／ 「」引用: 1000字あたり ${r.quoteRate}回`,
    '',
    '## 語尾の分布',
    '',
    mdTable(
      ['語尾', '回数', '割合'],
      top.map(([k, v]) => [k, v, pct(v)]),
    ),
    '',
    '## 見出しスタイル',
    '',
    Object.keys(r.headingStyles).length
      ? mdTable(['スタイル', '回数'], Object.entries(r.headingStyles))
      : '（見出し検出なし）',
    '',
    ...(r.sampleHeadings.length
      ? ['### 見出し例', '', ...r.sampleHeadings.map(h => `- ${h}`), '']
      : []),
    '## 執筆ルール（このトーンに合わせる）',
    '',
    `- 文体は${r.dominantStyle === '混在' ? '発言部分＝です・ます、地の文＝要確認' : r.dominantStyle}で統一`,
    `- 1文は${r.avgSentenceLength + 10}字以内を目安`,
    `- 一人称は「${Object.entries(r.firstPerson).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '私'}」`,
    `- 感嘆符は${r.exclamationRate > 5 ? '適度に使用可' : 'ほぼ使わない'}`,
    '',
  ].join('\n')
}
