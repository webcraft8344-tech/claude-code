import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * データ保存先。`CW_HOME` 環境変数 > `~/crowdworks-agent`。
 *
 * ディレクトリ構成:
 *   profile.json          自分の条件・強み・ポートフォリオ・自己PRテンプレ
 *   applications.jsonl    応募履歴
 *   ledger.jsonl          売上台帳
 *   worklog.jsonl         稼働ログ
 *   expenses.jsonl        経費
 *   jobs/<案件ID>/         案件ごとのフォルダ（判定メモ・提案文・原稿・版管理）
 *   clients/<クライアント>.md  クライアント別メモ
 *   templates/            質問・構成・言い回しテンプレ
 */
export function cwHome(): string {
  return process.env.CW_HOME ?? join(homedir(), 'crowdworks-agent')
}

export function p(...parts: string[]): string {
  return join(cwHome(), ...parts)
}

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true })
  return dir
}

export function writeText(path: string, content: string): string {
  ensureDir(dirname(path))
  writeFileSync(path, content)
  return path
}

export function readText(path: string): string {
  return readFileSync(path, 'utf8')
}

export function readTextIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

export function writeJson(path: string, data: unknown): string {
  return writeText(path, `${JSON.stringify(data, null, 2)}\n`)
}

export function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l) as T)
}

export function appendJsonl(path: string, row: unknown): void {
  ensureDir(dirname(path))
  appendFileSync(path, `${JSON.stringify(row)}\n`)
}

export function writeJsonl(path: string, rows: unknown[]): void {
  writeText(path, rows.map(r => `${JSON.stringify(r)}\n`).join(''))
}

export function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
}

export function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile())
    .map(d => d.name)
}

/** ファイル名に使えない文字を置換する。 */
export function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80) || 'untitled'
}
