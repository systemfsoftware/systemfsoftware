import type { ITtscBenchmarkPerformanceCommand } from "./ITtscBenchmarkPerformanceCommand.ts";
import type { ITtscBenchmarkPerformanceProject } from "./ITtscBenchmarkPerformanceProject.ts";

/** One executable cell in the performance benchmark matrix. */
export interface ITtscBenchmarkPerformanceCell {
  /** Stable identifier used for filtering, checkpoints, and publication. */
  id: string;

  /** Fixture project measured by this cell. */
  project: ITtscBenchmarkPerformanceProject;

  /** Fixture branch whose toolchain is measured. */
  branch: ITtscBenchmarkPerformanceCell.Branch;

  /** Resolved tool label shown in reports. */
  tool?: string;

  /** Operation performed by the cell. */
  op: ITtscBenchmarkPerformanceCell.Operation;

  /** Threading mode applied to the command steps. */
  threading: ITtscBenchmarkPerformanceCell.Threading;

  /** Ordered child commands inside the timed cell. */
  steps: ITtscBenchmarkPerformanceCommand[];
}

/** Axis and transformation contracts for performance cells. */
export namespace ITtscBenchmarkPerformanceCell {
  /** Prepared fixture branches in the comparison matrix. */
  export type Branch = "legacy" | "ttsc" | "ttsc-lint";

  /** Operations measured by the toolchain benchmark. */
  export type Operation = "build" | "noEmit" | "eslint" | "format";

  /** Compiler and formatter threading modes. */
  export type Threading =
    | "single"
    | "multi"
    | "checkers2"
    | "checkers4"
    | "checkers8";

  /** Step transformation that creates one threading-axis variant. */
  export interface IThreadingVariant {
    /** Threading label encoded into the cell id. */
    name: Threading;

    /** Applies the corresponding CLI flags to every command step. */
    apply: (
      /** Command steps transformed into this threading mode. */
      steps: ITtscBenchmarkPerformanceCommand[],
    ) => ITtscBenchmarkPerformanceCommand[];
  }
}
