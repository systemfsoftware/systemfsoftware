import {
  type ITtscEvidenceProject,
  assertFailure,
  assertIncludes,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies a carrier set that selects nothing is reported where it was written.
 *
 * A misspelled carrier path refuses every exclusion the claim holds, and each
 * refusal reads as a placement error on a tag whose author did nothing wrong.
 * The configuration is where the mistake is, so that is where it has to be
 * named; otherwise the repair the diagnostics suggest — move the tag into a
 * file that does not exist — is one nobody can perform.
 *
 * 1. Confine a claim to a carrier path no file in its population matches.
 * 2. Assert the build fails naming the claim, the patterns, and the count of files
 *    they failed to select.
 */
export const test_evidence_graph_reports_an_unselected_exclusion_carrier =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "unselected-exclusion-carrier",
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
        '      evidenceExcludeCarriers: ["vendor/LEDGER.ts"],',
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
        "docs/spec.md": "## Implemented {#implemented}\n",
        "src/service.ts": [
          "/** @evidence docs/spec.md#implemented Implements the section. */",
          "export function implement(): void {}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(project.directory);
      assertFailure(
        result,
        "A carrier set selecting no claim file must fail rather than refuse silently.",
      );
      assertIncludes(
        result,
        "evidenceExcludeCarriers",
        "The finding must name the property that selected nothing.",
      );
      assertIncludes(
        result,
        "'vendor/LEDGER.ts'",
        "The finding must quote the patterns so the unselected path is visible.",
      );
    } finally {
      project.cleanup();
    }
  };
