import { MedusaService } from "@medusajs/framework/utils"
import { Plan, VendorSubscription } from "./models/plan"

class VendorPlanModuleService extends MedusaService({ Plan, VendorSubscription }) {}

export default VendorPlanModuleService
