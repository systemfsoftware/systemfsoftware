import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { TtscBenchmarkPerformanceCell } from "./TtscBenchmarkPerformanceCell.ts";
import { TtscBenchmarkPerformanceCommand } from "./TtscBenchmarkPerformanceCommand.ts";
import { TtscBenchmarkPerformanceMeasurement } from "./TtscBenchmarkPerformanceMeasurement.ts";
import { TtscBenchmarkPerformanceProcess } from "./TtscBenchmarkPerformanceProcess.ts";
import { TtscBenchmarkPerformanceReport } from "./TtscBenchmarkPerformanceReport.ts";
import { TtscBenchmarkPerformanceSetup } from "./TtscBenchmarkPerformanceSetup.ts";
import { TtscBenchmarkPerformanceVerifier } from "./TtscBenchmarkPerformanceVerifier.ts";
import { TtscBenchmarkPerformanceWorktree } from "./TtscBenchmarkPerformanceWorktree.ts";
import type { ITtscBenchmarkPerformanceCell } from "./structures/ITtscBenchmarkPerformanceCell.ts";
import type { ITtscBenchmarkPerformanceProject } from "./structures/ITtscBenchmarkPerformanceProject.ts";
import type { ITtscBenchmarkPerformanceReport } from "./structures/ITtscBenchmarkPerformanceReport.ts";

/**
 * Orchestrates one performance benchmark invocation without owning fixture,
 * measurement, report, or process mechanics.
 *
 * The runner preserves checkpoint writes after every measured cell and keeps
 * sequential clone removal outside the timed measurement boundary.
 */
export class TtscBenchmarkPerformanceRunner {
  /**
   * Creates an invocation runner from the executable's resolved policy and
   * shared benchmark services.
   *
   * @param options Selected projects, paths, flags, and service dependencies.
   */
  public constructor(
    private readonly options: TtscBenchmarkPerformanceRunner.IOptions,
  ) {}

  /** Prints the selected cell matrix and fully resolved child commands. */
  public printConfig(): void {
    for (const project of this.options.projects) {
      process.stdout.write(`${project.name}: ${project.repo}\n`);
      for (const cell of TtscBenchmarkPerformanceCell.project(
        project,
        this.options.cell,
      )) {
        const tool =
          cell.tool ??
          TtscBenchmarkPerformanceCommand.tool(cell.branch, cell.op);
        const root = this.options.worktree.cloneDirectory(project, cell.branch);
        process.stdout.write(
          `  ${cell.branch}:${tool}:${cell.op}:${cell.threading}\n`,
        );
        for (const step of cell.steps) {
          const command = this.options.process.commandForStep(
            step,
            root,
            "list",
          );
          process.stdout.write(
            `    ${step.cwd ? `${step.cwd}: ` : ""}${command}\n`,
          );
        }
      }
    }
  }

