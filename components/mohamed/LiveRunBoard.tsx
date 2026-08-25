'use client'

import { useEffect, useState } from 'react'
import { getReviewToken, invalidateReviewToken } from '@/lib/mohamedReviewClient'
import {
  describeMemberState,
  describePhase,
  isBoardStale,
  isTerminalPhase,
  parseProgressPayload,
  summariseBoard,
  LEG_LABELS,
  type LegState,
  type LiveBoard,
  type LiveMember,
  type StateTone,
} from '@/lib/mohamedLiveProgress'
import { RunProgress } from './RunProgress'

const POLL_MS = 3_000

const TONE_TEXT: Record<StateTone, string> = {
  zinc: 'text-zinc-500',
  blue: 'text-blue-700',
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
}

const TONE_DOT: Record<StateTone, string> = {
  zinc: 'bg-zinc-300',
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}

const LEG_FILL: Record<LegState, string> = {
  pending: 'bg-zinc-200',
  active: 'bg-blue-500 animate-pulse',
  done: 'bg-emerald-500',
  warn: 'bg-amber-400',
  fail: 'bg-red-500',
  skipped: 'bg-zinc-100',
}

/** Three segments — Coverage → Claim entry → Review — as one compact bar so
 * twenty rows still read as a single shape at a glance. */
function LegTracker({ legs }: { legs: [LegState, LegState, LegState] }) {
  return (
    <div className="flex w-28 shrink-0 gap-1 sm:w-36" aria-hidden>
      {legs.map((leg, index) => (
        <span
          key={LEG_LABELS[index]}
          title={LEG_LABELS[index]}
          className={`h-1.5 flex-1 rounded-full ${LEG_FILL[leg]}`}
        />
      ))}
    </div>
  )
}

function MemberRow({ member }: { member: LiveMember }) {
  const view = describeMemberState(member.state)
  const claimCount = Object.keys(member.claims).length

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-zinc-200">
      <span className="flex shrink-0 items-center gap-2">
        {view.busy ? (
          <span className="relative flex h-1.5 w-1.5">
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${TONE_DOT[view.tone]}`} />
            <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${TONE_DOT[view.tone]}`} />
          </span>
        ) : (
          <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[view.tone]}`} />
        )}
        <span className="font-medium tabular-nums text-zinc-900">Member {member.memberId}</span>
      </span>
      <LegTracker legs={view.legs} />
      <span className={`min-w-0 flex-1 ${TONE_TEXT[view.tone]}`}>{view.label}</span>
      {claimCount > 1 && (
        <span className="shrink-0 text-[11px] text-zinc-400">{claimCount} claims</span>
      )}
    </li>
  )
}

function Count({ value, label, className }: { value: number; label: string; className: string }) {
  if (value === 0) return null
  return (
    <span className={`rounded-lg px-2 py-1 text-[11px] font-medium ${className}`}>
      <span className="font-semibold tabular-nums">{value}</span> {label}
    </span>
  )
}

type Fetched =
  | { phase: 'loading' }
  | { phase: 'unavailable' }
  | { phase: 'none' }
  | { phase: 'board'; board: LiveBoard; fetchedAtMs: number }

/**
 * The live per-member board for a run that is happening right now.
 *
 * Andy, 2026-08-25: "if there are 20 people, I want to see each progress."
 * The coarse five-step bar (RunProgress) says which stage the runner is in;
 * this says what is happening to each individual client, updating every few
 * seconds while it happens.
 *
 * Data path: the browser polls the VPS directly at `{uploadUrl}/progress`
 * with the same short-lived signed token used for review artifacts — no new
 * auth path, and Vercel never proxies the board. Member ids are the only
 * member data rendered; nothing else from the payload reaches the screen.
 *
 * Falls back to `RunProgress` whenever there is no usable live board (older
 * runner, endpoint unreachable, board not written yet, or a stale board), so
 * this can only ever add detail — never take the existing progress away.
 */
export function LiveRunBoard({ progress, requestId }: { progress: string | null; requestId: number }) {
  const [state, setState] = useState<Fetched>({ phase: 'loading' })
  const [nowMs, setNowMs] = useState(0)

  useEffect(() => {
    let cancelled = false
    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function tick() {
      try {
        const { token, uploadUrl } = await getReviewToken()
        const res = await fetch(`${uploadUrl}/progress`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        if (res.status === 401 || res.status === 403) invalidateReviewToken()
        if (!res.ok) throw new Error('progress_unavailable')
        const parsed = parseProgressPayload(await res.json())
        if (cancelled) return
        // A board left behind by the previous run must not be mistaken for
        // this one's — the VPS keeps the last board until the next run
        // overwrites it, so an id mismatch means "not started yet".
        const board = parsed && parsed.requestId !== null && parsed.requestId !== requestId ? null : parsed
        setNowMs(Date.now())
        setState(board ? { phase: 'board', board, fetchedAtMs: Date.now() } : { phase: 'none' })
        // Once the board says finished/failed there is nothing left to
        // watch: stop polling and let the dashboard's own 5s router.refresh
        // (LiveDashboardRefresh, mounted whenever a run is in flight) swap
        // this card for the finished run's history card.
        if (board && isTerminalPhase(board.phase)) done = true
      } catch {
        if (!cancelled) {
          setNowMs(Date.now())
          setState(prev => (prev.phase === 'board' ? prev : { phase: 'unavailable' }))
        }
      } finally {
        if (!cancelled && !done) timer = setTimeout(tick, POLL_MS)
      }
    }

    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [requestId])

  if (state.phase !== 'board') return <RunProgress progress={progress} />

  const { board } = state
  const stale = isBoardStale(board.updatedAt, nowMs || state.fetchedAtMs)

  if (stale) {
    return (
      <>
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-900">
          Waiting for the automation… no update in the last few minutes.
        </p>
        <RunProgress progress={progress} />
      </>
    )
  }

  if (isTerminalPhase(board.phase)) {
    return (
      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <p className="text-xs font-medium text-emerald-900">
          {board.phase === 'failed' ? 'Run stopped — see the result below.' : 'Run finished — see the result below.'}
        </p>
      </div>
    )
  }

  const summary = summariseBoard(board.members)

  return (
    <div className="mt-3">
      {/* Summary strip: the whole run in one line, before any per-member detail. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-xs font-medium text-zinc-900">
          {summary.total} client{summary.total === 1 ? '' : 's'} in this run
        </span>
        <span className="text-xs text-zinc-500">{describePhase(board.phase)}</span>
        <div className="flex flex-wrap gap-1.5">
          <Count value={summary.ready} label="ready to review" className="bg-emerald-100 text-emerald-900" />
          <Count value={summary.inProgress} label="in progress" className="bg-blue-100 text-blue-900" />
          <Count value={summary.heldBack} label="held back" className="bg-amber-100 text-amber-900" />
          <Count value={summary.failed} label="failed" className="bg-red-100 text-red-900" />
          <Count value={summary.waiting} label="waiting" className="bg-zinc-100 text-zinc-600" />
        </div>
      </div>

      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
        <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${summary.percent}%` }} />
      </div>

      {board.members.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">Reading the uploaded file — clients appear here as the run picks them up.</p>
      ) : (
        <ul className={`mt-3 space-y-1.5 ${board.members.length > 10 ? 'max-h-96 overflow-y-auto pr-1' : ''}`}>
          {board.members.map(member => (
            <MemberRow key={member.memberId} member={member} />
          ))}
        </ul>
      )}
    </div>
  )
}
