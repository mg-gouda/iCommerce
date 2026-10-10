// ponytail: P0 placeholder data; replaced by Medusa store API (@icommerce/sdk) in P1.
type L = { en: string; ar: string }

export type MockProduct = {
  id: string
  mode: "b2c" | "b2b"
  image: string
  imageAlt: L
  vendor: L
  verified?: boolean
  title: L
  price: number
  priceMax?: number
  compareAt?: number
  unit?: L
  moq?: L
  lead?: L
  ships?: L
}

export const products: MockProduct[] = [
  {
    id: "kilim-mamlouky",
    mode: "b2c",
    image: "/samples/kilim-rug.jpg",
    imageAlt: { en: "Kilim wool rug, Mamlouky pattern", ar: "سجادة كليم صوف بنقشة مملوكية" },
    vendor: { en: "Nile Flowers Handcrafts", ar: "نايل فلاورز للمشغولات اليدوية" },
    title: { en: "Kilim wool rug, Mamlouky NF88, 1.5 × 2 m", ar: "سجادة كليم صوف، مملوكي NF88، ١٫٥ × ٢ م" },
    price: 152,
    compareAt: 179,
    ships: { en: "Ships in 5–7 days", ar: "الشحن خلال ٥–٧ أيام" },
  },
  {
    id: "czech-pots",
    mode: "b2b",
    image: "/samples/aluminum-pots.jpg",
    imageAlt: { en: "Set of 4 aluminum Czech pots", ar: "طقم ٤ حلل ألومنيوم تشيكي" },
    vendor: { en: "Helwan Non-Ferrous Industries", ar: "حلوان للصناعات غير الحديدية" },
    verified: true,
    title: { en: "Set of 4 Czech pots, aluminum", ar: "طقم ٤ حلل تشيكي، ألومنيوم" },
    price: 9.8,
    priceMax: 12.4,
    unit: { en: "set", ar: "طقم" },
    moq: { en: "200 sets", ar: "٢٠٠ طقم" },
    lead: { en: "21 d", ar: "٢١ يومًا" },
  },
  {
    id: "kilim-siwa",
    mode: "b2c",
    image: "/samples/kilim-rug.jpg",
    imageAlt: { en: "Hand-woven kilim runner", ar: "ممر كليم منسوج يدويًا" },
    vendor: { en: "Siwa Looms", ar: "أنوال سيوة" },
    title: { en: "Hand-woven kilim runner, 0.7 × 2.5 m", ar: "ممر كليم منسوج يدويًا، ٠٫٧ × ٢٫٥ م" },
    price: 64,
    ships: { en: "Ships in 3–5 days", ar: "الشحن خلال ٣–٥ أيام" },
  },
]
