import {
  type ITtscEvidenceProject,
  assertFailure,
  assertIncludes,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies declaration diagnostics through the packaged rule.
 *
 * Unit tests pin the parser's individual branches; this fixture proves those
 * failures survive config evaluation, contributor linking, project dispatch,
 * and diagnostic rendering in the real consumer process.
 *
 * 1. Write malformed, unresolved, conflicting, and out-of-scope declarations.
 * 2. Run the published plugin through `ttsc check`.
 * 3. Assert every class reaches the consumer with obligation and repair context.
 */
export const test_evidence_graph_reports_declaration_failures = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "declaration-failures",
    lintConfig: [
      'import type { ITtscLintConfig } from "@ttsc/lint";',
      'import { evidence } from "@ttsc/evidence";',
      "",
      "export default {",
      '  plugins: { "evidence": evidence },',
      "  rules: {",
      '    "evidence/graph": ["error", {',
      "      claims: [{",
      '        type: "typescript",',
      '        files: ["src/citations.ts"],',
      '        symbol: "function",',
      "        reference: {",
      '          type: "markdown",',
      '          files: ["docs/spec.md"],',
      '          symbol: "h2",',
      "        },",
      "      }],",
      "    }],",
      "  },",
      "} satisfies ITtscLintConfig;",
      "",
    ].join("\n"),
    files: {
      "docs/spec.md": "## Required {#required}\n",
      "src/citations.ts": [
        "/** @evidence docs/spec.md#required */",
        "export function missingReason(): void {}",
        "",
        "/** @evidence docs/spec.md#absent This target does not exist. */",
        "export function unresolved(): void {}",
        "",
        "/** @evidence docs/spec.md#required First acknowledgement. */",
        "export function first(): void {}",
        "",
        "/** @evidenceExclude docs/spec.md#required This contradicts the implementation acknowledgement. */",
        "export function second(): void {}",
        "",
        "/** @evidence docs/spec.md#required A property is outside the selected function hosts. */",
        "export interface IOutside {",
        "  value: string;",
        "}",
        "",
      ].join("\n"),
    },
  });
  try {
    const result = runCheck(project.directory);
    assertFailure(
      result,
      "Invalid evidence declarations must fail the consumer build.",
    );
    assertIncludes(
      result,
      "Malformed @evidence declaration",
      "A declaration without a reason must fail.",
    );
    assertIncludes(
      result,
      "Unresolved evidence target 'docs/spec.md#absent'",
      "A declaration target must resolve.",
    );
    assertIncludes(
      result,
      "Conflicting acknowledgements for 'docs/spec.md#required'",
      "Opposite acknowledgement intents must conflict.",
    );
    assertIncludes(
      result,
      "Out-of-scope @evidence host",
      "A declaration on an unselected symbol kind must fail.",
    );
    assertIncludes(
      result,
      "for Claim 1 across reference 1 (markdown, symbols: h2)",
      "Resolution diagnostics must name the claim and reference the author must repair.",
    );
    assertIncludes(
      result,
      "target 'docs/spec.md#required'",
      "A scope diagnostic must retain the exact resolved target beside its source location.",
    );
  } finally {
    project.cleanup();
  }
};
