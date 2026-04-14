'use client'

import { diffWords, type Change } from 'diff'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { SF_JOB_DESCRIPTION_FIELD } from '@/lib/sfJobDescriptionField'
import SfHtmlFieldValue from '@/components/SfHtmlFieldValue'
import {
  prepareSidesForDiff,
  sfFieldValuesEquivalent,
  valueToComparableString,
} from '@/lib/sfFieldDiffUtils'

const DIFF_MAX_LEN = 120_000

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

  const { parts, usePlainExtract, tooLong } = useMemo(() => {
    if (emptyPrev && emptyNext) {
      return { parts: [] as Change[], usePlainExtract: false, tooLong: false }
    }
    const prep = prepareSidesForDiff(field, prev, next)
    if (prep.left === prep.right) {
      return { parts: [] as Change[], usePlainExtract: prep.usePlainExtract, tooLong: false }
    }
    if (prep.left.length > DIFF_MAX_LEN || prep.right.length > DIFF_MAX_LEN) {
      return {
        parts: [] as Change[],
        usePlainExtract: prep.usePlainExtract,
        tooLong: true,
      }
    }
    return {
      parts: diffWords(prep.left, prep.right),
      usePlainExtract: prep.usePlainExtract,
      tooLong: false,
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

  if (parts.length > 0) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] text-zinc-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span>
            <span className="line-through decoration-rose-400/80 text-rose-200/90">Removed</span>
            <span className="text-zinc-600 mx-1">·</span>
            <span className={addedHighlightClass(afterTone)}>Added</span>
            <span className="text-zinc-600 mx-1">·</span>
            <span className="text-zinc-400">Unchanged</span>
          </span>
        </p>
        {usePlainExtract ? (
          <p className="text-[10px] text-zinc-500 leading-tight">
            Word diff compares visible text only (HTML tags ignored). Use &quot;Formatted previews&quot; for the
            original layout.
          </p>
        ) : null}
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
        {usePlainExtract && !emptyPrev && !emptyNext ? (
          <details className="rounded-md border border-zinc-700/50 bg-zinc-900/40 text-[10px]">
            <summary className="cursor-pointer select-none px-2 py-1.5 text-zinc-400 hover:text-zinc-300">
              Formatted previews (HTML)
            </summary>
            <div className="grid grid-cols-2 gap-2 border-t border-zinc-700/50 p-2">
              <SfHtmlFieldValue field={field} value={prev} tone="muted" />
              <SfHtmlFieldValue field={field} value={next} tone={afterTone === 'blue' ? 'blue' : 'emerald'} />
            </div>
          </details>
        ) : null}
      </div>
    )
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
