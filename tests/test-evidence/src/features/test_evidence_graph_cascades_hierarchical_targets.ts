import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies hierarchical targets through the real binary: Markdown files and
 * TypeScript namespaces acknowledge their selected descendants.
 *
 * Unit tests can prove the graph evaluator, but not that the published
 * descriptor links the changed Go package or that the consumer's typed config
 * reaches it. This fixture crosses both hierarchy directions and exercises the
 * new namespace and variable materializers.
 *
 * 1. Cite an H2/H3 document through its unselected file ancestor.
 * 2. Cite namespace function/property units through their unselected type
 *    ancestor.
 * 3. Assert the consumer build has no unresolved or missing evidence.
 */
export const test_evidence_graph_cascades_hierarchical_targets = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "hierarchical-targets",
    lintConfig: [
      'import type { ITtscLintConfig } from "@ttsc/lint";',
      'import { evidence } from "@ttsc/evidence";',
      "",
      "export default {",
      '  plugins: { "evidence": evidence },',
      "  rules: {",
      '    "evidence/graph": ["error", {',
      "      claims: [",
      "        {",
      '          type: "typescript",',
      '          files: ["src/implementation.ts"],',
      '          symbol: "type",',
      '          reference: { type: "markdown", files: ["docs/spec.md"], symbol: ["h2", "h3"] },',
      "        },",
      "        {",
      '          type: "typescript",',
      '          files: ["src/ledger.ts"],',
      '          symbol: "type",',
      '          reference: { type: "typescript", files: ["src/implementation.ts"], symbol: ["function", "property"] },',
      "        },",
      "      ],",
      "    }],",
      "  },",
      "} satisfies ITtscLintConfig;",
      "",
    ].join("\n"),
    files: {
      "docs/spec.md": ["## Orders", "", "### Retry", ""].join("\n"),
      "src/implementation.ts": [
        "/** @evidence docs/spec.md The namespace implements the complete order specification. */",
        "export namespace Implementation {",
        '  export const state = "ready";',
        "  export function run(): void {}",
        "}",
        "",
      ].join("\n"),
      "src/ledger.ts": [
        'import type { Implementation } from "./implementation.js";',
        "",
        "/** @evidence {@link Implementation} The ledger documents the complete implementation namespace. */",
        "export interface ILedger {}",
        "",
      ].join("\n"),
    },
  });
  try {
    const result = runCheck(project.directory);
    assertStatus(
      result,
      0,
      "Ancestor targets must satisfy selected descendant obligations through the packaged contributor.",
    );
    assertExcludes(
      result,
      "Unresolved evidence target",
      "Both unselected ancestors must remain resolvable citation scopes.",
    );
    assertExcludes(
      result,
      "Missing acknowledgement",
      "Both descendant populations must be covered by their ancestors.",
    );
  } finally {
    project.cleanup();
  }
};
