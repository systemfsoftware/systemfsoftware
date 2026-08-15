import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies destructured exports through real TypeScript imports and coverage.
 *
 * Binding-pattern source keys and containers are not export identities; every
 * local leaf is. Importing each leaf supplies the TypeScript oracle while a
 * private adjacent binding catches accidental over-materialization.
 *
 * 1. Export object, array, nested, rest, and aliased binding leaves.
 * 2. Import the leaves and acknowledge each from Markdown.
 * 3. Assert the packaged rule materializes exactly the public properties.
 */
export const test_evidence_graph_materializes_destructured_exports =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "destructured-exports",
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
        '          symbol: "property",',
        "        },",
        "      }],",
        "    }],",
        "  },",
        "};",
        "",
      ].join("\n"),
      files: {
        "src/contracts.ts": [
          "const source = {",
          '  state: "ready",',
          "  count: 1,",
          "  nested: { enabled: true },",
          '  extra: "value",',
          "};",
          "const values = [1, 2, 3];",
          "",
          "export const {",
          "  state,",
          "  count: publicCount,",
          "  nested: { enabled },",
          "  ...remaining",
          "} = source;",
          "export const [first, , ...tail] = values;",
          "const { extra: local } = source;",
          "export { local as publicLocal };",
          "const { state: hidden } = source;",
          "",
        ].join("\n"),
        "src/use.ts": [
          "import {",
          "  enabled,",
          "  first,",
          "  publicCount,",
          "  publicLocal,",
          "  remaining,",
          "  state,",
          "  tail,",
          '} from "./contracts.js";',
          "",
          "export const observed = {",
          "  enabled,",
          "  first,",
          "  publicCount,",
          "  publicLocal,",
          "  remaining,",
          "  state,",
          "  tail,",
          "};",
          "",
        ].join("\n"),
        "src/claim.ts": [
          'import type { enabled, first, publicCount, publicLocal, remaining, state, tail } from "./contracts.js";',
          "",
          "/**",
          " * @evidence {@link state} Documents the shorthand binding.",
          " * @evidence {@link publicCount} Documents the renamed binding.",
          " * @evidence {@link enabled} Documents the nested binding.",
          " * @evidence {@link remaining} Documents the object rest binding.",
          " * @evidence {@link first} Documents the array binding.",
          " * @evidence {@link tail} Documents the array rest binding.",
          " * @evidence {@link publicLocal} Documents the export-list alias.",
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
        "The packaged rule must materialize every importable binding leaf.",
      );
      assertExcludes(
        result,
        "Missing acknowledgement",
        "Private bindings and source property keys must not enter the obligation.",
      );
    } finally {
      project.cleanup();
    }
  };
