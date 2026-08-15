import {
  type ITtscEvidenceProject,
  assertFailure,
  assertIncludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies the packaged rule resolves an inline link target through the citing
 * module's imports, and refuses one that has no import behind it.
 *
 * This is the defect the grammar exists to close, checked where it matters: a
 * consumer's build. Both modules declare a callable named `get`, which the old
 * global table reported as ambiguous with no rename able to fix it — so the
 * accepting half also pins that the collision is gone, not merely tolerated.
 *
 * 1. Declare `get` in two API modules and cite each from its own view.
 * 2. Assert a clean exit with no ambiguity diagnostic.
 * 3. Assert the twin, whose citation has no import, fails and names the repair.
 */
export const test_evidence_link_target_requires_a_real_import = (): void => {
  const lintConfig: string = [
    'import type { ITtscLintConfig } from "@ttsc/lint";',
    'import { evidence, type ITtscEvidenceGraphConfig } from "@ttsc/evidence";',
    "",
    "const graph: ITtscEvidenceGraphConfig = {",
    "  claims: [{",
    '    type: "typescript",',
    '    files: ["src/views/**"],',
    '    symbol: "function",',
    "    reference: {",
    '      type: "typescript",',
    '      files: ["src/api/**"],',
    '      symbol: "function",',
    "    },",
    "  }],",
    "};",
    "",
    "export default {",
    '  plugins: { "evidence": evidence },',
    '  rules: { "evidence/graph": ["error", graph] },',
    "} satisfies ITtscLintConfig;",
    "",
  ].join("\n");
  const api: Readonly<Record<string, string>> = {
    "src/api/questions.ts": "export function get(): void {}\n",
    "src/api/reviews.ts": "export function get(): void {}\n",
  };

  const resolved: ITtscEvidenceProject = createProject({
    name: "link-import-scope",
    lintConfig,
    files: {
      ...api,
      "src/views/question.ts": [
        'import type * as questions from "../api/questions.js";',
        "",
        "/**",
        " * @evidence {@link questions.get} Renders the question operation.",
        " */",
        "export function question(): void {}",
        "",
      ].join("\n"),
      "src/views/review.ts": [
        'import type * as reviews from "../api/reviews.js";',
        "",
        "/**",
        " * @evidence {@link reviews.get} Renders the review operation.",
        " */",
        "export function review(): void {}",
        "",
      ].join("\n"),
    },
  });
  try {
    const result = runCheck(resolved.directory);
    assertStatus(
      result,
      0,
      "Two modules exporting the same leaf name must both resolve through their own imports.",
    );
  } finally {
    resolved.cleanup();
  }

  const unimported: ITtscEvidenceProject = createProject({
    name: "link-no-import",
    lintConfig,
    files: {
      ...api,
      "src/views/question.ts": [
        "/**",
        " * @evidence {@link questions.get} Renders the question operation.",
        " */",
        "export function question(): void {}",
        "",
      ].join("\n"),
      "src/views/review.ts": [
        'import type * as reviews from "../api/reviews.js";',
        "",
        "/**",
        " * @evidence {@link reviews.get} Renders the review operation.",
        " */",
        "export function review(): void {}",
        "",
      ].join("\n"),
    },
  });
  try {
    const result = runCheck(unimported.directory);
    assertFailure(
      result,
      "A citation with no import behind it must fail the build.",
    );
    assertIncludes(
      result,
      "Unimported evidence target",
      "The diagnostic must say the symbol is not imported, not merely unresolved.",
    );
  } finally {
    unimported.cleanup();
  }
};
