import type React from 'react'
import type { Metadata, Viewport } from 'next'
import './globals.css'

import AppShell from '@/components/AppShell'
import AuthProvider from '@/app/providers/AuthProvider'
import { ThemeProvider } from '@/lib/theme'

export const metadata: Metadata = {
  title: 'VoiceTracker',
  description: 'Suivi intelligent de dépenses par reconnaissance vocale',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <ThemeProvider>
            <AppShell>{children}</AppShell>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
