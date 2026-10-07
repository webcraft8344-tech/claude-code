export interface ParsedArgs {
  _: string[]
  opts: Record<string, string | true>
}

/** `--key value` / `--key=value` / `--flag` / 位置引数 を解析する最小パーサ。 */
export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { _: [], opts: {} }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq > 0) {
        out.opts[a.slice(2, eq)] = a.slice(eq + 1)
      } else {
        const next = argv[i + 1]
        if (next !== undefined && !next.startsWith('--')) {
          out.opts[a.slice(2)] = next
          i++
        } else {
          out.opts[a.slice(2)] = true
        }
      }
    } else {
      out._.push(a)
    }
  }
  return out
}

export function optStr(args: ParsedArgs, key: string): string | undefined {
  const v = args.opts[key]
  return typeof v === 'string' ? v : undefined
}

export function optNum(args: ParsedArgs, key: string): number | undefined {
  const v = optStr(args, key)
  if (v === undefined) return undefined
  const n = Number(v)
  if (!Number.isFinite(n))
    throw new Error(`--${key} は数値で指定してください: ${v}`)
  return n
}

export function optBool(args: ParsedArgs, key: string): boolean {
  return args.opts[key] !== undefined
}
