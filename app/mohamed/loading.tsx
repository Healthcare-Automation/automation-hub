function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-stone-200 ${className}`} />
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-2 h-7 w-72" />
        </div>
        <SkeletonBlock className="h-8 w-32" />
      </div>

      <div className="mt-7 rounded-2xl border border-stone-200 bg-white p-5">
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="mt-3 h-4 w-full max-w-md" />
      </div>

      <div className="mt-7 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="border-b border-stone-200 px-5 py-4">
          <SkeletonBlock className="h-5 w-48" />
        </div>
        <div className="p-5">
          <SkeletonBlock className="h-28 w-full" />
        </div>
      </div>

      <div className="mt-7">
        <SkeletonBlock className="h-5 w-56" />
        <div className="mt-3 space-y-2">
          <SkeletonBlock className="h-14 w-full" />
          <SkeletonBlock className="h-14 w-full" />
          <SkeletonBlock className="h-14 w-full" />
        </div>
      </div>

      <div className="mt-7 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="border-b border-stone-200 px-5 py-3">
          <SkeletonBlock className="h-4 w-32" />
        </div>
        <SkeletonBlock className="h-32 w-full rounded-none" />
      </div>

      <div className="mt-7 rounded-2xl border border-sky-200 bg-sky-50 p-5">
        <SkeletonBlock className="h-5 w-44 bg-sky-200" />
        <SkeletonBlock className="mt-3 h-16 w-full bg-sky-200" />
      </div>
    </div>
  )
}
