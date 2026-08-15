import type { ITtscLintConfig } from "@ttsc/lint";

/** The frontend package runs the shared rules plus the frontend baseline. */
export default {
  extends: "../../config/lint.config.frontend.ts",
} satisfies ITtscLintConfig;
