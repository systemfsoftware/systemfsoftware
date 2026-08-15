import {
  type ITtscEvidenceProject,
  assertFailure,
  assertIncludes,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies the negative twin of the README's configuration: a config file
 * inside the project's `include` is reported.
 *
 * The accepting case passes because `lint.config.ts` sits outside the program,
 * not because the rule spares config files — nothing in the rule knows what a
 * config file is. Without this twin, a future change that silently stopped
 * visiting the config file would look identical to today's behavior, and the
 * README's stated trade-off would quietly become false.
 *
 * 1. Include `lint.config.ts` in the program alongside `src`.
 * 2. Enable `evidence/singular` unscoped, exactly as the README does.
 * 3. Assert the config file's own anonymous default fails the build.
 */
export const test_evidence_singular_reports_included_config_file = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "singular-config-included",
    include: ["src", "lint.config.ts"],
    lintConfig: [
      'import { evidence } from "@ttsc/evidence";',
      "",
      "export default {",
      '  plugins: { "evidence": evidence },',
      "  rules: {",
      '    "evidence/singular": "error",',
      "  },",
      "};",
      "",
    ].join("\n"),
    files: {
      "src/handler.ts": ["export const handler = (): void => {};", ""].join(
        "\n",
      ),
    },
  });
  try {
    const result = runCheck(project.directory);
    assertFailure(
      result,
      "An anonymous default is reported wherever it is, including in a config file the project includes.",
    );
    assertIncludes(
      result,
      "An anonymous default export has no name",
      "The config file must be reported by the anonymous-default branch, not by a name mismatch.",
    );
  } finally {
    project.cleanup();
  }
};
