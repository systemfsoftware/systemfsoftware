import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies the packaged singular rule accepts every merged declaration form.
 *
 * The Go unit tests prove the counter treats merging as one identity; this
 * proves a consumer gets that behavior through the published descriptor, whose
 * rule list has to name `singular` and whose optionless setting has to survive
 * the host's options validation.
 *
 * 1. Declare interface/namespace, class/namespace, and const/default merges.
 * 2. Enable `evidence/singular` with a bare severity and no options.
 * 3. Assert a clean exit with no identity diagnostic.
 */
export const test_evidence_singular_accepts_merged_declarations = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "singular-merged",
    lintConfig: [
      'import { evidence } from "@ttsc/evidence";',
      "",
      "export default {",
      '  plugins: { "evidence": evidence },',
      '  files: ["src/**"],',
      "  rules: {",
      '    "evidence/singular": "error",',
      "  },",
      "};",
      "",
    ].join("\n"),
    files: {
      "src/ISomething.ts": [
        "export interface ISomething {",
        "  id: string;",
        "}",
        "export namespace ISomething {",
        "  export interface ICreate {",
        "    id: string;",
        "  }",
        "}",
        "",
      ].join("\n"),
      "src/Something.ts": [
        "export class Something {}",
        "export namespace Something {",
        '  export const version: string = "1";',
        "}",
        "",
      ].join("\n"),
      "src/handler.ts": [
        "export const handler = (): void => {};",
        "export default handler;",
        "",
      ].join("\n"),
      "src/index.ts": [
        'export * from "./ISomething.js";',
        'export * from "./Something.js";',
        'export * from "./handler.js";',
        "",
      ].join("\n"),
    },
  });
  try {
    const result = runCheck(project.directory);
    assertStatus(
      result,
      0,
      "Declaration merging of one name must remain one public identity.",
    );
    assertExcludes(
      result,
      "evidence/singular",
      "No merged declaration form may be reported as a second identity.",
    );
  } finally {
    project.cleanup();
  }
};
