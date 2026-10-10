import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const config: NextConfig = {
  transpilePackages: ["@icommerce/ui"],
}

export default createNextIntlPlugin()(config)
