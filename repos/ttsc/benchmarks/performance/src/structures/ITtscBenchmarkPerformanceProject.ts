import type { ITtscBenchmarkPerformanceCommand } from "./ITtscBenchmarkPerformanceCommand.ts";

/** Fully identified project in the performance benchmark corpus. */
export interface ITtscBenchmarkPerformanceProject
  extends ITtscBenchmarkPerformanceProject.IConfig {
  /** Stable dashboard and command-line project name. */
  name: string;
}

/** Configuration and mutable metadata contracts for performance fixtures. */
export namespace ITtscBenchmarkPerformanceProject {
  /** Static configuration for one prepared fixture repository. */
  export interface IConfig {
    /** Human-facing project category shown on the dashboard. */
    kind: string;

    /** Fixture repository basename used for aliases and clone paths. */
    repoName: string;

    /** Git repository cloned by benchmark setup. */
    repo: string;

    /** Package manager whose lockfile and commands the fixture owns. */
    packageManager: ITtscBenchmarkPerformanceCommand.PackageManager;

    /** Project-relative root used to count measured source files. */
    filesRoot: string;

    /** Branch-indexed commands that define the measured workload. */
    commands: ITtscBenchmarkPerformanceCommand.Matrix;

    /** Fixture-specific dependency installation command. */
    installCommand?: string;

    /** Builds the command that installs workspace tarballs into the fixture. */
    installTarballsCommand?: (specs: string) => string;

    /** Fixture-specific ttsc preparation command. */
    prepareCommand?: string;

    /** Untimed setup steps required before measurement. */
    prerequisites?: ITtscBenchmarkPerformanceCommand[];

    /** Git paths allowed to remain dirty after fixture prerequisites run. */
    cleanExcludes?: string[];

    /** Whether the fixture is excluded from the active corpus. */
    disabled?: boolean;
  }

  /** Metadata cached while a sequential-mode clone still exists. */
  export interface IMeta {
    /** Count of non-declaration TS, TSX, MTS, and CTS source files. */
    files?: number;

    /** Legacy branch TypeScript package version. */
    legacyTypescript?: string;
  }

  /** Recoverable snapshot of a dependency manifest or lockfile. */
  export interface IDependencyFileSnapshot {
    /** Absolute path of the captured file. */
    file: string;

    /** Whether the file existed before temporary dependency rewriting. */
    exists: boolean;

    /** Original UTF-8 content when the file existed. */
    content?: string;
  }

  /** Options for dependency-map normalization. */
  export interface IRewriteMapOptions {
    /** Whether the pinned TypeScript-Go version replaces fixture resolution. */
    pinTypeScript?: boolean;
  }
}
