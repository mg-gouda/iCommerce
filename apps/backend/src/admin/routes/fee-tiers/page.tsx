import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Label, Table, Text } from "@medusajs/ui"
import { useState } from "react"
import { act, api, numOrNull, selectCls, usd, useGet } from "../../lib"

type Tier = {
  id: string; channel: "b2b" | "b2c"; basis: string; min_amount: number; percent: number; fixed_amount: number
  min_fee: number | null; max_fee: number | null; active_from: string | null; active_to: string | null; label_en: string; label_ar: string
}
type Fee = { amount: number; percent: number; base: number; min_amount: number; label_en: string } | null

const EMPTY = { channel: "b2b", basis: "monthly_volume", min_amount: "0", percent: "6", fixed_amount: "0", min_fee: "", max_fee: "", active_from: "", active_to: "", label_en: "Platform fee", label_ar: "رسوم المنصة" }
type Form = typeof EMPTY

const toForm = (t: Tier): Form => ({
  channel: t.channel, basis: t.basis, min_amount: String(t.min_amount), percent: String(t.percent), fixed_amount: String(t.fixed_amount),
  min_fee: t.min_fee == null ? "" : String(t.min_fee), max_fee: t.max_fee == null ? "" : String(t.max_fee),
  active_from: t.active_from?.slice(0, 10) ?? "", active_to: t.active_to?.slice(0, 10) ?? "", label_en: t.label_en, label_ar: t.label_ar,
})
const toBody = (f: Form) => ({
  channel: f.channel, basis: f.basis, min_amount: Number(f.min_amount), percent: Number(f.percent), fixed_amount: Number(f.fixed_amount || 0),
  min_fee: numOrNull(f.min_fee), max_fee: numOrNull(f.max_fee), active_from: f.active_from || null, active_to: f.active_to || null,
  label_en: f.label_en, label_ar: f.label_ar,
})

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label size="xsmall">{label}</Label>
      {children}
    </div>
  )
}

function Preview() {
  const [q, setQ] = useState({ channel: "b2b", subtotal: "6000", monthly_volume: "25000" })
  const [fee, setFee] = useState<Fee | undefined>()
  const run = () => api<{ fee: Fee }>(`/admin/fee-tiers/preview?${new URLSearchParams(q)}`).then((r) => setFee(r.fee), (e) => window.alert(e.message))
  return (
    <div className="flex flex-wrap items-end gap-3 px-6 py-4">
      <Field label="Channel">
        <select className={selectCls} value={q.channel} onChange={(e) => setQ({ ...q, channel: e.target.value })}>
          <option value="b2b">B2B</option><option value="b2c">B2C</option>
        </select>
      </Field>
      <Field label="Order subtotal (USD)"><Input size="small" type="number" min={0} value={q.subtotal} onChange={(e) => setQ({ ...q, subtotal: e.target.value })} /></Field>
      <Field label="Buyer's volume this month before the order"><Input size="small" type="number" min={0} value={q.monthly_volume} onChange={(e) => setQ({ ...q, monthly_volume: e.target.value })} /></Field>
      <Button size="small" variant="secondary" onClick={run}>Calculate</Button>
      {fee !== undefined && (
        <Text size="small" weight="plus">
          {fee ? `${fee.label_en}: ${usd(fee.amount)} (tier ≥ ${usd(fee.min_amount)}, ${fee.percent}%, base ${usd(fee.base)})` : "No fee (no matching tier)."}
        </Text>
      )}
    </div>
  )
}

