import type { HTMLAttributes } from "react"
import { Check, CircleAlert, Clock, ShieldCheck, type LucideIcon } from "lucide-react"
import { cx } from "./cx"

type Variant = "neutral" | "verified" | "b2b" | "sale" | "success" | "warning" | "danger"

// Status is never color alone: trust + state variants carry their icon.
const icons: Partial<Record<Variant, LucideIcon>> = {
  verified: ShieldCheck,
  success: Check,
  warning: Clock,
  danger: CircleAlert,
}

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & { variant?: Variant }

export function Badge({ variant = "neutral", className, children, ...props }: BadgeProps) {
  const Icon = icons[variant]
  return (
    <span className={cx("ic-badge", variant !== "neutral" && `ic-badge--${variant}`, className)} {...props}>
      {Icon && <Icon aria-hidden strokeWidth={2.2} />}
      {children}
    </span>
  )
}
