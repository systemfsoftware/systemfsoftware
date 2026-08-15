import {
  type ITtscEvidenceProject,
  assertFailure,
  assertIncludes,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies the packaged documented rule fails a build on an export with no
 * JSDoc block.
 *
 * The Go cases prove the walk; this proves a consumer gets the rule at all,
 * which depends on the descriptor's rule list naming `documented` and on the
 * host linking that Go into its binary. A registration typo drops a rule with
 * only a stderr warning, so a missing rule and a passing project look identical
 * from here.
 *
 * 1. Export one function with a block and one without.
 * 2. Enable `evidence/documented` with a bare severity.
 * 3. Assert a non-zero exit naming only the undocumented one.
 */
export const test_evidence_documented_reports_undocumented_export =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "documented-missing",
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
          "export function render(value: string): string {",
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
        "An export with no JSDoc block must fail the build.",
      );
      assertIncludes(
        result,
        "Missing JSDoc on exported function 'render'",
        "The diagnostic must name the undocumented declaration.",
      );
      assertIncludes(
        result,
        "only ever read from a JSDoc block",
        "The diagnostic must say why a block is required, not merely that it is.",
      );
    } finally {
      project.cleanup();
    }
  };
