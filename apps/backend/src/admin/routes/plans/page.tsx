import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Label, Table, Text } from "@medusajs/ui"
import { useState } from "react"
import { act, api, numOrNull, selectCls, usd, useGet } from "../../lib"
import { VendorPicker } from "../../pickers"

type Plan = {
  id: string; handle: string; name_en: string; name_ar: string; price_usd: number; interval: string; product_limit: number | null; staff_limit: number | null
  featured_slots: number; can_b2b: boolean; analytics_level: string; active: boolean; subscribers?: number
}
type Sub = {
  id: string; vendor: { id: string; name: string } | null; plan: Plan | null; status: string; current_period_end: string | null
  requested_plan: Plan | null; read_only: boolean
}
const tone = { trial: "blue", active: "green", past_due: "red", cancelled: "grey" } as const
const EMPTY = { handle: "", name_en: "", name_ar: "", price_usd: "0", interval: "monthly", product_limit: "", staff_limit: "", featured_slots: "0", can_b2b: "false", analytics_level: "basic", active: "true" }
type Form = typeof EMPTY
const toForm = (p: Plan): Form => ({
  handle: p.handle, name_en: p.name_en, name_ar: p.name_ar, price_usd: String(p.price_usd), interval: p.interval,
  product_limit: p.product_limit == null ? "" : String(p.product_limit), staff_limit: p.staff_limit == null ? "" : String(p.staff_limit),
  featured_slots: String(p.featured_slots), can_b2b: String(p.can_b2b), analytics_level: p.analytics_level, active: String(p.active),
})
const toBody = (f: Form) => ({
  handle: f.handle, name_en: f.name_en, name_ar: f.name_ar, price_usd: Number(f.price_usd), interval: f.interval,
  product_limit: numOrNull(f.product_limit), staff_limit: numOrNull(f.staff_limit), featured_slots: Number(f.featured_slots || 0),
  can_b2b: f.can_b2b === "true", analytics_level: f.analytics_level, active: f.active === "true",
})
const limit = (n: number | null) => (n == null ? "unlimited" : n)

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><Label size="xsmall">{label}</Label>{children}</div>
}

