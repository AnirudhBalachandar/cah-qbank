"use client"

import { useEffect, useState } from "react"

import { HeatmapChart } from "@/components/dashboard/HeatmapChart"
import { SessionsChart } from "@/components/dashboard/SessionsChart"
import { TopicsChart } from "@/components/dashboard/TopicsChart"
import { TrendChart } from "@/components/dashboard/TrendChart"
import type { DashboardData } from "@/lib/qbank"

function ChartShell() {
  return (
    <div className="animate-pulse rounded-2xl border border-border bg-panel/90 p-6 shadow-glow">
      <div className="h-5 w-40 rounded bg-surface" />
      <div className="mt-3 h-64 rounded-2xl bg-surface" />
    </div>
  )
}

export function DashboardCharts({
  dashboard,
  activeCurriculum,
}: {
  dashboard: DashboardData
  activeCurriculum?: string
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <section className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <ChartShell key={index} />
        ))}
      </section>
    )
  }

  return (
    <section className="grid gap-6 xl:grid-cols-2">
      <TrendChart data={dashboard.trendData} />
      <TopicsChart data={dashboard.topicDistribution} activeCurriculum={activeCurriculum} />
      <HeatmapChart data={dashboard.heatmapData} />
      <SessionsChart data={dashboard.sessionsBarData} />
    </section>
  )
}
