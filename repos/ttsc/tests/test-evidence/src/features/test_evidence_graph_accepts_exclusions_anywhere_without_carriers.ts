import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies the same graph accepts the same exclusion once the carrier selection
 * is removed.
 *
 * This is the control for
 * {@link test_evidence_graph_reports_an_exclusion_outside_its_carrier}: the
 * sources, the claim, and the reference are identical, and only
 * `evidenceExcludeCarriers` is gone. Without it, a passing run here would prove
 * nothing about confinement — the failure there could just as easily come from
 * a malformed fixture. It also pins the compatibility promise: the property is
 * opt-in, and its absence is the historical graph exactly.
 *
 * 1. Take the confined fixture and delete only the carrier selection.
 * 2. Leave the `@evidenceExclude` on the ordinary working host.
 * 3. Assert the real binary passes with nothing left owing.
 */
export const test_evidence_graph_accepts_exclusions_anywhere_without_carriers =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "exclusions-without-carriers",
      lintConfig: [
        'import type { ITtscLintConfig } from "@ttsc/lint";',
        'import { evidence, type ITtscEvidenceGraphConfig } from "@ttsc/evidence";',
        "",
        "const graph: ITtscEvidenceGraphConfig = {",
        "  claims: [",
        "    {",
        '      name: "operations",',
        '      type: "typescript",',
        '      files: ["src/**/*.ts"],',
        '      symbol: "function",',
        "      reference: {",
        '        type: "markdown",',
        '        files: ["docs/spec.md"],',
        '        symbol: "h2",',
        "      },",
        "    },",
        "  ],",
        "};",
        "",
        "export default {",
        "  plugins: { evidence },",
        '  rules: { "evidence/graph": ["error", graph] },',
        "} satisfies ITtscLintConfig;",
        "",
      ].join("\n"),
      files: {
        "docs/spec.md":
          "## Implemented {#implemented}\n\n## Deferred {#deferred}\n",
        "src/LEDGER.ts": [
          "/** Central exclusions for this package. */",
          "export const LEDGER = true;",
          "",
        ].join("\n"),
        "src/service.ts": [
          "/** @evidence docs/spec.md#implemented Implements the section. */",
          "export function implement(): void {}",
          "",
          "/** @evidenceExclude docs/spec.md#deferred No carrier is declared, so any host may hold this. */",
          "export function deferOperation(): void {}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(project.directory);
      assertStatus(
        result,
        0,
        "An undeclared carrier selection must leave every exclusion eligible.",
      );
      assertExcludes(
        result,
        "Misplaced @evidenceExclude",
        "An omitted property must confine no exclusion at all.",
      );
      assertExcludes(
        result,
        "Missing acknowledgement",
        "The exclusion must still discharge the obligation it names.",
      );
    } finally {
      project.cleanup();
    }
  };
