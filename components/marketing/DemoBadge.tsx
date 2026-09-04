/** Amber "Demo data" badge — ported convention from marketing_content/components/demo-badge.tsx.
 * Must appear anywhere is_demo_data is true so seeded data never looks like a live signal. */
export function DemoBadge() {
  return (
    <span className="inline-block rounded border border-amber-500 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300">
      Demo data
    </span>
  )
}
