import {
  type ITtscEvidenceProject,
  assertFailure,
  assertIncludes,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies a globally resolving exclusion must join an owned reference.
 *
 * The complete graph shares one target index, so a tag can resolve against a
 * source exposed only by another claim. Resolution alone is not participation:
 * accepting that tag would make a reviewed-looking exclusion change no
 * obligation while the claim it appears in remains incomplete.
 *
 * 1. Expose one Markdown target only through a second TypeScript claim.
 * 2. Exclude it from the first claim, whose reference selects another file.
 * 3. Assert the real binary names the inert tag and its owning obligation.
 */
export const test_evidence_graph_reports_non_participating_exclusion =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "non-participating-exclusion",
      lintConfig: [
        'import { evidence } from "@ttsc/evidence";',
        "",
        "export default {",
        '  plugins: { "evidence": evidence },',
        "  rules: {",
        '    "evidence/graph": ["error", { claims: [',
        "      {",
        '        name: "first",',
        '        type: "typescript",',
        '        files: ["src/first.ts"],',
        '        symbol: "type",',
        '        reference: { type: "markdown", files: ["docs/first.md"], symbol: "h2" },',
        "      },",
        "      {",
        '        name: "second",',
        '        type: "typescript",',
        '        files: ["src/second.ts"],',
        '        symbol: "type",',
        '        reference: { type: "markdown", files: ["docs/second.md"], symbol: "h2" },',
        "      },",
        "    ] }],",
        "  },",
        "};",
        "",
      ].join("\n"),
      files: {
        "docs/first.md": "## First\n",
        "docs/second.md": "## Second\n",
        "src/first.ts": [
          "/** @evidenceExclude docs/second.md#second This exclusion belongs to no reference of this claim. */",
          "export interface First {}",
          "",
        ].join("\n"),
        "src/second.ts": [
          "/** @evidence docs/second.md#second This claim owns the target. */",
          "export interface Second {}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(project.directory);
      assertFailure(
        result,
        "A resolving exclusion that changes no obligation must fail the build.",
      );
      assertIncludes(
        result,
        "Non-participating @evidenceExclude target 'docs/second.md#second'",
        "The diagnostic must distinguish inert participation from failed resolution.",
      );
      assertIncludes(
        result,
        "Claim 1 ('first') across reference 1",
        "The diagnostic must name the claim and reference the tag failed to join.",
      );
    } finally {
      project.cleanup();
    }
  };
