import { escapeRegExp, findAll } from '../util/text.js'

/** フィラー（言いよどみ）。語として意味を持つ「あの」「その」は読点・長音付きのみ除去。 */
const FILLERS = [
  /(?:えー+と?|ええと|えっと|えーっと)[、,]?\s*/g,
  /(?:あのー+|あの[、,])\s*/g,
  /(?:そのー+|その[、,])\s*/g,
  /(?:まあ|まぁ)[、,]\s*/g,
  /(?:なんか|なんていうか|何ていうか)[、,]\s*/g,
  /(?:うーん|うーむ|んー+|う～ん)[、,。]?\s*/g,
  /(?:こう|ちょっと)[、,]\s*(?=[^、。]{0,3}[、,])/g,
  /(?:ですね|ですねー)[、,]\s*/g,
]

/** 誤変換しやすい同音異義語。どちらも正しい場合があるため「候補」として提示する。 */
export const HOMOPHONES: string[][] = [
  ['以外', '意外'],
  ['関心', '感心', '歓心'],
  ['体制', '態勢', '体勢'],
  ['保証', '保障', '補償'],
  ['務める', '努める', '勤める'],
  ['追求', '追及', '追究'],
  ['対象', '対照', '対称'],
  ['機会', '機械'],
  ['構成', '更生', '厚生', '校正'],
  ['意思', '意志'],
  ['規定', '既定'],
  ['異動', '移動', '異同'],
  ['紹介', '照会', '商会'],
  ['始め', '初め'],
  ['早い', '速い'],
  ['会う', '合う'],
  ['聞く', '聴く', '効く'],
  ['制作', '製作'],
  ['時期', '時季', '次期'],
  ['開放', '解放'],
]

export interface Utterance {
  speaker: string
  text: string
  time?: string
}

export interface CleanResult {
  utterances: Utterance[]
  fillersRemoved: number
  candidates: {
    word: string
    alternatives: string[]
    line: number
    context: string
  }[]
  text: string
}

const SPEAKER_LINE =
  /^(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*)?([^\s:：「」()（）]{1,16}?)\s*[:：]\s*(.*)$/
const SPEAKER_ONLY =
  /^(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*)?(話者\s*\d+|Speaker\s*\d+|[A-ZＡ-Ｚ]|インタビュアー|聞き手|話し手)\s*$/i

/**
 * 文字起こしを整形する。
 * - 「田中：」「[00:01:23] 話者1:」「Speaker 1」単独行などの話者表記を認識
 * - 連続する同一話者の発言を結合
 * - フィラー除去・重複読点の整理
 * - speakerMap で「話者1→聞き手」などに置換
 */
export function cleanTranscript(
  raw: string,
  speakerMap: Record<string, string> = {},
  glossary: Record<string, string> = {},
): CleanResult {
  const utterances: Utterance[] = []
  let current: Utterance | null = null
  let fillersRemoved = 0

  const push = (speaker: string, text: string, time?: string) => {
    const sp = speakerMap[speaker] ?? speaker
    if (current && current.speaker === sp) {
      current.text += text
    } else {
      current = { speaker: sp, text, time }
      utterances.push(current)
    }
  }

  for (const line of raw.replace(/\r/g, '').split('\n')) {
    const l = line.trim()
    if (!l) continue
    const only = l.match(SPEAKER_ONLY)
    if (only) {
      const sp = only[2]!.replace(/\s+/g, '')
      const mapped = speakerMap[sp] ?? sp
      current = { speaker: mapped, text: '', time: only[1] }
      utterances.push(current)
      continue
    }
    const m = l.match(SPEAKER_LINE)
    if (m && !/^https?$/.test(m[2]!)) {
      push(m[2]!.replace(/\s+/g, ''), m[3]!, m[1])
    } else if (current) {
      ;(current as Utterance).text += l
    } else {
      push('不明', l)
    }
  }

  for (const u of utterances) {
    let t = u.text
    for (const re of FILLERS) {
      t = t.replace(re, () => {
        fillersRemoved++
        return ''
      })
    }
    for (const [wrong, right] of Object.entries(glossary)) {
      t = t.replace(new RegExp(escapeRegExp(wrong), 'g'), right)
    }
    u.text = t
      .replace(/[、,]{2,}/g, '、')
      .replace(/。{2,}/g, '。')
      .replace(/^[、。\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const nonEmpty = utterances.filter(u => u.text)
  const text = nonEmpty.map(u => `${u.speaker}：${u.text}`).join('\n\n')
  const candidates: CleanResult['candidates'] = []
  for (const group of HOMOPHONES) {
    for (const w of group) {
      for (const h of findAll(text, new RegExp(escapeRegExp(w)))) {
        candidates.push({
          word: w,
          alternatives: group.filter(x => x !== w),
          line: h.line,
          context: h.context,
        })
      }
    }
  }
  return { utterances: nonEmpty, fillersRemoved, candidates, text }
}

export function cleanReportMarkdown(r: CleanResult): string {
  return [
    '# 文字起こし整形レポート',
    '',
    `- 発言ブロック数: ${r.utterances.length}`,
    `- 話者: ${[...new Set(r.utterances.map(u => u.speaker))].join('、')}`,
    `- フィラー除去: ${r.fillersRemoved}箇所`,
    '',
    '## 誤変換候補（要確認）',
    '',
    ...(r.candidates.length
      ? r.candidates
          .slice(0, 100)
          .map(
            c =>
              `- L${c.line}「${c.word}」→ ${c.alternatives.join('／')}？ …${c.context}…`,
          )
      : ['- なし']),
    '',
  ].join('\n')
}
