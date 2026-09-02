import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
