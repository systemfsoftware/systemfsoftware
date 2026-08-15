import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies Swagger file references through the published consumer boundary.
 *
 * The rule is Go while Swagger normalization is JavaScript, so unit-testing
 * either half cannot prove the linked binary finds the package helper and its
 * runtime dependencies. A Swagger 2.0 YAML document also exercises both the
 * dialect upgrade and non-JSON parser before coverage is evaluated.
 *
 * 1. Configure a typed Swagger reference to one project-relative YAML file.
 * 2. Cite its POST operation from an exported TypeScript type.
 * 3. Assert the real `ttsc check` accepts the complete operation graph.
 */
export const test_evidence_graph_accepts_swagger_file_reference = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "swagger-file",
    lintConfig: [
      'import type { ITtscLintConfig } from "@ttsc/lint";',
      'import { evidence, type ITtscEvidenceGraphConfig } from "@ttsc/evidence";',
      "",
      "const graph: ITtscEvidenceGraphConfig = {",
      "  claims: [{",
      '    type: "typescript",',
      '    files: ["src/**/*.ts"],',
      '    symbol: "type",',
      "    reference: {",
      '      type: "swagger",',
      '      file: "api/swagger.yaml",',
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
      "api/swagger.yaml": [
        'swagger: "2.0"',
        "info:",
        "  title: Members",
        '  version: "1.0.0"',
        "paths:",
        "  /members:",
        "    post:",
        "      operationId: members.create",
        "      responses:",
        '        "201":',
        "          description: Created",
        "",
      ].join("\n"),
      "src/members.ts": [
        "/** @evidence POST:/members Creates members through the declared API operation. */",
        "export interface IMemberCreation {}",
        "",
      ].join("\n"),
    },
  });
  try {
    const result = runCheck(project.directory);
    assertStatus(
      result,
      0,
      "The packaged Node normalizer must upgrade a local Swagger YAML document for the native rule.",
    );
    assertExcludes(
      result,
      "Missing acknowledgement",
      "The operation citation must satisfy Swagger coverage.",
    );
  } finally {
    project.cleanup();
  }
};
