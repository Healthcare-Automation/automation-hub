'use client'

import { useEffect, useRef, useState } from 'react'
import { getReviewToken, invalidateReviewToken } from '@/lib/mohamedReviewClient'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Status = 'idle' | 'sending' | 'done' | 'error'

/**
 * Export a run's report (Andy, 2026-09-05: "exportable, as pdf and also via
 * email. I want to be able to type in an email and send the report").
 *
 * Both actions go straight to the VPS with the same short-lived review
 * token every other artifact fetch uses: the PDF carries member ids, so it
 * is built and sent from the VPS and never passes through Vercel. The
 * recipient picker is the same chip input as SendReportButton (the
 * Kimedics/DJC impact-report email on the admin dashboard).
 */
export function ReportActions({ runId, title }: { runId: string; title: string }) {
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [emails, setEmails] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [msg, setMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status])

  function close() {
    if (status === 'sending') return
    setOpen(false)
    setTimeout(() => {
      setStatus('idle')
      setMsg('')
    }, 200)
  }

  function clearError() {
    if (status === 'error') {
      setStatus('idle')
      setMsg('')
    }
  }

  function addEmail(raw: string): boolean {
    const e = raw.trim().replace(/,$/, '')
    if (!e) return true
    if (!EMAIL_RE.test(e)) {
      setStatus('error')
      setMsg(`"${e}" isn't a valid email address.`)
      return false
    }
    if (!emails.includes(e)) setEmails(p => [...p, e])
    setInput('')
    clearError()
    return true
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault()
      if (input.trim()) addEmail(input)
      else if (emails.length) void send()
    } else if (e.key === 'Backspace' && !input && emails.length) {
      setEmails(p => p.slice(0, -1))
    }
  }

  async function download() {
    setDownloading(true)
    setDownloadError(null)
    try {
      const { token, uploadUrl } = await getReviewToken()
      const res = await fetch(`${uploadUrl}/report/${runId}.pdf`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      if (res.status === 401 || res.status === 403) invalidateReviewToken()
      if (!res.ok) throw new Error('report_unavailable')
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `mohamed-billing-${runId.slice(0, 8)}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      setDownloadError('Could not build the PDF. Try again.')
    } finally {
      setDownloading(false)
    }
  }

  async function send() {
    const all = [...emails]
    const pending = input.trim().replace(/,$/, '')
    if (pending) {
      if (!EMAIL_RE.test(pending)) {
        setStatus('error')
        setMsg(`"${pending}" isn't a valid email address.`)
        return
      }
      if (!all.includes(pending)) all.push(pending)
    }
    if (!all.length) {
      setStatus('error')
      setMsg('Add at least one recipient.')
      return
    }
    setStatus('sending')
    setMsg('')
    try {
      const { token, uploadUrl } = await getReviewToken()
      const res = await fetch(`${uploadUrl}/report/${runId}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: all }),
      })
      if (res.status === 401 || res.status === 403) invalidateReviewToken()
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        setStatus('error')
        setMsg(
          j.error === 'email_not_configured'
            ? 'Email is not set up on the server yet (GMAIL_APP_PASSWORD).'
            : j.error === 'smtp_failed'
              ? 'The mail server rejected the message. Try again in a minute.'
              : 'Failed to send the report.',
        )
        return
      }
      setEmails(all)
      setInput('')
      setStatus('done')
      setMsg(`Sent to ${all.length} recipient${all.length > 1 ? 's' : ''}.`)
      setTimeout(() => close(), 1900)
    } catch {
      setStatus('error')
      setMsg('Network error reaching the server.')
    }
  }

  const sending = status === 'sending'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={download}
        disabled={downloading}
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium ring-1 ring-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:ring-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 disabled:opacity-50"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
        {downloading ? 'Building PDF…' : 'Download PDF'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium ring-1 text-emerald-700 ring-emerald-500/25 hover:bg-emerald-500/10 dark:text-emerald-300/90"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></svg>
        Email report
      </button>
      {downloadError && <span className="text-[11px] text-red-700 dark:text-red-400">{downloadError}</span>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm" onClick={close} />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 ring-1 ring-emerald-500/20 shadow-2xl">
            <div className="relative p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-white">Email this run&apos;s report</h3>
                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{title} · PDF attached</p>
                </div>
                <button type="button" onClick={close} disabled={sending} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 disabled:opacity-40" aria-label="Close">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>

              {status === 'done' ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/25 dark:text-emerald-100">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  </div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{msg}</p>
                </div>
              ) : (
                <>
                  <div className="mt-4">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Recipients</label>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-800/60 dark:ring-zinc-700/70 p-2 focus-within:ring-emerald-500/50">
                      {emails.map((e, i) => (
                        <span key={e} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[12px] text-emerald-800 ring-1 ring-emerald-500/25 dark:text-emerald-100">
                          {e}
                          <button type="button" onClick={() => setEmails(p => p.filter((_, j) => j !== i))} disabled={sending} aria-label={`Remove ${e}`}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                          </button>
                        </span>
                      ))}
                      <input
                        ref={inputRef}
                        value={input}
                        disabled={sending}
                        onChange={e => {
                          setInput(e.target.value)
                          clearError()
                        }}
                        onKeyDown={onKeyDown}
                        onBlur={() => input.trim() && addEmail(input)}
                        placeholder={emails.length ? 'Add another…' : 'name@example.com'}
                        className="min-w-[140px] flex-1 bg-transparent px-1 py-0.5 text-[13px] text-zinc-900 placeholder:text-zinc-400 dark:text-zinc-100 outline-none"
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-zinc-500">Press Enter or comma to add. Multiple recipients allowed.</p>
                  </div>
                  {status === 'error' && msg && (
                    <p className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-[12px] text-red-700 dark:text-red-300 ring-1 ring-red-500/20">{msg}</p>
                  )}
                  <div className="mt-5 flex items-center justify-end gap-2">
                    <button type="button" onClick={close} disabled={sending} className="rounded-lg px-3 py-1.5 text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 disabled:opacity-40">Cancel</button>
                    <button
                      type="button"
                      onClick={send}
                      disabled={sending || (emails.length === 0 && !input.trim())}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-1.5 text-[13px] font-semibold text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sending && <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>}
                      {sending ? 'Sending…' : 'Send report'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
