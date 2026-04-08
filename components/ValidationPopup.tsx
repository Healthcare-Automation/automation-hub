'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface ValidationJobDetail {
  id: string
  kimedicsLink: string
  sfJobId: string | null
  status: 'success' | 'failed' | 'partial'
  fieldsUpdated: string[]
  kimedicsData: Record<string, any>
  salesforceData: Record<string, any>

  // Family A + B: Salesforce Mapping
  mappingResolution?: {
    source: string
    detail: string
    status: string
    fieldsChanged: string[]
    prev: Record<string, any>
    next: Record<string, any>
    updatedRows: Record<string, number>
  }
  mappingIssues?: Array<{
    type: string
    message: string
    details: any
  }>

  // Family C: Salesforce Field Updates
  salesforceFieldPatches?: Array<{
    sfJobId: string
    fieldsChanged: string[]
    prev: Record<string, any>
    next: Record<string, any>
  }>
  salesforceIssues?: Array<{
    type: string
    message: string
    count: number
    details: any
  }>

  // Raw events for debugging
  mappingEvents?: any[]
  salesforceFieldEvents?: any[]

  // Legacy
  errors: string[]
  createdAt: string
}

interface ValidationPopupProps {
  runId: number
  isOpen: boolean
  onClose: () => void
}

function StatusBadge({ status }: { status: 'success' | 'failed' | 'partial' }) {
  const styles = {
    success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    failed: 'text-red-400 bg-red-500/10 border-red-500/20',
    partial: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  }

  const icons = {
    success: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
    failed: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    ),
    partial: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  }

  const labels = {
    success: 'Success',
    failed: 'Failed',
    partial: 'Partial',
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium', styles[status])}>
      {icons[status]}
      {labels[status]}
    </span>
  )
}

