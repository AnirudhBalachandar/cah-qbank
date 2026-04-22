import Link from "next/link"
import type { ReactNode } from "react"

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/practice/new", label: "Practice" },
  { href: "/browse", label: "Browse" },
  { href: "/progress", label: "Progress" },
]

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
              CAH QBank v2
            </Link>
            <p className="text-sm text-slate-600">
              Education only. Not medical advice.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle ? <p className="max-w-3xl text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        {children}
      </main>
    </div>
  )
}
