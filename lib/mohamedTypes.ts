import type { BillingPeriod, BillingReviewItem } from './mohamedValidation'

export type MohamedRunMode = 'dry_run' | 'review'
export type MohamedRunStatus = 'review_ready' | 'blocked' | 'failed'
export type MohamedRunSource = 'synthetic_fixture' | 'axiscare_report' | 'axiscare_api'
export type MohamedStageStatus = 'passed' | 'blocked' | 'failed' | 'not_run'

export type MohamedAutomationStage = {
  name: string
  status: MohamedStageStatus
  detail: string
}

export type MohamedAutomationRun = {
  id: string
  startedAt: string
  finishedAt: string | null
  mode: MohamedRunMode
  source: MohamedRunSource
  status: MohamedRunStatus
  billingPeriods: BillingPeriod[]
  stages: MohamedAutomationStage[]
  items: BillingReviewItem[]
}
