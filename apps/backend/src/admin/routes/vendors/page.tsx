import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Table, Text } from "@medusajs/ui"
import { useState } from "react"
import { act, api, selectCls, useGet } from "../../lib"

type Vendor = {
  id: string; name: string; handle: string; status: string; kyc_status: string; kyc_note: string | null
  tax_id: string | null; commercial_reg_no: string | null; kyc_files: { id: string; filename: string }[] | null
}
const tone = { approved: "green", pending: "orange", suspended: "red" } as const

const VendorsPage = () => {
  const [status, setStatus] = useState("pending")
  const { data, error, reload } = useGet<{ vendors: Vendor[]; count: number }>(`/admin/vendors?limit=100${status ? `&status=${status}` : ""}`)
  const [note, setNote] = useState("")
  const run = (id: string, action: string) => act(() => api(`/admin/vendors/${id}/${action}`, { note: note || undefined }), reload)
  return (
    <Container className="p-0 divide-y">
      <div className="flex items-center justify-between px-6 py-4 gap-2">
        <Heading>Vendors</Heading>
        <div className="flex gap-2">
          <Input size="small" placeholder="Note (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} className="w-64" />
          <select aria-label="Status" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {Object.keys(tone).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {error && <Text className="px-6 py-4 text-ui-fg-error">{error}</Text>}
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Vendor</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
            <Table.HeaderCell>KYC</Table.HeaderCell>
            <Table.HeaderCell>Documents</Table.HeaderCell>
            <Table.HeaderCell />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data?.vendors.map((v) => (
            <Table.Row key={v.id}>
              <Table.Cell>{v.name}<Text size="xsmall" className="text-ui-fg-subtle">Tax {v.tax_id ?? "—"} · CR {v.commercial_reg_no ?? "—"}</Text></Table.Cell>
              <Table.Cell><Badge size="2xsmall" color={tone[v.status as keyof typeof tone]}>{v.status}</Badge></Table.Cell>
              <Table.Cell>{v.kyc_status}{v.kyc_note ? ` (${v.kyc_note})` : ""}</Table.Cell>
              <Table.Cell>
                {(v.kyc_files ?? []).map((f) => (
                  <a key={f.id} className="text-ui-fg-interactive underline me-2" href={`/admin/vendors/${v.id}/kyc-files/${encodeURIComponent(f.id)}`}>{f.filename}</a>
                ))}
              </Table.Cell>
              <Table.Cell>
                <div className="flex gap-1">
                  <Button size="small" onClick={run(v.id, "approve")}>Approve</Button>
                  <Button size="small" variant="secondary" onClick={run(v.id, "reject")}>Reject</Button>
                  <Button size="small" variant="danger" onClick={run(v.id, "suspend")}>Suspend</Button>
                </div>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      {data && !data.count && <Text className="px-6 py-4 text-ui-fg-subtle">No vendors.</Text>}
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Vendors" })
export default VendorsPage
