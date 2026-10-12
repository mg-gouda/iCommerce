import { Search, ShieldCheck } from "lucide-react"
import { useTranslations } from "next-intl"
import { getLocale, getTranslations } from "next-intl/server"
import { CartLink } from "@icommerce/ui"
import { Link } from "@/i18n/navigation"
import { setMode } from "@/lib/p3/actions"
import { buyingMode } from "@/lib/p3/mode"
import { countOf, getCart, token } from "@/lib/session"
import { LocaleSwitch } from "./LocaleSwitch"

const Brand = () => (
  <Link href="/" dir="ltr" className="text-[20px] leading-[26px] font-semibold tracking-[-0.01em] text-on-navy no-underline">
    i<span className="text-on-navy-muted">Commerce</span>
  </Link>
)

/** Navy top bar: brand, search (→ /search), account, language, cart (server count); second row: buying mode + RFQ. */
export async function Header({ q }: { q?: string }) {
  const [t, tb, locale, cart, signedIn, { mode }] = await Promise.all([
    getTranslations("home"), getTranslations("b2b"), getLocale(), getCart(), token(), buyingMode(),
  ])
  return (
    <header className="bg-navy text-on-navy">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-8">
        <Brand />
        <form role="search" action={`/${locale}/search`} className="order-last flex min-w-0 basis-full md:order-none md:flex-1 md:basis-auto">
          <label htmlFor="q" className="sr-only">{t("searchLabel")}</label>
          <input id="q" name="q" type="search" defaultValue={q} className="ic-input rounded-e-none" placeholder={t("searchPlaceholder")} />
          <button type="submit" className="ic-btn ic-btn--primary h-[38px] rounded-s-none" aria-label={t("searchLabel")}>
            <Search size={18} aria-hidden />
          </button>
        </form>
        <div className="ms-auto flex items-center gap-4 md:ms-0">
          <Link href={signedIn ? "/account" : "/login"} className="text-[14px] font-medium text-on-navy no-underline hover:underline">
            {signedIn ? t("account") : t("signIn")}
          </Link>
          <LocaleSwitch />
          <CartLink href={`/${locale}/cart`} label={t.raw("cartLabel")} count={countOf(cart)} className="text-on-navy" />
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-2 px-4 py-2 md:px-8">
          {/* Plain form: works without JS; the server sets the mode cookie and moves an open cart to the matching channel. */}
          <form action={setMode} role="group" aria-label={tb("modeLabel")} className="inline-flex gap-0.5 rounded-md bg-white/10 p-0.5">
            {(["retail", "wholesale"] as const).map((m) => (
              <button
                key={m}
                name="mode"
                value={m}
                aria-pressed={mode === m}
                className="min-h-8 cursor-pointer rounded-sm border-0 bg-transparent px-3.5 text-[13px] font-semibold text-on-navy-muted hover:text-on-navy aria-pressed:bg-surface aria-pressed:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                {tb(`mode.${m}`)}
              </button>
            ))}
          </form>
          <nav aria-label={tb("b2bNav")} className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
            <Link href={signedIn ? "/account/rfq" : "/login?next=/account/rfq"} className="text-on-navy-muted no-underline hover:text-on-navy hover:underline">{tb("rfqLink")}</Link>
            {signedIn && <Link href="/account/quotes" className="text-on-navy-muted no-underline hover:text-on-navy hover:underline">{tb("quotesLink")}</Link>}
          </nav>
        </div>
      </div>
    </header>
  )
}

/** Cart / checkout / order bar: brand + a calm "secure checkout" note, no search noise. */
export function CheckoutHeader() {
  const t = useTranslations("cart")
  return (
    <header className="bg-navy text-on-navy">
      <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-4 px-4 py-3 md:px-8">
        <Brand />
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-[13px] text-on-navy-muted">
            <ShieldCheck size={16} aria-hidden />
            {t("secure")}
          </span>
          <LocaleSwitch />
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
