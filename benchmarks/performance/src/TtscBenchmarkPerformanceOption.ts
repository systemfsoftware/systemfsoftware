import type { ITtscBenchmarkPerformanceArguments } from "./structures/ITtscBenchmarkPerformanceArguments.ts";

/** Command-line and environment parsing for the performance benchmark. */
export namespace TtscBenchmarkPerformanceOption {
  /** Parses project selectors, cell filters, boolean flags, and positionals. */
  export function parse(
    arguments_: readonly string[],
  ): ITtscBenchmarkPerformanceArguments {
    const cellFilters: RegExp[] = [];
    const flags: Set<string> = new Set<string>();
    const projectArgs: string[] = [];
    const positional: string[] = [];
    for (let index: number = 0; index < arguments_.length; ++index) {
      const argument: string | undefined = arguments_[index];
      if (argument === undefined) continue;
      if (argument === "--project") {
        const value: string | undefined = arguments_[++index];
        if (value === undefined || value.startsWith("--"))
          throw new Error("--project requires a project name");
        projectArgs.push(...splitProjectList(value));
      } else if (argument.startsWith("--project=")) {
        const value: string = argument.slice("--project=".length);
        if (value.length === 0)
          throw new Error("--project requires a project name");
        projectArgs.push(...splitProjectList(value));
      } else if (argument === "--cell-filter") {
        const value: string | undefined = arguments_[++index];
        if (value === undefined || value.startsWith("--"))
          throw new Error("--cell-filter requires a regular expression");
        cellFilters.push(new RegExp(value));
      } else if (argument.startsWith("--cell-filter=")) {
        const value: string = argument.slice("--cell-filter=".length);
        if (value.length === 0)
          throw new Error("--cell-filter requires a regular expression");
        cellFilters.push(new RegExp(value));
      } else if (argument.startsWith("--")) flags.add(argument);
      else positional.push(argument);
    }
    return { cellFilters, flags, positional, projectArgs };
  }

  /** Reads a positive, or explicitly zero-allowed, integer environment value. */
  export function number(
    name: string,
    fallback: number,
    options: { allowZero?: boolean } = {},
  ): number {
    const raw: string | undefined = process.env[name];
    if (raw === undefined) return fallback;
    const value: number = Number(raw);
    const minimum: number = options.allowZero === true ? 0 : 1;
    if (Number.isInteger(value) === false || value < minimum)
      throw new Error(
        options.allowZero === true
          ? `${name} must be zero or positive`
          : `${name} must be positive`,
      );
    return value;
  }

  function splitProjectList(value: string): string[] {
    return value
      .split(",")
      .map((entry: string): string => entry.trim())
      .filter((entry: string): boolean => entry.length !== 0);
  }
}
