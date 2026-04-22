import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CAH QBank',
  description: 'Paediatric medical question bank',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        {children}
      </body>
    </html>
  )
}
