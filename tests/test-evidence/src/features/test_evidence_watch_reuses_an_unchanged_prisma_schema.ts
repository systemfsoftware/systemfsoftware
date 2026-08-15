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
  privatizeLibrary,
  startWatch,
} from "../internal/index";

/**
 * Verifies a resident session stops re-parsing a Prisma schema nobody touched.
 *
 * Parsing costs a Node process, and the process start dominates it exactly as
 * it does for Swagger. A resident host pays that toll on every rebuild, so
 * without the content cache, editing an unrelated TypeScript file would re-read
 * and re-parse a schema that has not changed since the session started.
 *
 * The digest itself is pinned in several unit cases, including that Go and Node
 * compose the same key against the real bridge. None of them can show that a
 * rebuild actually skipped the spawn — a disagreement there produces correct
 * results on every cycle and only loses the feature, which is the failure mode
 * that cannot be seen from either side alone.
 *
 * Proving a spawn did _not_ happen needs the spawn to be impossible, or silence
 * proves nothing. So the bridge's own module is deleted from the fixture after
 * the first build. It is the narrowest thing that can be taken away: the plugin
 * descriptor still loads, the rules still run, and only the one file the Prisma
 * bridge requires is gone. A second parse would fail loudly, and a green
 * rebuild can only mean the schema was answered from memory.
 *
 * 1. Watch a project whose citation covers the one declared model.
 * 2. Delete the bridge module, then edit only a TypeScript file.
 * 3. Assert the rebuild stays green, so no parse was attempted.
 * 4. Edit the schema itself and assert the rebuild does fail, proving the bridge
 *    really was unusable rather than merely unneeded.
 */
export const test_evidence_watch_reuses_an_unchanged_prisma_schema =
  async (): Promise<void> => {
    const project: ITtscEvidenceProject = createProject({
      name: "watch-prisma-reuse",
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
        '          files: ["src/sale.ts"],',
        '          symbol: "type",',
        '          reference: { type: "prisma", files: ["prisma/**/*.prisma"] },',
        "        },",
        "      ],",
        "    }],",
        "  },",
        "};",
        "",
      ].join("\n"),
      files: {
        "prisma/schema.prisma": schemaWith(["Sale"]),
        "src/sale.ts": [
          "/** @evidence prisma:Sale This contract materializes the sale row. */",
          "export interface ISale {}",
          "",
        ].join("\n"),
        "src/unrelated.ts": "export const version = 1;\n",
      },
    });

    // Revoking the bridge means writing inside the fixture's copy of the
    // plugin, which is a junction into the workspace until this swaps it.
    const library: string = privatizeLibrary(project.directory);

    const session: IWatchSession = startWatch(project.directory);
    try {
      assertStatus(
        await session.nextBuild(FIRST_BUILD_TIMEOUT),
        0,
        "The first build must parse the schema before reuse is tested.",
      );

      fs.rmSync(path.join(library, "internal", "loadPrismaModels.js"));

      write(project, "src/unrelated.ts", "export const version = 2;\n");
      assertStatus(
        await session.nextBuild(),
        0,
        "An unchanged schema must be answered from memory; this rebuild had no usable bridge.",
      );

      write(project, "prisma/schema.prisma", schemaWith(["Sale", "Seller"]));
      const reparsed: IRunResult = await session.nextBuild();
      assertStatus(
        reparsed,
        2,
        "An edited schema must be re-parsed, which the deleted bridge cannot do.",
      );
      assertIncludes(
        reparsed,
        "Prisma schema loader",
        "The failure must name the loader, proving it was genuinely unusable for the quiet rebuild above.",
      );
    } finally {
      await session.close();
      project.cleanup();
    }
  };

/** Builds a schema declaring one model per given name. */
const schemaWith = (models: readonly string[]): string =>
  [
    "datasource db {",
    '  provider = "postgresql"',
    "}",
    "",
    ...models.flatMap((model: string) => [
      `model ${model} {`,
      "  id String @id @db.Uuid",
      "}",
      "",
    ]),
  ].join("\n");

const write = (
  project: ITtscEvidenceProject,
  relative: string,
  content: string,
): void => {
  fs.writeFileSync(path.join(project.directory, relative), content, "utf8");
};
