import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies a declared carrier keeps its own exclusion eligible and discharging.
 *
 * `evidenceExcludeCarriers` is a confinement, not a new permission: the file it
 * names must keep exactly the eligibility it already had, or declaring the
 * property would break the ledgers it exists to protect. This fixture proves
 * the public property survives the typed config, the native decoder, and the
 * shipped Go contributor, and that the confined exclusion still covers its
 * target.
 *
 * 1. Confine a TypeScript claim's exclusions to one central ledger file.
 * 2. Write the only `@evidenceExclude` inside that ledger.
 * 3. Assert the real binary passes with no obligation left owing.
 */
export const test_evidence_graph_confines_exclusions_to_declared_carriers =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "declared-exclusion-carriers",
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
          "/**",
          " * Central exclusions for this package.",
          " *",
          " * @evidenceExclude docs/spec.md#deferred This package intentionally implements no operation for the section.",
          " */",
          "export const LEDGER = true;",
          "",
        ].join("\n"),
        "src/service.ts": [
          "/** @evidence docs/spec.md#implemented Implements the section. */",
          "export function implement(): void {}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(project.directory);
      assertStatus(
        result,
        0,
        "An exclusion inside its declared carrier must remain eligible.",
      );
      assertExcludes(
        result,
        "Missing acknowledgement",
        "A confined exclusion must still discharge the obligation it names.",
      );
      assertExcludes(
        result,
        "Misplaced @evidenceExclude",
        "A carrier that holds its own exclusion must draw no placement repair.",
      );
    } finally {
      project.cleanup();
    }
  };
