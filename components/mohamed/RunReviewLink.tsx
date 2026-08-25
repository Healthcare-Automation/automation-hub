'use client'

import { useState } from 'react'

/**
 * "View submission" link shown per run in RunHistory and per claim in
 * RunTrace. Fetches a short-lived token then opens a modal that pulls
 * fields.json + screenshot.png directly from the VPS -- PHI never transits
 * Vercel, same pattern as the upload flow. Captures are stored per claim
 * (/review/<run>/<claimRef>/...) with a legacy per-run fallback for runs
 * captured before the per-claim layout.
 */
export function RunReviewLink({ runId, claimRef, label }: { runId: string; claimRef?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'loading' | 'missing' | 'error' | 'ready'>('idle')
  const [fields, setFields] = useState<{ label: string; value: string }[]>([])
  const [step, setStep] = useState('')
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)

  async function load() {
    setOpen(true)
    setState('loading')
    try {
      const tokenRes = await fetch('/api/mohamed/review-token', { method: 'POST' })
      const tokenJson = await tokenRes.json()
      if (!tokenRes.ok || !tokenJson.ok || !tokenJson.uploadUrl) {
        setState('error')
        return
      }
      const token: string = tokenJson.token
      const uploadUrl: string = tokenJson.uploadUrl
      const base = claimRef ? `${uploadUrl}/review/${runId}/${claimRef}` : `${uploadUrl}/review/${runId}`
      const fieldsRes = await fetch(`${base}/fields.json`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (fieldsRes.status === 404) {
        setState('missing')
        return
      }
      if (!fieldsRes.ok) {
        setState('error')
        return
      }
      const payload = await fieldsRes.json()
      setFields(Array.isArray(payload.fields) ? payload.fields : [])
      setStep(String(payload.step || ''))

      const shotTokenRes = await fetch('/api/mohamed/review-token', { method: 'POST' })
      const shotTokenJson = await shotTokenRes.json()
      if (shotTokenRes.ok && shotTokenJson.ok) {
        const shotRes = await fetch(`${base}/screenshot.png`, { headers: { Authorization: `Bearer ${shotTokenJson.token}` } })
        if (shotRes.ok) {
          const blob = await shotRes.blob()
          setScreenshotUrl(URL.createObjectURL(blob))
        }
      }
      setState('ready')
    } catch {
      setState('error')
    }
  }

  function close() {
    setOpen(false)
    setState('idle')
    if (screenshotUrl) URL.revokeObjectURL(screenshotUrl)
    setScreenshotUrl(null)
    setFields([])
  }

  return (
    <>
      <button
        type="button"
        onClick={load}
        className="text-emerald-700 hover:underline"
      >
        {label ?? 'View submission'}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Claim form submission {claimRef && <span className="font-mono text-xs text-stone-500">claim {claimRef}</span>}{' '}
                {step && <span className="font-normal text-stone-500">— {step}</span>}
              </h3>
              <button type="button" onClick={close} className="text-xs text-stone-500 hover:underline">Close</button>
            </div>

            {state === 'loading' && <p className="text-sm text-stone-500">Loading…</p>}
            {state === 'missing' && (
              <p className="text-sm text-stone-500">No submission capture exists for this run.</p>
            )}
            {state === 'error' && (
              <p className="text-sm text-red-700">Could not load the submission capture. Try again.</p>
            )}
            {state === 'ready' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-medium text-stone-500">Fields as entered</p>
                  <dl className="space-y-1 text-xs">
                    {fields.map((field, index) => (
                      <div key={index} className="flex justify-between gap-2 border-b border-stone-100 py-1">
                        <dt className="text-stone-500">{field.label}</dt>
                        <dd className="text-right font-medium">{field.value}</dd>
                      </div>
                    ))}
                    {fields.length === 0 && <p className="text-stone-400">No fields captured.</p>}
                  </dl>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-stone-500">Screenshot</p>
                  {screenshotUrl ? (
                    <img src={screenshotUrl} alt="Claim form screenshot" className="rounded-lg border border-stone-200" />
                  ) : (
                    <p className="text-xs text-stone-400">No screenshot captured.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
