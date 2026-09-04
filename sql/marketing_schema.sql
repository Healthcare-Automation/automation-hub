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
