@AGENTS.md

# automation-hub

## Deployment account
- This is a Proxi CLIENT project. Vercel deploys use **proxi@scrubnetwork.com** (client account), NEVER the personal account (anddy0622@gmail.com).
- Run `vercel whoami` before any deploy.

## What this is
Client-facing status dashboard for the Proxi automations (Kimedics → SF, DJC → SF, Candidate Bank). Read-only over the automations' Supabase Postgres databases — the automation repos write the data; this app only displays it.

## Commands
- `npm run dev` — local dev
- `npm run build` — production build (run before deploying)
- Deploy: `vercel --prod` (after the `vercel whoami` check above)
- No test or lint scripts exist. Ad-hoc debug scripts in `scripts/` run with `npx tsx scripts/<file>.ts`.

## Architecture
- `app/page.tsx` — main dashboard; server component, fetches all data
- `app/api/cron/` — Vercel crons (see `vercel.json`): slack-alerts every 10 min, sync-notion-costs daily; auth via `CRON_SECRET`
- `app/admin/` + `middleware.ts` — admin pages gated by signed cookie (`lib/adminAuth.ts`)
- `components/AutomationView.tsx` — splits each automation tab into [Operations] [AI Cost] [Updates]
- `lib/changelog.ts` — static client-facing changelog entries shown in the Updates tab
- `lib/notionTickets.ts` — Updates tab also pulls the Notion "Proxi Tickets" board live (Ticket Type=Customer AND Status=Done); those entries need no deploy
- `lib/db.ts`, `lib/djcDb.ts`, `lib/candidateBankDb.ts` — three SEPARATE Supabase projects (`DATABASE_URL`, `DJC_DATABASE_URL`, `CANDIDATE_BANK_DATABASE_URL`)
- `lib/queries.ts` / `lib/djcQueries.ts` — all SQL lives here, not in components

## Conventions
- The Updates tab is read by the client: keep changelog entries outcome-focused, plain English, zero internal jargon. Follow the `proxi-automation-changelog` skill after shipping automation changes.
- Add changelog entries by appending to `lib/changelog.ts` (any order — sorted by date), or preferably by filing a Notion ticket (`proxi-notion-tickets` skill) so no deploy is needed.
- Use Supabase transaction-pooler connection strings; `lib/db.ts` is tuned for that (low `max`, short `connect_timeout`). Don't loosen those settings.

## Gotchas
- Never re-run `cp .env.local.example .env.local` — it overwrites real DB URLs.
- Unset `DJC_DATABASE_URL` hides the DJC card entirely (same pattern for Candidate Bank). "Missing data" may just be a missing env var.
- Slack channel is stored by ID (`SLACK_ALERT_CHANNEL_ID`), not name — keep it that way.
- Next.js 16: consult `node_modules/next/dist/docs/` before writing framework code (per AGENTS.md).
