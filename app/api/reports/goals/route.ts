import { NextRequest, NextResponse } from 'next/server'
import djcSql from '@/lib/djcDb'
import { withDbRetry } from '@/lib/dbRetry'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { CLIENT_COOKIE_NAME, verifyClientCookieValue } from '@/lib/portalAuth'

/**
 * Placement goals, set by Proxi themselves from the report ("temporary measure" until goals live
 * somewhere official). One row per (year, key): key ∈ year | q1..q4 | m1..m12.
 *
 * The hub is otherwise read-only over the automation databases; this table is the hub's own
 * config, created on first use.
 */
export interface GoalSet {
  year: number | null
  quarters: (number | null)[]   // q1..q4
  months: (number | null)[]     // m1..m12
}

const KEYS = ['year', ...[1, 2, 3, 4].map(q => `q${q}`), ...Array.from({ length: 12 }, (_, i) => `m${i + 1}`)]

async function ensureTable() {
  await djcSql!`
    create table if not exists report_goals (
      goal_year int not null,
      goal_key text not null,
      goal_value int,
      updated_at timestamptz not null default now(),
      primary key (goal_year, goal_key)
    )`
}

async function authed(req: NextRequest): Promise<boolean> {
  if (await verifyClientCookieValue(req.cookies.get(CLIENT_COOKIE_NAME)?.value)) return true
  return verifyAdminCookieValue(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ ok: false, error: 'Sign in first.' }, { status: 401 })
  if (!djcSql) return NextResponse.json({ ok: false, error: 'No database.' }, { status: 503 })
  const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getUTCFullYear()
  try {
    const rows = await withDbRetry(async () => {
      await ensureTable()
      return djcSql!<{ goal_key: string; goal_value: number | null }[]>`
        select goal_key, goal_value from report_goals where goal_year = ${year}`
    })
    const map = new Map(rows.map(r => [r.goal_key, r.goal_value]))
    const goals: GoalSet = {
      year: map.get('year') ?? null,
      quarters: [1, 2, 3, 4].map(q => map.get(`q${q}`) ?? null),
      months: Array.from({ length: 12 }, (_, i) => map.get(`m${i + 1}`) ?? null),
    }
    return NextResponse.json({ ok: true, goals })
  } catch (err) {
    console.error('Goals read failed:', err)
    return NextResponse.json({ ok: false, error: 'Could not load goals.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ ok: false, error: 'Sign in first.' }, { status: 401 })
  if (!djcSql) return NextResponse.json({ ok: false, error: 'No database.' }, { status: 503 })
  let body: { year?: unknown; values?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const year = Number(body.year)
  const values = (body.values ?? {}) as Record<string, unknown>
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ ok: false, error: 'Bad year.' }, { status: 400 })
  }
  const entries = Object.entries(values).filter(([k]) => KEYS.includes(k)).map(([k, v]) => {
    const n = v === null || v === '' ? null : Number(v)
    return [k, n === null || (Number.isInteger(n) && n >= 0 && n <= 100000) ? n : undefined] as const
  })
  if (entries.some(([, v]) => v === undefined)) {
    return NextResponse.json({ ok: false, error: 'Goals must be whole numbers.' }, { status: 400 })
  }
  try {
    await withDbRetry(async () => {
      await ensureTable()
      for (const [k, v] of entries) {
        if (v === undefined) continue
        await djcSql!`
          insert into report_goals (goal_year, goal_key, goal_value)
          values (${year}, ${k}, ${v})
          on conflict (goal_year, goal_key)
          do update set goal_value = excluded.goal_value, updated_at = now()`
      }
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Goals write failed:', err)
    return NextResponse.json({ ok: false, error: 'Could not save goals.' }, { status: 500 })
  }
}
