/**
 * Mirrors Python ``build_salesforce_job_name`` / ``_city_for_job_name`` for Automation Hub display * (“Expected Job Name” in validation). Keep in sync with ``utils/sf_job_payload.py``.
 */

const US_STATE_PAIRS: [string, string][] = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'],
  ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
  ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'],
  ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
]

const STATE_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  US_STATE_PAIRS.map(([code, name]) => [name.toLowerCase(), code]),
)
const VALID_STATE_CODES = new Set(US_STATE_PAIRS.map(([c]) => c))

const SF_JOB_PRIMARY_ACCOUNT_DISPLAY_NAME = 'Aspen Dental Management Inc.'
const SPECIALTY_DEFAULT = 'General Dentistry'

function stateAbbrevForJobTitle(state: string | null | undefined): string {
  const s = (state || '').trim()
  if (!s) return ''
  if (s.length === 2 && /^[A-Za-z]{2}$/.test(s)) {
    const u = s.toUpperCase()
    return VALID_STATE_CODES.has(u) ? u : ''
  }
  const key = s.toLowerCase().replace(/\s+/g, ' ').trim()
  return STATE_NAME_TO_CODE[key] || ''
}

/** Match ``_parse_city_state`` / ``_city_for_job_name`` (Python). */
function cityForJobName(row: {
  city?: string | null
  practice_value?: string | null
  location_line?: string | null
}): string {
  const c0 = (row.city || '').trim()
  if (c0) return c0
  const { city: pc } = parseCityStateFromPractice(row.practice_value || '')
  if (pc) return pc
  const loc = (row.location_line || '').trim()
  if (loc && loc.includes(',')) {
    const i = loc.lastIndexOf(',')
    const left = loc.slice(0, i).trim()
    const noParen = left.replace(/\s*\([^)]*\)\s*$/u, '').trim()
    if (noParen) return noParen
  }
  return ''
}

function parseCityStateFromPractice(text: string): { city: string; state: string } {
  let s = (text || '').trim()
  if (!s) return { city: '', state: '' }
  let hadNumericPrefix = false
  const m = s.match(/^\d+\s*-\s*(.+)$/)
  if (m) {
    hadNumericPrefix = true
    s = m[1].trim()
  }
  s = s.replace(/^location\s*:\s*/i, '').trim()
  if (s.includes(',')) {
    const i = s.lastIndexOf(',')
    return { city: s.slice(0, i).trim(), state: s.slice(i + 1).trim() }
  }
  if (hadNumericPrefix && s) return { city: s, state: '' }
  return { city: '', state: '' }
}

function jobNameBrandDisplay(postingOrg: string | null | undefined): string {
  const po = (postingOrg || '').trim().toLowerCase()
  if (po.includes('heartland')) return 'Heartland Dental'
  if (po.includes('midwest')) return 'Midwest Dental'
  if (po.includes('aspen')) return SF_JOB_PRIMARY_ACCOUNT_DISPLAY_NAME
  const raw = (postingOrg || '').trim()
  return raw || SF_JOB_PRIMARY_ACCOUNT_DISPLAY_NAME
}

function jobStatusForSalesforcePush(raw: string | null | undefined): 'Open' | 'Closed' {
  const s = (raw || '').trim()
  if (!s) return 'Open'
  const low = s.toLowerCase().replace(/\s+/g, ' ')
  if (low.includes('not accepting')) return 'Closed'
  if (low.includes('accepting new provider')) return 'Open'
  if (low === 'open') return 'Open'
  return 'Closed'
}

export type SfJobNameLocationFallback = {
  Job_City__c?: string | null
  Job_State__c?: string | null
}

function rowWithJobNameLocationFallback<
  R extends {
    city?: string | null
    state?: string | null
    practice_value?: string | null
    location_line?: string | null
    posting_org?: string | null
    status?: string | null
  },
>(row: R, fb: SfJobNameLocationFallback | null | undefined): R {
  if (!fb) return row
  const out = { ...row }
  if (!(out.city || '').trim()) {
    const v = fb.Job_City__c
    if (v != null && String(v).trim()) out.city = String(v).trim()
  }
  if (!(out.state || '').trim()) {
    const v = fb.Job_State__c
    if (v != null && String(v).trim()) out.state = String(v).trim()
  }
  return out
}

/**
 * Optional ``Job_City__c`` / ``Job_State__c`` from Salesforce audit payloads * (``sf_scrape_fields_patched`` / skip ``next``) when ``job_content`` city/state are blank.
 */
export function jobNameLocationFallbackFromSfNext(
  next: Record<string, unknown> | null | undefined,
): SfJobNameLocationFallback | undefined {
  if (!next || typeof next !== 'object') return undefined
  const c = next['Job_City__c']
  const s = next['Job_State__c']
  const out: SfJobNameLocationFallback = {}
  if (c != null && String(c).trim()) out.Job_City__c = String(c).trim()
  if (s != null && String(s).trim()) out.Job_State__c = String(s).trim()
  return Object.keys(out).length ? out : undefined
}

export function buildExpectedSfJobName(
  row: {
    city?: string | null
    state?: string | null
    posting_org?: string | null
    practice_value?: string | null
    location_line?: string | null
    status?: string | null
  },
  jobNameLocationFallback?: SfJobNameLocationFallback | null,
): string {
  const r = rowWithJobNameLocationFallback(row, jobNameLocationFallback)
  const abbr = stateAbbrevForJobTitle(r.state || '')
  const city = cityForJobName(r)
  const st = jobStatusForSalesforcePush(r.status)
  const brand = jobNameBrandDisplay(r.posting_org)
  let name: string
  if (city) {
    const loc = abbr ? `${abbr} (${city})` : `(${city})`
    name = `${loc} ${SPECIALTY_DEFAULT} - ${brand} - ${st}`
  } else {
    const loc = abbr || ''
    name = loc
      ? `${loc} ${SPECIALTY_DEFAULT} - ${brand} - ${st}`
      : `${SPECIALTY_DEFAULT} - ${brand} - ${st}`
  }
  name = name.replace(/\s+/g, ' ').trim()
  if (name.startsWith('()')) name = name.slice(2).trim()
  const max = 80
  if (name.length > max) name = name.slice(0, max - 1).trimEnd() + '…'
  return name
}
