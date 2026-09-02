import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
}

/**
 * Primary call-to-action button. Kept as a distinct component for the login
 * surface, but styled by the standard `.btn` design-system layer — no gradient,
 * no animated ring, so the CTA reads as part of the product, not a decoration.
 */
export function ShimmerButton({ children, className, ...props }: ShimmerButtonProps) {
  return (
    <button {...props} className={cn('btn', className)}>
      {children}
    </button>
  )
}