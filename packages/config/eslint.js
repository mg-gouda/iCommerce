import js from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.medusa/**", "**/.next/**", "**/node_modules/**"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  // TS checks undefined names; no-undef only misfires on Node globals in .mjs scripts.
  { rules: { "no-undef": "off" } }
)
