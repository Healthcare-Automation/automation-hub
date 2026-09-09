import { NextResponse } from 'next/server'
import { getInstagramDraftImage } from '@/lib/marketingQueries'
import { getCarouselSlideImage } from '@/lib/marketingQueries'

/** Serves either the legacy single stat-card image (marketing_content_drafts.image_data,
 * pre-carousel-redesign drafts) or, when ?slide=N is given, one carousel slide's bytes
 * from marketing_content_draft_images (2026-09-08 redesign). Read-only, so — like
 * app/api/marketing/evidence/[clusterId]/route.ts — it relies on proxy.ts's admin-only
 * default for /api/marketing/* rather than re-checking the admin cookie itself.
 *
 * 2026-09-09: the success path used Cache-Control: immutable, max-age=86400. That's correct
 * for a genuine 200 (this image's bytes never change once generated), but a DB error (pool
 * exhaustion, transient timeout — see marketingQueries.ts's getCarouselSlideImage/
 * getInstagramDraftImage) or a 404 fell through to the SAME response construction with no
 * explicit no-cache header, which some browsers/CDN layers will still cache as if it were a
 * real cacheable response. A cached failure then "sticks" — the browser refuses to
 * revalidate for the immutable window even after the underlying data becomes available
 * again, which is exactly the recurring "images broken, page won't recover" symptom (Andy,
 * 2026-09-08 and 2026-09-09). Fixed: only a genuine, verified-non-empty success response
 * gets the long-lived immutable header; every other path (not found, and now any thrown DB
 * error) gets Cache-Control: no-store so a retry or refresh can always self-heal. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const slideParam = searchParams.get('slide')

  let bytes: Buffer | null
  try {
    bytes =
      slideParam !== null
        ? await getCarouselSlideImage(id, Number.parseInt(slideParam, 10))
        : await getInstagramDraftImage(id)
  } catch (err) {
    console.error('instagram-image route: DB read failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'db_error' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }

  if (!bytes) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=86400, immutable',
    },
  })
}
