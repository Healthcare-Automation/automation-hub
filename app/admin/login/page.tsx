'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/admin/recovery'
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || `Login failed (${res.status})`)
        return
      }
      router.replace(next)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 bg-zinc-900/60 border border-zinc-800 rounded-xl p-6">
      <div>
        <h1 className="text-lg font-semibold">Admin sign-in</h1>
        <p className="text-xs text-zinc-500 mt-1">
          Admin-only area. Enter the shared admin password to access recovery tools.
        </p>
      </div>
      <div>
        <label className="text-xs text-zinc-400 block mb-1">Password</label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
          required
        />
      </div>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading || !password}
        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium rounded-md py-2"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="text-[10px] text-zinc-600">
        Session is stored in a short-lived HttpOnly cookie (12 h). Log out from the recovery page to clear early.
      </p>
    </form>
  )
}

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 p-8">
      <Suspense fallback={<div className="text-xs text-zinc-500">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
