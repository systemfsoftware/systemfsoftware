import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies a composed multi-claim graph: Markdown claiming Markdown, TypeScript
 * claiming Markdown, and one claim carrying a reference array over two evidence
 * populations, all in one `claims` array.
 *
 * Each single-claim case is pinned elsewhere; this fixture proves the shapes
 * compose without leaking state across entries. It also exercises the exclusion
 * path end to end: one requirement is acknowledged with `@evidenceExclude`, so
 * a green run proves an exclusion satisfies exactly its own claim.
 *
 * The code-to-code edge here also carries its own weight: the test file cites
 * the component through an inline link backed by a real `import type`, which is
 * the only form that resolves now that a TypeScript target is resolved through
 * the citing module's imports.
 *
 * 1. Declare four claims: analysis and architecture docs each citing the
 *    requirements, components citing feature rules, and tests citing both
 *    feature rules and components through one reference array.
 * 2. Acknowledge every unit, one of them through an exclusion.
 * 3. Assert the composed graph passes with no missing acknowledgement.
 */
export const test_evidence_graph_composes_multi_claim_graphs = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "composed-graph",
    // The test file now imports the component it cites, and that import crosses
    // into a `.tsx`, which the compiler refuses to resolve without `--jsx`.
    // `preserve` is enough: nothing here writes JSX syntax.
    compilerOptions: { jsx: "preserve" },
    lintConfig: [
      'import type { ITtscLintConfig } from "@ttsc/lint";',
      'import { evidence, type ITtscEvidenceGraphConfig } from "@ttsc/evidence";',
      "",
      "const graph: ITtscEvidenceGraphConfig = {",
      "  claims: [",
      "    {",
      '      type: "markdown",',
      '      files: ["docs/analysis.md"],',
      '      symbol: "h2",',
      '      reference: { type: "markdown", files: ["docs/requirements.md"], symbol: "h2" },',
      "    },",
      "    {",
      '      type: "markdown",',
      '      files: ["docs/architecture.md"],',
      '      symbol: "h2",',
      '      reference: { type: "markdown", files: ["docs/requirements.md"], symbol: "h2" },',
      "    },",
      "    {",
      '      type: "typescript",',
      '      files: ["src/components/**/*.tsx"],',
      '      symbol: "function",',
      '      reference: { type: "markdown", files: ["docs/features.md"], symbol: "h2" },',
      "    },",
      "    {",
      '      type: "typescript",',
      '      files: ["src/features/**/*.ts"],',
      '      symbol: "function",',
      "      reference: [",
      '        { type: "markdown", files: ["docs/features.md"], symbol: "h2" },',
      '        { type: "typescript", files: ["src/components/**/*.tsx"], symbol: "function" },',
      "      ],",
      "    },",
      "  ],",
      "};",
      "",
      "export default {",
      '  plugins: { "evidence": evidence },',
      '  rules: { "evidence/graph": ["error", graph] },',
      "} satisfies ITtscLintConfig;",
      "",
    ].join("\n"),
    files: {
      "docs/requirements.md": "## Checkout {#checkout}\n",
      "docs/analysis.md": [
        "## Checkout Analysis",
        "",
        "<!-- @evidence docs/requirements.md#checkout The analysis refines the checkout requirement. -->",
        "",
      ].join("\n"),
      "docs/architecture.md": [
        "## Checkout Architecture",
        "",
        "<!-- @evidenceExclude docs/requirements.md#checkout Architecture defers checkout to the payment provider. -->",
        "",
      ].join("\n"),
      "docs/features.md": "## Cart Badge {#cart-badge}\n",
      "src/components/CartBadge.tsx": [
        "/**",
        " * @evidence docs/features.md#cart-badge Renders the badge the feature rule defines.",
        " */",
        "export function CartBadge(): string {",
        '  return "badge";',
        "}",
        "",
      ].join("\n"),
      "src/features/cart_badge.ts": [
        'import type { CartBadge } from "../components/CartBadge.js";',
        "",
        "/**",
        " * @evidence docs/features.md#cart-badge Verifies the badge follows the feature rule.",
        " * @evidence {@link CartBadge} Claims the exported component contract.",
        " */",
        "export function test_cart_badge(): void {}",
        "",
      ].join("\n"),
    },
  });
  try {
    const result = runCheck(project.directory);
    assertStatus(
      result,
      0,
      "A composed graph of markdown and typescript claims, including one reference array, must pass when every claim acknowledges its evidence.",
    );
    assertExcludes(
      result,
      "Missing acknowledgement",
      "Every claim acknowledged its own evidence, one via @evidenceExclude.",
    );
  } finally {
    project.cleanup();
  }
};
