import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { BankTransferPayment } from "../service"

export default ModuleProvider(Modules.PAYMENT, { services: [BankTransferPayment] })
