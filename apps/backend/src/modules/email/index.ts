import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { AbstractNotificationProviderService, MedusaError, ModuleProvider, Modules } from "@medusajs/framework/utils"
import type { ProviderSendNotificationDTO, ProviderSendNotificationResultsDTO } from "@medusajs/framework/types"

// Channel "email". RESEND_API_KEY set → Resend HTTP API (no SDK needed); else the rendered
// email is written to EMAILS_DIR (default apps/backend/.emails, gitignored) for dev + tests.
class EmailProvider extends AbstractNotificationProviderService {
  static identifier = "email"

  async send(n: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    const subject = n.content?.subject ?? n.template
    const html = n.content?.html ?? ""
    const key = process.env.RESEND_API_KEY
    if (key) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from: n.from ?? process.env.EMAIL_FROM ?? "iCommerce <onboarding@resend.dev>", to: n.to, subject, html }),
      })
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
      if (!res.ok) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `Resend: ${body.message ?? res.status}`)
      return { id: body.id }
    }
    const dir = process.env.EMAILS_DIR ?? join(process.cwd(), ".emails")
    await mkdir(dir, { recursive: true })
    const file = join(dir, `${Date.now()}-${n.template}-${n.to.replace(/[^a-z0-9@.-]+/gi, "_")}.html`)
    await writeFile(file, `<!-- to: ${n.to} | subject: ${subject} -->\n${html}`)
    return { id: file }
  }
}

export default ModuleProvider(Modules.NOTIFICATION, { services: [EmailProvider] })
