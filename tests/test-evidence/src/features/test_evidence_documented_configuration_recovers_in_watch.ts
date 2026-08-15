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
 * Verifies configuration deduplication is scoped to one watch Program cycle.
 *
 * A process-wide once flag would make the first invalid build look correct and
 * then hide the same defect after any rebuild; a flag that never clears would
 * also retain failure after the config is repaired. The graph project state is
 * recreated per cycle, so each invalid verdict speaks once and the repaired
 * cycle starts clean.
 *
 * 1. Start watch with one invalid documented option over several files.
 * 2. Rebuild while it remains invalid and require one finding again.
 * 3. Repair the option and require the next build to pass.
 */
export const test_evidence_documented_configuration_recovers_in_watch =
  async (): Promise<void> => {
    const project: ITtscEvidenceProject = createProject({
      name: "watch-documented-config",
      include: ["src"],
      lintConfig: lintConfig("symbols"),
      files: {
        "docs/spec.md": "## Contract\n",
        "src/claim.ts": [
          "/**",
          " * Claim.",
          " * @evidence docs/spec.md#contract Implements this contract.",
          " */",
          "export interface Claim {}",
          "",
        ].join("\n"),
        "src/extra.ts": "/** Extra. */\nexport interface Extra {}\n",
      },
    });
    const session: IWatchSession = startWatch(project.directory);
    try {
      const initial: IRunResult = await session.nextBuild(FIRST_BUILD_TIMEOUT);
      assertOneConfigurationFinding(initial, "The first invalid cycle");

      fs.writeFileSync(
        path.join(project.directory, "src", "extra.ts"),
        "/** Extra, edited. */\nexport interface Extra {}\n",
        "utf8",
      );
      assertOneConfigurationFinding(
        await session.nextBuild(),
        "A later still-invalid cycle",
      );

      fs.writeFileSync(
        path.join(project.directory, "lint.config.ts"),
        lintConfig("symbol"),
        "utf8",
      );
      assertStatus(
        await session.nextBuild(),
        0,
        "Repairing the option must clear the cycle-scoped configuration finding.",
      );
    } finally {
      await session.close();
      project.cleanup();
    }
  };

const assertOneConfigurationFinding = (
  result: IRunResult,
  context: string,
): void => {
  assertStatus(result, 2, `${context} must fail.`);
  assertIncludes(
    result,
    "Invalid evidence/documented configuration",
    `${context} must name the invalid setting.`,
  );
  const occurrences: number =
    result.output.split("Invalid evidence/documented configuration").length - 1;
  if (occurrences !== 1)
    throw new Error(
      `${context} must report once, got ${occurrences}.\n\nActual output:\n${result.output}`,
    );
};

const lintConfig = (documentedKey: "symbol" | "symbols"): string =>
  [
    'import { evidence } from "@ttsc/evidence";',
    "",
    "export default {",
    '  plugins: { "evidence": evidence },',
    "  rules: {",
    '    "evidence/graph": ["error", { claims: [{',
    '      type: "typescript",',
    '      files: ["src/claim.ts"],',
    '      symbol: "type",',
    '      reference: { type: "markdown", files: ["docs/spec.md"], symbol: "h2" },',
    "    }] }],",
    `    "evidence/documented": ["error", { ${documentedKey}: "type" }],`,
    "  },",
    "};",
    "",
  ].join("\n");
