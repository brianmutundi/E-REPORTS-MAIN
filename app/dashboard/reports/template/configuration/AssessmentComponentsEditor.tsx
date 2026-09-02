'use client'

import { useState } from 'react'
import type { AssessmentComponents } from '@/lib/report-template'

const labels: { key: keyof AssessmentComponents; label: string }[] = [
  { key: 'midTerm', label: 'Mid Term' },
  { key: 'endTerm', label: 'End Term' },
  { key: 'average', label: 'Average' },
]

export default function AssessmentComponentsEditor({ initial }: { initial: AssessmentComponents }) {
  const [value, setValue] = useState(initial)
  const enabledCount = Object.values(value).filter(Boolean).length

  return (
    <div className="assessment-components">
      <div className="assessment-options">
        {labels.map(({ key, label }) => (
          <label className="toggle-row" key={key}>
            <span>{label}</span>
            <input
              type="checkbox"
              checked={value[key]}
              onChange={(event) => setValue((current) => ({ ...current, [key]: event.target.checked }))}
            />
          </label>
        ))}
      </div>

      <input type="hidden" name="assessment_mid_term" value={value.midTerm ? 'on' : ''} />
      <input type="hidden" name="assessment_end_term" value={value.endTerm ? 'on' : ''} />
      <input type="hidden" name="assessment_average" value={value.average ? 'on' : ''} />

      {enabledCount === 0 && (
        <div className="notice error" style={{ marginTop: 12 }}>
          Select at least one assessment component before saving.
        </div>
      )}

      <div className="assessment-preview" aria-live="polite">
        <div className="muted" style={{ marginBottom: 8 }}>Live preview</div>
        <div className="assessment-preview-table">
          <span>Assessment</span>
          {value.midTerm && <span>Mid Term</span>}
          {value.endTerm && <span>End Term</span>}
          {value.average && <span>Average</span>}
        </div>
        {enabledCount === 0 && <p className="muted" style={{ marginTop: 8 }}>No assessment columns selected.</p>}
      </div>
    </div>
  )
}
