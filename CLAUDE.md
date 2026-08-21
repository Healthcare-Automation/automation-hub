@AGENTS.md

# automation-hub

## Deployment account
- This is a Proxi CLIENT project. Vercel deploys use **andy@uzu.studio** (Uzu Studio, scope `uzu-studio`; migrated off proxi@scrubnetwork.com), NEVER the personal account (anddy0622@gmail.com).
- Run `vercel whoami` before any deploy.

## What this is
Client-facing status dashboard for the Proxi automations (Kimedics → SF, DJC → SF, Candidate Bank). Read-only over the automations' Supabase Postgres databases — the automation repos write the data; this app only displays it.

## Commands
- `npm run dev` — local dev
- `npm test` — Node test suite (includes tenant-isolation and Mohamed dry-run rules)
- `npm run typecheck` — TypeScript verification
- `npm run build` — production build (run before deploying)
- Deploy: `vercel --prod` (after the `vercel whoami` check above)
- Ad-hoc debug scripts in `scripts/` run with `npx tsx scripts/<file>.ts`.

## Architecture
- `app/page.tsx` — main dashboard; server component, fetches all data
- `app/api/cron/` — Vercel crons (see `vercel.json`): slack-alerts every 10 min, sync-notion-costs daily; auth via `CRON_SECRET`
- `app/admin/` + `middleware.ts` — admin pages gated by signed cookie (`lib/adminAuth.ts`)
- `components/AutomationView.tsx` — splits each automation tab into [Operations] [AI Cost] (+ [Insights] where provided). The client-facing Updates/changelog tab was removed 2026-07-22 (nobody read it).
- `lib/db.ts`, `lib/djcDb.ts`, `lib/candidateBankDb.ts` — three SEPARATE Supabase projects (`DATABASE_URL`, `DJC_DATABASE_URL`, `CANDIDATE_BANK_DATABASE_URL`)
- `lib/queries.ts` / `lib/djcQueries.ts` — all SQL lives here, not in components

## Conventions
- Use Supabase transaction-pooler connection strings; `lib/db.ts` is tuned for that (low `max`, short `connect_timeout`). Don't loosen those settings.

## Gotchas
- Never re-run `cp .env.local.example .env.local` — it overwrites real DB URLs.
- Unset `DJC_DATABASE_URL` hides the DJC card entirely (same pattern for Candidate Bank). "Missing data" may just be a missing env var.
- Slack channel is stored by ID (`SLACK_ALERT_CHANNEL_ID`), not name — keep it that way.
- Next.js 16: consult `node_modules/next/dist/docs/` before writing framework code (per AGENTS.md).

## Client board (required)
This is a client-facing project. After any meaningful change — a deploy, a fix, a behaviour or cost
change, a blocker hit or cleared — update the Notion To Dos board via the `hub-progress-tracker` skill.
One sentence, under 200 characters, in the client's words. Update existing rows only.
