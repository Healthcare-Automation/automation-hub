'use client'

import { useEffect, useRef, useState } from 'react'

type Phase = 'idle' | 'requesting' | 'uploading' | 'queued' | 'error'

/**
 * Uploads Mohamed's Billing Report CSV directly from the browser to the
 * VPS — Vercel never sees the file bytes. Two hops:
 *   1. POST /api/mohamed/upload-token (this Vercel app) -> a short-lived
 *      (2 min) signed token + the VPS upload URL. No file involved yet.
 *   2. PUT/POST the raw file straight to that VPS URL with the token as
 *      a bearer credential. This request goes browser -> VPS directly.
 *
 * Andy, 2026-09-04: "there should be a button for testing and
 * submissions. Just in case I want to do dry runs before actually
 * submitting things." Admin-only toggle (isAdmin) — Mohamed's own uploads
 * always run as a dry run regardless of this component's local state, so
 * a client session can never accidentally trigger a real submission.
 */
export function CsvUploadCard({ hasFile, isAdmin }: { hasFile: boolean; isAdmin: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [waitingForPortalSession, setWaitingForPortalSession] = useState(false)
  // Defaults to dry-run/testing (false) even for admin -- the client asked
  // for the SAFE default with an explicit opt-in to real submission, never
  // the reverse.
  const [submitMode, setSubmitMode] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch('/api/mohamed/portal-health')
        const data = await res.json()
        if (!cancelled && data.ok) setWaitingForPortalSession(Boolean(data.waitingForPortalSession))
      } catch {
        // Best-effort — a failed poll just leaves the notice as it was.
      }
    }
    void poll()
    const id = setInterval(poll, 15_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  async function upload(file: File) {
    setPhase('requesting')
    setMessage(null)
    setFileName(file.name)
    try {
      const tokenRes = await fetch('/api/mohamed/upload-token', { method: 'POST' })
      const tokenData = await tokenRes.json()
      if (!tokenRes.ok || !tokenData.ok || !tokenData.uploadUrl) {
        setPhase('error')
        setMessage(tokenData.error ?? 'Upload is not configured yet.')
        return
      }

      setPhase('uploading')
      // isAdmin gates the toggle's very existence in the UI below, but the
      // header itself is only ever sent true when BOTH isAdmin AND the
      // toggle are on — a non-admin session has no way to flip submitMode
      // to true in the first place (the toggle isn't rendered), so this is
      // belt-and-braces, not the only guard.
      const uploadRes = await fetch(`${tokenData.uploadUrl}/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.token}`,
          'Content-Type': file.type || 'text/csv',
          'X-Submit-Mode': isAdmin && submitMode ? 'true' : 'false',
        },
        body: file,
      })
      const uploadData = await uploadRes.json().catch(() => ({ ok: false, error: 'bad_response' }))
      if (!uploadRes.ok || !uploadData.ok) {
        setPhase('error')
        setMessage(
          uploadData.error === 'unauthorized'
            ? 'Upload link expired — try again.'
            : 'Could not upload the file. Try again.',
        )
        return
      }
      setPhase('queued')
      setMessage(
        uploadData.submitMode
          ? 'Queued — this run will SUBMIT claims. The runner picks this up within a minute.'
          : 'Queued — the runner picks this up within a minute.',
      )
    } catch {
      setPhase('error')
      setMessage('Network error reaching the VPS. Try again.')
    }
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void upload(file)
    e.target.value = '' // allow re-selecting the same file name
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) void upload(file)
  }

  const busy = phase === 'requesting' || phase === 'uploading'

  return (
    <section data-section="upload" className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none">
      <div className="border-b border-zinc-100 dark:border-zinc-800 px-5 py-4">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Upload billing report</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Export the AxisCare Billing Report as CSV and drop it here. The run starts on its own — no separate trigger needed.
        </p>
      </div>
      <div className="p-5">
        {isAdmin && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
            <div>
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                {submitMode ? 'Submission mode' : 'Testing mode'}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {submitMode
                  ? 'Claims that reach review will be SUBMITTED to HCPF.'
                  : 'Dry run — claims reach review, nothing is submitted.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={submitMode}
              disabled={busy}
              onClick={() => setSubmitMode(v => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                submitMode ? 'bg-red-600' : 'bg-zinc-300 dark:bg-zinc-700'
              } ${busy ? 'opacity-50' : ''}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  submitMode ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        )}
        {waitingForPortalSession && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10 px-3 py-2.5">
            <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
              Portal session is being repaired automatically — your upload will queue and start when it recovers.
            </p>
          </div>
        )}
        <div
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            busy
              ? 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50'
              : isAdmin && submitMode
                ? 'border-red-300 bg-red-50/40 hover:border-red-400 hover:bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10 dark:hover:bg-red-500/15'
                : 'border-zinc-300 bg-zinc-50/40 hover:border-emerald-400 hover:bg-emerald-50/40 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:bg-emerald-500/10'
          }`}
        >
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChosen} disabled={busy} />
          {phase === 'idle' && (
            <>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Drag a CSV here, or click to choose a file</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">One file, straight to the VPS — not stored on Vercel</p>
            </>
          )}
          {busy && (
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {phase === 'requesting' ? 'Preparing upload…' : `Uploading ${fileName ?? 'file'}…`}
            </p>
          )}
          {phase === 'queued' && <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">✓ {fileName}</p>}
          {phase === 'error' && <p className="text-sm font-medium text-red-700 dark:text-red-400">Upload failed — click to try again</p>}
        </div>
        {message && (
          <p className={`mt-3 text-xs ${phase === 'error' ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{message}</p>
        )}
        {!hasFile && phase === 'idle' && (
          <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">No run has been started from an upload yet.</p>
        )}
      </div>
    </section>
  )
}
