import type { Metadata } from 'next'
import StructuredData from '@/components/structured-data'

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to E-REPORTS, the school assessment reporting portal.',
  alternates: { canonical: '/login' },
  robots: { index: false, follow: true },
  openGraph: {
    type: 'website',
    url: '/login',
    siteName: 'E-REPORTS',
    title: 'Sign In | E-REPORTS',
    description: 'Sign in to the E-REPORTS school assessment reporting portal.',
  },
}

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <StructuredData />
    </>
  )
}
