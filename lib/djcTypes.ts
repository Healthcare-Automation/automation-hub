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
}

export type DjcEventLevel = 'info' | 'warn' | 'error'

export interface DjcEvent {
  id: number
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
}

export interface DjcRunDetailBundle {
  events: DjcEvent[]
  candidates: DjcCandidateRow[]
}
export interface DjcProfileViews {
  used: number
  total: number
  remaining: number
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

