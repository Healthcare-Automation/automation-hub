import type { ClientReport } from './clientReport'

/**
 * The client report as email HTML — one email per report tab: Operations, DJC, Kimedics.
 *
 * Renderer constraints (learned the hard way on the weekly report):
 *  - Gmail-IMAP strips <style>: layout uses inline-block blocks with min-widths (fluid hybrid),
 *    never media queries; the palette is all-light with explicit colours everywhere so Gmail's
 *    dark-mode auto-invert produces one coherent dark rendering.
 *  - Apple Mail / Outlook mobile honour <style>: they get a real dark theme via classes
 *    (.page/.card/.track/.tm/.ts/.tf/.stat/.shell) plus a small-screen stat override.
 *  - Bars are table cells with background colours — no images, nothing to block or mis-invert.
 */
export type ReportSection = 'ops' | 'djc' | 'kim' | 'all'

export const SECTION_TITLES: Record<ReportSection, string> = {
  ops: 'Operations',
  djc: 'Dentist Job Cafe',
  kim: 'Kimedics',
  all: 'Full report',
}

const C = {
  text: '#1f2937',
  sub: '#4b5563',
  faint: '#9ca3af',
  card: '#ffffff',
  page: '#f3f4f6',
  line: '#e5e7eb',
  cyan: '#0e7490',
  teal: '#0f766e',
  amber: '#b45309',
  barCyan: '#38bdf8',
  barCyanSoft: '#bae6fd',
  barTeal: '#5eead4',
  barAmber: '#fcd34d',
  barPrior: '#c7ced9',
  barTrack: '#eef2f7',
}

const FONT = `-apple-system,'Segoe UI',Roboto,Arial,sans-serif`

const fmtMonth = (m: string) =>
  new Date(m + '-02').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

/** "2 Aug 2026, 3:46 am" — a timestamp a person can read, not an ISO string. */
const fmtStamp = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`
    + `, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

/** Week-commencing date, e.g. "Jul 21". */
const fmtWeek = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/* ── building blocks ──────────────────────────────────────────────────────── */

function stat(value: string, label: string, tone = C.text): string {
  return `<div class="stat" style="display:inline-block;vertical-align:top;width:49%;min-width:170px;max-width:305px;">
    <div class="card" style="background:${C.card};border:1px solid ${C.line};border-radius:10px;margin:4px;overflow:hidden;">
      <div style="height:3px;background:${tone === C.text ? C.line : tone};font-size:1px;line-height:3px;">&nbsp;</div>
      <div style="padding:12px 14px 13px;">
        <div class="tm" style="font:700 21px/1.1 ${FONT};color:${tone};letter-spacing:-.3px;">${value}</div>
        <div class="ts" style="margin-top:5px;font:400 11px/1.45 ${FONT};color:${C.sub};">${label}</div>
      </div>
    </div></div>`
}

function statRow(cards: string[]): string {
  return `<div style="text-align:left;font-size:0;margin:0 -4px 10px;">${cards.join('')}</div>`
}

function card(inner: string, title?: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card"
    style="background:${C.card};border:1px solid ${C.line};border-radius:12px;margin:0 0 14px;">
    <tr><td style="padding:15px 17px;">
      ${title ? `<p class="tf" style="margin:0 0 9px;font:600 10px/1 ${FONT};color:${C.faint};letter-spacing:.8px;">${title.toUpperCase()}</p>` : ''}
      ${inner}
    </td></tr></table>`
}

/** Two blocks side by side on desktop, stacked on phones — inline-block hybrid, no media queries. */
function half(inner: string): string {
  return `<div style="display:inline-block;vertical-align:top;width:49%;min-width:260px;max-width:305px;">
    <div style="margin:0 4px;">${inner}</div></div>`
}

/**
 * A labelled bar that survives a phone.
 *
 * The old version put label, bar and value in three columns with the outer two pinned at 150px and
 * 90px. On a 390px screen that leaves the bar about ten pixels — which is exactly what Gmail on a
 * phone showed. Now the label and value share one row and the bar gets a full-width row beneath,
 * so nothing competes for horizontal space and there is no width at which it collapses.
 */
function hbar(label: string, value: string, pct: number, tone: string): string {
  const w = Math.max(Math.min(Math.round(pct), 100), 2)
  return `<tr><td style="padding:7px 0 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;">
      <tr>
        <td class="ts" style="padding:0 8px 3px 0;font:400 12px/1.35 ${FONT};color:${C.sub};">${label}</td>
        <td class="tm" style="padding:0 0 3px;font:700 13px/1.35 ${FONT};color:${C.text};text-align:right;white-space:nowrap;">${value}</td>
      </tr>
      <tr><td colspan="2" style="padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;"><tr>
          <td width="${w}%" style="background:${tone};border-radius:4px;font-size:1px;line-height:8px;">&nbsp;</td>
          <td width="${100 - w}%" class="track" style="background:${C.barTrack};border-radius:4px;font-size:1px;line-height:8px;">&nbsp;</td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>`
}

/** A thin labelled rule that separates areas of a long email without a heavy heading. */
function rule(label: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 10px;">
    <tr>
      <td class="tf" style="padding:0 10px 0 0;font:600 10px/1 ${FONT};color:${C.faint};letter-spacing:.9px;white-space:nowrap;">${label.toUpperCase()}</td>
      <td class="track" style="background:${C.line};font-size:1px;line-height:1px;">&nbsp;</td>
    </tr></table>`
}

