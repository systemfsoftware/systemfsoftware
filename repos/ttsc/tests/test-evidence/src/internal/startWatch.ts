import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";

import type { IRunResult } from "./IRunResult";
import type { IWatchSession } from "./IWatchSession";
import { pluginCacheDirectory } from "./pluginCacheDirectory";
import { resolveDependency } from "./resolveDependency";

/** Terminates one rebuild, whichever way it ended. */
const BUILD_MARKER = /\[ttsc\] watch build (complete|failed)\r?\n/g;

/**
 * Generous because the FIRST run of a cache key statically links this package's
 * Go into the lint binary. `runCheck` documents the same allowance.
 */
export const FIRST_BUILD_TIMEOUT: number = 900_000;

/** A rebuild in a warm session is a Program update, not a link. */
const REBUILD_TIMEOUT: number = 120_000;

/**
 * Starts `ttsc check --watch` against a fixture and returns a driveable
 * session.
 *
 * `--preserveWatchOutput` is required rather than cosmetic: without it the
 * launcher writes `\x1bc` before each rebuild to clear the terminal, and a test
 * reading the pipe would be asserting against a transcript that erases itself.
 *
 * `TTSC_WATCH_DEBUG_INPUTS` turns on the launcher's report of which roots it
 * watches and which changes it announced. A watch that never fires and a watch
 * that fired and decided the change was irrelevant produce the same silence, so
 * without this a failing freshness case could not say which one happened.
 *
 * `diagnostics` adds `@ttsc/lint`'s resident-check telemetry to each rebuild,
 * which is the only channel that distinguishes a Program reused across cycles
 * from one reloaded every time. Freshness and residency are separate
 * properties, and a rebuild that discards the Program satisfies every freshness
 * case in this suite while being the regression that makes watch mode useless.
 */
export const startWatch = (
  directory: string,
  options: { readonly diagnostics?: boolean } = {},
): IWatchSession => {
  const launcher: string = path.join(
    resolveDependency("ttsc"),
    "lib",
    "launcher",
    "ttsc.js",
  );
  const child: ChildProcess = spawn(
    process.execPath,
    [
      launcher,
      "check",
      "--watch",
      "--preserveWatchOutput",
      ...(options.diagnostics === true ? ["--diagnostics"] : []),
      "-p",
      "tsconfig.json",
    ],
    {
      cwd: directory,
      env: {
        ...process.env,
        TTSC_CACHE_DIR: pluginCacheDirectory(),
        TTSC_WATCH_DEBUG_INPUTS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let text: string = "";
  let cursor: number = 0;
  let exited: boolean = false;
  const wake: Array<() => void> = [];
  const absorb = (chunk: Buffer): void => {
    text += chunk.toString("utf8");
    while (wake.length !== 0) wake.pop()?.();
  };
  child.stdout?.on("data", absorb);
  child.stderr?.on("data", absorb);
  child.on("exit", () => {
    exited = true;
    while (wake.length !== 0) wake.pop()?.();
  });

  const slice = (from: number, to: number, status: number): IRunResult => {
    const output: string = text.slice(from, to);
    return { status, stdout: output, stderr: "", output };
  };

  /** Finds the first build terminator at or after the cursor. */
  const findBuild = (): IRunResult | null => {
    BUILD_MARKER.lastIndex = cursor;
    const match: RegExpExecArray | null = BUILD_MARKER.exec(text);
    if (match === null) return null;
    const end: number = match.index + match[0].length;
    const result: IRunResult = slice(
      cursor,
      end,
      match[1] === "failed" ? 2 : 0,
    );
    cursor = end;
    return result;
  };

  /**
   * Resolves once `settled` returns a value, the process dies, or time runs
   * out.
   */
  const until = async <T>(
    settled: () => T | null,
    timeout: number,
    describe: string,
  ): Promise<T> => {
    const deadline: number = Date.now() + timeout;
    for (;;) {
      const value: T | null = settled();
      if (value !== null) return value;
      if (exited)
        throw new Error(
          `${describe}, but the watch process exited first.\n\nTranscript:\n${text}`,
        );
      const remaining: number = deadline - Date.now();
      if (remaining <= 0)
        throw new Error(
          `${describe} within ${timeout} ms.\n\nTranscript:\n${text}`,
        );
      await new Promise<void>((resolve) => {
        const timer: NodeJS.Timeout = setTimeout(
          resolve,
          Math.min(remaining, 50),
        );
        wake.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  };

  return {
    nextBuild: (timeout: number = REBUILD_TIMEOUT): Promise<IRunResult> =>
      until(findBuild, timeout, "Expected the watcher to finish a rebuild"),
    expectNoBuild: async (milliseconds: number): Promise<IRunResult> => {
      const from: number = cursor;
      await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
      const seen: IRunResult = slice(from, text.length, 0);
      // The launcher prints this the moment a rebuild starts, so it catches a
      // spurious wake even when the rebuild has not finished within the window.
      if (seen.output.includes("[ttsc] rebuilding at"))
        throw new Error(
          `Expected no rebuild within ${milliseconds} ms.\n\nActual output:\n${seen.output}`,
        );
      cursor = text.length;
      return seen;
    },
    close: async (): Promise<void> => {
      if (exited) return;
      // The launcher's SIGINT/SIGTERM handlers tear the watchers down on POSIX;
      // on Windows the signal terminates it outright. Either way the resident
      // check-serve child sees its stdin pipe close and returns on EOF, so the
      // grandchild does not outlive the session.
      child.kill();
      await new Promise<void>((resolve) => {
        const timer: NodeJS.Timeout = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 10_000);
        child.on("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        if (exited) {
          clearTimeout(timer);
          resolve();
        }
      });
    },
  };
};
