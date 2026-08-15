import {
  type ITtscEvidenceProject,
  assertFailure,
  assertIncludes,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies a citation written in a comment Prisma discards is reported rather
 * than ignored.
 *
 * `//` is one keystroke from `///`, and that keystroke decides whether the
 * schema carries the citation at all — Prisma drops a line comment and keeps a
 * doc comment. Without this diagnostic the tag sits in the file looking exactly
 * like the ones that work while satisfying nothing, which is the silent failure
 * this product exists to remove.
 *
 * The model is otherwise fully cited, so the only thing that can fail here is
 * the placement.
 *
 * 1. Write a model's citation in a `//` comment.
 * 2. Assert the check fails.
 * 3. Assert the diagnostic names the comment form and the `///` repair.
 */
export const test_evidence_graph_reports_a_discarded_prisma_citation =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "prisma-line-comment",
      lintConfig: [
        'import type { ITtscLintConfig } from "@ttsc/lint";',
        'import { evidence, type ITtscEvidenceGraphConfig } from "@ttsc/evidence";',
        "",
        "const graph: ITtscEvidenceGraphConfig = {",
        "  claims: [{",
        '    type: "prisma",',
        '    files: ["prisma/**/*.prisma"],',
        '    symbol: "model",',
        "    reference: {",
        '      type: "markdown",',
        '      files: ["docs/requirements.md"],',
        '      symbol: "h2",',
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
        "prisma/schema.prisma": [
          "datasource db {",
          '  provider = "postgresql"',
          "}",
          "",
          "// @evidence docs/requirements.md#pricing The sale exists to price an offer.",
          "model Sale {",
          "  id    String @id @db.Uuid",
          "  price Int",
          "}",
          "",
        ].join("\n"),
        "docs/requirements.md": [
          "# Requirements",
          "",
          "## Pricing {#pricing}",
          "",
          "An offer is priced when it is sold.",
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(project.directory);
      assertFailure(
        result,
        "A citation in a comment Prisma discards must fail the build.",
      );
      assertIncludes(
        result,
        "'//' line comment",
        "The diagnostic must name the comment form that cannot host a citation.",
      );
    } finally {
      project.cleanup();
    }
  };
