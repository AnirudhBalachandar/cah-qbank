"use client"

import { useEffect, useState } from "react"

import { useTheme } from "@/components/theme-provider"

type Settings = {
  offline: boolean
  notifications: boolean
  compactCards: boolean
}

const defaults: Settings = {
  offline: true,
  notifications: true,
  compactCards: false,
}

export function ProfileSettings() {
  const [settings, setSettings] = useState<Settings>(defaults)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    const raw = window.localStorage.getItem("cah-qbank-profile-settings")
    if (!raw) return
    try {
      setSettings({ ...defaults, ...JSON.parse(raw) })
    } catch {
      setSettings(defaults)
    }
  }, [])

  function update(next: Settings) {
    setSettings(next)
    window.localStorage.setItem("cah-qbank-profile-settings", JSON.stringify(next))
  }

  return (
    <div className="rounded-lg border border-border bg-surface px-4 shadow-card">
      <ToggleRow
        title="Dark mode"
        subtitle={theme === "dark" ? "Dark appearance is enabled across this browser." : "Light appearance is enabled across this browser."}
        checked={theme === "dark"}
        onChange={(enabled) => setTheme(enabled ? "dark" : "light")}
      />
      <ToggleRow
        title="Download content"
        subtitle={settings.offline ? "Offline question library enabled on this device." : "Offline library disabled for this browser."}
        checked={settings.offline}
        onChange={(offline) => update({ ...settings, offline })}
      />
      <ToggleRow
        title="App settings"
        subtitle={settings.compactCards ? "Compact card density is enabled." : "Comfortable card density is enabled."}
        checked={settings.compactCards}
        onChange={(compactCards) => update({ ...settings, compactCards })}
      />
      <ToggleRow
        title="Notifications"
        subtitle={settings.notifications ? "Study reminders enabled locally." : "Study reminders disabled locally."}
        checked={settings.notifications}
        onChange={(notifications) => update({ ...settings, notifications })}
      />
    </div>
  )
}

function ToggleRow({
  title,
  subtitle,
  checked,
  onChange,
}: {
  title: string
  subtitle: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-16 items-center gap-3 border-b border-border px-1 py-3 last:border-b-0">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-canvas text-muted" aria-hidden="true">i</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-copy">{title}</span>
        <span className="block text-xs text-muted">{subtitle}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-accent"
        aria-label={title}
      />
    </label>
  )
}
