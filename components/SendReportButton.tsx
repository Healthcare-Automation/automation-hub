'use client'

import { useEffect, useRef, useState } from 'react'

type Accent = 'emerald' | 'cyan'
type Status = 'idle' | 'sending' | 'done' | 'error'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ACCENT: Record<Accent, { trigger: string; focus: string; chip: string; send: string; ring: string; glow: string }> = {
  emerald: {
    trigger: 'text-emerald-700 ring-emerald-500/25 hover:bg-emerald-500/10 hover:text-emerald-800 dark:text-emerald-300/90 dark:hover:text-emerald-200',
    focus: 'focus-within:ring-emerald-500/50',
    chip: 'bg-emerald-500/15 text-emerald-800 ring-emerald-500/25 dark:text-emerald-100',
    send: 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400',
    ring: 'ring-emerald-500/20',
    glow: 'from-emerald-500/15',
  },
  cyan: {
    trigger: 'text-cyan-700 ring-cyan-500/25 hover:bg-cyan-500/10 hover:text-cyan-800 dark:text-cyan-300/90 dark:hover:text-cyan-200',
    focus: 'focus-within:ring-cyan-500/50',
    chip: 'bg-cyan-500/15 text-cyan-800 ring-cyan-500/25 dark:text-cyan-100',
    send: 'bg-cyan-500 text-cyan-950 hover:bg-cyan-400',
    ring: 'ring-cyan-500/20',
    glow: 'from-cyan-500/15',
  },
}

export default function SendReportButton({
  automation,
  title,
  accent = 'emerald',
}: {
  automation: 'kimedics' | 'djc'
  title: string
  accent?: Accent
}) {
  const a = ACCENT[accent]
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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status])

  function close() {
    if (status === 'sending') return
    setOpen(false)
    setTimeout(() => { setStatus('idle'); setMsg('') }, 200)
  }

  function clearError() {
    if (status === 'error') { setStatus('idle'); setMsg('') }
  }

  function addEmail(raw: string): boolean {
    const e = raw.trim().replace(/,$/, '')
    if (!e) return true
    if (!EMAIL_RE.test(e)) { setStatus('error'); setMsg(`"${e}" isn't a valid email address.`); return false }
    if (!emails.includes(e)) setEmails((p) => [...p, e])
    setInput('')
    clearError()
    return true
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault()
      if (input.trim()) addEmail(input)
      else if (emails.length) send()
    } else if (e.key === 'Backspace' && !input && emails.length) {
      setEmails((p) => p.slice(0, -1))
    }
  }

  async function send() {
    const all = [...emails]
    const pending = input.trim().replace(/,$/, '')
    if (pending) {
      if (!EMAIL_RE.test(pending)) { setStatus('error'); setMsg(`"${pending}" isn't a valid email address.`); return }
      if (!all.includes(pending)) all.push(pending)
    }
    if (!all.length) { setStatus('error'); setMsg('Add at least one recipient.'); return }

    setStatus('sending'); setMsg('')
    try {
      const res = await fetch('/api/reports/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automation, recipients: all }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) { setStatus('error'); setMsg(j.error || 'Failed to send the report.'); return }
      setEmails(all); setInput('')
      setStatus('done'); setMsg(`Sent to ${all.length} recipient${all.length > 1 ? 's' : ''}.`)
      setTimeout(() => close(), 1900)
    } catch (e: any) {
      setStatus('error'); setMsg(e?.message || 'Request failed.')
    }
  }

  const sending = status === 'sending'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium ring-1 transition-colors ${a.trigger}`}
        title="Email the all-time report"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></svg>
        Email report
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm animate-[fadeIn_.15s_ease-out]" onClick={close} />
          <div className={`relative w-full max-w-md overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 ring-1 ${a.ring} shadow-2xl animate-[popIn_.18s_ease-out]`}>
            <div className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${a.glow} to-transparent`} />
            <div className="relative p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-white">Send all-time report</h3>
                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{title}</p>
                </div>
                <button onClick={close} disabled={sending} className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 disabled:opacity-40">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>

              {status === 'done' ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full ${a.chip} ring-1`}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  </div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{msg}</p>
                </div>
              ) : (
                <>
                  <div className="mt-4">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Recipients</label>
                    <div className={`mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg bg-zinc-100 ring-zinc-200 dark:bg-zinc-800/60 dark:ring-zinc-700/70 p-2 ring-1 transition-shadow ${a.focus}`}>
                      {emails.map((e, i) => (
                        <span key={e} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] ring-1 ${a.chip}`}>
                          {e}
                          <button onClick={() => setEmails((p) => p.filter((_, j) => j !== i))} disabled={sending} className="text-current/70 hover:text-zinc-900 dark:hover:text-white">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                          </button>
                        </span>
                      ))}
                      <input
                        ref={inputRef}
                        value={input}
                        disabled={sending}
                        onChange={(e) => { setInput(e.target.value); clearError() }}
                        onKeyDown={onKeyDown}
                        onBlur={() => input.trim() && addEmail(input)}
                        placeholder={emails.length ? 'Add another…' : 'name@example.com'}
                        className="min-w-[140px] flex-1 bg-transparent px-1 py-0.5 text-[13px] text-zinc-900 placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-600 outline-none"
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-600">Press Enter or comma to add. Multiple recipients allowed.</p>
                  </div>

                  {status === 'error' && msg && (
                    <p className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-[12px] text-red-700 dark:text-red-300 ring-1 ring-red-500/20">{msg}</p>
                  )}

                  <div className="mt-5 flex items-center justify-end gap-2">
                    <button onClick={close} disabled={sending} className="rounded-lg px-3 py-1.5 text-[13px] text-zinc-600 dark:text-zinc-400 transition-colors hover:text-zinc-900 dark:hover:text-zinc-200 disabled:opacity-40">Cancel</button>
                    <button
                      onClick={send}
                      disabled={sending || (emails.length === 0 && !input.trim())}
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${a.send}`}
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
    </>
  )
}
