import {
  type IRunResult,
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

const CONTRACT: string = [
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
].join("\n");

/**
 * Verifies a Swagger document outside the ttsc project resolves through an
 * ancestor-relative `file`.
 *
 * An OpenAPI document is routinely produced somewhere with no relationship to
 * the project that consumes it — a sibling package's generator output, a shared
 * contract checkout, a CI artifact directory. The rule has always accepted an
 * arbitrary `http(s)` URL on any host, so refusing `../contracts/swagger.json`
 * inverted the trust ordering: the unreachable form was the one on the same
 * filesystem, under the same version control, that the author can pin and
 * diff.
 *
 * 1. Generate the contract beside the project rather than inside it.
 * 2. Reference it with an ancestor-relative `file` and cite its operation.
 * 3. Assert the real `ttsc check` normalizes the document and closes coverage.
 */
export const test_evidence_graph_accepts_a_swagger_document_outside_the_project =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "swagger-outside",
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
        '      file: "../contracts/swagger.yaml",',
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
      workspaceFiles: {
        "contracts/swagger.yaml": CONTRACT,
      },
      files: {
        "src/members.ts": [
          "/** @evidence POST:/members Creates members through the shared API contract. */",
          "export interface IMemberCreation {}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result: IRunResult = runCheck(project.directory);
      assertStatus(
        result,
        0,
        "A contract checked out beside the project must be readable by the packaged normalizer.",
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