function SalesforceMappingSection({ job }: { job: ValidationJobDetail }) {
  const hasMappingResolution = job.mappingResolution
  const hasMappingIssues = job.mappingIssues && job.mappingIssues.length > 0

  if (!hasMappingResolution && !hasMappingIssues) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-400">Salesforce Mapping</p>
        <span className="text-[10px] text-zinc-600">Family A + B</span>
      </div>

      {/* Successful Mapping Resolution */}
      {hasMappingResolution && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span className="text-emerald-400 text-xs font-semibold">Mapping Resolved</span>
            <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300">
              {job.mappingResolution?.status}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">Source:</span>
              <span className="text-emerald-300 font-mono">{job.mappingResolution?.source}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">Detail:</span>
              <span className="text-emerald-300">{job.mappingResolution?.detail}</span>
            </div>

            {/* Show ID assignments */}
            <div className="grid grid-cols-1 gap-2 mt-3">
              {job.mappingResolution?.fieldsChanged.map(field => (
                <div key={field} className="bg-emerald-500/5 border border-emerald-500/10 rounded p-2">
                  <div className="text-[10px] font-semibold text-emerald-400 mb-1">{field}</div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-zinc-500">Before: </span>
                      <span className="font-mono text-zinc-400">{job.mappingResolution?.prev[field] || 'null'}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">After: </span>
                      <span className="font-mono text-emerald-300">{job.mappingResolution?.next[field] || 'null'}</span>
                    </div>
                  </div>
                </div>
              )) || []}
            </div>
          </div>
        </div>
      )}

      {/* Mapping Issues */}
      {hasMappingIssues && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p className="text-red-400 text-xs font-semibold mb-2 flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            Mapping Issues
          </p>
          <div className="space-y-2">
            {job.mappingIssues?.map((issue, i) => (
              <div key={i} className="text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] px-2 py-1 rounded bg-red-500/20 text-red-300">{issue.type}</span>
                </div>
                <p className="text-red-300 leading-relaxed">{issue.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SalesforceFieldUpdatesSection({ job }: { job: ValidationJobDetail }) {
  const [expandedPatches, setExpandedPatches] = useState<Set<number>>(new Set())
  const hasPatches = job.salesforceFieldPatches && job.salesforceFieldPatches.length > 0
  const hasIssues = job.salesforceIssues && job.salesforceIssues.length > 0

  if (!hasPatches && !hasIssues) return null

  const togglePatch = (index: number) => {
    const newExpanded = new Set(expandedPatches)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedPatches(newExpanded)
  }

  const toggleAllPatches = () => {
    if (!job.salesforceFieldPatches) return

    const allIndices = job.salesforceFieldPatches.map((_, i) => i)
    const allExpanded = allIndices.every(i => expandedPatches.has(i))

    if (allExpanded) {
      setExpandedPatches(new Set()) // Collapse all
    } else {
      setExpandedPatches(new Set(allIndices)) // Expand all
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-400">Salesforce Field Updates</p>
        <span className="text-[10px] text-zinc-600">Family C</span>
      </div>

      {/* Successful Field Patches */}
      {hasPatches && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              Fields Successfully Updated
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300">
                {job.salesforceFieldPatches?.length || 0} record{(job.salesforceFieldPatches?.length || 0) !== 1 ? 's' : ''}
              </span>
              {(job.salesforceFieldPatches?.length || 0) > 1 && (
                <button
                  onClick={toggleAllPatches}
                  className="text-[10px] px-2 py-1 rounded border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                >
                  {job.salesforceFieldPatches?.every((_, i) => expandedPatches.has(i)) ? 'Collapse All' : 'Expand All'}
                </button>
              )}
            </div>
          </div>
          {job.salesforceFieldPatches?.map((patch, i) => {
            const isExpanded = expandedPatches.has(i)
            return (
              <div key={i} className="border border-emerald-500/20 rounded-lg mb-2 last:mb-0">
                {/* Collapsible header */}
                <button
                  onClick={() => togglePatch(i)}
                  className="w-full p-3 text-left hover:bg-emerald-500/5 transition-colors flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="text-xs text-emerald-400 font-medium mb-1">
                      Record {patch.sfJobId}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      Updated {patch.fieldsChanged.length} field{patch.fieldsChanged.length !== 1 ? 's' : ''}: {patch.fieldsChanged.slice(0, 3).join(', ')}{patch.fieldsChanged.length > 3 ? ` +${patch.fieldsChanged.length - 3} more` : ''}
                    </div>
                  </div>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn("text-emerald-400 transition-transform", isExpanded ? "rotate-90" : "")}
                  >
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-emerald-500/10">
                    <div className="space-y-2 pt-2">
                      {patch.fieldsChanged.map(field => (
                        <div key={field} className="bg-emerald-500/5 border border-emerald-500/10 rounded p-2">
                          <div className="text-[10px] font-semibold text-emerald-400 mb-1">{field}</div>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="text-zinc-500">Before: </span>
                              <span className="font-mono text-zinc-300">{patch.prev[field] || '—'}</span>
                            </div>
                            <div>
                              <span className="text-zinc-500">After: </span>
                              <span className="font-mono text-emerald-300">{patch.next[field] || '—'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Field Update Issues */}
      {hasIssues && (
        <div className="space-y-2">
          {job.salesforceIssues?.map((issue, i) => {
            const isSkip = issue.type.includes('skip')
            const bgColor = isSkip ? 'bg-blue-500/10 border-blue-500/20' : 'bg-red-500/10 border-red-500/20'
            const textColor = isSkip ? 'text-blue-400' : 'text-red-400'
            const iconColor = isSkip ? 'text-blue-400' : 'text-red-400'

            return (
              <div key={i} className={cn('border rounded-lg p-3', bgColor)}>
                <p className={cn('text-xs font-semibold mb-2 flex items-center gap-1', textColor)}>
                  {isSkip ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  )}
                  {isSkip ? 'Skipped' : 'Error'}
                  {issue.count > 1 && (
                    <span className="text-[10px] px-2 py-1 rounded-full bg-zinc-500/20 text-zinc-300">
                      {issue.count}x
                    </span>
                  )}
                </p>
                <div className="text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('text-[10px] px-2 py-1 rounded', isSkip ? 'bg-blue-500/20 text-blue-300' : 'bg-red-500/20 text-red-300')}>
                      {issue.type}
                    </span>
                  </div>
                  <p className={cn('leading-relaxed', isSkip ? 'text-blue-300' : 'text-red-300')}>
                    {issue.message}
                  </p>
                  {/* Show affected fields for grouped events */}
                  {issue.details?.fields && issue.details.fields.length > 0 && (
                    <div className="mt-2 text-[11px] text-zinc-500">
                      Fields: {issue.details.fields.join(', ')}
                    </div>
                  )}
                  {/* Show checked fields for skip events (legacy) */}
                  {issue.details?.checked && (
                    <div className="mt-2 text-[11px] text-zinc-500">
                      Checked: {issue.details.checked.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function JobCard({ job }: { job: ValidationJobDetail }) {
  const sfLink = job.sfJobId ? `https://proxi.lightning.force.com/lightning/r/Job__c/${job.sfJobId}/view` : null

  return (
    <div className="border border-zinc-700/40 rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <StatusBadge status={job.status} />
            <span className="text-xs text-zinc-500">ID: {job.id}</span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <a
              href={job.kimedicsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline flex items-center gap-1"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
              </svg>
              Kimedics
            </a>
            {sfLink && (
              <a
                href={sfLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline flex items-center gap-1"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
                </svg>
                Salesforce
              </a>
            )}
          </div>
        </div>
      </div>

      {/* New sectioned approach based on three families */}
      <SalesforceMappingSection job={job} />
      <SalesforceFieldUpdatesSection job={job} />
    </div>
  )
}

export default function ValidationPopup({ runId, isOpen, onClose }: ValidationPopupProps) {
  const [jobs, setJobs] = useState<ValidationJobDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !runId) return

    setLoading(true)
    setError(null)

    const fetchValidationData = async () => {
      try {
        const response = await fetch(`/api/validation/${runId}`)

        if (!response.ok) {
          throw new Error('Failed to fetch validation data')
        }

        const data = await response.json()
        setJobs(data.jobs || [])
      } catch (err) {
        setError('Failed to load validation data')
      } finally {
        setLoading(false)
      }
    }

    fetchValidationData()
  }, [isOpen, runId])

  if (!isOpen) return null

  const successCount = jobs.filter(j => j.status === 'success').length
  const failedCount = jobs.filter(j => j.status === 'failed').length
  const partialCount = jobs.filter(j => j.status === 'partial').length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="h-full w-full max-w-4xl bg-zinc-900 border-l border-zinc-700/50 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-700/40">
          <div>
            <h2 className="text-lg font-semibold text-white">Validation Details</h2>
            <p className="text-sm text-zinc-400">Run #{runId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stats Summary */}
        <div className="p-6 border-b border-zinc-700/40">
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{jobs.length}</div>
              <div className="text-xs text-zinc-500">Total Jobs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">{successCount}</div>
              <div className="text-xs text-zinc-500">Successful</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{failedCount}</div>
              <div className="text-xs text-zinc-500">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-400">{partialCount}</div>
              <div className="text-xs text-zinc-500">Partial</div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="text-zinc-500">Loading validation data...</div>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="space-y-4">
              {jobs.map(job => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}