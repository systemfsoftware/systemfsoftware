import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies the published consumer contract through a real `lint.config.ts`.
 *
 * The fixture imports both exported types, registers the shipped plugin object,
 * and uses the typed severity-plus-options tuple. Its claim selects an exported
 * arrow-function `const`, so the same run also proves that this callable form
 * can host a JSDoc declaration.
 *
 * 1. Configure one TypeScript claim over a Markdown H2 reference through
 *    `ITtscEvidenceGraphConfig`.
 * 2. Cite the section from an exported arrow function selected as `"function"`.
 * 3. Assert that `ttsc check` accepts the typed project without a diagnostic.
 */
export const test_evidence_graph_accepts_typed_consumer_config = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "typed-config",
    lintConfig: [
      'import type { ITtscLintConfig } from "@ttsc/lint";',
      'import { evidence, type ITtscEvidenceGraphConfig } from "@ttsc/evidence";',
      "",
      "const graph: ITtscEvidenceGraphConfig = {",
      "  claims: [{",
      '    type: "typescript",',
      '    name: "Order contract",',
      '    files: ["src/**/*.ts"],',
      '    symbol: "function",',
      "    reference: {",
      '      type: "markdown",',
      '      files: ["docs/**/*.md"],',
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
    files: {
      "docs/orders.md": "## Create Order {#create-order}\n",
      "src/orders.ts": [
        "/**",
        " * @evidence docs/orders.md#create-order This operation implements the documented creation flow.",
        " */",
        "export const createOrder = (): void => {};",
        "",
      ].join("\n"),
    },
  });
  try {
    const result = runCheck(project.directory);
    assertStatus(
      result,
      0,
      "The package's exact exported config types and plugin object must work in a consumer lint.config.ts.",
    );
    assertExcludes(
      result,
      "Missing acknowledgement",
      "An exported arrow-function const is a selected function host.",
    );
  } finally {
    project.cleanup();
  }
};
