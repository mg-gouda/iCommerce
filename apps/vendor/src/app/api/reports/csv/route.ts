import { cookies } from "next/headers"
import { BACKEND, TOKEN_COOKIE } from "@/lib/api"

const BY = ["product", "category", "country", "channel", "buyer"]

// CSV download proxy: the vendor JWT is httpOnly, so the browser can't call the backend itself.
export async function GET(req: Request) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value
  if (!token) return new Response("Unauthorized", { status: 401 })
  const sp = new URL(req.url).searchParams
  const by = sp.get("by") ?? "period"
  const qs = new URLSearchParams({ format: "csv" })
  for (const k of ["from", "to", "channel", "paid"]) if (sp.get(k)) qs.set(k, sp.get(k)!)
  if (BY.includes(by)) qs.set("by", by)
  const path = BY.includes(by) ? "breakdown" : "summary"
  const res = await fetch(`${BACKEND}/vendors/reports/${path}?${qs}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" })
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "text/csv", "content-disposition": res.headers.get("content-disposition") ?? "attachment" },
  })
}
