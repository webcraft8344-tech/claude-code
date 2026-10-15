import { jobDir } from '../scout/jobs.js'
import { listFiles, readText, safeName, writeText } from '../util/store.js'
import { countChars, splitSentences } from '../util/text.js'

export interface DiffOp {
  op: 'eq' | 'add' | 'del'
  text: string
}

/** LCS による単位列（行・文）の差分。 */
export function diffSeq(a: string[], b: string[]): DiffOp[] {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  )
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] =
        a[i] === b[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
  const out: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'eq', text: a[i]! })
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!)
      out.push({ op: 'del', text: a[i++]! })
    else out.push({ op: 'add', text: b[j++]! })
  }
  while (i < n) out.push({ op: 'del', text: a[i++]! })
  while (j < m) out.push({ op: 'add', text: b[j++]! })
  return out
}

export interface Change {
  kind: '修正' | '追加' | '削除'
  before: string
  after: string
  section: string
}

/** 文単位で差分をとり、隣接する削除＋追加を「修正」としてまとめた変更点一覧を作る。 */
export function changeList(before: string, after: string): Change[] {
  const units = (t: string) =>
    t
      .split('\n')
      .flatMap(l => (/^#{1,6}\s/.test(l) ? [l.trim()] : splitSentences(l)))
  const ops = diffSeq(units(before), units(after))
  const changes: Change[] = []
  let section = '（冒頭）'
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k]!
    if (o.op === 'eq') {
      if (/^#{2,6}\s/.test(o.text)) section = o.text.replace(/^#+\s*/, '')
      continue
    }
    if (o.op === 'del') {
      const dels = [o.text]
      while (ops[k + 1]?.op === 'del') dels.push(ops[++k]!.text)
      const adds: string[] = []
      while (ops[k + 1]?.op === 'add') adds.push(ops[++k]!.text)
      changes.push({
        kind: adds.length ? '修正' : '削除',
        before: dels.join(''),
        after: adds.join(''),
        section,
      })
    } else {
      const adds = [o.text]
      while (ops[k + 1]?.op === 'add') adds.push(ops[++k]!.text)
      changes.push({ kind: '追加', before: '', after: adds.join(''), section })
    }
  }
  return changes
}

export function changesMarkdown(
  changes: Change[],
  fromLabel: string,
  toLabel: string,
  before: string,
  after: string,
): string {
  return [
    `# 変更点一覧（${fromLabel} → ${toLabel}）`,
    '',
    `- 文字数: ${countChars(before)}字 → ${countChars(after)}字（${countChars(after) - countChars(before) >= 0 ? '+' : ''}${countChars(after) - countChars(before)}）`,
    `- 変更箇所: ${changes.length}件（修正 ${changes.filter(c => c.kind === '修正').length} / 追加 ${changes.filter(c => c.kind === '追加').length} / 削除 ${changes.filter(c => c.kind === '削除').length}）`,
    '',
    ...changes.flatMap((c, i) => [
      `## ${i + 1}. [${c.kind}] ${c.section}`,
      '',
      ...(c.before ? [`- 修正前: ${c.before}`] : []),
      ...(c.after ? [`- 修正後: ${c.after}`] : []),
      '',
    ]),
  ].join('\n')
}

const versionsDir = (jobId: string) => `${jobDir(jobId)}/versions`

export function listVersions(jobId: string): string[] {
  return listFiles(versionsDir(jobId))
    .filter(f => /^v\d+_/.test(f))
    .sort(
      (a, b) => Number(a.match(/^v(\d+)/)![1]) - Number(b.match(/^v(\d+)/)![1]),
    )
}

/** 原稿を v{n}_{ラベル}.md として保存し、直前版との変更点一覧を自動生成する。 */
export function saveVersion(
  jobId: string,
  content: string,
  label: string,
): { file: string; changesFile: string | null } {
  const existing = listVersions(jobId)
  const n = existing.length + 1
  const file = `${versionsDir(jobId)}/v${n}_${safeName(label)}.md`
  writeText(file, content)
  let changesFile: string | null = null
  const prev = existing.at(-1)
  if (prev) {
    const before = readText(`${versionsDir(jobId)}/${prev}`)
    const changes = changeList(before, content)
    changesFile = `${versionsDir(jobId)}/changes_v${n - 1}_to_v${n}.md`
    writeText(
      changesFile,
      changesMarkdown(
        changes,
        prev.replace(/\.md$/, ''),
        `v${n}_${label}`,
        before,
        content,
      ),
    )
  }
  return { file, changesFile }
}

export function resolveVersion(jobId: string, ref: string): string {
  const files = listVersions(jobId)
  const f = files.find(
    x => x.startsWith(`${ref}_`) || x === ref || x.replace(/\.md$/, '') === ref,
  )
  if (!f)
    throw new Error(
      `版 ${ref} が見つかりません（${files.join(', ') || 'なし'}）`,
    )
  return `${versionsDir(jobId)}/${f}`
}
