'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function MohamedLoginPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/mohamed/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setError(body.error || `Sign-in failed (${response.status}).`)
        return
      }
      router.replace('/mohamed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none p-7">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-emerald-700 dark:text-emerald-400">UZU STUDIO</p>
        <h1 className="mt-2 text-xl font-semibold">Mohamed billing review</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          Review extracted billing rows, validation results and dry-run progress. No claims are submitted.
        </p>
        <input
          type="password"
          autoFocus
          value={code}
          onChange={event => setCode(event.target.value)}
          placeholder="Access code"
          className="mt-6 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-emerald-600"
          required
        />
        <button
          type="submit"
          disabled={loading || !code}
          className="mt-3 w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
        >
          {loading ? 'Opening…' : 'Open review portal'}
        </button>
        {error && <p className="mt-3 text-xs text-red-700 dark:text-red-400">{error}</p>}
      </form>
    </div>
  )
}
