import { marketingSql as sql } from './marketingDb'

/** Ported from marketing_content/lib/demo-actor.ts (raw SQL instead of Drizzle).
 * Single demo organization + demo user used everywhere an org/user id is needed —
 * an explicit, approved scope decision (no real auth/multi-tenant in this pass),
 * not an oversight. See standalone app's README "Known gaps". */

const DEMO_ORG_NAME = 'Riverside Family Dental (Demo)'
const DEMO_USER_EMAIL = 'demo@practice-story-engine.local'

export async function getDemoOrgAndUser(): Promise<{ orgId: string; userId: string }> {
  const [existingOrg] = await sql<{ id: string }[]>`
    select id from marketing_organizations where name = ${DEMO_ORG_NAME} limit 1
  `
  const orgId = existingOrg
    ? existingOrg.id
    : (
        await sql<{ id: string }[]>`
          insert into marketing_organizations (name) values (${DEMO_ORG_NAME}) returning id
        `
      )[0].id

  const [existingUser] = await sql<{ id: string }[]>`
    select id from marketing_users where email = ${DEMO_USER_EMAIL} limit 1
  `
  const userId = existingUser
    ? existingUser.id
    : (
        await sql<{ id: string }[]>`
          insert into marketing_users (org_id, email, name)
          values (${orgId}, ${DEMO_USER_EMAIL}, 'Demo User')
          returning id
        `
      )[0].id

  return { orgId, userId }
}
