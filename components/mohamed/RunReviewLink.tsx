'use client'

import { useState } from 'react'

/**
 * "View submission" link shown per run in RunHistory. Fetches a short-lived
 * token then opens a modal that pulls fields.json + screenshot.png directly
 * from the VPS -- PHI never transits Vercel, same pattern as the upload
 * flow. Renders nothing (not even a broken link) if the VPS 404s, since
 * most runs never reach the claim-form checkpoint that gets captured.
 */
export function RunReviewLink({ runId }: { runId: string }) {
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
      const fieldsRes = await fetch(`${uploadUrl}/review/${runId}/fields.json`, {
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
        const shotUrl = `${uploadUrl}/review/${runId}/screenshot.png`
        const shotRes = await fetch(shotUrl, { headers: { Authorization: `Bearer ${shotTokenJson.token}` } })
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
        View submission
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Claim form submission {step && <span className="font-normal text-zinc-500">— {step}</span>}
              </h3>
              <button type="button" onClick={close} className="text-xs text-zinc-500 hover:underline">Close</button>
            </div>

            {state === 'loading' && <p className="text-sm text-zinc-500">Loading…</p>}
            {state === 'missing' && (
              <p className="text-sm text-zinc-500">No submission capture exists for this run.</p>
            )}
            {state === 'error' && (
              <p className="text-sm text-red-700">Could not load the submission capture. Try again.</p>
            )}
            {state === 'ready' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500">Fields as entered</p>
                  <dl className="space-y-1 text-xs">
                    {fields.map((field, index) => (
                      <div key={index} className="flex justify-between gap-2 border-b border-zinc-100 py-1">
                        <dt className="text-zinc-500">{field.label}</dt>
                        <dd className="text-right font-medium">{field.value}</dd>
                      </div>
                    ))}
                    {fields.length === 0 && <p className="text-zinc-400">No fields captured.</p>}
                  </dl>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500">Screenshot</p>
                  {screenshotUrl ? (
                    <img src={screenshotUrl} alt="Claim form screenshot" className="rounded-lg border border-zinc-200" />
                  ) : (
                    <p className="text-xs text-zinc-400">No screenshot captured.</p>
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
