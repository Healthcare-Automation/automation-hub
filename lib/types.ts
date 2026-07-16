export type DayStatusKind = 'operational' | 'degraded' | 'outage' | 'idle' | 'no_data'

export interface DayStatus {
  day: string // YYYY-MM-DD
  totalRuns: number
  completedRuns: number
  emailsScraped: number
  jobsScraped: number
  sfPatches: number
  /** New job records created by automation that day (``job_created_in_salesforce``). */
  sfJobsCreated: number
  /** SF push errors that do NOT have a subsequent patched/recovered event for the same job. */
  sfErrors: number
  /** Successful push-recovery events (``sf_scrape_fields_recovered``). */
  sfRecovered: number
  /** Fields dropped from payload by recovery (``sf_field_quarantined``). */
  sfQuarantined: number
  /** Job updates received that day that NEVER produced content — lost work. */
  emailsDropped: number
  /** Job updates whose content arrived more than 60 min after the email — delayed work. */
  emailsLate: number
  /** Kimedics job ids behind emailsDropped / emailsLate (for the day-bar details popover). */
  droppedJobIds: string[]
  lateJobIds: string[]
  /** Runs that died without finishing (hard-killed; excludes a currently-running run). */
  killedRuns: number
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
  /**
   * Distinct jobs scraped in THIS run that landed a "new update" SF field patch
   * (sf_scrape_fields_patched) near their scrape time — anchored to the run's own
   * jobs rather than the 15-min gmail↔link_batch pairing, so a push that lands in
   * a later batch is still attributed here instead of showing "—".
   */
  sfJobsPushed: number
  /** Distinct jobs scraped in THIS run whose SF fields were written via the quarantine recovery re-run path (sf_scrape_fields_recovered) — kept separate from new updates. */
  sfJobsRecovered: number
  /** Distinct Kimedics job_id values that received a new job record in this link_batch run (``job_created_in_salesforce``). */
  sfJobsCreatedCount: number
  /** Distinct worksite accounts created in Salesforce during this link_batch run (``worksite_created``). */
  worksitesCreatedCount: number
  /**
   * Distinct jobs that experienced a Salesforce-side failure during THIS run
   * (sf_mapping_pull_failed, sf_sync_skipped_no_mapping, sf_scrape_fields_error)
   * AND have been resolved later by any subsequent patch / id-update / record
   * creation / recovery event. Used to label runs as "failed at the time but
   * amended later" in the SF push column.
   */
  recoveredLaterCount: number
  /** SF push errors on this run that do NOT have a subsequent patched/recovered event. */
  sfErrorCount: number
  /** Successful push-recovery events on this run. */
  sfRecoveredCount: number
  /** Fields dropped from payload by recovery on this run. */
  sfQuarantinedCount: number
  /** API names of fields quarantined in this run (for tooltip). */
  sfQuarantinedFields: string[]
  /** Distinct SF records on this run whose External_Job_ID__c was repointed to a different Kimedics job_id (manual validation cue). */
  extJobIdSwapCount: number
  /**
   * Distinct jobs in this run with an unresolved ``job_create_failed`` /
   * ``worksite_create_failed`` event — i.e. jobs that received an email but
   * never produced a Salesforce Job__c record AND haven't been recovered by a
   * successful rescrape or a later populated ``job_content``. Same resolution
   * rules as the admin "Stuck job creation" list.
   */
  unresolvedFailedJobCount: number
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
