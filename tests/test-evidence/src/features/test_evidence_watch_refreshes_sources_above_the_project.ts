import fs from "node:fs";
import path from "node:path";

import {
  FIRST_BUILD_TIMEOUT,
  type IRunResult,
  type ITtscEvidenceProject,
  type IWatchSession,
  assertIncludes,
  assertStatus,
  createProject,
  startWatch,
} from "../internal/index";

const CONTRACT = (operationPath: string): string =>
  `${JSON.stringify(
    {
      openapi: "3.1.0",
      info: { title: "Members", version: "1.0.0" },
      paths: {
        [operationPath]: {
          post: { responses: { "201": { description: "Created" } } },
        },
      },
    },
    null,
    2,
  )}\n`;

/**
 * Verifies an edit to a source above the ttsc project invalidates the graph
 * under `ttsc check --watch`, for both a rooted Markdown population and an
 * ancestor-relative Swagger document.
 *
 * Lifting the project-root ceiling is only half the feature. A document the
 * host does not watch is a citation that keeps reporting green after the
 * grounds for it change, which is the exact failure the project-input contract
 * exists to remove — and it is the failure a shared document set makes most
 * likely, because the package that edits the requirement is usually not the
 * package that cites it. Both channels are driven in one session because they
 * publish through different paths: a glob joined to its root, and an exact file
 * that ascends.
 *
 * 1. Watch a project citing a document and a contract that both sit beside it.
 * 2. Rename the cited heading outside the project and assert the rebuild fails.
 * 3. Restore it, then change the contract's operation path and assert the same.
 * 4. Restore that too and assert the graph closes from those events alone.
 */
export const test_evidence_watch_refreshes_sources_above_the_project =
  async (): Promise<void> => {
    const project: ITtscEvidenceProject = createProject({
      name: "watch-above-project",
      lintConfig: [
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
        '          symbol: "type",',
        "          reference: [",
        "            {",
        '              type: "markdown",',
        '              root: "../docs",',
        '              files: ["requirements/**"],',
        '              symbol: "h2",',
        "            },",
        '            { type: "swagger", file: "../contracts/swagger.json" },',
        "          ],",
        "        },",
        "      ],",
        "    }],",
        "  },",
        "};",
        "",
      ].join("\n"),
      workspaceFiles: {
        "docs/requirements/pricing.md": "## Discount Policy {#discounts}\n",
        "contracts/swagger.json": CONTRACT("/members"),
      },
      files: {
        "src/sale.ts": [
          "/** @evidence requirements/pricing.md#discounts Discount stacking follows this section. */",
          "/** @evidence POST:/members Creates members through the shared API contract. */",
          "export interface ISale {}",
          "",
        ].join("\n"),
      },
    });
    const session: IWatchSession = startWatch(project.directory);
    try {
      assertStatus(
        await session.nextBuild(FIRST_BUILD_TIMEOUT),
        0,
        "The first watch build must prove the fixture passes before freshness is tested.",
      );

      writeOutside(
        project,
        "docs/requirements/pricing.md",
        "## Refund Policy {#refunds}\n",
      );
      const renamed: IRunResult = await session.nextBuild();
      assertStatus(
        renamed,
        2,
        "Renaming a heading above the project must fail the next watch build with no TypeScript file touched.",
      );
      assertIncludes(
        renamed,
        "Unresolved evidence target 'requirements/pricing.md#discounts'",
        "The rebuild must read the edited document rather than reuse the previous cycle's inventory.",
      );

      writeOutside(
        project,
        "docs/requirements/pricing.md",
        "## Discount Policy {#discounts}\n",
      );
      assertStatus(
        await session.nextBuild(),
        0,
        "Restoring the heading must clear the diagnostics from the out-of-project event alone.",
      );

      writeOutside(project, "contracts/swagger.json", CONTRACT("/customers"));
      const regenerated: IRunResult = await session.nextBuild();
      assertStatus(
        regenerated,
        2,
        "Regenerating a contract above the project must fail the next watch build.",
      );
      assertIncludes(
        regenerated,
        "Unresolved evidence target 'POST:/members'",
        "The rebuild must re-normalize the edited contract rather than answer from the previous cycle.",
      );

      writeOutside(project, "contracts/swagger.json", CONTRACT("/members"));
      assertStatus(
        await session.nextBuild(),
        0,
        "Restoring the operation must close the graph from the contract event alone.",
      );
    } finally {
      await session.close();
      project.cleanup();
    }
  };

const writeOutside = (
  project: ITtscEvidenceProject,
  relative: string,
  content: string,
): void => {
  const location: string = path.join(project.workspace, relative);
  fs.mkdirSync(path.dirname(location), { recursive: true });
  fs.writeFileSync(location, content, "utf8");
};
