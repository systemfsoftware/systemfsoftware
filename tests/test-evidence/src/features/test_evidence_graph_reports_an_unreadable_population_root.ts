import {
  type IRunResult,
  type ITtscEvidenceProject,
  assertExcludes,
  assertIncludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies a `root` that names no directory is reported as a root, naming both
 * the spelling the author wrote and the location it resolved to.
 *
 * A root off by one segment is the mistake this property introduces, and the
 * population it selects is then empty for a reason no pattern explains. The
 * resolved path is in the message because that is the whole question once a
 * root ascends: `../documents` is either the right directory or a directory
 * nobody created, and nothing in the configuration distinguishes the two.
 *
 * 1. Declare a root one segment away from the shared documents.
 * 2. Run the real `ttsc check`.
 * 3. Assert the diagnostic names the root as written and as resolved.
 */
export const test_evidence_graph_reports_an_unreadable_population_root =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "root-missing",
      lintConfig: [
        'import evidence from "@ttsc/evidence";',
        "",
        "export default {",
        '  plugins: { "evidence": evidence },',
        "  rules: {",
        '    "evidence/graph": ["error", {',
        "      claims: [",
        "        {",
        '          type: "typescript",',
        '          files: ["src/**/*.ts"],',
        '          symbol: "type",',
        "          reference: {",
        '            type: "markdown",',
        '            root: "../documents",',
        '            files: ["requirements/**"],',
        '            symbol: "h2",',
        "          },",
        "        },",
        "      ],",
        "    }],",
        "  },",
        "};",
        "",
      ].join("\n"),
      workspaceFiles: {
        "docs/requirements/pricing.md": "## Discount Policy {#discounts}\n",
      },
      files: {
        "src/sale.ts": [
          "/** @evidence requirements/pricing.md#discounts Discount stacking follows this section. */",
          "export interface ISale {}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result: IRunResult = runCheck(project.directory);
      assertStatus(
        result,
        2,
        "A population whose root does not exist must fail rather than pass vacuously.",
      );
      assertIncludes(
        result,
        "could not read the markdown root '../documents', which resolves to '",
        "The diagnostic must name the property the author edits and the directory it landed on.",
      );
      assertExcludes(
        result,
        "Unresolved evidence target",
        "A failed population cannot prove that its declaration target is unresolved.",
      );
    } finally {
      project.cleanup();
    }
  };
