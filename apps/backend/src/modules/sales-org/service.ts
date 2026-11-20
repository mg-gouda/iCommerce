import { MedusaService } from "@medusajs/framework/utils"
import { Assignment, Branch, ReportLine, SalesRep } from "./models/sales-org"

class SalesOrgModuleService extends MedusaService({ Branch, SalesRep, Assignment, ReportLine }) {}

export default SalesOrgModuleService
