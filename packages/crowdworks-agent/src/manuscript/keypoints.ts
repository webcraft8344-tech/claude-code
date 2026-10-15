import { mdTable, splitSentences } from '../util/text.js'
import type { Utterance } from './transcript.js'

export type EpisodeCategory =
  | 'きっかけ・入社理由'
  | '仕事内容・やりがい'
  | '苦労・転機'
  | '成長・学び'
  | '職場・カルチャー'
  | '今後・メッセージ'

// 判定順に意味がある（先にマッチしたカテゴリを採用）。「今後〜成長」のような文は今後に寄せる
const CATEGORY_MARKERS: Record<EpisodeCategory, RegExp> = {
  '今後・メッセージ': /今後|将来|目標|挑戦したい|メッセージ|求職者|一緒に働/,
  'きっかけ・入社理由': /きっかけ|決め手|入社した理由|選んだ|惹かれ|志望|転職/,
  '仕事内容・やりがい': /やりがい|嬉し|うれし|楽し|面白|担当|任され|感謝|喜び/,
  '苦労・転機': /苦労|大変|悩|壁|失敗|挫折|転機|しんど|難し|乗り越え/,
  '成長・学び': /成長|学ん|身につ|できるようにな|気づ|変わっ|スキル/,
  '職場・カルチャー':
    /雰囲気|チーム|社風|文化|仲間|上司|先輩|制度|働き方|リモート|休み/,
}

export interface KeyPoint {
  category: EpisodeCategory | 'その他'
  sentence: string
  score: number
  speaker: string
  facts: string[]
}

/** 数字・年数・人数・割合などの事実表現 */
export const FACT_RE =
  /(?:\d+(?:\.\d+)?|[一二三四五六七八九十百千]+)\s*(?:年目|年間|年|ヶ月|か月|カ月|人|名|社|件|%|％|割|倍|歳|万円|円|時間|日|回|店舗|拠点)/g

/** 発言から要点・エピソード候補を抽出し、カテゴリ別にスコア順で並べる。 */
export function extractKeyPoints(
  utterances: Utterance[],
  interviewerNames: string[] = ['聞き手', 'インタビュアー', 'ライター'],
): KeyPoint[] {
  const out: KeyPoint[] = []
  for (const u of utterances) {
    if (interviewerNames.includes(u.speaker)) continue
    for (const s of splitSentences(u.text)) {
      if ([...s].length < 12) continue
      let category: KeyPoint['category'] = 'その他'
      let score = 0
      for (const [cat, re] of Object.entries(CATEGORY_MARKERS) as [
        EpisodeCategory,
        RegExp,
      ][]) {
        if (re.test(s)) {
          if (category === 'その他') category = cat
          score += 2
        }
      }
      const facts = s.match(FACT_RE) ?? []
      score += facts.length * 1.5
      if (/「.+」/.test(s)) score += 1 // 印象的な発言の引用
      if (/とき|時に|瞬間|場面|ある日|最初は/.test(s)) score += 1.5 // 具体的な場面
      if (/思います|感じ/.test(s)) score += 0.5 // 感情・価値観
      if (score > 0)
        out.push({ category, sentence: s, score, speaker: u.speaker, facts })
    }
  }
  return out.sort((a, b) => b.score - a.score)
}

export function keyPointsMarkdown(points: KeyPoint[], perCategory = 5): string {
  const cats = [...new Set(points.map(p => p.category))]
  const facts = [...new Set(points.flatMap(p => p.facts))]
  return [
    '# 要点・エピソード候補',
    '',
    ...cats.flatMap(c => [
      `## ${c}`,
      '',
      ...points
        .filter(p => p.category === c)
        .slice(0, perCategory)
        .map(
          p =>
            `- (${p.score.toFixed(1)}) ${p.sentence}${p.facts.length ? `  〔事実: ${p.facts.join('、')}〕` : ''}`,
        ),
      '',
    ]),
    '## 原稿で使う数字・事実（事実照合用）',
    '',
    facts.length
      ? mdTable(
          ['事実表現'],
          facts.map(f => [f]),
        )
      : '- なし',
    '',
  ].join('\n')
}
