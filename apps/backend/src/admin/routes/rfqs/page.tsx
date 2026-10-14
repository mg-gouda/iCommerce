import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Checkbox, Container, Heading, Input, Label, Table, Text } from "@medusajs/ui"
import { Fragment, useState } from "react"
import { act, api, useGet } from "../../lib"

type Item = { id: string; title: string; quantity: number; unit: string | null; target_price: number | null }
type Quote = {
  id: string; rfq_id: string; created_at: string; notes: string | null; incoterm: string | null; items: Item[]
  company: { name: string; country: string; city: string | null } | null
  requester: { email: string } | null
}
type Vendor = { id: string; name: string; handle: string; country: string | null }

/** One routing quote: pick approved vendors (search) → route, or close with a note. */
function Detail({ q, reload }: { q: Quote; reload: () => void }) {
  const [search, setSearch] = useState("")
  const [picked, setPicked] = useState<Record<string, string>>({}) // id → name (kept across searches)
  const [note, setNote] = useState("")
  const { data } = useGet<{ vendors: Vendor[] }>(`/admin/vendors?status=approved&limit=20${search ? `&q=${encodeURIComponent(search)}` : ""}`)
  const toggle = (v: Vendor) => setPicked(({ [v.id]: had, ...rest }) => (had ? rest : { ...rest, [v.id]: v.name }))
  const ids = Object.keys(picked)
  return (
    <div className="flex flex-col gap-3 p-4 bg-ui-bg-subtle">
      <Text size="small">
        {q.company?.name} ({q.company?.city ? `${q.company.city}, ` : ""}{q.company?.country}) · {q.requester?.email} · RFQ {q.rfq_id}
        {q.incoterm && ` · ${q.incoterm}`}
      </Text>
      <ul className="list-disc ps-5">
        {q.items.map((i) => (
          <li key={i.id}><Text size="small">{i.title} — {i.quantity} {i.unit ?? ""}{i.target_price != null && ` · target USD ${i.target_price}`}</Text></li>
        ))}
      </ul>
      {q.notes && <Text size="small">Buyer notes: {q.notes}</Text>}
      <div className="flex flex-col gap-2">
        <Input size="small" type="search" placeholder="Search approved vendors" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72" />
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {data?.vendors.map((v) => (
            <div key={v.id} className="flex items-center gap-2">
              <Checkbox id={`v-${q.id}-${v.id}`} checked={!!picked[v.id]} onCheckedChange={() => toggle(v)} />
              <Label htmlFor={`v-${q.id}-${v.id}`} size="small">{v.name}</Label>
            </div>
          ))}
          {data && !data.vendors.length && <Text size="small" className="text-ui-fg-subtle">No approved vendor matches.</Text>}
        </div>
        {ids.length > 0 && <Text size="small">Selected: {Object.values(picked).join(", ")}</Text>}
        <Button size="small" className="self-start" disabled={!ids.length} onClick={act(() => api(`/admin/quotes/${q.id}/route`, { vendor_ids: ids }), reload)}>
          Route to {ids.length || ""} vendor{ids.length === 1 ? "" : "s"}
        </Button>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <Input size="small" placeholder="Note to buyer (required)" value={note} onChange={(e) => setNote(e.target.value)} className="w-72" />
        <Button size="small" variant="danger" disabled={!note.trim()} onClick={act(() => api(`/admin/quotes/${q.id}/close`, { note }), reload)}>
          Close: no supplier found
        </Button>
      </div>
    </div>
  )
}

const RfqsPage = () => {
  const { data, error, reload } = useGet<{ quotes: Quote[]; count: number }>("/admin/quotes?status=routing&limit=100")
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Container className="p-0 divide-y">
      <div className="px-6 py-4">
        <Heading>RFQs to route</Heading>
        <Text size="small" className="text-ui-fg-subtle">Free-text lines buyers left to iCommerce. Oldest first.</Text>
      </div>
      {error && <Text className="px-6 py-4 text-ui-fg-error">{error}</Text>}
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Received</Table.HeaderCell>
            <Table.HeaderCell>Company</Table.HeaderCell>
            <Table.HeaderCell>Items</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data?.quotes.map((q) => (
            <Fragment key={q.id}>
              <Table.Row className="cursor-pointer" onClick={() => setOpen(open === q.id ? null : q.id)}>
                <Table.Cell>{q.created_at.slice(0, 10)}</Table.Cell>
                <Table.Cell>{q.company?.name}</Table.Cell>
                <Table.Cell>{q.items.map((i) => i.title).join(", ")}</Table.Cell>
              </Table.Row>
              {open === q.id && (
                <tr><td colSpan={3}><Detail q={q} reload={reload} /></td></tr>
              )}
            </Fragment>
          ))}
        </Table.Body>
      </Table>
      {data && !data.count && <Text className="px-6 py-4 text-ui-fg-subtle">Nothing to route.</Text>}
    </Container>
  )
}

export const config = defineRouteConfig({ label: "RFQs to route" })
export default RfqsPage
