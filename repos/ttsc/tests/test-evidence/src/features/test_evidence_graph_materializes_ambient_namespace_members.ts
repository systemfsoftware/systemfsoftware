import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies ambient namespace members through the packaged compiler boundary.
 *
 * Declaration-file members are implicitly exported even without member-level
 * `export` keywords. The consumer import proves TypeScript exposes the same
 * type, function, and property tree that the evidence graph materializes.
 *
 * 1. Declare and consume one exported ambient namespace.
 * 2. Acknowledge its complete namespace scope from Markdown.
 * 3. Assert the real compiler accepts every selected descendant.
 */
export const test_evidence_graph_materializes_ambient_namespace_members =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "ambient-namespace",
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
        '          files: ["src/contracts.d.ts"],',
        '          symbol: ["type", "function", "property"],',
        "        },",
        "      }],",
        "    }],",
        "  },",
        "};",
        "",
      ].join("\n"),
      files: {
        "src/contracts.d.ts": [
          "export namespace Ambient {",
          "  interface Input { id: string; }",
          "  function run(input: Input): void;",
          "  const state: string;",
          "  namespace Nested {",
          "    function work(): void;",
          "  }",
          "}",
          "",
        ].join("\n"),
        "src/use.ts": [
          'import { Ambient } from "./contracts.js";',
          "",
          'const input: Ambient.Input = { id: "member" };',
          "Ambient.run(input);",
          "Ambient.Nested.work();",
          "export const state: string = Ambient.state;",
          "",
        ].join("\n"),
        "src/claim.ts": [
          'import type { Ambient } from "./contracts.js";',
          "",
          "/** @evidence {@link Ambient} Documents the complete ambient namespace contract. */",
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
        "The packaged rule must follow TypeScript's implicit ambient namespace visibility.",
      );
      assertExcludes(
        result,
        "Missing acknowledgement",
        "The namespace scope must cover every implicit public descendant.",
      );
    } finally {
      project.cleanup();
    }
  };
