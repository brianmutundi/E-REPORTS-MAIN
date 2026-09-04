import type { MetadataRoute } from 'next'

const siteUrl = 'https://e-reports-rho.vercel.app'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: 'OAI-SearchBot',
        allow: '/',
        disallow: ['/dashboard/', '/super-admin/', '/api/'],
      },
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard/', '/super-admin/', '/api/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
