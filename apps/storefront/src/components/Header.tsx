import { Search } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { CartLink } from "@icommerce/ui"
import { Link } from "@/i18n/navigation"
import { LocaleSwitch } from "./LocaleSwitch"

/** Navy top bar: brand, search (→ /search), sign in, language, cart. */
export function Header({ q }: { q?: string }) {
  const t = useTranslations("home")
  const locale = useLocale()
  return (
    <header className="bg-navy text-on-navy">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-8">
        <Link href="/" dir="ltr" className="text-[20px] leading-[26px] font-semibold tracking-[-0.01em] text-on-navy no-underline">
          i<span className="text-on-navy-muted">Commerce</span>
        </Link>
        <form role="search" action={`/${locale}/search`} className="order-last flex min-w-0 basis-full md:order-none md:flex-1 md:basis-auto">
          <label htmlFor="q" className="sr-only">{t("searchLabel")}</label>
          <input id="q" name="q" type="search" defaultValue={q} className="ic-input rounded-e-none" placeholder={t("searchPlaceholder")} />
          <button type="submit" className="ic-btn ic-btn--primary h-[38px] rounded-s-none" aria-label={t("searchLabel")}>
            <Search size={18} aria-hidden />
          </button>
        </form>
        <div className="ms-auto flex items-center gap-4 md:ms-0">
          <Link href="/login" className="text-[14px] font-medium text-on-navy no-underline hover:underline">{t("signIn")}</Link>
          <LocaleSwitch />
          <CartLink href={`/${locale}/cart`} label={t.raw("cartLabel")} initialCount={2} className="text-on-navy" />
        </div>
      </div>
    </header>
  )
}

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  const t = useTranslations("nav")
  return (
    <nav aria-label={t("breadcrumb")} className="text-[13px] text-ink-muted">
      <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {items.map((it, i) => (
          <li key={i} className="flex gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {it.href ? <Link href={it.href} className="text-brand-ink underline underline-offset-2">{it.label}</Link> : <span aria-current="page">{it.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  )
}
