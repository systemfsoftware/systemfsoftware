import fs from "node:fs";
import path from "node:path";

import {
  FIRST_BUILD_TIMEOUT,
  type IRunResult,
  type ITtscEvidenceProject,
  type IWatchSession,
  assertExcludes,
  assertIncludes,
  assertStatus,
  createProject,
  startWatch,
} from "../internal/index";

/**
 * Verifies creating and deleting a declared Markdown document both reach the
 * watcher.
 *
 * A glob is declared as a population rather than as the files it happens to
 * match, which is what keeps a document that does not exist yet a dependency.
 * Change alone is the easy half: a watcher registered on the files present at
 * startup satisfies it while missing every create, and a document generated
 * during development is exactly the one an author waits on.
 *
 * 1. Watch a project whose declared glob matches no document at all.
 * 2. Create the document and assert the rebuild materializes its obligation.
 * 3. Delete it and assert the rebuild withdraws that obligation.
 */
export const test_evidence_watch_observes_markdown_create_and_delete =
  async (): Promise<void> => {
    const project: ITtscEvidenceProject = createProject({
      name: "watch-markdown-life",
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
        '          reference: { type: "markdown", files: ["docs/**/*.md"], symbol: "h2" },',
        "        },",
        "      ],",
        "    }],",
        "  },",
        "};",
        "",
      ].join("\n"),
      files: {
        "docs/.keep": "",
        "src/implementation.ts": "export interface Implementation {}\n",
      },
    });
    const session: IWatchSession = startWatch(project.directory);
    try {
      const empty: IRunResult = await session.nextBuild(FIRST_BUILD_TIMEOUT);
      assertStatus(
        empty,
        2,
        "A reference glob matching no document cannot materialize evidence and must be reported.",
      );
      assertIncludes(
        empty,
        "matched no markdown files",
        "The empty population must name the globs that produced it.",
      );

      write(project, "docs/spec.md", "## Alpha\n");
      const created: IRunResult = await session.nextBuild();
      assertIncludes(
        created,
        "Missing acknowledgement for 'docs/spec.md#alpha'",
        "A created document must be observed even though nothing matched the glob when the watch started.",
      );
      assertExcludes(
        created,
        "matched no markdown files",
        "The population must stop being empty once the document exists.",
      );

      fs.rmSync(path.join(project.directory, "docs", "spec.md"));
      const deleted: IRunResult = await session.nextBuild();
      assertIncludes(
        deleted,
        "matched no markdown files",
        "Deleting the only matched document must empty the population again.",
      );
      assertExcludes(
        deleted,
        "Missing acknowledgement for 'docs/spec.md#alpha'",
        "A deleted heading must not survive as an obligation in the next cycle.",
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
  fs.writeFileSync(path.join(project.directory, relative), content, "utf8");
};
