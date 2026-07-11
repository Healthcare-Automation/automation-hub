/**
 * Client-facing change log, per automation.
 *
 * Plain-English milestones distilled from each automation's engineering history.
 * Collapsed, an entry is a one-line `summary`; expanded, it shows `details` (a short
 * paragraph) and concrete `examples`. Keep everything outcome-focused and free of
 * internal jargon — this is what a client reads to understand how the automation has
 * improved. To add an entry: append to the relevant list (any order — sorted by date).
 */

export type Automation = 'kimedics' | 'djc'
export type ChangeCategory = 'new' | 'reliability' | 'accuracy' | 'reporting'

export interface ChangeEntry {
  date: string // ISO yyyy-mm-dd
  category: ChangeCategory
  title: string
  summary: string // one line (collapsed view)
  details: string // short paragraph (expanded view)
  examples?: string[] // concrete examples (expanded view)
}

export const CATEGORY_META: Record<
  ChangeCategory,
  { label: string; text: string; bg: string; ring: string; dot: string }
> = {
  new:         { label: 'New',         text: 'text-emerald-300', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/25', dot: 'bg-emerald-400' },
  reliability: { label: 'Reliability', text: 'text-cyan-300',    bg: 'bg-cyan-500/10',    ring: 'ring-cyan-500/25',    dot: 'bg-cyan-400' },
  accuracy:    { label: 'Accuracy',    text: 'text-amber-300',   bg: 'bg-amber-500/10',   ring: 'ring-amber-500/25',   dot: 'bg-amber-400' },
  reporting:   { label: 'Reporting',   text: 'text-violet-300',  bg: 'bg-violet-500/10',  ring: 'ring-violet-500/25',  dot: 'bg-violet-400' },
}

const KIMEDICS: ChangeEntry[] = [
  {
    date: '2026-04-09', category: 'new', title: 'Live in production',
    summary: 'The Kimedics → Salesforce automation went live, automatically syncing every job posting into Salesforce.',
    details: 'After a testing phase, the automation began running in production: it watches for Kimedics job emails around the clock, reads each posting, and files it into Salesforce with no manual data entry.',
    examples: ['Every new or updated job posting now appears in Salesforce within minutes, hands-free — no one copies anything by hand.'],
  },
  {
    date: '2026-04-15', category: 'accuracy', title: 'Cleaner Salesforce records',
    summary: 'Fixed duplicated address text and tightened how each job’s details are written to Salesforce.',
    details: 'Early on, some job addresses were written twice and a few fields didn’t map cleanly. We corrected the formatting so each record reads correctly the first time.',
    examples: ['An address like “113 Smith Ave, Shallotte NC” no longer appears duplicated in the record.'],
  },
  {
    date: '2026-04-23', category: 'reliability', title: 'Self-healing Salesforce sync',
    summary: 'Added an engine that automatically retries and repairs failed Salesforce updates, so nothing is silently dropped.',
    details: 'If Salesforce rejects part of an update (a value too long, a momentary error), the system retries, sets aside only the problem field, and saves the rest — instead of failing the whole job. It records what it recovered so the team has full visibility.',
    examples: ['If one field exceeds Salesforce’s length limit, the other fields still save and the issue is noted in the daily report.'],
  },
  {
    date: '2026-05-01', category: 'reliability', title: 'One-click re-sync for stuck jobs',
    summary: 'Added a manual re-scrape tool and made the scraper sturdier against page hiccups.',
    details: 'For the rare job that doesn’t sync, the team can trigger a fresh re-scrape with one click. We also hardened the scraper against page glitches that previously caused it to stall.',
    examples: ['A job that failed to load can be re-pulled instantly from the admin panel — no engineer needed.'],
  },
  {
    date: '2026-05-06', category: 'reliability', title: 'Automatic retries for missed jobs',
    summary: 'Jobs that don’t capture on the first try are now automatically re-attempted in the background.',
    details: 'If the initial read doesn’t fully capture a job, the system quietly re-tries it over the next several minutes, with sensible spacing so it doesn’t hammer a known-bad page. Most temporary failures now resolve themselves.',
    examples: ['A job whose page was slow to load gets re-read automatically about 5 minutes later and syncs.'],
  },
  {
    date: '2026-05-14', category: 'reporting', title: 'Redesigned daily report',
    summary: 'Rebuilt the daily report to show one row per email with full pipeline status, a Salesforce link per job, and a complete midnight-to-midnight view.',
    details: 'The daily report became a clear audit trail: each email gets a row showing whether it was read, mapped to Salesforce, how many fields were updated, and any notable actions — covering the full day in Eastern time.',
    examples: ['You can open any job’s Salesforce record directly from its row to verify it side-by-side.'],
  },
  {
    date: '2026-05-15', category: 'new', title: 'AI-polished job descriptions',
    summary: 'Job descriptions are now cleaned up by AI before syncing, so Salesforce gets client-ready copy.',
    details: 'Raw postings can include internal recruiter notes and rough formatting. AI now rewrites each into a clean, professional description and removes internal sourcing language before it reaches Salesforce.',
    examples: ['Internal notes are stripped out; the description reads as polished, client-facing copy.'],
  },
  {
    date: '2026-05-20', category: 'accuracy', title: 'Duplicate prevention',
    summary: 'A job missing its practice ID is now held back instead of risking a duplicate Salesforce record.',
    details: 'The practice ID is what ties a job to the right clinic and prevents duplicates. If it’s ever missing, the system pauses that job rather than guessing — avoiding a duplicate that would be painful to clean up later.',
    examples: ['A job that arrives without its practice code waits safely until the code can be read, instead of creating a second record.'],
  },
  {
    date: '2026-05-22', category: 'new', title: 'Hands-free job matching',
    summary: 'Rebuilt the logic that attaches each job to the right clinic in Salesforce — fully automatic, no manual steps, with duplicate-location prevention.',
    details: 'The matching logic was rebuilt to be fully automatic: it finds the correct existing clinic (or creates one) every time, with no human review step, and checks for duplicate worksites before creating a new one.',
    examples: ['A new clinic location is created once and reused; the same clinic never gets two worksite records.'],
  },
  {
    date: '2026-06-03', category: 'reliability', title: 'Duplicate self-repair',
    summary: 'The system now detects and fixes duplicate Salesforce job records on its own.',
    details: 'If two records for the same posting ever exist, the system detects it and consolidates to the correct one automatically, keeping Salesforce clean without manual cleanup.',
    examples: ['A job accidentally duplicated by an earlier process is auto-merged back to a single record.'],
  },
  {
    date: '2026-06-12', category: 'reporting', title: 'New weekly summary',
    summary: 'Launched a client-facing weekly report focused on hiring outcomes and how fast jobs get filled.',
    details: 'A weekly “pulse” report was added for stakeholders. It highlights outcomes — jobs filled, typical time-to-fill, and a national footprint map — rather than technical internals.',
    examples: ['Each Monday you get a one-glance summary, e.g. “X jobs filled · 2.9 days median time open.”'],
  },
  {
    date: '2026-06-16', category: 'new', title: 'Monthly & all-time reports + AI date reading',
    summary: 'Added monthly and all-time impact reports, and introduced AI to accurately read each job’s coverage dates — including newly added or cancelled dates.',
    details: 'Monthly and since-launch impact reports were added. We also replaced rigid date rules with AI that reads coverage dates from everyday language — correctly handling “dates added,” cancellations, and weekday notes.',
    examples: ['A note like “6/12 Dates added: June 29-30, July 1-2” is read exactly.', 'Cancelled dates are removed from the active list automatically.'],
  },
  {
    date: '2026-06-16', category: 'reliability', title: 'Date-confidence alerts',
    summary: 'The team is alerted whenever the AI isn’t fully certain about a job’s dates, so a human can verify before it’s relied on.',
    details: 'When the AI reads a job’s dates with less than full confidence, it emails the team with its reasoning and the exact source text — so a person can confirm before the dates are trusted.',
    examples: ['A confusingly-worded date note triggers a “please verify” email showing what the AI read and why it was unsure.'],
  },
  {
    date: '2026-06-18', category: 'accuracy', title: 'Safety net for messy posts',
    summary: 'Added an AI safety net that recovers details from posts with typos or formatting errors, plus an alert if a job’s coverage dates are ever missing.',
    details: 'When a posting has human errors — a missing label, a typo — an AI safety net recovers the fields the standard read missed. And because coverage dates must never be blank, the team is alerted if a job ever lacks them.',
    examples: ['A post that writes “Dates July 20-22” without the usual colon is still captured correctly.'],
  },
  {
    date: '2026-06-23', category: 'accuracy', title: 'Smarter date rules',
    summary: 'Tentative (“pending confirmation”) dates are now excluded from active needs, and date alerts show the exact text the AI read for easy review.',
    details: 'Some postings mark dates as “pending confirmation” (not yet active). Those are now excluded so only confirmed dates sync. Date-review alerts also show the exact source text for faster verification.',
    examples: ['A post saying “pending confirmation for June 22-24, open to submittals for June 25-26” now syncs only June 25-26.'],
  },
  {
    date: '2026-06-24', category: 'reporting', title: 'Reports to stakeholders + polish',
    summary: 'Weekly and monthly reports now reach Proxi stakeholders, plus a fix for a chart that vanished in dark-mode email.',
    details: 'The weekly and monthly reports were extended to Proxi stakeholders. We also fixed a trend chart that became invisible in some email apps’ dark mode.',
    examples: ['The hours-saved trend line is now legible whether the email is viewed in light or dark mode.'],
  },
  {
    date: '2026-06-28', category: 'reliability', title: 'Bulletproofed practice capture',
    summary: 'Fixed and hardened how a job’s practice location is captured (even for unlinked practices), with automatic re-scrape and an alert if a job ever gets stuck.',
    details: 'A job’s practice location (e.g. “4403 - Dublin, GA”) is required to file correctly and avoid duplicates. Some postings show it in a way the reader missed, pausing the job. We now read it directly, automatically re-try if it’s ever missed, and alert the team if a job stays stuck.',
    examples: ['A Dublin, GA job that paused because its practice wasn’t read now syncs automatically.', 'If a job ever can’t be read after retries, you get an email instead of finding it days later.'],
  },
  {
    date: '2026-06-28', category: 'reporting', title: 'Clearer daily report',
    summary: 'Issue counts now read per-job instead of per-event, blocked jobs are clearly flagged, and one-click debug buttons were added.',
    details: 'The daily report now counts issues per job (so one job retried nine times reads as “1,” not “9”), flags any blocked job distinctly, and adds Kimedics + Salesforce buttons on each row for quick checking.',
    examples: ['A single job that retried 9 times now shows as 1 blocked job, not 9 failures.'],
  },
  {
    date: '2026-06-29', category: 'reliability', title: 'No more silent sync gaps',
    summary: 'A job that maps to Salesforce but hits a momentary error while writing its details is now retried automatically instead of silently appearing “done”.',
    details: 'Previously, a brief Salesforce hiccup while writing a job’s details could leave that job linked but with its values unwritten — while still showing as a success. The system now records the error and the recovery engine re-writes the values on its own, so no job is left half-synced without anyone knowing.',
    examples: ['A job whose details failed to write during a momentary Salesforce error is now auto-corrected within minutes, instead of being caught by hand days later.'],
  },
  {
    date: '2026-06-30', category: 'reliability', title: 'A failed job can never look successful',
    summary: 'If a job’s details don’t fully reach Salesforce, it’s now marked as failed everywhere and re-saved automatically — it can no longer show as a success.',
    details: 'We rebuilt the safeguards end to end: a job only counts as a success once its details have actually been written to Salesforce. If anything interrupts that, the job is flagged as failed in both the dashboard and the daily report, and a background check re-saves it within minutes — so an incomplete job can never quietly appear “done” again, no matter what causes the interruption.',
    examples: ['A job that links to Salesforce but whose details didn’t write now shows “not synced / failed” instead of “success,” and is corrected automatically on the next cycle.'],
  },
  {
    date: '2026-07-03', category: 'reliability', title: 'No more skipped updates during busy spells',
    summary: 'When several job updates arrive close together, they’re now processed in safe-sized batches so none get dropped, and any that were missed are picked up automatically on the next cycle.',
    details: 'When a burst of job updates landed at once, reading them all in a single pass could run long enough to be cut off — and if that happened, the whole batch was discarded, so those updates never reached Salesforce and quietly showed as “no jobs.” We now process updates in safe-sized batches that always finish in time, and a background sweep re-checks and re-reads anything left over on every cycle until it’s in Salesforce. Nothing is left behind.',
    examples: ['A “status: Closed” update that had been logged but never applied — leaving the job showing “active” — is now read and corrected automatically.', 'A day where a cluster of updates arrived together and several never synced now drains completely within a few cycles instead of stalling.'],
  },
  {
    date: '2026-07-03', category: 'reliability', title: 'An independent safety net now watches the pipeline',
    summary: 'A separate watchdog now checks the whole pipeline every 30 minutes and emails the team if anything is stuck — and this dashboard now shows “Catching Up” or “Backlog Stuck” instead of “Operational” whenever work hasn’t fully reached Salesforce.',
    details: 'Previously, if the automation itself was interrupted, the part responsible for raising the alarm could be interrupted with it — so problems could sit quietly until someone noticed by hand. A new watchdog runs completely separately from the automation: it verifies the automation is alive, that every received update got read, and that every job’s details actually landed in Salesforce. If anything sits stuck past its normal self-recovery window, the team gets an email within the hour. Each job is also now saved the moment it’s read, so an interruption can no longer throw away work already done.',
    examples: ['If the automation stopped running entirely, the team is emailed within about 30 minutes — instead of finding out from a client.', 'During the July 2 busy spell, the dashboard showed “Operational” while 19 updates sat unsynced; the same situation now shows “Backlog Stuck” on this page and triggers a watchdog email.'],
  },
  {
    date: '2026-07-04', category: 'reporting', title: 'Dashboard loads in a moment',
    summary: 'Opening this dashboard used to take up to 17 seconds on a first visit — it now loads in about a second, with all live data still fresh.',
    details: 'The page was gathering its numbers one group at a time and re-asking slow billing services on every visit. It now gathers everything at once, the activity queries were tuned to answer in a fraction of a second, and the slow-moving cost figures are remembered for up to an hour (they only change daily at the source). Everything operational — runs, statuses, backlogs — is still queried live on every load.',
    examples: ['A first visit that used to show a blank screen for ~17 seconds now paints in about a second.'],
  },
  {
    date: '2026-07-10', category: 'reporting', title: 'Uptime and success now tell the truth',
    summary: 'The uptime and success figures now score what actually happened to each job update — days with lost or delayed updates show red or amber, and hovering or clicking a day bar shows exactly why.',
    details: 'These numbers used to grade the automation on whether its runs finished — but the worst failures leave no finished runs to grade, so incident days scored as 100%. The dashboard now scores each received update directly: was it processed, and was it on time? Days where updates were lost show red, days where updates ran late show amber, and the percentages are computed from that same record — past days included. Hovering a day bar now lists the reasons in plain English, and clicking it pins the details with the specific jobs (or failed runs) affected, linked for one-click review.',
    examples: ['July 2 and July 6 — when updates sat delayed for hours — used to show as 100% uptime days; they now correctly show red, and clicking either bar lists the exact jobs that were delayed.', 'Success now means “updates handled right the first time,” so a stretch with delays reads 85%, not 100%.'],
  },
  {
    date: '2026-07-08', category: 'accuracy', title: 'Cleaner dates when the post has a typo',
    summary: 'When a job post leaves a dangling dash after a start date (“July 15-” with no end date), the captured dates now drop the stray dash instead of carrying the typo into Salesforce.',
    details: 'Posters sometimes write an open-ended need like “July 15- open to roster” — a dash with no end date after it. The automation was faithfully copying that stray dash into the captured dates, so Salesforce and the review emails showed “July 15-”. The dash is now recognized as a typo and removed on every capture path; real date ranges like “May 18-22” are untouched.',
    examples: ['Job #19705’s “July 15- open to roster” now captures as “July 15” instead of “July 15-”.'],
  },
  {
    date: '2026-07-07', category: 'reliability', title: 'Mailbox check made 30× faster',
    summary: 'The step that reads new Kimedics emails had slowed down as months of mail accumulated — enough to stall runs. It now reads only the recent window and finishes in seconds.',
    details: 'Every cycle starts by checking the inbox for new job updates. That check was quietly re-reading every Kimedics email ever received — over 1,800 by now — just to find the newest handful, and this weekend it got slow enough to stall runs and delay updates by a few hours. The watchdog we added last week caught it and emailed the team within the hour. The check now asks the mailbox for only the recent window (10 minutes → about 20 seconds), and it stays fast no matter how much mail accumulates. The delayed updates were all recovered and synced.',
    examples: ['The watchdog alert listed 20 waiting updates at 2 AM; by the morning all 20 were recovered and in Salesforce.', 'This fix is permanent: the check reads days of mail, not the whole mailbox, so it can never slow down with age again.'],
  },
  {
    date: '2026-07-11', category: 'reliability', title: 'Rides through busy-inbox moments',
    summary: 'When the shared inbox is briefly maxed out by another program reading it, the automation now waits and retries instead of skipping that check.',
    details: 'The inbox the automation reads is shared with other tools, and the mail provider only allows so many readers at once. Once a day another program was briefly using up all the reading slots, and a check that landed in that moment would fail and try again 10 minutes later. No job data was ever missed — each check re-reads a full day of mail — but the automation now also waits out the busy moment and retries within seconds, so checks succeed even while the inbox is crowded.',
    examples: ['A check that lands during the daily busy window now pauses ~30 seconds and completes, instead of skipping to the next 10-minute cycle.'],
  },
]

const DJC: ChangeEntry[] = [
  {
    date: '2026-06-30', category: 'accuracy', title: 'Catch more phone numbers + true activity date',
    summary: 'We now capture phone numbers on profiles that list them differently, and record each candidate’s real "last active on DJC" date.',
    details: 'Some profiles label the phone number in a different spot than others, and we were only reading one of them — so a few reachable candidates looked like they had no phone. We now read both. We also pull each candidate’s real last-active date straight from their profile, so that date is always accurate in Salesforce.',
    examples: ['A general dentist whose number was listed under a different label now comes through with her phone.', 'Salesforce now shows when a candidate was genuinely last active on DJC, not an approximation.'],
  },
  {
    date: '2026-06-30', category: 'reliability', title: 'Steadier automatic sign-in',
    summary: 'Fixed a sign-in timeout that briefly stopped the automation when the login security code was slow to arrive.',
    details: 'Each run signs in with a one-time security code texted to us. That text started arriving a bit slower than our wait allowed, so sign-in timed out and a few runs were skipped. We widened the wait, and now keep a signed-in session between runs so we only need a fresh code about once a day instead of every run.',
    examples: ['Morning runs that had been failing to sign in now complete normally.'],
  },
  {
    date: '2026-07-01', category: 'reliability', title: 'Sign-in now heals itself',
    summary: 'If a login code never arrives or a saved session expires mid-run, the automation now recovers on its own — no more failed runs waiting on a human.',
    details: 'Two remaining sign-in gaps are closed: when the texted security code is slow or lost, the automation now requests a fresh one and tries again instead of giving up; and when its saved session turns out to be expired at the start of a run, it signs itself back in and continues instead of stopping. Sign-in problems now fix themselves in the background.',
    examples: ['A run that found its saved session expired used to stop and wait for someone to notice — it now signs back in and finishes normally.', 'A lost login text no longer kills the run; a fresh code is requested automatically.'],
  },
  {
    date: '2026-07-04', category: 'reporting', title: 'Dashboard loads in a moment',
    summary: 'Opening this dashboard used to take up to 17 seconds on a first visit — it now loads in about a second, with all live data still fresh.',
    details: 'The page was gathering its numbers one group at a time and re-asking slow billing services on every visit. It now gathers everything at once, the activity queries were tuned to answer in a fraction of a second, and the slow-moving cost figures are remembered for up to an hour (they only change daily at the source). Everything operational — runs, statuses, backlogs — is still queried live on every load.',
    examples: ['A first visit that used to show a blank screen for ~17 seconds now paints in about a second.'],
  },
  {
    date: '2026-07-04', category: 'accuracy', title: 'AI spend now counts only this automation',
    summary: 'The billed AI spend on this page was accidentally including an unrelated project that shares the same account — it now counts only this automation’s own usage.',
    details: 'The billing account behind this automation is also used by other, unrelated work. The “billed” figure was reading the account-wide total, so someone else’s usage showed up here as this automation’s cost. The page now attributes spend to this automation’s own access key only, so the billed figure — and the monthly/yearly projections built on it — reflect just this pipeline.',
    examples: ['The AI Cost tab showed $54.82 for the last 30 days when this automation’s real usage was about $2.47 — the rest belonged to an unrelated internal project.'],
  },
  {
    date: '2026-07-10', category: 'reporting', title: 'Profile Views budget on the sourcing report',
    summary: 'The daily sourcing email now shows how many Dentist Job Cafe profile views have been used and how many remain.',
    details: 'Dentist Job Cafe limits how many candidate profiles the account can open each quarter. The daily report now surfaces that budget right in the KPIs — views used and views left — so the remaining sourcing capacity is visible at a glance next to the day’s candidate numbers.',
    examples: ['A run now shows “800 views used · 50 views left” alongside the candidates it sourced that day.'],
  },
  {
    date: '2026-06-05', category: 'new', title: 'DJC automation built',
    summary: 'Built the Dentist Job Cafe → Salesforce automation end to end: automated login, candidate scraping, AI resume reading, and Salesforce contact creation.',
    details: 'The full DJC pipeline was built: it logs in automatically (including one-time codes), scrapes candidate profiles, reads resumes with AI to recover contact details, and creates Salesforce contacts.',
    examples: ['A candidate with no phone on their DJC profile gets it recovered from their resume and added to Salesforce.'],
  },
  {
    date: '2026-06-06', category: 'new', title: 'Scheduled in the cloud',
    summary: 'Deployed to run automatically on a schedule, starting in a safe dry-run mode.',
    details: 'The automation was deployed to the cloud to run on a set schedule, beginning in dry-run mode (no live writes) so results could be validated before going live.',
    examples: ['Scheduled runs produced full results for review without touching Salesforce until approved.'],
  },
  {
    date: '2026-06-07', category: 'reliability', title: 'Skip already-synced candidates',
    summary: 'Candidates already in Salesforce are skipped to save time and cost.',
    details: 'Before processing a candidate, the system checks whether they’re already in Salesforce and skips them — saving time and AI cost on duplicates.',
    examples: ['A candidate synced last week isn’t re-processed, so runs stay fast and inexpensive.'],
  },
  {
    date: '2026-06-08', category: 'reporting', title: 'Client report + accurate contacts',
    summary: 'Added a post-run client report and improved resume reading for accurate phone and email.',
    details: 'Each run now sends a client report summarizing what was processed. Resume reading was improved to extract phone and email more accurately by reading PDFs natively rather than guessing.',
    examples: ['After each run you receive a summary of candidates added and contact details recovered.'],
  },
  {
    date: '2026-06-15', category: 'accuracy', title: 'Better contact recovery & candidate selection',
    summary: 'Recover contact details from more resume formats, and pick candidates from our own records instead of DJC’s shared “viewed” flag.',
    details: 'Contact recovery was extended to older, trickier resume formats (Word docs, text boxes, headers). Candidate selection now uses our own database rather than DJC’s shared “viewed” flag, which others on the shared login could trip.',
    examples: ['A phone number hidden in a Word doc’s header is now recovered.', 'Candidates aren’t skipped just because someone else viewed them on the shared login.'],
  },
  {
    date: '2026-06-16', category: 'new', title: 'Live in production',
    summary: 'Went live creating real Salesforce contacts — with proper-cased names, correct mailing addresses, a Salesforce link per candidate, and job-match tracking.',
    details: 'DJC went live writing real Salesforce contacts. Names are proper-cased, mailing addresses are usable for mapping, each candidate has a Salesforce link in the report, and job matches are tracked as a quality check.',
    examples: ['A candidate “JOHN SMITH” is saved as “John Smith” with a full address and a clickable Salesforce link.'],
  },
  {
    date: '2026-06-17', category: 'reporting', title: 'All-time report + footprint map',
    summary: 'Added an all-time impact report and a US footprint map, and fixed text-encoding glitches.',
    details: 'An all-time impact report was added alongside a US map showing candidate footprint by state. We also fixed garbled characters that appeared in some emails.',
    examples: ['The report shows where candidates are concentrated across the country at a glance.'],
  },
  {
    date: '2026-06-18', category: 'accuracy', title: 'Recruiter-feedback fixes',
    summary: 'Fixed duplicates, removed “Dr./Mr./Ms.” titles from names, and improved handling of relay emails — per recruiter feedback.',
    details: 'Acting on recruiter feedback, we removed honorific titles that polluted name fields, tightened duplicate detection, and improved how relay/forwarding emails are handled. A one-time cleanup fixed existing records too.',
    examples: ['A contact saved as “Dr. Jane Doe” is corrected to “Jane Doe.”'],
  },
  {
    date: '2026-06-23', category: 'reporting', title: 'Cleaner visuals + more frequent runs',
    summary: 'Simpler “Resumes” labeling and softer map colors, plus a midday run added (now four times a day).',
    details: 'Report visuals were softened (muted map colors, plain “Resumes” label) for readability, and a midday run was added so candidates are picked up more often.',
    examples: ['Runs now happen four times a day, so new candidates reach Salesforce sooner.'],
  },
  {
    date: '2026-06-26', category: 'accuracy', title: 'Reach more candidates',
    summary: 'Fixed candidates being wrongly skipped, recover full first names from resumes, and retry everyone we couldn’t previously contact.',
    details: 'A timing issue caused some contactable candidates to be skipped; that’s fixed. We also recover full first names from resumes when DJC only shows initials, and re-process everyone we previously couldn’t contact.',
    examples: ['A candidate shown as “J. Smith” on DJC gets their full first name “John” from the resume.'],
  },
  {
    date: '2026-06-27', category: 'reporting', title: 'Name backfill + quieter emails',
    summary: 'Backfilled full names for existing contacts and consolidated to a single per-run email to cut inbox noise.',
    details: 'A one-time backfill corrected initials-only names for existing Salesforce contacts. We also combined multiple per-run emails into one to reduce inbox clutter.',
    examples: ['Existing contacts saved as “J. Smith” were updated to full names; you now get one tidy email per run.'],
  },
  {
    date: '2026-06-28', category: 'reliability', title: 'Weekday daytime schedule',
    summary: 'Runs are now limited to weekday daytime hours (Mon–Fri, 9 AM–8 PM ET).',
    details: 'Run cadence was tuned to weekday daytime hours only, matching when new candidates actually appear — reducing unnecessary overnight and weekend runs (and their cost).',
    examples: ['No more empty 3 AM weekend runs; the automation focuses on business hours when candidates post.'],
  },
]

export const CHANGELOG: Record<Automation, ChangeEntry[]> = {
  kimedics: KIMEDICS,
  djc: DJC,
}
