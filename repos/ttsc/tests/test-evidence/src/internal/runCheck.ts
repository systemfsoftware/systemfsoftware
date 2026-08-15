import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import path from "node:path";

import type { IRunResult } from "./IRunResult";
import { pluginCacheDirectory } from "./pluginCacheDirectory";
import { resolveDependency } from "./resolveDependency";

/**
 * Runs `ttsc check` in the fixture and captures everything it said.
 *
 * The launcher script is invoked through `node` rather than through a shim on
 * PATH. `ttsc` publishes `bin: {"ttsc": "lib/launcher/ttsc.js"}` and has no
 * `bin/` directory, so probing for one and falling back to a bare `"ttsc"` only
 * works when something else — `npm run`, which injects `node_modules/.bin` —
 * happens to have prepared PATH. That made the suite pass for a reason it did
 * not state, and fail the moment it was driven any other way.
 */
export const runCheck = (directory: string): IRunResult => {
  const launcher: string = path.join(
    resolveDependency("ttsc"),
    "lib",
    "launcher",
    "ttsc.js",
  );
  const result: SpawnSyncReturns<string> = spawnSync(
    process.execPath,
    [launcher, "check", "-p", "tsconfig.json"],
    {
      cwd: directory,
      encoding: "utf8",
      env: { ...process.env, TTSC_CACHE_DIR: pluginCacheDirectory() },
      // Generous because the FIRST run of a cache key statically links this
      // package's Go into the lint binary, which ttsc itself warns "can take
      // several minutes on a cold Go cache" — measured at ~9 minutes here.
      timeout: 900_000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const stdout: string = result.stdout ?? "";
  const stderr: string = result.stderr ?? "";
  return {
    status: result.status,
    stdout,
    stderr,
    output: `${stdout}${stderr}`,
  };
};
