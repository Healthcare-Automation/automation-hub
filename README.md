# automation-hub

Status page for Proxi automation pipelines. Built with Next.js + Supabase.

## Setup

```bash
npm install
# One-time setup: create your local env file (do not re-run or you'll overwrite your DB URL)
cp .env.local.example .env.local
# Edit .env.local and set DATABASE_URL to your real Supabase connection string
npm run dev
```

## Daily dev

```bash
npm run dev
```

## Deploy to Vercel

1. Push this repo to GitHub
2. Import in [vercel.com](https://vercel.com) — root directory is `/`
3. Add environment variable: `DATABASE_URL` (your Supabase connection string)
4. Deploy

## Environment Variables


| Variable       | Description                                                   |
| -------------- | ------------------------------------------------------------- |
| `DATABASE_URL` | Supabase PostgreSQL connection string (pooler URL + password) |


