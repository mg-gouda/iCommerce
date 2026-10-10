import { unserialize } from "php-serialize"

// ponytail: tiny entity decoder (numeric + the named ones WP emits); swap for a lib if exotic entities show up.
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" }
export const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(parseInt(e[1].toLowerCase() === "x" ? e.slice(2) : e.slice(1), e[1].toLowerCase() === "x" ? 16 : 10)) : NAMED[e.toLowerCase()] ?? m)

export const cleanText = (s: string | null | undefined): string => decodeEntities(s ?? "").replace(/\s+/g, " ").trim()

const SMALL = new Set(["and", "or", "of", "the", "in", "for", "its", "to", "a"])
// ponytail: "keep acronyms" = 2-letter non-stopword tokens stay upper (TV, UK); no dictionary.
export const titleCaseIfAllCaps = (s: string): string => {
  if (!/\p{Lu}/u.test(s) || s !== s.toUpperCase()) return s
  return s.replace(/[\p{L}']+/gu, (w, i: number) => {
    const lw = w.toLowerCase()
    if (i > 0 && SMALL.has(lw)) return lw
    if (w.length === 2) return w
    return lw[0].toUpperCase() + lw.slice(1)
  })
}

export const slugify = (s: string): string => {
  let d = s
  try { d = decodeURIComponent(s) } catch { /* not percent-encoded */ }
  return decodeEntities(d).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 120).replace(/-+$/, "")
}

/** Returns a dedupe fn: same base → base, base-2, base-3… in call order. */
export const uniqueHandles = () => {
  const seen = new Set<string>()
  return (base: string, fallback: string): string => {
    const b = base || fallback
    let h = b
    for (let n = 2; seen.has(h); n++) h = `${b}-${n}`
    seen.add(h)
    return h
  }
}

/** foo-380x300.jpg / foo-scaled.jpg → foo.jpg */
export const stripSizeSuffix = (p: string): string => p.replace(/-(\d+x\d+|scaled)(?=\.[a-z0-9]+$)/i, "")

/** "1,250.50" → 1250.5; empty / junk → null */
export const parsePrice = (s: unknown): number | null => {
  if (typeof s === "number") return Number.isFinite(s) ? Math.round(s * 100) / 100 : null
  if (typeof s !== "string") return null
  const t = s.replace(/,/g, "").trim()
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  return Math.round(Number(t) * 100) / 100
}

export const parseQty = (s: unknown): number | null => {
  const n = parsePrice(s)
  return n != null && n > 0 ? n : null
}

/** PHP-serialized → JS value; garbage → null. */
export const phpUnserialize = (s: string | null | undefined): unknown => {
  if (!s || !/^[aOs]:\d+:/.test(s)) return null
  try { return unserialize(s, {}, { strict: false }) } catch { return null }
}

type WcAttr = { name: string; value: string; is_taxonomy: number | string }

/** `_product_attributes` → custom (non-taxonomy) attrs as {key: values[]}, plus list of taxonomy names to resolve via terms. */
export const mapProductAttributes = (raw: string | null | undefined) => {
  const o = phpUnserialize(raw)
  const custom: Record<string, string[]> = {}
  const taxonomies: string[] = []
  if (!o || typeof o !== "object") return { custom, taxonomies }
  for (const a of Object.values(o as Record<string, WcAttr>)) {
    if (!a || typeof a !== "object" || !a.name) continue
    if (Number(a.is_taxonomy) === 1) { taxonomies.push(a.name); continue }
    const vals = String(a.value ?? "").split("|").map(cleanText).filter(Boolean)
    if (vals.length) custom[attrKey(a.name)] = vals
  }
  return { custom, taxonomies }
}

export const attrKey = (name: string): string => slugify(name.replace(/^pa_/, "")).replace(/-/g, "_")

/** "https://x/wp-content/uploads/2021/05/a.jpg" → "2021/05/a.jpg" */
export const uploadsRelative = (url: string): string | null => {
  const m = /\/wp-content\/uploads\/(.+)$/.exec(url.split(/[?#]/)[0])
  return m ? decodeURIComponent(m[1]) : null
}

/** WP datetime → ISO UTC; zero date → null */
export const isoDate = (gmt: string | null, local?: string | null): string | null => {
  const d = gmt && !gmt.startsWith("0000") ? gmt : local && !local.startsWith("0000") ? local : null
  return d ? d.replace(" ", "T") + "Z" : null
}
