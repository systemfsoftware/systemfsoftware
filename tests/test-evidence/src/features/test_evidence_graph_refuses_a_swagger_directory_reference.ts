import {
  type IRunResult,
  type ITtscEvidenceProject,
  assertIncludes,
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
 * Verifies a Swagger reference that names a directory is refused with a message
 * that says so.
 *
 * 1. Reference a directory rather than a document.
 * 2. Run the real `ttsc check`.
 * 3. Assert the configuration diagnostic names the invalid shape.
 */
export const test_evidence_graph_refuses_a_swagger_directory_reference =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "swagger-directory",
      lintConfig: [
        'import evidence from "@ttsc/evidence";',
        "",
        "export default {",
        '  plugins: { "evidence": evidence },',
        "  rules: {",
        '    "evidence/graph": ["error", {',
        "      claims: [",
        "        {",
        '          type: "typescript",',
        '          files: ["src/**/*.ts"],',
        '          symbol: "type",',
        '          reference: { type: "swagger", file: "../contracts/" },',
        "        },",
        "      ],",
        "    }],",
        "  },",
        "};",
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
        2,
        "A reference that owns one document cannot be satisfied by a directory.",
      );
      assertIncludes(
        result,
        "names a directory rather than a document",
        "The diagnostic must name the invalid shape rather than report the document as missing.",
      );
    } finally {
      project.cleanup();
    }
  };