  /**
   * Runs setup, verification, measurement, checkpointing, and publication in
   * the same order selected by the performance executable.
   */
  public main(): void {
    const totalStart = process.hrtime.bigint();
    if (this.options.projects.length === 0) {
      throw new Error("no benchmark projects selected");
    }
    if (
      !this.options.projects.some(
        (project) =>
          TtscBenchmarkPerformanceCell.project(project, this.options.cell)
            .length !== 0,
      )
    ) {
      throw new Error("no benchmark cells selected");
    }

    const sequential =
      this.options.flags.has("--sequential") ||
      process.env.TTSC_BENCH_SEQUENTIAL === "1";
    if (sequential) {
      if (this.options.flags.has("--no-setup")) {
        throw new Error(
          "--sequential is incompatible with --no-setup; sequential mode " +
            "clones/installs/removes one (project, branch) at a time",
        );
      }
      if (this.options.flags.has("--setup-only")) {
        throw new Error(
          "--sequential is incompatible with --setup-only; sequential mode " +
            "deletes each clone after its cells are measured",
        );
      }
    }

    this.checkHostLoad();
    fs.mkdirSync(this.options.paths.workRoot, { recursive: true });
    fs.mkdirSync(path.dirname(this.options.paths.outputMarkdown), {
      recursive: true,
    });

    if (this.options.flags.has("--pack-only")) {
      this.options.setup.packTarballs();
      process.stdout.write(
        `Pack complete in ${this.options.paths.tarballRoot}\n`,
      );
      return;
    }

    if (sequential) {
      this.runSequential(totalStart);
      return;
    }

    if (!this.options.flags.has("--no-setup")) {
      this.options.setup.packTarballs();
      const setupFailures: string[] = [];
      for (const project of this.options.projects) {
        for (const branch of TtscBenchmarkPerformanceCell.branches(
          project,
          this.options.cell,
        )) {
          try {
            this.options.setup.setupClone(project, branch);
          } catch (error) {
            setupFailures.push(
              `${project.repoName}@${branch}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      }
      if (
        setupFailures.length !== 0 &&
        !this.options.flags.has("--allow-missing")
      ) {
        throw new Error(
          "setup failed; pass --allow-missing to measure the ready subset\n" +
            setupFailures.map((failure) => `- ${failure}`).join("\n"),
        );
      }
    }

    if (this.options.flags.has("--setup-only")) {
      process.stdout.write(
        `Setup complete in ${this.options.paths.workRoot}\n`,
      );
      return;
    }

    const readyProjects = this.options.projects.filter((project) =>
      TtscBenchmarkPerformanceCell.branches(project, this.options.cell).every(
        (branch) =>
          fs.existsSync(this.options.worktree.cloneDirectory(project, branch)),
      ),
    );
    const missingProjects = this.options.projects.filter(
      (project) => !readyProjects.includes(project),
    );
    if (
      missingProjects.length !== 0 &&
      !this.options.flags.has("--allow-missing")
    ) {
      throw new Error(
        "missing prepared clones; run without --no-setup to clone/install them " +
          "or pass --allow-missing\n" +
          missingProjects.map((project) => `- ${project.repoName}`).join("\n"),
      );
    }

    if (this.options.flags.has("--verify-only")) {
      this.options.verifier.projects(readyProjects);
      return;
    }

    const report = this.options.report.create(readyProjects);
    this.options.report.write(report);
    for (const project of readyProjects) {
      this.measureProject(project, report);
    }
    this.options.report.write(report, { publishWebsite: true });

    this.printCompletion(totalStart);
  }

  private checkHostLoad(): void {
    if (process.env.TTSC_BENCH_SKIP_LOAD_CHECK === "1") return;
    const cpuCount = Math.max(os.cpus().length, 1);
    const load1 = os.loadavg()[0];
    if (load1 === undefined) {
      throw new Error("host load average is unavailable");
    }
    const ratio = load1 / cpuCount;
    if (ratio <= 0.5) return;
    const message =
      `host load is high (1-min loadavg ${load1.toFixed(2)} on ` +
      `${cpuCount} CPUs, ratio ${ratio.toFixed(2)}); short cells may ` +
      `drift 20–60% from a quiet baseline. ` +
      `Set TTSC_BENCH_SKIP_LOAD_CHECK=1 to ignore.`;
    if (process.env.TTSC_BENCH_REQUIRE_QUIET === "1") {
      throw new Error(`bench: ${message}`);
    }
    process.stderr.write(`[bench] warning: ${message}\n`);
  }

  private measureProject(
    project: ITtscBenchmarkPerformanceProject,
    report: ITtscBenchmarkPerformanceReport,
  ): void {
    this.options.process.time(`measure project ${project.name}`, () =>
      this.measureCells(
        TtscBenchmarkPerformanceCell.project(project, this.options.cell),
        project,
        report,
      ),
    );
  }

  private measureProjectBranch(
    project: ITtscBenchmarkPerformanceProject,
    branch: ITtscBenchmarkPerformanceCell.Branch,
    report: ITtscBenchmarkPerformanceReport,
  ): void {
    this.options.process.time(`measure ${project.name}@${branch}`, () => {
      const cells = TtscBenchmarkPerformanceCell.project(
        project,
        this.options.cell,
      ).filter((cell) => cell.branch === branch);
      this.measureCells(cells, project, report);
    });
  }

  private measureCells(
    cells: ITtscBenchmarkPerformanceCell[],
    project: ITtscBenchmarkPerformanceProject,
    report: ITtscBenchmarkPerformanceReport,
  ): void {
    const projectReport = this.options.report.ensureProject(report, project);
    for (const cell of cells) {
      const existingIndex = projectReport.measurements.findIndex(
        (measurement) => measurement.id === cell.id,
      );
      if (existingIndex !== -1) {
        process.stdout.write(
          `\n[${cell.id}] refreshing existing measurement\n`,
        );
      }
      const measurement = this.options.measurement.measure(cell);
      if (existingIndex === -1) {
        projectReport.measurements.push(measurement);
      } else {
        projectReport.measurements.splice(existingIndex, 1, measurement);
      }
      this.options.report.write(report, { publishWebsite: true });
    }
  }

  private runSequential(totalStart: bigint): void {
    this.options.setup.packTarballs();
    const setupFailures: string[] = [];
    const measuredProjects: ITtscBenchmarkPerformanceProject[] = [];
    const report = this.options.report.create(this.options.projects);
    this.options.report.write(report);

    for (const project of this.options.projects) {
      for (const branch of TtscBenchmarkPerformanceCell.branches(
        project,
        this.options.cell,
      )) {
        try {
          this.options.setup.setupClone(project, branch);
        } catch (error) {
          const message = `${project.repoName}@${branch}: ${
            error instanceof Error ? error.message : String(error)
          }`;
          setupFailures.push(message);
          if (!this.options.flags.has("--allow-missing")) {
            throw new Error(
              "sequential setup failed; pass --allow-missing to continue " +
                "past failed (project, branch) cycles\n- " +
                message,
            );
          }
          process.stdout.write(`[sequential] skip ${message}\n`);
          continue;
        }

        this.options.report.captureProjectMeta(project, branch);
        if (!measuredProjects.includes(project)) {
          measuredProjects.push(project);
        }
        this.options.report.ensureProject(report, project);
        this.options.report.refreshProjectMeta(report, project);
        report.host = this.options.report.host(measuredProjects);

        if (this.options.flags.has("--verify-only")) {
          this.options.verifier.branch(project, branch);
        } else {
          this.measureProjectBranch(project, branch, report);
        }

        this.options.worktree.remove(project, branch);
        this.options.report.write(report, {
          publishWebsite: !this.options.flags.has("--verify-only"),
        });
      }
    }

    if (this.options.flags.has("--verify-only")) {
      process.stdout.write("\nAll benchmark commands verified.\n");
      return;
    }

    this.options.report.write(report, { publishWebsite: true });
    this.printCompletion(totalStart);
    if (setupFailures.length !== 0) {
      process.stderr.write(
        "[sequential] skipped cycles (--allow-missing):\n" +
          setupFailures.map((message) => `- ${message}`).join("\n") +
          "\n",
      );
    }
  }

  private printCompletion(totalStart: bigint): void {
    process.stdout.write(
      `Report written to ${this.options.paths.outputMarkdown}\n`,
    );
    if (!this.options.flags.has("--no-website")) {
      process.stdout.write(
        `Website JSON written to ${this.options.paths.websiteJson}\n`,
      );
    }
    process.stdout.write(
      `[timer] total benchmark ${this.options.process.formatDuration(
        this.options.process.elapsed(totalStart),
      )}\n`,
    );
  }
}

/** Constructor contracts for {@link TtscBenchmarkPerformanceRunner}. */
export namespace TtscBenchmarkPerformanceRunner {
  /** Immutable paths and service dependencies for one runner invocation. */
  export interface IOptions {
    /** Parsed boolean flags that select setup and execution modes. */
    flags: ReadonlySet<string>;

    /** Selected fixture projects in stable measurement and report order. */
    projects: ITtscBenchmarkPerformanceProject[];

    /** Filesystem paths used for setup messages and report persistence. */
    paths: {
      /** Root containing persistent per-branch fixture clones. */
      workRoot: string;

      /** Staging root containing packed local ttsc archives. */
      tarballRoot: string;

      /** Markdown report path written by the report service. */
      outputMarkdown: string;

      /** Website JSON path updated when publication is enabled. */
      websiteJson: string;
    };

    /** Cell selection policy shared by listing and measurement. */
    cell: TtscBenchmarkPerformanceCell.IOptions;

    /** Cell measurement service preserving warmup and retry policy. */
    measurement: TtscBenchmarkPerformanceMeasurement;

    /** Child-process and elapsed-time service shared by the invocation. */
    process: TtscBenchmarkPerformanceProcess;

    /** Report creation, checkpoint, and website publication service. */
    report: TtscBenchmarkPerformanceReport;

    /** Tarball packing and fixture clone setup service. */
    setup: TtscBenchmarkPerformanceSetup;

    /** Command verification service used by verify-only modes. */
    verifier: TtscBenchmarkPerformanceVerifier;

    /** Clone path and lifecycle service used by readiness and cleanup. */
    worktree: TtscBenchmarkPerformanceWorktree;
  }
}
