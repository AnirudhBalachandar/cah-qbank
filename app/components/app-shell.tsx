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
    <div className="min-h-screen bg-transparent text-copy">
      <header className="border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <div>
            <Link href="/" className="text-lg font-semibold tracking-tight text-copy">
              CAH QBank
            </Link>
            <p className="text-sm text-muted">
              Education only. Not medical advice.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-border bg-panel/70 px-3 py-1.5 text-sm font-medium text-muted transition hover:border-accent/40 hover:bg-panel hover:text-copy"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 lg:px-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-copy sm:text-4xl">{title}</h1>
          {subtitle ? <p className="max-w-3xl text-sm text-muted">{subtitle}</p> : null}
        </div>
        {children}
      </main>
    </div>
  )
}
