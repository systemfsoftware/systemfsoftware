import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies every public callable form as TypeScript evidence.
 *
 * Function declarations alone would miss ordinary exported arrow functions,
 * class APIs, and namespace APIs even though all of them are selected by the
 * public `"function"` contract. The fixture acknowledges each qualified target
 * from one Markdown claim so a silently omitted unit cannot hide behind an
 * incomplete claim.
 *
 * 1. Declare top-level, class, and namespace callables in one referenced file.
 * 2. Acknowledge every documented target identity from a Markdown file host.
 * 3. Assert that the complete graph passes without unresolved or missing units.
 */
export const test_evidence_graph_materializes_all_callable_forms = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "callable-sources",
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
      '        files: ["src/claim.ts"],',
      '        symbol: "type",',
      "        reference: {",
      '          type: "typescript",',
      '          files: ["src/contracts.ts"],',
      '          symbol: "function",',
      "        },",
      "      }],",
      "    }],",
      "  },",
      "} satisfies ITtscLintConfig;",
      "",
    ].join("\n"),
    files: {
      "src/contracts.ts": [
        "export function declared(): void {}",
        "export const arrow = (): void => {};",
        "export const expression = function (): void {};",
        "",
        "export class Service {",
        "  public run(): void {}",
        "  public execute = (): void => {};",
        "  public callback!: () => void;",
        "  public static create(): Service { return new Service(); }",
        "  public static restore = function (): Service { return new Service(); };",
        "  public static provider?: () => Service;",
        "}",
        "",
        "export namespace Orders {",
        "  export function open(): void {}",
        "  export const close = (): void => {};",
        "}",
        "",
      ].join("\n"),
      "src/claim.ts": [
        'import type { Orders, Service, arrow, declared, expression } from "./contracts.js";',
        "",
        "/**",
        " * @evidence {@link declared} Covers the exported function declaration.",
        " * @evidence {@link arrow} Covers the exported arrow function.",
        " * @evidence {@link expression} Covers the exported function expression.",
        " * @evidence {@link Service.prototype.run} Covers the public instance method.",
        " * @evidence {@link Service.prototype.execute} Covers the public function field.",
        " * @evidence {@link Service.prototype.callback} Covers the direct function-typed field.",
        " * @evidence {@link Service.create} Covers the public static method.",
        " * @evidence {@link Service.restore} Covers the public static function field.",
        " * @evidence {@link Service.provider} Covers the static function-typed field.",
        " * @evidence {@link Orders.open} Covers the namespace function.",
        " * @evidence {@link Orders.close} Covers the namespace arrow function.",
        " */",
        "export interface IClaim {}",
        "",
      ].join("\n"),
    },
  });
  try {
    const result = runCheck(project.directory);
    assertStatus(
      result,
      0,
      "Every callable form named by TtscEvidenceGraphTypeScriptSymbol must materialize with its documented identity.",
    );
    assertExcludes(
      result,
      "Unresolved evidence target",
      "All documented callable targets must resolve.",
    );
    assertExcludes(
      result,
      "Missing acknowledgement",
      "The claiming file acknowledges every callable unit.",
    );
  } finally {
    project.cleanup();
  }
};
