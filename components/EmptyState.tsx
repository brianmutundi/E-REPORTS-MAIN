import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  body?: string
  action?: React.ReactNode
}

/** Shared empty-state block: what's missing, why, and what to do next. */
export default function EmptyState({ icon: Icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {Icon && (
        <span className="empty-state-icon">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <p className="empty-state-title">{title}</p>
      {body && <p className="empty-state-body">{body}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}