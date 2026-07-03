/**
 * Actual billed AI spend, straight from the vendors' usage/cost APIs.
 *
 * These require an ADMIN key (regular API keys can't read org billing):
 *   OPENAI_ADMIN_KEY      — OpenAI Admin key (sk-admin-…)  → Kimedics
 *   ANTHROPIC_ADMIN_KEY   — Anthropic Admin key (sk-ant-admin-…) → DJC
 *
 * OpenAI: the Costs API reports real dollars, so we use it directly.
 *
 * Anthropic: we DON'T use cost_report — it returns amounts in cents despite a
 * `currency: USD` label (verified 2026-06: it read $135.97 for a month whose real
 * API invoice was ~$1.36, an exact ×100 on both input and output). Instead we read
 * the token usage meter and price it at list — unit-unambiguous, reconciles with
 * the real invoice, and attributable to the specific model(s) the org actually ran.
 *
 * When a key is absent or the call fails, we return { available: false } and the
 * UI falls back to the activity-based estimate.
 */

import { MODEL_PRICING } from './aiCost'

export interface ActualCost {
  available: boolean
  last30: number | null
  last7: number | null
  currency: string
  error?: string
}

const UNAVAILABLE: ActualCost = { available: false, last30: null, last7: null, currency: 'USD' }

/** Pull every numeric "amount" out of a results array (vendors vary: number vs string). */
function sumAmounts(results: unknown): number {
  if (!Array.isArray(results)) return 0
  let total = 0
  for (const r of results) {
    const raw = (r as Record<string, unknown>)?.amount
    const v = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).value : raw
    const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
    if (Number.isFinite(n)) total += n
  }
  return total
}

/** Kimedics (OpenAI) — Costs API, daily buckets over the last 30 days. */
export async function getOpenAiActualCost(): Promise<ActualCost> {
  const key = (process.env.OPENAI_ADMIN_KEY || '').trim()
  if (!key) return UNAVAILABLE
  try {
    const now = Math.floor(Date.now() / 1000)
    const start = now - 30 * 86400
    const cut7 = now - 7 * 86400
    const url = `https://api.openai.com/v1/organization/costs?start_time=${start}&bucket_width=1d&limit=31`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return { ...UNAVAILABLE, error: `OpenAI billing ${res.status}` }
    const j: { data?: { start_time?: number; results?: unknown }[] } = await res.json()
    let last30 = 0
    let last7 = 0
    for (const b of j.data ?? []) {
      const amt = sumAmounts(b.results)
      last30 += amt
      if ((b.start_time ?? 0) >= cut7) last7 += amt
    }
    return { available: true, last30, last7, currency: 'USD' }
  } catch (e) {
    return { ...UNAVAILABLE, error: e instanceof Error ? e.message : 'fetch failed' }
  }
}

interface AnthropicUsageRow {
  model?: string
  uncached_input_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  output_tokens?: number
}

/** Match a live model id to our pricing table — the API returns dated ids (claude-haiku-4-5-20251001). */
function pricingForModel(model: string | undefined) {
  if (!model) return undefined
  if (MODEL_PRICING[model]) return MODEL_PRICING[model]
  const base = model.replace(/-\d{6,8}$/, '') // strip trailing date snapshot
  if (MODEL_PRICING[base]) return MODEL_PRICING[base]
  return Object.entries(MODEL_PRICING).find(([k]) => model.startsWith(k))?.[1]
}

/** Price one usage row at list (cache read 0.1×, cache write 1.25× input — DJC uses neither today). */
function priceAnthropicRow(r: AnthropicUsageRow): number {
  const p = pricingForModel(r.model)
  if (!p) return 0
  const inTok = (r.uncached_input_tokens ?? 0) + 1.25 * (r.cache_creation_input_tokens ?? 0) + 0.1 * (r.cache_read_input_tokens ?? 0)
  return (inTok / 1e6) * p.in + ((r.output_tokens ?? 0) / 1e6) * p.out
}

/**
 * DJC (Anthropic) — token usage meter priced at list (see file header for why not cost_report).
 * Daily buckets over 30 days, grouped by model; reconciles to the real API invoice.
 */
export async function getAnthropicActualCost(): Promise<ActualCost> {
  const key = (process.env.ANTHROPIC_ADMIN_KEY || '').trim()
  if (!key) return UNAVAILABLE
  try {
    const now = Date.now()
    const startIso = new Date(now - 30 * 86400_000).toISOString()
    const cut7 = now - 7 * 86400_000
    let last30 = 0
    let last7 = 0
    let page: string | undefined
    for (let guard = 0; guard < 10; guard++) {
      const qs = new URLSearchParams({ starting_at: startIso, bucket_width: '1d', limit: '31' })
      qs.append('group_by[]', 'model')
      if (page) qs.set('page', page)
      const res = await fetch(`https://api.anthropic.com/v1/organizations/usage_report/messages?${qs}`, {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) return { ...UNAVAILABLE, error: `Anthropic usage ${res.status}` }
      const j: { data?: { starting_at?: string; results?: AnthropicUsageRow[] }[]; has_more?: boolean; next_page?: string } = await res.json()
      for (const b of j.data ?? []) {
        const amt = (b.results ?? []).reduce((s, r) => s + priceAnthropicRow(r), 0)
        last30 += amt
        const t = b.starting_at ? Date.parse(b.starting_at) : 0
        if (t >= cut7) last7 += amt
      }
      if (j.has_more && j.next_page) page = j.next_page
      else break
    }
    return { available: true, last30, last7, currency: 'USD' }
  } catch (e) {
    return { ...UNAVAILABLE, error: e instanceof Error ? e.message : 'fetch failed' }
  }
}

export interface AnthropicKeyCosts {
  available: boolean
  /** api_key_id → last-30d cost (list-priced). */
  byKey: Record<string, number>
  error?: string
}

/**
 * Anthropic last-30d cost split per API key — one key per project, so this is the
 * per-project attribution (grouped by api_key_id + model, priced at list like above).
 */
export async function getAnthropicCostByKey(): Promise<AnthropicKeyCosts> {
  const key = (process.env.ANTHROPIC_ADMIN_KEY || '').trim()
  if (!key) return { available: false, byKey: {} }
  try {
    const startIso = new Date(Date.now() - 30 * 86400_000).toISOString()
    const byKey: Record<string, number> = {}
    let page: string | undefined
    for (let guard = 0; guard < 10; guard++) {
      const qs = new URLSearchParams({ starting_at: startIso, bucket_width: '1d', limit: '31' })
      qs.append('group_by[]', 'api_key_id')
      qs.append('group_by[]', 'model')
      if (page) qs.set('page', page)
      const res = await fetch(`https://api.anthropic.com/v1/organizations/usage_report/messages?${qs}`, {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) return { available: false, byKey: {}, error: `Anthropic usage ${res.status}` }
      const j: { data?: { results?: (AnthropicUsageRow & { api_key_id?: string })[] }[]; has_more?: boolean; next_page?: string } = await res.json()
      for (const b of j.data ?? []) {
        for (const r of b.results ?? []) {
          const id = r.api_key_id ?? 'unknown'
          byKey[id] = (byKey[id] ?? 0) + priceAnthropicRow(r)
        }
      }
      if (j.has_more && j.next_page) page = j.next_page
      else break
    }
    return { available: true, byKey }
  } catch (e) {
    return { available: false, byKey: {}, error: e instanceof Error ? e.message : 'fetch failed' }
  }
}
