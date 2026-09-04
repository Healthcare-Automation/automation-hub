import { config } from 'dotenv'
config({ path: '.env.local' })

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sql from '../lib/db'

/** One-shot idempotent DDL apply for sql/marketing_schema.sql against DATABASE_URL.
 *  Safe to re-run — every statement is CREATE TABLE/INDEX IF NOT EXISTS. */
async function main() {
  const path = join(__dirname, '..', 'sql', 'marketing_schema.sql')
  const schema = readFileSync(path, 'utf8')
  await sql.unsafe(schema)
  console.log('marketing_* schema applied.')
  await sql.end({ timeout: 5 })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
