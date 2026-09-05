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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-emerald-600 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        {children}
        <InstallAppBanner />
      </body>
    </html>
  )
}
