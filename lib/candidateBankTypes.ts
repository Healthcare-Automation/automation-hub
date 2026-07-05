export interface CandidateBankKpis {
  totalCandidates: number
  withResume: number
  withEmail: number
  withPhone: number
  withLicense: number
  targets: number
  resumeBytes: number
  lastScraped: string | null
  // Past-7-day slice (by first_seen_at) for the KPI period toggle.
  newCandidates7d: number
  newResumes7d: number
  newEmail7d: number
  newPhone7d: number
}

export interface CandidateBankTargetRow {
  target: string
  count: number
  withResume: number
}

export type CandidateBankRunStatus =
  | 'running'
  | 'ok'
  | 'paused_client_window'
  | 'session_expired'
  | 'error'

export interface CandidateBankRun {
  id: number
  mode: string
  status: CandidateBankRunStatus
  candidatesSeen: number
  stored: number
  updated: number
  resumesStored: number
  errors: number
  startedAt: string
  finishedAt: string | null
}

export interface CandidateBankBundle {
  kpis: CandidateBankKpis
  byTarget: CandidateBankTargetRow[]
  runs: CandidateBankRun[]
}
