import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Table, Text } from "@medusajs/ui"
import { useState } from "react"
import { act, api, selectCls, usd, useGet } from "../../lib"

type Vendor = { id: string; name: string; handle: string | null }
type Balance = { vendor: Vendor; pending: number; available: number; balance: number }
type Entry = { id: string; vendor_order_id: string | null; order_display_id: number | null; type: string; amount: number; status: string; available_at: string | null; note: string | null; created_at: string }
type Batch = { id: string; vendor: Vendor | null; amount: number; status: string; reference: string | null; paid_at: string | null; entry_count: number; created_at: string }
const tone = { pending: "orange", available: "blue", paid: "green", open: "orange" } as const
const money = (n: number) => <span className={n < 0 ? "text-ui-fg-error" : undefined}>{usd(n)}</span>

function Ledger({ vendor, reload }: { vendor: Vendor; reload: () => void }) {
  const [type, setType] = useState("")
  const [status, setStatus] = useState("")
  const [offset, setOffset] = useState(0)
  const qs = new URLSearchParams({ vendor_id: vendor.id, limit: "25", offset: String(offset), ...(type && { type }), ...(status && { status }) })
  const { data, reload: reloadLedger } = useGet<{ entries: Entry[]; count: number }>(`/admin/payouts/ledger?${qs}`)
  const [refund, setRefund] = useState({ order: "", amount: "", note: "" })
  const both = () => (reload(), reloadLedger())
  return (
    <div className="flex flex-col gap-3 bg-ui-bg-subtle px-6 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Heading level="h2">Ledger · {vendor.name}</Heading>
        <select aria-label="Type" className={selectCls} value={type} onChange={(e) => (setType(e.target.value), setOffset(0))}>
          <option value="">All types</option>
          {["sale", "commission", "fee_collected", "refund", "payout", "adjustment"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select aria-label="Status" className={selectCls} value={status} onChange={(e) => (setStatus(e.target.value), setOffset(0))}>
          <option value="">All statuses</option>
          {["pending", "available", "paid"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <Button size="small" onClick={act(() => api("/admin/payout-batches", { vendor_id: vendor.id }), both)}>Create payout batch (available)</Button>
      </div>
      <Table>
        <Table.Header>
          <Table.Row>{["Date", "Order", "Type", "Amount", "Status", "Available", "Note"].map((h) => <Table.HeaderCell key={h}>{h}</Table.HeaderCell>)}</Table.Row>
        </Table.Header>
        <Table.Body>
          {data?.entries.map((e) => (
            <Table.Row key={e.id}>
              <Table.Cell>{e.created_at.slice(0, 10)}</Table.Cell>
              <Table.Cell>{e.order_display_id ? `#${e.order_display_id}` : "—"}</Table.Cell>
              <Table.Cell>{e.type}</Table.Cell>
              <Table.Cell>{money(e.amount)}</Table.Cell>
              <Table.Cell><Badge size="2xsmall" color={tone[e.status as keyof typeof tone]}>{e.status}</Badge></Table.Cell>
              <Table.Cell>{e.available_at?.slice(0, 10) ?? "—"}</Table.Cell>
              <Table.Cell>{e.note === "cod_cash" ? "COD cash collected by vendor" : e.note ?? ""}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      <div className="flex items-center gap-2">
        <Button size="small" variant="secondary" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</Button>
        <Text size="small">{data ? `${offset + 1}–${Math.min(offset + 25, data.count)} of ${data.count}` : ""}</Text>
        <Button size="small" variant="secondary" disabled={!data || offset + 25 >= data.count} onClick={() => setOffset(offset + 25)}>Next</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Text size="small" weight="plus">Refund after delivery</Text>
        <select aria-label="Vendor order" className={selectCls} value={refund.order} onChange={(e) => setRefund({ ...refund, order: e.target.value })}>
          <option value="">Vendor order…</option>
          {[...new Map((data?.entries ?? []).filter((e) => e.type === "sale").map((e) => [e.vendor_order_id, e] as const)).values()].map((e: Entry) => (
            <option key={e.vendor_order_id!} value={e.vendor_order_id!}>#{e.order_display_id} ({usd(e.amount)})</option>
          ))}
        </select>
        <Input size="small" type="number" min={0} placeholder="Amount" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} className="w-28" />
        <Input size="small" placeholder="Note" value={refund.note} onChange={(e) => setRefund({ ...refund, note: e.target.value })} className="w-48" />
        <Button size="small" variant="secondary" disabled={!refund.order || !refund.amount}
          onClick={act(() => api(`/admin/vendor-orders/${refund.order}/refund`, { amount: Number(refund.amount), ...(refund.note && { note: refund.note }) }), () => (setRefund({ order: "", amount: "", note: "" }), both()))}>
          Book refund
        </Button>
      </div>
    </div>
  )
}

function Batches({ reloadKey }: { reloadKey: number }) {
  const [status, setStatus] = useState("open")
  const { data, reload } = useGet<{ batches: Batch[] }>(`/admin/payout-batches?limit=100${status ? `&status=${status}` : ""}&k=${reloadKey}`)
  const [ref, setRef] = useState<Record<string, string>>({})
  return (
    <>
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Payout batches</Heading>
        <select aria-label="Batch status" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option><option value="open">open</option><option value="paid">paid</option>
        </select>
      </div>
      <Table>
        <Table.Header>
          <Table.Row>{["Created", "Vendor", "Entries", "Amount", "Status", "Reference", ""].map((h) => <Table.HeaderCell key={h}>{h}</Table.HeaderCell>)}</Table.Row>
        </Table.Header>
        <Table.Body>
          {data?.batches.map((b) => (
            <Table.Row key={b.id}>
              <Table.Cell>{b.created_at.slice(0, 10)}</Table.Cell>
              <Table.Cell>{b.vendor?.name}</Table.Cell>
              <Table.Cell>{b.entry_count}</Table.Cell>
              <Table.Cell>{usd(b.amount)}</Table.Cell>
              <Table.Cell><Badge size="2xsmall" color={tone[b.status as keyof typeof tone]}>{b.status}</Badge></Table.Cell>
              <Table.Cell>{b.reference ?? <Input size="small" placeholder="Bank reference" value={ref[b.id] ?? ""} onChange={(e) => setRef({ ...ref, [b.id]: e.target.value })} className="w-40" />}</Table.Cell>
              <Table.Cell>
                {b.status === "open" && (
                  <Button size="small" variant="secondary" disabled={!ref[b.id]} onClick={act(() => api(`/admin/payout-batches/${b.id}/mark-paid`, { reference: ref[b.id] }), reload)}>Mark paid</Button>
                )}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      {data && !data.batches.length && <Text className="px-6 py-4 text-ui-fg-subtle">No batches.</Text>}
    </>
  )
}

const PayoutsPage = () => {
  const { data, error, reload } = useGet<{ balances: Balance[] }>("/admin/payouts/balances")
  const [open, setOpen] = useState<Vendor | null>(null)
  const [k, setK] = useState(0)
  const reloadAll = () => (reload(), setK(k + 1))
  return (
    <Container className="p-0 divide-y">
      <div className="px-6 py-4">
        <Heading>Vendor payouts</Heading>
        <Text size="small" className="text-ui-fg-subtle">Balance = what iCommerce owes the vendor (negative = the vendor owes, e.g. COD commission and fees). Entries become available after the hold period (PAYOUT_HOLD_DAYS, default 7 days after delivery) once the order is paid.</Text>
      </div>
      {error && <Text className="px-6 py-4 text-ui-fg-error">{error}</Text>}
      <Table>
        <Table.Header>
          <Table.Row>{["Vendor", "Pending", "Available", "Balance", ""].map((h) => <Table.HeaderCell key={h}>{h}</Table.HeaderCell>)}</Table.Row>
        </Table.Header>
        <Table.Body>
          {data?.balances.map((b) => (
            <Table.Row key={b.vendor.id}>
              <Table.Cell>{b.vendor.name}</Table.Cell>
              <Table.Cell>{money(b.pending)}</Table.Cell>
              <Table.Cell>{money(b.available)}</Table.Cell>
              <Table.Cell>{money(b.balance)}</Table.Cell>
              <Table.Cell><Button size="small" variant="secondary" onClick={() => setOpen(open?.id === b.vendor.id ? null : b.vendor)}>{open?.id === b.vendor.id ? "Close" : "Ledger"}</Button></Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      {data && !data.balances.length && <Text className="px-6 py-4 text-ui-fg-subtle">No ledger entries yet (entries are posted when vendors mark orders delivered).</Text>}
      {open && <Ledger key={open.id} vendor={open} reload={reloadAll} />}
      <Batches reloadKey={k} />
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Payouts" })
export default PayoutsPage
