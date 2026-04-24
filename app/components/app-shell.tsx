import Link from "next/link"
import type { ReactNode } from "react"

import { ThemeToggle } from "@/components/theme-provider"

const links = [
  { href: "/browse", label: "Browse", icon: "M4 19V7l8-4 8 4v12l-8-4-8 4Z" },
  { href: "/practice/new", label: "Practice", icon: "M8 5v14l11-7L8 5Z" },
  { href: "/progress", label: "Progress", icon: "M5 19V9m7 10V5m7 14v-7" },
  { href: "/notebook", label: "Notebook", icon: "M6 4h11a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 0v14" },
  { href: "/profile", label: "Profile", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" },
]

function TabIcon({ path }: { path: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path d={path} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

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
    <div className="min-h-screen bg-canvas text-copy">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 lg:px-6">
          <div>
            <Link href="/browse" className="text-lg font-bold tracking-tight text-accent">
              CAH QBank
            </Link>
            <p className="hidden text-sm text-muted sm:block">
              Education only. Not medical advice.
            </p>
          </div>
          <nav className="hidden flex-wrap gap-1 md:flex" aria-label="Primary navigation">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm font-semibold text-muted transition hover:border-border hover:bg-canvas hover:text-copy"
              >
                <TabIcon path={link.icon} />
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <div className="relative md:hidden">
              <span className="sr-only">Notifications</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 text-copy" fill="none">
                <path d="M15 17H9m10-1-1.2-1.8A4 4 0 0 1 17 12V9a5 5 0 0 0-10 0v3a4 4 0 0 1-.8 2.2L5 16h14Zm-5 3a2 2 0 0 1-4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                3
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-4 pb-28 pt-5 md:gap-6 md:py-8 lg:px-6">
        <div className="hidden space-y-1 md:block">
          <h1 className="text-3xl font-bold tracking-tight text-copy sm:text-4xl">{title}</h1>
          {subtitle ? <p className="max-w-3xl text-sm leading-6 text-muted">{subtitle}</p> : null}
        </div>
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 shadow-card backdrop-blur md:hidden"
        aria-label="Mobile navigation"
      >
        <div className="grid grid-cols-5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold text-muted transition hover:bg-canvas hover:text-accent"
            >
              <TabIcon path={link.icon} />
              <span>{link.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
