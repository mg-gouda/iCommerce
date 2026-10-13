import { MedusaService } from "@medusajs/framework/utils"
import { Quote, QuoteItem, QuoteMessage } from "./models/quote"

class QuoteModuleService extends MedusaService({ Quote, QuoteItem, QuoteMessage }) {}

export default QuoteModuleService