/** A compact stacked bar — one row, several coloured segments, for role or outcome mixes. */
function stackBar(parts: { n: number; tone: string }[], height = 8): string {
  const total = parts.reduce((a, p) => a + p.n, 0) || 1
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;"><tr>
    ${parts.filter(p => p.n > 0).map(p =>
      `<td width="${Math.max((p.n / total) * 100, 1)}%" style="background:${p.tone};font-size:1px;line-height:${height}px;">&nbsp;</td>`).join('')}
  </tr></table>`
}

/** Legend chips that match a stacked bar, so a reader can decode it without the dashboard. */
function legend(items: { label: string; tone: string; n?: number }[]): string {
  return `<p class="ts" style="margin:6px 0 0;font:400 11px/1.7 ${FONT};color:${C.sub};">
    ${items.map(i => `<span style="white-space:nowrap;"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${i.tone};"></span>&nbsp;${i.label}${i.n === undefined ? '' : ` <b class="tm" style="color:${C.text};">${i.n.toLocaleString()}</b>`}</span>`).join('&nbsp;&nbsp;·&nbsp; ')}
  </p>`
}

function tableCard(
  title: string,
  headers: string[],
  rows: string[][],
  toneCols: Record<number, (raw: string) => string> = {},
): string {
  return `<p class="tf" style="margin:0 0 6px;font:600 10px/1 ${FONT};color:${C.faint};letter-spacing:.8px;">${title.toUpperCase()}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card"
      style="background:${C.card};border:1px solid ${C.line};border-radius:10px;margin:0 0 12px;">
      <tr>${headers.map((h, i) => `<td class="tf" style="padding:7px ${i === headers.length - 1 ? '10px' : '4px'} 4px ${i === 0 ? '10px' : '4px'};font:600 10px ${FONT};color:${C.faint};text-align:${i === 0 ? 'left' : 'right'};">${h}</td>`).join('')}</tr>
      ${rows.map(r => `<tr>${r.map((cell, i) => {
        const color = toneCols[i] ? toneCols[i](cell) : i === 0 ? C.sub : C.text
        return `<td class="${i === 0 ? 'ts' : 'tm'}" style="padding:4px ${i === r.length - 1 ? '10px' : '4px'} 4px ${i === 0 ? '10px' : '4px'};border-top:1px solid ${C.line};font:${i === 0 ? 400 : 600} 12px ${FONT};color:${color};text-align:${i === 0 ? 'left' : 'right'};white-space:nowrap;">${cell}</td>`
      }).join('')}</tr>`).join('')}
    </table>`
}

function head(title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${title}</title>
<style>
  @media (prefers-color-scheme: dark) {
    body, .page { background: #101113 !important; }
    .card { background: #1b1d21 !important; border-color: #34363c !important; }
    .track { background: #2a2d33 !important; }
    .tm { color: #e7e7ea !important; }
    .ts { color: #a7abb3 !important; }
    .tf { color: #6f7480 !important; }
  }
  @media only screen and (max-width: 480px) {
    .shell { padding: 14px 8px !important; }
    .stat { width: 100% !important; max-width: 100% !important; }
  }
</style>
</head>
<body class="page" style="margin:0;padding:0;background:${C.page};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="page" style="background:${C.page};">
  <tr><td align="center" class="shell" style="padding:24px 12px;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;">
  <tr><td>`
}

function foot(): string {
  return `<p class="tf" style="margin:14px 0 0;font:400 11px/1.6 ${FONT};color:${C.faint};">
      Sent from the Proxi Automation Hub. Every figure comes from the live dashboard — reply to
      this email for access or questions.
    </p>
  </td></tr></table></td></tr></table>
</body></html>`
}

function header(section: ReportSection, generatedAt: string, lede: string): string {
  const n = section === 'ops' ? '01' : section === 'djc' ? '02' : '03'
  return `<p class="tf" style="margin:0;font:600 11px/1 ${FONT};color:${C.faint};letter-spacing:2px;">PROXI · ${n}</p>
    <h1 class="tm" style="margin:6px 0 0;font:700 21px/1.3 ${FONT};color:${C.text};">${SECTION_TITLES[section]}</h1>
    <p class="ts" style="margin:6px 0 16px;font:400 13px/1.55 ${FONT};color:${C.sub};">${lede}
      <span class="tf" style="color:${C.faint};">Figures as of ${fmtStamp(generatedAt)}.</span></p>`
}

const deltaTone = (raw: string) =>
  raw.startsWith('+') || raw === 'new' ? C.teal : raw.startsWith('−') ? C.amber : C.faint

const deltaText = (a: number, b: number) =>
  b > 0 ? `${a >= b ? '+' : '−'}${Math.abs(Math.round(((a - b) / b) * 100))}%` : a > 0 ? 'new' : '—'

/* ── 01 · Operations ──────────────────────────────────────────────────────── */

