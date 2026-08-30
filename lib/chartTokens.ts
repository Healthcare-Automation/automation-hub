/**
 * The one place chart colours are defined.
 *
 * Charts were built one at a time and drifted: emerald in one, teal in another, violet for a stage
 * that meant nothing special, and gradients on some bars but not others. Gradients also read as a
 * second dimension of information when they carry none — a bar that fades is doing something a flat
 * bar is not, and here it never was.
 *
 * Rules:
 *  - Flat fills only. No gradients on data marks.
 *  - CYAN is the default series — candidates, views, volume, anything with no verdict attached.
 *  - TEAL means a good outcome; CLAY means it fell short. Never emerald/red — that pair reads as
 *    holiday decoration across a row of twelve bars.
 *  - SLATE is neutral: comparison bars, "no data", tracks.
 *  - VIOLET is reserved for specialists, the only place a distinct category is genuinely needed.
 *
 * Every token carries both themes. The light values sit one step deeper than the dark ones — a
 * pastel tuned to hold up against #0e0e12 washes out against white — but they stay in the same
 * hue family, so a chart keeps its meaning when the theme flips.
 */
export const CHART = {
  /** Default data series. */
  primary: 'bg-cyan-500/70 dark:bg-cyan-400/60',
  primaryStrong: 'bg-cyan-500/85 dark:bg-cyan-400/75',
  /** A good outcome — beat the comparison, placed, converted. */
  good: 'bg-teal-400/90 dark:bg-teal-300/65',
  /** Fell short of the comparison; a gap worth attention. Not an error. */
  warn: 'bg-orange-300 dark:bg-orange-300/55',
  /** Nothing to compare against, or a deliberately recessive value. */
  neutral: 'bg-slate-400/70 dark:bg-slate-400/45',
  /** The prior-period reference bar — must recede behind the value it is compared to. */
  reference: 'bg-slate-300 dark:bg-slate-700/60',
  /** Empty bar track. */
  track: 'bg-zinc-200/70 dark:bg-zinc-800/40',
  /** Specialists, where a distinct category is genuinely required. */
  accent: 'bg-violet-400/80 dark:bg-violet-400/60',
} as const

/** Hover states, matched to the fills above. */
export const CHART_HOVER = {
  primary: 'group-hover:bg-cyan-600/80 dark:group-hover:bg-cyan-300/75',
  good: 'group-hover:bg-teal-500/95 dark:group-hover:bg-teal-200/80',
  warn: 'group-hover:bg-orange-400 dark:group-hover:bg-orange-200/70',
  neutral: 'group-hover:bg-slate-500/80 dark:group-hover:bg-slate-300/60',
  reference: 'group-hover:bg-slate-400 dark:group-hover:bg-slate-600/70',
} as const

/** Text tones that pair with the fills, for figures printed beside a bar. */
export const CHART_TEXT = {
  good: 'text-teal-700 dark:text-teal-300/80',
  warn: 'text-orange-700 dark:text-orange-300/75',
  neutral: 'text-zinc-500 dark:text-zinc-600',
} as const
