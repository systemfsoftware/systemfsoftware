import {
  type ITtscEvidenceProject,
  assertFailure,
  assertIncludes,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies a Prisma citation that resolves to nothing fails the build and names
 * the repair.
 *
 * A rule that only ever passes proves nothing fired. This is the transformation
 * direction for the Prisma population: a type cites `prisma:Discount`, which
 * the schema does not declare, one property away from a citation that works in
 * the same file — so an over-matching resolver would have to accept a model
 * name that simply is not there.
 *
 * 1. Materialize a schema declaring exactly one model.
 * 2. Cite that model correctly from one declaration and a missing one from
 *    another.
 * 3. Assert a non-zero exit that names only the dangling target.
 */
export const test_evidence_graph_reports_an_uncited_prisma_model = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "prisma-dangling",
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
      '      type: "prisma",',
      '      files: ["prisma/**/*.prisma"],',
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
        "model Sale {",
        "  id    String @id @db.Uuid",
        "  price Int",
        "}",
        "",
      ].join("\n"),
      "src/sale.ts": [
        "/** @evidence prisma:Sale This contract materializes the sale row. */",
        "export interface ISale {}",
        "",
      ].join("\n"),
      "src/discount.ts": [
        "/** @evidence prisma:Discount This contract materializes the discount row. */",
        "export interface IDiscount {}",
        "",
      ].join("\n"),
    },
  });
  try {
    const result = runCheck(project.directory);
    assertFailure(
      result,
      "A citation naming a model the schema does not declare must fail the build.",
    );
    assertIncludes(
      result,
      "prisma:Discount",
      "The diagnostic must name the target that resolves to nothing.",
    );
  } finally {
    project.cleanup();
  }
};
