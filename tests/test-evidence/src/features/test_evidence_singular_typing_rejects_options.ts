import {
  type ITtscEvidenceProject,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies the optionless typing of `evidence/singular` in a real consumer
 * config.
 *
 * A contributor rule that augments neither typing map falls back to an open
 * index signature whose options slot is `unknown`, so a consumer passing
 * options to an optionless rule gets no warning at all. That failure is
 * invisible from the plugin side — the rule still works — which is why the
 * contract is pinned here rather than assumed from the augmentation's
 * presence.
 *
 * 1. Accept the bare severity form under `satisfies ITtscLintConfig`.
 * 2. Guard an options tuple with `@ts-expect-error`, which the compiler reports as
 *    an unused directive if the type does not in fact reject it.
 * 3. Assert `ttsc check` exits clean, meaning the rejection happened.
 */
export const test_evidence_singular_typing_rejects_options = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "singular-typing",
    lintConfig: [
      'import type { ITtscLintConfig } from "@ttsc/lint";',
      'import { evidence } from "@ttsc/evidence";',
      "",
      "const accepted = {",
      '  plugins: { "evidence": evidence },',
      '  files: ["src/**"],',
      '  rules: { "evidence/singular": "error" },',
      "} satisfies ITtscLintConfig;",
      "",
      "const rejected = {",
      '  plugins: { "evidence": evidence },',
      '  files: ["src/**"],',
      "  rules: {",
      "    // @ts-expect-error an optionless rule must not accept an options slot",
      '    "evidence/singular": ["error", { anything: true }],',
      "  },",
      "} satisfies ITtscLintConfig;",
      "",
      "void rejected;",
      "",
      "export default accepted;",
      "",
    ].join("\n"),
    files: {
      "src/handler.ts": ["export const handler = (): void => {};", ""].join(
        "\n",
      ),
    },
  });
  try {
    const result = runCheck(project.directory);
    assertStatus(
      result,
      0,
      "The optionless augmentation must reject an options slot, and the bare severity form must stay valid.",
    );
  } finally {
    project.cleanup();
  }
};
