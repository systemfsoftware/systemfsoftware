import {
  type ITtscEvidenceProject,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies overlapping type/model and property/column claims through Prisma.
 *
 * This is the benchmark template's exact ownership shape: both claims select
 * every DTO file, while their host and evidence granularities differ. A model
 * target structurally contains its columns, so copying the type declaration
 * into the property claim used to reject a complete graph as out of scope.
 *
 * 1. Select one DTO file from separate type and property claims.
 * 2. Cite the Prisma model from the type and its column from the property.
 * 3. Assert the real binary accepts both independent obligations.
 */
export const test_evidence_graph_accepts_overlapping_type_and_property_claims =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "overlapping-prisma-claims",
      lintConfig: [
        'import { evidence } from "@ttsc/evidence";',
        "",
        "export default {",
        '  plugins: { "evidence": evidence },',
        "  rules: {",
        '    "evidence/graph": ["error", { claims: [',
        "      {",
        '        name: "DTO models",',
        '        type: "typescript",',
        '        files: ["src/structures/**/*.ts"],',
        '        symbol: "type",',
        '        reference: { type: "prisma", files: ["prisma/**/*.prisma"], symbol: "model" },',
        "      },",
        "      {",
        '        name: "DTO columns",',
        '        type: "typescript",',
        '        files: ["src/structures/**/*.ts"],',
        '        symbol: "property",',
        '        reference: { type: "prisma", files: ["prisma/**/*.prisma"], symbol: "column" },',
        "      },",
        "    ] }],",
        "  },",
        "};",
        "",
      ].join("\n"),
      files: {
        "prisma/schema.prisma": [
          "datasource db {",
          '  provider = "postgresql"',
          "}",
          "",
          "model Sale {",
          "  id String @id @db.Uuid",
          "}",
          "",
        ].join("\n"),
        "src/structures/Sale.ts": [
          "/** @evidence prisma:Sale This contract materializes the Sale model. */",
          "export interface Sale {",
          "  /** @evidence prisma:Sale.id This field materializes the id column. */",
          "  id: string;",
          "}",
          "",
        ].join("\n"),
      },
    });
    try {
      assertStatus(
        runCheck(project.directory),
        0,
        "Overlapping files must be attributed by eligible host instead of rejected by the neighboring claim.",
      );
    } finally {
      project.cleanup();
    }
  };
