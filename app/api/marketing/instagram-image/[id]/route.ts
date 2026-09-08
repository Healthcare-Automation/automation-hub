import { NextResponse } from 'next/server'
import { getInstagramDraftImage } from '@/lib/marketingQueries'
import { getCarouselSlideImage } from '@/lib/marketingQueries'

/** Serves either the legacy single stat-card image (marketing_content_drafts.image_data,
 * pre-carousel-redesign drafts) or, when ?slide=N is given, one carousel slide's bytes
 * from marketing_content_draft_images (2026-09-08 redesign). Read-only, so — like
 * app/api/marketing/evidence/[clusterId]/route.ts — it relies on proxy.ts's admin-only
 * default for /api/marketing/* rather than re-checking the admin cookie itself. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const slideParam = searchParams.get('slide')

  const bytes =
    slideParam !== null
      ? await getCarouselSlideImage(id, Number.parseInt(slideParam, 10))
      : await getInstagramDraftImage(id)

  if (!bytes) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=86400, immutable',
    },
  })
}
