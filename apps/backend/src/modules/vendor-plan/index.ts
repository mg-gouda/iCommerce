import { Module } from "@medusajs/framework/utils"
import VendorPlanModuleService from "./service"

export const VENDOR_PLAN_MODULE = "vendor_plan"

export default Module(VENDOR_PLAN_MODULE, { service: VendorPlanModuleService })
