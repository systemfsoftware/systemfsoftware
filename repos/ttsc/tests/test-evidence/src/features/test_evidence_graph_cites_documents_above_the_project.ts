import {
  type IRunResult,
  type ITtscEvidenceProject,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies a Markdown population declared above the ttsc project resolves, and
 * that its targets are addressed from the declared root.
 *
 * A monorepo keeps one requirements set that several packages implement
 * together, and each package is its own ttsc project. Before `root`, the
 * ceiling was that project root: the only ways to compile were duplicating the
 * documents per package or gating one package and leaving the rest open. The
 * root-relative address is what makes the escape adoptable rather than merely
 * possible — the same citation text works in every package that declares the
 * same base, so the sibling package copies the line and nothing else.
 *
 * 1. Write a requirements document beside the project rather than inside it.
 * 2. Cite it by its path inside the declared root, with no `..` in the target.
 * 3. Assert the real `ttsc check` closes the graph.
 */
export const test_evidence_graph_cites_documents_above_the_project =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "root-markdown",
      lintConfig: [
        'import type { ITtscLintConfig } from "@ttsc/lint";',
        'import { evidence, type ITtscEvidenceGraphConfig } from "@ttsc/evidence";',
        "",
        "const graph: ITtscEvidenceGraphConfig = {",
        "  claims: [{",
        '    type: "typescript",',
        '    files: ["src/**/*.ts"],',
        '    symbol: "type",',
        "    reference: {",
        '      type: "markdown",',
        '      root: "../docs",',
        '      files: ["requirements/**"],',
        '      symbol: "h2",',
        "    },",
        "  }],",
        "};",
        "",
        "export default {",
        '  plugins: { "evidence": evidence },',
        '  rules: { "evidence/graph": ["error", graph] },',
        "} satisfies ITtscLintConfig;",
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
        0,
        "A document set beside the project must be citable through a declared root.",
      );
    } finally {
      project.cleanup();
    }
  };
