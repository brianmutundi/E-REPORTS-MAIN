import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Super Admin',
  description: 'Authenticated E-REPORTS administration workspace.',
  robots: { index: false, follow: false, nocache: true },
}

export default function SuperAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
