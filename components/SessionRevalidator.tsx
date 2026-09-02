'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Event-driven session + data revalidation when the user returns to this tab
 * after being away.
 *
 * Why this exists
 * ---------------
 * The dashboard pages are server components, so their data is fetched on every
 * server render. But when a user switches away to another tab/app for minutes
 * and comes back, the browser keeps the current React tree mounted and does NOT
 * re-run those server renders — so the page shows whatever was last fetched,
 * which can be stale (another user changed marks/results in the meantime) and
 * the session token may have expired while the tab was suspended.
 *
 * What it does (and does NOT do)
 * ------------------------------
 * On a hidden -> visible / focus / pageshow transition (i.e. returning after
 * having been away), and subject to a cooldown so it can never spam:
 *   1. Revalidates the Supabase session (refreshing a merely-expired access
 *      token and updating auth cookies). If the session is genuinely gone it
 *      sends the user to /login via the app's own auth — never a forced reload.
 *   2. If the session is still valid, calls router.refresh() so the CURRENT
 *      page's server components re-fetch fresh data. This preserves the URL
 *      (so every Grade / Stream / Assessment / Learning Area selection is kept)
 *      and preserves React/client state (so unsaved score-entry input and other
 *      in-progress work is not destroyed).
 *
 * It deliberately does NOT poll, does not reload the whole page, and does not
 * fire while the page is actively being used — only when returning to it after
 * being hidden. This keeps multi-user concurrent edits safe: it only refreshes
 * what the server reads, and never writes.
 */
export default function SessionRevalidator() {
  const router = useRouter()

  // Tracks when we last asked the server to revalidate, so repeated focus
  // events while the tab is just sitting in front of the user never trigger
  // back-to-back refreshes.
  const lastRevalidate = useRef(0)
  const wasHidden = useRef(false)

  useEffect(() => {
    const supabase = createClient(true)
    const MIN_INTERVAL_MS = 60_000

    const revalidate = () => {
      const now = Date.now()
      if (now - lastRevalidate.current < MIN_INTERVAL_MS) return
      lastRevalidate.current = now

      // 1. Ensure the client session is current. getSession() rehydrates from
      //    local storage and refreshes an expired access token, updating the
      //    auth cookies the server middleware/guard reads.
      void supabase.auth.getSession().then(({ data }) => {
        if (!data.session) {
          // Session genuinely gone/expired beyond refresh — route through the
          // app's own entry point. router.replace triggers the middleware guard.
          router.replace('/login')
          return
        }
        // 2. Session valid — re-fetch the current page's server data, keeping
        //    the URL (selections) and client state (unsaved input) intact.
        router.refresh()
      })
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        wasHidden.current = true
        return
      }
      // visible: we returned after having been hidden
      if (wasHidden.current) {
        revalidate()
        wasHidden.current = false
      }
    }

    // bfcache restore (back/forward cache) — the tab was fully preserved by the
    // browser, so treat it like returning from being away.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) revalidate()
    }

    // Focus returning to the window (e.g. switching back from another app) —
    // only refresh if we had previously observed the page go hidden, with the
    // cooldown above preventing any spam.
    const onFocus = () => {
      if (wasHidden.current) {
        revalidate()
        wasHidden.current = false
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('focus', onFocus)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('focus', onFocus)
    }
  }, [router])

  return null
}
