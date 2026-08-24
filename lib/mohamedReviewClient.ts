/**
 * Shared client-side helper for fetching per-claim review artifacts
 * (fields.json / screenshot.png) from the VPS review endpoint, and — new —
 * a claim's steps/index.json manifest for the per-step viewer.
 *
 * One review token is minted per page render and shared across every
 * caller: runs have a handful of claims, each with a handful of steps, and
 * this avoids a token round trip per artifact. Cleared on failure so a
 * retry (e.g. expanding a card) can mint a fresh one.
 */

export type ReviewField = { label: string; value: string }

export type StepIndexEntry = {
  label: string
  order: number
  /** "" = the claim's existing top-level fields.json/screenshot.png; otherwise "steps/<label>". */
  path: string
  has_fields: boolean
  has_screenshot: boolean
}

let tokenPromise: Promise<{ token: string; uploadUrl: string }> | null = null

export function getReviewToken(): Promise<{ token: string; uploadUrl: string }> {
  if (!tokenPromise) {
    tokenPromise = (async () => {
      const res = await fetch('/api/mohamed/review-token', { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.ok || !json.uploadUrl) throw new Error('token_unavailable')
      return { token: json.token as string, uploadUrl: json.uploadUrl as string }
    })()
    tokenPromise.catch(() => {
      tokenPromise = null
    })
  }
  return tokenPromise
}

function artifactUrl(uploadUrl: string, runId: string, claimRef: string, path: string, artifact: string): string {
  const prefix = path ? `${path}/` : ''
  return `${uploadUrl}/review/${runId}/${claimRef}/${prefix}${artifact}`
}

// fields.json per (claim, step-path), cached so repeated selections of the
// same step or repeated mounts share one fetch. null = artifact missing (404).
const fieldsCache = new Map<string, Promise<ReviewField[] | null>>()

export function getReviewFields(runId: string, claimRef: string, path = ''): Promise<ReviewField[] | null> {
  const key = `${runId}/${claimRef}/${path}`
  let cached = fieldsCache.get(key)
  if (!cached) {
    cached = (async () => {
      const { token, uploadUrl } = await getReviewToken()
      const res = await fetch(artifactUrl(uploadUrl, runId, claimRef, path, 'fields.json'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 404) return null
      if (!res.ok) throw new Error('fields_unavailable')
      const payload = await res.json()
      return Array.isArray(payload.fields) ? (payload.fields as ReviewField[]) : []
    })()
    cached.catch(() => {
      fieldsCache.delete(key)
    })
    fieldsCache.set(key, cached)
  }
  return cached
}

/** Returns an object URL for the screenshot, or null if it's missing/unavailable. Never throws. */
export async function getReviewScreenshotUrl(runId: string, claimRef: string, path = ''): Promise<string | null> {
  try {
    const { token, uploadUrl } = await getReviewToken()
    const res = await fetch(artifactUrl(uploadUrl, runId, claimRef, path, 'screenshot.png'), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

const stepsCache = new Map<string, Promise<StepIndexEntry[] | null>>()

/** Fetches a claim's steps/index.json. Returns null when the claim has no
 * step captures (older runs, or a claim that failed before any step
 * captured) -- callers fall back to the legacy single-screenshot view. */
export function getClaimSteps(runId: string, claimRef: string): Promise<StepIndexEntry[] | null> {
  const key = `${runId}/${claimRef}`
  let cached = stepsCache.get(key)
  if (!cached) {
    cached = (async () => {
      try {
        const { token, uploadUrl } = await getReviewToken()
        const res = await fetch(`${uploadUrl}/review/${runId}/${claimRef}/steps/index.json`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return null
        const payload = await res.json()
        return Array.isArray(payload.steps) && payload.steps.length > 0 ? (payload.steps as StepIndexEntry[]) : null
      } catch {
        return null
      }
    })()
    stepsCache.set(key, cached)
  }
  return cached
}

const MEMBER_ID_LABEL = /member.?id/i

/** The member id is how Mohamed identifies claims -- pulled from whichever
 * field's label looks like "Member ID" in the captured field list. */
export function extractMemberId(fields: ReviewField[] | null): string | null {
  if (!fields) return null
  const field = fields.find(f => MEMBER_ID_LABEL.test(f.label))
  return field?.value ?? null
}

const SERVICE_LINE_LABEL = /^03-service-line-(\d+)$/

const STEP_DISPLAY_NAMES: Record<string, string> = {
  '01-member-info': 'Member info',
  '02-diagnosis': 'Diagnosis',
  '99-review': 'Review',
  '99-failure': 'Failure',
}

/** Maps a wizard step label (see the mohamed repo's live_hcpf.py) to a
 * plain name for the step strip. Falls back to the raw label for anything
 * outside the fixed vocabulary so a future step never renders as blank. */
export function stepDisplayLabel(label: string): string {
  if (STEP_DISPLAY_NAMES[label]) return STEP_DISPLAY_NAMES[label]
  const serviceLine = SERVICE_LINE_LABEL.exec(label)
  if (serviceLine) return `Service line ${serviceLine[1]}`
  return label
}
