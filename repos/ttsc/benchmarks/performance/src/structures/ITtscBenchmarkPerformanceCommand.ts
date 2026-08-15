/** Describes one shell step in a performance benchmark cell. */
export interface ITtscBenchmarkPerformanceCommand {
  /** Shell command executed for the step. */
  cmd: string;

  /** Project-relative working directory; the clone root is the default. */
  cwd?: string;

  /** Environment variables added to the child process. */
  env?: NodeJS.ProcessEnv;

  /** Explicit single-threaded command when flag appending is insufficient. */
  singleThreadedCmd?: string;

  /**
   * Tsconfigs whose exact program supplies ESLint or Prettier file arguments.
   *
   * Resolution and caching happen before the timed child process starts.
   */
  tsconfigProjects?: readonly string[];
}

/** Types used to construct and execute performance benchmark commands. */
export namespace ITtscBenchmarkPerformanceCommand {
  /** A command accepted as shorthand text or as a structured step. */
  export type Input = string | ITtscBenchmarkPerformanceCommand;

  /** Package managers supported by prepared fixture repositories. */
  export type PackageManager = "npm" | "pnpm" | "yarn";

  /** Commands available for one fixture branch. */
  export interface IBranch {
    /** Emitting compiler steps. */
    build?: ITtscBenchmarkPerformanceCommand[];

    /** Type-check-only compiler steps. */
    noEmit?: ITtscBenchmarkPerformanceCommand[];

    /** Legacy ESLint comparison steps. */
    eslint?: ITtscBenchmarkPerformanceCommand[];

    /** Legacy Prettier or ttsc formatter steps. */
    format?: ITtscBenchmarkPerformanceCommand[];

    /** Raw TypeScript-Go emitting steps. */
    tsgoBuild?: ITtscBenchmarkPerformanceCommand[];

    /** Raw TypeScript-Go type-check-only steps. */
    tsgoNoEmit?: ITtscBenchmarkPerformanceCommand[];
  }

  /** Branch-indexed command matrix for one fixture. */
  export type Matrix = Record<"legacy" | "ttsc" | "ttsc-lint", IBranch>;

  /** Inputs used to derive the standard three-branch command matrix. */
  export interface ICompilerOptions {
    /** Creates emitting compiler commands for a selected tool binary. */
    build: (tool: string) => Input[];

    /** Creates type-check-only commands for a selected tool binary. */
    noEmit: (tool: string) => Input[];

    /** Legacy ESLint comparison commands. */
    eslint: Input[];

    /** Optional fixture-specific format commands. */
    format?: {
      /** Legacy Prettier comparison commands. */
      legacy?: Input[];

      /** Ttsc formatter commands on the lint branch. */
      ttscLint?: Input[];
    };
  }

  /** Options controlling one child shell invocation. */
  export interface IShellOptions {
    /** Whether a non-zero status throws immediately. */
    check?: boolean;

    /** Complete child environment; defaults to the parent process environment. */
    env?: NodeJS.ProcessEnv;

    /** Human-readable label used in verbose traces. */
    label?: string;

    /** Whether verbose mode still suppresses inherited child output. */
    quiet?: boolean;

    /** Whether verbose mode emits start and completion timing lines. */
    timing?: boolean;
  }

  /** Captured result of a command or multi-step cell execution. */
  export interface IRunResult {
    /** Whether every child step exited successfully. */
    ok: boolean;

    /** Last child exit status, or null when the process failed to start. */
    status: number | null;

    /** Measured child wall time in milliseconds. */
    ms: number;

    /** Combined stdout and stderr retained for diagnostics and failure parsing. */
    log: string;
  }

  /** Fully resolved child step ready for timed execution. */
  export interface IPrepared {
    /** Shell command including pre-resolved file arguments. */
    cmd: string;

    /** Absolute child working directory. */
    cwd: string;

    /** Environment-variable overrides merged into the parent environment. */
    env?: NodeJS.ProcessEnv;
  }
}
