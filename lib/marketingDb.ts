import sql from './db'

/** Marketing tab (Practice Story Engine port) reuses the hub's existing DATABASE_URL —
 * same Supabase Postgres project as Proxi/Mohamed, marketing_* table prefix keeps it
 * collision-free. See sql/marketing_schema.sql and PORT_BRIEF.md. */
export const marketingSql: typeof sql = sql

export const isMarketingConfigured = Boolean(process.env.DATABASE_URL)
