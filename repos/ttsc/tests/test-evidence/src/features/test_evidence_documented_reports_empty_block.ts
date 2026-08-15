import {
  type ITtscEvidenceProject,
  assertFailure,
  assertIncludes,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies an empty JSDoc block fails the build through its own diagnostic.
 *
 * This is the one branch whose finding is about a comment rather than about the
 * declaration, so it is the one most easily reported at a range the host cannot
 * render. Driving it through the real binary is what proves the diagnostic
 * arrives at all — the Go cases use a fake reporter that never looks at the
 * node a finding was anchored on.
 *
 * 1. Document one export properly and give another an empty block.
 * 2. Enable `evidence/documented` with a bare severity.
 * 3. Assert a non-zero exit carrying the emptiness message, not the missing one.
 */
export const test_evidence_documented_reports_empty_block = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "documented-empty",
    include: ["src"],
    lintConfig: [
      'import { evidence } from "@ttsc/evidence";',
      "",
      "export default {",
      '  plugins: { "evidence": evidence },',
      "  rules: {",
      '    "evidence/documented": "error",',
      "  },",
      "};",
      "",
    ].join("\n"),
    files: {
      "src/parse.ts": [
        "/** Normalizes a raw input value. */",
        "export function parse(value: string): string {",
        "  return value;",
        "}",
        "",
        "/** */",
        "export function render(value: string): string {",
        "  return value;",
        "}",
        "",
      ].join("\n"),
    },
  });
  try {
    const result = runCheck(project.directory);
    assertFailure(result, "An empty JSDoc block must fail the build.");
    assertIncludes(
      result,
      "Empty JSDoc on exported function 'render'",
      "An empty block must be reported as empty, not as missing.",
    );
    assertIncludes(
      result,
      "src/parse.ts",
      "The finding must be anchored in the source file that carries the declaration.",
    );
  } finally {
    project.cleanup();
  }
};
