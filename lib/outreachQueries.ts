import { outreachSql as sql } from './outreachDb'

/**
 * Read-only queries against the outreach_* mirror tables (see lib/outreachDb.ts
 * for why this is a mirror, not the source of truth — SQLite on the VPS is).
 * Every function here is defensive: a missing/renamed column or an empty
 * mirror should degrade to an empty result, never throw and blank the page.
 */

export type PipelineStage =
  | 'discovered' | 'researching' | 'qualified' | 'needs_contact_data'
  | 'ready_for_review' | 'approved' | 'scheduled' | 'contacted'
  | 'following_up' | 'replied' | 'qualified_conversation' | 'meeting'
  | 'opportunity' | 'nurture' | 'closed_won' | 'closed_lost' | 'not_fit'
  | 'suppressed' | 'blocked_deliverability'

export interface OutreachCompanyRow {
  id: number
  name: string
  website: string | null
  domain: string | null
  industry: string | null
  service_type: string | null
  size_bucket: string | null
  pipeline_stage: string
  lead_score: number | null
  research_tier: string | null
  do_not_contact: boolean
  do_not_contact_reason: string | null
  historical_priority: string | null
  historical_pipeline_stage: string | null
  is_locked_historical: boolean
  updated_at: string | null
  // joined
  contact_name: string | null
  contact_title: string | null
  contact_email: string | null
  contact_email_status: string | null
  email_status_current: string | null   // status of most recent email row, if any
  linkedin_status: string | null        // status of most recent linkedin_action row, if any
  reply_classification: string | null   // most recent reply classification, if any
}

export async function getOutreachSummary() {
  const [row] = await sql<{ total: number; contactable: number; needs_review: number;
    contacted: number; replied: number; do_not_contact: number; last_synced_at: string | null }[]>`
    select
      (select count(*)::int from outreach_companies) as total,
      (select count(*)::int from outreach_companies where do_not_contact = 0
        and pipeline_stage not in ('contacted','suppressed','not_fit','closed_won','closed_lost')) as contactable,
      (select count(*)::int from outreach_companies where pipeline_stage = 'ready_for_review') as needs_review,
      (select count(*)::int from outreach_companies where pipeline_stage in
        ('contacted','following_up','replied','qualified_conversation','meeting','opportunity')) as contacted,
      (select count(*)::int from outreach_companies where pipeline_stage in
        ('replied','qualified_conversation','meeting','opportunity')) as replied,
      (select count(*)::int from outreach_companies where do_not_contact = 1) as do_not_contact,
      (select last_synced_at::text from outreach_sync_meta where id = 1) as last_synced_at
  `
  return row
}

export async function getOutreachCompanies(): Promise<OutreachCompanyRow[]> {
  const rows = await sql<OutreachCompanyRow[]>`
    select
      c.id, c.name, c.website, c.domain, c.industry, c.service_type, c.size_bucket,
      c.pipeline_stage, c.lead_score, c.research_tier,
      (c.do_not_contact = 1) as do_not_contact, c.do_not_contact_reason,
      c.historical_priority, c.historical_pipeline_stage,
      (c.is_locked_historical = 1) as is_locked_historical,
      c.updated_at::text as updated_at,
      pc.full_name as contact_name, pc.title as contact_title,
      pc.email as contact_email, pc.email_status as contact_email_status,
      le.status as email_status_current,
      la.status as linkedin_status,
      lr.classification as reply_classification
    from outreach_companies c
    left join lateral (
      select full_name, title, email, email_status from outreach_contacts
      where company_id = c.id and is_primary_decision_maker = 1
      order by id desc limit 1
    ) pc on true
    left join lateral (
      select status from outreach_emails where company_id = c.id
      order by created_at desc limit 1
    ) le on true
    left join lateral (
      select status from outreach_linkedin_actions where company_id = c.id
      order by created_at desc limit 1
    ) la on true
    left join lateral (
      select classification from outreach_replies where company_id = c.id
      order by received_at desc limit 1
    ) lr on true
    order by (c.lead_score is null), c.lead_score desc, c.name asc
  `
  return rows
}

