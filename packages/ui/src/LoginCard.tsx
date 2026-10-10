import type { FormHTMLAttributes, ReactNode } from "react"
import { cx } from "./cx"

export type LoginCardProps = FormHTMLAttributes<HTMLFormElement> & {
  sub: ReactNode
  /** Links row under the submit button (reset, sign up). */
  meta?: ReactNode
}

/** Sign-in screen: compact glass card on black abstract backdrop (art blurred 10px). Always dark. */
export function LoginCard({ sub, meta, children, className, ...form }: LoginCardProps) {
  return (
    <div className={cx("ic-root ic-login", className)}>
      <svg className="ic-login__art" viewBox="0 0 960 520" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <circle cx="210" cy="140" r="210" fill="var(--navy)" />
        <circle cx="760" cy="420" r="150" fill="var(--brand)" opacity=".55" />
        <circle cx="560" cy="90" r="90" fill="var(--brand-ink)" opacity=".35" />
        <g fill="none" stroke="var(--brand)" strokeWidth="1.5" opacity=".45">
          <path d="M-20 360 C 220 260, 420 470, 980 300" />
          <path d="M-20 400 C 260 300, 460 510, 980 340" />
          <path d="M-20 440 C 300 340, 500 550, 980 380" />
        </g>
      </svg>
      <form className="ic-login__card" {...form}>
        <div>
          <div className="ic-login__brand" dir="ltr">
            i<span>Commerce</span>
          </div>
          <p className="ic-login__sub">{sub}</p>
        </div>
        {children}
        {meta && <div className="ic-login__meta">{meta}</div>}
      </form>
    </div>
  )
}
