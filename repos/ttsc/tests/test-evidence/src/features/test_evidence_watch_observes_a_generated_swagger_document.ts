import fs from "node:fs";
import path from "node:path";

import {
  FIRST_BUILD_TIMEOUT,
  type IRunResult,
  type ITtscEvidenceProject,
  type IWatchSession,
  assertStatus,
  createProject,
  startWatch,
} from "../internal/index";

/**
 * Verifies a declared Swagger path stays watched while the document does not
 * exist.
 *
 * An exact path remains a dependency through absence, and that is what makes a
 * generated document usable at all: the first `ttsc check --watch` of a clean
 * checkout runs before the generator does, so a watcher registered only on the
 * files present at startup would never see the document arrive. The author
 * would be left with a red build that no amount of generating could clear.
 *
 * 1. Watch a project whose declared Swagger document has not been generated.
 * 2. Assert the first build reports the citation as unresolvable.
 * 3. Write the document and assert the rebuild materializes its operations.
 */
export const test_evidence_watch_observes_a_generated_swagger_document =
  async (): Promise<void> => {
    const project: ITtscEvidenceProject = createProject({
      name: "watch-swagger-generated",
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
        '          reference: { type: "swagger", file: "api/swagger.json" },',
        "        },",
        "      ],",
        "    }],",
        "  },",
        "};",
        "",
      ].join("\n"),
      files: {
        "src/members.ts": [
          "/** @evidence POST:/members Creates members through the declared API operation. */",
          "export interface IMemberCreation {}",
          "",
        ].join("\n"),
      },
    });
    const session: IWatchSession = startWatch(project.directory);
    try {
      const absent: IRunResult = await session.nextBuild(FIRST_BUILD_TIMEOUT);
      assertStatus(
        absent,
        2,
        "A citation against a document that does not exist cannot resolve and must be reported.",
      );

      write(
        project,
        "api/swagger.json",
        `${JSON.stringify(
          {
            openapi: "3.1.0",
            info: { title: "Members", version: "1.0.0" },
            paths: {
              "/members": {
                post: { responses: { "200": { description: "OK" } } },
              },
            },
          },
          null,
          2,
        )}\n`,
      );
      assertStatus(
        await session.nextBuild(),
        0,
        "Generating the declared document must be observed even though it was missing when the watch started.",
      );
    } finally {
      await session.close();
      project.cleanup();
    }
  };

const write = (
  project: ITtscEvidenceProject,
  relative: string,
  content: string,
): void => {
  const location: string = path.join(project.directory, relative);
  fs.mkdirSync(path.dirname(location), { recursive: true });
  fs.writeFileSync(location, content, "utf8");
};
