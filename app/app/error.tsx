"use client"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-3xl border border-danger/20 bg-panel/95 p-8 text-center shadow-glow">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-danger">
          Dashboard load failure
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-copy">
          Something interrupted this view.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          The dashboard hit an unexpected error while reading local data. Retry the route, and if it keeps happening, inspect the underlying server logs.
        </p>
        {error.message ? (
          <p className="mt-4 rounded-2xl border border-border bg-surface/80 px-4 py-3 text-left text-sm text-muted">
            {error.message}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-canvas transition hover:bg-accent-strong"
        >
          Retry
        </button>
      </div>
    </div>
  )
}
