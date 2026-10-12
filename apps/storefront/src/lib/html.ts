import sanitize from "sanitize-html"

// Vendor/imported product descriptions are third-party HTML → allowlist at render (server components only).
const OPTIONS: sanitize.IOptions = {
  allowedTags: ["p", "br", "ul", "ol", "li", "strong", "em", "b", "i", "h3", "h4", "table", "thead", "tbody", "tr", "th", "td", "img", "a"],
  allowedAttributes: { a: ["href", "rel"], img: ["src", "alt"] },
  allowedSchemes: ["http", "https"],
  allowProtocolRelative: false,
  exclusiveFilter: (f) => f.tag === "img" && !f.attribs.src, // non-http(s) src was stripped → drop the empty tag
  transformTags: { a: sanitize.simpleTransform("a", { rel: "noopener nofollow" }) },
}

/** Sanitized description HTML; plain text keeps its line breaks. */
export const descriptionHtml = (raw: string) => sanitize(/<\/?[a-z][^>]*>/i.test(raw) ? raw : raw.replace(/\n/g, "<br>"), OPTIONS)

/** Plain text for <meta> description. */
export const descriptionText = (raw: string) => sanitize(raw.replace(/<br\s*\/?>|<\/(p|li|h3|h4|td|th|tr)>/gi, " "), { allowedTags: [], allowedAttributes: {} })
    .replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m])
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300)
const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'" }
