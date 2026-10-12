import { getLocale, getTranslations } from "next-intl/server"
import { AddAddressForm } from "@/components/AddAddressForm"
import { deleteAddress } from "@/lib/account-actions"
import { governorate } from "@/lib/governorates"
import { getCustomer } from "@/lib/session"

export default async function AddressesPage() {
  const [t, locale, customer] = await Promise.all([getTranslations("account"), getLocale(), getCustomer()])
  const addresses = customer?.addresses ?? []
  return (
    <div className="flex flex-wrap items-start gap-6">
      <section className="flex min-w-0 flex-[1_1_360px] flex-col gap-3">
        <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{t("addresses")}</h2>
        {!addresses.length && <p className="m-0 text-ink-muted">{t("noAddresses")}</p>}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {addresses.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line bg-surface p-4 text-[14px]">
              <span className="flex flex-col">
                <b>{a.first_name} {a.last_name}</b>
                <span>{[a.address_1, a.address_2].filter(Boolean).join(", ")}</span>
                <span>{a.city}, {governorate(a.province, locale)}</span>
                <bdi dir="ltr" className="text-start text-ink-muted">{a.phone}</bdi>
              </span>
              <form action={deleteAddress}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className="ic-btn ic-btn--ghost ic-btn--sm" aria-label={t("deleteAddress", { name: `${a.address_1}, ${a.city}` })}>
                  {t("delete")}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[13px] text-ink-muted">{t("addressNote")}</p>
      </section>
      <section className="flex min-w-0 flex-[2_1_480px] flex-col gap-3 rounded-lg border border-line bg-surface p-4 md:p-6">
        <h2 className="m-0 text-[16px] leading-[22px] font-semibold">{t("addAddress")}</h2>
        <AddAddressForm />
      </section>
    </div>
  )
}
