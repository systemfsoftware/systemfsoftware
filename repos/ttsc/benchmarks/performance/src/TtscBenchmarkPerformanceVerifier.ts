import { TtscBenchmarkPerformanceCell } from "./TtscBenchmarkPerformanceCell.ts";
import { TtscBenchmarkPerformanceProcess } from "./TtscBenchmarkPerformanceProcess.ts";
import { TtscBenchmarkPerformanceWorktree } from "./TtscBenchmarkPerformanceWorktree.ts";
import type { ITtscBenchmarkPerformanceCell } from "./structures/ITtscBenchmarkPerformanceCell.ts";
import type { ITtscBenchmarkPerformanceProject } from "./structures/ITtscBenchmarkPerformanceProject.ts";

/**
 * Executes planned benchmark commands as correctness checks without recording
 * performance samples.
 */
export class TtscBenchmarkPerformanceVerifier {
  /**
   * Creates a verifier backed by shared cell, process, and worktree services.
   *
   * @param options Benchmark services and selection policy.
   */
  public constructor(
    private readonly options: TtscBenchmarkPerformanceVerifier.IOptions,
  ) {}

  /**
   * Verifies every selected cell for a set of projects.
   *
   * @param projects Prepared fixture projects.
   */
  public projects(projects: ITtscBenchmarkPerformanceProject[]): void {
    const failures: string[] = [];
    for (const project of projects) {
      for (const cell of TtscBenchmarkPerformanceCell.project(
        project,
        this.options.cell,
      )) {
        this.verify(cell, failures);
      }
    }
    if (failures.length !== 0) {
      throw new Error(
        `benchmark command verification failed\n${failures
          .map((failure) => `- ${failure}`)
          .join("\n")}`,
      );
    }
    process.stdout.write("\nAll benchmark commands verified.\n");
  }

  /**
   * Verifies selected cells for one fixture branch.
   *
   * @param project Prepared fixture project.
   * @param branch Prepared fixture branch.
   */
  public branch(
    project: ITtscBenchmarkPerformanceProject,
    branch: ITtscBenchmarkPerformanceCell.Branch,
  ): void {
    const failures: string[] = [];
    for (const cell of TtscBenchmarkPerformanceCell.project(
      project,
      this.options.cell,
    ).filter((candidate) => candidate.branch === branch)) {
      this.verify(cell, failures);
    }
    if (failures.length !== 0) {
      throw new Error(
        `benchmark command verification failed\n${failures
          .map((failure) => `- ${failure}`)
          .join("\n")}`,
      );
    }
  }

  private verify(
    cell: ITtscBenchmarkPerformanceCell,
    failures: string[],
  ): void {
    const root = this.options.worktree.cloneDirectory(
      cell.project,
      cell.branch,
    );
    process.stdout.write(`\nVERIFY ${cell.id}\n`);
    const result = this.options.process.run(cell.steps, root);
    if (!result.ok) {
      failures.push(`${cell.id} failed (${result.status})`);
      process.stderr.write(result.log);
    } else {
      process.stdout.write(`  ok ${result.ms.toFixed(0)} ms\n`);
    }
  }
}

/** Contracts used by {@link TtscBenchmarkPerformanceVerifier}. */
export namespace TtscBenchmarkPerformanceVerifier {
  /** Dependencies shared by verification operations. */
  export interface IOptions {
    /** Cell-selection policy. */
    cell: TtscBenchmarkPerformanceCell.IOptions;
    /** Shared command runner. */
    process: TtscBenchmarkPerformanceProcess;
    /** Shared worktree lifecycle service. */
    worktree: TtscBenchmarkPerformanceWorktree;
  }
}
