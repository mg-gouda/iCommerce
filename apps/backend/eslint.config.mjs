import base from "@icommerce/config/eslint"

export default [
  ...base,
  // medusa-config.ts uses CommonJS `module.exports`, per Medusa's starter.
  { files: ["medusa-config.ts"], rules: { "@typescript-eslint/no-require-imports": "off" } },
]
