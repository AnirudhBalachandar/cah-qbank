"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

type ThemeMode = "light" | "dark"

type ThemeContextValue = {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}

const storageKey = "cah-qbank-theme"
const ThemeContext = createContext<ThemeContextValue | null>(null)

function normalizeTheme(value: string | null | undefined): ThemeMode {
  return value === "dark" ? "dark" : "light"
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle("dark", theme === "dark")
  root.style.colorScheme = theme
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("light")

  useEffect(() => {
    const initialTheme = normalizeTheme(window.localStorage.getItem(storageKey) ?? document.documentElement.dataset.theme)
    setThemeState(initialTheme)
    applyTheme(initialTheme)

    function onStorage(event: StorageEvent) {
      if (event.key !== storageKey) return
      const nextTheme = normalizeTheme(event.newValue)
      setThemeState(nextTheme)
      applyTheme(nextTheme)
    }

    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme: (nextTheme) => {
      setThemeState(nextTheme)
      applyTheme(nextTheme)
      window.localStorage.setItem(storageKey, nextTheme)
    },
    toggleTheme: () => {
      const nextTheme = theme === "dark" ? "light" : "dark"
      setThemeState(nextTheme)
      applyTheme(nextTheme)
      window.localStorage.setItem(storageKey, nextTheme)
    },
  }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) {
    throw new Error("useTheme must be used inside ThemeProvider")
  }
  return value
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === "dark"
  const label = isDark ? "Switch to light mode" : "Switch to dark mode"

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={[
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-bold text-copy shadow-sm transition hover:border-accent/30 hover:text-accent active:scale-[0.98]",
        compact ? "w-10 px-0" : "",
      ].join(" ")}
      aria-label={label}
      aria-pressed={isDark}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        {isDark ? (
          <path d="M12 4v2m0 12v2m8-8h-2M6 12H4m13.7-5.7-1.4 1.4M7.7 16.3l-1.4 1.4m11.4 0-1.4-1.4M7.7 7.7 6.3 6.3M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M20 14.4A7.2 7.2 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      {compact ? <span className="sr-only">{label}</span> : <span>{isDark ? "Light" : "Dark"}</span>}
    </button>
  )
}
