import { SF_JOB_DESCRIPTION_FIELD } from '@/lib/sfJobDescriptionField'

/** String form used for diffing and display comparison. */
export function valueToComparableString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export function looksLikeHtmlForDiff(s: string): boolean {
  if (!s || s.length < 3) return false
  return /<\/?[a-z][a-z0-9]*\b/i.test(s)
}

/**
 * Visible text for word-level diff when HTML job descriptions are compared.
 * SSR-safe: regex fallback when `document` / DOMParser are unavailable.
 */
export function htmlToPlainTextForDiff(html: string): string {
  if (!html) return ''
  if (typeof document !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const t = doc.body?.textContent ?? ''
      return t.replace(/\s+/g, ' ').trim()
    } catch {
      /* fall through */
    }
  }
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export function prepareSidesForDiff(
  field: string,
  prev: unknown,
  next: unknown,
): { left: string; right: string; usePlainExtract: boolean } {
  let a = valueToComparableString(prev)
  let b = valueToComparableString(next)
  const usePlainExtract =
    field === SF_JOB_DESCRIPTION_FIELD && (looksLikeHtmlForDiff(a) || looksLikeHtmlForDiff(b))
  if (usePlainExtract) {
    a = htmlToPlainTextForDiff(a)
    b = htmlToPlainTextForDiff(b)
  }
  return { left: a, right: b, usePlainExtract }
}

/** True when audit should treat values as the same (incl. HTML that differs only by markup). */
export function sfFieldValuesEquivalent(a: unknown, b: unknown, field: string): boolean {
  if (valueToComparableString(a) === valueToComparableString(b)) return true
  if (field !== SF_JOB_DESCRIPTION_FIELD) return false
  const sa = valueToComparableString(a)
  const sb = valueToComparableString(b)
  if (!looksLikeHtmlForDiff(sa) && !looksLikeHtmlForDiff(sb)) return false
  return htmlToPlainTextForDiff(sa) === htmlToPlainTextForDiff(sb)
}
