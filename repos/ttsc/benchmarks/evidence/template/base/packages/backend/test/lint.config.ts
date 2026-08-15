import type { ITtscLintConfig } from "@ttsc/lint";

/** The backend test Program inherits the package policy from its root. */
export default {
  extends: "../lint.config.ts",
} satisfies ITtscLintConfig;
