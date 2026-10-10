import type { ButtonHTMLAttributes } from "react"
import { cx } from "./cx"

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger"
  size?: "sm" | "md" | "lg"
  block?: boolean
  busy?: boolean
}

export function Button({ variant = "secondary", size = "md", block, busy, className, ...props }: ButtonProps) {
  return (
    <button
      aria-busy={busy || undefined}
      className={cx(
        "ic-btn",
        variant !== "secondary" && `ic-btn--${variant}`,
        size !== "md" && `ic-btn--${size}`,
        block && "ic-btn--block",
        className
      )}
      {...props}
    />
  )
}
