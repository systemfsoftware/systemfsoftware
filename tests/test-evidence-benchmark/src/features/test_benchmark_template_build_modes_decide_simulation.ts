import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { IBenchmarkWorkspace } from "../internal/IBenchmarkWorkspace";
import type { IRunResult } from "../internal/IRunResult";
import { assertStatus } from "../internal/assertStatus";
import { acquireBenchmarkWorkspace } from "../internal/benchmarkWorkspace";
import { runScript } from "../internal/runScript";

/**
 * Verifies the delivered workspace's two build scripts really build different
 * applications, and that its screen plan refuses the tree it was handed.
 *
 * Both are gates the arms share, and both are claims about a delivered
 * workspace rather than about a script read in isolation. The build split is
 * what makes `pnpm test:e2e` the live gate: `vite.config.ts` writes
 * `VITE_API_SIMULATE` from the mode unconditionally in both directions, so
 * `build` is live and `build:contract` is simulated and no `.env` a cell writes
 * can disagree with either. A workspace where both scripts emitted the same
 * bundle would run the contract suite and the journey suite against one
 * application while every document called them opposites.
 *
 * The screen plan is checked here against the scaffold itself. The sibling case
 * drives the script over a synthetic tree it builds row by row, which is what
 * proves the counting; this one proves the script is wired into a delivered
 * workspace at all, where the plan is empty and the frozen corpus is the
 * subject's own.
 *
 * 1. Build the backend far enough for the frontend to have an SDK to import.
 * 2. Build live, then simulated, and require a zero exit from each.
 * 3. Assert the two outputs differ.
 * 4. Assert `pnpm plan` refuses the delivered workspace, which has no screens.
 */
export const test_benchmark_template_build_modes_decide_simulation =
  async (): Promise<void> => {
    const workspace: IBenchmarkWorkspace =
      await acquireBenchmarkWorkspace("evidence");
    const backend: string = path.join(
      workspace.workspace,
      "packages",
      "backend",
    );
    for (const script of ["build:prisma", "build:main", "build:sdk"]) {
      const result: IRunResult = runScript({ cwd: backend, script });
      assertStatus(
        result,
        0,
        `The frontend imports the SDK the backend generates, so \`pnpm ${script}\` must pass before either frontend build can run.`,
      );
    }

    const frontend: string = path.join(
      workspace.workspace,
      "packages",
      "frontend",
    );
    const live: IRunResult = runScript({ cwd: frontend, script: "build" });
    assertStatus(
      live,
      0,
      "`pnpm build` is what `pnpm test:e2e` runs, so a delivered workspace that cannot build live has no live gate.",
    );
    const liveDigest: string = digestDirectory(path.join(frontend, "dist"));

    const simulated: IRunResult = runScript({
      cwd: frontend,
      script: "build:contract",
    });
    assertStatus(
      simulated,
      0,
      "`pnpm build:contract` is what `pnpm test:contract` runs, so a delivered workspace that cannot build simulated has no contract gate.",
    );
    const simulatedDigest: string = digestDirectory(
      path.join(frontend, "dist"),
    );

    if (liveDigest === simulatedDigest)
      throw new Error(
        `\`pnpm build\` and \`pnpm build:contract\` emitted identical output (${liveDigest}). The only input the mode changes is \`VITE_API_SIMULATE\`, so identical bundles mean the contract suite and the journey suite run the same application and one of the two names is false.`,
      );

    const plan: IRunResult = runScript({ cwd: frontend, script: "plan" });
    if (plan.status === 0)
      throw new Error(
        `\`pnpm plan\` accepted the delivered workspace, which carries no screen and no plan. A check that passes before any screen exists cannot report one that is missing.\n\n${plan.output}`,
      );
  };

/**
 * Hashes a directory's file names and bytes into one digest.
 *
 * Entries are sorted so the digest describes the tree rather than the order the
 * filesystem happened to return, and the relative path is hashed beside each
 * file's bytes so a renamed asset changes it.
 */
const digestDirectory = (directory: string): string => {
  const hash = crypto.createHash("sha256");
  const walk = (current: string): void => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const location: string = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(location);
        continue;
      }
      hash.update(path.relative(directory, location).split(path.sep).join("/"));
      hash.update(fs.readFileSync(location));
    }
  };
  if (!fs.existsSync(directory))
    throw new Error(
      `${directory} does not exist, so the build produced no output to compare.`,
    );
  walk(directory);
  return hash.digest("hex");
};
