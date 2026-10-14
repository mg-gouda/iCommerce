import { useLocale, useTranslations } from "next-intl"
import { bidi, money } from "@icommerce/ui"
import type { PlatformFee } from "@/lib/fee"

/** Platform fee as its own summary row (<dt>/<dd> pair inside a 2-column <dl>): tier label + a short basis note. */
export function FeeRow({ fee, currency }: { fee: PlatformFee; currency: string }) {
  const t = useTranslations("fee")
  const locale = useLocale()
  const m = (n: number) => bidi(money(n, currency))
  const raw = Math.round(fee.subtotal * fee.percent + fee.fixed_amount * 100) / 100
  const clamp = fee.min_fee != null && fee.amount === fee.min_fee && raw < fee.min_fee
    ? t("min", { amount: m(fee.min_fee) })
    : fee.max_fee != null && fee.amount === fee.max_fee && raw > fee.max_fee
      ? t("max", { amount: m(fee.max_fee) })
      : null
  const note = [
    fee.basis === "monthly_volume"
      ? t("volume", { percent: fee.percent, volume: m(fee.base), tier: m(fee.min_amount) })
      : t("orderTotal", { percent: fee.percent }),
    clamp,
  ].filter(Boolean).join(" · ")
  return (
    <>
      <dt className="text-ink-muted">
        {locale === "ar" ? fee.label_ar : fee.label_en}
        <span className="block text-[12px] leading-[16px]">{note}</span>
      </dt>
      <dd className="m-0"><bdi>{money(fee.amount, currency)}</bdi></dd>
    </>
  )
}
