# Port Brief: Practice Story Engine -> automation-hub "Marketing" tab

## Context
Standalone app at /root/projects/internal/marketing_content is a working, tested Next.js
(App Router)/TypeScript app implementing the Practice Story Engine MVP (see its BUILD_BRIEF.md
and README.md for full spec — read both before starting). It uses Drizzle ORM against a Supabase
Postgres and has 7 pages: Briefing (/), Trend Radar, Story Workspace, Content Library, Voice and
Learning, Sources, Settings, plus lib/ modules for adapters, scoring, story generation, content
generation, feedback/preferences, embeddings/duplicate-detection, and a seed script with clearly
labeled demo data.

Target repo: /root/projects/proxi/automation-hub — a LIVE PRODUCTION Next.js app (Proxi status
dashboard, Mohamed billing automation, Outreach engine) deployed on Vercel. It does NOT use
Drizzle — it uses raw `postgres` (postgres.js) via lib/db.ts, with hand-written SQL query functions
per feature (see lib/queries.ts, lib/outreachQueries.ts, lib/mohamedQueries.ts as patterns) and a
tab-based nav (components/HubNav.tsx, type HubTab = 'proxi'|'mohamed'|'outreach') plus each
feature living under its own app/<name>/ route.

## Task
Port the Practice Story Engine's functionality into automation-hub as a new "Marketing" tab,
matching automation-hub's existing conventions (raw postgres.js, no Drizzle; route under
app/marketing/; add 'marketing' to HubTab type and HubNav.TABS; follow the visual style of
app/outreach/page.tsx and existing components).

## Explicit decisions already made (do not re-ask)
1. **Database**: reuse automation-hub's existing DATABASE_URL (same Supabase Postgres project as
   the rest of the hub) — do NOT create a new Supabase project. Prefix all new tables with
   `marketing_` (e.g. marketing_sources, marketing_source_items, marketing_trend_clusters,
   marketing_trend_scores, marketing_story_opportunities, marketing_story_angles,
   marketing_content_drafts, marketing_feedback_events, marketing_learned_preferences,
   marketing_published_content, marketing_performance_metrics, marketing_research_runs,
   marketing_organizations, marketing_users) to avoid any collision with existing hub tables.
2. **No Drizzle** in automation-hub. Rewrite the schema as raw SQL migration file(s) (follow
   whatever migration convention the hub already uses — check for a migrations/ or supabase/
   directory in automation-hub first; if none exists, add a single idempotent SQL file
   sql/marketing_schema.sql with CREATE TABLE IF NOT EXISTS statements, and document how to run it
   against DATABASE_URL) and hand-written query functions in lib/marketingQueries.ts (or split into
   lib/marketing/*.ts if that reads cleaner), following the style of lib/outreachQueries.ts.
3. **Reuse the standalone app's pure logic modules directly where possible** (scoring formula,
   story generation templates, content generation templates, duplicate-detection cosine-similarity
   math, preference-threshold logic) rather than reinventing them — port the TypeScript logic,
   adapting only the DB access layer from Drizzle calls to postgres.js tagged-template queries.
4. **Auth**: automation-hub already gates admin-only actions behind ADMIN_COOKIE_NAME /
   verifyAdminCookieValue (see lib/adminAuth.ts, app/outreach/page.tsx for the pattern). Apply the
   same pattern: viewing the Marketing tab can be open like Outreach's read-only view, but any
   mutating action (submitting feedback, generating content, manual URL ingestion, editing/
   removing/resetting learned preferences) must require the same isAdmin check used elsewhere in
   the hub.
5. **Nav**: add 'marketing' to HubTab in components/HubNav.tsx, add a { key: 'marketing', href:
   '/marketing', label: 'Marketing' } entry, alongside proxi/mohamed/outreach.
6. **Demo data labeling**: preserve the is_demo_data convention and the amber "Demo data" badge UI
   pattern from the standalone app — carry it over into the ported components.
7. **LLM/embeddings**: same swappable-abstraction pattern (lib/marketingLlm.ts /
   lib/marketingEmbeddings.ts or similar), deterministic template fallback with no key required,
   matching the standalone app's lib/llm.ts and lib/embeddings.ts.
8. **Compliance banner + no-auto-publish**: preserve exactly — visible warning banner on unsourced
   claims, no publish action anywhere yet.
9. **Do not touch or break** any existing hub functionality (Proxi/Mohamed/Outreach pages, existing
   tables, existing lib files) — this is additive only. Read CLAUDE.md and AGENTS.md in
   automation-hub first for house conventions before writing code.
10. Formats: only LinkedIn post and video-script generation wired to UI (same MVP scope as before).

## CPU/load discipline (CRITICAL — this VPS is shared with production services)
- Run ANY build/test/tsc/lint command through `load-gate run <label> -- <command>`, e.g.:
  `load-gate run marketing-tsc -- npx tsc --noEmit`
  `load-gate run marketing-test -- npm test`
  Do NOT run `npm run build` speculatively/repeatedly — run it once near the end via load-gate.
- Do not spawn subagents or parallel heavy processes.
- Do not leave a `next dev` server running when done — kill it.

## Deliverable
1. New `sql/marketing_schema.sql` (or hub's existing migration convention) creating all
   marketing_* tables, applied against the hub's real DATABASE_URL (ask for confirmation before
   running DDL against it if unsure, but this is a shared dev/prod Supabase project already used
   by other hub features — CREATE TABLE IF NOT EXISTS is safe/additive).
2. `lib/marketing*.ts` query/logic modules (raw postgres.js, ported logic from the standalone app).
3. `app/marketing/page.tsx` (+ subpages/routes matching the standalone app's 7 pages: briefing at
   /marketing, trend radar at /marketing/trend-radar, story workspace, content library, voice and
   learning, sources, settings — or condensed into tabs within one page if that fits the hub's
   existing UI density better; use judgement, but all 7 areas of functionality must be reachable).
4. HubNav updated with the Marketing tab.
5. A seed script (or npm script) that inserts the same clearly-labeled demo data into the
   marketing_* tables so the tab isn't empty on first load.
6. Verify: run `load-gate run marketing-tsc -- npx tsc --noEmit`, run the seed script against the
   real DATABASE_URL, start `next dev` (background), curl /marketing and its subpages for 200s and
   real rendered demo data (same verification method as before), then kill the dev server.
7. Commit incrementally with clear messages. At the end, summarize exactly what was ported, what
   diverged from the standalone app and why, and what still needs a real LLM/embeddings key or
   Vercel env var to go fully live (document required env vars, e.g. none new beyond existing
   DATABASE_URL since we're reusing it).

Do not stop at a partial port — the Marketing tab must be reachable in the hub's nav and render
real data end to end, same bar as the standalone app.
