import type { Metadata, Viewport } from 'next'
import './globals.css'
import InstallAppBanner from '@/components/InstallAppBanner'

export const metadata: Metadata = {
  title: 'E-REPORTS',
  description: 'Examinations, marks and report forms',
  manifest: '/manifest.json',
  icons: {
    icon: '/e-reports-app-icon.svg',
    apple: '/e-reports-app-icon.svg',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <InstallAppBanner />
      </body>
    </html>
  )
}
