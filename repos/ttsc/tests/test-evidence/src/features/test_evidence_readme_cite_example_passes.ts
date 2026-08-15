import {
  type ITtscEvidenceProject,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies the README's TypeScript citation example against the real binary.
 *
 * That block teaches the inline-link grammar, and every part of it is load
 * bearing in a way a reader cannot check: the braces are what make the import
 * legitimate, the `import type` is what keeps the edge out of the emit, and the
 * whole thing only compiles because TypeScript counts a `{@link}` reference as
 * a use. A hand-written example that drifts from any of those teaches the
 * grammar wrong, and the README already carried one defect nobody caught until
 * a fixture ran it.
 *
 * 1. Materialize the example's import, JSDoc, and declaration verbatim.
 * 2. Turn on `noUnusedLocals`, so an import carried only by the citation must
 *    survive on its own merits.
 * 3. Assert `ttsc check` exits clean with the obligation discharged.
 */
export const test_evidence_readme_cite_example_passes = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "readme-cite",
    include: ["src"],
    compilerOptions: { noUnusedLocals: true },
    lintConfig: [
      'import type { ITtscLintConfig } from "@ttsc/lint";',
      'import { evidence, type ITtscEvidenceGraphConfig } from "@ttsc/evidence";',
      "",
      "const graph: ITtscEvidenceGraphConfig = {",
      "  claims: [",
      "    {",
      '      type: "typescript",',
      '      files: ["src/*.ts"],',
      '      symbol: "function",',
      "      reference: {",
      '        type: "typescript",',
      '        files: ["src/contracts/**"],',
      '        symbol: "type",',
      "      },",
      "    },",
      "  ],",
      "};",
      "",
      "export default {",
      "  plugins: {",
      '    "evidence": evidence,',
      "  },",
      "  rules: {",
      '    "evidence/graph": ["error", graph],',
      "  },",
      "} satisfies ITtscLintConfig;",
      "",
    ].join("\n"),
    files: {
      "src/contracts/IShoppingSale.ts": [
        "export interface IShoppingSale {",
        "  price: number;",
        "}",
        "",
      ].join("\n"),
      "src/SalePrice.ts": [
        'import type * as sales from "./contracts/IShoppingSale.js";',
        "",
        "/**",
        " * @evidence {@link sales.IShoppingSale} Renders the price exactly as the contract declares it.",
        " */",
        "export function SalePrice(): null {",
        "  return null;",
        "}",
        "",
      ].join("\n"),
    },
  });
  try {
    const result = runCheck(project.directory);
    assertStatus(
      result,
      0,
      "The README's inline-link citation must resolve, and its citation-only import must survive noUnusedLocals.",
    );
  } finally {
    project.cleanup();
  }
};
