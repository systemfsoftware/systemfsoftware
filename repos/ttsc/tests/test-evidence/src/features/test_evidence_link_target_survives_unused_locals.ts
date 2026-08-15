import {
  type ITtscEvidenceProject,
  assertIncludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies the single assumption the `{@link}` target grammar rests on: an
 * import that exists only to support a citation survives `noUnusedLocals`.
 *
 * The braces are not decoration. TypeScript resolves a name inside an inline
 * link and counts it as a use, while it never resolves names inside an unknown
 * tag such as `@evidence` — so the unbraced form leaves the import
 * unreferenced. If that difference did not exist, citing code from code would
 * force every consumer to disable `noUnusedLocals`, and the design would be
 * void. The evidence rules stay off here on purpose: what is under test is
 * TypeScript's own behavior, not this plugin's.
 *
 * 1. Import a module as type-only and reference it from `@evidence {@link ...}`.
 * 2. Compile with `noUnusedLocals` and assert a clean exit.
 * 3. Assert the unbraced twin, one property away, raises TS6133.
 */
export const test_evidence_link_target_survives_unused_locals = (): void => {
  const contracts: string = [
    "export interface ISale {",
    "  price: number;",
    "}",
    "",
  ].join("\n");
  const lintConfig: string = [
    'import { evidence } from "@ttsc/evidence";',
    "",
    "export default {",
    '  plugins: { "evidence": evidence },',
    "  rules: {},",
    "};",
    "",
  ].join("\n");

  const braced: ITtscEvidenceProject = createProject({
    name: "link-unused-locals",
    compilerOptions: { noUnusedLocals: true },
    lintConfig,
    files: {
      "src/contracts.ts": contracts,
      "src/view.ts": [
        'import type * as contracts from "./contracts.js";',
        "",
        "/**",
        " * @evidence {@link contracts.ISale} Renders the documented sale contract.",
        " */",
        "export const view = (): void => {};",
        "",
      ].join("\n"),
    },
  });
  try {
    const result = runCheck(braced.directory);
    assertStatus(
      result,
      0,
      "A citation-only import referenced from {@link} must survive noUnusedLocals.",
    );
  } finally {
    braced.cleanup();
  }

  const unbraced: ITtscEvidenceProject = createProject({
    name: "link-unused-locals-twin",
    compilerOptions: { noUnusedLocals: true },
    lintConfig,
    files: {
      "src/contracts.ts": contracts,
      "src/view.ts": [
        'import type * as contracts from "./contracts.js";',
        "",
        "/**",
        " * @evidence contracts.ISale Renders the documented sale contract.",
        " */",
        "export const view = (): void => {};",
        "",
      ].join("\n"),
    },
  });
  try {
    const result = runCheck(unbraced.directory);
    assertIncludes(
      result,
      "TS6133",
      "An unbraced target is plain text to TypeScript, so the import stays unused.",
    );
  } finally {
    unbraced.cleanup();
  }
};
