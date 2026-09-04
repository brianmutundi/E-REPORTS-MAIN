import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Password Recovery',
  description: 'Recover access to your E-REPORTS account.',
  alternates: { canonical: '/forgot-password' },
  robots: { index: false, follow: true },
  openGraph: {
    type: 'website',
    url: '/forgot-password',
    siteName: 'E-REPORTS',
    title: 'Password Recovery | E-REPORTS',
    description: 'Recover access to your E-REPORTS account.',
  },
}

export default function ForgotPasswordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