function Subscriptions({ plans }: { plans: Plan[] }) {
  const [status, setStatus] = useState("")
  const { data, reload } = useGet<{ subscriptions: Sub[]; count: number }>(`/admin/vendor-subscriptions?limit=100${status ? `&status=${status}` : ""}`)
  const [assign, setAssign] = useState({ vendor_id: "", plan_id: "", status: "active", current_period_end: "" })
  return (
    <>
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Vendor subscriptions</Heading>
        <select aria-label="Status" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {Object.keys(tone).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <Table>
        <Table.Header>
          <Table.Row>{["Vendor", "Plan", "Status", "Period end", "Upgrade request", ""].map((h) => <Table.HeaderCell key={h}>{h}</Table.HeaderCell>)}</Table.Row>
        </Table.Header>
        <Table.Body>
          {data?.subscriptions.map((s) => (
            <Table.Row key={s.id}>
              <Table.Cell>{s.vendor?.name}</Table.Cell>
              <Table.Cell>{s.plan?.name_en}</Table.Cell>
              <Table.Cell>
                <Badge size="2xsmall" color={tone[s.status as keyof typeof tone]}>{s.status}</Badge>
                {s.read_only && <Badge size="2xsmall" color="red" className="ms-1">hidden</Badge>}
              </Table.Cell>
              <Table.Cell>{s.current_period_end?.slice(0, 10) ?? "—"}</Table.Cell>
              <Table.Cell>{s.requested_plan?.name_en ?? "—"}</Table.Cell>
              <Table.Cell>
                <div className="flex gap-2">
                  {(s.plan?.price_usd || s.requested_plan) && (
                    <Button size="small" variant="secondary" onClick={act(() => api(`/admin/vendor-subscriptions/${s.id}/mark-paid`, s.requested_plan ? { plan_id: s.requested_plan.id } : {}), reload)}>
                      {s.requested_plan ? `Paid → ${s.requested_plan.name_en}` : "Mark period paid"}
                    </Button>
                  )}
                </div>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      <Text size="xsmall" className="px-6 pt-2 text-ui-fg-subtle">Vendors without a row are on Starter.</Text>
      <div className="flex flex-wrap items-end gap-3 px-6 py-4">
        <Field label="Vendor"><VendorPicker value={assign.vendor_id} onChange={(vendor_id) => setAssign({ ...assign, vendor_id })} /></Field>
        <Field label="Plan">
          <select className={selectCls} value={assign.plan_id} onChange={(e) => setAssign({ ...assign, plan_id: e.target.value })}>
            <option value="">Choose plan…</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name_en}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={selectCls} value={assign.status} onChange={(e) => setAssign({ ...assign, status: e.target.value })}>
            {Object.keys(tone).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Period end"><Input size="small" type="date" value={assign.current_period_end} onChange={(e) => setAssign({ ...assign, current_period_end: e.target.value })} /></Field>
        <Button size="small" disabled={!assign.vendor_id || !assign.plan_id}
          onClick={act(() => api("/admin/vendor-subscriptions", { ...assign, current_period_end: assign.current_period_end || null }), reload)}>
          Set plan
        </Button>
      </div>
    </>
  )
}

const PlansPage = () => {
  const { data, error, reload } = useGet<{ plans: Plan[] }>("/admin/plans")
  const [form, setForm] = useState<Form>(EMPTY)
  const [editing, setEditing] = useState<string | null>(null)
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const reset = () => (setForm(EMPTY), setEditing(null), reload())
  return (
    <Container className="p-0 divide-y">
      <div className="px-6 py-4">
        <Heading>Vendor plans</Heading>
        <Text size="small" className="text-ui-fg-subtle">Manual billing: mark a period paid; unpaid periods go past due daily, products hide after the grace period.</Text>
      </div>
      {error && <Text className="px-6 py-4 text-ui-fg-error">{error}</Text>}
      <Table>
        <Table.Header>
          <Table.Row>{["Plan", "Price", "Products", "Staff", "Featured", "B2B", "Analytics", "Vendors", ""].map((h) => <Table.HeaderCell key={h}>{h}</Table.HeaderCell>)}</Table.Row>
        </Table.Header>
        <Table.Body>
          {data?.plans.map((p) => (
            <Table.Row key={p.id}>
              <Table.Cell>{p.name_en} · <span dir="rtl">{p.name_ar}</span> {!p.active && <Badge size="2xsmall">inactive</Badge>}</Table.Cell>
              <Table.Cell>{p.price_usd ? `${usd(p.price_usd)} / ${p.interval === "yearly" ? "yr" : "mo"}` : "Free"}</Table.Cell>
              <Table.Cell>{limit(p.product_limit)}</Table.Cell>
              <Table.Cell>{limit(p.staff_limit)}</Table.Cell>
              <Table.Cell>{p.featured_slots}</Table.Cell>
              <Table.Cell>{p.can_b2b ? "yes" : "no"}</Table.Cell>
              <Table.Cell>{p.analytics_level}</Table.Cell>
              <Table.Cell>{p.subscribers}</Table.Cell>
              <Table.Cell><Button size="small" variant="secondary" onClick={() => (setForm(toForm(p)), setEditing(p.id))}>Edit</Button></Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      <div className="flex flex-col gap-3 px-6 py-4">
        <Heading level="h2">{editing ? "Edit plan" : "New plan"}</Heading>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Handle"><Input size="small" value={form.handle} onChange={set("handle")} /></Field>
          <Field label="Name (EN)"><Input size="small" value={form.name_en} onChange={set("name_en")} /></Field>
          <Field label="Name (AR)"><Input size="small" dir="rtl" value={form.name_ar} onChange={set("name_ar")} /></Field>
          <Field label="Price (USD)"><Input size="small" type="number" min={0} value={form.price_usd} onChange={set("price_usd")} /></Field>
          <Field label="Interval">
            <select className={selectCls} value={form.interval} onChange={set("interval")}><option value="monthly">monthly</option><option value="yearly">yearly</option></select>
          </Field>
          <Field label="Product limit (blank = unlimited)"><Input size="small" type="number" min={0} value={form.product_limit} onChange={set("product_limit")} /></Field>
          <Field label="Staff limit (blank = unlimited)"><Input size="small" type="number" min={0} value={form.staff_limit} onChange={set("staff_limit")} /></Field>
          <Field label="Featured slots"><Input size="small" type="number" min={0} value={form.featured_slots} onChange={set("featured_slots")} /></Field>
          <Field label="B2B (wholesale, RFQs)">
            <select className={selectCls} value={form.can_b2b} onChange={set("can_b2b")}><option value="true">yes</option><option value="false">no</option></select>
          </Field>
          <Field label="Analytics">
            <select className={selectCls} value={form.analytics_level} onChange={set("analytics_level")}><option value="basic">basic</option><option value="full">full</option></select>
          </Field>
          <Field label="Active">
            <select className={selectCls} value={form.active} onChange={set("active")}><option value="true">yes</option><option value="false">no</option></select>
          </Field>
        </div>
        <div className="flex gap-2">
          <Button size="small" onClick={act(() => api(editing ? `/admin/plans/${editing}` : "/admin/plans", toBody(form)), reset)}>{editing ? "Save" : "Create"}</Button>
          {editing && <Button size="small" variant="secondary" onClick={() => (setForm(EMPTY), setEditing(null))}>Cancel</Button>}
        </div>
      </div>
      <Subscriptions plans={data?.plans ?? []} />
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Vendor plans" })
export default PlansPage
