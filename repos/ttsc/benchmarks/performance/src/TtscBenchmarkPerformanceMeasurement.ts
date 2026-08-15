import { TtscBenchmarkPerformanceCommand } from "./TtscBenchmarkPerformanceCommand.ts";
import { TtscBenchmarkPerformanceProcess } from "./TtscBenchmarkPerformanceProcess.ts";
import { TtscBenchmarkPerformanceWorktree } from "./TtscBenchmarkPerformanceWorktree.ts";
import type { ITtscBenchmarkPerformanceCell } from "./structures/ITtscBenchmarkPerformanceCell.ts";
import type { ITtscBenchmarkPerformanceCommand } from "./structures/ITtscBenchmarkPerformanceCommand.ts";
import type { ITtscBenchmarkPerformanceMeasurement } from "./structures/ITtscBenchmarkPerformanceMeasurement.ts";
import type { ITtscBenchmarkPerformanceProject } from "./structures/ITtscBenchmarkPerformanceProject.ts";

/**
 * Measures performance cells while preserving benchmark timing boundaries.
 *
 * The shared process prepares every command, including tsconfig-file helpers,
 * before starting its timer. Worktree cleanup runs only after the measured
 * process returns, so neither preparation nor cleanup contaminates samples.
 */
export class TtscBenchmarkPerformanceMeasurement {
  /**
   * Creates a measurement service for one benchmark invocation.
   *
   * @param options Run counts and shared benchmark services.
   */
  public constructor(
    private readonly options: TtscBenchmarkPerformanceMeasurement.IOptions,
  ) {}

  /**
   * Warms up and measures one benchmark cell.
   *
   * @param cell Fully planned benchmark cell.
   * @returns Raw samples or a classified failure record.
   */
  public measure(
    cell: ITtscBenchmarkPerformanceCell,
  ): ITtscBenchmarkPerformanceMeasurement {
    const { id, project, branch, tool, op, threading, steps } = cell;
    const root = this.options.worktree.cloneDirectory(project, branch);
    process.stdout.write(`\n[${id}] ${this.options.runs} runs\n`);
    this.options.worktree.assertClean(root, id, project);
    this.options.worktree.cleanup(root, project);

    const run = (): ITtscBenchmarkPerformanceCommand.IRunResult =>
      this.runSteps(steps, root, project);
    const capturesLintTiming =
      branch === "ttsc-lint" &&
      TtscBenchmarkPerformanceCommand.isLintOperation(op);

    for (let index = 0; index < this.options.warmup; index++) {
      const result = run();
      process.stdout.write(
        `  warmup ${index + 1}: ${result.ms.toFixed(0)} ms ` +
          (result.ok ? "ok" : `exit ${result.status}`) +
          "\n",
      );
      if (
        !result.ok &&
        TtscBenchmarkPerformanceCommand.classifyFailure(result.log) === "error"
      ) {
        return this.failed(cell, result, 0);
      }
    }

    const samples: number[] = [];
    const lintSidecarSamples: number[] = [];
    const lintPluginSamples: number[] = [];
    const transformHostSamples: number[] = [];
    let raceRetries = 0;
    let deterministic: ITtscBenchmarkPerformanceCommand.IRunResult | null =
      null;
    for (let index = 0; index < this.options.runs; index++) {
      let result = run();
      let attempts = 0;
      while (!result.ok && attempts < this.options.retries) {
        const kind = TtscBenchmarkPerformanceCommand.classifyFailure(
          result.log,
        );
        if (kind === "error") break;
        raceRetries++;
        attempts++;
        process.stdout.write(`  run ${index + 1}: race retry ${attempts}\n`);
        result = run();
      }
      if (!result.ok) {
        deterministic = result;
        process.stdout.write(`  run ${index + 1}: exit ${result.status}\n`);
        break;
      }
      samples.push(result.ms);
      if (capturesLintTiming) {
        const lintSidecarMs =
          TtscBenchmarkPerformanceCommand.parseLintSidecarTime(result.log);
        if (lintSidecarMs !== undefined) {
          lintSidecarSamples.push(lintSidecarMs);
        }
        const lintPluginMs =
          TtscBenchmarkPerformanceCommand.parseLintPluginTime(result.log);
        if (lintPluginMs !== undefined) {
          lintPluginSamples.push(lintPluginMs);
        }
        const transformHostMs =
          TtscBenchmarkPerformanceCommand.parseTransformHostTime(result.log);
        if (transformHostMs !== undefined) {
          transformHostSamples.push(transformHostMs);
        }
      }
      process.stdout.write(`  run ${index + 1}: ${result.ms.toFixed(0)} ms\n`);
    }

    if (deterministic || samples.length === 0) {
      return this.failed(
        cell,
        deterministic ?? { status: 1, log: "no samples" },
        raceRetries,
      );
    }

    const measured: ITtscBenchmarkPerformanceMeasurement = {
      id,
      branch,
      tool: TtscBenchmarkPerformanceCommand.tool(branch, op, tool),
      op,
      threading,
      samples,
      raceRetries: raceRetries || undefined,
    };
    if (capturesLintTiming && lintSidecarSamples.length !== 0) {
      measured.lintSamples = lintSidecarSamples;
    }
    if (capturesLintTiming && lintPluginSamples.length !== 0) {
      measured.lintPluginSamples = lintPluginSamples;
    }
    if (capturesLintTiming && transformHostSamples.length !== 0) {
      measured.transformHostSamples = transformHostSamples;
    }
    return measured;
  }

  private runSteps(
    steps: ITtscBenchmarkPerformanceCommand[],
    root: string,
    project: ITtscBenchmarkPerformanceProject,
  ): ITtscBenchmarkPerformanceCommand.IRunResult {
    try {
      return this.options.process.run(steps, root);
    } finally {
      this.options.worktree.cleanup(root, project);
    }
  }

  private failed(
    cell: ITtscBenchmarkPerformanceCell,
    result: Pick<ITtscBenchmarkPerformanceCommand.IRunResult, "log" | "status">,
    raceRetries: number,
  ): ITtscBenchmarkPerformanceMeasurement {
    return {
      id: cell.id,
      branch: cell.branch,
      tool: TtscBenchmarkPerformanceCommand.tool(
        cell.branch,
        cell.op,
        cell.tool,
      ),
      op: cell.op,
      threading: cell.threading,
      samples: [],
      raceRetries: raceRetries || undefined,
      failure: TtscBenchmarkPerformanceCommand.classifyFailure(result.log),
      exitStatus: result.status,
    };
  }
}

/** Contracts used by {@link TtscBenchmarkPerformanceMeasurement}. */
export namespace TtscBenchmarkPerformanceMeasurement {
  /** Dependencies and sample policy for a measurement run. */
  export interface IOptions {
    /** Number of persisted samples per cell. */
    runs: number;
    /** Number of discarded warmup samples per cell. */
    warmup: number;
    /** Maximum retries for a suspected race failure. */
    retries: number;
    /** Shared command runner whose preparation occurs outside timing. */
    process: TtscBenchmarkPerformanceProcess;
    /** Shared worktree lifecycle service. */
    worktree: TtscBenchmarkPerformanceWorktree;
  }
}
