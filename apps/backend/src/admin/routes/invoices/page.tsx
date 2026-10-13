import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Table, Text } from "@medusajs/ui"
import { useState } from "react"
import { act, api, selectCls, useGet } from "../../lib"

type Invoice = { id: string; display_id: number | null; amount: number; due_date: string; status: string; company: { name: string | null } }
const tone = { open: "orange", overdue: "red", paid: "green" } as const

const InvoicesPage = () => {
  const [status, setStatus] = useState("")
  const { data, error, reload } = useGet<{ invoices: Invoice[]; count: number }>(`/admin/invoices?limit=100${status ? `&status=${status}` : ""}`)
  return (
    <Container className="p-0 divide-y">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading>Invoices (net terms)</Heading>
        <select aria-label="Status" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {Object.keys(tone).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {error && <Text className="px-6 py-4 text-ui-fg-error">{error}</Text>}
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Company</Table.HeaderCell>
            <Table.HeaderCell>Order</Table.HeaderCell>
            <Table.HeaderCell>Amount</Table.HeaderCell>
            <Table.HeaderCell>Due</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
            <Table.HeaderCell />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data?.invoices.map((i) => (
            <Table.Row key={i.id}>
              <Table.Cell>{i.company.name}</Table.Cell>
              <Table.Cell>#{i.display_id}</Table.Cell>
              <Table.Cell>USD {i.amount.toFixed(2)}</Table.Cell>
              <Table.Cell>{i.due_date.slice(0, 10)}</Table.Cell>
              <Table.Cell><Badge size="2xsmall" color={tone[i.status as keyof typeof tone]}>{i.status}</Badge></Table.Cell>
              <Table.Cell>
                {i.status !== "paid" && (
                  <Button size="small" variant="secondary" onClick={act(() => api(`/admin/invoices/${i.id}/mark-paid`, {}), reload)}>Mark paid</Button>
                )}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      {data && !data.count && <Text className="px-6 py-4 text-ui-fg-subtle">No invoices.</Text>}
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Invoices" })
export default InvoicesPage
