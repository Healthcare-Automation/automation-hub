'use client'

import { diff as htmlStructuralDiff } from '@yeger/html-diff'
import { diffWords, type Change } from 'diff'
import DOMPurify from 'dompurify'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type UIEventHandler,
} from 'react'
import { cn } from '@/lib/utils'
import { SF_JOB_DESCRIPTION_FIELD } from '@/lib/sfJobDescriptionField'
import SfHtmlFieldValue from '@/components/SfHtmlFieldValue'
import {
  prepareSidesForDiff,
  sfFieldValuesEquivalent,
  valueToComparableString,
} from '@/lib/sfFieldDiffUtils'

const DIFF_MAX_LEN = 120_000

function syncScrollPeer(source: HTMLDivElement, target: HTMLDivElement) {
  const sMax = source.scrollHeight - source.clientHeight
  const tMax = target.scrollHeight - target.clientHeight
  if (tMax <= 0) return
  if (sMax <= 0) {
    target.scrollTop = 0
    return
  }
  const ratio = source.scrollTop / sMax
  target.scrollTop = ratio * tMax
}

function SideBySideSyncedSfHtml({
  field,
  prev,
  next,
  afterTone,
}: {
  field: string
  prev: unknown
  next: unknown
  afterTone: AfterTone
}) {
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const ignoreRef = useRef<'none' | 'left' | 'right'>('none')

  const onLeftScroll: UIEventHandler<HTMLDivElement> = (e) => {
    if (ignoreRef.current === 'right') return
    const right = rightRef.current
    if (!right) return
    ignoreRef.current = 'left'
    syncScrollPeer(e.currentTarget, right)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (ignoreRef.current === 'left') ignoreRef.current = 'none'
      })
    })
  }

  const onRightScroll: UIEventHandler<HTMLDivElement> = (e) => {
    if (ignoreRef.current === 'left') return
    const left = leftRef.current
    if (!left) return
    ignoreRef.current = 'right'
    syncScrollPeer(e.currentTarget, left)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (ignoreRef.current === 'right') ignoreRef.current = 'none'
      })
    })
  }

  return (
    <div className="grid grid-cols-2 gap-2 border-t border-zinc-700/50 p-2">
      <SfHtmlFieldValue
        field={field}
        value={prev}
        tone="muted"
        htmlScrollContainerRef={leftRef}
        onHtmlScrollContainerScroll={onLeftScroll}
      />
      <SfHtmlFieldValue
        field={field}
        value={next}
        tone={afterTone === 'blue' ? 'blue' : 'emerald'}
        htmlScrollContainerRef={rightRef}
        onHtmlScrollContainerScroll={onRightScroll}
      />
    </div>
  )
}

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

type AfterTone = 'emerald' | 'blue'

function InlineDiffBefore({ parts }: { parts: Change[] }) {
  return (
    <span className="whitespace-pre-wrap break-words text-[11px] leading-relaxed">
      {parts.map((part, i) => {
        if (part.added) return null
        if (part.removed) {
          return (
            <span
              key={i}
              className="line-through decoration-rose-400/90 text-rose-100/90 bg-rose-950/40 rounded px-0.5"
              title="Removed"
            >
              {part.value}
            </span>
          )
        }
        return (
          <span key={i} className="text-zinc-300" title="Unchanged">
            {part.value}
          </span>
        )
      })}
    </span>
  )
}

function addedHighlightClass(afterTone: AfterTone): string {
  return afterTone === 'blue'
    ? 'bg-sky-500/25 text-sky-50 ring-1 ring-sky-400/35 rounded px-0.5'
    : 'bg-emerald-500/25 text-emerald-50 ring-1 ring-emerald-400/30 rounded px-0.5'
}

function InlineDiffAfter({ parts, afterTone }: { parts: Change[]; afterTone: AfterTone }) {
  const addCls = addedHighlightClass(afterTone)
  const unchangedCls = afterTone === 'blue' ? 'text-blue-100/95' : 'text-emerald-100/90'
  return (
    <span className="whitespace-pre-wrap break-words text-[11px] leading-relaxed">
      {parts.map((part, i) => {
        if (part.removed) return null
        if (part.added) {
          return (
            <span key={i} className={addCls} title="Added">
              {part.value}
            </span>
          )
        }
        return (
          <span key={i} className={unchangedCls} title="Unchanged">
            {part.value}
          </span>
        )
      })}
    </span>
  )
}

