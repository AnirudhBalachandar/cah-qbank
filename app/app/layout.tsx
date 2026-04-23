import type { Metadata } from 'next'
import './globals.css'

import { ToastProvider } from "@/components/ui/toast-provider"

export const metadata: Metadata = {
  title: 'CAH QBank',
  description: 'Single-user paediatrics question bank for local revision',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-canvas text-copy antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
