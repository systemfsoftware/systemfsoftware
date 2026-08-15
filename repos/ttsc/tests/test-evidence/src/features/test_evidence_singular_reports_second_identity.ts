import {
  type ITtscEvidenceProject,
  assertFailure,
  assertIncludes,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies the packaged singular rule fails a build on a second identity and on
 * a name mismatch.
 *
 * A rule that never fires is indistinguishable from a passing one, so the
 * accepting case is worthless without this twin. Both findings are asserted in
 * one project because they are separate branches of the same rule and a fixture
 * that only proved one would leave the other unexercised end to end.
 *
 * 1. Write one file with two identities and one whose identity is misnamed.
 * 2. Enable `evidence/singular` over the source tree.
 * 3. Assert a non-zero exit naming both the count and the rename repair.
 */
export const test_evidence_singular_reports_second_identity = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "singular-violations",
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
      "src/pair.ts": [
        "export const alpha = 1;",
        "export const beta = 2;",
        "",
      ].join("\n"),
      "src/utils.ts": [
        "export function parseInput(value: string): string {",
        "  return value;",
        "}",
        "",
      ].join("\n"),
    },
  });
  try {
    const result = runCheck(project.directory);
    assertFailure(
      result,
      "A second public identity must fail the build, not warn silently.",
    );
    assertIncludes(
      result,
      "declares exactly one public identity",
      "The count diagnostic must name the rule's contract.",
    );
    assertIncludes(
      result,
      "Rename the file to 'parseInput.ts'",
      "The mismatch diagnostic must offer a concrete repair.",
    );
  } finally {
    project.cleanup();
  }
};
