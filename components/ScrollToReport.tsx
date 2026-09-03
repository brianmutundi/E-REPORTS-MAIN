'use client'

import { useEffect } from 'react'

/**
 * When a student is selected on the Reports page, the generated report
 * document renders below the (often long) student list. Without auto-scrolling
 * the page would appear unchanged after clicking "View Report", hiding the
 * report and its "Generate PDF" action. This component scrolls the selected
 * report into view, re-attempting whenever the selection changes and keeping
 * the report in view even while it re-renders.
 */
export default function ScrollToReport({ studentId }: { studentId: string | null }) {
  useEffect(() => {
    if (!studentId) return

    let cancelled = false
    let settled = false
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
      if (!report) return
      const rect = report.getBoundingClientRect()
      const inView = rect.top >= -60 && rect.top < window.innerHeight - 80
      if (inView) {
        // Nudge to the very top once (report header + Generate PDF button).
        if (rect.top > 160) report.scrollIntoView({ behavior: 'smooth', block: 'start' })
        settled = true
        stop()
        return
      }
      report.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    // The report can enter the DOM/move well after this effect first runs on a
    // client-side "View Report" click (RSC) and can keep re-rendering while a
    // new student's report streams in. React to mutations and poll as a
    // fallback, converging on the report being in the viewport before stopping.
    observer = new MutationObserver(() => scrollOnce())
    observer.observe(document.body, { childList: true, subtree: true })
    interval = setInterval(() => {
      if (tries++ >= 40) stop()
      else scrollOnce()
    }, 300)

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
      if (observer) observer.disconnect()
    }
  }, [studentId])

  return null
}
