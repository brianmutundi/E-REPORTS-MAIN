'use client'

import dynamic from 'next/dynamic'

const InstallAppBanner = dynamic(() => import('@/components/InstallAppBanner'))

export default function InstallAppBannerLoader() {
  return <InstallAppBanner />
}
