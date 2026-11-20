import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Table, Text } from "@medusajs/ui"
import { Fragment, useState } from "react"
import { api, selectCls, useGet } from "../../lib"

type Conv = { id: string; subject: string | null; custom: Record<string, string>; participants: string[]; created_at: string; last_message_at: string | null }
type Msg = { id: string; sender_id: string | null; type: string; text: string | null; created_at: string }

/** Read-only transcript (disputes) + "Join as support" (adds `ops`, who then gets TalkJS notifications). */
function Transcript({ c }: { c: Conv }) {
  const { data, error } = useGet<{ messages: Msg[] }>(`/admin/chat/conversations/${encodeURIComponent(c.id)}/messages?limit=100`)
  const [joined, setJoined] = useState(c.participants.includes("ops"))
  return (
    <div className="flex flex-col gap-2 p-4 bg-ui-bg-subtle">
      {error && <Text size="small" className="text-ui-fg-error">{error}</Text>}
      {data && !data.messages.length && <Text size="small" className="text-ui-fg-subtle">No messages yet.</Text>}
      <ol className="flex flex-col gap-1">
        {data?.messages.map((m) => (
          <li key={m.id}>
            <Text size="small"><span className="text-ui-fg-subtle">{m.created_at.slice(0, 16).replace("T", " ")} · {m.sender_id ?? "system"}:</span> <span dir="auto">{m.text ?? `[${m.type}]`}</span></Text>
          </li>
        ))}
      </ol>
      <Button size="small" variant="secondary" className="self-start" disabled={joined}
        onClick={() => api(`/admin/chat/conversations/${encodeURIComponent(c.id)}/join`, {}).then(() => setJoined(true), (e: Error) => window.alert(e.message))}>
        {joined ? "Support has joined" : "Join as support"}
      </Button>
    </div>
  )
}

const ConversationsPage = () => {
  const [kind, setKind] = useState("")
  const [vendor, setVendor] = useState("")
  const [customer, setCustomer] = useState("")
  const qs = new URLSearchParams({ limit: "100", ...(kind && { kind }), ...(vendor.trim() && { vendor_id: vendor.trim() }), ...(customer.trim() && { customer_id: customer.trim() }) })
  const { data, error } = useGet<{ conversations: Conv[]; count: number }>(`/admin/chat/conversations?${qs}`)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Container className="p-0 divide-y">
      <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
        <Heading>Conversations</Heading>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Kind" className={selectCls} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All kinds</option>
            {["product", "order", "quote"].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <Input size="small" aria-label="Vendor id" placeholder="Vendor id (ven_…)" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          <Input size="small" aria-label="Customer id" placeholder="Customer id (cus_…)" value={customer} onChange={(e) => setCustomer(e.target.value)} />
        </div>
      </div>
      {error && <Text className="px-6 py-4 text-ui-fg-error">{error}</Text>}
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Last activity</Table.HeaderCell>
            <Table.HeaderCell>Kind</Table.HeaderCell>
            <Table.HeaderCell>Subject</Table.HeaderCell>
            <Table.HeaderCell>Participants</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data?.conversations.map((c) => (
            <Fragment key={c.id}>
              <Table.Row className="cursor-pointer" onClick={() => setOpen(open === c.id ? null : c.id)}>
                <Table.Cell>{(c.last_message_at ?? c.created_at).slice(0, 10)}</Table.Cell>
                <Table.Cell>{c.custom.kind}</Table.Cell>
                <Table.Cell>{c.subject}</Table.Cell>
                <Table.Cell>{c.participants.join(", ")}</Table.Cell>
              </Table.Row>
              {open === c.id && <tr><td colSpan={4}><Transcript c={c} /></td></tr>}
            </Fragment>
          ))}
        </Table.Body>
      </Table>
      {data && !data.count && <Text className="px-6 py-4 text-ui-fg-subtle">No conversations.</Text>}
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Conversations" })
export default ConversationsPage
