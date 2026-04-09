export type DayStatusKind = 'operational' | 'degraded' | 'outage' | 'idle' | 'no_data'

export interface DayStatus {
  day: string // YYYY-MM-DD
  totalRuns: number
  completedRuns: number
  emailsScraped: number
  jobsScraped: number
  sfPatches: number
  sfErrors: number
  status: DayStatusKind
}

export interface SFErrorDetail {
  jobId: string
  eventType: string
  error: string
}

export interface RunDetail {
  /** gmail run id — pipeline anchor */
  id: number
  /** link_batch run id paired to this gmail run */
  batchId: number | null
  startedAt: string
  finishedAt: string | null
  /** gmail phase duration in seconds */
  gmailDurationSeconds: number | null
  /** link_batch phase duration in seconds */
  batchDurationSeconds: number | null
  /** end-to-end duration from gmail start to batch finish */
  durationSeconds: number | null
  emailCount: number
  jobCount: number
  sfPatchCount: number
  sfErrorCount: number
  status: 'completed' | 'running' | 'error'
  sfErrorDetails: SFErrorDetail[]
}

export interface WeeklySummary {
  emailsProcessed: number
  jobsScraped: number
  sfPatches: number
  totalRuns: number
  completedRuns: number
  successRate: number
  /** Lifetime totals for subtle display alongside rolling 7-day metrics */
  allTime: {
    emailsProcessed: number
    jobsScraped: number
    sfPatches: number
    totalRuns: number
    completedRuns: number
    successRate: number
  }
}

export interface OverallStatus {
  kind: 'operational' | 'degraded' | 'outage'
  label: string
  description: string
}

export interface Phase {
  label: string
  startDate: string  // YYYY-MM-DD
  endDate?: string   // YYYY-MM-DD — undefined means still ongoing
  kind: 'testing' | 'production'
}
