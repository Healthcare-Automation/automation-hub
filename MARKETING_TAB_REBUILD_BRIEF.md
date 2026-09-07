# Marketing Tab Rebuild — Instagram-Only, Demo Tomorrow

## Context (read first, do not re-derive; Andy is asleep, no clarifying questions possible —
## make the reasonable call yourself and document it in your summary)

The Marketing tab in this repo (`app/marketing/*`) is a ported "Practice Story Engine":
RSS ingestion → trend clustering → scored story opportunities → LinkedIn/video-script content
drafts. Andy has since built a NEW, separate, working pipeline: an Instagram content queue
(`app/marketing/instagram-queue`, `lib/marketingInstagramPipeline.ts`,
`lib/marketing/instagramGenerator.ts`) that does its own topic-planning + live web search per
run, fully independent of the RSS/clustering pipeline. It runs on a real Modal cron
(Mon/Wed/Fri, already deployed) and is the ONLY thing Andy wants going forward.

The six old pages (Briefing, Trend Radar, Story Workspace, Content Library, Sources, Voice and
Learning) are now genuinely disconnected dead weight for Andy's actual workflow — they read
from `marketing_trend_clusters`/`marketing_story_opportunities`/`marketing_source_items`, which
the Instagram pipeline never touches. Andy has a live demo TOMORROW and explicitly wants the
Marketing tab **rebuilt to be Instagram-only** — the LinkedIn post / video script UI must not
be visible anywhere in it.

Andy is asleep. Do not wait for clarification on anything — make the most reasonable, safest
call, document your reasoning in commit messages/summary, and keep going. This touches a LIVE
PRODUCTION Vercel deployment (auto-deploys on push to `origin/main` on this repo, GitHub
`Healthcare-Automation/automation-hub`) — the demo depends on `main` being deployable and
correct, so verify thoroughly before considering yourself done, and do NOT leave anything in a
broken intermediate state if you have to stop.

## Explicit decision already made — do not re-ask

**Full cut.** The Marketing tab becomes: Instagram Queue + Settings only. Remove Briefing,
Trend Radar, Story Workspace, Content Library, Sources, and Voice and Learning from the nav
AND delete their route files, since they're dead weight and Andy chose full removal over
archiving. Their now-unused supporting library code, unused API routes, and now-orphaned DB
read paths should be removed too if nothing else references them — but the underlying SQL
tables (`marketing_trend_clusters`, `marketing_story_opportunities`, `marketing_source_items`,
etc.) should NOT be dropped from the schema (`sql/marketing_schema.sql`) — leave the schema
file alone, this is a code/UI cut, not a data-destructive migration. The Modal cron
`run_research` (the 6h RSS ingestion job) should also be left alone in `modal/marketing_research.py`
for now UNLESS its only purpose was feeding pages you're deleting — use your judgment: if
removing its consuming UI makes it pure wasted compute/cost with zero remaining consumer, it's
fine to leave the Modal function defined but note in your summary that it now has no UI
consumer, rather than making the call to undeploy production infra yourself.

## What to build

### 1. Nav (`components/marketing/MarketingTabs.tsx`)

Reduce `TABS` to just:
```
{ href: '/marketing', label: 'Instagram Queue' },
{ href: '/marketing/settings', label: 'Settings' },
```
`/marketing` (the root Marketing route) should now show what `/marketing/instagram-queue`
currently shows — i.e. the Instagram Queue becomes the Marketing tab's landing/default page,
not a sub-route. Move `app/marketing/instagram-queue/page.tsx`'s content to `app/marketing/page.tsx`
(replacing the old Briefing page), and either delete `app/marketing/instagram-queue/` or make
it redirect to `/marketing` (your call — deleting cleanly is preferred over leaving a redirect
stub, but don't break any existing bookmarked links if you can cheaply avoid it via a redirect).

### 2. Delete these routes entirely

- `app/marketing/trend-radar/`
- `app/marketing/story-workspace/` (including `[opportunityId]/`)
- `app/marketing/content-library/` (including `[draftId]/`)
- `app/marketing/sources/`
- `app/marketing/voice-and-learning/`
- The OLD `app/marketing/page.tsx` (Briefing) — replaced per step 1 above.

### 3. Delete now-unused components (verify with a real grep for other importers before
   deleting each one — do not delete anything still referenced from a surviving page)

