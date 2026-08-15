import {
  type ITtscEvidenceProject,
  assertFailure,
  assertIncludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

const lintConfig: string = [
  'import type { ITtscLintConfig } from "@ttsc/lint";',
  'import { evidence, type ITtscEvidenceGraphConfig } from "@ttsc/evidence";',
  "",
  "const graph: ITtscEvidenceGraphConfig = {",
  "  claims: [{",
  '    type: "typescript",',
  '    files: ["src/**"],',
  '    symbol: "function",',
  "    reference: {",
  '      type: "typescript",',
  '      package: "@org/api",',
  '      symbol: "function",',
  "    },",
  "  }],",
  "};",
  "",
  "export default {",
  '  plugins: { "evidence": evidence },',
  '  rules: { "evidence/graph": ["error", graph] },',
  "} satisfies ITtscLintConfig;",
  "",
].join("\n");

const packageFiles: Readonly<Record<string, string>> = {
  "node_modules/@org/api/package.json": JSON.stringify(
    {
      name: "@org/api",
      version: "1.0.0",
      main: "./lib/index.js",
      exports: {
        ".": { types: "./lib/index.d.ts", default: "./lib/index.js" },
      },
    },
    null,
    2,
  ),
  "node_modules/@org/api/lib/index.js": "export * from './functional.js';\n",
  "node_modules/@org/api/lib/index.d.ts":
    'export * as functional from "./functional.js";\n',
  "node_modules/@org/api/lib/functional.d.ts": [
    'export * as questions from "./questions.js";',
    'export * as reviews from "./reviews.js";',
    "",
  ].join("\n"),
  "node_modules/@org/api/lib/questions.d.ts":
    "export declare function get(): void;\n",
  "node_modules/@org/api/lib/reviews.d.ts":
    "export declare function get(): void;\n",
};

/**
 * Verifies an installed package can be the evidence population, including the
 * operation nothing in the project imports.
 *
 * This is what the population must be read from disk for. The operation a
 * frontend never called is absent from the `ttsc` program by definition, and it
 * is precisely the one an obligation has to name — a graph that could only see
 * imported symbols would confirm full coverage of the work already done and
 * stay silent about the work skipped.
 *
 * The package is shaped like a generated SDK, so the accessor path is what
 * makes each operation nameable at all: two resource modules both export `get`,
 * and only `api.functional.questions.get` tells them apart.
 *
 * 1. Install a package whose entry nests two resource modules.
 * 2. Cite one operation and leave the other uncited.
 * 3. Assert the build fails naming only the uncited accessor path, then passes
 *    once it is acknowledged.
 */
export const test_evidence_reference_selects_an_installed_package =
  (): void => {
    const incomplete: ITtscEvidenceProject = createProject({
      name: "package-population",
      include: ["src"],
      lintConfig,
      files: {
        ...packageFiles,
        "src/question.ts": [
          'import type * as api from "@org/api";',
          "",
          "/**",
          " * @evidence {@link api.functional.questions.get} Renders the question operation.",
          " */",
          "export function question(): void {}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(incomplete.directory);
      assertFailure(
        result,
        "An operation the project never imports must still be an obligation.",
      );
      assertIncludes(
        result,
        "Missing acknowledgement for 'functional.reviews.get'",
        "The uncited operation must be named by its accessor path from the entry.",
      );
      assertIncludes(
        result,
        "with @evidence on a selected typescript host, building that artifact first when none does, or write @evidenceExclude on an eligible carrier when nothing here owes it.",
        "The repair must preserve both neutral acknowledgement options.",
      );
    } finally {
      incomplete.cleanup();
    }

    const complete: ITtscEvidenceProject = createProject({
      name: "package-population-complete",
      include: ["src"],
      lintConfig,
      files: {
        ...packageFiles,
        "src/question.ts": [
          'import type * as api from "@org/api";',
          "",
          "/**",
          " * @evidence {@link api.functional.questions.get} Renders the question operation.",
          " */",
          "export function question(): void {}",
          "",
        ].join("\n"),
        "src/review.ts": [
          'import type * as api from "@org/api";',
          "",
          "/**",
          " * @evidence {@link api.functional.reviews.get} Renders the review operation.",
          " */",
          "export function review(): void {}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(complete.directory);
      assertStatus(
        result,
        0,
        "Two operations sharing a leaf name must both resolve through their accessor paths.",
      );
    } finally {
      complete.cleanup();
    }
  };
