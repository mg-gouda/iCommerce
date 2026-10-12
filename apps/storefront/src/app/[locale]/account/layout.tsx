import type { ReactNode } from "react"
import { getLocale, getTranslations } from "next-intl/server"
import { Header } from "@/components/Header"
import { Link, redirect } from "@/i18n/navigation"
import { signOut } from "@/lib/account-actions"
import { getCustomer } from "@/lib/session"

/** Signed-in area: expired / missing session → sign in, then back here. */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  const customer = await getCustomer()
  if (!customer) redirect({ href: "/login?next=/account", locale })
  const t = await getTranslations("account")
  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-6 px-4 pt-8 pb-12 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
          <div>
            <h1 className="m-0 text-[24px] leading-[30px] font-semibold rtl:leading-[36px]">{t("title")}</h1>
            <p className="m-0 text-[14px] text-ink-muted">
              {customer!.first_name} {customer!.last_name} · <bdi dir="ltr">{customer!.email}</bdi>
            </p>
          </div>
          <nav aria-label={t("title")} className="flex flex-wrap items-center gap-2">
            <Link href="/account" className="ic-btn ic-btn--ghost ic-btn--sm no-underline">{t("orders")}</Link>
            <Link href="/account/addresses" className="ic-btn ic-btn--ghost ic-btn--sm no-underline">{t("addresses")}</Link>
            <form action={signOut}>
              <input type="hidden" name="locale" value={locale} />
              <button type="submit" className="ic-btn ic-btn--sm">{t("signOut")}</button>
            </form>
          </nav>
        </div>
        {children}
      </main>
    </>
  )
}
