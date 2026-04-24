import type { Metadata } from 'next'
import './globals.css'

import { ThemeProvider } from "@/components/theme-provider"
import { ToastProvider } from "@/components/ui/toast-provider"

export const metadata: Metadata = {
  title: 'CAH QBank',
  description: 'Single-user paediatrics question bank for local revision',
}

const themeInitScript = `
(function() {
  try {
    var theme = window.localStorage.getItem('cah-qbank-theme');
    theme = theme === 'dark' ? 'dark' : 'light';
    var root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
  } catch (_) {}
})();
`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-canvas text-copy antialiased">
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
