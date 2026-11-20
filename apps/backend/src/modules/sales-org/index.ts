import { Module } from "@medusajs/framework/utils"
import SalesOrgModuleService from "./service"

export const SALES_ORG_MODULE = "sales_org"

export default Module(SALES_ORG_MODULE, { service: SalesOrgModuleService })