export interface CompanyDetail {
  company: OutreachCompanyRow & { business_model_notes: string | null; operational_hypothesis: string | null }
  scoreBreakdown: {
    business_model_fit: number | null; operational_opportunity: number | null
    economic_importance: number | null; uzu_credibility: number | null
    decision_maker_access: number | null; timing_trigger: number | null
    personalization_evidence: number | null; total: number | null; rationale: string | null
  } | null
  hypothesis: {
    problem_hypothesis: string | null; opportunity_hypothesis: string | null
    economic_importance: string | null; why_uzu: string | null; why_now: string | null
    confidence: string | null
  } | null
  emails: { id: number; subject: string | null; body: string | null; status: string;
    sent_at: string | null; created_at: string | null }[]
  linkedinActions: { id: number; recommended_action: string | null; connection_note: string | null;
    dm_draft: string | null; urgency: string | null; profile_confidence: string | null;
    profile_summary: string | null; site_evidence: string | null;
    status: string; verification_note: string | null; contact_name: string | null;
    linkedin_url: string | null }[]
  replies: { id: number; channel: string | null; body: string | null; classification: string | null;
    recommended_response: string | null; next_action: string | null; received_at: string | null }[]
  findings: { category: string | null; finding: string; evidence_label: string }[]
}

export async function getCompanyDetail(id: number): Promise<CompanyDetail | null> {
  const [company] = await sql<(OutreachCompanyRow & { business_model_notes: string | null;
    operational_hypothesis: string | null })[]>`
    select
      c.id, c.name, c.website, c.domain, c.industry, c.service_type, c.size_bucket,
      c.pipeline_stage, c.lead_score, c.research_tier,
      (c.do_not_contact = 1) as do_not_contact, c.do_not_contact_reason,
      c.historical_priority, c.historical_pipeline_stage,
      (c.is_locked_historical = 1) as is_locked_historical,
      c.updated_at::text as updated_at, c.business_model_notes, c.operational_hypothesis,
      pc.full_name as contact_name, pc.title as contact_title,
      pc.email as contact_email, pc.email_status as contact_email_status,
      null as email_status_current, null as linkedin_status, null as reply_classification
    from outreach_companies c
    left join lateral (
      select full_name, title, email, email_status from outreach_contacts
      where company_id = c.id and is_primary_decision_maker = 1
      order by id desc limit 1
    ) pc on true
    where c.id = ${id}
  `
  if (!company) return null

  const scoreRows = await sql<NonNullable<CompanyDetail['scoreBreakdown']>[]>`
    select business_model_fit, operational_opportunity, economic_importance, uzu_credibility,
           decision_maker_access, timing_trigger, personalization_evidence, total, rationale
    from outreach_lead_scores where company_id = ${id} order by scored_at desc limit 1
  `
  const scoreBreakdown = scoreRows[0] ?? null
  const hypRows = await sql<NonNullable<CompanyDetail['hypothesis']>[]>`
    select problem_hypothesis, opportunity_hypothesis, economic_importance, why_uzu, why_now, confidence
    from outreach_opportunity_hypotheses where company_id = ${id} order by created_at desc limit 1
  `
  const hypothesis = hypRows[0] ?? null
  const emails = await sql<CompanyDetail['emails']>`
    select id, subject, body, status, sent_at, created_at::text as created_at
    from outreach_emails where company_id = ${id} order by created_at desc
  `
  const linkedinActions = await sql<CompanyDetail['linkedinActions']>`
    select la.id, la.recommended_action, la.connection_note, la.dm_draft, la.urgency,
           la.profile_confidence, la.profile_summary, la.site_evidence,
           la.status, la.verification_note,
           ct.full_name as contact_name, ct.linkedin_url
    from outreach_linkedin_actions la
    left join outreach_contacts ct on ct.id = la.contact_id
    where la.company_id = ${id} order by la.created_at desc
  `
  const replies = await sql<CompanyDetail['replies']>`
    select id, channel, body, classification, recommended_response, next_action,
           received_at::text as received_at
    from outreach_replies where company_id = ${id} order by received_at desc
  `
  const findings = await sql<CompanyDetail['findings']>`
    select category, finding, evidence_label
    from outreach_research_findings where company_id = ${id} order by created_at desc
  `
  return { company, scoreBreakdown: scoreBreakdown ?? null, hypothesis: hypothesis ?? null,
    emails, linkedinActions, replies, findings }
}

export async function setLinkedinActionDecision(
  id: number, status: 'approved' | 'rejected', note: string | null
) {
  await sql`
    update outreach_linkedin_actions
    set status = ${status}, verification_note = ${note}
    where id = ${id}
  `
}
