import {
  type ITtscEvidenceProject,
  assertFailure,
  assertIncludes,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies that separate claims cannot pool partial coverage.
 *
 * Each claim below acknowledges a different half of the same evidence. A global
 * acknowledgement set would report full coverage, but the public contract
 * requires both claiming populations to account for both evidence units
 * independently.
 *
 * 1. Define two Markdown H2 evidence units behind two claims.
 * 2. Let each TypeScript claim cite only the other claim's missing unit.
 * 3. Assert that both claim-specific missing acknowledgements are reported.
 */
export const test_evidence_graph_keeps_claims_independent = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "independent-claims",
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
      '          files: ["src/team-a.ts"],',
      '          symbol: "function",',
      '          reference: { type: "markdown", files: ["docs/spec.md"], symbol: "h2" },',
      "        },",
      "        {",
      '          type: "typescript",',
      '          files: ["src/team-b.ts"],',
      '          symbol: "function",',
      '          reference: { type: "markdown", files: ["docs/spec.md"], symbol: "h2" },',
      "        },",
      "      ],",
      "    }],",
      "  },",
      "} satisfies ITtscLintConfig;",
      "",
    ].join("\n"),
    files: {
      "docs/spec.md": ["## Alpha {#alpha}", "", "## Beta {#beta}", ""].join(
        "\n",
      ),
      "src/team-a.ts": [
        "/** @evidence docs/spec.md#alpha Team A implements Alpha. */",
        "export function alpha(): void {}",
        "",
      ].join("\n"),
      "src/team-b.ts": [
        "/** @evidence docs/spec.md#beta Team B implements Beta. */",
        "export function beta(): void {}",
        "",
      ].join("\n"),
    },
  });
  try {
    const result = runCheck(project.directory);
    assertFailure(
      result,
      "Incomplete independent claims must fail the consumer build.",
    );
    assertIncludes(
      result,
      "Missing acknowledgement for 'docs/spec.md#beta'",
      "Claim 1 must not borrow Beta's acknowledgement from Claim 2.",
    );
    assertIncludes(
      result,
      "Missing acknowledgement for 'docs/spec.md#alpha'",
      "Claim 2 must not borrow Alpha's acknowledgement from Claim 1.",
    );
    assertIncludes(
      result,
      "Claim 1",
      "The diagnostic must identify the first incomplete claim.",
    );
    assertIncludes(
      result,
      "Claim 2",
      "The diagnostic must identify the second incomplete claim.",
    );
  } finally {
    project.cleanup();
  }
};
