import { Module } from "@medusajs/framework/utils"
import FeeModuleService from "./service"

export const FEE_MODULE = "fee"

export default Module(FEE_MODULE, { service: FeeModuleService })
