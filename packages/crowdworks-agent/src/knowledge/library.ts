import { appendFileSync, existsSync } from 'node:fs'
import { GENRE_DICT } from '../scout/extract.js'
import type { PortfolioItem, Profile } from '../profile.js'
import {
  p,
  readJson,
  readTextIfExists,
  safeName,
  writeJson,
  writeText,
} from '../util/store.js'
import { countChars, mdTable, splitSentences, toISODate } from '../util/text.js'

/** 完成記事からポートフォリオ項目を作る（要約は冒頭のリード文＋主要見出し）。 */
export function portfolioFromArticle(
  article: string,
  meta: { title: string; url: string; tags?: string[]; date?: string },
): PortfolioItem {
  const lines = article.split('\n')
  const headings = lines
    .filter(l => /^#{2,3}\s/.test(l))
    .map(l => l.replace(/^#+\s*/, ''))
  const body = lines.filter(l => l.trim() && !/^#/.test(l)).join('\n')
  const lead = splitSentences(body).slice(0, 2).join('')
  const genres = Object.entries(GENRE_DICT)
    .filter(([, kws]) => kws.some(k => article.includes(k)))
    .map(([g]) => g)
  const autoTags = headings
    .flatMap(h => h.match(/[ァ-ヶー]{3,}|[一-龯]{2,4}/g) ?? [])
    .slice(0, 8)
  return {
    id: safeName(meta.title).slice(0, 40),
    title: meta.title,
    url: meta.url,
    genres,
    tags: [...new Set([...(meta.tags ?? []), ...autoTags])],
    summary: `${lead.slice(0, 120)}${lead.length > 120 ? '…' : ''}（見出し: ${headings.slice(0, 4).join('／')}）`,
    date: meta.date,
    chars: countChars(article),
  }
}

export function addPortfolio(item: PortfolioItem): Profile['portfolio'] {
  const path = p('profile.json')
  const prof = readJson<Partial<Profile>>(path, {})
  const list = (prof.portfolio ?? []).filter(
    // URL なしの実績同士は URL で重複判定しない
    x => x.id !== item.id && !(item.url && x.url === item.url),
  )
  list.push(item)
  prof.portfolio = list
  writeJson(path, prof)
  writeText(p('portfolio.md'), portfolioMarkdown(list))
  return list
}

export function portfolioMarkdown(items: PortfolioItem[]): string {
  return [
    '# 実績リスト',
    '',
    `掲載 ${items.length}本（最終更新 ${toISODate(new Date())}）`,
    '',
    mdTable(
      ['日付', 'タイトル', 'ジャンル', '文字数', '概要'],
      [...items]
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
        .map(i => [
          i.date ?? '-',
          `[${i.title}](${i.url})`,
          i.genres.join('、'),
          i.chars ?? '-',
          i.summary,
        ]),
    ),
    '',
  ].join('\n')
}

// ---- テンプレ集 ----

export interface TemplateHarvest {
  headings: string[]
  questions: string[]
  phrases: { phrase: string; count: number }[]
}

/**
 * 完成記事・文字起こしからテンプレ素材を収穫する。
 * - 見出し: そのまま
 * - 質問: 聞き手の発言 / 「？」で終わる文
 * - 言い回し: 複数記事で繰り返し使っている 6〜14字の文節（接続・締めの定型句）
 */
export function harvestTemplates(texts: string[]): TemplateHarvest {
  const headings = new Set<string>()
  const questions = new Set<string>()
  const freq = new Map<string, Set<number>>()
  texts.forEach((t, idx) => {
    for (const l of t.split('\n')) {
      const h = l.match(/^#{2,3}\s+(.+)/)
      if (h) headings.add(h[1]!.trim())
      const q = l.match(
        /^(?:聞き手|インタビュアー|ライター|Q|Ｑ|―|——)[：:.\s]*(.+[？?])\s*$/,
      )
      if (q) questions.add(q[1]!.trim())
    }
    for (const s of splitSentences(t)) {
      if (/[？?]$/.test(s) && [...s].length < 60 && !/^#/.test(s))
        questions.add(s.replace(/^[^：:]{1,8}[：:]/, ''))
      for (const clause of s.split(/[、。]/)) {
        const c = clause.trim()
        const len = [...c].length
        if (len >= 6 && len <= 14 && !/\d/.test(c)) {
          const set = freq.get(c) ?? new Set<number>()
          set.add(idx)
          freq.set(c, set)
        }
      }
    }
  })
  const phrases = [...freq.entries()]
    .filter(([, s]) => s.size >= 2)
    .map(([phrase, s]) => ({ phrase, count: s.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40)
  return {
    headings: [...headings],
    questions: [...questions].slice(0, 60),
    phrases,
  }
}

/** templates/ 以下の md に重複なく追記する。 */
export function updateTemplates(h: TemplateHarvest): Record<string, number> {
  const append = (file: string, title: string, items: string[]) => {
    const path = p('templates', file)
    const cur = readTextIfExists(path) ?? `# ${title}\n\n`
    const existing = new Set(
      cur.split('\n').map(l =>
        l
          .replace(/^- /, '')
          .replace(/（\d+記事）$/, '')
          .trim(),
      ),
    )
    const fresh = items.filter(i => !existing.has(i))
    if (!existsSync(path)) writeText(path, cur)
    if (fresh.length)
      appendFileSync(path, `${fresh.map(i => `- ${i}`).join('\n')}\n`)
    return fresh.length
  }
  return {
    'questions.md': append('questions.md', 'よく使う質問', h.questions),
    'headings.md': append('headings.md', '見出し・構成パターン', h.headings),
    'phrases.md': append(
      'phrases.md',
      'よく使う言い回し',
      h.phrases.map(x => `${x.phrase}（${x.count}記事）`),
    ),
  }
}

/** templates/questions.md から追加質問を読む。 */
export function loadExtraQuestions(): string[] {
  const t = readTextIfExists(p('templates', 'questions.md'))
  if (!t) return []
  return t
    .split('\n')
    .filter(l => l.startsWith('- '))
    .map(l => l.slice(2).trim())
}

// ---- クライアントメモ ----

export function clientFile(client: string): string {
  return p('clients', `${safeName(client)}.md`)
}

export function addClientNote(
  client: string,
  note: string,
  category = 'メモ',
  today = new Date(),
): string {
  const path = clientFile(client)
  if (!existsSync(path)) {
    writeText(path, `# ${client}\n\n## 好み・注意事項\n\n## 履歴\n\n`)
  }
  appendFileSync(path, `- ${toISODate(today)} [${category}] ${note}\n`)
  return path
}

/** 修正依頼文から「クライアントの好み・ルール」になりそうな指示文を抜き出す。 */
export function preferenceHints(revisionRequests: string): string[] {
  return splitSentences(revisionRequests)
    .filter(s =>
      /してください|でお願い|は避け|NG|統一|ではなく|に変更|控え|しないで/.test(
        s,
      ),
    )
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 10)
}
