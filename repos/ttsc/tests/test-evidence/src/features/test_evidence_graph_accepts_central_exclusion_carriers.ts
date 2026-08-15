import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertFailure,
  assertIncludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies central TypeScript and Prisma exclusion carriers through the
 * published consumer boundary.
 *
 * Native tests pin eligibility branches, while this fixture proves the consumer
 * check links the contributor, reads a comment-only `.schema` file, and keeps
 * Markdown, Prisma, and TypeScript references claim-local across the
 * controller, DTO, and backend-test ledgers.
 *
 * 1. Build all four central carrier shapes with their production claim selectors.
 * 2. Cover Markdown, Prisma model and column, and imported TypeScript targets.
 * 3. Assert valid exclusions pass while ownership evidence and discarded comment
 *    forms still fail with their distinct repairs.
 */
export const test_evidence_graph_accepts_central_exclusion_carriers =
  (): void => {
    const passing: ITtscEvidenceProject = createProject({
      name: "central-exclusion-carriers",
      lintConfig: [
        'import type { ITtscLintConfig } from "@ttsc/lint";',
        'import { evidence, type ITtscEvidenceGraphConfig } from "@ttsc/evidence";',
        "",
        "const graph: ITtscEvidenceGraphConfig = {",
        "  claims: [",
        "    {",
        '      name: "schema-models",',
        '      type: "prisma",',
        '      files: ["prisma/**/*.prisma", "prisma/exclude.schema"],',
        '      symbol: "model",',
        "      reference: {",
        '        type: "markdown",',
        '        files: ["docs/schema.md"],',
        '        symbol: "h2",',
        "      },",
        "    },",
        "    {",
        '      name: "api-operations",',
        '      type: "typescript",',
        '      files: ["src/controllers/**/*.ts"],',
        '      symbol: "function",',
        "      reference: [",
        "        {",
        '          type: "markdown",',
        '          files: ["docs/controller.md"],',
        '          symbol: "h2",',
        "        },",
        "        {",
        '          type: "prisma",',
        '          files: ["prisma/**/*.prisma"],',
        '          symbol: "model",',
        "        },",
        "      ],",
        "    },",
        "    {",
        '      name: "dto-types",',
        '      type: "typescript",',
        '      files: ["src/structures/**/*.ts"],',
        '      symbol: "type",',
        "      reference: {",
        '        type: "markdown",',
        '        files: ["docs/dto.md"],',
        '        symbol: "h2",',
        "      },",
        "    },",
        "    {",
        '      name: "dto-properties",',
        '      type: "typescript",',
        '      files: ["src/structures/**/*.ts"],',
        '      symbol: "property",',
        "      reference: {",
        '        type: "prisma",',
        '        files: ["prisma/**/*.prisma"],',
        '        symbol: "column",',
        "      },",
        "    },",
        "    {",
        '      name: "backend-tests",',
        '      type: "typescript",',
        '      files: ["src/tests/**/*.ts"],',
        '      symbol: "function",',
        "      reference: [",
        "        {",
        '          type: "markdown",',
        '          files: ["docs/test.md"],',
        '          symbol: "h2",',
        "        },",
        "        {",
        '          type: "typescript",',
        '          files: ["src/contracts.ts"],',
        '          symbol: "function",',
        "        },",
        "        {",
        '          type: "typescript",',
        '          files: ["src/contracts.ts"],',
        '          symbol: "type",',
        "        },",
        "      ],",
        "    },",
        "  ],",
        "};",
        "",
        "export default {",
        "  plugins: { evidence },",
        '  rules: { "evidence/graph": ["error", graph] },',
        "} satisfies ITtscLintConfig;",
        "",
      ].join("\n"),
      files: {
        "docs/schema.md": "## Persistence {#persistence}\n",
        "docs/controller.md": "## Operation {#operation}\n",
        "docs/dto.md": "## Contract {#contract}\n",
        "docs/test.md": "## Scenario {#scenario}\n",
        "prisma/schema.prisma": [
          "datasource db {",
          '  provider = "sqlite"',
          "}",
          "",
          "model Sale {",
          "  id String @id",
          "}",
          "",
        ].join("\n"),
        "prisma/exclude.schema": [
          "/// Lint-only schema exclusions.",
          "///",
          "/// @evidenceExclude docs/schema.md#persistence This fixture intentionally stores no requirement-owned model.",
          "",
        ].join("\n"),
        "src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts": [
          "/**",
          " * Central controller exclusions.",
          " *",
          " * @evidenceExclude docs/controller.md#operation This fixture intentionally exposes no operation.",
          " * @evidenceExclude prisma:Sale This fixture intentionally exposes no sale operation.",
          " */",
          "export const CONTROLLER_EVIDENCE_EXCLUDE = true;",
          "export function selectedController(): void {}",
          "",
        ].join("\n"),
        "src/structures/DTO_EVIDENCE_EXCLUDE.ts": [
          "/**",
          " * Central DTO exclusions.",
          " *",
          " * @evidenceExclude docs/dto.md#contract This fixture intentionally publishes no DTO.",
          " * @evidenceExclude prisma:Sale.id This fixture intentionally transports no sale id.",
          " */",
          "export const DTO_EVIDENCE_EXCLUDE = true;",
          "export interface SelectedDto {",
          "  id: string;",
          "}",
          "",
        ].join("\n"),
        "src/contracts.ts": [
          "/** Public operation contract. */",
          "export function publicOperation(): void {}",
          "",
          "/** Public data contract. */",
          "export interface IContract {}",
          "",
        ].join("\n"),
        "src/tests/TEST_EVIDENCE_EXCLUDE.ts": [
          'import type { IContract, publicOperation } from "../contracts.js";',
          "",
          "/**",
          " * Central backend-test exclusions.",
          " *",
          " * @evidenceExclude docs/test.md#scenario This fixture intentionally runs no scenario.",
          " * @evidenceExclude {@link publicOperation} This fixture intentionally calls no operation.",
          " * @evidenceExclude {@link IContract} This fixture intentionally validates no response type.",
          " */",
          "export const TEST_EVIDENCE_EXCLUDE = true;",
          "export function selectedTest(): void {}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(passing.directory);
      assertStatus(
        result,
        0,
        "Every central carrier must cover its own claim-reference obligations.",
      );
      assertExcludes(
        result,
        "Missing acknowledgement",
        "Valid carrier exclusions must discharge all configured obligations.",
      );
    } finally {
      passing.cleanup();
    }

    const failing: ITtscEvidenceProject = createProject({
      name: "invalid-central-exclusion-carriers",
      lintConfig: [
        'import type { ITtscLintConfig } from "@ttsc/lint";',
        'import { evidence } from "@ttsc/evidence";',
        "",
        "export default {",
        "  plugins: { evidence },",
        "  rules: {",
        '    "evidence/graph": ["error", { claims: [',
        "      {",
        '        type: "typescript",',
        '        files: ["src/CONTROLLER_EVIDENCE_EXCLUDE.ts"],',
        '        symbol: "function",',
        "        reference: {",
        '          type: "markdown",',
        '          files: ["docs/contract.md"],',
        '          symbol: "h2",',
        "        },",
        "      },",
        "      {",
        '        type: "prisma",',
        '        files: ["prisma/**/*.prisma", "prisma/exclude.schema"],',
        '        symbol: "model",',
        "        reference: {",
        '          type: "markdown",',
        '          files: ["docs/schema.md"],',
        '          symbol: "h2",',
        "        },",
        "      },",
        "    ] }],",
        "  },",
        "} satisfies ITtscLintConfig;",
        "",
      ].join("\n"),
      files: {
        "docs/contract.md": "## Contract {#contract}\n",
        "docs/schema.md": "## Schema {#schema}\n",
        "src/CONTROLLER_EVIDENCE_EXCLUDE.ts": [
          "/** @evidence docs/contract.md#contract A property cannot own a function claim. */",
          "export const CONTROLLER_EVIDENCE_EXCLUDE = true;",
          "export function selectedController(): void {}",
          "",
        ].join("\n"),
        "prisma/schema.prisma": [
          "datasource db {",
          '  provider = "sqlite"',
          "}",
          "",
          "model Sale {",
          "  id String @id",
          "}",
          "",
        ].join("\n"),
        "prisma/exclude.schema": [
          "/// @evidence docs/schema.md#schema A file cannot own model evidence.",
          "",
          "// @evidenceExclude docs/schema.md#schema Prisma discards this line.",
          "",
          "/// @evidenceExclude docs/schema.md#missing This target is not configured.",
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(failing.directory);
      assertFailure(
        result,
        "Carrier eligibility must not relax ownership or Prisma comment syntax.",
      );
      assertIncludes(
        result,
        "Out-of-scope @evidence host",
        "TypeScript ownership evidence must remain on the selected symbol kind.",
      );
      assertIncludes(
        result,
        "only @evidenceExclude may be unattached at file level",
        "A Prisma file carrier must reject ownership evidence.",
      );
      assertIncludes(
        result,
        "'//' line comment",
        "A discarded Prisma comment must remain invalid.",
      );
      assertIncludes(
        result,
        "Unresolved evidence target 'docs/schema.md#missing'",
        "A file carrier must retain exact target resolution.",
      );
    } finally {
      failing.cleanup();
    }
  };
