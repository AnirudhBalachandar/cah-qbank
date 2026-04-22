import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CAH QBank v2',
  description: 'Single-user paediatrics question bank for local revision',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-950">
        {children}
      </body>
    </html>
  )
}
