import {
  type IRunResult,
  type ITtscEvidenceProject,
  assertIncludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies the negative twin of the rooted Markdown population case.
 *
 * 1. Select two sections of the shared document and cite only one.
 * 2. Assert the check fails.
 * 3. Assert the diagnostic carries the rooted target and ascending path.
 */
export const test_evidence_graph_reports_an_uncited_document_above_the_project =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "root-markdown-uncited",
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
        "docs/requirements/pricing.md": [
          "## Discount Policy {#discounts}",
          "",
          "## Refund Policy {#refunds}",
          "",
        ].join("\n"),
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
        "An uncited section of a shared document set must still fail the build.",
      );
      assertIncludes(
        result,
        "Missing acknowledgement for 'requirements/pricing.md#refunds'",
        "The target must stay relative to the declared root.",
      );
      assertIncludes(
        result,
        "at ../docs/requirements/pricing.md:3",
        "The location must ascend out of the project.",
      );
    } finally {
      project.cleanup();
    }
  };
