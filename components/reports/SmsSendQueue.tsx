'use client'

import React, { useState } from 'react'
import { MessageCircle, CheckCircle2 } from 'lucide-react'

export type SmsItem = {
  studentId: string
  admissionNo: string
  fullName: string
  phone: string
  message: string
  href: string
}

function buildParentMessage(item: SmsItem) {
  const lines = item.message.split('\n').map(line => line.trim()).filter(Boolean)
  const overallIndex = lines.findIndex(line => /^Overall:/i.test(line))
  const header = lines[0] ?? ''
  const subjectLines = overallIndex >= 0 ? lines.slice(1, overallIndex) : lines.slice(1)
  const overall = overallIndex >= 0 ? lines[overallIndex] : ''
  const isMidTerm = /mid[ -]?term/i.test(header)
  const periodLabel = isMidTerm ? 'mid-term' : 'assessment'
  const guidance = overall
    ? `Please encourage your child to maintain their strengths while continuing to work on areas that require improvement.`
    : `Please continue supporting your child’s learning and progress.`

  return [
    'Dear Parent/Guardian,',
    '',
    header,
    '',
    `Learner’s Name: ${item.fullName}`,
    `Admission No.: ${item.admissionNo}`,
    '',
    `Your child’s ${periodLabel} assessment results are as follows:`,
    ...subjectLines,
    '',
    overall,
    '',
    guidance,
    '',
    'Thank you for your continued support and partnership in your child’s learning.',
    '',
    'T SCHOOL',
    'Management',
  ].filter((line, index, all) => line !== '' || (index > 0 && index < all.length - 1)).join('\n')
}

export default function SmsSendQueue({ items }: { items: SmsItem[] }) {
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)

  if (!items.length) return null

  const handleSend = (item: SmsItem) => {
    const message = buildParentMessage(item)
    const normalizedPhone = item.phone.replace(/[^0-9+]/g, '')
    const href = `sms:${normalizedPhone}?body=${encodeURIComponent(message)}`
    window.open(href, '_blank')
    setSent(prev => new Set(prev).add(item.studentId))
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 mt-4 no-print">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h4 className="text-sm font-bold text-emerald-900 flex items-center gap-2">
          <MessageCircle className="h-4 w-4" /> SMS to Parents
        </h4>
        <span className="text-xs font-semibold text-emerald-700 tabular-nums">{sent.size} of {items.length} sent</span>
      </div>
      <p className="text-xs text-emerald-800 mb-3">Tap <strong>Send via SMS</strong> to open the messaging app on your phone or computer. Sent status is tracked in this browser only.</p>

      <div className="max-h-[420px] overflow-y-auto divide-y divide-emerald-200/80 rounded-xl border border-emerald-200 bg-white">
        {items.map(item => {
          const isSent = sent.has(item.studentId)
          const isOpen = expanded === item.studentId
          const message = buildParentMessage(item)
          return (
            <div key={item.studentId} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{item.admissionNo}</span>
                    <span className="font-semibold text-slate-900 truncate">{item.fullName}</span>
                  </div>
                  {item.phone ? (
                    <span className="text-xs text-slate-500">{item.phone}</span>
                  ) : (
                    <span className="text-xs text-amber-600 font-medium">No phone number on file</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : item.studentId)}
                    className="text-xs text-slate-500 hover:text-slate-800 font-medium"
                  >
                    {isOpen ? 'Hide' : 'Preview'}
                  </button>
                  <button
                    onClick={() => handleSend(item)}
                    disabled={!item.phone || isSent}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors disabled:pointer-events-none disabled:opacity-50"
                    style={{
                      background: isSent ? '#ecfdf5' : 'white',
                      borderColor: isSent ? '#a7f3d0' : '#d1d5db',
                      color: isSent ? '#047857' : '#334155',
                    }}
                  >
                    {isSent ? <CheckCircle2 className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
                    {isSent ? 'Sent' : 'Send via SMS'}
                  </button>
                </div>
              </div>
              {isOpen && (
                <pre className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-200 max-h-48 overflow-y-auto font-sans">
                  {message}
                </pre>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
