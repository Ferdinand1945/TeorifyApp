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

/**
 * Provides a shared Tesseract worker instance, creating it on first call.
 *
 * @returns The shared Tesseract worker instance.
 */
async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      // tesseract.js has had API/type differences across versions;
      // this form works with the currently installed package.
      return await createWorker('eng')
    })()
  }
  return await workerPromise
}

/**
 * Normalize line endings and remove extraneous whitespace around lines.
 *
 * @param txt - Input text that may contain Windows CR (`\r`), mixed whitespace, or leading/trailing whitespace
 * @returns The input with `\r` replaced by `\n`, sequences of spaces/tabs immediately before a newline collapsed to a single newline, and leading/trailing whitespace removed
 */
function normalizeText(txt: string) {
  return txt.replace(/\r/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
}

/**
 * Detects a common currency indicator in a single line of text and returns the corresponding 3-letter code.
 *
 * @param line - The text line to inspect for currency markers
 * @returns A 3-letter currency code (`'SEK'`, `'EUR'`, `'USD'`, or `'GBP'`) if a known marker is present, `null` otherwise
 */
function detectCurrency(line: string): string | null {
  const s = line.toUpperCase()
  if (s.includes('SEK') || s.includes('KR')) return 'SEK'
  if (s.includes('EUR') || s.includes('€')) return 'EUR'
  if (s.includes('USD') || s.includes('$')) return 'USD'
  if (s.includes('GBP') || s.includes('£')) return 'GBP'
  return null
}

/**
 * Parses the first plausible monetary value from a raw text fragment.
 *
 * The function strips all characters except digits, dots, and commas; treats a comma followed by exactly two digits as a decimal separator and a comma followed by three digits as a thousands separator; then extracts the first numeric token allowing an optional decimal portion of up to two digits and converts it to a Number.
 *
 * @param raw - Input text that may contain currency symbols, separators, and other characters
 * @returns The parsed numeric amount if a finite number is found, `null` otherwise
 */
function parseMoneyCandidate(raw: string): number | null {
  const cleaned = raw
    .replace(/[^0-9.,]/g, '')
    .replace(/,(?=\d{2}\b)/g, '.') // 12,50 -> 12.50
    .replace(/,(?=\d{3}\b)/g, '') // 1,234 -> 1234
  const m = cleaned.match(/\d+(?:\.\d{1,2})?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/**
 * Extracts the most likely total amount and its currency from a receipt's text lines.
 *
 * Examines lines (top-to-bottom) and prefers values on or immediately after lines containing total-like keywords;
 * when no strong keyword is found, falls back to the largest plausible positive monetary value found.
 *
 * @param lines - Array of trimmed, non-empty receipt text lines in reading order.
 * @returns The selected `amount` and three-letter `currency` code when detected; `null` for each if no amount or currency could be determined.
 */
function extractAmount(lines: string[]): { amount: number | null; currency: string | null } {
  const keywords = ['TOTAL', 'AMOUNT', 'SUM', 'DUE', 'BALANCE', 'PAY', 'TO PAY', 'GRAND TOTAL', 'TOTALT']
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

/**
 * Extracts the first date found in common receipt formats and returns it normalized to YYYY-MM-DD.
 *
 * Supports `YYYY-MM-DD`, `YYYY/MM/DD`, `DD-MM-YYYY`, and `DD/MM/YYYY` patterns; validates the parsed date.
 *
 * @param text - The input text to search (for example OCR output from a receipt)
 * @returns The parsed date as `YYYY-MM-DD` if a supported, valid date is found, `null` otherwise
 */
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
  return null
}

/**
 * Selects a plausible receipt title from the first few OCR lines.
 *
 * Examines up to the first 8 lines and returns the first non-empty line that is not a common header token (e.g., "RECEIPT", "INVOICE", "VAT", "TOTAL"), does not look like a monetary value, and has at least two characters. The returned title is truncated to 80 characters. Returns `null` if no suitable title is found.
 *
 * @param lines - OCR output split into lines (trimmed/unnested strings)
 * @returns The chosen title truncated to 80 characters, or `null` if none found
 */
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

/**
 * Scan a base64-encoded receipt image and extract normalized OCR text plus inferred metadata.
 *
 * @param opts.base64 - Base64 image data or a data-URL fragment (may include a "base64," prefix)
 * @param opts.mimeType - Optional MIME type to use when constructing the data URL (defaults to `image/jpeg` when omitted or null)
 * @returns An object with `text` (normalized OCR output), `amount` (parsed total or null), `currency` (3-letter code or null), `occurredAt` (date string `YYYY-MM-DD` or null), and `title` (inferred receipt title or null)
 */
export async function scanReceiptFromBase64(opts: {
  base64: string
  mimeType?: string | null
}): Promise<ReceiptScanResult> {
  const worker = await getWorker()

  const base64 = opts.base64.includes('base64,') ? opts.base64.split('base64,').pop() || '' : opts.base64
  const { data } = await worker.recognize(`data:${opts.mimeType || 'image/jpeg'};base64,${base64}`)

  const text = normalizeText(data.text || '')
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  const { amount, currency } = extractAmount(lines)
  const occurredAt = extractDate(text)
  const title = extractTitle(lines)

  return { text, amount, currency, occurredAt, title }
}

