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

export default function SmsSendQueue({ items }: { items: SmsItem[] }) {
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)

  if (!items.length) return null

  const handleSend = (item: SmsItem) => {
    window.open(item.href, '_blank')
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
                  {item.message}
                </pre>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}