"use client"

import { useLocale } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"

const labels = { en: ["EN", "English"], ar: ["AR", "العربية"] } as const

export function LocaleSwitch({ className }: { className?: string }) {
  const pathname = usePathname()
  const current = useLocale()
  return (
    <nav className={`flex gap-1 ${className ?? ""}`} aria-label="Language / اللغة">
      {(Object.keys(labels) as (keyof typeof labels)[]).map((l) => (
        <Link
          key={l}
          href={pathname}
          locale={l}
          lang={l}
          aria-label={labels[l][1]}
          aria-current={l === current ? "true" : undefined}
          className="rounded-sm px-2 py-1 text-[13px] font-medium text-on-navy-muted no-underline hover:text-on-navy aria-[current=true]:bg-white/10 aria-[current=true]:text-on-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {labels[l][0]}
        </Link>
      ))}
    </nav>
  )
}
