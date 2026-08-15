import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies auto-accessor exclusion through the packaged function selector.
 *
 * Auto-accessors and ordinary callable fields share a PropertyDeclaration AST
 * shape. A complete function obligation that cites only the ordinary fields
 * fails if accessor modifiers are ignored.
 *
 * 1. Declare instance/static callable fields and auto-accessors.
 * 2. Acknowledge only the ordinary callable fields.
 * 3. Assert no accessor becomes a missing function obligation.
 */
export const test_evidence_graph_excludes_auto_accessors = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "auto-accessors",
    lintConfig: [
      'import evidence from "@ttsc/evidence";',
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
      "};",
      "",
    ].join("\n"),
    files: {
      "src/contracts.ts": [
        "export class Service {",
        "  handler = (): void => {};",
        "  static factory: () => void;",
        "  accessor callback = (): void => {};",
        "  static accessor provider: () => void;",
        "}",
        "",
      ].join("\n"),
      "src/claim.ts": [
        'import type { Service } from "./contracts.js";',
        "",
        "/**",
        " * @evidence {@link Service.prototype.handler} Documents the callable instance field.",
        " * @evidence {@link Service.factory} Documents the callable static field.",
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
      "The packaged rule must exclude auto-accessors from function evidence.",
    );
    assertExcludes(
      result,
      "Missing acknowledgement",
      "Callable auto-accessors must not become function obligations.",
    );
  } finally {
    project.cleanup();
  }
};
