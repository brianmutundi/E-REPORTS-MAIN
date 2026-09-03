'use client'

import { useEffect, useRef } from 'react'

/**
 * When a student is selected on the Reports page, the generated report
 * document renders at the bottom of the page, below the (often long) student
 * list. Without auto-scrolling the page would appear unchanged after clicking
 * "View Report", hiding the report and its "Generate PDF" action. This
 * component scrolls the selected report into view whenever the selection
 * changes.
 */
export default function ScrollToReport({ studentId }: { studentId: string | null }) {
  const lastScrolled = useRef<string | null>(null)

  useEffect(() => {
    if (!studentId) return
    if (lastScrolled.current === studentId) return

    const observer = new MutationObserver(scroll)
    const poll = setInterval(scroll, 400)

    function scroll() {
      const report = document.querySelector<HTMLElement>('.report')
      if (!report) return
      if (lastScrolled.current !== studentId) {
        lastScrolled.current = studentId
        report.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      clearInterval(poll)
      observer.disconnect()
    }

    // React to the report entering the DOM (RSC can commit it well after this
    // effect first runs on a client-side "View Report" click), polling as a
    // fallback; whichever fires first scrolls the report into view exactly once.
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      clearInterval(poll)
      observer.disconnect()
    }
  }, [studentId])

  return null
}
