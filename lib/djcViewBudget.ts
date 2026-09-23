/** Normalizes DJC Profile Views snapshots for known vendor counter anomalies.
 *
 * The Aug 15-Sep 15 cycle uniquely had a real 1,050-view allowance (750 base + 300
 * unused purchased credits carried over). At the Sep 15 reset, DJC returned to the
 * normal 750-view allowance but its raw "used" meter reset to 300 instead of zero.
 * Early Sep-cycle pipeline snapshots therefore stored 319/1,050 to preserve the right
 * remaining number (731), but that denominator and used count are misleading. During
 * this directly observed cycle, translate those stale rows to cycle-local 19/750.
 *
 * Fresh pipeline rows already arrive normalized as 19/750 and pass through unchanged.
 * This safeguard is explicitly time-bounded and should be reassessed at the Oct reset.
 */

export interface DjcViewsSnapshotPayload {
  used: number
  total: number
  remaining: number
  addon_active?: boolean
}

const SEP_RESET_OBSERVED_AT = Date.parse('2026-09-15T13:00:00.000Z')
const OCT_RESET_BOUNDARY = Date.parse('2026-10-15T04:00:00.000Z')

export function normalizeDjcProfileViewsSnapshot<T extends DjcViewsSnapshotPayload>(
  payload: T,
  checkedAt: string,
): T {
  const observedAt = Date.parse(checkedAt)
  const isStaleSepSnapshot =
    payload.total === 1050 &&
    payload.used >= 300 &&
    observedAt >= SEP_RESET_OBSERVED_AT &&
    observedAt < OCT_RESET_BOUNDARY

  if (!isStaleSepSnapshot) return payload

  return {
    ...payload,
    used: payload.used - 300,
    total: 750,
    remaining: 750 - (payload.used - 300),
  }
}
