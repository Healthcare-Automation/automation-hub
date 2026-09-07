import { NextResponse } from 'next/server'
import { getInstagramDraftImage } from '@/lib/marketingQueries'

/** Serves a generated Instagram stat-card image's raw bytes (INSTAGRAM_IMAGE_BRIEF.md).
 * Read-only, so — like app/api/marketing/evidence/[clusterId]/route.ts — it relies on
 * proxy.ts's admin-only default for /api/marketing/* rather than re-checking the admin
 * cookie itself. Bytes live in marketing_content_drafts.image_data; image_url just points
 * here, keeping the list query (getInstagramDrafts) light. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bytes = await getInstagramDraftImage(id)
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
