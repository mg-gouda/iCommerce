import { MedusaService } from "@medusajs/framework/utils"
import CommissionRule from "./models/commission-rule"

class CommissionModuleService extends MedusaService({ CommissionRule }) {}

export default CommissionModuleService
