import { MedusaService } from "@medusajs/framework/utils"
import FeeTier from "./models/fee-tier"

class FeeModuleService extends MedusaService({ FeeTier }) {}

export default FeeModuleService
