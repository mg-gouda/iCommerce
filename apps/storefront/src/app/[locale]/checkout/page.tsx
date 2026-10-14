import type { ReactNode } from "react"
import { Check } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"
import { bidi, money } from "@icommerce/ui"
import { AddressForm, EmailForm, PaymentForm, PlaceOrderForm, ShippingForm } from "@/components/CheckoutForms"
import { CheckoutHeader } from "@/components/Header"
import { VendorLines } from "@/components/VendorLines"
import { Link, redirect } from "@/i18n/navigation"
import { payKind, paymentProviders, shippingGroups } from "@/lib/checkout"
import { AddressLines } from "@/components/AddressLines"
import { netTerms } from "@/lib/p3/terms"
import { getCart, getCustomer } from "@/lib/session"
import { byVendor, productsById } from "@/lib/store"
import { FeeRow } from "@/components/FeeRow"
import { feeOf } from "@/lib/fee"

const STEPS = ["email", "address", "shipping", "payment", "review"] as const
type Step = (typeof STEPS)[number]

type Props = { searchParams: Promise<{ edit?: string }> }

/** One page, progressive sections: finished ones collapse to a summary + "Change"; the first unfinished one is open. */
export default async function CheckoutPage({ searchParams }: Props) {
  const locale = await getLocale()
  const cart = await getCart()
  if (!cart?.items?.length) redirect({ href: "/cart", locale })
  const c = cart!
  const t = await getTranslations("checkout")
  const [groups, providers, customer, products] = await Promise.all([
    shippingGroups(c.id),
    paymentProviders(c.region_id!),
    getCustomer(),
    productsById(c.items!.map((i) => i.product_id)),
  ])
  // Net terms: the backend lists the provider only to eligible members; a company with a credit account it hides
  // (on hold / overdue) still gets a disabled row saying why. Over-limit → listed but greyed out here.
  const net = await netTerms(c.total)
  const NET = "pp_net-terms_net-terms"
  const offered = [...providers.filter((id) => payKind(id) !== "net" || net), ...(net?.refusal && !providers.includes(NET) ? [NET] : [])]
  const currency = c.currency_code.toUpperCase()
  const fee = feeOf(c.items)
  const a = c.shipping_address
  const session = c.payment_collection?.payment_sessions?.[0]

  const done: Record<Step, boolean> = {
    email: !!c.email,
    address: !!a?.address_1,
    shipping: groups.length > 0 && groups.every((g) => g.selected),
    payment: !!session,
    review: false,
  }
  const edit = (await searchParams).edit as Step | undefined
  const first = STEPS.find((s) => !done[s])!
  // Can't jump ahead: "?edit=" only reopens a step whose predecessors are done.
  const open = edit && STEPS.indexOf(edit) <= STEPS.indexOf(first) ? edit : first

  const saved = customer?.addresses?.[0]
  const address = { ...(saved ?? {}), ...(a?.address_1 ? a : {}) } as Record<string, string | null>
  const chosen = groups.map((g) => ({ g, o: g.options.find((o) => o.id === g.selected) }))

  const summaries: Record<Step, ReactNode> = {
    email: <bdi dir="ltr">{c.email}</bdi>,
    address: a && <AddressLines a={a} locale={locale} />,
    shipping: (
      <ul className="m-0 list-none p-0">
        {chosen.map(({ g, o }) => (
          <li key={g.profileId}>
            <bdi>{g.vendor?.name ?? t("supplier")}</bdi>: <bdi>{o?.name}</bdi> · <bdi>{o && money(o.amount, currency)}</bdi>
          </li>
        ))}
      </ul>
    ),
    payment: session && t(`pay.${payKind(session.provider_id) ?? "cod"}`, { n: net?.days ?? 30 }),
    review: null,
  }

  const forms: Record<Step, ReactNode> = {
    email: <EmailForm email={c.email ?? customer?.email} />,
    address: <AddressForm address={address} />,
    shipping: groups.length ? (
      <ShippingForm groups={groups} currency={currency} />
    ) : (
      <p role="alert" className="ic-error m-0">{t("noShipping")}</p>
    ),
    payment: (
      <PaymentForm
        providers={offered.map((id) => ({ id, kind: payKind(id)! }))}
        selected={session?.provider_id}
        net={net && { ...net, available: bidi(money(net.available, currency)) }}
      />
    ),
    review: (
      <div className="flex flex-col gap-4">
        <VendorLines groups={byVendor(c.items!, products)} currency={currency} />
        {fee && (
          <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 border-t border-line pt-3 text-[14px] tabular-nums">
            <FeeRow fee={fee} currency={currency} />
          </dl>
        )}
        <PlaceOrderForm label={t("place", { total: bidi(money(c.total, currency)) })} />
      </div>
    ),
  }

  return (
    <>
      <CheckoutHeader />
      <main className="mx-auto flex max-w-[1360px] flex-wrap items-start gap-6 px-4 pt-8 pb-12 md:px-8">
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="m-0 text-[24px] leading-[30px] font-semibold rtl:leading-[36px]">{t("title")}</h1>
            <Link href="/cart" className="text-[14px] text-brand-ink underline underline-offset-2">{t("editCart")}</Link>
          </div>
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {STEPS.map((s, i) => {
              const isOpen = s === open
              const finished = done[s] && !isOpen
              const locked = !isOpen && !finished
              return (
                <li key={s} aria-current={isOpen ? "step" : undefined} className={`rounded-lg border bg-surface p-4 md:p-6 ${isOpen ? "border-line-strong" : "border-line"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className={`m-0 flex items-center gap-3 text-[16px] leading-[22px] font-semibold ${locked ? "text-ink-muted" : ""}`}>
                      <span aria-hidden className={`grid size-7 flex-none place-items-center rounded-full text-[13px] ${finished ? "bg-success text-surface" : isOpen ? "bg-brand text-on-brand" : "border border-line-strong"}`}>
                        {finished ? <Check size={16} /> : i + 1}
                      </span>
                      {t(`step.${s}`)}
                      {finished && <span className="sr-only">{t("stepDone")}</span>}
                    </h2>
                    {finished && s !== "review" && (
                      <Link href={`/checkout?edit=${s}`} className="text-[14px] text-brand-ink underline underline-offset-2" aria-label={t("changeStep", { step: t(`step.${s}`) })}>
                        {t("change")}
                      </Link>
                    )}
                  </div>
                  {finished && <div className="mt-2 ps-10 text-[14px] text-ink-muted">{summaries[s]}</div>}
                  {isOpen && <div className="mt-4">{forms[s]}</div>}
                </li>
              )
            })}
          </ol>
        </div>

        <aside aria-label={t("summary")} className="flex min-w-0 flex-[1_1_360px] flex-col gap-3.5 rounded-lg border border-line bg-surface p-6 lg:sticky lg:top-6">
          <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{t("summary")}</h2>
          <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 text-[14px] tabular-nums">
            <dt className="text-ink-muted">{t("subtotal")}</dt>
            <dd className="m-0"><bdi>{money((c.item_subtotal ?? 0) - (fee?.amount ?? 0), currency)}</bdi></dd>
            <dt className="text-ink-muted">{t("shipping")}</dt>
            <dd className="m-0">{done.shipping ? <bdi>{money(c.shipping_total ?? 0, currency)}</bdi> : t("nextStep")}</dd>
            {fee && <FeeRow fee={fee} currency={currency} />}
          </dl>
          <div className="flex items-baseline justify-between border-t border-line pt-3.5">
            <span className="font-semibold">{t("total")}</span>
            <bdi className="text-[24px] leading-[30px] font-semibold tabular-nums">{money(c.total, currency)}</bdi>
          </div>
        </aside>
      </main>
    </>
  )
}
