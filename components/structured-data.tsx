export default function StructuredData() {
  const graph = [
    {
      '@type': 'Organization',
      '@id': 'https://e-reports-rho.vercel.app/#organization',
      name: 'E-REPORTS',
      url: 'https://e-reports-rho.vercel.app/',
    },
    {
      '@type': 'WebSite',
      '@id': 'https://e-reports-rho.vercel.app/#website',
      name: 'E-REPORTS',
      url: 'https://e-reports-rho.vercel.app/',
      publisher: { '@id': 'https://e-reports-rho.vercel.app/#organization' },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://e-reports-rho.vercel.app/#software',
      name: 'E-REPORTS',
      url: 'https://e-reports-rho.vercel.app/',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      description:
        'School assessment reporting for examinations, marks, results and assessment reports.',
      publisher: { '@id': 'https://e-reports-rho.vercel.app/#organization' },
    },
  ]

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }) }}
    />
  )
}
