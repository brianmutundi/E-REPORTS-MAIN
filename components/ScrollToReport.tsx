'use client'

import { useEffect } from 'react'

/**
 * When a student is selected on the Reports page, the generated report
 * document renders below the (often long) student list. Without auto-scrolling
 * the page would appear unchanged after clicking "View Report", hiding the
 * report and its "Generate PDF" action. This component scrolls the selected
 * report into view whenever the selection changes.
 *
 * The report is rendered client-side (RSC) and can re-lay-out several times
 * while a new student's report streams in, so this keeps scrolling until the
 * report is actually in (and stays in) the viewport before standing down —
 * avoiding both premature stops and fighting the user afterward.
 */
export default function ScrollToReport({ studentId }: { studentId: string | null }) {
  useEffect(() => {
    if (!studentId) return

    let cancelled = false
    let settled = false
    let inViewStreak = 0
    let tries = 0
    let interval: ReturnType<typeof setInterval> | null = null
    let observer: MutationObserver | null = null

    const stop = () => {
      if (cancelled) return
      if (interval) clearInterval(interval)
      if (observer) observer.disconnect()
    }

    const scrollOnce = () => {
      if (cancelled || settled) return
      const report = document.querySelector<HTMLElement>('.report')
      if (!report) {
        inViewStreak = 0
        return
      }
      const rect = report.getBoundingClientRect()
      const inView = rect.top >= -60 && rect.top < window.innerHeight - 80
      if (inView) {
        // Report must stay in view across consecutive polls before we stand
        // down, so a report still settling into its final position doesn't
        // cause a premature stop.
        inViewStreak += 1
        if (inViewStreak >= 2) {
          settled = true
          stop()
        }
        return
      }
      inViewStreak = 0
      report.scrollIntoView({ behavior: 'auto', block: 'start' })
    }

    observer = new MutationObserver(() => scrollOnce())
    observer.observe(document.body, { childList: true, subtree: true })
    interval = setInterval(() => {
      if (tries++ >= 60) stop()
      else scrollOnce()
    }, 250)

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
      if (observer) observer.disconnect()
    }
  }, [studentId])

  return null
}
