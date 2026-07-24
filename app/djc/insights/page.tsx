import { redirect } from 'next/navigation'

/** The old single-page report now lives across the tabbed views. */
export default function LegacyInsightsRedirect() {
  redirect('/djc/overview')
}
