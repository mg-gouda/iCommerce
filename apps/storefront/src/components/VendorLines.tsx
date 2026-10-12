import Image from "next/image"
import type { ReactNode } from "react"
import { useTranslations } from "next-intl"
import { money } from "@icommerce/ui"
import type { StoreVendor } from "@/lib/store"

type Line = { id: string; thumbnail?: string | null; product_title?: string | null; title?: string; quantity: number; unit_price: number }

/** Read-only lines grouped by supplier (checkout summary, confirmation, account). `extra` renders under each group's heading. */
export function VendorLines({ groups, currency, extra }: {
  groups: { vendor: StoreVendor | null; items: Line[] }[]
  currency: string
  extra?: (vendor: StoreVendor | null) => ReactNode
}) {
  const t = useTranslations("cart")
  return (
    <div className="flex flex-col gap-4">
      {groups.map(({ vendor, items }) => (
        <section key={vendor?.handle ?? ""} className="flex flex-col gap-2">
          <h3 className="m-0 text-[14px] leading-[20px] font-semibold">{vendor?.name ?? t("supplier")}</h3>
          {extra?.(vendor)}
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {items.map((l) => (
              <li key={l.id} className="flex items-center gap-3 text-[14px]">
                <Image src={l.thumbnail ?? "/samples/placeholder.svg"} alt="" width={48} height={40} className="h-10 w-12 flex-none rounded-sm object-cover" />
                <span dir="auto" className="min-w-0 flex-1 text-start">
                  {l.product_title ?? l.title} <span className="text-ink-muted">× <bdi className="tabular-nums">{l.quantity}</bdi></span>
                </span>
                <bdi className="tabular-nums">{money(l.unit_price * l.quantity, currency)}</bdi>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
