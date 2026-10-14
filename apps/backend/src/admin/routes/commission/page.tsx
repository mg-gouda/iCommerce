import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Label, Table, Text } from "@medusajs/ui"
import { useState } from "react"
import { act, api, numOrNull, selectCls, usd, useGet } from "../../lib"
import { CategoryPicker, PlanPicker, VendorPicker } from "../../pickers"

type Rule = {
  id: string; scope: string; scope_id: string | null; scope_label: string; channel: string; percent: number; fixed_amount: number
  min: number | null; max: number | null; active_from: string | null; active_to: string | null; note: string | null
}
const SCOPES = ["vendor_category", "vendor", "category", "plan", "global"]
const EMPTY = { scope: "global", vendor: "", category: "", plan: "", channel: "all", percent: "10", fixed_amount: "0", min: "", max: "", active_from: "", active_to: "", note: "" }
type Form = typeof EMPTY

const scopeId = (f: Form) =>
  ({ global: null, plan: f.plan, category: f.category, vendor: f.vendor, vendor_category: `${f.vendor}:${f.category}` })[f.scope as "global"] ?? null
const toForm = (r: Rule): Form => {
  const [a, b] = (r.scope_id ?? "").split(":")
  return {
    scope: r.scope, vendor: r.scope === "vendor" || r.scope === "vendor_category" ? a : "", category: r.scope === "category" ? a : r.scope === "vendor_category" ? b : "",
    plan: r.scope === "plan" ? a : "", channel: r.channel, percent: String(r.percent), fixed_amount: String(r.fixed_amount),
    min: r.min == null ? "" : String(r.min), max: r.max == null ? "" : String(r.max),
    active_from: r.active_from?.slice(0, 10) ?? "", active_to: r.active_to?.slice(0, 10) ?? "", note: r.note ?? "",
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><Label size="xsmall">{label}</Label>{children}</div>
}

function Tester() {
  const [t, setT] = useState({ vendor_id: "", category_id: "", channel: "b2c", amount: "100" })
  const [out, setOut] = useState<{ rule: Rule | null; commission: number } | null>(null)
  const run = () =>
    api<{ rule: Rule | null; commission: number }>(`/admin/commission-rules/resolve?${new URLSearchParams(Object.entries(t).filter(([, v]) => v) as [string, string][])}`).then(setOut, (e) => window.alert(e.message))
  return (
    <div className="flex flex-wrap items-end gap-3 px-6 py-4">
      <Field label="Vendor"><VendorPicker value={t.vendor_id} onChange={(vendor_id) => setT({ ...t, vendor_id })} /></Field>
      <Field label="Category (optional)"><CategoryPicker value={t.category_id} onChange={(category_id) => setT({ ...t, category_id })} /></Field>
      <Field label="Channel">
        <select className={selectCls} value={t.channel} onChange={(e) => setT({ ...t, channel: e.target.value })}><option value="b2c">B2C</option><option value="b2b">B2B</option></select>
      </Field>
      <Field label="Line total (USD)"><Input size="small" type="number" min={0} value={t.amount} onChange={(e) => setT({ ...t, amount: e.target.value })} /></Field>
      <Button size="small" variant="secondary" onClick={run} disabled={!t.vendor_id}>Which rule applies?</Button>
      {out && (
        <Text size="small" weight="plus">
          {out.rule ? `${out.rule.scope} rule · ${out.rule.percent}% → commission ${usd(out.commission)}` : "No rule → no commission."}
        </Text>
      )}
    </div>
  )
}

const CommissionPage = () => {
  const { data, error, reload } = useGet<{ commission_rules: Rule[] }>("/admin/commission-rules")
  const [form, setForm] = useState<Form>(EMPTY)
  const [editing, setEditing] = useState<string | null>(null)
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const body = () => ({
    scope: form.scope, scope_id: scopeId(form), channel: form.channel, percent: Number(form.percent), fixed_amount: Number(form.fixed_amount || 0),
    min: numOrNull(form.min), max: numOrNull(form.max), active_from: form.active_from || null, active_to: form.active_to || null, note: form.note || null,
  })
  const reset = () => (setForm(EMPTY), setEditing(null), reload())
  return (
    <Container className="p-0 divide-y">
      <div className="px-6 py-4">
        <Heading>Commission rules</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Most specific wins: vendor + category → vendor → category → plan → global; exact channel beats “all”. commission = clamp(line × % + fixed, min, max), snapshotted per order line.
        </Text>
      </div>
      {error && <Text className="px-6 py-4 text-ui-fg-error">{error}</Text>}
      <Table>
        <Table.Header>
          <Table.Row>{["Scope", "Applies to", "Channel", "%", "Fixed", "Min", "Max", "Active", ""].map((h) => <Table.HeaderCell key={h}>{h}</Table.HeaderCell>)}</Table.Row>
        </Table.Header>
        <Table.Body>
          {data?.commission_rules.map((r) => (
            <Table.Row key={r.id}>
              <Table.Cell><Badge size="2xsmall">{r.scope.replace("_", " + ")}</Badge></Table.Cell>
              <Table.Cell>{r.scope_label}</Table.Cell>
              <Table.Cell>{r.channel}</Table.Cell>
              <Table.Cell>{r.percent}%</Table.Cell>
              <Table.Cell>{usd(r.fixed_amount)}</Table.Cell>
              <Table.Cell>{usd(r.min)}</Table.Cell>
              <Table.Cell>{usd(r.max)}</Table.Cell>
              <Table.Cell>{r.active_from || r.active_to ? `${r.active_from?.slice(0, 10) ?? "…"} → ${r.active_to?.slice(0, 10) ?? "…"}` : "always"}</Table.Cell>
              <Table.Cell>
                <div className="flex gap-2">
                  <Button size="small" variant="secondary" onClick={() => (setForm(toForm(r)), setEditing(r.id))}>Edit</Button>
                  <Button size="small" variant="danger" onClick={act(() => (window.confirm("Delete this rule?") ? api(`/admin/commission-rules/${r.id}`, undefined, "DELETE") : Promise.resolve()), reload)}>Delete</Button>
                </div>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      <div className="flex flex-col gap-3 px-6 py-4">
        <Heading level="h2">{editing ? "Edit rule" : "New rule"}</Heading>
        <div className="flex flex-wrap gap-3">
          <Field label="Scope">
            <select className={selectCls} value={form.scope} onChange={set("scope")}>{SCOPES.map((s) => <option key={s} value={s}>{s.replace("_", " + ")}</option>)}</select>
          </Field>
          {(form.scope === "vendor" || form.scope === "vendor_category") && <Field label="Vendor"><VendorPicker value={form.vendor} onChange={(vendor) => setForm({ ...form, vendor })} /></Field>}
          {(form.scope === "category" || form.scope === "vendor_category") && <Field label="Category"><CategoryPicker value={form.category} onChange={(category) => setForm({ ...form, category })} /></Field>}
          {form.scope === "plan" && <Field label="Plan"><PlanPicker value={form.plan} onChange={(plan) => setForm({ ...form, plan })} /></Field>}
          <Field label="Channel">
            <select className={selectCls} value={form.channel} onChange={set("channel")}><option value="all">All</option><option value="b2c">B2C</option><option value="b2b">B2B</option></select>
          </Field>
          <Field label="Percent"><Input size="small" type="number" min={0} max={100} step="0.01" value={form.percent} onChange={set("percent")} /></Field>
          <Field label="Fixed per line (USD)"><Input size="small" type="number" min={0} value={form.fixed_amount} onChange={set("fixed_amount")} /></Field>
          <Field label="Min (blank = none)"><Input size="small" type="number" min={0} value={form.min} onChange={set("min")} /></Field>
          <Field label="Max (blank = none)"><Input size="small" type="number" min={0} value={form.max} onChange={set("max")} /></Field>
          <Field label="Active from"><Input size="small" type="date" value={form.active_from} onChange={set("active_from")} /></Field>
          <Field label="Active to"><Input size="small" type="date" value={form.active_to} onChange={set("active_to")} /></Field>
          <Field label="Note"><Input size="small" value={form.note} onChange={set("note")} /></Field>
        </div>
        <div className="flex gap-2">
          <Button size="small" onClick={act(() => api(editing ? `/admin/commission-rules/${editing}` : "/admin/commission-rules", body()), reset)}>{editing ? "Save" : "Create"}</Button>
          {editing && <Button size="small" variant="secondary" onClick={() => (setForm(EMPTY), setEditing(null))}>Cancel</Button>}
        </div>
      </div>
      <div className="px-6 pt-4"><Heading level="h2">Rule tester</Heading></div>
      <Tester />
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Commission" })
export default CommissionPage
