import { redirect } from 'next/navigation'

/** This page moved to /marketing (the Marketing tab's landing page) on 2026-09-08 —
 * MARKETING_TAB_REBUILD_BRIEF.md made the tab Instagram-only, so the queue no longer
 * needs its own sub-route. Kept as a redirect so any bookmarked /marketing/instagram-queue
 * link still works. */
export default function InstagramQueueRedirect() {
  redirect('/marketing')
}