function opsBody(r: ClientReport): string {
  const o = r.ops
  const delta = o.ytdPlaced - o.priorYtdPlaced
  const pct = o.priorYtdPlaced ? Math.round((delta / o.priorYtdPlaced) * 100) : 0
  const maxMonthly = Math.max(...o.monthly.map(m => Math.max(m.placed, m.prior ?? 0)), 1)
  const pipe = o.pipeline
  const neverSub = pipe.pairs ? Math.round(((pipe.pairs - pipe.submitted) / pipe.pairs) * 100) : 0

  const quarterPills = o.quarters.map(q => {
    const up = q.prior !== null && q.placed >= q.prior
    const bg = q.prior === null ? '#eef0f3' : up ? '#d5f5ef' : '#fdeeda'
    const fg = q.prior === null ? C.sub : up ? C.teal : C.amber
    const cmp = q.prior === null ? '' : ` <span style="font-weight:400;">vs ${q.prior}</span>`
    return `<span style="display:inline-block;margin:2px 4px 2px 0;padding:5px 10px;border-radius:999px;
      background:${bg};font:700 12px/1.2 ${FONT};color:${fg};white-space:nowrap;">${q.label.split(' ')[0]} ${q.placed}${cmp}</span>`
  }).join('')

  return header('ops', r.generatedAt,
      `<b style="color:${delta >= 0 ? C.teal : C.amber};">${o.ytdPlaced} placements this year — ${delta >= 0 ? 'up' : 'down'} ${Math.abs(pct)}%</b> on the same span of last year (${o.priorYtdPlaced}).`)
    + statRow([
      stat(String(o.ytdPlaced), 'placed this year', C.cyan),
      stat(`${delta >= 0 ? '+' : ''}${pct}%`, `vs the same span last year · ${o.avgPerMonth.toFixed(1)} a month`, delta >= 0 ? C.teal : C.amber),
    ])
    + card(`<div>${quarterPills}</div>
      <p class="ts" style="margin:6px 0 0;font:400 11px/1.4 ${FONT};color:${C.sub};">each quarter against the same quarter a year earlier</p>`,
      'Quarterly results')
    + card(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${o.monthly.map((m, i, a) => {
          const partial = i === a.length - 1
          const up = m.prior !== null && m.placed > m.prior
          const yoyColor = partial || m.prior === null ? C.faint : up ? C.teal : C.amber
          return `<tr>
          <td width="80" class="ts" style="padding:5px 8px 5px 0;font:400 12px/1.3 ${FONT};color:${C.sub};white-space:nowrap;">
            ${fmtMonth(m.month)}${partial ? ` <span style="font-size:10px;color:${C.faint};">so far</span>` : ''}<br>
            <span style="font:600 11px ${FONT};color:${yoyColor};">${m.prior === null ? '—' : `vs ${m.prior}`}</span>
          </td>
          <td style="padding:5px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td width="${Math.max(Math.round((m.placed / maxMonthly) * 100), 2)}%" style="background:${partial ? C.barPrior : up ? C.barTeal : m.prior !== null ? C.barAmber : C.barCyan};border-radius:4px;font-size:4px;line-height:10px;">&nbsp;</td>
                  <td style="font-size:4px;">&nbsp;</td></tr>
              ${m.prior !== null ? `<tr><td width="${Math.max(Math.round((m.prior / maxMonthly) * 100), 2)}%" style="background:${C.barPrior};border-radius:4px;font-size:3px;line-height:6px;">&nbsp;</td><td style="font-size:3px;">&nbsp;</td></tr>` : ''}
            </table></td>
          <td width="40" class="tm" style="padding:5px 0 5px 10px;font:700 13px ${FONT};color:${C.text};text-align:right;">${m.placed}</td>
        </tr>`}).join('')}
      </table>
      <p class="ts" style="margin:8px 0 0;font:400 11px/1.4 ${FONT};color:${C.sub};">
        Wide bar = this year · slim grey = same month last year. The "vs" number is last year's count,
        green when we beat it.
      </p>`, 'Placements per month')
    + card(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${hbar('Put forward for a job', pipe.pairs.toLocaleString(), 100, C.barCyanSoft)}
        ${hbar('Reached submittal', pipe.submitted.toLocaleString(), (pipe.submitted / (pipe.pairs || 1)) * 100, C.barCyan)}
        ${hbar('Placed', pipe.placed.toLocaleString(), (pipe.placed / (pipe.pairs || 1)) * 100, C.barTeal)}
      </table>
      <p class="ts" style="margin:8px 0 0;font:400 12px/1.55 ${FONT};color:${C.sub};">
        ${pipe.pairs.toLocaleString()} pairings across ${pipe.people.toLocaleString()} people and
        ${pipe.jobs.toLocaleString()} jobs — <b style="color:${C.amber};">${neverSub}% never reach
        submittal</b>. This year so far: ${pipe.ytd.pairs.toLocaleString()} put forward and
        ${pipe.ytd.placed} placed, against ${pipe.priorYtd.pairs.toLocaleString()} and
        ${pipe.priorYtd.placed} by this point last year.
      </p>
      ${pipe.seasonality && pipe.seasonality.yearsAgreeing === pipe.seasonality.years
        && pipe.seasonality.years >= 3
        ? `<p class="ts" style="margin:8px 0 0;font:400 12px/1.55 ${FONT};color:${C.sub};">
             <b style="color:${C.text};">When a candidate goes forward matters.</b> Of everyone put
             forward in ${pipe.seasonality.best.month},
             <b style="color:${C.teal};">${pipe.seasonality.best.pct}% ended up placed</b>; in
             ${pipe.seasonality.worst.month} it was ${pipe.seasonality.worst.pct}%, against a
             ${pipe.seasonality.avgPct}% average — and ${pipe.seasonality.best.month} beat
             ${pipe.seasonality.worst.month} in all ${pipe.seasonality.years} years we can measure.
           </p>`
        : ''}`, 'The pipeline, all time')
    + `<div style="text-align:left;font-size:0;margin:0 -4px 2px;">
      ${half(tableCard('Placements by state', ['State', 'now', 'last yr', '&Delta;'],
        o.byState.slice(0, 8).map(s => [s.name, String(s.placed), String(s.prior), deltaText(s.placed, s.prior)]),
        { 2: () => C.faint, 3: deltaTone }))}
      ${half(tableCard('Placements by client', ['Client', 'now', 'last yr', '&Delta;'],
        o.byClient.slice(0, 8).map(c => [c.name.split(' ').slice(0, 3).join(' '), String(c.placed), String(c.prior), deltaText(c.placed, c.prior)]),
        { 2: () => C.faint, 3: deltaTone }))}
    </div>
    <p class="tf" style="margin:0 0 12px;font:400 10px/1.4 ${FONT};color:${C.faint};">Top 8 shown — the dashboard has the full lists.</p>`
    + rule('Supply vs demand')
    + card(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${o.supply.byState.slice(0, 8).map(st => {
          const gap = st.candidates === 0 && st.openJobs > 0
          const thin = !gap && st.openJobs > 0 && st.candidates < st.openJobs
          return `<tr>
            <td class="ts" style="padding:4px 8px 4px 0;font:400 12px ${FONT};color:${gap ? C.amber : C.sub};white-space:nowrap;">${st.state}</td>
            <td class="tm" style="padding:4px 6px;font:700 12px ${FONT};color:${C.text};text-align:right;">${st.openJobs}</td>
            <td class="tf" style="padding:4px 6px;font:400 11px ${FONT};color:${C.faint};">open</td>
            <td class="tm" style="padding:4px 6px;font:700 12px ${FONT};color:${gap ? C.amber : C.teal};text-align:right;">${st.candidates}</td>
            <td class="tf" style="padding:4px 0 4px 6px;font:400 11px ${FONT};color:${C.faint};">${gap ? 'nobody to send' : thin ? 'supply thin' : 'candidates'}</td>
          </tr>`
        }).join('')}
      </table>
      <p class="ts" style="margin:8px 0 0;font:400 11px/1.55 ${FONT};color:${C.sub};">
        ${o.supply.openNow} jobs open right now. Candidate counts are only those this DJC automation
        sourced — people Proxi holds from Indeed, referrals or its legacy book are not counted, so a
        gap here means a DJC gap, not necessarily an empty bench.
      </p>`, 'Open work vs who we have')

}

/* ── 02 · Dentist Job Cafe ────────────────────────────────────────────────── */

function djcBody(r: ClientReport): string {
  const d = r.djc
  const over = d.cycleUsed - d.cycleCap
  const reachBase = d.reach[0]?.people || 1
  const maxNew = Math.max(...d.newByMonth.map(m => m.total), 1)
  const activityTotal = d.activity.reduce((s, b) => s + b.count, 0) || 1

  return header('djc', r.generatedAt,
      over > 0
        ? `<b style="color:${C.amber};">${d.cycleUsed} of ${d.cycleCap} views used this cycle — ${over} over the cap.</b> The bottleneck is not sourcing — it is what happens after.`
        : `<b style="color:${C.cyan};">${d.cycleUsed} of ${d.cycleCap} views used this cycle.</b> The bottleneck is not sourcing — it is what happens after.`)
    + statRow([
      stat(`${d.cycleUsed} / ${d.cycleCap}`, `views used this cycle${over > 0 ? ` — ${over} over` : ''}`, over > 0 ? C.amber : C.cyan),
      stat(d.cycleUnique.toLocaleString(), 'candidates the automation saw this cycle', C.text),
      stat(String(d.cycleAdded), 'added to Salesforce', C.teal),
      stat(String(d.cycleAlready), 'already in Salesforce', C.cyan),
      stat(String(d.cycleNoContact), 'no contact found (skipped)', C.amber),
      stat(d.projectedTotal === null ? '—' : String(d.projectedTotal),
        `projected by cycle end${d.perDay !== null ? ` · ${d.perDay}/day, ${d.perWeek}/week` : ''}`,
        d.projectedTotal !== null && d.projectedTotal > d.cycleCap ? C.amber : C.teal),
    ])
    + tableCard('Each cycle vs its cap · what the views became',
      ['Cycle', 'views', 'cap', '±', 'added', 'in SF', 'no contact', 'other'],
      d.cycles.map(c => {
        const overC = c.used - c.cap
        return [
          new Date(c.start + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) + (c.partial ? '*' : ''),
          String(c.used), String(c.cap),
          c.partial ? '—' : overC > 0 ? `+${overC}` : String(overC),
          String(c.added), String(c.already), String(c.noContact), String(c.other),
        ]
      }),
      { 3: raw => raw.startsWith('+') ? C.amber : raw === '—' ? C.faint : C.teal,
        4: () => C.teal, 6: () => C.amber, 7: () => C.faint })
    + `<p class="tf" style="margin:-6px 0 12px;font:400 10px/1.5 ${FONT};color:${C.faint};">
        * tracking began mid-cycle — that row is only the part we observed. "Other" is counter movement
        the scheduled runs did not log per profile — mostly a one-off pass on 22 July that re-opened
        about 1,270 already-known profiles for experience and education details.
      </p>`
    + rule('The pool arriving on DJC')
    + card(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${(() => {
          const EX = ['General Dentistry', 'Dental Hygienist', 'Dental Assistant', 'Unknown']
          const months = [...new Set(d.newAccounts.map(a => a.month))]
            .filter(m => m.startsWith(String(new Date().getUTCFullYear()))).sort()
          const sum = (m: string, keep: (t: string) => boolean) =>
            d.newAccounts.filter(a => a.month === m && keep(a.target)).reduce((s2, a) => s2 + a.n, 0)
          return months.map(m => `<tr>
            <td width="64" class="ts" style="padding:4px 8px 4px 0;font:400 12px ${FONT};color:${C.sub};white-space:nowrap;">${fmtMonth(m)}</td>
            <td style="padding:4px 0;">${stackBar([
              { n: sum(m, t => t === 'General Dentistry'), tone: C.barCyan },
              { n: sum(m, t => !EX.includes(t)), tone: '#c4b5fd' },
              { n: sum(m, t => t === 'Dental Hygienist'), tone: C.barTeal },
              { n: sum(m, t => t === 'Dental Assistant'), tone: C.barAmber },
            ], 9)}</td>
            <td width="46" class="tm" style="padding:4px 0 4px 10px;font:700 13px ${FONT};color:${C.text};text-align:right;">${sum(m, () => true)}</td>
          </tr>`).join('')
        })()}
      </table>
      ${legend([
        { label: 'general dentists', tone: C.barCyan }, { label: 'specialists', tone: '#c4b5fd' },
        { label: 'hygienists', tone: C.barTeal }, { label: 'assistants', tone: C.barAmber },
      ])}
      <p class="ts" style="margin:6px 0 0;font:400 11px/1.5 ${FONT};color:${C.sub};">
        People who created a DJC account that month, among the candidates the automation has
        surfaced. Hygienist and assistant sourcing began in June 2026, so earlier months in those two
        roles reflect what we were scraping rather than who joined.
      </p>`, 'New accounts arriving on Dentist Job Cafe')
    + rule('What our views bought')
    + card(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${d.newByMonth.map(m => hbar(fmtMonth(m.month) +
          ` <span style="font-size:10px;color:${C.faint};">${m.general} GD · ${m.specialist} spec · ${m.hygienist} hyg · ${m.assistant} asst</span>`,
          String(m.total), (m.total / maxNew) * 100, C.barTeal)).join('')}
      </table>
`, 'New candidates added, by month')
    + card(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${d.activity.filter(b => b.count > 0).map((b, i) => `
          <td width="${Math.max((b.count / activityTotal) * 100, 2)}%"
              style="background:${i <= 1 ? C.barTeal : i === 2 ? C.barCyanSoft : C.barPrior};
                     font:600 10px/20px ${FONT};color:#1f2937;text-align:center;
                     ${i === 0 ? 'border-radius:5px 0 0 5px;' : ''}">${b.pct >= 8 ? b.pct + '%' : '&nbsp;'}</td>`).join('')}
      </tr></table>
      <p class="ts" style="margin:7px 0 0;font:400 11px/1.5 ${FONT};color:${C.sub};">
        ${d.activity.map(b => `${b.label} ${b.count.toLocaleString()}`).join(' · ')}
      </p>`, `Last active on DJC · ${activityTotal.toLocaleString()} candidates`)
    + card(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${d.reach.map((s, i) => hbar(s.label, String(s.people), (s.people / reachBase) * 100,
          i === d.reach.length - 1 ? C.barTeal : C.barCyan)).join('')}
      </table>
      <p class="ts" style="margin:8px 0 0;font:400 12px/1.6 ${FONT};color:${C.sub};">
        ${d.outreachMonthly.map(m =>
          `<b class="tm" style="color:${C.text};">${fmtMonth(m.month)}</b>: ${m.contacted} of ${m.sourced} contacted → ${m.putForward} put forward → ${m.submitted} submitted → <b style="color:${C.teal};">${m.placed} placed</b>`,
        ).join('<br>')}<br>
        Every step below the first is read from activity logged in Salesforce, so it shows what was
        recorded — not necessarily everything that happened.
      </p>`, 'From added to put forward')
    + card(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${d.channels.filter(c => c.contacted > 0).map(c => {
          const rate = (c.forwarded / (c.contacted || 1)) * 100
          const tone = c.key === 'call' ? C.barTeal : c.key === 'text' ? C.barCyan : '#c4b5fd'
          return hbar(`${c.label} <span style="font-size:10px;color:${C.faint};">${c.contacted} reached · ${c.engaged} ${c.engagedWord}</span>`,
            `${Math.round(rate)} per 100`, Math.min(rate, 100), tone)
        }).join('')}
      </table>
      <p class="ts" style="margin:8px 0 0;font:400 12px/1.55 ${FONT};color:${C.sub};">
        Every bar is the same 100 people reached — only the fill changes. Recruiters choose who to
        ring, so the call group is pre-selected for promise, and a candidate can be reached on more
        than one channel, so these overlap.
      </p>`, 'Which channel works')
    + rule('Why so few get put forward')
    + card(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td class="tf" style="padding:0 6px 5px 0;font:600 10px ${FONT};color:${C.faint};">ROLE</td>
          <td class="tf" style="padding:0 6px 5px;font:600 10px ${FONT};color:${C.faint};text-align:right;">SOURCED</td>
          <td class="tf" style="padding:0 6px 5px;font:600 10px ${FONT};color:${C.faint};text-align:right;">WITH A MATCH</td>
          <td class="tf" style="padding:0 6px 5px;font:600 10px ${FONT};color:${C.faint};text-align:right;">OPEN JOBS</td>
          <td class="tf" style="padding:0 0 5px 6px;font:600 10px ${FONT};color:${C.faint};text-align:right;">FWD</td>
        </tr>
        ${d.roleDemand.filter(x => x.sourced > 0).map(x => {
          const thin = x.openJobs < 5
          return `<tr>
            <td class="ts" style="padding:4px 6px 4px 0;border-top:1px solid ${C.line};font:400 12px ${FONT};color:${thin ? C.amber : C.sub};">${x.role}</td>
            <td class="tm" style="padding:4px 6px;border-top:1px solid ${C.line};font:700 12px ${FONT};color:${C.text};text-align:right;">${x.sourced}</td>
            <td class="tm" style="padding:4px 6px;border-top:1px solid ${C.line};font:600 12px ${FONT};color:${C.teal};text-align:right;">${x.withMatch}</td>
            <td class="tm" style="padding:4px 6px;border-top:1px solid ${C.line};font:700 12px ${FONT};color:${thin ? C.amber : C.text};text-align:right;">${x.openJobs}</td>
            <td class="tm" style="padding:4px 0 4px 6px;border-top:1px solid ${C.line};font:700 12px ${FONT};color:${x.forwarded ? C.teal : C.faint};text-align:right;">${x.forwarded}</td>
          </tr>`
        }).join('')}
      </table>
      <p class="ts" style="margin:8px 0 0;font:400 12px/1.55 ${FONT};color:${C.sub};">
        A candidate can only go forward if there is an open job to send them to.
        ${(() => {
          const sourced = d.roleDemand.reduce((a, x) => a + x.sourced, 0)
          const matched = d.roleDemand.reduce((a, x) => a + x.withMatch, 0)
          return `<b style="color:${C.text};">${sourced - matched} of ${sourced}</b> have no open job
            to be matched to. Roles in amber have fewer than five jobs open across all of Proxi.`
        })()}
      </p>
      ${d.competition ? `<p class="ts" style="margin:8px 0 0;font:400 12px/1.55 ${FONT};color:${C.sub};">
        <b style="color:${C.text};">And the jobs that exist are crowded.</b>
        ${d.competition.candidatesWaiting.toLocaleString()} candidates are matched to
        ${d.competition.openJobs} open jobs — the typical one already has
        <b style="color:${C.text};">${d.competition.medianPerJob}</b> waiting on it, the most contested
        ${d.competition.mostPerJob}. For the people this automation added, the jobs they match carry
        <b style="color:${C.text};">${d.competition.ourAvgRivals} other candidates</b> on average.
        These count only candidates this automation sourced, so the real queue is longer.
      </p>` : ''}`, 'What we source vs what there is to fill')
    + card(`
      ${statRow([
        stat(`${d.hoursPerWeek}h`, `returned per week — the manual process took ~${d.baselineHours}h/week`, C.teal),
        stat(d.hoursMonthly.map(m => `${fmtMonth(m.month)} ${m.hours}h`).join(' · '), 'hours returned by month', C.text),
      ])}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${d.timeTasks.map(t => `<tr>
          <td class="ts" style="padding:3px 8px 3px 0;font:400 12px ${FONT};color:${C.sub};">${t.label}</td>
          <td class="tf" style="padding:3px 0;font:400 11px ${FONT};color:${C.faint};text-align:right;white-space:nowrap;">${t.count.toLocaleString()} ×</td>
          <td class="tm" style="padding:3px 0 3px 10px;font:600 12px ${FONT};color:${C.text};text-align:right;white-space:nowrap;">${t.minutes} min</td>
        </tr>`).join('')}
      </table>`, 'Time saved · what a view costs')

}

