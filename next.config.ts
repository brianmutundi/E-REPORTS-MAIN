import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // pdfkit/@react-pdf/renderer load their standard fonts (e.g.
  // pdfkit/js/standard-fonts/Helvetica.cjs) at runtime via a dynamic require
  // that Next.js's static trace cannot see. On Vercel serverless this left the
  // font files out of the bundle, so every PDF export (/api/reports/pdf,
  // /api/results/export/pdf, /api/analysis/export/pdf, /api/students/export/pdf)
  // crashed with MODULE_NOT_FOUND. Keeping these modules external deploys their
  // full node_modules tree (fonts included) and the includes below force the
  // font directory into the traced function output as a belt-and-suspenders.
  serverExternalPackages: ['@react-pdf/renderer', 'pdfkit'],
  outputFileTracingIncludes: {
    '/api/reports/pdf': ['./node_modules/pdfkit/js/standard-fonts/**/*'],
    '/api/results/export/pdf': ['./node_modules/pdfkit/js/standard-fonts/**/*'],
    '/api/analysis/export/pdf': ['./node_modules/pdfkit/js/standard-fonts/**/*'],
    '/api/students/export/pdf': ['./node_modules/pdfkit/js/standard-fonts/**/*'],
  },
  async headers() {
    const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
      : 'oakznwbqzcbxzkemvoce.supabase.co'
    return [
      {
        // Apply security headers to every response.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next.js App Router hydration scripts + inline styles. The app
              // uses inline `style={{}}` props and no external font/CSS CDNs,
              // so 'unsafe-inline' is required for scripts/styles to function.
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              `img-src 'self' data: blob: https://${supabaseHost}`,
              `media-src 'self' https://${supabaseHost}`,
              `connect-src 'self' https://${supabaseHost}`,
              `font-src 'self' data:`,
              `object-src 'none'`,
              `base-uri 'self'`,
              `frame-ancestors 'none'`,
              `form-action 'self'`,
              `worker-src 'self' blob:`,
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
