import { MedusaService } from "@medusajs/framework/utils"
import { LedgerEntry, PayoutBatch } from "./models/ledger"

class PayoutModuleService extends MedusaService({ LedgerEntry, PayoutBatch }) {}

export default PayoutModuleService