/* ── 03 · Kimedics ────────────────────────────────────────────────────────── */

function kimBody(r: ClientReport): string {
  const k = r.kim
  const maxKim = Math.max(...k.months.map(m => m.opened), 1)
  const weeks = Math.round(k.hoursSaved / 40)

  const workTiles = [
    [k.emails.toLocaleString(), 'emails processed', C.cyan],
    [k.jobsTracked.toLocaleString(), 'jobs tracked end to end', C.cyan],
    [k.fieldPatches.toLocaleString(), 'fields written automatically', C.teal],
    [k.updated.toLocaleString(), 'jobs updated', C.text],
    [k.closed.toLocaleString(), 'jobs closed', C.text],
    [`${k.capturePct}%`, 'capture rate into Salesforce', C.teal],
    [`${k.syncMinutes} min`, 'median email → Salesforce', C.cyan],
    [String(k.worksites), 'worksites created', C.text],
    [String(k.selfHealed), 'failures self-healed', C.teal],
  ] as const

  // Weekly intake, excluding the week still in progress — a partial week reads as a slowdown.
  const fullWeeks = k.weeks.slice(0, -1).slice(-4)
  const recentWeekly = fullWeeks.length
    ? Math.round(fullWeeks.reduce((a, w) => a + w.opened, 0) / fullWeeks.length) : 0

  return header('kim', r.generatedAt,
      `<b style="color:${C.text};">${k.jobsOpened} roles opened this year</b> (${k.priorJobsOpened} by this point last year) — ${k.jobsForwardPct}% had a candidate put forward and <b style="color:${C.teal};">${k.jobsFilledPct}% were filled</b>.`)
    + statRow([
      stat(String(k.jobsOpened), `jobs opened this year (${k.priorJobsOpened} last year)`, C.cyan),
      stat(`${k.jobsFilledPct}%`, `filled · ${k.jobsForwardPct}% had someone put forward`, C.teal),
      stat(String(k.jobsOpenNow), `open right now — ${k.openStale} waiting over 3 months`, k.openStale > 0 ? C.amber : C.text),
      stat(String(recentWeekly), 'jobs a week lately (last 4 full weeks)', C.text),
    ])
    + card(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${k.months.map((m, i, a) => {
          const rate = m.opened ? Math.round((m.filled / m.opened) * 100) : 0
          return hbar(fmtMonth(m.month) + (i === a.length - 1 ? ` <span style="font-size:10px;color:${C.faint};">so far</span>` : ''),
            `${m.filled} of ${m.opened} · ${rate}%${m.prior !== null ? ` · LY ${m.prior}` : ''}`,
            (m.opened / maxKim) * 100, m.filled > 0 ? C.barTeal : C.barCyanSoft)
        }).join('')}
      </table>
      <p class="ts" style="margin:8px 0 0;font:400 11px/1.5 ${FONT};color:${C.sub};">
        Quarterly: ${k.quarters.map(q => {
          const rate = q.opened ? Math.round((q.filled / q.opened) * 100) : 0
          return `<b class="tm" style="color:${C.text};">${q.label}</b> ${q.filled} of ${q.opened} (${rate}%)`
        }).join(' · ')}
      </p>
      <p class="ts" style="margin:6px 0 0;font:400 11px/1.5 ${FONT};color:${C.sub};">
        Weekly intake: ${k.weeks.slice(-6).map((w, i, a) =>
          `<b class="tm" style="color:${C.text};">${fmtWeek(w.weekStart)}</b> ${w.opened}${i === a.length - 1 ? ' so far' : ''}`
        ).join(' · ')}
      </p>`, 'Jobs by month · filled of arrived')
    + card(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${k.durations.map(d => `<tr>
            <td class="ts" style="padding:3px 8px 3px 0;font:400 12px ${FONT};color:${C.sub};">${d.label}</td>
            <td class="tm" style="padding:3px 0;font:700 12px ${FONT};color:${C.text};text-align:right;">${d.jobs}</td>
            <td class="tf" style="padding:3px 0 3px 10px;font:400 11px ${FONT};color:${C.faint};text-align:right;">${d.pct}% of open</td>
          </tr>`).join('')}
      </table>
      <p class="ts" style="margin:8px 0 0;font:400 11px/1.5 ${FONT};color:${C.sub};">
        ${k.openAgeMedian !== null ? `Half of what is open has been waiting ${k.openAgeMedian}+ days. ` : ''}Counts
        the ${k.jobsOpenNow} jobs open today only — Salesforce does not record when a job was filled
        or closed, so how long past jobs took cannot be measured yet.
      </p>`, 'How long the open jobs have been waiting')
    + rule('How each month clears')
    + card(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${k.outcomes.months.filter(m => m.intake >= 5
            && m.name.startsWith(String(new Date().getUTCFullYear()))).map(m => `<tr>
          <td width="64" class="ts" style="padding:4px 8px 4px 0;font:400 12px ${FONT};color:${C.sub};white-space:nowrap;">${fmtMonth(m.name)}</td>
          <td style="padding:4px 0;">${stackBar([
            { n: m.filled, tone: C.barTeal },
            { n: m.closedUnfilled, tone: C.barPrior },
            { n: m.openUnfilled, tone: C.barAmber },
          ], 9)}</td>
          <td width="118" class="tm" style="padding:4px 0 4px 10px;font:600 12px ${FONT};color:${C.text};text-align:right;white-space:nowrap;">
            <span style="color:${C.teal};">${m.filled} filled</span><span style="font-weight:400;color:${C.faint};"> of ${m.intake}</span>
          </td>
        </tr>`).join('')}
      </table>
      ${legend([
        { label: 'filled', tone: C.barTeal },
        { label: 'closed without a fill', tone: C.barPrior },
        { label: 'still waiting', tone: C.barAmber },
      ])}
      <p class="ts" style="margin:6px 0 0;font:400 11px/1.5 ${FONT};color:${C.sub};">
        What became of each month's intake. Read it with maturity in mind — a month that only just
        opened has had no time to clear. Months with fewer than five surviving jobs are left out.
      </p>`, "What became of each month's jobs")
    + `<div style="text-align:left;font-size:0;margin:0 -4px 2px;">
      ${half(tableCard('Open now by state', ['State', 'open', '&gt;3 mo'],
        k.openByState.slice(0, 7).map(g => [g.name, String(g.jobs), g.stale > 0 ? String(g.stale) : '—']),
        { 2: raw => raw === '—' ? C.faint : C.amber }))}
      ${half(tableCard('Open now by role', ['Role', 'open', '&gt;3 mo'],
        k.openByType.slice(0, 7).map(g => [g.name, String(g.jobs), g.stale > 0 ? String(g.stale) : '—']),
        { 2: raw => raw === '—' ? C.faint : C.amber }))}
    </div>`
    + `<div style="text-align:left;font-size:0;margin:0 -4px 2px;">
      ${half(tableCard('Jobs by state, 12 mo', ['State', 'opened', 'filled'],
        k.byState.slice(0, 6).map(g => [g.name, String(g.opened), String(g.filled)]), { 2: () => C.teal }))}
      ${half(tableCard('Jobs by role, 12 mo', ['Role', 'opened', 'filled'],
        k.byType.slice(0, 6).map(g => [g.name, String(g.opened), String(g.filled)]), { 2: () => C.teal }))}
    </div>`
    + card(`
      <p class="ts" style="margin:0;font:400 12px/1.6 ${FONT};color:${C.sub};">
        ${k.practicesTotal} practices have given us work; the largest single client is
        <b class="tm" style="color:${C.text};">${k.topPracticeShare}%</b> of everything opened this year.
        Busiest locations: ${k.cities.map(c =>
          `${c.name} (${c.opened}${c.everPlaced === 0 ? ` <b style="color:${C.amber};">— never placed here</b>` : ''})`,
        ).join(' · ')}.
      </p>`, 'Where the demand concentrates')
    + card(`
      <div style="padding:2px 0 6px;">
        <span class="tm" style="font:700 34px/1 ${FONT};color:${C.teal};">${k.hoursSaved}</span>
        <span class="ts" style="font:600 15px/1 ${FONT};color:${C.teal};"> hours</span>
        <p class="ts" style="margin:6px 0 0;font:400 12px/1.5 ${FONT};color:${C.sub};">
          of manual work returned — roughly <b class="tm" style="color:${C.text};">${weeks} working
          weeks</b> of a person's time, across ${k.statesActive} states.
          By month: ${k.hoursMonthly.map(m => `${m.month} ${m.hours}h`).join(' · ')}.
        </p>
      </div>
      <div style="text-align:left;font-size:0;margin:0 -4px;">
        ${workTiles.map(([v, l, tone]) => `<div class="stat" style="display:inline-block;vertical-align:top;width:33%;min-width:170px;">
          <div class="card" style="background:${C.card};border:1px solid ${C.line};border-radius:10px;margin:4px;padding:10px 12px;">
            <div class="tm" style="font:700 18px/1.1 ${FONT};color:${tone};">${v}</div>
            <div class="tf" style="margin-top:4px;font:400 10px/1.4 ${FONT};color:${C.faint};">${l}</div>
          </div></div>`).join('')}
      </div>
      <p class="ts" style="margin:10px 0 0;font:400 12px/1.6 ${FONT};color:${C.sub};">
        <b class="tm" style="color:${C.text};">Month by month:</b>
        ${k.workMonthly.slice(-6).map(m =>
          `${fmtMonth(m.month)} <b class="tm" style="color:${C.text};">${m.hours}h</b>` +
          ` <span style="color:${C.faint};">(${m.emails} emails · ${m.jobsTracked} jobs)</span>`
        ).join(' · ')}
      </p>
      <p class="ts" style="margin:6px 0 0;font:400 11px/1.5 ${FONT};color:${C.sub};">
        Every number here is work nobody at Proxi had to do by hand. Jobs are counted in the month
        they were first seen, so months add up without counting the same job twice.
      </p>`, 'The work the automation does')

}

/* ── entry point ──────────────────────────────────────────────────────────── */

/** A page break between stacked sections — visible on screen, and a real break when printed. */
const sectionBreak = `<div style="height:26px;font-size:1px;line-height:26px;page-break-before:always;">&nbsp;</div>`

export function renderClientReportEmail(r: ClientReport, section: ReportSection): string {
  const title = `Proxi — ${SECTION_TITLES[section]}`
  if (section === 'ops') return head(title) + opsBody(r) + foot()
  if (section === 'djc') return head(title) + djcBody(r) + foot()
  if (section === 'kim') return head(title) + kimBody(r) + foot()
  // Everything in one email, in the order the dashboard reads.
  return head(title)
    + opsBody(r) + sectionBreak + djcBody(r) + sectionBreak + kimBody(r)
    + foot()
}
