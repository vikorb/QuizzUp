import js from "@eslint/js"
import globals from "globals"
import vue from "eslint-plugin-vue"
import tseslint from "typescript-eslint"
import eslintConfigPrettier from "eslint-config-prettier"

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.vite/**",
      "**/.output/**",
      "**/build/**"
    ]
  },

  js.configs.recommended,

  {
    files: ["**/backend/**/*.{js,cjs,mjs}"],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "commonjs"
    },
    rules: {
      "no-console": "off"
    }
  },

  ...tseslint.configs.recommended.map((c) => ({
    ...c,
    files: ["frontend/**/*.{ts,tsx,vue}"]
  })),

  ...vue.configs["flat/recommended"].map((c) => ({
    ...c,
    files: ["frontend/**/*.vue"]
  })),

  eslintConfigPrettier
]
