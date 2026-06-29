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
]

const DJC: ChangeEntry[] = [
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
