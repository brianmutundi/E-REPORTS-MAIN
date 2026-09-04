import type { MetadataRoute } from 'next'

const siteUrl = 'https://e-reports-rho.vercel.app'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteUrl}/login`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ]
}
