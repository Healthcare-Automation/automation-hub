/**
 * AI cost model — what each automation spends on AI, and why.
 *
 * We estimate spend from REAL activity (how many times each AI step actually ran)
 * × the model's price. It's an estimate, not an invoice: exact figures need a
 * vendor billing/admin key (OpenAI / Anthropic). The split is clean by vendor —
 * Kimedics runs on OpenAI, DJC runs on Anthropic — so each tab maps to one bill.
 */

export type Automation = 'kimedics' | 'djc'

/** USD per 1,000,000 tokens. Update when a vendor changes prices. */
export const MODEL_PRICING: Record<string, { in: number; out: number; vendor: 'OpenAI' | 'Anthropic' }> = {
  'gpt-4.1-mini': { in: 0.4, out: 1.6, vendor: 'OpenAI' },
  'gpt-4o-mini': { in: 0.15, out: 0.6, vendor: 'OpenAI' },
  'claude-haiku-4-5': { in: 1.0, out: 5.0, vendor: 'Anthropic' },
}

export const VENDOR: Record<Automation, 'OpenAI' | 'Anthropic'> = {
  kimedics: 'OpenAI',
  djc: 'Anthropic',
}

/** Activity counts that drive AI calls, for one time window. */
export interface AiActivity {
  jobsCreated: number //     Kimedics: new Job__c records
  dateCalls: number //       Kimedics: posts whose top line changes the dates
  fieldCalls: number //      Kimedics: malformed posts needing field recovery
  matchCalls: number //      Kimedics: jobs with no exact ID match (worksite AI)
  emailsProcessed: number // Kimedics: total job emails handled (volume driver)
  cvParses: number //        DJC: resumes read by AI (volume driver)
}

/** One place an automation calls a model — with the plain-English business reason. */
export interface AiLayer {
  key: string
  name: string
  model: string
  why: string
  driver: string
  tokensIn: number
  tokensOut: number
  volumeFrom: keyof AiActivity
  perDriver?: number
}

export const AI_LAYERS: Record<Automation, AiLayer[]> = {
  kimedics: [
    {
      key: 'intro',
      name: 'Job description rewrite',
      model: 'gpt-4.1-mini',
      why: 'Turns the raw Kimedics post into a clean, client-ready job description in Salesforce.',
      driver: 'Each new job created',
      tokensIn: 350,
      tokensOut: 180,
      volumeFrom: 'jobsCreated',
    },
    {
      key: 'dates',
      name: 'Date interpretation',
      model: 'gpt-4.1-mini',
      why: 'Reads tricky date updates (“dates added”, cancellations) so coverage dates are always correct — the field clients kept flagging as wrong.',
      driver: 'Posts whose top line changes the dates',
      tokensIn: 600,
      tokensOut: 60,
      volumeFrom: 'dateCalls',
    },
    {
      key: 'fields',
      name: 'Field recovery safety-net',
      model: 'gpt-4.1-mini',
      why: 'Recovers fields when a post has human formatting errors (a missing colon, a typo) so nothing is silently dropped.',
      driver: 'Malformed posts only (~1%)',
      tokensIn: 450,
      tokensOut: 120,
      volumeFrom: 'fieldCalls',
    },
    {
      key: 'match',
      name: 'Worksite matching',
      model: 'gpt-4o-mini',
      why: 'Decides whether a job belongs to an existing clinic or needs a new one — prevents duplicate worksites.',
      driver: 'Jobs with no exact ID match',
      tokensIn: 400,
      tokensOut: 60,
      volumeFrom: 'matchCalls',
    },
    {
      key: 'insight',
      name: 'Source-note cleanup',
      model: 'gpt-4o-mini',
      why: 'Strips internal recruiter notes out of the client-facing description.',
      driver: 'Each new job created',
      tokensIn: 250,
      tokensOut: 80,
      volumeFrom: 'jobsCreated',
    },
  ],
  djc: [
    {
      key: 'cv',
      name: 'Resume parsing',
      model: 'claude-haiku-4-5',
      why: 'Reads a candidate’s resume in memory to recover phone/email when the DJC profile is missing them — turns uncontactable candidates into reachable ones.',
      driver: 'Each resume processed (incl. a vision pass for scanned PDFs)',
      tokensIn: 1800,
      tokensOut: 60,
      volumeFrom: 'cvParses',
      perDriver: 1.2,
    },
  ],
}

export function layerCost(layer: AiLayer, calls: number): number {
  const p = MODEL_PRICING[layer.model]
  if (!p) return 0
  return (calls * layer.tokensIn) / 1e6 * p.in + (calls * layer.tokensOut) / 1e6 * p.out
}

export interface ComputedLayer extends AiLayer {
  calls: number
  cost: number
  vendor: 'OpenAI' | 'Anthropic'
}

/** Compute per-layer + total cost for one automation over one activity window. */
export function computeCost(automation: Automation, activity: AiActivity) {
  const layers: ComputedLayer[] = AI_LAYERS[automation].map((l) => {
    const calls = Math.round((activity[l.volumeFrom] ?? 0) * (l.perDriver ?? 1))
    return { ...l, calls, cost: layerCost(l, calls), vendor: MODEL_PRICING[l.model]?.vendor ?? 'OpenAI' }
  })
  const total = layers.reduce((s, l) => s + l.cost, 0)
  const totalCalls = layers.reduce((s, l) => s + l.calls, 0)
  return { layers, total, totalCalls }
}

export const fmtUSD = (n: number): string => {
  if (n <= 0) return '$0'
  if (n < 0.01) return '<$0.01'
  if (n >= 100) return `$${n.toFixed(0)}`
  return `$${n.toFixed(2)}`
}

// ── Pricing schedule — set expectations for how cost scales with usage ──────────

/** The single volume number a non-technical reader thinks in, per automation. */
export const PRIMARY_UNIT: Record<Automation, { key: keyof AiActivity; unit: string; unitPlural: string }> = {
  kimedics: { key: 'emailsProcessed', unit: 'job email', unitPlural: 'job emails' },
  djc: { key: 'cvParses', unit: 'resume', unitPlural: 'resumes' },
}

/** Usage tiers (per month) — "easy / medium / hard" load levels. */
export const USAGE_TIERS: { label: string; note: string; volume: number }[] = [
  { label: 'Light', note: 'easy', volume: 1_000 },
  { label: 'Medium', note: 'medium', volume: 5_000 },
  { label: 'Heavy', note: 'hard', volume: 20_000 },
]

export interface ScheduleRow {
  label: string
  note: string
  volume: number
  cost: number
  isCurrent: boolean
}

/**
 * A pricing schedule: the cost-per-unit "rule of thumb" plus a light/medium/heavy
 * table. Cost is linear in volume (calls × tokens × price), so we derive the rate
 * from the real recent mix and scale it — "2× the volume ≈ 2× the cost".
 */
export function pricingSchedule(automation: Automation, monthlyActivity: AiActivity) {
  const { total } = computeCost(automation, monthlyActivity)
  const pu = PRIMARY_UNIT[automation]
  const currentVolume = monthlyActivity[pu.key] ?? 0
  const perUnit = currentVolume > 0 ? total / currentVolume : 0
  const per1k = perUnit * 1000
  const rows: ScheduleRow[] = USAGE_TIERS.map((t) => ({
    label: t.label,
    note: t.note,
    volume: t.volume,
    cost: perUnit * t.volume,
    isCurrent: currentVolume >= t.volume * 0.5 && currentVolume < t.volume * 2,
  }))
  return { ...pu, per1k, perUnit, currentVolume, rows, hasData: currentVolume > 0 }
}
