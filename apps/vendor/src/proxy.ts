import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import createMiddleware from "next-intl/middleware"
import { routing } from "./i18n/routing"

const intl = createMiddleware(routing)

// Cheap gate: no session cookie → /login. Token validity is checked by the backend (401 → /login?expired=1).
export default function proxy(req: NextRequest) {
  const m = req.nextUrl.pathname.match(/^\/(en|ar)\/dashboard(\/|$)/)
  if (m && !req.cookies.has("vendor_token")) return NextResponse.redirect(new URL(`/${m[1]}/login`, req.url))
  return intl(req)
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
}
