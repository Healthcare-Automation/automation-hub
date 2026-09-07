# Instagram Content Queue — Build Brief

## Context (read first, do not re-derive)

This repo already has a full "Practice Story Engine" Marketing tab (`app/marketing/*`,
`lib/marketing*.ts`, `sql/marketing_schema.sql`, `modal/marketing_research.py`). That system
was over-engineered for what the founder (Andy) actually needs. Per his explicit direction,
we are NOT throwing it away — we're repurposing its existing tables/pipeline into a much
simpler, concrete deliverable: a scalable Instagram content queue for UZU Studio's own
marketing (NOT client-facing; this is UZU's brand account), producing ~3 ready-to-post
Instagram post drafts per week, backed by real cited research, with a review/approval UI.

Real research was already done manually and is checked into
`/root/projects/internal/marketing_content/content-research/research-findings.md` (a
separate repo — read it, it has real cited stats you should treat as a seed dataset / example
of the quality bar, e.g. Harvard Business School Yelp rating study, WordStream ad-cost
benchmarks, Whitespark local-ranking survey). The new pipeline should follow the same
standard going forward: EVERY factual claim in a generated post must trace back to a real
web search result with a URL. Never fabricate quotes, stats, or numbers. If evidence for
an angle is thin, either skip it or explicitly flag it as speculative in the `notes` field —
do not present it as fact.

## Explicit decisions already made — do not re-ask

1. **Platform: Instagram only** (captions + hashtags + a square/portrait branded image per post).
2. **Storage: automation-hub's existing Supabase Postgres** (`DATABASE_URL`), NOT the separate
   `/root/projects/internal/marketing_content` repo's local Supabase. Extend the existing
   `marketing_content_drafts` / `marketing_feedback_events` tables (additive migration only,
   follow the `sql/marketing_schema.sql` idempotent-DDL convention:
   `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
3. **Cadence: 3x/week, fully autonomous cron** (no approval gate before insertion — Andy
   reviews/approves in the UI after the fact). Suggested schedule: Mon/Wed/Fri.
4. **Images: AI-generated branded stat/quote graphic cards**, not real/stock photography
   (avoids healthcare-content compliance issues with real patient/practice photos, and
   matches what actually performs for this content type on Instagram). No existing UZU brand
   kit was found in this repo — use a clean, professional, high-contrast dark/navy +
   single-accent-color aesthetic (your call on the exact palette; make it look "elite," not
   templated/cheap — reference modern SaaS/consulting Instagram infographic aesthetics, think
   Stripe/Linear-adjacent minimalism, NOT stock-photo-with-text-overlay). Use whatever image
   generation tool/API is already available in this environment (check for an existing
   `image_generate` capability/skill before assuming you need a new API key — if none exists
   and no key is configured, implement the pipeline with an `image_prompt` field stored per
   draft and leave image generation as a manual/follow-up step, documented clearly in your
   summary — do NOT block the whole feature on this, and do NOT fabricate an integration).
5. **Research method: web search only**, no new paid API/key. Use whatever web-search
   capability is already wired into this repo's LLM/research pipeline
   (`lib/marketingResearch.ts`, `lib/marketing/relevance.ts`, OPENAI_API_KEY is already in
   `.env.local` / the Modal secret `marketing-research`) — if the OpenAI Responses API
   web-search tool is usable with the existing key, use that; otherwise document what's
   missing rather than inventing a search backend.

## What to build

### 1. Schema (additive migration in `sql/marketing_schema.sql`, apply via
   `scripts/apply-marketing-schema.ts` against `DATABASE_URL`)

On `marketing_content_drafts`, add:
- `platform TEXT NOT NULL DEFAULT 'instagram'`
- `caption TEXT` — the actual IG caption (separate from `draft_text` if that's used for
  something else already; check existing usage before deciding to reuse or add new).
- `hashtags JSONB NOT NULL DEFAULT '[]'`
- `sentiment_tags JSONB NOT NULL DEFAULT '[]'` — multi-select, e.g.
  `contrarian | educational | myth_busting | data_driven | inspirational | community_focused | cost_saving | urgency`
  (propose a clean finalized list of 8-12 tags in your summary; store as an array of strings).
- `impact_score INTEGER` — 0-100, model's own estimate of viral/engagement potential, with
  a `impact_score_reasoning TEXT` column explaining why (this must be an honest LLM estimate,
  not a fake precise-looking number — label it as an estimate in the UI).
- `used_at TIMESTAMPTZ` — null = not yet posted; set when Andy checks "used" in the UI.
- `notes TEXT` — Andy's freeform written reasoning, editable in the UI.
- `image_url TEXT`, `image_prompt TEXT` — generated image reference + the prompt used (or
  just the prompt if image gen isn't wired, per decision #4 above).
- `content_fingerprint TEXT` — a short hash/slug of the core claim+angle (e.g.
  slugified first ~80 chars of main_idea, or an embedding-free normalized keyword set) used
  to detect and skip near-duplicate topics across generation runs. Add a non-unique index;
  don't hard-block on exact duplicates alone since angles can legitimately be reused with a
  different hook — just surface it for the generator to avoid repetition, and store enough
  that a future dedupe pass could compare across runs.

On `marketing_feedback_events`, extend the tags vocabulary used by the app layer (`lib/marketing/*`
constants, not a DB constraint) to include `approved` and `disapproved` as first-class values,
used specifically against `content_draft` targets from the new UI's approve/disapprove buttons.

### 2. Generation pipeline (extend `lib/marketingPipeline.ts` / add
   `lib/marketing/instagramGenerator.ts`, invoked by a new/adapted script + Modal schedule)

Each run (3x/week):
1. Pull recent `marketing_content_drafts` (platform='instagram') fingerprints + any
   `approved`/`disapproved` feedback + notes, to (a) avoid repeating angles already queued
   or used in the last N runs, and (b) let past approve/disapprove feedback + notes bias
   topic/angle selection — this is the "learn from our feedback" loop Andy asked for. Read
   this as context passed into the LLM prompt, not a fake statistical threshold system like
   the old preferences engine.
2. Run grounded web research on a rotating/expanding set of topics. Seed topics (from
   Andy's brief, already researched once — extend beyond these over time, don't just cycle
   the same 5 forever):
   - Content that's already popping off for practice-type/local-business accounts
   - "Websites are overrated" (nuanced version per research-findings.md: GBP wins discovery,
     website wins verification/trust — don't overclaim)
   - AI (Claude/ChatGPT) making ad creation manageable
   - Ranking marketing channels by effectiveness (ads vs. referrals vs. community vs. reviews)
   - Why ads are good but not optimal (cost/competition rising, cite real CPC/CPM data)
   - Landscape/myth-busting angles from ongoing research (SEO skepticism, review-revenue
     link, AI reshaping local search, etc.)
   Each run should search for genuinely new angles/data within these themes (or adjacent
   ones it discovers), not just reformat the same 6 files.
3. For each topic, produce a real Instagram-native draft: hook-first caption (IG readers
   decide in the first line), a clear teaching point, a citation-backed stat/quote worked in
   naturally (not academic-sounding), a soft CTA that positions UZU credibly (never a hard
   sell), 15-30 relevant hashtags (mix of broad + niche, no hashtag spam), sentiment tags,
   an impact_score + reasoning, and an image_prompt for the branded stat-card visual.
4. Insert as `status='draft'` rows. Never auto-publish (no publish integration exists or
   should be built here — Andy posts manually).

### 3. UI — extend the Content Library page (`app/marketing/content-library/page.tsx` +
   `[draftId]/page.tsx`) or add a dedicated `app/marketing/instagram-queue/page.tsx` (your
   call which is cleaner given existing code; if you add a new page, wire it into
   `components/marketing/MarketingTabs.tsx`)

Must support:
- List/grid of drafts, each showing: image preview (or prompt if no image), caption excerpt,
  hashtags, sentiment tag chips, impact_score (sorted descending by default — this is the
  "order by impact/viralness" ask), used checkbox, notes textarea (autosave or explicit save),
  approve/disapprove buttons (write `marketing_feedback_events` rows), a link/expand to full
  caption + full research citations for that post.
- Filters: by sentiment tag (multi-select), by used/unused, by approved/disapproved/unreviewed.
- Sort: by impact_score (default desc), by created_at.
- This is Andy's daily-use review queue — keep it fast and scannable, no page-jump drill-downs
  per his standing UX preference (side panel / inline expand, not separate page navigation,
  matching the existing Story Workspace inline-panel pattern from a recent commit
  `7554e3d feat(marketing): Story Workspace / Content Studio inline panel flow` — look at
  that for the established pattern in this codebase).

### 4. Cron

Add a new Modal scheduled function (or extend `modal/marketing_research.py` with a second
`@app.function` + its own `modal.Cron(...)`) running Mon/Wed/Fri, calling the new generation
script. Follow the exact pattern already in `modal/marketing_research.py` (image build,
secrets from `marketing-research` Modal secret, time budget, subprocess to a `scripts/*.ts`
entrypoint). Add the new script under `scripts/` (e.g. `scripts/generate-instagram-content.ts`).

## Constraints / house rules (from repo conventions + Andy's standing preferences)

- Sequential work, no subagent fan-out, no parallel processes (you are already running under
  `load-gate`; use `load-gate check` before tsc/build/test, never `load-gate run` — nested
  calls deadlock).
- `npm run build` (or this repo's actual build command — check `package.json`) at most once,
  near the end.
- Test with this repo's actual test runner — check `package.json` scripts before assuming
  vitest; automation-hub has used `node --test` for some suites.
- Git identity for any commits must be `Jaehyung Andy Lee <84836749+AndyLeeProjects@users.noreply.github.com>`
  (check `git config user.email` isn't drifted to `root@srv` before committing — fix it first
  if so).
- Never fabricate research citations, engagement numbers, or claims. Every stat in generated
  content must have a traceable source URL stored somewhere (e.g. in a `source_urls` JSONB
  column alongside the draft, or referenced in `notes`/a sources field — add whatever column
  makes sense, just don't lose the citations).
- Delete this brief file (commit its removal) when the build is complete and verified.

## Verification checklist before reporting done

1. Migration applied against the real `DATABASE_URL` — confirm new columns exist
   (`\d marketing_content_drafts` or equivalent query).
2. Generation script run once manually end-to-end — confirm it inserts real rows with
   real cited research (paste 1-2 example rows' captions + a source URL in your summary).
3. UI: start the dev server, load the new/updated page, confirm filters/sort/checkbox/
   approve-disapprove/notes actually work against the live DB (curl or screenshot evidence).
4. Modal cron function defined with correct schedule — confirm with `modal deploy --help`
   dry-run or by inspecting the decorator; do not need to actually deploy unless you're
   confident credentials are set up (if Modal deploy requires interactive auth you don't
   have, document that as a follow-up step for Andy rather than guessing).
5. Kill any dev server you started.
6. Report: what's real vs. what needs Andy's follow-up (e.g. image generation wiring,
   Modal deploy), file/line references, and row counts from a real query.
