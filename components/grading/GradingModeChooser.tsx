'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  currentMode: '4' | '8'
  active: boolean
  selectMode: (mode: '4' | '8') => Promise<void>
}

export default function GradingModeChooser({ currentMode, active, selectMode }: Props) {
  const [confirming, setConfirming] = useState<'4' | '8' | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const applyAndRefresh = async (mode: '4' | '8') => {
    await selectMode(mode)
    setConfirming(null)
    router.replace(`/dashboard/grading?m=${mode}&t=${Date.now()}`)
    router.refresh()
  }

  const cards: { mode: '4' | '8'; title: string; sub: string; levels: string }[] = [
    {
      mode: '4',
      title: '4 Levels',
      sub: 'Broad achievement levels',
      levels: 'EE · ME · AE · BE',
    },
    {
      mode: '8',
      title: '8 Levels',
      sub: 'Actual performance levels (KNEC)',
      levels: 'EE1 · EE2 · ME1 · ME2 · AE1 · AE2 · BE1 · BE2',
    },
  ]

  return (
    <div className="card" style={{ marginTop: 6 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
        }}
      >
        {cards.map((c) => {
          const selected = c.mode === currentMode
          const switching = active && !selected
          return (
            <button
              key={c.mode}
              type="button"
              disabled={pending || selected}
              onClick={() =>
                switching
                  ? setConfirming(c.mode)
                  : startTransition(() => applyAndRefresh(c.mode))
              }
              aria-pressed={selected}
              aria-label={`Select ${c.title} grading system`}
              style={{
                textAlign: 'left',
                padding: '18px 20px',
                borderRadius: 16,
                border: selected ? '2px solid var(--brand)' : '1px solid var(--line)',
                background: selected ? 'var(--brand-soft)' : '#fff',
                boxShadow: selected ? '0 0 0 3px rgba(5,150,105,0.15)' : 'none',
                cursor: selected ? 'default' : 'pointer',
                transition: 'border-color .15s, box-shadow .15s, background .15s',
                opacity: pending ? 0.6 : 1,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>{c.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-soft)', marginTop: 2 }}>{c.sub}</div>
              <div
                style={{
                  marginTop: 10,
                  display: 'inline-flex',
                  flexWrap: 'wrap',
                  gap: 4,
                }}
              >
                {c.levels.split(' · ').map((lv) => (
                  <span
                    key={lv}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 999,
                      background: selected ? 'rgba(5,150,105,0.12)' : 'var(--canvas)',
                      color: selected ? 'var(--brand-strong)' : 'var(--text-soft)',
                    }}
                  >
                    {lv}
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Change grading system"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(15,23,42,0.5)',
          }}
        >
          <div
            className="card"
            style={{ maxWidth: 460, width: '100%', border: '1px solid var(--line)', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Change grading system</h2>
            <p style={{ margin: '10px 0', color: 'var(--text-soft)', fontSize: 14, lineHeight: 1.5 }}>
              Changing the grading system will affect how future assessment results are interpreted
              and displayed. Marks already recorded will be re-interpreted using the new system.
              Continue?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setConfirming(null)}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                disabled={pending}
                onClick={() => startTransition(async () => { await applyAndRefresh(confirming) })}
              >
                {pending ? 'Applying…' : 'Confirm change'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
