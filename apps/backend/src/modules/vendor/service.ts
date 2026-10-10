import { MedusaService } from "@medusajs/framework/utils"
import Vendor from "./models/vendor"
import VendorUser from "./models/vendor-user"

class VendorModuleService extends MedusaService({ Vendor, VendorUser }) {}

export default VendorModuleService
