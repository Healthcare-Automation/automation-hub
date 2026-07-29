import type { ClientReport } from './clientReport'

/**
 * The client report as email HTML.
 *
 * Email rules learned the hard way on the weekly Proxi report: Gmail mobile strips <style> blocks
 * and auto-inverts page colours in dark mode — but not images or explicit backgrounds. So
 * everything is inline styles on tables, every card is LIGHT, and there is no dark hero anywhere.
 * Bars are plain <td> cells with background colours and percentage widths.
 */
const C = {
  text: '#18181b',
  sub: '#52525b',
  faint: '#a1a1aa',
  card: '#ffffff',
  page: '#f4f4f5',
  line: '#e4e4e7',
  cyan: '#0e7490',
  teal: '#0f766e',
  amber: '#b45309',
  barCyan: '#67e8f9',
  barTeal: '#5eead4',
  barTrack: '#f1f5f9',
}

const fmtMonth = (m: string) =>
  new Date(m + '-02').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

function card(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background:${C.card};border:1px solid ${C.line};border-radius:12px;margin:0 0 14px;">
    <tr><td style="padding:18px 20px;">${inner}</td></tr></table>`
}

function sectionHead(n: string, title: string, q: string): string {
  return `<p style="margin:26px 0 4px;font:600 11px/1 -apple-system,Segoe UI,Arial,sans-serif;
      color:${C.faint};letter-spacing:1px;">${n}</p>
    <h2 style="margin:0 0 2px;font:700 19px/1.3 -apple-system,Segoe UI,Arial,sans-serif;color:${C.text};">${title}</h2>
    <p style="margin:0 0 12px;font:400 13px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:${C.sub};">${q}</p>`
}

function stat(value: string, label: string, tone = C.text): string {
  return `<td width="25%" style="padding:4px 6px;">
    <div style="background:${C.card};border:1px solid ${C.line};border-radius:10px;padding:12px 14px;">
      <div style="font:700 22px/1 -apple-system,Segoe UI,Arial,sans-serif;color:${tone};">${value}</div>
      <div style="margin-top:6px;font:400 11px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:${C.sub};">${label}</div>
    </div></td>`
}

function bar(label: string, value: string, pct: number, tone: string): string {
  const w = Math.max(Math.min(Math.round(pct), 100), 2)
  return `<tr>
    <td style="padding:3px 8px 3px 0;font:400 12px/1.3 -apple-system,Segoe UI,Arial,sans-serif;color:${C.sub};white-space:nowrap;">${label}</td>
    <td width="100%" style="padding:3px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="${w}%" style="background:${tone};border-radius:4px;font-size:2px;line-height:6px;">&nbsp;</td>
        <td width="${100 - w}%" style="background:${C.barTrack};border-radius:4px;font-size:2px;line-height:6px;">&nbsp;</td>
      </tr></table></td>
    <td style="padding:3px 0 3px 10px;font:600 12px/1.3 -apple-system,Segoe UI,Arial,sans-serif;color:${C.text};white-space:nowrap;text-align:right;">${value}</td>
  </tr>`
}

export function renderClientReportEmail(r: ClientReport): string {
  const font = `-apple-system,Segoe UI,Arial,sans-serif`
  const opsDelta = r.ops.ytdPlaced - r.ops.priorYtdPlaced
  const opsPct = r.ops.priorYtdPlaced ? Math.round((opsDelta / r.ops.priorYtdPlaced) * 100) : 0
  const over = r.djc.cycleUsed - r.djc.cycleCap
  const maxMonthly = Math.max(...r.ops.monthly.map(m => m.placed), 1)
  const reachBase = r.djc.reach[0]?.people || 1

  return `<!doctype html><html><body style="margin:0;padding:0;background:${C.page};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
  <tr><td align="center" style="padding:26px 12px;">
  <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">
  <tr><td>

    <h1 style="margin:0;font:700 22px/1.3 ${font};color:${C.text};">Proxi — the month in one page</h1>
    <p style="margin:4px 0 20px;font:400 12px/1.5 ${font};color:${C.faint};">
      Generated ${r.generatedAt} · Operational · Dentist Job Cafe · Kimedics
    </p>

    ${sectionHead('01 · OPERATIONAL', 'Placements', 'Are we putting more people into jobs than last year?')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${stat(String(r.ops.ytdPlaced), 'placed this year', C.cyan)}
      ${stat(`${opsDelta >= 0 ? '+' : ''}${opsPct}%`, `vs the same span last year (${r.ops.priorYtdPlaced})`, opsDelta >= 0 ? C.teal : C.amber)}
      ${stat(r.ops.avgPerMonth.toFixed(1), 'placements a month')}
      ${stat(String(r.ops.jobsOpenNow), 'jobs open right now')}
    </tr></table>
    ${card(`
      <p style="margin:0 0 8px;font:600 11px/1 ${font};color:${C.faint};letter-spacing:.6px;">PLACEMENTS PER MONTH · GREY = SAME MONTH LAST YEAR</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${r.ops.monthly.map(m => `<tr>
          <td style="padding:3px 8px 3px 0;font:400 12px ${font};color:${C.sub};">${fmtMonth(m.month)}</td>
          <td width="100%" style="padding:3px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td width="${Math.max(Math.round((m.placed / maxMonthly) * 100), 2)}%" style="background:${C.barCyan};border-radius:3px;font-size:2px;line-height:8px;">&nbsp;</td>
                  <td style="font-size:2px;">&nbsp;</td></tr>
              ${m.prior !== null ? `<tr><td width="${Math.max(Math.round((m.prior / maxMonthly) * 100), 2)}%" style="background:${C.line};border-radius:3px;font-size:2px;line-height:5px;">&nbsp;</td><td style="font-size:2px;">&nbsp;</td></tr>` : ''}
            </table></td>
          <td style="padding:3px 0 3px 10px;font:600 12px ${font};color:${C.text};text-align:right;">${m.placed}</td>
        </tr>`).join('')}
      </table>
      <p style="margin:10px 0 0;font:400 12px/1.5 ${font};color:${C.sub};">
        Jobs: <b style="color:${C.text};">${r.ops.jobsOpened} opened</b> this year ·
        ${r.ops.jobsForwardPct}% had someone put forward · <b style="color:${C.teal};">${r.ops.jobsFilledPct}% filled</b>.
        Strongest states: ${r.ops.topStates.map(s => `${s.name} (${s.placed})`).join(', ')}.
        Top clients: ${r.ops.topClients.map(c => `${c.name.split(' ').slice(0, 2).join(' ')} (${c.placed})`).join(', ')}.
      </p>`)}

    ${sectionHead('02 · DENTIST JOB CAFE', 'Candidate sourcing', 'Is the DJC subscription paying off?')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${stat(`${r.djc.cycleUsed}`, `views used of ${r.djc.cycleCap} this cycle${over > 0 ? ` — ${over} over, add-ons bought` : ''}`, over > 0 ? C.amber : C.cyan)}
      ${stat(String(r.djc.cycleAdded), 'new contacts this cycle', C.teal)}
      ${stat(r.djc.uniqueCandidates.toLocaleString(), 'unique candidates seen all time')}
      ${stat(`${r.djc.hoursPerWeek}h`, 'manual work returned per week', C.teal)}
    </tr></table>
    ${card(`
      <p style="margin:0 0 8px;font:600 11px/1 ${font};color:${C.faint};letter-spacing:.6px;">FROM SOURCED TO PLACED — WHERE PEOPLE STOP</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${r.djc.reach.map(s => bar(s.label, String(s.people), (s.people / reachBase) * 100, C.barCyan)).join('')}
      </table>
      <p style="margin:10px 0 0;font:400 12px/1.5 ${font};color:${C.sub};">
        Per 100 candidates sourced, DJC has produced <b style="color:${C.amber};">${r.djc.djcPerHundred}</b> placements
        against <b style="color:${C.teal};">${r.djc.bestPerHundred}</b> from ${r.djc.bestSource}.
        The gap opens at outreach — nobody who was never contacted has been put forward — so the
        cheapest lever is working the candidates already on file.
      </p>`)}

    ${sectionHead('03 · KIMEDICS', 'The job pipeline', 'Is the job intake running itself?')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${stat(r.kim.emails.toLocaleString(), 'job emails processed', C.cyan)}
      ${stat(`${r.kim.capturePct}%`, 'captured into Salesforce', C.teal)}
      ${stat(`${r.kim.syncMinutes} min`, 'email → Salesforce, median')}
      ${stat(`${r.kim.hoursSaved}h`, 'manual work returned', C.teal)}
    </tr></table>
    ${card(`
      <p style="margin:0;font:400 12px/1.6 ${font};color:${C.sub};">
        ${r.kim.jobsTracked.toLocaleString()} jobs tracked end to end,
        <b style="color:${C.text};">${r.kim.fieldPatches.toLocaleString()} field corrections</b> written
        automatically, and ${r.kim.selfHealed} failures self-healed without anyone being paged.
        Every job email becomes a Salesforce record in minutes, around the clock — nobody watches an
        inbox any more.
      </p>`)}

    <p style="margin:18px 0 0;font:400 11px/1.6 ${font};color:${C.faint};">
      Sent from the Proxi Automation Hub. Every figure links back to a live dashboard view —
      reply to this email for access or questions.
    </p>

  </td></tr></table></td></tr></table></body></html>`
}
