import dayjs from 'dayjs'
import { createWorker } from 'tesseract.js'

export type ReceiptScanResult = {
  text: string
  title?: string | null
  amount?: number | null
  currency?: string | null
  occurredAt?: string | null // YYYY-MM-DD
}

let workerPromise: Promise<any> | null = null

async function getWorker() {
  if (!workerPromise) {
    // English + Swedish improves real Swedish retail receipts (ICA, Coop, etc.).
    workerPromise = createWorker('eng+swe').catch((err) => {
      workerPromise = null
      throw err
    })
  }
  return await workerPromise
}

function normalizeText(txt: string) {
  return txt.replace(/\r/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
}

function detectCurrency(line: string): string | null {
  const s = line.toUpperCase()
  if (s.includes('SEK') || s.includes('KR')) return 'SEK'
  if (s.includes('EUR') || s.includes('€')) return 'EUR'
  if (s.includes('USD') || s.includes('$')) return 'USD'
  if (s.includes('GBP') || s.includes('£')) return 'GBP'
  return null
}

function parseMoneyCandidate(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(/[^0-9.,]/g, '')
  if (!cleaned) return null

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  const decimalIndex = Math.max(lastComma, lastDot)

  const normalized =
    decimalIndex >= 0 && cleaned.length - decimalIndex - 1 <= 2
      ? `${cleaned.slice(0, decimalIndex).replace(/[.,]/g, '')}.${cleaned.slice(decimalIndex + 1)}`
      : cleaned.replace(/[.,]/g, '')

  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function extractAmount(lines: string[]): { amount: number | null; currency: string | null } {
  const keywords = [
    'TOTAL',
    'AMOUNT',
    'SUM',
    'DUE',
    'BALANCE',
    'PAY',
    'TO PAY',
    'GRAND TOTAL',
    'TOTALT',
    'SUMMA',
    'ATT BETALA',
    'AT BETALA',
    'BETALA',
    'KÖPESUMMA',
    'KOPESUMMA',
    'BELOP',
    'BELÖP',
  ]
  const candidates: Array<{ score: number; amount: number; currency: string | null }> = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const upper = line.toUpperCase()
    const currency = detectCurrency(line)

    const hasKeyword = keywords.some((k) => upper.includes(k))
    if (hasKeyword) {
      const n = parseMoneyCandidate(line)
      if (n !== null) candidates.push({ score: 100, amount: n, currency })
      const next = lines[i + 1]
      if (next) {
        const n2 = parseMoneyCandidate(next)
        if (n2 !== null) candidates.push({ score: 90, amount: n2, currency: currency ?? detectCurrency(next) })
      }
    } else {
      // Fallback: collect plausible amounts and choose the largest.
      const n = parseMoneyCandidate(line)
      if (n !== null && n > 0) candidates.push({ score: 10, amount: n, currency })
    }
  }

  if (candidates.length === 0) return { amount: null, currency: null }
  candidates.sort((a, b) => b.score - a.score || b.amount - a.amount)
  const best = candidates[0]
  return { amount: best.amount, currency: best.currency }
}

function extractDate(text: string): string | null {
  // Common receipt formats: YYYY-MM-DD, YYYY/MM/DD, DD-MM-YYYY, DD/MM/YYYY
  const m1 = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/)
  if (m1) {
    const d = dayjs(`${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`)
    return d.isValid() ? d.format('YYYY-MM-DD') : null
  }
  const m2 = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/)
  if (m2) {
    const d = dayjs(`${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`)
    return d.isValid() ? d.format('YYYY-MM-DD') : null
  }
  // Swedish / EU dotted dates: DD.MM.YYYY
  const m3 = text.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/)
  if (m3) {
    const d = dayjs(`${m3[3]}-${m3[2].padStart(2, '0')}-${m3[1].padStart(2, '0')}`)
    return d.isValid() ? d.format('YYYY-MM-DD') : null
  }
  return null
}

function extractTitle(lines: string[]): string | null {
  // Heuristic: first non-empty line that isn't a common header/footer token.
  const blacklist = ['RECEIPT', 'KVITTO', 'TICKET', 'INVOICE', 'VAT', 'TAX', 'TOTAL']
  for (const line of lines.slice(0, 8)) {
    const s = line.trim()
    if (!s) continue
    const up = s.toUpperCase()
    if (blacklist.some((b) => up === b || up.startsWith(`${b} `))) continue
    if (parseMoneyCandidate(s) !== null) continue
    if (s.length < 2) continue
    return s.slice(0, 80)
  }
  return null
}

export function scanReceiptFromText(textRaw: string): ReceiptScanResult {
  const text = normalizeText(textRaw || '')
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const { amount, currency } = extractAmount(lines)
  const occurredAt = extractDate(text)
  const title = extractTitle(lines)

  return { text, amount, currency, occurredAt, title }
}

export async function scanReceiptFromBase64(opts: {
  base64: string
  mimeType?: string | null
}): Promise<ReceiptScanResult> {
  const worker = await getWorker()

  const base64 = opts.base64.includes('base64,') ? opts.base64.split('base64,').pop() || '' : opts.base64
  const { data } = await worker.recognize(`data:${opts.mimeType || 'image/jpeg'};base64,${base64}`)

  return scanReceiptFromText(data.text || '')
}

