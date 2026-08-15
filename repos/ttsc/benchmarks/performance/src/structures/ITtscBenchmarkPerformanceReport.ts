import type { ITtscBenchmarkPerformanceMeasurement } from "./ITtscBenchmarkPerformanceMeasurement.ts";

/** Complete machine-readable performance benchmark report. */
export interface ITtscBenchmarkPerformanceReport {
  /** ISO date on which the report was generated. */
  date: string;

  /** Number of measured runs requested per cell. */
  runs: number;

  /** Number of unmeasured warmup runs requested per cell. */
  warmup: number;

  /** Host and toolchain identity for the measurement machine. */
  host: ITtscBenchmarkPerformanceReport.IHost;

  /** Per-project metadata and cell measurements. */
  projects: ITtscBenchmarkPerformanceReport.IProject[];
}

/** Nested report contracts and publication options. */
export namespace ITtscBenchmarkPerformanceReport {
  /** Published measurements and metadata for one fixture. */
  export interface IProject {
    /** Stable dashboard project name. */
    name: string;

    /** Fixture repository basename retained for dashboard compatibility. */
    repo: string;

    /** Human-facing fixture category. */
    kind: string;

    /** Count of non-declaration TS, TSX, MTS, and CTS source files. */
    files: number;

    /** Legacy TypeScript display version. */
    typescript: string;

    /** Pinned TypeScript-Go display version. */
    tsgo: string;

    /** Measurements retained for this project. */
    measurements: ITtscBenchmarkPerformanceMeasurement[];
  }

  /** Host and toolchain identity attached to a report. */
  export interface IHost {
    /** Operating-system platform name. */
    os: string;

    /** Operating-system kernel or release string. */
    kernel: string;

    /** CPU model reported by Node.js. */
    cpu: string;

    /** Number of logical CPU cores. */
    cores: number;

    /** Total memory rounded to gibibytes. */
    ramGB: number;

    /** Node.js runtime version. */
    node: string;

    /** Workspace ttsc package version. */
    ttsc: string;

    /** Workspace TypeScript compatibility version. */
    typescript: string;

    /** Pinned TypeScript-Go runtime version. */
    tsgo: string;
  }

  /** Controls report persistence after a checkpoint update. */
  export interface IWriteOptions {
    /** Whether the validated report is merged into website JSON. */
    publishWebsite?: boolean;
  }
}
