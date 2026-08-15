import {
  type ITtscEvidenceProject,
  assertFailure,
  assertIncludes,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies member-level Prisma coverage through the published consumer
 * boundary.
 *
 * Every end-to-end case so far obligates models, so the member population has
 * only ever been proved by unit tests reading the inventory directly. That
 * leaves the configuration a consumer would actually write for column-level
 * traceability unexercised — and it is the selection where a relation
 * back-reference matters most, because `Seller.sales` carries no `@relation`
 * attribute and nothing but Prisma's own resolution puts it in the population.
 *
 * The two citations are deliberately at different granularities. One names a
 * model and discharges its whole subtree by hierarchy; the other names a single
 * column, which discharges nothing else. That asymmetry is the point — a
 * passing run would prove only that citations resolve, not that members nobody
 * mentioned are still owed.
 *
 * 1. Select `model`, `column`, and `relation` on a Prisma reference.
 * 2. Cite one model wholesale and one column of the other.
 * 3. Assert the build fails naming the relation back-reference nobody claimed.
 */
export const test_evidence_graph_obligates_prisma_columns_and_relations =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "prisma-members",
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
        '      symbol: ["model", "column", "relation"],',
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
          "  id        String @id @db.Uuid",
          "  price     Int",
          "  seller_id String @db.Uuid",
          "  seller    Seller @relation(fields: [seller_id], references: [id])",
          "}",
          "",
          "model Seller {",
          "  id    String @id @db.Uuid",
          "  sales Sale[]",
          "}",
          "",
        ].join("\n"),
        "src/sale.ts": [
          "/**",
          " * @evidence prisma:Sale The sale row and every member of it is exposed here.",
          " * @evidence prisma:Seller.id The seller identity is exposed here.",
          " */",
          "export interface ISale {}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(project.directory);
      assertFailure(
        result,
        "A member population must keep owing the members nobody cited.",
      );
      assertIncludes(
        result,
        "Missing acknowledgement for 'prisma:Seller.sales'",
        "The relation back-reference is a member obligation even though it carries no attribute.",
      );
    } finally {
      project.cleanup();
    }
  };
