import { redirect } from 'next/navigation'

/**
 * Legacy route kept for bookmarks and older internal links. Broadsheets now live
 * at /dashboard/broadsheets — redirect while preserving the query parameters so
 * deep links (exam/class/stream/student) keep working unchanged.
 */
export default async function ResultsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) qs.set(key, Array.isArray(value) ? value[0] : value)
  }
  const query = qs.toString()
  redirect(`/dashboard/broadsheets${query ? `?${query}` : ''}`)
}