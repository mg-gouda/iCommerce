import type { ReactNode } from "react"

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="m-0 text-[30px] leading-[36px] font-semibold tracking-[-0.01em] text-balance">{title}</h1>
        {sub && <p className="m-0 mt-1 max-w-[70ch] text-ink-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** Surface panel for forms and tables. */
export const panel = "rounded-lg border border-line bg-surface p-4 md:p-6"
