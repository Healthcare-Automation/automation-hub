'use client'

import { useEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'
import { SF_JOB_DESCRIPTION_FIELD } from '@/lib/sfJobDescriptionField'
import { looksLikeHtmlForDiff } from '@/lib/sfFieldDiffUtils'

function fmtValPlain(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function sanitizeSfJobHtml(raw: string): string {
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
}

type Tone = 'muted' | 'emerald' | 'blue'

const tonePlain: Record<Tone, string> = {
  muted: 'text-zinc-300',
  emerald: 'text-emerald-200',
  blue: 'text-blue-200',
}

function SfHtmlFieldValue({
  field,
  value,
  tone = 'muted',
}: {
  field: string
  value: unknown
  tone?: Tone
}) {
  const str = value === null || value === undefined ? '' : String(value)
  const showHtml =
    field === SF_JOB_DESCRIPTION_FIELD && str.length > 0 && looksLikeHtmlForDiff(str)

  const [sanitized, setSanitized] = useState('')

  useEffect(() => {
    if (!showHtml) {
      setSanitized('')
      return
    }
    setSanitized(sanitizeSfJobHtml(str))
  }, [showHtml, str])

  if (value === null || value === undefined || value === '') {
    return <span className="text-zinc-500">—</span>
  }

  if (showHtml) {
    const shellClass = cn(
      'mt-1 max-h-72 overflow-y-auto rounded-md border border-zinc-600/40 bg-zinc-950/80 px-3 py-2 text-[13px] leading-relaxed',
      tonePlain[tone],
    )
    if (!sanitized) {
      return (
        <div className={cn(shellClass, 'font-mono text-[11px] opacity-90 whitespace-pre-wrap break-words')}>
          {str.length > 8000 ? `${str.slice(0, 8000)}…` : str}
        </div>
      )
    }
    return (
      <div
        className={cn(shellClass, 'sf-jd-html')}
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    )
  }

  return (
    <span className={cn('whitespace-pre-wrap break-words font-mono', tonePlain[tone])}>
      {fmtValPlain(value)}
    </span>
  )
}

export default SfHtmlFieldValue
