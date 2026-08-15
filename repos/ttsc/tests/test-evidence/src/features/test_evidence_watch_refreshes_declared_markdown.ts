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

/**
 * Verifies a Markdown-only edit refreshes the graph under `ttsc check --watch`,
 * while an undeclared document changes nothing.
 *
 * Markdown never enters the TypeScript Program, so until the rule declared its
 * inputs the watcher had no reason to wake for one. The failure that produced
 * was silent in the worst direction: a developer editing only a spec section
 * kept reading the last build's green result while the citation it justified
 * had already gone stale. Pinning the change alone would also be satisfied by a
 * watcher that rebuilds for every file in the repository, so the undeclared
 * README is asserted in the same session as its counter-example.
 *
 * 1. Watch a project whose citation resolves against `docs/spec.md`.
 * 2. Edit an undeclared README and assert the watcher stays quiet.
 * 3. Rename the cited heading and assert the next rebuild reports it stale.
 * 4. Restore it and assert the graph closes from that event alone.
 */
export const test_evidence_watch_refreshes_declared_markdown =
  async (): Promise<void> => {
    const project: ITtscEvidenceProject = createProject({
      name: "watch-markdown",
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
        "README.md": "# Fixture\n",
        "docs/spec.md": "## Alpha\n",
        "src/implementation.ts": implementationFor("alpha"),
      },
    });
    const session: IWatchSession = startWatch(project.directory);
    try {
      assertStatus(
        await session.nextBuild(FIRST_BUILD_TIMEOUT),
        0,
        "The first watch build must prove the fixture passes before freshness is tested.",
      );

      write(project, "README.md", "# Fixture\n\nUnrelated prose.\n");
      await session.expectNoBuild(1_500);

      write(project, "docs/spec.md", "## Beta\n");
      const renamed: IRunResult = await session.nextBuild();
      assertStatus(
        renamed,
        2,
        "Renaming a cited heading must fail the next watch build with no TypeScript file touched.",
      );
      assertIncludes(
        renamed,
        "Unresolved evidence target 'docs/spec.md#alpha'",
        "The rebuild must read the renamed document rather than reuse the previous cycle's inventory.",
      );
      assertIncludes(
        renamed,
        "Missing acknowledgement for 'docs/spec.md#beta'",
        "The renamed heading must become the current obligation.",
      );

      write(project, "docs/spec.md", "## Alpha\n");
      assertStatus(
        await session.nextBuild(),
        0,
        "Restoring the heading must clear the diagnostics from the Markdown event alone.",
      );
    } finally {
      await session.close();
      project.cleanup();
    }
  };

const implementationFor = (anchor: string): string =>
  [
    `/** @evidence docs/spec.md#${anchor} Implements the current specification section. */`,
    "export interface Implementation {}",
    "",
  ].join("\n");

const write = (
  project: ITtscEvidenceProject,
  relative: string,
  content: string,
): void => {
  fs.writeFileSync(path.join(project.directory, relative), content, "utf8");
};
