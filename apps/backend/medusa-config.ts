import { defineConfig, loadEnv } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const redisUrl = process.env.REDIS_URL

// Redis-backed infra when REDIS_URL set, else Medusa's in-memory/local defaults (dev/tests only).
// ponytail: new Caching module skipped, still behind WIP flag MEDUSA_FF_CACHING in 2.21; legacy cache-redis wired instead.
const redisModules = redisUrl
  ? [
      { resolve: "@medusajs/medusa/cache-redis", options: { redisUrl } },
      { resolve: "@medusajs/medusa/event-bus-redis", options: { redisUrl } },
      { resolve: "@medusajs/medusa/workflow-engine-redis", options: { redis: { redisUrl } } },
      {
        resolve: "@medusajs/medusa/locking",
        options: {
          providers: [
            { resolve: "@medusajs/medusa/locking-redis", id: "locking-redis", is_default: true, options: { redisUrl } },
          ],
        },
      },
    ]
  : []

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
      authMethodsPerActor: { vendor: ["emailpass"] },
    },
  },
  modules: [
    { resolve: "./src/modules/vendor" },
    { resolve: "./src/modules/product-extra" },
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            // ponytail: local disk in dev; swap for file-s3 (R2, private bucket) before staging.
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: { private_upload_dir: "uploads/private" },
          },
        ],
      },
    },
    ...redisModules,
  ],
})
