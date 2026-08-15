import type { ITtscLintConfig } from "@ttsc/lint";

/** The contract package runs the shared workspace rules. */
export default {
  extends: "../../config/lint.config.ts",
  ignores: ["src/functional/**/*.ts"],
} satisfies ITtscLintConfig;
