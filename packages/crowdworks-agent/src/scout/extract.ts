import { createHash } from 'node:crypto'
import {
  htmlToText,
  looksLikeHtml,
  normalizeForParse,
  parseJpDate,
  parseJpNumber,
} from '../util/text.js'
import type { InterviewFormat } from '../profile.js'

export type PayType = 'fixed' | 'hourly' | 'per_char' | 'unknown'
export type InterviewKind = InterviewFormat | 'required' | 'unknown'
export type Continuity = 'continuous' | 'single' | 'unknown'

export interface Job {
  id: string
  title: string
  client: string | null
  url: string | null
  payType: PayType
  /** 1記事（1件）あたりの報酬の下限・上限（円） */
  budgetMin: number | null
  budgetMax: number | null
  /** 時間単価制のときの時給（円） */
  hourlyRate: number | null
  /** 文字単価（円/文字）。明示がなければ 報酬÷文字数 で推定 */
  charRate: number | null
  charRateEstimated: boolean
  charCount: number | null
  /** 納期（ISO） */
  deadline: string | null
  /** 応募期限（ISO） */
  applyBy: string | null
  interview: InterviewKind
  continuity: Continuity
  genres: string[]
  /** 募集要項が求めるポイント（REQUIREMENT_DICT のキー） */
  requirements: string[]
  articleCount: number | null
  rawText: string
}

/** ジャンル辞書: ジャンル名 → 検出キーワード */
export const GENRE_DICT: Record<string, string[]> = {
  採用: [
    '採用',
    '求人',
    '社員インタビュー',
    '社員紹介',
    'リクルート',
    '採用サイト',
    '新卒',
    '中途',
  ],
  人事: ['人事', '組織', '人材', '研修', 'HR'],
  IT: ['IT', 'エンジニア', 'SaaS', 'システム', 'プログラミング', 'DX', 'Web'],
  医療: ['医療', '看護', 'クリニック', '病院', '薬剤', '介護', '福祉'],
  金融: ['金融', '保険', '銀行', '証券', 'FX', '投資', 'ファイナンス'],
  不動産: ['不動産', '住宅', '建築', 'リフォーム', '建設'],
  美容: ['美容', 'コスメ', 'エステ', 'ヘアサロン', '脱毛'],
  教育: ['教育', '学校', '塾', 'スクール', '学習'],
  製造: ['製造', 'メーカー', '工場', 'ものづくり'],
  飲食: ['飲食', 'レストラン', 'カフェ', 'グルメ'],
  経営者: ['経営者', '社長', '代表取締役', 'CEO', '創業者'],
  アダルト: ['アダルト', '風俗', 'ナイトワーク'],
  ギャンブル: ['ギャンブル', 'カジノ', 'パチンコ', '競馬'],
  投資勧誘: ['必ず儲かる', '副業で月収', '情報商材'],
}

/** 募集要項で求められやすいポイント → 検出キーワード */
export const REQUIREMENT_DICT: Record<string, { label: string; kw: string[] }> =
  {
    interview: {
      label: '取材力',
      kw: ['取材経験', 'インタビュー経験', '取材力', 'ヒアリング力', '聞き出'],
    },
    structure: {
      label: '構成力',
      kw: ['構成', '見出し', '構成案', '論理的'],
    },
    deadline: {
      label: '納期厳守',
      kw: ['納期厳守', '納期を守', '期限を守', 'スケジュール厳守', '締め切り'],
    },
    communication: {
      label: '迅速なレスポンス',
      kw: ['レスポンス', '連絡', '報連相', 'コミュニケーション', '返信'],
    },
    seo: { label: 'SEO', kw: ['SEO', 'キーワード', '検索上位'] },
    recruiting: {
      label: '採用広報の知見',
      kw: [
        '採用広報',
        '採用記事',
        '求人原稿',
        '採用サイト',
        '採用ブランディング',
      ],
    },
    writing: {
      label: '文章力',
      kw: ['文章力', '読みやすい', '表現力', '校正'],
    },
    revision: {
      label: '修正対応',
      kw: ['修正対応', '修正依頼', '赤字', 'フィードバック'],
    },
    continuity: {
      label: '継続対応',
      kw: ['継続', '長期', '定期的'],
    },
    wordpress: {
      label: 'WordPress入稿',
      kw: ['WordPress', 'ワードプレス', '入稿'],
    },
    photo: { label: '撮影', kw: ['撮影', 'カメラ', '写真'] },
    transcription: { label: '文字起こし', kw: ['文字起こし', 'テープ起こし'] },
  }

