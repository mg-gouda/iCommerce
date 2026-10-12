"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { api, ApiError, routeLocale, TOKEN_COOKIE } from "./api"
import type { FormState } from "./types"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function setToken(token: string) {
  ;(await cookies()).set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24, // Medusa JWTs expire after 1 day by default
  })
}

const login = (email: string, password: string) =>
  api<{ token: string }>("/auth/vendor/emailpass", { method: "POST", body: JSON.stringify({ email, password }) })

// A login token for an identity that never applied has no actor yet → no vendor to load.
const hasActor = (token: string) => !!JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).actor_id

export async function signIn(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get("email") ?? "").trim()
  const password = String(fd.get("password") ?? "")
  const values = { email }
  if (!EMAIL.test(email)) return { values, fieldErrors: { email: "email" } }
  if (!password) return { values, fieldErrors: { password: "passwordRequired" } }
  let token: string
  try {
    token = (await login(email, password)).token
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { values, message: "badLogin" }
    throw e
  }
  if (!hasActor(token)) return { values, message: "noStore" }
  await setToken(token)
  redirect(`/${routeLocale(fd)}/dashboard`)
}

export async function signUp(_prev: FormState, fd: FormData): Promise<FormState> {
  const get = (k: string) => String(fd.get(k) ?? "").trim()
  const values = { email: get("email"), name: get("name"), country: get("country"), phone: get("phone") }
  const password = String(fd.get("password") ?? "")
  const fieldErrors: Record<string, string> = {}
  if (!values.name) fieldErrors.name = "companyRequired"
  if (!EMAIL.test(values.email)) fieldErrors.email = "email"
  if (password.length < 8) fieldErrors.password = "passwordShort"
  if (!/^[A-Z]{2}$/.test(values.country)) fieldErrors.country = "country"
  if (values.phone && !/^\+?[0-9 ()-]{7,20}$/.test(values.phone)) fieldErrors.phone = "phone"
  if (Object.keys(fieldErrors).length) return { values, fieldErrors }

  let token: string
  try {
    token = (await api<{ token: string }>("/auth/vendor/emailpass/register", {
      method: "POST",
      body: JSON.stringify({ email: values.email, password }),
    })).token
  } catch (e) {
    // Identity exists (earlier half-finished sign-up, or a buyer account): its login token can still apply.
    if (!(e instanceof ApiError && e.status === 401)) throw e
    try {
      token = (await login(values.email, password)).token
    } catch {
      return { values, fieldErrors: { email: "emailTaken" } }
    }
    if (hasActor(token)) return { values, fieldErrors: { email: "alreadyVendor" } }
  }

  try {
    await api("/vendors", {
      method: "POST",
      token,
      body: JSON.stringify({ name: values.name, country: values.country, phone: values.phone || null }),
    })
  } catch (e) {
    if (e instanceof ApiError && /handle/.test(e.message)) return { values, fieldErrors: { name: "nameTaken" } }
    if (e instanceof ApiError) return { values, message: e.message }
    throw e
  }
  // Registration token has no actor; log in again for one that carries the new vendor_user.
  await setToken((await login(values.email, password)).token)
  redirect(`/${routeLocale(fd)}/dashboard`)
}

export async function signOut(fd: FormData) {
  ;(await cookies()).delete(TOKEN_COOKIE)
  redirect(`/${routeLocale(fd)}/login`)
}
