import {
  type ITtscEvidenceProject,
  assertFailure,
  assertIncludes,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies a claim that cannot address code is refused the population through
 * the published consumer boundary.
 *
 * The rejection has to arrive at configuration decode rather than at
 * resolution, and only the real binary shows which one an author actually
 * meets. Landing it later would let a project build its whole graph before
 * reporting a pairing that could never have worked, and the message would be
 * about a target rather than about the configuration that made the target
 * unaddressable.
 *
 * The Markdown claim here is otherwise complete: the citation names a symbol
 * that exists and is selected. The only thing wrong is who is citing it.
 *
 * 1. Configure a Markdown claim over a TypeScript reference.
 * 2. Run the real `ttsc check`.
 * 3. Assert it fails naming the rule, the reason, and the inversion.
 */
export const test_evidence_graph_refuses_code_evidence_to_a_document =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "code-evidence-refused",
      lintConfig: [
        'import type { ITtscLintConfig } from "@ttsc/lint";',
        'import { evidence } from "@ttsc/evidence";',
        "",
        "export default {",
        '  plugins: { "evidence": evidence },',
        "  rules: {",
        '    "evidence/graph": ["error", {',
        "      claims: [{",
        '        type: "markdown",',
        '        files: ["docs/**/*.md"],',
        '        symbol: "file",',
        '        reference: { type: "typescript", files: ["src/**/*.ts"] },',
        "      }],",
        "    }],",
        "  },",
        "} satisfies ITtscLintConfig;",
        "",
      ].join("\n"),
      files: {
        "src/sale.ts": "export interface ISale {}\n",
        "docs/spec.md":
          "<!-- @evidence ISale This document relies on the sale contract. -->\n",
      },
    });
    try {
      const result = runCheck(project.directory);
      assertFailure(
        result,
        "A claim that cannot address code must be refused the population.",
      );
      assertIncludes(
        result,
        "only a TypeScript claim can cite TypeScript evidence",
        "The diagnostic must name the pairing rule.",
      );
      assertIncludes(
        result,
        "Invert the obligation",
        "The diagnostic must name the repair rather than only the refusal.",
      );
    } finally {
      project.cleanup();
    }
  };
