import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { repositoryRoot } from "./suiteRoot";

/**
 * Packs the plugin exactly as a benchmark launch does, into `directory`.
 *
 * The Evidence arm never links the working tree: `EvidenceBenchmarkCommandLine`
 * runs `pnpm pack` in `packages/evidence` and installs the resulting archive as
 * a `file:` dependency, so what a measured cell lints against is the published
 * file set and nothing else. A case that linked the source directory instead
 * would resolve files the tarball does not ship and prove a packaging story
 * that is not the one under measurement.
 *
 * @returns Absolute path of the packed archive.
 */
export const packEvidenceArchive = (directory: string): string => {
  const entrypoint: string | undefined = process.env.npm_execpath;
  if (entrypoint === undefined)
    throw new Error(
      "The benchmark feature suite must be launched through pnpm to pack the plugin archive.",
    );
  fs.mkdirSync(directory, { recursive: true });
  const archive: string = path.join(directory, "evidence.tgz");
  const result: SpawnSyncReturns<string> = spawnSync(
    process.execPath,
    [entrypoint, "pack", "--out", archive],
    {
      cwd: path.join(repositoryRoot, "packages", "evidence"),
      encoding: "utf8",
      env: process.env,
      timeout: 600_000,
      maxBuffer: 16 * 1024 * 1024,
      shell: false,
      windowsHide: true,
    },
  );
  if (result.status !== 0 || !fs.existsSync(archive))
    throw new Error(
      `Packing @ttsc/evidence failed with status ${String(result.status)}.\n\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  return archive;
};
