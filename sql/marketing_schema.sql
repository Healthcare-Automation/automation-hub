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
