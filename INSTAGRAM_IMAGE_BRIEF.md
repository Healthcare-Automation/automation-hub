# Instagram Queue — Image Generation Brief

## Context (read first, do not re-derive)

The Instagram content queue (`/marketing/instagram-queue`, `marketing_content_drafts` where
`format='instagram_post'`) is live and generating real, cited drafts on a Mon/Wed/Fri Modal
cron (`modal/marketing_research.py::run_instagram_content`, already deployed to the
`uzu-billing` Modal app — do not touch its schedule/deploy config). Each draft already has an
`image_prompt` column describing the desired visual style: "clean, professional, high-contrast
dark navy background with a single accent color, elite modern-SaaS/consulting aesthetic
(Stripe/Linear-adjacent minimalism)". `image_url` is currently always null — this brief wires
up real image generation to fill it in.

## Explicit decisions already made — do not re-ask

1. **Image API: OpenAI Images API (`gpt-image-1`), using the existing `OPENAI_API_KEY`**
   already in `.env.local` / the Modal secret `marketing-research`. No new API key.
2. **Storage: no new infra.** This repo has no Vercel Blob token configured and no
   `@vercel/blob` dependency — do NOT add one or ask Andy to provision it. Instead, store the
   generated image directly: add a `marketing_content_drafts.image_bytes BYTEA` column (or
   store a base64 string in `image_url` as a `data:image/png;base64,...` URI — pick whichever
   is cleaner given this repo's existing patterns; check if any other table already stores
   binary/base64 image data for a precedent before deciding). At 3 images/week this is
   trivially small for Postgres; do not over-engineer a CDN/storage-service solution for this
   volume.
3. **Image format per post: a single "stat/quote card"** — one punchy visual per Instagram
   post (a headline number/stat or a short quote from the caption's core claim, large and
   bold, matching the dark-navy/single-accent minimalist aesthetic already in `image_prompt`).
   NOT a dense multi-section infographic. Think: the single most shareable stat from the
   post's cited research, rendered as clean typography on a branded background — the kind of
   image you'd see leading a Stripe/Linear/Ramp-style educational Instagram/LinkedIn post.
   No UZU logo/brand kit exists in this repo yet — leave a small text placeholder area
   (e.g. bottom-right corner, subtle) for a future logo, but don't fabricate a logo.
4. **Trigger point: generate the image as part of the existing generation pipeline**
   (`lib/marketing/instagramGenerator.ts` or wherever `synthesizeDraft` lives from the prior
   build), immediately after a draft is inserted — not a separate manual step, not a separate
   cron. If image generation fails, the draft should still be saved (with `image_url` null and
   the failure logged) rather than losing the whole draft — never block draft creation on
   image generation succeeding.
5. **Extract the actual stat/quote to render** from the draft's own caption + underlying
   research citations already gathered during generation (don't re-search) — pass the
   caption's core claim/stat and the citation source into the image prompt sent to
   `gpt-image-1`, using the base style from `image_prompt` plus the specific stat as content.

## What to build

1. Add whichever schema column you decided in point 2 above (additive migration, same
   `sql/marketing_schema.sql` file, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pattern).
2. Add `lib/marketing/imageGenerator.ts` (or similar): a function that takes the draft's
   caption/stat + `image_prompt` style string, calls OpenAI's Images API
   (`POST https://api.openai.com/v1/images/generations`, model `gpt-image-1`, appropriate
   size — 1024x1024 or 1024x1792 for Instagram portrait, your call, square (1080x1080-equivalent,
   `1024x1024`) is the safer Instagram default), gets back base64 image data, and returns it
   for storage.
3. Wire this into the existing generation flow so every new Instagram draft gets an image
   automatically going forward.
4. **Backfill**: run it once against the existing draft(s) already in the table with
   `image_url is null` (there are currently 1-2 real drafts from testing) so Andy sees a
   real generated image immediately, not just future ones.
5. **UI**: update `/marketing/instagram-queue` to render the actual image (from the
   base64/bytea data — add a small API route like `app/api/marketing/instagram-image/[id]/route.ts`
   that serves the bytes with the right content-type if you went the BYTEA route, or just
   render the data URI directly if you went that route) instead of just showing the text
   `image_prompt`. Keep it fast — don't fetch full-res images in the list view if that's slow;
   a smaller preview / lazy load is fine if bytea payloads make the list view sluggish, your
   judgment call given real testing.

## Constraints / house rules (unchanged from the original build)

- Sequential work only, no subagents. `load-gate check` before tsc/test/build (never
  `load-gate run` — you're already inside one). Build command at most once, near the end.
- Git identity: `Jaehyung Andy Lee <84836749+AndyLeeProjects@users.noreply.github.com>` —
  verify `git config user.email` before committing.
- Commit incrementally.
- Do not touch `modal/marketing_research.py`'s cron schedule or the existing `run_research`
  function — both are live in production, deployed today. Only add to the Instagram
  generation code path they already call into.
- Never fabricate — if `gpt-image-1` access fails (billing/quota/model-not-available), report
  that honestly with the actual error, don't silently fall back to a placeholder without
  saying so clearly in your summary.

## Verification checklist before reporting done

1. Migration applied against real `DATABASE_URL` — confirm new column exists.
2. Backfill run for real — confirm the existing draft(s) now have real image data (report
   the actual byte size / a way for Andy to view it).
3. Generate one brand-new draft end-to-end (you can call the existing generation script
   manually) and confirm it comes out with a real image attached, not null.
4. UI: start dev server, load `/marketing/instagram-queue`, confirm the image actually
   renders in the browser (curl the image API route and confirm you get real image bytes
   back with correct content-type, at minimum — screenshot if you can).
5. `npm test` and `npm run build` pass.
6. Kill any dev server you started.
7. Delete this brief file and commit its removal when done.
8. Report actual OpenAI API cost incurred if surfaced (image generation costs money per
   call) and roughly what this will cost per week at 3 images/week going forward.
