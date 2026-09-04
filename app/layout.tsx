import type { Metadata, Viewport } from 'next'
import './globals.css'
import InstallAppBannerLoader from '@/components/InstallAppBannerLoader'

const siteUrl = 'https://e-reports-rho.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'E-REPORTS | Kenyan School Assessment Reports',
    template: '%s | E-REPORTS',
  },
  description:
    'E-REPORTS is a school assessment reporting system for managing examinations, marks, results and assessment reports.',
  applicationName: 'E-REPORTS',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  manifest: '/manifest.json',
  icons: {
    icon: '/e-reports-app-icon.svg',
    apple: '/e-reports-app-icon.svg',
  },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: 'E-REPORTS',
    title: 'E-REPORTS | Kenyan School Assessment Reports',
    description:
      'School assessment reporting for examinations, marks, results and assessment reports.',
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
        <InstallAppBannerLoader />
      </body>
    </html>
  )
}
