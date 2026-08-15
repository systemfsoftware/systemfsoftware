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
 * Verifies a resident session stops re-normalizing a Swagger document nobody
 * touched.
 *
 * Normalizing costs a Node process, and the process start dominates: measured
 * on this suite's own bridge, a 3-operation document costs 198 ms and a
 * 240-operation one costs 234 ms. A resident host pays that toll on every
 * rebuild, so before the content cache existed, editing an unrelated TypeScript
 * file re-read and re-upgraded an OpenAPI document that had not changed since
 * the session started.
 *
 * Proving a spawn did _not_ happen needs the spawn to be impossible, or silence
 * proves nothing. So the bridge's own module is deleted from the fixture after
 * the first build. It is the narrowest thing that can be taken away: the plugin
 * descriptor still loads from `lib/index.js`, the rules still run, and only the
 * one file the Swagger bridge requires is gone. A second normalization would
 * fail loudly, and a green rebuild can only mean the document was answered from
 * memory.
 *
 * 1. Watch a project whose citation covers the one declared operation.
 * 2. Delete the bridge module, then edit only a TypeScript file.
 * 3. Assert the rebuild stays green, so no normalization was attempted.
 * 4. Edit the document itself and assert the rebuild does fail, proving the bridge
 *    really was unusable rather than merely unneeded.
 */
export const test_evidence_watch_reuses_an_unchanged_swagger_document =
  async (): Promise<void> => {
    const project: ITtscEvidenceProject = createProject({
      name: "watch-swagger-reuse",
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
        '          files: ["src/members.ts"],',
        '          symbol: "type",',
        '          reference: { type: "swagger", file: "api/swagger.json" },',
        "        },",
        "      ],",
        "    }],",
        "  },",
        "};",
        "",
      ].join("\n"),
      files: {
        "api/swagger.json": swaggerWith(["post"]),
        "src/members.ts": [
          "/** @evidence POST:/members Creates members through the declared API operation. */",
          "export interface IMemberCreation {}",
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
        "The first build must normalize the document before reuse is tested.",
      );

      fs.rmSync(path.join(library, "internal", "loadSwaggerOperations.js"));

      write(project, "src/unrelated.ts", "export const version = 2;\n");
      assertStatus(
        await session.nextBuild(),
        0,
        "An unchanged document must be answered from memory; this rebuild had no usable bridge.",
      );

      write(project, "api/swagger.json", swaggerWith(["post", "get"]));
      const renormalized: IRunResult = await session.nextBuild();
      assertStatus(
        renormalized,
        2,
        "An edited document must be re-normalized, which the deleted bridge cannot do.",
      );
      assertIncludes(
        renormalized,
        "Swagger normalizer",
        "The failure must name the normalizer, proving it was genuinely unusable for the quiet rebuild above.",
      );
    } finally {
      await session.close();
      project.cleanup();
    }
  };

/** Builds an OpenAPI document declaring one path with the given methods. */
const swaggerWith = (methods: readonly string[]): string =>
  `${JSON.stringify(
    {
      openapi: "3.1.0",
      info: { title: "Members", version: "1.0.0" },
      paths: {
        "/members": Object.fromEntries(
          methods.map((method: string) => [
            method,
            { responses: { "200": { description: "OK" } } },
          ]),
        ),
      },
    },
    null,
    2,
  )}\n`;

const write = (
  project: ITtscEvidenceProject,
  relative: string,
  content: string,
): void => {
  fs.writeFileSync(path.join(project.directory, relative), content, "utf8");
};