function sanitizeSfHtmlFragment(raw: string): string {
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
}

function sanitizeSfHtmlDiffOutput(raw: string): string {
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['class'],
  })
}

/**
 * HTML-aware diff (preserves bullets, bold, paragraphs) for rich job descriptions.
 * Falls back to `fallback` if the diff library throws or DOMPurify is unavailable.
 */
function JdHtmlFormattedDiff({
  prev,
  next,
  afterTone,
  fallback,
}: {
  prev: unknown
  next: unknown
  afterTone: AfterTone
  fallback: ReactNode
}) {
  const [merged, setMerged] = useState<string | null>(null)
  const [useFallback, setUseFallback] = useState(false)

  useEffect(() => {
    let cancelled = false
    setUseFallback(false)
    setMerged(null)
    try {
      const a = valueToComparableString(prev)
      const b = valueToComparableString(next)
      const safePrev = sanitizeSfHtmlFragment(a)
      const safeNext = sanitizeSfHtmlFragment(b)
      const raw = htmlStructuralDiff(safePrev, safeNext)
      const safe = sanitizeSfHtmlDiffOutput(raw)
      if (!cancelled) setMerged(safe)
    } catch {
      if (!cancelled) setUseFallback(true)
    }
    return () => {
      cancelled = true
    }
  }, [prev, next])

  if (useFallback) return <>{fallback}</>

  if (merged === null) {
    return (
      <div className="text-[10px] text-zinc-500 py-2 border border-zinc-700/40 rounded-md px-2 bg-zinc-950/40">
        Preparing formatted comparison…
      </div>
    )
  }

  return (
    <div
      className={cn(
        'sf-jd-html sf-jd-html-diff mt-0.5 max-h-96 overflow-y-auto rounded-md border border-zinc-600/40 bg-zinc-950/50 px-3 py-2 text-[13px] leading-relaxed text-zinc-200',
        afterTone === 'blue' ? 'sf-jd-diff-tone-blue' : 'sf-jd-diff-tone-emerald',
      )}
      dangerouslySetInnerHTML={{ __html: merged }}
    />
  )
}

