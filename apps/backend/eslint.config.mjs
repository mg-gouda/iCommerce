import base from "@icommerce/config/eslint"

export default [
  ...base,
  // CommonJS files, per Medusa starter + testing docs.
  { files: ["medusa-config.ts", "jest.config.js", "integration-tests/setup.js"], rules: { "@typescript-eslint/no-require-imports": "off" } },
]
