'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

export default function PortalLoginPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || `Sign-in failed (${res.status}).`)
        return
      }
      router.replace('/portal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-sm">
        <p className="text-[11px] font-semibold tracking-widest text-zinc-500">PROXI</p>
        <h1 className="mt-1 text-[19px] font-semibold text-zinc-900">Client report</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
          Placements, candidate sourcing and the job pipeline — one page, always current.
          Enter the access code you were given.
        </p>
        <div className="mt-5 flex items-center gap-2">
          <input
            type="password"
            autoFocus
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Access code"
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-[13px] text-zinc-800 placeholder-zinc-400 outline-none focus:border-zinc-500"
            required
          />
          <button
            type="submit"
            disabled={loading || !code}
            className={cn('shrink-0 rounded-lg px-4 py-2 text-[13px] font-medium transition-colors',
              loading || !code
                ? 'bg-zinc-200 text-zinc-400'
                : 'bg-cyan-700 text-white hover:bg-cyan-600')}
          >
            {loading ? 'Opening…' : 'View report'}
          </button>
        </div>
        {error && <p className="mt-2 text-[12px] text-orange-700">{error}</p>}
        <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
          You will stay signed in on this device for 30 days. Need a code? Ask your Proxi contact.
        </p>
      </form>
    </div>
  )
}
