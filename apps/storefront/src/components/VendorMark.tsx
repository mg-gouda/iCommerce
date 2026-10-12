import Image from "next/image"

/** Vendor logo, or initials on navy when there is none. */
export function VendorMark({ name, logo, size = 48 }: { name: string; logo: string | null; size?: number }) {
  if (logo) return <Image src={logo} alt="" width={size} height={size} className="flex-none rounded-md border border-line object-cover" style={{ width: size, height: size }} />
  const initials = name.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
  return (
    <span aria-hidden className="grid flex-none place-items-center rounded-md bg-navy font-semibold text-on-navy" style={{ width: size, height: size }} dir="ltr">
      {initials}
    </span>
  )
}
