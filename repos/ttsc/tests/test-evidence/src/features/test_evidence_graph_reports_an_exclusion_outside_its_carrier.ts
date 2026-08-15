import {
  type ITtscEvidenceProject,
  assertFailure,
  assertIncludes,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies an exclusion written outside its declared carriers fails and covers
 * nothing.
 *
 * A confinement that only warned would be worse than no confinement at all: the
 * exclusion would still discharge the obligation, and the team policy the
 * property encodes — reviewed non-applicability belongs in one auditable ledger
 * — would hold only for authors who read diagnostics. The refusal therefore has
 * to do both things at once, so the target it names remains owed.
 *
 * 1. Confine a claim's exclusions to a ledger file that exists and is clean.
 * 2. Write the `@evidenceExclude` on an ordinary working host instead.
 * 3. Assert the build fails, the repair names the configured carrier, and the
 *    target is still reported as missing acknowledgement.
 */
export const test_evidence_graph_reports_an_exclusion_outside_its_carrier =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "exclusion-outside-carrier",
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
        '      evidenceExcludeCarriers: ["src/LEDGER.ts"],',
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
          "/** @evidenceExclude docs/spec.md#deferred This working host is not a declared carrier. */",
          "export function deferOperation(): void {}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(project.directory);
      assertFailure(
        result,
        "An exclusion outside every declared carrier must fail the build.",
      );
      assertIncludes(
        result,
        "Misplaced @evidenceExclude",
        "The finding must read as a placement error, not a resolution failure.",
      );
      assertIncludes(
        result,
        "evidenceExcludeCarriers",
        "The repair must name the property that confined the exclusion.",
      );
      assertIncludes(
        result,
        "'src/LEDGER.ts'",
        "The repair must name the configured carrier the exclusion belongs in.",
      );
      assertIncludes(
        result,
        "Missing acknowledgement for 'docs/spec.md#deferred'",
        "A refused exclusion must grant no coverage, leaving its target owed.",
      );
    } finally {
      project.cleanup();
    }
  };
