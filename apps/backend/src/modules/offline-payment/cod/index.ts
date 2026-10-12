import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { CodPayment } from "../service"

export default ModuleProvider(Modules.PAYMENT, { services: [CodPayment] })
