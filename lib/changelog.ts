/**
 * Client-facing change log, per automation.
 *
 * These are plain-English milestones distilled from the engineering history of each
 * automation's repo — grouped by theme so the story is absorbable, not a raw commit
 * dump. Keep entries short, outcome-focused, and free of internal jargon: this is
 * what a client reads to understand how the automation has improved over time.
 *
 * To add an entry: append to the relevant list (any order — the panel sorts by date).
 */

export type Automation = 'kimedics' | 'djc'
export type ChangeCategory = 'new' | 'reliability' | 'accuracy' | 'reporting'

export interface ChangeEntry {
  date: string // ISO yyyy-mm-dd
  category: ChangeCategory
  title: string
  summary: string
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
  { date: '2026-04-09', category: 'new', title: 'Live in production',
    summary: 'The Kimedics → Salesforce automation went live, automatically syncing every job posting into Salesforce.' },
  { date: '2026-04-15', category: 'accuracy', title: 'Cleaner Salesforce records',
    summary: 'Fixed duplicated address text and tightened how each job’s details are written to Salesforce.' },
  { date: '2026-04-23', category: 'reliability', title: 'Self-healing Salesforce sync',
    summary: 'Added an engine that automatically retries and repairs failed Salesforce updates, so nothing is silently dropped.' },
  { date: '2026-05-01', category: 'reliability', title: 'One-click re-sync for stuck jobs',
    summary: 'Added a manual re-scrape tool and made the scraper sturdier against page hiccups.' },
  { date: '2026-05-06', category: 'reliability', title: 'Automatic retries for missed jobs',
    summary: 'Jobs that don’t capture on the first try are now automatically re-attempted in the background.' },
  { date: '2026-05-14', category: 'reporting', title: 'Redesigned daily report',
    summary: 'Rebuilt the daily report to show one row per email with full pipeline status, a Salesforce link per job, and a complete midnight-to-midnight view.' },
  { date: '2026-05-15', category: 'new', title: 'AI-polished job descriptions',
    summary: 'Job descriptions are now cleaned up by AI before syncing, so Salesforce gets client-ready copy.' },
  { date: '2026-05-20', category: 'accuracy', title: 'Duplicate prevention',
    summary: 'A job missing its practice ID is now held back instead of risking a duplicate Salesforce record.' },
  { date: '2026-05-22', category: 'new', title: 'Hands-free job matching',
    summary: 'Rebuilt the logic that attaches each job to the right clinic in Salesforce — fully automatic, no manual steps, with duplicate-location prevention.' },
  { date: '2026-06-03', category: 'reliability', title: 'Duplicate self-repair',
    summary: 'The system now detects and fixes duplicate Salesforce job records on its own.' },
  { date: '2026-06-12', category: 'reporting', title: 'New weekly summary',
    summary: 'Launched a client-facing weekly report focused on hiring outcomes and how fast jobs get filled.' },
  { date: '2026-06-16', category: 'new', title: 'Monthly & all-time reports + AI date reading',
    summary: 'Added monthly and all-time impact reports, and introduced AI to accurately read each job’s coverage dates — including newly added or cancelled dates.' },
  { date: '2026-06-16', category: 'reliability', title: 'Date-confidence alerts',
    summary: 'The team is alerted whenever the AI isn’t fully certain about a job’s dates, so a human can verify before it’s relied on.' },
  { date: '2026-06-18', category: 'accuracy', title: 'Safety net for messy posts',
    summary: 'Added an AI safety net that recovers details from posts with typos or formatting errors, plus an alert if a job’s coverage dates are ever missing.' },
  { date: '2026-06-23', category: 'accuracy', title: 'Smarter date rules',
    summary: 'Tentative (“pending confirmation”) dates are now excluded from active needs, and date alerts show the exact text the AI read for easy review.' },
  { date: '2026-06-24', category: 'reporting', title: 'Reports to stakeholders + polish',
    summary: 'Weekly and monthly reports now reach Proxi stakeholders, plus a fix for a chart that vanished in dark-mode email.' },
  { date: '2026-06-28', category: 'reliability', title: 'Bulletproofed practice capture',
    summary: 'Fixed and hardened how a job’s practice location is captured (even for unlinked practices), with automatic re-scrape and an alert if a job ever gets stuck.' },
  { date: '2026-06-28', category: 'reporting', title: 'Clearer daily report',
    summary: 'Issue counts now read per-job instead of per-event, blocked jobs are clearly flagged, and one-click debug buttons were added.' },
]

const DJC: ChangeEntry[] = [
  { date: '2026-06-05', category: 'new', title: 'DJC automation built',
    summary: 'Built the Dentist Job Cafe → Salesforce automation end to end: automated login, candidate scraping, AI resume reading, and Salesforce contact creation.' },
  { date: '2026-06-06', category: 'new', title: 'Scheduled in the cloud',
    summary: 'Deployed to run automatically on a schedule, starting in a safe dry-run mode.' },
  { date: '2026-06-07', category: 'reliability', title: 'Skip already-synced candidates',
    summary: 'Candidates already in Salesforce are skipped to save time and cost.' },
  { date: '2026-06-08', category: 'reporting', title: 'Client report + accurate contacts',
    summary: 'Added a post-run client report and improved resume reading for accurate phone and email.' },
  { date: '2026-06-15', category: 'accuracy', title: 'Better contact recovery & candidate selection',
    summary: 'Recover contact details from more resume formats, and pick candidates from our own records instead of DJC’s shared “viewed” flag.' },
  { date: '2026-06-16', category: 'new', title: 'Live in production',
    summary: 'Went live creating real Salesforce contacts — with proper-cased names, correct mailing addresses, a Salesforce link per candidate, and job-match tracking.' },
  { date: '2026-06-17', category: 'reporting', title: 'All-time report + footprint map',
    summary: 'Added an all-time impact report and a US footprint map, and fixed text-encoding glitches.' },
  { date: '2026-06-18', category: 'accuracy', title: 'Recruiter-feedback fixes',
    summary: 'Fixed duplicates, removed “Dr./Mr./Ms.” titles from names, and improved handling of relay emails — per recruiter feedback.' },
  { date: '2026-06-23', category: 'reporting', title: 'Cleaner visuals + more frequent runs',
    summary: 'Simpler “Resumes” labeling and softer map colors, plus a midday run added (now four times a day).' },
  { date: '2026-06-26', category: 'accuracy', title: 'Reach more candidates',
    summary: 'Fixed candidates being wrongly skipped, recover full first names from resumes, and retry everyone we couldn’t previously contact.' },
  { date: '2026-06-27', category: 'reporting', title: 'Name backfill + quieter emails',
    summary: 'Backfilled full names for existing contacts and consolidated to a single per-run email to cut inbox noise.' },
  { date: '2026-06-28', category: 'reliability', title: 'Weekday daytime schedule',
    summary: 'Runs are now limited to weekday daytime hours (Mon–Fri, 9 AM–8 PM ET).' },
]

export const CHANGELOG: Record<Automation, ChangeEntry[]> = {
  kimedics: KIMEDICS,
  djc: DJC,
}
