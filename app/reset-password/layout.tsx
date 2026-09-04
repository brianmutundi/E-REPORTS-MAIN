import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Reset Password',
  description: 'Set a new password for your E-REPORTS account.',
  alternates: { canonical: '/reset-password' },
  robots: { index: false, follow: true },
  openGraph: {
    type: 'website',
    url: '/reset-password',
    siteName: 'E-REPORTS',
    title: 'Reset Password | E-REPORTS',
    description: 'Set a new password for your E-REPORTS account.',
  },
}

export default function ResetPasswordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
