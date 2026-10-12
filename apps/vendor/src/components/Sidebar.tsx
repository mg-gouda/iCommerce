"use client"

import { LogOut } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { signOut } from "@/lib/auth-actions"
import { sections } from "@/lib/sections"
import { LocaleSwitch } from "./LocaleSwitch"

export function Sidebar({ store }: { store: string }) {
  const t = useTranslations("nav")
  const locale = useLocale()
  const pathname = usePathname()
  return (
    <aside className="flex flex-col gap-4 bg-navy p-3 text-on-navy md:sticky md:top-0 md:h-dvh md:p-4">
      <div className="flex items-center justify-between gap-2 px-2">
        <span dir="ltr" className="text-[18px] leading-[24px] font-semibold tracking-[-0.01em]">
          i<span className="text-on-navy-muted">Commerce</span>
        </span>
        <span className="text-[12px] leading-4 text-on-navy-muted">{t("portal")}</span>
      </div>
      <nav aria-label={t("label")} className="-mx-1 overflow-x-auto md:mx-0 md:overflow-visible">
        <ul className="m-0 flex list-none gap-1 p-0 md:flex-col">
          {sections.map(([id, Icon]) => {
            const href = id === "dashboard" ? "/dashboard" : `/dashboard/${id}`
            const active = id === "dashboard" ? pathname === href : pathname.startsWith(href)
            return (
              <li key={id}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-[14px] leading-[21px] font-medium whitespace-nowrap text-on-navy-muted no-underline transition-colors duration-150 hover:bg-white/5 hover:text-on-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring aria-[current=page]:bg-white/10 aria-[current=page]:text-on-navy"
                >
                  <Icon size={20} aria-hidden />
                  {t(id)}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-2 md:mt-auto md:flex-col md:items-stretch">
        <p className="m-0 truncate px-2 text-[13px] leading-[18px] text-on-navy-muted" title={store}>{store}</p>
        <div className="flex items-center justify-between gap-2">
          <LocaleSwitch />
          <form action={signOut}>
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] font-medium text-on-navy-muted hover:bg-white/5 hover:text-on-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <LogOut size={16} aria-hidden className="rtl:-scale-x-100" />
              {t("signOut")}
            </button>
          </form>
        </div>
      </div>
    </aside>
  )
}
