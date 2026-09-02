'use client'

import { Download } from 'lucide-react'

export default function PrintButton({ href }: { href: string }) {
  return <a className="btn" href={href} download><Download size={17}/>Generate PDF</a>
}
