import fs from "node:fs";
import path from "node:path";

import type { IBenchmarkWorkspace } from "../internal/IBenchmarkWorkspace";
import { acquireBenchmarkWorkspace } from "../internal/benchmarkWorkspace";

/**
 * Windows cannot start a program whose path exceeds `MAX_PATH`, and
 * `CreateProcess` has no long-path escape the way Node's own file syscalls do.
 */
const LIMIT = 259;

/**
 * The deepest run directory the benchmark can produce, measured rather than
 * assumed.
 *
 * `<repository>/benchmarks/evidence/output/<subject>/codex/<arm>/runs/<run
 * id>/workspace`, with the longest subject this repository ships, the longer
 * arm name, and a run id's fixed 36 characters.
 */
const worstCaseWorkspaceLength = (repository: string): number => {
  const subjects: readonly string[] = fs.readdirSync(
    path.join(repository, "benchmarks", "evidence", "requirements"),
  );
  const longest: number = subjects.reduce(
    (carry, subject) => Math.max(carry, subject.length),
    0,
  );
  return (
    path.join(repository, "benchmarks", "evidence", "output").length +
    1 +
    longest +
    "/codex/evidence/runs/".length +
    36 +
    "/workspace".length
  );
};

/**
 * Verifies a prepared workspace keeps every program it installs startable, at
 * the deepest path a run directory can put that workspace at.
 *
 * This suite prepares under the OS temporary directory, which is short, so no
 * case here can see what a run directory does to a path — and every cell of a
 * cohort runs from one. The platform package carries a bundled Go toolchain
 * whose deepest tool sits far below the package root, and a source-plugin build
 * starts it by absolute path. Past the limit that start fails, reporting an
 * invalid directory name rather than a length, and every build in the cell
 * fails with it.
 *
 * Preparation therefore moves the package manager's virtual store to a short
 * absolute path. The assertion is stated against the worst case rather than
 * against this suite's own path, because a case that measured where it happened
 * to run would pass here while every cell failed.
 *
 * The limit is Windows', and so is the defense: `MAX_PATH` bounds
 * `CreateProcess` alone, no other platform bounds a path it can start, and
 * `EvidenceBenchmarkWorkspace` moves the store on `win32` only. Asserting the
 * relocation elsewhere would demand a store no other platform's preparation
 * writes — and would demand it on a `.exe` walk that finds nothing there.
 *
 * 1. Skip where the limit this defends against does not exist.
 * 2. Read the store the prepared workspace installed into.
 * 3. Require it to be absolute and outside the workspace.
 * 4. Require every program in it to start from the deepest run directory.
 */
export const test_benchmark_workspace_keeps_its_programs_startable =
  async (): Promise<void> => {
    if (process.platform !== "win32") return;
    const workspace: IBenchmarkWorkspace =
      await acquireBenchmarkWorkspace("evidence");
    const configuration: string = path.join(workspace.workspace, ".npmrc");
    if (!fs.existsSync(configuration))
      throw new Error(
        `${configuration} is missing, so the workspace installed into the package manager's default store beneath itself. A run directory then decides how long every installed program's path is.`,
      );
    const store: string | undefined = /^virtual-store-dir=(.+)$/mu
      .exec(fs.readFileSync(configuration, "utf8"))?.[1]
      ?.trim();
    if (store === undefined || !path.isAbsolute(store))
      throw new Error(
        `The prepared .npmrc must name an absolute virtual store; found ${String(store)}.`,
      );
    if (
      path
        .resolve(store)
        .toLowerCase()
        .startsWith(path.resolve(workspace.workspace).toLowerCase())
    )
      throw new Error(
        `The virtual store is inside the workspace at ${store}, so its depth is the run directory's depth again.`,
      );

    const worst: number = worstCaseWorkspaceLength(
      path.resolve(__dirname, "..", "..", "..", ".."),
    );
    const offenders: { file: string; length: number }[] = [];
    for (const program of programs(store)) {
      // A program in the store is reached by the store's own absolute path, so
      // the run directory cannot lengthen it. One inside the workspace is
      // reached through the workspace, and the worst case is what decides it.
      const length: number = program.startsWith(path.resolve(store))
        ? program.length
        : worst + program.length - path.resolve(workspace.workspace).length;
      if (length > LIMIT) offenders.push({ file: program, length });
    }
    for (const program of programs(workspace.workspace)) {
      const length: number =
        worst + program.length - path.resolve(workspace.workspace).length;
      if (length > LIMIT) offenders.push({ file: program, length });
    }
    if (offenders.length !== 0)
      throw new Error(
        [
          `${String(offenders.length)} installed program(s) would exceed ${String(LIMIT)} characters`,
          `in a run directory, and Windows cannot start one:`,
          ...offenders
            .slice(0, 3)
            .map(({ file, length }) => `\n  ${String(length)} chars: ${file}`),
        ].join(" "),
      );
  };

const programs = (root: string): string[] => {
  const found: string[] = [];
  const walk = (directory: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const location: string = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(location);
      else if (entry.name.toLowerCase().endsWith(".exe")) found.push(location);
    }
  };
  if (fs.existsSync(root)) walk(path.resolve(root));
  return found;
};