Likely unused after the cut (confirm each): `AngleWorkspace.tsx`, `ContentStudioPanel.tsx`,
`highlightClaims.tsx`, `RunResearchButton.tsx`, `FeedRegistryTable.tsx`, `TrendRadarTable.tsx`,
`OpportunityCard.tsx`, `EvidenceSidePanel.tsx`, `BriefingMetricStrip.tsx`, `HideDemoToggle.tsx`,
`SourceTypeChips.tsx`, `ScoreBar.tsx`, `Sparkline.tsx`, `PreferenceControls.tsx`,
`IngestUrlForm.tsx`, `FeedbackForm.tsx`. Keep `ComplianceBanner.tsx` and `DemoBadge.tsx` if the
Instagram queue board still uses them (it does, per `InstagramQueueBoard.tsx`).

### 4. Delete now-unused API routes (same rule: confirm no remaining caller first)

Likely unused: `app/api/marketing/content/generate/route.ts`,
`app/api/marketing/sources/toggle/route.ts`, `app/api/marketing/opportunities/status/route.ts`,
`app/api/marketing/evidence/[clusterId]/route.ts`, `app/api/marketing/research/route.ts` (check
this one carefully — it may be the endpoint the Modal `run_research` cron calls; if so, keep it
even though its UI trigger button is gone, since the cron still hits it),
`app/api/marketing/preferences/reset|remove|status/route.ts`,
`app/api/marketing/sources/ingest-url/route.ts`, `app/api/marketing/story/select-angle/route.ts`,
`app/api/marketing/feedback/route.ts`. Keep everything under `app/api/marketing/instagram*` and
`app/api/marketing/instagram-image/*` — those back the surviving page.

### 5. Clean up now-dead exports in `lib/marketingQueries.ts`

This file has a LOT of query functions for the deleted pages (Briefing cards, Trend Radar
rows, Story Workspace, Content Library, feedback/preferences). Remove functions with zero
remaining callers after the route/component deletion above. Do this carefully — grep for each
export name across the whole repo (not just `app/marketing`) before deleting, since some
logic (e.g. `getInstagramDrafts`, `insertInstagramDraft`, `getRecentInstagramDraftsContext`,
`setInstagramDraftImage`, `getInstagramDraftsMissingImage`, `getMarketingOrgAndUser`) must
survive — those back the surviving Instagram Queue + Settings pages. Also check
`lib/marketingClustering.ts`, `lib/marketingResearch.ts`, `lib/marketingPipeline.ts`,
`lib/marketing/storyGenerator.ts`, `lib/marketing/contentGenerator.ts`,
`lib/marketing/ranking.ts`, `lib/marketing/duplicateDetection.ts` (or similarly named files —
check actual filenames) for the same "is this still reachable from anything" question. If a
file becomes fully dead (zero remaining importers anywhere, including tests, scripts, and the
Modal-invoked research script), delete it; if `scripts/research-marketing.ts` (the Modal cron's
entrypoint) still needs it, keep it.

### 6. Settings page (`app/marketing/settings/page.tsx`)

Update its copy — it currently describes "Story/content generation" and "Embeddings /
clustering" (old pipeline concerns). Rewrite it to describe the Instagram pipeline instead:
whether `OPENAI_API_KEY` is set (LLM + web search + image generation all depend on it), the
model in use, and the Mon/Wed/Fri Modal cron schedule. Keep it simple and accurate — this is a
demo-facing page, it should look intentional, not like leftover copy.

## Performance (Andy's other explicit ask: "everything is still laggy" — verify, don't assume
## the earlier N+1 fix already solved it for the pages that will remain)

1. Re-check `app/marketing/page.tsx` (post-rebuild, i.e. the Instagram Queue as landing page)
   and `app/marketing/settings/page.tsx` for any N+1 query pattern (a `for`/`map` loop that
   awaits a DB call per row) — the Instagram queue is a small dataset (3 posts/week) so this is
   less likely to be the issue there, but verify with an actual query count, don't assume.
