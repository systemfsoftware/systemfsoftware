import assert from "node:assert/strict";

import {
  type IRunResult,
  type ITtscEvidenceProject,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies TypeScript, Markdown, and Prisma claims activate only after their
 * own symbol selector materializes a host.
 *
 * Silence alone cannot prove activation works. The inactive fixture puts
 * unreadable references behind three zero-host claims, while the positive twin
 * changes only the selected declarations and must emit coverage diagnostics.
 *
 * 1. Match a scalar export, an H1-only document, and a model-free Prisma file.
 * 2. Assert all three zero-host claims stay inactive under the real compiler.
 * 3. Replace them with a callable export, H2 heading, and Prisma model.
 * 4. Assert all three claims activate and report their unacknowledged targets.
 */
export const test_evidence_graph_activates_only_selected_claim_hosts =
  (): void => {
    const inactive: ITtscEvidenceProject = createProject({
      name: "selected-hosts-inactive",
      lintConfig: config(true),
      files: {
        "src/claim.ts": "export const value = 1;\n",
        "docs/claim.md": "# Claim\n",
        "prisma/schema/main.prisma": [
          "generator client {",
          '  provider = "prisma-client"',
          '  output = "../../src/prisma"',
          "}",
          "",
          "datasource db {",
          '  provider = "sqlite"',
          "}",
          "",
        ].join("\n"),
      },
    });
    try {
      assertStatus(
        runCheck(inactive.directory),
        0,
        "All three claims have matched files but zero selected hosts.",
      );
    } finally {
      inactive.cleanup();
    }

    const active: ITtscEvidenceProject = createProject({
      name: "selected-hosts-active",
      lintConfig: config(false),
      files: {
        "src/claim.ts": "export const run = (): void => {};\n",
        "docs/claim.md": "## Claim\n",
        "docs/reference.md": "## Requirement\n",
        "prisma/schema/main.prisma": [
          "model contract {",
          "  id String @id",
          "}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result: IRunResult = runCheck(active.directory);
      assertStatus(
        result,
        2,
        "The selected callable, heading, and model must activate coverage.",
      );
      assert.equal(
        (
          result.output.match(
            /Missing acknowledgement for 'docs\/reference\.md#requirement'/gu,
          ) ?? []
        ).length,
        2,
        "The TypeScript and Prisma claims must each evaluate Markdown coverage.",
      );
      assert.equal(
        (
          result.output.match(
            /Missing acknowledgement for 'prisma:contract'/gu,
          ) ?? []
        ).length,
        1,
        "The Markdown claim must evaluate Prisma coverage exactly once.",
      );
    } finally {
      active.cleanup();
    }
  };

const config = (missingReferences: boolean): string =>
  [
    'import evidence from "@ttsc/evidence";',
    "",
    "export default {",
    '  plugins: { "evidence": evidence },',
    "  rules: {",
    '    "evidence/graph": ["error", {',
    "      claims: [",
    "        {",
    '          type: "typescript",',
    '          files: ["src/**/*.ts"],',
    '          symbol: "function",',
    "          reference: {",
    '            type: "markdown",',
    ...(missingReferences
      ? [
          '            root: "missing-typescript-docs",',
          '            files: ["**/*.md"],',
        ]
      : ['            files: ["docs/reference.md"],']),
    '            symbol: "h2",',
    "          },",
    "        },",
    "        {",
    '          type: "markdown",',
    '          files: ["docs/claim.md"],',
    '          symbol: "h2",',
    "          reference: {",
    '            type: "prisma",',
    ...(missingReferences
      ? [
          '            root: "missing-markdown-prisma",',
          '            files: ["**/*.prisma"],',
        ]
      : ['            files: ["prisma/schema/main.prisma"],']),
    '            symbol: "model",',
    "          },",
    "        },",
    "        {",
    '          type: "prisma",',
    '          files: ["prisma/schema/main.prisma"],',
    '          symbol: "model",',
    "          reference: {",
    '            type: "markdown",',
    ...(missingReferences
      ? [
          '            root: "missing-prisma-docs",',
          '            files: ["**/*.md"],',
        ]
      : ['            files: ["docs/reference.md"],']),
    '            symbol: "h2",',
    "          },",
    "        },",
    "      ],",
    "    }],",
    "  },",
    "};",
    "",
  ].join("\n");
