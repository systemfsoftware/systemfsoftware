import type cp from "node:child_process";

/** Child-process contracts shared by graph benchmark harnesses. */
export namespace TtscBenchmarkProcess {
  /** Executable command mounted in an agent benchmark environment. */
  export interface ICommand {
    /** Arguments passed to the executable. */
    args: string[];

    /** Executable name or absolute path. */
    command: string;

    /** Human-readable label recorded in benchmark logs. */
    label: string;
  }

  /** MCP stdio server mounted for one benchmark tool arm. */
  export interface IMcpServer {
    /** Whether the agent loads the server before its first tool request. */
    alwaysLoad?: boolean;

    /** Arguments passed to the MCP server executable. */
    args: string[];

    /** MCP server executable name or absolute path. */
    command: string;

    /** Environment additions applied to the MCP server process. */
    env?: NodeJS.ProcessEnv;
  }

  /** Child-process options shared by benchmark command runners. */
  export interface ISpawnOptions extends cp.SpawnOptions {
    /** Text written to the child process standard input. */
    input?: string;

    /** Delay before writing input, in milliseconds. */
    inputDelayMs?: number;
  }

  /** Captured completion state of a benchmark child process. */
  export interface ISpawnResult {
    /** Process launch error when the child could not start. */
    error?: Error;

    /** Signal that terminated the child, or null for an ordinary exit. */
    signal?: NodeJS.Signals | null;

    /** Numeric exit status, or null when terminated by a signal. */
    status?: number | null;

    /** Complete captured standard error text. */
    stderr: string;

    /** Complete captured standard output text. */
    stdout: string;
  }
}
