'use client'

import { useRef, useState } from 'react'

type Phase = 'idle' | 'requesting' | 'uploading' | 'done' | 'error'

/**
 * Uploads Mohamed's Billing Report CSV directly from the browser to the
 * VPS — Vercel never sees the file bytes. Two hops:
 *   1. POST /api/mohamed/upload-token (this Vercel app) -> a short-lived
 *      (2 min) signed token + the VPS upload URL. No file involved yet.
 *   2. PUT/POST the raw file straight to that VPS URL with the token as
 *      a bearer credential. This request goes browser -> VPS directly.
 */
export function CsvUploadCard({ hasFile }: { hasFile: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
      const uploadRes = await fetch(`${tokenData.uploadUrl}/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.token}`,
          'Content-Type': file.type || 'text/csv',
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
      setPhase('done')
      setMessage('Uploaded. The run starts automatically — no need to do anything else.')
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
    <section data-section="upload" className="mt-7 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-base font-semibold">Upload billing report</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Export the AxisCare Billing Report as CSV and drop it here. The run starts on its own — no separate trigger needed.
        </p>
      </div>
      <div className="p-5">
        <div
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            busy ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-300 hover:border-emerald-400 hover:bg-emerald-50/40'
          }`}
        >
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChosen} disabled={busy} />
          {phase === 'idle' && (
            <>
              <p className="text-sm font-medium text-zinc-700">Drag a CSV here, or click to choose a file</p>
              <p className="text-xs text-zinc-400">One file, straight to the VPS — not stored on Vercel</p>
            </>
          )}
          {busy && (
            <p className="text-sm font-medium text-zinc-700">
              {phase === 'requesting' ? 'Preparing upload…' : `Uploading ${fileName ?? 'file'}…`}
            </p>
          )}
          {phase === 'done' && <p className="text-sm font-medium text-emerald-700">✓ {fileName}</p>}
          {phase === 'error' && <p className="text-sm font-medium text-red-700">Upload failed — click to try again</p>}
        </div>
        {message && (
          <p className={`mt-3 text-xs ${phase === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>{message}</p>
        )}
        {!hasFile && phase === 'idle' && (
          <p className="mt-3 text-[11px] text-zinc-400">No run has been started from an upload yet.</p>
        )}
      </div>
    </section>
  )
}