export function SfFieldCompared({
  field,
  prev,
  next,
  afterTone = 'emerald',
  beforeLabel = 'Before: ',
  afterLabel = 'After: ',
}: {
  field: string
  prev: unknown
  next: unknown
  afterTone?: AfterTone
  beforeLabel?: string
  afterLabel?: string
}) {
  const emptyPrev = isEmptyValue(prev)
  const emptyNext = isEmptyValue(next)

  const rawEqual = valueToComparableString(prev) === valueToComparableString(next)
  const auditEquivalent =
    !emptyPrev && !emptyNext && sfFieldValuesEquivalent(prev, next, field)
  const markupOnly = auditEquivalent && !rawEqual

  const { parts, usePlainExtract, tooLong, hasDiff } = useMemo(() => {
    if (emptyPrev && emptyNext) {
      return { parts: [] as Change[], usePlainExtract: false, tooLong: false, hasDiff: false }
    }
    const prep = prepareSidesForDiff(field, prev, next)
    if (prep.left === prep.right) {
      return { parts: [] as Change[], usePlainExtract: prep.usePlainExtract, tooLong: false, hasDiff: false }
    }
    if (prep.left.length > DIFF_MAX_LEN || prep.right.length > DIFF_MAX_LEN) {
      return {
        parts: [] as Change[],
        usePlainExtract: prep.usePlainExtract,
        tooLong: true,
        hasDiff: true,
      }
    }
    return {
      parts: diffWords(prep.left, prep.right),
      usePlainExtract: prep.usePlainExtract,
      tooLong: false,
      hasDiff: true,
    }
  }, [field, prev, next, emptyPrev, emptyNext])

  if (emptyPrev && emptyNext) {
    return (
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <span className="text-zinc-500">{beforeLabel}</span>
          <span className="text-zinc-500">—</span>
        </div>
        <div>
          <span className="text-zinc-500">{afterLabel}</span>
          <span className="text-zinc-500">—</span>
        </div>
      </div>
    )
  }

  if (!emptyPrev && !emptyNext && auditEquivalent) {
    return (
      <div className="space-y-2">
        {markupOnly && field === SF_JOB_DESCRIPTION_FIELD ? (
          <p className="text-[10px] text-zinc-500 leading-tight">
            Same visible text; markup or spacing in HTML may differ.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-zinc-500">{beforeLabel}</span>
            <SfHtmlFieldValue field={field} value={prev} tone="muted" />
          </div>
          <div>
            <span className="text-zinc-500">{afterLabel}</span>
            <SfHtmlFieldValue field={field} value={next} tone={afterTone === 'blue' ? 'blue' : 'emerald'} />
          </div>
        </div>
      </div>
    )
  }

  if (tooLong) {
    return (
      <div className="space-y-1">
        <p className="text-[10px] text-amber-400/90">Content too long for inline diff; showing full values.</p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-zinc-500">{beforeLabel}</span>
            <SfHtmlFieldValue field={field} value={prev} tone="muted" />
          </div>
          <div>
            <span className="text-zinc-500">{afterLabel}</span>
            <SfHtmlFieldValue field={field} value={next} tone={afterTone === 'blue' ? 'blue' : 'emerald'} />
          </div>
        </div>
      </div>
    )
  }

  if (hasDiff && !tooLong) {
    const wordDiffGrid = (
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="min-w-0">
          <span className="text-zinc-500">{beforeLabel}</span>
          <div
            className={cn(
              'mt-0.5 max-h-72 overflow-y-auto rounded-md border border-zinc-600/40 bg-zinc-950/50 px-2 py-1.5',
              usePlainExtract ? 'font-sans' : 'font-mono',
            )}
          >
            {emptyPrev ? (
              <span className="text-zinc-500">—</span>
            ) : (
              <InlineDiffBefore parts={parts} />
            )}
          </div>
        </div>
        <div className="min-w-0">
          <span className="text-zinc-500">{afterLabel}</span>
          <div
            className={cn(
              'mt-0.5 max-h-72 overflow-y-auto rounded-md border border-zinc-600/40 bg-zinc-950/50 px-2 py-1.5',
              usePlainExtract ? 'font-sans' : 'font-mono',
            )}
          >
            {emptyNext ? (
              <span className="text-zinc-500">—</span>
            ) : (
              <InlineDiffAfter parts={parts} afterTone={afterTone} />
            )}
          </div>
        </div>
      </div>
    )

    if (usePlainExtract) {
      return (
        <div className="space-y-2">
          <div>
            <span className="text-[10px] text-zinc-500">{beforeLabel.replace(/:\s*$/, '')} / </span>
            <span className="text-[10px] text-zinc-500">{afterLabel.replace(/:\s*$/, '')}</span>
            <span className="text-[10px] text-zinc-600"> — merged (formatting preserved)</span>
          </div>
          <JdHtmlFormattedDiff
            prev={prev}
            next={next}
            afterTone={afterTone}
            fallback={wordDiffGrid}
          />
          {!emptyPrev && !emptyNext ? (
            <details className="rounded-md border border-zinc-700/50 bg-zinc-900/40 text-[10px]">
              <summary className="cursor-pointer select-none px-2 py-1.5 text-zinc-400 hover:text-zinc-300">
                Side-by-side originals (no diff highlights)
              </summary>
              <SideBySideSyncedSfHtml field={field} prev={prev} next={next} afterTone={afterTone} />
            </details>
          ) : null}
        </div>
      )
    }

    return <div className="space-y-2">{wordDiffGrid}</div>
  }

  return (
    <div className="grid grid-cols-2 gap-2 text-[11px]">
      <div>
        <span className="text-zinc-500">{beforeLabel}</span>
        <SfHtmlFieldValue field={field} value={prev} tone="muted" />
      </div>
      <div>
        <span className="text-zinc-500">{afterLabel}</span>
        <SfHtmlFieldValue field={field} value={next} tone={afterTone === 'blue' ? 'blue' : 'emerald'} />
      </div>
    </div>
  )
}
