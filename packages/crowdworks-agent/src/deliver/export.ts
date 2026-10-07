import { writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { ensureDir } from '../util/store.js'
import { markdownToDocx } from './docx.js'

export type ExportFormat = 'txt' | 'md' | 'html' | 'docx'

/** Markdown → プレーンテキスト（見出しは【】、箇条書きは・に）。 */
export function markdownToText(md: string): string {
  return md
    .split('\n')
    .map(l => {
      const h = l.match(/^(#{1,3})\s+(.*)$/)
      if (h) return h[1]!.length === 1 ? h[2]! : `【${h[2]}】`
      return l.replace(/^\s*[-*]\s+/, '・').replace(/\*\*(.+?)\*\*/g, '$1')
    })
    .join('\n')
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Googleドキュメントに取り込める HTML（Drive にアップロード→Googleドキュメントで開く、または貼り付け）。 */
export function markdownToHtml(md: string, title = '原稿'): string {
  const body: string[] = []
  let inList = false
  for (const l of md.split('\n')) {
    const h = l.match(/^(#{1,3})\s+(.*)$/)
    const li = l.match(/^\s*[-*]\s+(.*)$/)
    if (!li && inList) {
      body.push('</ul>')
      inList = false
    }
    const inline = (s: string) =>
      esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    if (h) body.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`)
    else if (li) {
      if (!inList) body.push('<ul>')
      inList = true
      body.push(`<li>${inline(li[1]!)}</li>`)
    } else if (l.trim()) body.push(`<p>${inline(l)}</p>`)
  }
  if (inList) body.push('</ul>')
  return `<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>\n${body.join('\n')}\n</body></html>\n`
}

export function exportManuscript(
  md: string,
  format: ExportFormat,
  outPath: string,
  title?: string,
): string {
  ensureDir(dirname(outPath))
  switch (format) {
    case 'txt':
      writeFileSync(outPath, markdownToText(md))
      break
    case 'md':
      writeFileSync(outPath, md)
      break
    case 'html':
      writeFileSync(outPath, markdownToHtml(md, title))
      break
    case 'docx':
      writeFileSync(outPath, markdownToDocx(md, title))
      break
  }
  return outPath
}
