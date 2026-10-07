#!/usr/bin/env bun
/**
 * cw — クラウドワークス副業（取材・採用記事ライティング）自動化 CLI。
 * 決定的に処理できる作業（抽出・判定・集計・校正・変換）を担当し、
 * 文章生成・Web調査は Claude Code のスキル（.claude/skills/cw-*）が担う。
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  addExpense,
  addLedger,
  addPayout,
  type EntryStatus,
  ledgerTable,
  loadExpenses,
  loadLedger,
  loadPayouts,
  loadWork,
  logWork,
  monthlyMarkdown,
  monthlyReport,
  pendingCheck,
  systemFee,
  taxMarkdown,
  taxSummary,
  updateLedgerStatus,
} from './books/ledger.js'
import { renderMail } from './prep/docs.js'
import { exportManuscript, type ExportFormat } from './deliver/export.js'
import {
  changeList,
  changesMarkdown,
  listVersions,
  resolveVersion,
  saveVersion,
} from './deliver/versions.js'
import { analyzeWins, winsMarkdown } from './knowledge/analyze.js'
import {
  addClientNote,
  addPortfolio,
  clientFile,
  harvestTemplates,
  loadExtraQuestions,
  portfolioFromArticle,
  portfolioMarkdown,
  preferenceHints,
  updateTemplates,
} from './knowledge/library.js'
import { extractKeyPoints, keyPointsMarkdown } from './manuscript/keypoints.js'
import {
  buildOutline,
  outlineMarkdown,
  titlePatterns,
} from './manuscript/outline.js'
import {
  cleanReportMarkdown,
  cleanTranscript,
} from './manuscript/transcript.js'
import {
  hearingSheet,
  progressChecklist,
  researchTemplate,
} from './prep/docs.js'
import { buildQuestions, questionsMarkdown } from './prep/questions.js'
import { analyzeTone, toneMarkdown } from './prep/tone.js'
import { DEFAULT_PROFILE, loadProfile } from './profile.js'
import type { ClientRules } from './proofread/rules.js'
import { proofMarkdown, proofread } from './proofread/check.js'
import {
  type ApplicationStatus,
  appendApplication,
  applicationsCsv,
  applicationsTable,
  loadApplications,
  updateApplicationStatus,
} from './propose/applications.js'
import { buildProposal, proposalMarkdown } from './propose/proposal.js'
import { extractJob } from './scout/extract.js'
import { jobDir, jobsTable, listJobs, loadJob, saveJob } from './scout/jobs.js'
import { scoreJob } from './scout/score.js'
import {
  optBool,
  optNum,
  optStr,
  type ParsedArgs,
  parseArgs,
} from './util/args.js'
import {
  cwHome,
  p,
  readJson,
  readText,
  readTextIfExists,
  safeName,
  writeJson,
  writeText,
} from './util/store.js'
import { countChars, toISODate, yen } from './util/text.js'

const out = (s: string) => process.stdout.write(`${s}\n`)

function readInput(path: string | undefined): string {
  if (!path || path === '-') return readFileSync(0, 'utf8')
  return readText(path)
}

function need(v: string | undefined, name: string): string {
  if (!v) throw new Error(`${name} を指定してください`)
  return v
}

function loadRules(jobId?: string, rulesPath?: string): ClientRules {
  if (rulesPath) return readJson<ClientRules>(rulesPath, {})
  if (!jobId) return {}
  const jobRules = join(jobDir(jobId), 'rules.json')
  if (existsSync(jobRules)) return readJson<ClientRules>(jobRules, {})
  const job = existsSync(join(jobDir(jobId), 'job.json'))
    ? loadJob(jobId)
    : null
  if (job?.client) {
    const cr = clientFile(job.client).replace(/\.md$/, '.rules.json')
    if (existsSync(cr)) return readJson<ClientRules>(cr, {})
  }
  return {}
}

const RULES_TEMPLATE: ClientRules = {
  companyNames: [
    { correct: '株式会社サンプル', wrong: ['(株)サンプル', 'サンプル社'] },
  ],
  ngWords: [{ word: '御社', reason: '記事内では社名で表記', suggest: '同社' }],
  replacements: { お客さま: 'お客様' },
  preferred: ['ください', 'いただく', 'できる'],
  targetChars: 3000,
  tolerancePct: 10,
  sectionRatios: [1, 3, 3, 3, 1],
  style: 'です・ます調',
}

const commands: Record<string, (a: ParsedArgs) => void> = {
  init() {
    const path = p('profile.json')
    if (!existsSync(path)) writeJson(path, DEFAULT_PROFILE)
    writeText(
      p('templates', 'rules.example.json'),
      `${JSON.stringify(RULES_TEMPLATE, null, 2)}\n`,
    )
    for (const f of ['questions.md', 'headings.md', 'phrases.md']) {
      if (!existsSync(p('templates', f)))
        writeText(p('templates', f), `# ${f.replace('.md', '')}\n\n`)
    }
    out(
      `初期化しました: ${cwHome()}\n- profile.json を編集して、条件・強み・自己PRテンプレを設定してください。`,
    )
  },

  // ---- 1. 案件探索・選定 ----
  scout(a) {
    const sub = a._[0]
    if (sub === 'list') {
      const jobs = listJobs().sort(
        (x, y) => (y.verdict?.score ?? 0) - (x.verdict?.score ?? 0),
      )
      out(jobsTable(jobs))
      return
    }
    const files = a._.length ? a._ : ['-']
    const profile = loadProfile()
    const history = loadApplications()
    const results = files.map(f => {
      const src = readInput(f)
      // 1ファイルに複数案件を "=====" 区切りで貼り付けても可
      return src.split(/\n={5,}\n/).map(chunk => {
        const job = extractJob(chunk)
        const verdict = scoreJob(job, profile, history)
        if (!optBool(a, 'dry-run')) {
          const dir = saveJob(job, verdict, job.rawText)
          if (/<html|<body/i.test(chunk))
            writeText(join(dir, 'original.html'), chunk)
        }
        return { ...job, verdict }
      })
    })
    const jobs = results.flat()
    out(jobsTable(jobs))
    out('')
    for (const j of jobs) {
      out(
        `- ${j.id}: **${j.verdict.decision}**（${j.verdict.score}点）${j.verdict.hardStops.length ? ` 足切り: ${j.verdict.hardStops.join(' / ')}` : ''}${j.verdict.duplicates.length ? ` 重複: ${j.verdict.duplicates.map(d => d.note).join(' / ')}` : ''}`,
      )
    }
    if (!optBool(a, 'dry-run')) out(`\n判定メモ: ${p('jobs')}/<案件ID>/memo.md`)
  },

  // ---- 2. 応募・提案文 ----
  propose(a) {
    const id = need(a._[0], '案件ID')
    const job = loadJob(id)
    const prop = buildProposal(job, loadProfile(), {
      bid: optNum(a, 'bid'),
      deadline: optStr(a, 'deadline'),
    })
    const md = proposalMarkdown(job, prop)
    writeText(join(jobDir(id), 'proposal.md'), md)
    out(md)
  },

  apply(a) {
    const id = need(a._[0], '案件ID')
    const job = loadJob(id)
    const profile = loadProfile()
    const prop = buildProposal(job, profile, { bid: optNum(a, 'bid') })
    const variant = optStr(a, 'variant') === 'short' ? 'short' : 'long'
    const sentFile = optStr(a, 'text')
    const sent = sentFile
      ? readText(sentFile)
      : variant === 'short'
        ? prop.short
        : prop.long
    if (sentFile) writeText(join(jobDir(id), 'proposal_sent.txt'), sent)
    appendApplication({
      date: optStr(a, 'date') ?? toISODate(new Date()),
      jobId: id,
      title: job.title,
      client: job.client,
      genres: job.genres,
      bid: optNum(a, 'bid') ?? prop.bid,
      budget: job.budgetMax ?? job.budgetMin,
      status: 'applied',
      proposalChars: countChars(sent),
      variant,
      strengthsUsed: prop.mapping
        .filter(m => m.strength)
        .map(m => m.strength!.key),
      portfolioIds: prop.portfolio.map(x => x.id),
    })
    out(
      `応募履歴に追記しました: ${id}（提示額 ${prop.bid !== null ? yen(optNum(a, 'bid') ?? prop.bid) : '-'}）`,
    )
  },

  result(a) {
    const id = need(a._[0], '案件ID')
    const status = need(
      a._[1],
      '結果（won|lost|withdrawn|no_reply）',
    ) as ApplicationStatus
    if (!['won', 'lost', 'withdrawn', 'no_reply', 'applied'].includes(status))
      throw new Error(`不明な結果: ${status}`)
    const row = updateApplicationStatus(id, status, optStr(a, 'note'))
    out(`更新しました: ${row.jobId} → ${status}`)
    if (status === 'won')
      out('次: cw prep で受注後の準備、cw books add で売上台帳に登録')
  },

  apps(a) {
    const rows = loadApplications()
    out(optBool(a, 'csv') ? applicationsCsv(rows) : applicationsTable(rows))
  },

  // ---- 3. 受注後の準備 ----
  prep(a) {
    const id = need(a._[0], '案件ID')
    const job = loadJob(id)
    const role = optStr(a, 'role') ?? ''
    const dir = join(jobDir(id), 'prep')
    const q = questionsMarkdown(
      role || '汎用',
      buildQuestions(role, loadExtraQuestions()),
      optNum(a, 'minutes') ?? 60,
    )
    writeText(join(dir, 'questions.md'), q)
    writeText(join(dir, 'hearing.md'), hearingSheet(job))
    writeText(join(dir, 'checklist.md'), progressChecklist(job))
    if (!existsSync(join(dir, 'research.md')))
      writeText(join(dir, 'research.md'), researchTemplate(job))
    if (!existsSync(join(jobDir(id), 'rules.json')))
      writeJson(join(jobDir(id), 'rules.json'), {
        ...RULES_TEMPLATE,
        companyNames: job.client ? [{ correct: job.client, wrong: [] }] : [],
        ngWords: [],
        replacements: {},
        targetChars: job.charCount ?? 3000,
      })
    out(q)
    out(
      `\n作成: ${dir}/{questions,hearing,checklist,research}.md と ${jobDir(id)}/rules.json`,
    )
  },

  tone(a) {
    const text = a._.map(f => readText(f)).join('\n\n') || readInput('-')
    const md = toneMarkdown(analyzeTone(text))
    const id = optStr(a, 'job')
    if (id) writeText(join(jobDir(id), 'prep', 'tone.md'), md)
    out(md)
  },

  mail(a) {
    const kind = need(a._[0], 'メール種別')
    const id = optStr(a, 'job')
    const job = id ? loadJob(id) : null
    const profile = loadProfile()
    const text = renderMail(kind, {
      client: optStr(a, 'client') ?? job?.client ?? '（会社名）',
      contact: optStr(a, 'contact') ?? 'ご担当者',
      myName: profile.name,
      title: optStr(a, 'title') ?? job?.title ?? '（案件名）',
      interviewee: optStr(a, 'interviewee'),
      dates: optStr(a, 'dates')
        ?.split(/[,、]/)
        .map(s => s.trim()),
      minutes: optNum(a, 'minutes'),
      format: optStr(a, 'format'),
      deadline: optStr(a, 'deadline'),
      url: optStr(a, 'url'),
      changes: optStr(a, 'changes')
        ?.split(/[;；]/)
        .map(s => s.trim()),
    })
    if (id) writeText(join(jobDir(id), 'mail', `${kind}.txt`), text)
    out(text)
  },

  // ---- 4. 原稿制作 ----
  transcript(a) {
    const raw = readInput(a._[0])
    const map = Object.fromEntries(
      (optStr(a, 'map') ?? '')
        .split(',')
        .filter(Boolean)
        .map(kv => kv.split('=').map(s => s.trim()) as [string, string]),
    )
    const glossary = optStr(a, 'glossary')
      ? readJson<Record<string, string>>(optStr(a, 'glossary')!, {})
      : {}
    const r = cleanTranscript(raw, map, glossary)
    const id = optStr(a, 'job')
    if (id) {
      const dir = join(jobDir(id), 'manuscript')
      writeText(join(dir, 'transcript_clean.md'), r.text)
      writeText(join(dir, 'transcript_report.md'), cleanReportMarkdown(r))
      const kp = extractKeyPoints(r.utterances)
      writeText(join(dir, 'keypoints.md'), keyPointsMarkdown(kp))
      writeText(
        join(dir, 'outline.md'),
        outlineMarkdown(
          buildOutline(
            kp,
            optNum(a, 'chars') ?? loadJob(id).charCount ?? 3000,
            optNum(a, 'headings') ?? 4,
          ),
        ),
      )
      out(cleanReportMarkdown(r))
      out(
        `作成: ${dir}/{transcript_clean,transcript_report,keypoints,outline}.md`,
      )
    } else {
      out(optBool(a, 'report') ? cleanReportMarkdown(r) : r.text)
    }
  },

  points(a) {
    const r = cleanTranscript(readInput(a._[0]))
    out(keyPointsMarkdown(extractKeyPoints(r.utterances)))
  },

  outline(a) {
    const r = cleanTranscript(readInput(a._[0]))
    out(
      outlineMarkdown(
        buildOutline(
          extractKeyPoints(r.utterances),
          optNum(a, 'chars') ?? 3000,
          optNum(a, 'headings') ?? 4,
        ),
      ),
    )
  },

  titles(a) {
    const list = titlePatterns({
      person: optStr(a, 'person') ?? '○○',
      role: optStr(a, 'role') ?? '社員',
      company: optStr(a, 'company') ?? '（社名）',
      keyPhrase: optStr(a, 'phrase') ?? '（印象的な一言）',
      years: optStr(a, 'years'),
    })
    out(list.map(t => `- [${t.type}] ${t.title}`).join('\n'))
  },

  // ---- 5. 校正 ----
  proof(a) {
    const file = need(a._[0], '原稿ファイル')
    const id = optStr(a, 'job')
    const rules = loadRules(id, optStr(a, 'rules'))
    const memoPath =
      optStr(a, 'memo') ??
      (id
        ? [
            join(jobDir(id), 'manuscript', 'memo.md'),
            join(jobDir(id), 'manuscript', 'transcript_clean.md'),
          ].find(existsSync)
        : undefined)
    const memo = memoPath
      ? [memoPath, ...(optStr(a, 'memo2') ? [optStr(a, 'memo2')!] : [])]
          .map(readText)
          .join('\n')
      : undefined
    const md = proofMarkdown(proofread(readText(file), rules, memo))
    if (id) writeText(join(jobDir(id), 'proof.md'), md)
    out(md)
  },

  rules(a) {
    const target = need(a._[0], '案件ID またはクライアント名')
    const path = existsSync(jobDir(target))
      ? join(jobDir(target), 'rules.json')
      : clientFile(target).replace(/\.md$/, '.rules.json')
    if (!existsSync(path)) writeJson(path, RULES_TEMPLATE)
    out(`表記ルール: ${path}\n${readText(path)}`)
  },

  // ---- 6. 納品・修正 ----
  export(a) {
    const file = need(a._[0], '原稿ファイル')
    const format = (optStr(a, 'format') ?? 'docx') as ExportFormat
    if (!['txt', 'md', 'html', 'docx'].includes(format))
      throw new Error(`未対応の形式: ${format}`)
    const id = optStr(a, 'job')
    const name = basename(file).replace(/\.[^.]+$/, '')
    const outPath =
      optStr(a, 'out') ??
      (id
        ? join(jobDir(id), 'delivery', `${name}.${format}`)
        : `${file.replace(/\.[^.]+$/, '')}.${format}`)
    exportManuscript(
      readText(file),
      format,
      outPath,
      optStr(a, 'title') ?? name,
    )
    out(
      `出力: ${outPath}${format === 'html' ? '（Googleドキュメント: Drive にアップロード→「Googleドキュメントで開く」）' : ''}`,
    )
  },

  version(a) {
    const [sub, id] = a._
    need(id, '案件ID')
    if (sub === 'save') {
      const r = saveVersion(
        id!,
        readText(need(a._[2], '原稿ファイル')),
        optStr(a, 'label') ?? '稿',
      )
      out(
        `保存: ${r.file}${r.changesFile ? `\n変更点一覧: ${r.changesFile}` : ''}`,
      )
    } else if (sub === 'list') {
      out(listVersions(id!).join('\n') || '（版なし）')
    } else if (sub === 'diff') {
      const [from, to] = [need(a._[2], '比較元'), need(a._[3], '比較先')]
      const before = readText(resolveVersion(id!, from))
      const after = readText(resolveVersion(id!, to))
      out(changesMarkdown(changeList(before, after), from, to, before, after))
    } else throw new Error('cw version save|list|diff')
  },

  // ---- 7. 経理・事務 ----
  books(a) {
    const sub = a._[0]
    const profile = loadProfile()
    const today = toISODate(new Date())
    switch (sub) {
      case 'fee': {
        const amt = Number(need(a._[1], '金額'))
        const fee = systemFee(amt, profile.fees.tiers)
        out(
          `契約金額 ${yen(amt)} → 手数料 ${yen(fee)} → 手取り ${yen(amt - fee)}（振込手数料 ${yen(profile.fees.transferFee)} は出金時に別途）`,
        )
        return
      }
      case 'add': {
        const id = need(a._[1], '案件ID')
        const job = existsSync(join(jobDir(id), 'job.json'))
          ? loadJob(id)
          : null
        const e = addLedger(
          {
            jobId: id,
            client: optStr(a, 'client') ?? job?.client ?? '-',
            title: optStr(a, 'title') ?? job?.title ?? id,
            amount: optNum(a, 'amount') ?? job?.budgetMax ?? 0,
            dueDate: optStr(a, 'due') ?? job?.deadline ?? undefined,
            contractDate: optStr(a, 'date'),
          },
          profile,
        )
        out(
          `売上台帳に登録: ${e.title} 契約 ${yen(e.amount)} − 手数料 ${yen(e.fee)} = 手取り ${yen(e.net)}`,
        )
        return
      }
      case 'status': {
        const e = updateLedgerStatus(
          need(a._[1], '案件ID'),
          need(a._[2], '状態') as EntryStatus,
          optStr(a, 'date') ?? today,
          optStr(a, 'pay-date'),
        )
        out(`更新: ${e.jobId} → ${e.status}`)
        return
      }
      case 'log': {
        logWork({
          date: optStr(a, 'date') ?? today,
          jobId: need(a._[1], '案件ID'),
          hours: Number(need(a._[2], '時間')),
          task: optStr(a, 'task') ?? '',
        })
        out('稼働を記録しました')
        return
      }
      case 'expense': {
        addExpense({
          date: optStr(a, 'date') ?? today,
          amount: Number(need(a._[1], '金額')),
          category: optStr(a, 'category') ?? '雑費',
          memo: optStr(a, 'memo') ?? '',
        })
        out('経費を記録しました')
        return
      }
      case 'payout': {
        const po = addPayout(
          Number(need(a._[1], '出金額')),
          profile,
          optStr(a, 'date') ?? today,
        )
        out(
          `出金を記録: ${yen(po.amount)}（振込手数料 ${yen(po.transferFee)}、着金 ${yen(po.amount - po.transferFee)}）`,
        )
        return
      }
      case 'month': {
        const m = a._[1] ?? today.slice(0, 7)
        const md = monthlyMarkdown(monthlyReport(m, loadLedger(), loadWork()))
        writeText(p('reports', `monthly_${m}.md`), md)
        out(md)
        return
      }
      case 'tax': {
        const y = a._[1] ?? today.slice(0, 4)
        const md = taxMarkdown(
          taxSummary(y, loadLedger(), loadExpenses(), loadPayouts()),
        )
        writeText(p('reports', `tax_${y}.md`), md)
        out(md)
        return
      }
      case 'pending': {
        const items = pendingCheck(loadLedger())
        out(
          items.length
            ? items
                .map(i => `- [${i.status}] ${i.jobId} ${i.title}: ${i.issue}`)
                .join('\n')
            : '未処理はありません',
        )
        return
      }
      case 'list':
        out(ledgerTable(loadLedger()))
        return
      default:
        throw new Error(
          'cw books fee|add|status|log|expense|payout|month|tax|pending|list',
        )
    }
  },

  // ---- 8. ナレッジ ----
  wins(a) {
    out(winsMarkdown(analyzeWins(loadApplications(), optNum(a, 'min') ?? 2)))
  },

  portfolio(a) {
    if (a._[0] === 'add') {
      const title = need(optStr(a, 'title'), '--title')
      const tags = optStr(a, 'tags')?.split(',')
      const date = optStr(a, 'date') ?? toISODate(new Date())
      // 本文ファイルがない実績（紙面掲載など）は --summary と --genres で登録する
      const item = a._[1]
        ? portfolioFromArticle(readText(a._[1]), {
            title,
            url: optStr(a, 'url') ?? '',
            tags,
            date,
          })
        : {
            id: safeName(title).slice(0, 40),
            title,
            url: optStr(a, 'url') ?? '',
            genres: optStr(a, 'genres')?.split(',') ?? [],
            tags: tags ?? [],
            summary: need(
              optStr(a, 'summary'),
              '記事ファイル または --summary',
            ),
            date,
          }
      const list = addPortfolio(item)
      out(
        `ポートフォリオに追加（計${list.length}本）:\n${JSON.stringify(item, null, 2)}`,
      )
    } else {
      out(portfolioMarkdown(loadProfile().portfolio))
    }
  },

  templates(a) {
    if (a._[0] !== 'harvest')
      throw new Error('cw templates harvest <記事や文字起こし...>')
    const texts = a._.slice(1).map(readText)
    const counts = updateTemplates(harvestTemplates(texts))
    out(
      `テンプレ集を更新: ${Object.entries(counts)
        .map(([k, v]) => `${k} +${v}`)
        .join(' / ')}（${p('templates')}）`,
    )
  },

  client(a) {
    const [sub, name] = a._
    need(name, 'クライアント名')
    if (sub === 'note') {
      const path = addClientNote(
        name!,
        need(a._[2], 'メモ'),
        optStr(a, 'category'),
      )
      out(`追記: ${path}`)
    } else if (sub === 'hints') {
      const hints = preferenceHints(readInput(a._[2]))
      for (const h of hints) addClientNote(name!, h, '修正傾向')
      out(hints.map(h => `- ${h}`).join('\n') || '抽出なし')
    } else {
      out(readTextIfExists(clientFile(name!)) ?? '（メモなし）')
    }
  },
}

const HELP = `cw — クラウドワークス副業 自動化CLI（データ: ${cwHome()}）

  init                                 初期設定（profile.json 作成）
 1 案件探索・選定
  scout <file...> [--dry-run]           案件テキスト/HTMLを抽出・スコアリング・判定メモ保存
  scout list                            保存済み案件の一覧
 2 応募・提案文
  propose <id> [--bid N]                提案文（詳細版・短縮版）＋対応表＋ポートフォリオ選定
  apply <id> [--bid N --variant short|long --text 送信文.txt]  応募履歴に追記
  result <id> won|lost|withdrawn|no_reply [--note]            結果を記録
  apps [--csv]                          応募履歴
 3 受注後の準備
  prep <id> --role "入社3年目のエンジニア" [--minutes 60]   質問リスト・ヒアリングシート・チェックリスト
  tone <記事...> [--job id]             既存記事のトーン＆マナー分析
  mail <種別> [--job id --contact 名前 --dates "10/1 10:00,10/2 14:00"]
       種別: interview-request | schedule | interview-confirm | delivery | revision-ack | revision-done
 4 原稿制作
  transcript <file> [--job id --map "話者1=聞き手,話者2=田中"]   整形・要点・構成案
  points <file> / outline <file> [--chars 3000 --headings 4]
  titles --person 田中 --role エンジニア --company 社名 --phrase "..."
 5 校正
  proof <原稿> [--job id --rules rules.json --memo 取材メモ]   表記・誤字・NG・規制表現・文字数・事実照合
  rules <id|クライアント名>             表記ルールJSONを作成/表示
 6 納品・修正
  export <原稿.md> --format docx|html|txt|md [--job id]
  version save <id> <原稿> --label 初稿 / version list <id> / version diff <id> v1 v2
 7 経理・事務
  books fee <金額> | add <id> --amount N | status <id> delivered|accepted|paid [--pay-date]
  books log <id> <時間> --task 執筆 | expense <金額> --category 通信費 | payout <出金額>
  books month [YYYY-MM] | tax [YYYY] | pending | list
 8 ナレッジ
  wins                                  勝ちパターン分析
  portfolio add <記事> --title T --url U | portfolio add --title T --summary S --genres 経営者,地域 | portfolio list
  templates harvest <ファイル...>       質問・見出し・言い回しテンプレを更新
  client note <名前> "メモ" | client hints <名前> <修正依頼.txt> | client show <名前>
`

export function main(argv: string[]): void {
  const [cmd, ...rest] = argv
  if (!cmd || cmd === 'help' || cmd === '--help') {
    out(HELP)
    return
  }
  const fn = commands[cmd]
  if (!fn) {
    out(`不明なコマンド: ${cmd}\n\n${HELP}`)
    process.exitCode = 1
    return
  }
  fn(parseArgs(rest))
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2))
  } catch (e) {
    process.stderr.write(`エラー: ${(e as Error).message}\n`)
    process.exitCode = 1
  }
}
