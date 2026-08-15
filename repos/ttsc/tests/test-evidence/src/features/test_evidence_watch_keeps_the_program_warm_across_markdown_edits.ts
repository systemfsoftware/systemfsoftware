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
 * Verifies a declared external change refreshes the graph without reloading the
 * TypeScript Program.
 *
 * Freshness and residency are separate properties, and only one of them is
 * visible in a diagnostic. A host that answered every Markdown edit by dropping
 * its Program would pass every other watch case in this suite while making
 * watch mode cost a cold compile per keystroke — the regression would show up
 * as a complaint about speed, months later, with nothing to point at.
 *
 * What makes this the plugin's business rather than the host's is the kind it
 * declares. The resident check keeps its Program only for a changed path it can
 * recognize as a declared data input; anything else is read as a change in the
 * selected compiler topology and drops the Program. So a document declared with
 * the wrong kind, or reported through some channel other than this contract,
 * would still be fresh here and would silently stop being resident.
 *
 * 1. Watch a project with `--diagnostics`, so each rebuild reports its Program
 *    load count.
 * 2. Edit only the declared Markdown document.
 * 3. Assert the graph refreshed and the load count did not advance.
 */
export const test_evidence_watch_keeps_the_program_warm_across_markdown_edits =
  async (): Promise<void> => {
    const project: ITtscEvidenceProject = createProject({
      name: "watch-resident-program",
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
        "docs/spec.md": "## Alpha\n",
        "src/implementation.ts": [
          "/** @evidence docs/spec.md#alpha Implements the current specification section. */",
          "export interface Implementation {}",
          "",
        ].join("\n"),
      },
    });
    const session: IWatchSession = startWatch(project.directory, {
      diagnostics: true,
    });
    try {
      const first: IRunResult = await session.nextBuild(FIRST_BUILD_TIMEOUT);
      assertStatus(
        first,
        0,
        "The first watch build must pass before residency is measured.",
      );
      const loaded: number | null = programLoads(first);
      if (loaded === null)
        throw new Error(
          `The resident check must report its telemetry under --diagnostics, or this case measures nothing.\n\nActual output:\n${first.output}`,
        );

      write(project, "docs/spec.md", "## Beta\n");
      const refreshed: IRunResult = await session.nextBuild();
      assertIncludes(
        refreshed,
        "Unresolved evidence target 'docs/spec.md#alpha'",
        "The rebuild must observe the renamed heading, or residency is being measured on a build that did nothing.",
      );
      const reloaded: number | null = programLoads(refreshed);
      if (reloaded !== loaded)
        throw new Error(
          `A declared Markdown change must not reload the TypeScript Program.\n\nProgram loads before: ${loaded}\nProgram loads after: ${reloaded}\n\nActual output:\n${refreshed.output}`,
        );
    } finally {
      await session.close();
      project.cleanup();
    }
  };

/**
 * Reads the resident check's cumulative Program load count from one rebuild.
 *
 * `@ttsc/lint` prints this only under `--diagnostics`; the count is cumulative
 * for the life of the resident process, so two rebuilds reporting the same
 * number is what proves no reload happened between them.
 */
const programLoads = (result: IRunResult): number | null => {
  const match: RegExpMatchArray | null = result.output.match(
    /@ttsc\/lint resident check: pid=\d+ programLoads=(\d+)/,
  );
  return match === null ? null : Number(match[1]);
};

const write = (
  project: ITtscEvidenceProject,
  relative: string,
  content: string,
): void => {
  fs.writeFileSync(path.join(project.directory, relative), content, "utf8");
};
