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
  runCheck,
  startWatch,
} from "../internal/index";

/**
 * Verifies a watch rebuild reaches the same verdict as a cold check of the same
 * filesystem state.
 *
 * Equivalence with the cold path is the property; matching a hand-written
 * expectation is not. A resident session carries one Program across cycles, so
 * a rebuild could answer from warm state a fresh process would never have
 * produced — and every other watch case would still pass, because they all
 * assert what the watcher said rather than whether anything agreed with it.
 *
 * The comparison runs over extracted diagnostics rather than whole transcripts
 * because watch mode prints timestamps and progress lines a one-shot check does
 * not, and comparing those would fail for reasons that say nothing about the
 * graph.
 *
 * 1. Drive a watch session into a state reached by editing Markdown only.
 * 2. Run a cold one-shot check against the same directory.
 * 3. Assert both report the same status and the same evidence diagnostics.
 */
export const test_evidence_watch_agrees_with_a_cold_check =
  async (): Promise<void> => {
    const project: ITtscEvidenceProject = createProject({
      name: "watch-cold-equivalence",
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
    const session: IWatchSession = startWatch(project.directory);
    try {
      assertStatus(
        await session.nextBuild(FIRST_BUILD_TIMEOUT),
        0,
        "The first watch build must pass before the compared state is reached.",
      );

      // A sibling rather than a child. Acknowledgement cascades down the
      // heading hierarchy, so an H3 written under the cited H2 would be covered
      // by the existing citation and the compared state would hold no
      // diagnostic to compare.
      write(project, "docs/spec.md", "## Alpha\n\n## Delta\n");
      const warm: IRunResult = await session.nextBuild();
      const cold: IRunResult = runCheck(project.directory);

      assertStatus(
        warm,
        cold.status === 0 ? 0 : 2,
        "A watch rebuild must reach the same verdict as a cold check of the same files.",
      );
      for (const diagnostic of evidenceDiagnostics(cold))
        assertIncludes(
          warm,
          diagnostic,
          "A cold check found an evidence diagnostic the warm rebuild did not report.",
        );
      for (const diagnostic of evidenceDiagnostics(warm))
        assertIncludes(
          cold,
          diagnostic,
          "A warm rebuild reported an evidence diagnostic a cold check did not find.",
        );
      if (evidenceDiagnostics(cold).length === 0)
        throw new Error(
          `The compared state must contain at least one evidence diagnostic, or the comparison proves nothing.\n\nCold output:\n${cold.output}`,
        );
    } finally {
      await session.close();
      project.cleanup();
    }
  };

/**
 * Extracts this plugin's findings from a transcript.
 *
 * Each diagnostic is cut at its own opening keyword so the compared text
 * excludes the file, line, and severity prefix the two paths format
 * differently.
 */
const evidenceDiagnostics = (result: IRunResult): string[] => {
  const opening = /(Missing|Unresolved|Duplicate|Ambiguous|Out-of-scope) /;
  return result.output
    .split(/\r?\n/)
    .map((line): string => {
      const match: RegExpMatchArray | null = line.match(opening);
      return match?.index === undefined ? "" : line.slice(match.index).trim();
    })
    .filter((line: string): boolean => line.length !== 0);
};

const write = (
  project: ITtscEvidenceProject,
  relative: string,
  content: string,
): void => {
  fs.writeFileSync(path.join(project.directory, relative), content, "utf8");
};