const FeeTiersPage = () => {
  const { data, error, reload } = useGet<{ fee_tiers: Tier[] }>("/admin/fee-tiers")
  const [form, setForm] = useState<Form>(EMPTY)
  const [editing, setEditing] = useState<string | null>(null)
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const reset = () => (setForm(EMPTY), setEditing(null), reload())
  const save = act(() => api(editing ? `/admin/fee-tiers/${editing}` : "/admin/fee-tiers", toBody(form)), reset)
  return (
    <Container className="p-0 divide-y">
      <div className="px-6 py-4">
        <Heading>Platform fee tiers</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Buyer fee per channel. Floor lookup: the tier with the highest minimum ≤ base wins (base = monthly volume incl. the order, or the order subtotal).
          fee = clamp(subtotal × % + fixed, min, max). Placed orders keep their snapshot.
        </Text>
      </div>
      {error && <Text className="px-6 py-4 text-ui-fg-error">{error}</Text>}
      <Table>
        <Table.Header>
          <Table.Row>
            {["Channel", "Basis", "From", "%", "Fixed", "Min fee", "Max fee", "Active", "Label", ""].map((h) => <Table.HeaderCell key={h}>{h}</Table.HeaderCell>)}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data?.fee_tiers.map((t) => (
            <Table.Row key={t.id}>
              <Table.Cell><Badge size="2xsmall" color={t.channel === "b2b" ? "blue" : "purple"}>{t.channel.toUpperCase()}</Badge></Table.Cell>
              <Table.Cell>{t.basis === "monthly_volume" ? "Monthly volume" : "Order total"}</Table.Cell>
              <Table.Cell>{usd(t.min_amount)}</Table.Cell>
              <Table.Cell>{t.percent}%</Table.Cell>
              <Table.Cell>{usd(t.fixed_amount)}</Table.Cell>
              <Table.Cell>{usd(t.min_fee)}</Table.Cell>
              <Table.Cell>{usd(t.max_fee)}</Table.Cell>
              <Table.Cell>{t.active_from || t.active_to ? `${t.active_from?.slice(0, 10) ?? "…"} → ${t.active_to?.slice(0, 10) ?? "…"}` : "always"}</Table.Cell>
              <Table.Cell>{t.label_en} · <span dir="rtl">{t.label_ar}</span></Table.Cell>
              <Table.Cell>
                <div className="flex gap-2">
                  <Button size="small" variant="secondary" onClick={() => (setForm(toForm(t)), setEditing(t.id))}>Edit</Button>
                  <Button size="small" variant="danger" onClick={act(() => (window.confirm("Delete this tier?") ? api(`/admin/fee-tiers/${t.id}`, undefined, "DELETE") : Promise.resolve()), reload)}>Delete</Button>
                </div>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      <div className="flex flex-col gap-3 px-6 py-4">
        <Heading level="h2">{editing ? "Edit tier" : "New tier"}</Heading>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Channel">
            <select className={selectCls} value={form.channel} onChange={set("channel")}><option value="b2b">B2B</option><option value="b2c">B2C</option></select>
          </Field>
          <Field label="Basis">
            <select className={selectCls} value={form.basis} onChange={set("basis")}>
              <option value="monthly_volume">Monthly volume</option><option value="order_total">Order total</option>
            </select>
          </Field>
          <Field label="From (USD)"><Input size="small" type="number" min={0} value={form.min_amount} onChange={set("min_amount")} /></Field>
          <Field label="Percent"><Input size="small" type="number" min={0} max={100} step="0.01" value={form.percent} onChange={set("percent")} /></Field>
          <Field label="Fixed (USD)"><Input size="small" type="number" min={0} value={form.fixed_amount} onChange={set("fixed_amount")} /></Field>
          <Field label="Min fee (blank = none)"><Input size="small" type="number" min={0} value={form.min_fee} onChange={set("min_fee")} /></Field>
          <Field label="Max fee (blank = none)"><Input size="small" type="number" min={0} value={form.max_fee} onChange={set("max_fee")} /></Field>
          <Field label="Active from"><Input size="small" type="date" value={form.active_from} onChange={set("active_from")} /></Field>
          <Field label="Active to"><Input size="small" type="date" value={form.active_to} onChange={set("active_to")} /></Field>
          <Field label="Label (EN)"><Input size="small" value={form.label_en} onChange={set("label_en")} /></Field>
          <Field label="Label (AR)"><Input size="small" dir="rtl" value={form.label_ar} onChange={set("label_ar")} /></Field>
        </div>
        <div className="flex gap-2">
          <Button size="small" onClick={save}>{editing ? "Save" : "Create"}</Button>
          {editing && <Button size="small" variant="secondary" onClick={() => (setForm(EMPTY), setEditing(null))}>Cancel</Button>}
        </div>
      </div>
      <div className="px-6 pt-4"><Heading level="h2">Preview calculator</Heading></div>
      <Preview />
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Fee tiers" })
export default FeeTiersPage
