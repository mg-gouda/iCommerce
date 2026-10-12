import type { Metadata } from "next"
import Image from "next/image"
import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { Badge } from "@icommerce/ui"
import { Breadcrumbs, Header } from "@/components/Header"
import { ProductGrid, tileFromDoc } from "@/components/ProductGrid"
import { VendorMark } from "@/components/VendorMark"
import { searchProducts } from "@/lib/search"
import { getVendor, isVerified } from "@/lib/store"

type Props = { params: Promise<{ handle: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = await getVendor((await params).handle)
  return v ? { title: `${v.name} · iCommerce`, description: v.description ?? undefined } : {}
}

export default async function VendorPage({ params }: Props) {
  const v = await getVendor((await params).handle)
  if (!v) notFound()
  const t = await getTranslations("vendor")
  const region = new Intl.DisplayNames([await getLocale()], { type: "region" })
  // Store API can't filter by vendor; the search index can (published products only).
  const { hits, total } = await searchProducts({ vendor: v.handle, limit: 60 })
  const where = [v.city, v.country && region.of(v.country.toUpperCase())].filter(Boolean).join(", ")

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-6 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ href: "/", label: t("home") }, { label: v.name }]} />
        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          {v.banner && (
            <div className="relative aspect-[4/1] max-h-64 w-full bg-ground">
              <Image src={v.banner} alt="" fill sizes="100vw" className="object-cover" priority />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4 p-5 md:p-6">
            <VendorMark name={v.name} logo={v.logo} size={64} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h1 className="m-0 text-[24px] leading-[30px] font-semibold rtl:leading-[36px]">{v.name}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
                {isVerified(v) && <Badge variant="verified">{t("verified")}</Badge>}
                {where && <span>{where}</span>}
                <span>{t("products", { count: total })}</span>
              </div>
            </div>
          </div>
          {v.description && <p dir="auto" className="m-0 text-start max-w-[70ch] px-5 pb-5 whitespace-pre-line text-pretty md:px-6 md:pb-6">{v.description}</p>}
        </section>
        <section aria-labelledby="vp" className="flex flex-col gap-4">
          <h2 id="vp" className="m-0 text-[20px] leading-[26px] font-semibold">{t("catalog")}</h2>
          {hits.length ? <ProductGrid tiles={hits.map(tileFromDoc)} /> : <p className="m-0 text-ink-muted">{t("empty")}</p>}
        </section>
      </main>
    </>
  )
}
