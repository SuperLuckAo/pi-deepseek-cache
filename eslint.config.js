import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // tests/ 大量使用宽松的 mock / 测试替身（`as any`、`Function`）：断言目标是行为，
    // 不是形状，强行给每个替身写完整类型会降低测试可读性而几乎不增加捕获力。
    // 源码 index.ts 保持严格，不在此列。
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
    },
  },
  {
    ignores: ["node_modules/", "dist/"],
  },
);
