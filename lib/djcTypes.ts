// Types for the DJC → Salesforce automation (distinct from the Kimedics shapes in types.ts).
// Backed by the DJC Supabase project: djc_runs, djc_candidates, djc_event_log.

export type DjcDayStatusKind = 'operational' | 'degraded' | 'outage' | 'idle' | 'no_data'

export interface DjcDayStatus {
  day: string // YYYY-MM-DD
  totalRuns: number
  completedRuns: number
  candidatesSeen: number
  candidatesSelected: number
  contactable: number
  duplicates: number
  created: number
  createSkippedGuard: number
  errors: number
  /** Runs that ended in error / session_expired (drives the red day bar). */
  errorRuns: number
  /** "HH:MM — status" per failed run, UTC (for the day-bar details popover). */
  errorRunDetails: string[]
  status: DjcDayStatusKind
}

export type DjcRunStatus = 'ok' | 'running' | 'error' | 'session_expired'

export interface DjcRunDetail {
  id: number
  startedAt: string
  finishedAt: string | null
  durationSeconds: number | null
  status: DjcRunStatus
  trigger: string | null
  writeMode: string | null // 'off' (read-only/dry) | 'live'
  targets: string | null
  targetsProcessed: number
  candidatesSeen: number
  candidatesSelected: number
  contactable: number
  uncontactable: number
  duplicates: number
  created: number
  createSkippedGuard: number
  errors: number
  warnCount: number
  errorCount: number
  quotaBlocked: number // candidates whose DJC profile couldn't be viewed — Profile Views quota hit
  viewsSpent: number // profiles actually opened, i.e. Profile Views charged for this run
}

export type DjcEventLevel = 'info' | 'warn' | 'error'

export interface DjcEvent {
  id: number
  runId: number | null
  candidateId: string | null
  eventType: string
  stage: string | null
  level: DjcEventLevel
  message: string | null
  payload: Record<string, unknown> | null
  createdAt: string
}

export interface DjcCandidateRow {
  candidateId: string
  profileUrl: string | null
  name: string | null
  target: string | null
  phone: string | null
  email: string | null
  contactSource: string | null // profile | cv | profile+cv | none
  // True when the Profile Views wall stopped the contact reveal. Without it, contact_source
  // 'none' is ambiguous — 'we looked and found nothing' and 'we were never allowed to look'
  // are indistinguishable, and the UI showed both as "Skipped — no contact info".
  quotaBlocked?: boolean
  // Per-run facts. The flag above is lifetime state and must not be used inside a run view — a
  // candidate blocked in an earlier run but opened in this one is not "blocked" here.
  blockedThisRun?: boolean
  openedThisRun?: boolean
  createdThisRun?: boolean
  matchedThisRun?: boolean
  mailingCity: string | null
  mailingState: string | null
  mailingPostalCode: string | null
  stateLicenses: string | null
  preferredStates: string | null
  positionTypes: string | null
  cvUploaded: boolean
  cvFilename: string | null
  cvBytesLen: number | null
  dedupStatus: string | null // new | duplicate
  dedupReason: string | null // phone | email | name+link
  sfContactId: string | null
  matchCount: number | null
  addedAt: string | null // when we first created this candidate in SF (first_seen_at)
  lastReviewedOn: string | null // last date we confirmed them active in the DJC scan (view-free)
}

export interface DjcRunDetailBundle {
  events: DjcEvent[]
  candidates: DjcCandidateRow[]
}
export interface DjcProfileViews {
  used: number
  total: number
  remaining: number
  // True when used > total: an add-on pack is in play, so remaining is unknown from this page but
  // definitely NOT zero. Rendering "0 left" here reads as an outage when views are available.
  addonActive: boolean
  checkedAt: string
}

export interface DjcTotals {
  totalRuns: number
  candidatesSeen: number
  contactable: number
  duplicates: number
  wouldCreate: number // create_skipped_guard while writes off
  created: number
  errors: number
}

export interface DjcSummary extends DjcTotals {
  last7: DjcTotals // rolling 7-day window (same fields)
  lastRunAt: string | null
}


/** One candidate the Profile Views quota blocked. `resolution` is DB-only — see getDjcQuotaBlocked. */
export type DjcQuotaBlockedResolution = 'already_in_sf' | 'needs_view' | 'checked_empty' | 'gone'

export interface DjcQuotaBlockedRow {
  candidateId: string
  displayName: string | null
  nameMasked: boolean // true = DJC only ever showed initials; we can't dedup-check them yet
  target: string | null
  profileUrl: string | null
  sfContactId: string | null
  firstBlocked: string
  lastBlocked: string
  blockCount: number
  stillListed: boolean // present in the most recent (view-free) list scan
  // Everything the free search card gives us. Not enough to dedup on (measured: initials + state
  // + specialty recalls only ~75% of known Salesforce contacts), but it is what makes a manual
  // check possible without opening the profile.
  cardLocation: string | null
  registeredOn: string | null
  degrees: string | null
  lastActivity: string | null
  resolution: DjcQuotaBlockedResolution
}

/** One day of Profile View efficiency: what each view bought. */
export interface DjcViewEfficiencyDay {
  day: string
  views: number      // profiles actually opened (a view was charged)
  created: number    // new Salesforce contacts that came from them
  freeSkips: number  // duplicates caught without spending a view
}

/** One week of Profile View conversion — the headline efficiency trend. */
export interface DjcViewEfficiencyWeek {
  week: string
  views: number    // views actually paid for
  created: number  // how many became a Salesforce contact
  freeSkips: number // duplicates caught without spending a view
  rate: number     // created / views, as a percentage
}

/** Time windows for the pipeline funnel. Kept here (no DB imports) so client components can use it. */
export type PipelineRange = '7d' | '30d' | 'all'

export const PIPELINE_RANGES: { key: PipelineRange; label: string }[] = [
  { key: '7d', label: 'Past 7 days' },
  { key: '30d', label: 'Past month' },
  { key: 'all', label: 'All time' },
]
