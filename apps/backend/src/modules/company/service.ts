import { MedusaService } from "@medusajs/framework/utils"
import Company from "./models/company"
import CompanyInvitation from "./models/company-invitation"
import CompanyMember from "./models/company-member"
import { CreditAccount, Invoice } from "./models/credit"

class CompanyModuleService extends MedusaService({ Company, CompanyMember, CompanyInvitation, CreditAccount, Invoice }) {}

export default CompanyModuleService
