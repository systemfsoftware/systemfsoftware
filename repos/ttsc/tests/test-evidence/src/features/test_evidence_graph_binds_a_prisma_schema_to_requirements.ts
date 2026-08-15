import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies a Prisma schema both cites and grounds evidence through the
 * published consumer boundary.
 *
 * Every layer of this artifact kind is unprovable from either half alone. The
 * population crosses a process boundary into Prisma's own WebAssembly parser,
 * the locations come from a native scan of the same bytes, and the citations
 * live in `///` comments the compiler never sees — so only the linked binary
 * running over a real project shows that the parser resolves, the schema
 * classifies, and a `.prisma` file can carry a tag at all.
 *
 * Both directions run at once because they are the product's two halves: a
 * model citing the requirement that asked for it, and a type citing the model
 * it materializes. The relation citation is the one that could not be reached
 * by reading text, since `Seller.sales` carries no `@relation` attribute.
 *
 * 1. Configure a Prisma claim over Markdown and a TypeScript claim over Prisma.
 * 2. Cite one model, exclude the other, and cite a model, a column, and both sides
 *    of a relation from TypeScript.
 * 3. Assert the real `ttsc check` accepts the complete graph.
 */
export const test_evidence_graph_binds_a_prisma_schema_to_requirements =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "prisma-graph",
      lintConfig: [
        'import type { ITtscLintConfig } from "@ttsc/lint";',
        'import { evidence, type ITtscEvidenceGraphConfig } from "@ttsc/evidence";',
        "",
        "const graph: ITtscEvidenceGraphConfig = {",
        "  claims: [",
        "    {",
        '      type: "prisma",',
        '      name: "Every model justifies itself",',
        '      files: ["prisma/**/*.prisma"],',
        '      symbol: "model",',
        "      reference: {",
        '        type: "markdown",',
        '        files: ["docs/requirements.md"],',
        '        symbol: "h2",',
        "      },",
        "    },",
        "    {",
        '      type: "typescript",',
        '      files: ["src/**/*.ts"],',
        '      symbol: "type",',
        "      reference: {",
        '        type: "prisma",',
        '        files: ["prisma/**/*.prisma"],',
        '        symbol: ["model", "column", "relation"],',
        "      },",
        "    },",
        "  ],",
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
          "/// A sale.",
          "/// @evidence docs/requirements.md#pricing The sale exists to price an offer.",
          "model Sale {",
          "  id        String @id @db.Uuid",
          "  price     Int",
          "  seller_id String @db.Uuid",
          "  seller    Seller @relation(fields: [seller_id], references: [id])",
          "}",
          "",
          "/// @evidenceExclude docs/requirements.md#sellers Seller identity is owned by the auth service.",
          "model Seller {",
          "  id    String @id @db.Uuid",
          "  sales Sale[]",
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
          "## Sellers {#sellers}",
          "",
          "A seller owns the sales they create.",
          "",
        ].join("\n"),
        "src/sale.ts": [
          "/**",
          " * @evidence prisma:Sale This contract materializes the sale row.",
          " * @evidence prisma:Seller This contract materializes the seller row.",
          " */",
          "export interface ISale {}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(project.directory);
      assertStatus(
        result,
        0,
        "A schema that cites its requirements and is cited in turn must pass.",
      );
      assertExcludes(
        result,
        "Missing acknowledgement",
        "A model citation discharges the columns and relations it contains.",
      );
    } finally {
      project.cleanup();
    }
  };
