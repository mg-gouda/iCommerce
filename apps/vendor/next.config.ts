import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const backend = new URL(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000")

const config: NextConfig = {
  transpilePackages: ["@icommerce/ui"],
  images: {
    remotePatterns: [{ protocol: backend.protocol.replace(":", "") as "http" | "https", hostname: backend.hostname, port: backend.port, pathname: "/static/**" }],
    // ponytail: dev backend serves files from localhost; Next 16 refuses local IPs unless allowed. R2/CDN in staging → false.
    dangerouslyAllowLocalIP: ["localhost", "127.0.0.1"].includes(backend.hostname),
  },
  // KYC: up to 10 files × 10 MB through a server action (and the proxy in front of it).
  experimental: { serverActions: { bodySizeLimit: "100mb" }, proxyClientMaxBodySize: "100mb" },
}

export default createNextIntlPlugin()(config)
