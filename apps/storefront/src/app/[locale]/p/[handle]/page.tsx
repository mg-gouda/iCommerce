import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"
import { Badge, money } from "@icommerce/ui"
import { BuyBox } from "@/components/BuyBox"
import { Gallery } from "@/components/Gallery"
import { Breadcrumbs, Header } from "@/components/Header"
import { VendorMark } from "@/components/VendorMark"
import { Link } from "@/i18n/navigation"
import { compareAtOf, getProduct, isRetail, isVerified, priceOf } from "@/lib/store"

type Props = { params: Promise<{ handle: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProduct((await params).handle)
  return p ? { title: `${p.title} · iCommerce`, description: p.description ?? undefined } : {}
}

export default async function ProductPage({ params }: Props) {
  const p = await getProduct((await params).handle)
  if (!p) notFound()
  const t = await getTranslations("product")
  const region = new Intl.DisplayNames([await getLocale()], { type: "region" })
  const e = p.product_extra
  const v = p.vendor
  const price = priceOf(p)
  const compareAt = compareAtOf(p)
  const retail = isRetail(e)
  const verified = isVerified(v)
  const unit = e?.unit ?? t("unitDefault")
  const cat = p.categories[0]
  const images = p.images.length ? p.images.map((i) => i.url) : [p.thumbnail ?? "/samples/placeholder.svg"]
  const where = [v?.city, v?.country && region.of(v.country.toUpperCase())].filter(Boolean).join(", ")
  const origin = e?.origin_country ? region.of(e.origin_country.toUpperCase()) : null

  const specs: [string, React.ReactNode][] = [
    [t("specHs"), e?.hs_code && <span className="ic-mono" dir="ltr">{e.hs_code}</span>],
    [t("specUnit"), e?.unit],
    [t("specMoq"), e?.min_qty && <bdi>{`${e.min_qty} ${unit}`}</bdi>],
    [t("specStep"), e?.qty_step && <bdi>{`${e.qty_step} ${unit}`}</bdi>],
    [t("specMax"), e?.max_qty && <bdi>{`${e.max_qty} ${unit}`}</bdi>],
    [t("specOrigin"), origin],
    [t("specSku"), p.variants[0]?.sku && <span className="ic-mono" dir="ltr">{p.variants[0].sku}</span>],
    [t("specCategory"), cat?.name],
  ]

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-6 px-4 pt-5 pb-12 md:px-8">
        <Breadcrumbs items={[{ href: "/", label: t("home") }, ...(cat ? [{ href: `/c/${cat.handle}`, label: cat.name }] : []), { label: p.title }]} />

        <article className="flex flex-wrap items-start gap-8">
          <div className="min-w-0 flex-[1_1_480px]">
            <Gallery images={images} alt={p.title} />
          </div>

          <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="ic-row">
                {!retail && <Badge variant="b2b">{t("b2bBadge")}</Badge>}
                {origin && <Badge>{t("madeIn", { country: origin })}</Badge>}
              </div>
              {/* Vendor content shows as written (mostly English); only the chrome is localized. */}
              <h1 dir="auto" className="m-0 text-start text-[24px] leading-[30px] font-semibold text-balance rtl:leading-[36px]">{p.title}</h1>
              {v && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
                  <Link href={`/v/${v.handle}`} className="inline-flex items-center gap-1.5 font-semibold text-ink underline-offset-2 hover:underline">
                    {verified && <ShieldCheck size={16} className="text-brand-ink" role="img" aria-label={t("verified")} />}
                    {v.name}
                  </Link>
                  {verified && <span>{t("verified")}</span>}
                  {where && <span>{where}</span>}
                </div>
              )}
            </div>

            {price != null && (
              <div className="flex flex-wrap items-baseline gap-x-2">
                <bdi className={`text-[24px] leading-[30px] font-semibold tabular-nums ${compareAt ? "text-accent" : ""}`}>{money(price, "USD")}</bdi>
                {compareAt && <s className="text-[14px] text-ink-muted"><bdi>{money(compareAt, "USD")}</bdi></s>}
                <span className="text-[14px] text-ink-muted">/ {unit}</span>
              </div>
            )}
            {/* PriceTiers render once wholesale tier price lists exist (P3); none yet → hidden. */}

            <BuyBox productId={p.id} price={price} unit={e?.unit ?? null} min={e?.min_qty ?? null} step={e?.qty_step ?? null} max={e?.max_qty ?? null} retail={retail} />

            {p.description && (
              <div className="flex flex-col gap-1">
                <h2 className="m-0 text-[16px] leading-[22px] font-semibold">{t("about")}</h2>
                <p dir="auto" className="m-0 max-w-[70ch] text-start whitespace-pre-line text-pretty">{p.description}</p>
              </div>
            )}
          </div>
        </article>

        <section className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
            <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{t("specs")}</h2>
            <div className="overflow-x-auto rounded-md border border-line bg-surface">
              <table className="w-full border-collapse text-[14px]">
                <tbody>
                  {specs.filter(([, val]) => val).map(([k, val]) => (
                    <tr key={k} className="border-b border-line last:border-b-0">
                      <th scope="row" className="w-2/5 px-4 py-2.5 text-start font-medium text-ink-muted">{k}</th>
                      <td className="px-4 py-2.5">{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {v && (
            <aside aria-label={t("supplier")} className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 rounded-lg border border-line bg-surface p-5">
              <div className="flex items-center gap-3">
                <VendorMark name={v.name} logo={v.logo} />
                <div className="min-w-0">
                  <div className="font-semibold">{v.name}</div>
                  {where && <div className="text-[13px] text-ink-muted">{where}</div>}
                </div>
              </div>
              {verified && <div className="ic-row"><Badge variant="verified">{t("verified")}</Badge></div>}
              <Link href={`/v/${v.handle}`} className="ic-btn ic-btn--block no-underline">{t("visitStore")}</Link>
            </aside>
          )}
        </section>
      </main>
    </>
  )
}
