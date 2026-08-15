import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies type-only namespace aliases through an actual type-only import.
 *
 * A namespace alias exported with `export type` remains a usable public type
 * path, but its functions and data do not enter the imported value space. The
 * evidence target must follow that same projection.
 *
 * 1. Export a local namespace only through a type alias.
 * 2. Consume a nested interface through that alias.
 * 3. Assert the packaged rule resolves and covers the public type scope.
 */
export const test_evidence_graph_materializes_type_only_namespace_aliases =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "type-only-namespace",
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
        '          symbol: ["type", "property"],',
        "        },",
        "      }],",
        "    }],",
        "  },",
        "};",
        "",
      ].join("\n"),
      files: {
        "src/contracts.ts": [
          "namespace Local {",
          "  export interface Input { id: string; }",
          "  export type Options = { enabled: boolean };",
          "  export function execute(): void {}",
          "  export const state = 1;",
          "}",
          "export type { Local as Public };",
          "",
        ].join("\n"),
        "src/use.ts": [
          'import type { Public } from "./contracts.js";',
          "",
          'export const input: Public.Input = { id: "member" };',
          "export const options: Public.Options = { enabled: true };",
          "",
        ].join("\n"),
        "src/claim.ts": [
          'import type { Public } from "./contracts.js";',
          "",
          "/** @evidence {@link Public} Documents the complete imported type namespace. */",
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
        "The packaged rule must preserve the namespace type path exposed by export type.",
      );
      assertExcludes(
        result,
        "Unresolved evidence target",
        "The type-only public alias must be a resolvable aggregate scope.",
      );
    } finally {
      project.cleanup();
    }
  };
