import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertFailure,
  assertIncludes,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies the packaged todo rule fails a build on a declaration whose JSDoc
 * still carries a `@todo` tag.
 *
 * The Go cases prove the scan; this proves a consumer gets the rule at all,
 * which depends on the descriptor's rule list naming `todo` and on the host
 * linking that Go into its binary. A registration typo drops a rule with only a
 * stderr warning, so a missing rule and a passing project look identical from
 * here. The neighbor declaration carries a `@todos` tag — the boundary one
 * character away — so the same run also pins that the packaged scan does not
 * widen into prefix matching.
 *
 * 1. Export one stub whose block carries a `@todo` beside one carrying `@todos`.
 * 2. Enable `evidence/todo` with a bare severity, the only form it accepts.
 * 3. Assert a non-zero exit carrying only the `@todo` tag's text.
 */
export const test_evidence_todo_reports_unrealized_contract = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "todo-unrealized",
    include: ["src"],
    lintConfig: [
      'import { evidence } from "@ttsc/evidence";',
      "",
      "export default {",
      '  plugins: { "evidence": evidence },',
      "  rules: {",
      '    "evidence/todo": "error",',
      "  },",
      "};",
      "",
    ].join("\n"),
    files: {
      "src/parse.ts": [
        "/** @todos are tracked elsewhere */",
        "export function parse(value: string): string {",
        "  return value;",
        "}",
        "",
        "/** @todo wire the persistence layer */",
        "export function persist(value: string): string {",
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
      "A declaration whose JSDoc still carries a '@todo' must fail the build.",
    );
    assertIncludes(
      result,
      "Unrealized '@todo': 'wire the persistence layer'",
      "The diagnostic must carry the tag's own text.",
    );
    assertIncludes(
      result,
      "Realize the declaration and remove the tag",
      "The diagnostic must name the repair, not merely the finding.",
    );
    assertExcludes(
      result,
      "tracked elsewhere",
      "A '@todos' tag is another tool's tag; matching it would report a debt nobody recorded.",
    );
  } finally {
    project.cleanup();
  }
};