function detectKeys(text: string, dict: Record<string, string[]>): string[] {
  return Object.entries(dict)
    .filter(([, kws]) => kws.some(k => text.includes(k)))
    .map(([k]) => k)
}

function extractId(text: string, url: string | null): string | null {
  const m =
    (url ?? '').match(/jobs\/(\d+)/) ??
    text.match(/crowdworks\.jp\/public\/jobs\/(\d+)/) ??
    text.match(/(?:案件ID|仕事ID|ID)\s*[:：#]?\s*(\d{5,})/)
  return m ? m[1]! : null
}

function extractTitle(raw: string, text: string): string {
  const og = raw.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i,
  )
  if (og) return og[1]!.replace(/\s*\|.*$/, '').trim()
  const h1 = raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1) return htmlToText(h1[1]!).trim()
  const labeled = text.match(/(?:案件名|タイトル|仕事名)\s*[:：]\s*(.+)/)
  if (labeled) return labeled[1]!.trim()
  return (text.split('\n').find(l => l.trim()) ?? '無題の案件')
    .trim()
    .slice(0, 80)
}

const NUM = '(\\d[\\d,]*(?:\\.\\d+)?(?:万\\d*)?)'

/** 案件テキスト（コピペ or 保存 HTML）から構造化情報を抽出する。 */
export function extractJob(input: string, today = new Date()): Job {
  const raw = input
  const text = looksLikeHtml(raw) ? htmlToText(raw) : raw.trim()
  const t = normalizeForParse(text)

  const urlMatch = (raw.match(/https?:\/\/crowdworks\.jp\/public\/jobs\/\d+/) ??
    raw.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i,
    )) as RegExpMatchArray | null
  const url = urlMatch ? (urlMatch[1] ?? urlMatch[0]) : null
  const title = extractTitle(raw, text)
  const id =
    extractId(t, url) ??
    `local-${createHash('sha1')
      .update(title + text.slice(0, 500))
      .digest('hex')
      .slice(0, 10)}`

  const clientM = t.match(
    /(?:クライアント|発注者|依頼者|会社名)\s*[:：]?\s*(.+)/,
  )
  const client = clientM
    ? clientM[1]!
        .trim()
        .split(/\s{2,}/)[0]!
        .slice(0, 60)
    : null

  // --- 報酬 ---
  let payType: PayType = 'unknown'
  let budgetMin: number | null = null
  let budgetMax: number | null = null
  let hourlyRate: number | null = null
  let charRate: number | null = null
  let charRateEstimated = false

  const perChar =
    t.match(new RegExp(`文字単価\\s*:?\\s*${NUM}\\s*円`)) ??
    t.match(new RegExp(`1文字\\s*(?:あたり)?\\s*${NUM}\\s*円`)) ??
    t.match(new RegExp(`${NUM}\\s*円\\s*/\\s*(?:1)?文字`))
  if (perChar) {
    payType = 'per_char'
    charRate = parseJpNumber(perChar[1]!)
  }

  const range = t.match(new RegExp(`${NUM}\\s*円\\s*〜\\s*${NUM}\\s*円`))
  const hourly = /時間単価制|時給/.test(t)
  if (hourly) {
    const hm =
      t.match(new RegExp(`(?:時間単価|時給)[^\\d]{0,10}${NUM}\\s*円`)) ?? range
    if (hm) {
      payType = 'hourly'
      hourlyRate = parseJpNumber(hm[1]!)
    }
  }
  if (payType !== 'hourly') {
    const perArticle = t.match(
      new RegExp(`(?:1記事|1本|1件)\\s*(?:あたり)?\\s*:?\\s*${NUM}\\s*円`),
    )
    if (perArticle) {
      budgetMin = budgetMax = parseJpNumber(perArticle[1]!)
    } else if (range) {
      budgetMin = parseJpNumber(range[1]!)
      budgetMax = parseJpNumber(range[2]!)
    } else {
      const single = t.match(
        new RegExp(`(?:報酬|予算|固定報酬制?)[^\\d]{0,10}${NUM}\\s*円`),
      )
      if (single) budgetMin = budgetMax = parseJpNumber(single[1]!)
    }
    if (payType === 'unknown' && budgetMin !== null) payType = 'fixed'
  }

  // --- 文字数 ---
  let charCount: number | null = null
  const cc =
    t.match(new RegExp(`文字数\\s*:?\\s*(?:約)?${NUM}`)) ??
    t.match(/(\d[\d,]{2,}(?:万)?)\s*(?:〜\s*\d[\d,]*\s*)?(?:文字|字)/)
  if (cc) charCount = parseJpNumber(cc[1]!)

  const articleM = t.match(/(\d+)\s*(?:記事|本)(?:\s*程度|\s*\/\s*月|\s*を)/)
  const articleCount = articleM ? Number(articleM[1]) : null

  if (charRate === null && charCount && charCount > 0) {
    const per = budgetMin ?? budgetMax
    if (per !== null) {
      charRate = Math.round((per / charCount) * 100) / 100
      charRateEstimated = true
    }
  }
  if (payType === 'per_char' && charRate && charCount && budgetMin === null) {
    budgetMin = budgetMax = Math.round(charRate * charCount)
  }

  // --- 納期・応募期限 ---
  const dl = t.match(/納期\s*:?\s*([^\n]{0,30})/)
  const deadline = dl ? parseJpDate(dl[1]!, today) : null
  const ab = t.match(/(?:応募期限|募集期限|掲載期限)\s*:?\s*([^\n]{0,30})/)
  const applyBy = ab ? parseJpDate(ab[1]!, today) : null

  // --- 取材 ---
  let interview: InterviewKind = 'unknown'
  if (/取材(?:は)?(?:なし|無し|不要|はありません)|取材なし/.test(t))
    interview = 'none'
  else if (/対面取材|訪問取材|現地取材|現地での取材|来社/.test(t))
    interview = 'onsite'
  else if (
    /オンライン取材|Zoom|Google ?Meet|Teams|リモート取材|オンラインで(?:の)?取材|オンラインインタビュー/i.test(
      t,
    )
  )
    interview = 'online'
  else if (/電話取材|電話で(?:の)?取材/.test(t)) interview = 'phone'
  else if (/取材|インタビュー/.test(t)) interview = 'required'

  // --- 継続性 ---
  let continuity: Continuity = 'unknown'
  if (/継続|長期|定期|毎月|レギュラー|月\d+本/.test(t))
    continuity = 'continuous'
  else if (/単発|1回のみ|スポット/.test(t)) continuity = 'single'

  const genres = detectKeys(text, GENRE_DICT)
  const requirements = Object.entries(REQUIREMENT_DICT)
    .filter(([, v]) => v.kw.some(k => text.includes(k)))
    .map(([k]) => k)
  if (
    interview !== 'none' &&
    interview !== 'unknown' &&
    !requirements.includes('interview')
  )
    requirements.unshift('interview')

  return {
    id,
    title,
    client,
    url,
    payType,
    budgetMin,
    budgetMax,
    hourlyRate,
    charRate,
    charRateEstimated,
    charCount,
    deadline,
    applyBy,
    interview,
    continuity,
    genres,
    requirements,
    articleCount,
    rawText: text,
  }
}

export const INTERVIEW_LABEL: Record<InterviewKind, string> = {
  online: 'オンライン取材',
  onsite: '対面取材',
  phone: '電話取材',
  none: '取材なし',
  required: '取材あり（形式不明）',
  unknown: '記載なし',
}

export const CONTINUITY_LABEL: Record<Continuity, string> = {
  continuous: '継続',
  single: '単発',
  unknown: '不明',
}
