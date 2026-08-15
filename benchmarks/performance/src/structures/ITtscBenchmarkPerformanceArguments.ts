/** Parsed command-line selection for the performance benchmark executable. */
export interface ITtscBenchmarkPerformanceArguments {
  /** Regular expressions used to retain matching cell ids. */
  cellFilters: RegExp[];

  /** Boolean option tokens including their leading `--`. */
  flags: Set<string>;

  /** Project names supplied by repeatable `--project` options. */
  projectArgs: string[];

  /** Positional project names. */
  positional: string[];
}
