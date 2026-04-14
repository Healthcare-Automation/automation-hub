import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { DayStatus, DayStatusKind, OverallStatus } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getDayStatusKind(day: {
  totalRuns: number
  completedRuns: number
  emailsScraped: number
  sfErrors: number
}): DayStatusKind {
  if (day.totalRuns === 0) return 'no_data'
  // In-progress runs are normal; don't mark the day as an outage while a run is still running.
  if (day.completedRuns < day.totalRuns) return 'operational'
  if (day.sfErrors > 0) return 'degraded'
  if (day.emailsScraped === 0) return 'idle'
  return 'operational'
}

export const BAR_COLORS: Record<DayStatusKind, string> = {
  operational: 'bg-emerald-500',
  idle: 'bg-emerald-900',
  degraded: 'bg-amber-500',
  outage: 'bg-red-500',
  no_data: 'bg-zinc-700/50',
}

export const STATUS_COLORS: Record<string, string> = {
  operational: 'text-emerald-400',
  idle: 'text-emerald-700',
  degraded: 'text-amber-400',
  outage: 'text-red-400',
}

export const STATUS_DOT_COLORS: Record<string, string> = {
  operational: 'bg-emerald-500',
  idle: 'bg-emerald-800',
  degraded: 'bg-amber-500',
  outage: 'bg-red-500',
}

export const STATUS_PING_COLORS: Record<string, string> = {
  operational: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  outage: 'bg-red-400',
}

export const STATUS_BG_COLORS: Record<string, string> = {
  operational: 'bg-emerald-500/10 border-emerald-500/20',
  degraded: 'bg-amber-500/10 border-amber-500/20',
  outage: 'bg-red-500/10 border-red-500/20',
}

export const STATUS_LABELS: Record<DayStatusKind, string> = {
  operational: 'Operational',
  idle: 'Idle',
  degraded: 'Degraded',
  outage: 'Outage',
  no_data: 'No data',
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 60) return 'just now'
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

export function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function calculateUptime(days: DayStatus[]): string {
  const activeDays = days.filter(d => d.totalRuns > 0)
  if (activeDays.length === 0) return '—'
  const good = activeDays.filter(d => d.status === 'operational' || d.status === 'idle').length
  return `${((good / activeDays.length) * 100).toFixed(1)}%`
}

export function getOverallStatus(days: DayStatus[], lastRun?: import('./types').RunDetail | null): OverallStatus {
  // Prioritise the most recent run — if it finished cleanly the system is up.
  if (lastRun) {
    if (lastRun.status === 'error') {
      return {
        kind: 'outage',
        label: 'Partial Outage',
        description: 'The most recent pipeline run failed',
      }
    }
    if (lastRun.status === 'running') {
      return {
        kind: 'operational',
        label: 'Running',
        description: 'Automation is currently processing',
      }
    }
    if (lastRun.status === 'completed' && lastRun.sfErrorCount > 0) {
      return {
        kind: 'degraded',
        label: 'Degraded Performance',
        description: 'Salesforce sync errors on the last run',
      }
    }
    if (lastRun.status === 'completed') {
      return {
        kind: 'operational',
        label: 'All Systems Operational',
        description: 'All automations running normally',
      }
    }
  }

  // Fallback: scan the last 7 days if there is no run data yet.
  const recent = days.slice(-7)
  const activeDays = recent.filter(d => d.totalRuns > 0)

  if (activeDays.length === 0) {
    return {
      kind: 'degraded',
      label: 'No Recent Activity',
      description: 'No automation runs found in the last 7 days',
    }
  }

  if (activeDays.some(d => d.status === 'outage')) {
    return {
      kind: 'outage',
      label: 'Partial Outage',
      description: 'One or more pipeline runs failed recently',
    }
  }
  if (activeDays.some(d => d.status === 'degraded')) {
    return {
      kind: 'degraded',
      label: 'Degraded Performance',
      description: 'Salesforce sync errors detected recently',
    }
  }
  return {
    kind: 'operational',
    label: 'All Systems Operational',
    description: 'All automations running normally',
  }
}