2. Check `lib/marketingQueries.ts`'s `getInstagramDrafts` — it already looks reasonably
   efficient (one query with a lateral join for feedback tags), but double check there's no
   per-row image fetch happening in the list view (images should load via the separate
   `/api/marketing/instagram-image/[id]` route, lazily, not inline in the main query).
3. Check `app/marketing/layout.tsx` and any shared nav/auth cookie-check code for redundant
   work (e.g. calling `verifyAdminCookieValue` more than once per request).
4. If you find additional real N+1s or redundant sequential awaits ANYWHERE still reachable
   after the cut (not just in the pages being removed), fix them the same way the existing
   `evidenceSummariesForClusters` batching fix in `lib/marketingQueries.ts` did — batch with
   `= any(...)` + JS grouping instead of one query per row.
5. Actually measure: start the dev server, curl `/marketing` and `/marketing/settings` a few
   times, and report real response times in your summary (both cold and warm), not a guess.

## House rules (unchanged from prior builds in this repo)

- Sequential work only, no subagents, no parallel processes.
- `load-gate check` before any tsc/test/build step — NEVER `load-gate run` (you are already
  inside one via the wrapper this was launched with; nested calls deadlock).
- `npm run build` at most once, near the end.
- `npm test` and `npm run typecheck` must both pass before you consider this done. If a test
  references a deleted route/component/query function, delete or update that specific test —
  do not leave broken tests, but also do not delete a test wholesale if part of it still tests
  surviving code (e.g. `tests/marketing-image-generator.test.ts`,
  `tests/marketing-llm.test.ts`, `tests/marketing-dedupe.test.ts`,
  `tests/marketing-cron-auth.test.ts`, `tests/marketing-scoring.test.ts`,
  `tests/marketing-ranking.test.ts`, `tests/marketing-rss.test.ts` — check each one's actual
  content, some may test logic that survives even though a UI page doesn't).
- Git identity: `Jaehyung Andy Lee <84836749+AndyLeeProjects@users.noreply.github.com>` — verify
  `git config user.email` before your first commit, fix if drifted.
- Commit incrementally (this is a big multi-step change; frequent small commits mean a kill
  loses little and each commit should leave the repo in a working state — do not commit a
  half-deleted state that fails to build).
- **After you are done and verified, PUSH to `origin main`** (`git push origin main`) — this
  repo auto-deploys to Vercel production on push, and Andy needs this live for tomorrow's demo.
  Do not skip this step; a local-only commit does not help him. Confirm the push succeeded
  (check `git log origin/main -1` matches your last commit) before finishing.
- Never fabricate — if something can't be verified (e.g. you can't reach Vercel/Modal from
  this environment to confirm deploy success), say so plainly in your summary rather than
  claiming it's live. You CAN and SHOULD verify the git push itself succeeded, and the local
  `npm run build` succeeds, since those are directly checkable.
- Delete this brief file and commit its removal when fully done.

## Verification checklist before finishing (real evidence, not assertions)

1. `npm run typecheck` clean.
2. `npm test` — 100% pass, report the count.
3. `npm run build` succeeds — paste the actual route list from the build output showing
   `/marketing` and `/marketing/settings` exist and the six deleted routes are gone.
4. Start `npm run dev` (or use the production build) briefly, curl `/marketing` and
   `/marketing/settings`, confirm real 200s with real content (not error pages), report actual
   response times. Kill the server when done.
5. Confirm the nav (`MarketingTabs.tsx`) renders only 2 tabs — grep the file and paste it in
   your summary.
6. Confirm no dangling imports of a deleted file anywhere (`npm run build` failing would catch
   this, but also do a final grep for a few deleted component/query names as a sanity check).
7. `git push origin main` succeeded — paste `git log origin/main -1` output.
8. Report real load-time numbers (before/after if you fixed anything further) for whatever
   remains reachable, and a plain list of what was deleted vs. kept vs. left ambiguous with
   your reasoning.
