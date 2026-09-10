-- Marketing tab (Practice Story Engine port) schema.
-- Ported from /root/projects/internal/marketing_content/db/schema (Drizzle) to raw SQL,
-- since automation-hub has no Drizzle/migration runner (see lib/ensureSlackAlertsTable.ts
-- for the existing idempotent-DDL pattern this file follows).
--
-- All tables are prefixed marketing_ to avoid any collision with existing hub tables in
-- the shared DATABASE_URL Supabase project. Enum-like columns are plain TEXT validated at
-- the application layer (lib/marketing/*), matching this repo's existing convention of no
-- pg enum types.
--
-- Apply with: npx tsx scripts/apply-marketing-schema.ts (or: npm run db:marketing-schema)

CREATE TABLE IF NOT EXISTS marketing_organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES marketing_organizations(id),
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_sources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES marketing_organizations(id),
  adapter_id    TEXT NOT NULL,
  name          TEXT NOT NULL,
  config        JSONB NOT NULL DEFAULT '{}',
  is_demo_data  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- source_type: manual | trend_feed | news | social | regulatory | review | newsletter
-- reliability_classification: verified_fact | reported_opinion | anecdote | unverified
CREATE TABLE IF NOT EXISTS marketing_source_items (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID NOT NULL REFERENCES marketing_organizations(id),
  source_id                   UUID NOT NULL REFERENCES marketing_sources(id),
  source_url                  TEXT NOT NULL,
  title                       TEXT NOT NULL,
  raw_content                 TEXT NOT NULL,
  published_at                TIMESTAMPTZ,
  retrieved_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  author_or_org               TEXT,
  source_type                 TEXT NOT NULL,
  supporting_excerpt          TEXT NOT NULL,
  reliability_classification  TEXT NOT NULL,
  dental_relevance            INTEGER NOT NULL,
  healthcare_relevance        INTEGER NOT NULL,
  geographic_relevance        TEXT NOT NULL DEFAULT 'national',
  topic_classification        JSONB NOT NULL DEFAULT '[]',
  is_demo_data                BOOLEAN NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_trend_clusters (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL REFERENCES marketing_organizations(id),
  title                  TEXT NOT NULL,
  summary                TEXT NOT NULL,
  topic_classification   TEXT NOT NULL,
  is_demo_data           BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_trend_cluster_items (
  cluster_id       UUID NOT NULL REFERENCES marketing_trend_clusters(id),
  source_item_id   UUID NOT NULL REFERENCES marketing_source_items(id),
  PRIMARY KEY (cluster_id, source_item_id)
);

CREATE TABLE IF NOT EXISTS marketing_trend_scores (
  id                                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                                UUID NOT NULL REFERENCES marketing_organizations(id),
  cluster_id                            UUID NOT NULL REFERENCES marketing_trend_clusters(id),
  total_score                           INTEGER NOT NULL,
  dental_healthcare_relevance_score     INTEGER NOT NULL,
  momentum_recency_score                INTEGER NOT NULL,
  evidence_strength_score               INTEGER NOT NULL,
  cross_source_confirmation_score       INTEGER NOT NULL,
  story_potential_score                 INTEGER NOT NULL,
  learned_interest_fit_score            INTEGER NOT NULL,
  explanation                           TEXT NOT NULL,
  computed_at                           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status: new | selected | archived
CREATE TABLE IF NOT EXISTS marketing_story_opportunities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES marketing_organizations(id),
  cluster_id          UUID REFERENCES marketing_trend_clusters(id),
  title               TEXT NOT NULL,
  signal_summary      TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'new',
  selected_angle_id   UUID,
  is_demo_data        BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- angle_type: practical | strategic | human
CREATE TABLE IF NOT EXISTS marketing_story_angles (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID NOT NULL REFERENCES marketing_organizations(id),
  opportunity_id            UUID NOT NULL REFERENCES marketing_story_opportunities(id),
  angle_type                TEXT NOT NULL,
  structure                 JSONB NOT NULL,
  applied_preference_notes  JSONB NOT NULL DEFAULT '[]',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- format: linkedin_post | video_script | carousel | newsletter | discussion_prompt | founder_commentary
--   (only linkedin_post/video_script are wired to UI, per BUILD_BRIEF MVP scope)
-- generated_by: template | llm
-- status: draft | approved | published
CREATE TABLE IF NOT EXISTS marketing_content_drafts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID NOT NULL REFERENCES marketing_organizations(id),
  opportunity_id            UUID NOT NULL REFERENCES marketing_story_opportunities(id),
  angle_id                  UUID NOT NULL REFERENCES marketing_story_angles(id),
  format                    TEXT NOT NULL,
  audience                  TEXT NOT NULL,
  objective                 TEXT NOT NULL,
  main_idea                 TEXT NOT NULL,
  source_material_links     JSONB NOT NULL DEFAULT '[]',
  hook_options               JSONB NOT NULL DEFAULT '[]',
  draft_text                TEXT NOT NULL,
  alternative_pov           TEXT NOT NULL,
  claims_requiring_review   JSONB NOT NULL DEFAULT '[]',
  suggested_visual          TEXT,
  generated_by              TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'draft',
  is_demo_data              BOOLEAN NOT NULL DEFAULT false,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- target_type: story_opportunity | story_angle | content_draft
-- tags: strong_idea | weak_idea | too_generic | too_promotional | too_clinical | too_obvious |
--       wrong_audience | wrong_tone | not_credible_enough | good_hook | good_story |
--       save_this_style | do_not_use_this_style_again
CREATE TABLE IF NOT EXISTS marketing_feedback_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES marketing_organizations(id),
  target_type    TEXT NOT NULL,
  target_id      UUID NOT NULL,
  tags           JSONB NOT NULL DEFAULT '[]',
  free_text      TEXT,
  captured_edits JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- preference_type: explicit_preference | observed_preference | performance_evidence
-- status: active | temporary | reset
CREATE TABLE IF NOT EXISTS marketing_learned_preferences (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID NOT NULL REFERENCES marketing_organizations(id),
  preference_type          TEXT NOT NULL,
  key                      TEXT NOT NULL,
  value                    JSONB NOT NULL,
  supporting_example_ids   JSONB NOT NULL DEFAULT '[]',
  occurrence_count         INTEGER NOT NULL DEFAULT 1,
  status                   TEXT NOT NULL DEFAULT 'active',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_published_content (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES marketing_organizations(id),
  draft_id       UUID NOT NULL REFERENCES marketing_content_drafts(id),
  published_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel        TEXT NOT NULL,
  url            TEXT,
  is_demo_data   BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS marketing_performance_metrics (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL REFERENCES marketing_organizations(id),
  published_content_id   UUID NOT NULL REFERENCES marketing_published_content(id),
  metric_name            TEXT NOT NULL,
  metric_value           NUMERIC NOT NULL,
  captured_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status: running | completed | failed
CREATE TABLE IF NOT EXISTS marketing_research_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES marketing_organizations(id),
  adapter_id      TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'running',
  items_ingested  INTEGER NOT NULL DEFAULT 0,
  is_demo_data    BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_marketing_source_items_org ON marketing_source_items(org_id);
CREATE INDEX IF NOT EXISTS idx_marketing_trend_clusters_org ON marketing_trend_clusters(org_id);
CREATE INDEX IF NOT EXISTS idx_marketing_story_opportunities_org ON marketing_story_opportunities(org_id);
CREATE INDEX IF NOT EXISTS idx_marketing_story_angles_opportunity ON marketing_story_angles(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_marketing_content_drafts_org ON marketing_content_drafts(org_id);
CREATE INDEX IF NOT EXISTS idx_marketing_feedback_events_org ON marketing_feedback_events(org_id);
CREATE INDEX IF NOT EXISTS idx_marketing_learned_preferences_org_status ON marketing_learned_preferences(org_id, status);

-- ─── Marketing V1: real ingestion / clustering / scheduled runs ──────────────
-- Additive only (ALTER ... ADD COLUMN IF NOT EXISTS / CREATE ... IF NOT EXISTS), safe to
-- re-run alongside the CREATE TABLE IF NOT EXISTS statements above. See MARKETING_V1_BRIEF.md.

-- Dedupe key for real ingestion: one row per (org, normalized source URL). Manual-url and
-- RSS ingestion both upsert against this with ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_source_items_org_url
  ON marketing_source_items(org_id, source_url);

-- Registry-backed feeds (lib/marketing/adapters/feedRegistry.ts) need bookkeeping the
-- original manual/demo-only sources table didn't: which registry entry a source came from,
-- whether it's enabled, and when it last ran / last failed, surfaced on the Sources page.
ALTER TABLE marketing_sources ADD COLUMN IF NOT EXISTS feed_registry_id TEXT;
ALTER TABLE marketing_sources ADD COLUMN IF NOT EXISTS reliability_classification TEXT;
ALTER TABLE marketing_sources ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE marketing_sources ADD COLUMN IF NOT EXISTS last_fetched_at TIMESTAMPTZ;
ALTER TABLE marketing_sources ADD COLUMN IF NOT EXISTS last_error TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_sources_org_feed_registry_id
  ON marketing_sources(org_id, feed_registry_id) WHERE feed_registry_id IS NOT NULL;

-- Enrichment stores a longer excerpt (~2000 chars, fetched from the article page) separately
-- from the short supporting_excerpt shown inline in evidence lists.
ALTER TABLE marketing_source_items ADD COLUMN IF NOT EXISTS full_excerpt TEXT;
-- Embedding vector (JSON float array — no pgvector extension assumed to be enabled on this
-- Supabase project) used for cosine-similarity clustering. Populated by lib/marketing/embeddings.ts.
ALTER TABLE marketing_source_items ADD COLUMN IF NOT EXISTS embedding JSONB;

-- Cluster centroid embedding + the most recent item's published_at, so momentum/recency and
-- "attach vs. create" clustering decisions don't have to re-fetch every member item.
ALTER TABLE marketing_trend_clusters ADD COLUMN IF NOT EXISTS embedding JSONB;
ALTER TABLE marketing_trend_clusters ADD COLUMN IF NOT EXISTS last_item_at TIMESTAMPTZ;

-- Chunked/resumable cron runs (Vercel function time budget): stage records the last pipeline
-- step completed, feed_results carries per-feed item counts/errors, triggered_by distinguishes
-- the cron tick from the admin "Run research now" button.
ALTER TABLE marketing_research_runs ADD COLUMN IF NOT EXISTS stage TEXT;
ALTER TABLE marketing_research_runs ADD COLUMN IF NOT EXISTS feed_results JSONB NOT NULL DEFAULT '[]';
ALTER TABLE marketing_research_runs ADD COLUMN IF NOT EXISTS triggered_by TEXT NOT NULL DEFAULT 'cron';
ALTER TABLE marketing_research_runs ADD COLUMN IF NOT EXISTS clusters_updated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE marketing_research_runs ADD COLUMN IF NOT EXISTS opportunities_created INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_marketing_research_runs_org_started ON marketing_research_runs(org_id, started_at DESC);

-- Which mode produced this opportunity's angles — same 'template' | 'llm' vocabulary as
-- marketing_content_drafts.generated_by, surfaced the same way in the UI (Settings/badges).
ALTER TABLE marketing_story_opportunities ADD COLUMN IF NOT EXISTS generated_by TEXT NOT NULL DEFAULT 'template';

alter table marketing_source_items add column if not exists llm_classified_at timestamptz;

-- ─── Instagram content queue ──────────────────────────────────────────────
-- Repurposes marketing_content_drafts / marketing_feedback_events for a much simpler,
-- concrete deliverable: UZU's own Instagram content queue (NOT client-facing), generated
-- directly from grounded web research rather than routed through the
-- opportunity -> cluster -> angle pipeline built for the dental-practice story engine.
-- See INSTAGRAM_QUEUE_BRIEF.md for the full spec.

-- The Instagram generator (lib/marketing/instagramGenerator.ts) never has a real
-- opportunity/angle to point at, and has no "alternative point of view" concept — loosen
-- these rather than inventing synthetic opportunity/angle rows just to satisfy the FK.
alter table marketing_content_drafts alter column opportunity_id drop not null;
alter table marketing_content_drafts alter column angle_id drop not null;
alter table marketing_content_drafts alter column alternative_pov drop not null;

alter table marketing_content_drafts add column if not exists platform text not null default 'instagram';
-- The Instagram caption, kept separate from draft_text (which existing LinkedIn/video-script
-- rows already populate and read elsewhere) rather than overloading its meaning.
alter table marketing_content_drafts add column if not exists caption text;
alter table marketing_content_drafts add column if not exists hashtags jsonb not null default '[]';
-- One or more of: contrarian | educational | myth_busting | data_driven | inspirational |
-- community_focused | cost_saving | urgency (lib/marketing/types.ts INSTAGRAM_SENTIMENT_TAGS).
alter table marketing_content_drafts add column if not exists sentiment_tags jsonb not null default '[]';
-- Model's own honest estimate of engagement/viral potential (0-100) plus its reasoning —
-- labeled as an estimate in the UI, never presented as a measured outcome.
alter table marketing_content_drafts add column if not exists impact_score integer;
alter table marketing_content_drafts add column if not exists impact_score_reasoning text;
-- Null = not yet posted; set when Andy checks "used" in the review UI.
alter table marketing_content_drafts add column if not exists used_at timestamptz;
-- Andy's freeform written reasoning, editable in the UI. Also where the generator flags a
-- claim as speculative/thin-evidence rather than presenting it as fact.
alter table marketing_content_drafts add column if not exists notes text;
-- image_url holds the path to this app's own image-serving route (see
-- app/api/marketing/instagram-image/[id]/route.ts), NOT the image bytes themselves — the
-- list query (getInstagramDrafts) must stay light, so the raw bytes live in image_data and
-- are only fetched when that route is actually hit. See INSTAGRAM_IMAGE_BRIEF.md decision #2
-- (BYTEA over a Vercel Blob dependency this repo doesn't have; base64-in-image_url was the
-- other option but would bloat every list-page load with full image payloads).
alter table marketing_content_drafts add column if not exists image_url text;
alter table marketing_content_drafts add column if not exists image_prompt text;
alter table marketing_content_drafts add column if not exists image_data bytea;
-- Short slug of the core claim+angle (see contentFingerprint() in
-- lib/marketing/instagramGenerator.ts), used to bias topic selection away from angles
-- already queued/used recently. Not a uniqueness constraint — angles can legitimately repeat
-- with a different hook, so this only informs the generator, it never hard-blocks a run.
alter table marketing_content_drafts add column if not exists content_fingerprint text;

create index if not exists idx_marketing_content_drafts_platform on marketing_content_drafts(platform);
create index if not exists idx_marketing_content_drafts_fingerprint on marketing_content_drafts(content_fingerprint);

-- ─── Instagram carousel slides ──────────────────────────────────────────────
-- Multi-image carousel support (2026-09-08 image/carousel redesign). Replaces the
-- single image_url/image_data-per-draft model for NEW drafts — old single-image drafts
-- keep working unchanged (image_url/image_data on the parent row are left in place for
-- backward compat / cover-image use in the queue list). A carousel's slides live here,
-- ordered by slide_index, each with its own rendered PNG bytes and the structured content
-- that produced it (so a slide can be regenerated/audited without re-deriving from caption
-- text). kind mirrors lib/marketing/slideTemplates.ts's SlideKind ('hook' | 'data' | 'cta').
create table if not exists marketing_content_draft_images (
  id            uuid primary key default gen_random_uuid(),
  draft_id      uuid not null references marketing_content_drafts(id) on delete cascade,
  slide_index   integer not null,
  kind          text not null,
  content       jsonb not null,
  image_data    bytea not null,
  created_at    timestamptz not null default now(),
  unique (draft_id, slide_index)
);

create index if not exists idx_marketing_content_draft_images_draft
  on marketing_content_draft_images(draft_id, slide_index);

-- ─── Reddit engagement evidence (2026-09-09) ──────────────────────────────
-- Sean's feedback: bias content toward what people are ALREADY reacting to, not just
-- net-new guesses. Cached weekly pulls of real (upvotes, comments) from a curated list of
-- relevant subreddits' top-of-month posts via Apify (harshmaur/reddit-scraper, startUrls
-- mode — plain keyword search on this actor returns near-zero-engagement noise, verified
-- live; pointing it at a specific subreddit's /top/ URL returns genuinely high-engagement,
-- on-topic posts). Cached rather than fetched per research run: this is real money
-- (Apify usage, free-tier capped at $5/mo) and the top-of-month list barely moves day to
-- day, so a weekly refresh is both cheaper and sufficient.
create table if not exists marketing_reddit_engagement (
  id                uuid primary key default gen_random_uuid(),
  subreddit         text not null,
  post_title        text not null,
  post_url          text not null,
  upvotes           integer not null,
  comments_count    integer not null,
  posted_at         timestamptz,
  fetched_at        timestamptz not null default now(),
  unique (post_url)
);

create index if not exists idx_marketing_reddit_engagement_fetched
  on marketing_reddit_engagement(fetched_at desc);
create index if not exists idx_marketing_reddit_engagement_upvotes
  on marketing_reddit_engagement(upvotes desc);

-- ─── Instagram engagement evidence (2026-09-10) ──────────────────────────────────────────
-- Andy: the Reddit-grounded drafts read "2-dimensional and obvious". Fix: study what
-- actually blew up on dental/practice-growth Instagram accounts and replicate those angles.
-- Same weekly-cache shape as marketing_reddit_engagement (Apify apify/instagram-post-scraper,
-- lib/marketing/instagramEngagement.ts). Real likes/comments per post, verified live
-- 2026-09-10: @dentalnachos 11.7k likes on an insurance-stats post, @drmarkcostes median
-- 1.4k on "profit from efficiency" — vs. 7-29 likes on accounts that looked authoritative
-- on paper. The number decides what we study, not the bio.
create table if not exists marketing_instagram_engagement (
  id uuid primary key default gen_random_uuid(),
  account text not null,
  post_url text not null unique,
  post_type text,                       -- Image | Video | Sidecar (carousel)
  caption text not null,
  likes_count int not null,
  comments_count int not null,
  video_view_count int,
  posted_at timestamptz,
  fetched_at timestamptz not null default now()
);
create index if not exists idx_marketing_instagram_engagement_score
  on marketing_instagram_engagement((likes_count + comments_count) desc);


