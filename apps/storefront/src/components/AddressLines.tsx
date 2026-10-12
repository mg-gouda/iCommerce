import { governorate } from "@/lib/governorates"

type A = { first_name?: string | null; last_name?: string | null; address_1?: string | null; address_2?: string | null; city?: string | null; province?: string | null; phone?: string | null }

/** Buyer-typed parts are isolated (<bdi dir=auto>) so Latin street names don't scramble inside Arabic UI and vice versa. */
export function AddressLines({ a, locale }: { a: A; locale: string }) {
  const sep = locale === "ar" ? "، " : ", "
  const parts = (xs: (string | null | undefined)[]) =>
    xs.filter(Boolean).map((x, i) => (
      <span key={i}>
        {i > 0 && sep}
        <bdi dir="auto">{x}</bdi>
      </span>
    ))
  return (
    <>
      <span className="block">{parts([[a.first_name, a.last_name].filter(Boolean).join(" ")])}</span>
      <span className="block">{parts([a.address_1, a.address_2])}</span>
      <span className="block">{parts([a.city, governorate(a.province, locale)])}</span>
      {a.phone && (
        <span className="block">
          <bdi dir="ltr">{a.phone}</bdi>
        </span>
      )}
    </>
  )
}
