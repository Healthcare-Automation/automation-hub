import postgres from 'postgres'

declare global {
  // eslint-disable-next-line no-var
  var _pgSql: ReturnType<typeof postgres> | undefined
}

function createSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL environment variable is not set')
  return postgres(url, {
    ssl: 'require',
    max: 3,
    idle_timeout: 20,
    max_lifetime: 1800,
    connection: { application_name: 'proxi-status-page' },
  })
}

const sql = globalThis._pgSql ?? createSql()

if (process.env.NODE_ENV !== 'production') {
  globalThis._pgSql = sql
}

export default sql
