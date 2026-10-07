/**
 * 日本語テキスト処理の共通ユーティリティ。
 * 外部依存なし（Bun / Node 標準のみ）。
 */

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  yen: '¥',
}

/** 保存した HTML をプレーンテキストに変換する（ブロック要素は改行に）。 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(
      /<\/(p|div|li|h[1-6]|tr|dt|dd|section|article|header|footer|table)>/gi,
      '\n',
    )
    .replace(/<(td|th)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
      String.fromCodePoint(Number.parseInt(n, 16)),
    )
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITY_MAP[name] ?? m)
    .split('\n')
    .map(l => l.replace(/[ \t　]+/g, ' ').trim())
    .filter((l, i, arr) => l !== '' || (i > 0 && arr[i - 1] !== ''))
    .join('\n')
    .trim()
}

export function looksLikeHtml(s: string): boolean {
  return /<(html|body|div|p|span|h1|meta)[\s>]/i.test(s)
}

/** 全角数字・記号を半角に寄せる（数値抽出用。本文の書き換えには使わない）。 */
export function normalizeForParse(s: string): string {
  return s
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，]/g, ',')
    .replace(/[．]/g, '.')
    .replace(/[～〜]/g, '〜')
    .replace(/[：]/g, ':')
}

/** "1万5,000" / "15,000" / "1.5" を数値化。 */
export function parseJpNumber(raw: string): number | null {
  const s = normalizeForParse(raw).replace(/,/g, '').trim()
  const man = s.match(/^(\d+(?:\.\d+)?)万(\d+)?$/)
  if (man) return Number(man[1]) * 10000 + (man[2] ? Number(man[2]) : 0)
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * 原稿の文字数。改行・空白・Markdown の見出し記号は数えない
 * （クライアント納品時の「文字数」の一般的な数え方）。
 */
export function countChars(text: string): number {
  const body = text
    .split('\n')
    .map(l => l.replace(/^#{1,6}\s+/, '').replace(/^\s*[-*]\s+/, ''))
    .join('')
  return [...body.replace(/[\s　]/g, '')].length
}

/** 句点・感嘆符・疑問符で文に分割する（括弧内の句点では切らない）。 */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  let buf = ''
  let depth = 0
  for (const ch of text) {
    if (ch === '「' || ch === '（' || ch === '(' || ch === '『') depth++
    if (ch === '」' || ch === '）' || ch === ')' || ch === '』')
      depth = Math.max(0, depth - 1)
    if (ch === '\n') {
      if (buf.trim()) out.push(buf.trim())
      buf = ''
      depth = 0
      continue
    }
    buf += ch
    if (depth === 0 && /[。！？!?]/.test(ch)) {
      out.push(buf.trim())
      buf = ''
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

/** 行番号付きで正規表現の出現位置を列挙する。 */
export function findAll(
  text: string,
  re: RegExp,
): { match: string; line: number; context: string }[] {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`
  const g = new RegExp(re.source, flags)
  const lines = text.split('\n')
  const hits: { match: string; line: number; context: string }[] = []
  lines.forEach((l, i) => {
    for (const m of l.matchAll(g)) {
      const start = Math.max(0, (m.index ?? 0) - 12)
      hits.push({
        match: m[0],
        line: i + 1,
        context: l.slice(start, (m.index ?? 0) + m[0].length + 12),
      })
    }
  })
  return hits
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** "2026年10月5日" "10/5" "2026-10-05" などを ISO 日付へ。年省略時は today 以降で最も近い年。 */
export function parseJpDate(raw: string, today: Date): string | null {
  const s = normalizeForParse(raw)
  let m = s.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/)
  if (m)
    return toISODate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  m = s.match(/(\d{1,2})[月/](\d{1,2})日?/)
  if (m) {
    let d = new Date(today.getFullYear(), Number(m[1]) - 1, Number(m[2]))
    if (d.getTime() < today.getTime() - 86400000 * 180) {
      d = new Date(today.getFullYear() + 1, Number(m[1]) - 1, Number(m[2]))
    }
    return toISODate(d)
  }
  return null
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00`)
  const b = new Date(`${toISO}T00:00:00`)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export function yen(n: number): string {
  return `${Math.round(n).toLocaleString('ja-JP')}円`
}

/** Markdown の表を組み立てる。 */
export function mdTable(
  headers: string[],
  rows: (string | number)[][],
): string {
  const esc = (v: string | number) => String(v).replace(/\|/g, '\\|')
  return [
    `| ${headers.map(esc).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(r => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n')
}

/** 簡易な文字 bigram 集合（類似度判定用）。 */
export function bigrams(s: string): Set<string> {
  const chars = [...s.replace(/\s/g, '')]
  const set = new Set<string>()
  for (let i = 0; i < chars.length - 1; i++) set.add(chars[i] + chars[i + 1])
  return set
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}
