import fs from "node:fs";
import path from "node:path";

import { TtscBenchmarkPerformanceCell } from "./TtscBenchmarkPerformanceCell.ts";
import { TtscBenchmarkPerformanceProcess } from "./TtscBenchmarkPerformanceProcess.ts";
import type { ITtscBenchmarkPerformanceCell } from "./structures/ITtscBenchmarkPerformanceCell.ts";
import type { ITtscBenchmarkPerformanceProject } from "./structures/ITtscBenchmarkPerformanceProject.ts";

/**
 * Owns clone paths, cleanliness checks, and source discovery for performance
 * benchmark worktrees.
 *
 * Keeping every worktree mutation behind this class makes the measurement
 * boundary explicit: callers may time commands first and clean the fixture only
 * after the measured process has returned.
 */
export class TtscBenchmarkPerformanceWorktree {
  /**
   * Creates a worktree coordinator for one benchmark invocation.
   *
   * @param options Shared paths and benchmark services.
   */
  public constructor(
    private readonly options: TtscBenchmarkPerformanceWorktree.IOptions,
  ) {}

  /**
   * Resolves the persistent clone directory for a fixture branch.
   *
   * @param project Fixture project.
   * @param branch Benchmark branch.
   * @returns Absolute clone directory.
   */
  public cloneDirectory(
    project: ITtscBenchmarkPerformanceProject,
    branch: ITtscBenchmarkPerformanceCell.Branch,
  ): string {
    return path.join(this.options.workRoot, `${project.repoName}@${branch}`);
  }

  /**
   * Rejects a measurement that would begin from an unexpected dirty worktree.
   *
   * @param root Clone directory.
   * @param id Benchmark cell identifier.
   * @param project Fixture project.
   */
  public assertClean(
    root: string,
    id: string,
    project: ITtscBenchmarkPerformanceProject,
  ): void {
    const status = this.status(root, project);
    if (!status.trim()) return;
    throw new Error(
      `${id} cannot start from a dirty benchmark worktree: ${root}\n${status}`,
    );
  }

  /**
   * Restores tracked files and removes generated fixture output.
   *
   * Package-manager state remains cached because dependency installation is not
   * part of the compiler measurement.
   *
   * @param root Clone directory.
   * @param project Optional fixture-specific cleanup policy.
   */
  public cleanup(
    root: string,
    project?: ITtscBenchmarkPerformanceProject,
  ): void {
    this.options.process.shell("git restore --worktree .", root, {
      quiet: true,
      timing: false,
      label: `restore benchmark worktree ${path.basename(root)}`,
    });
    const excludes = [
      "node_modules",
      "**/node_modules",
      ".yarn-cache",
      ".pnpm-store",
      ".husky/_",
      "**/.husky/_",
      ...(project?.packageManager === "pnpm" ? ["pnpm-workspace.yaml"] : []),
      ...(project?.cleanExcludes ?? []),
    ];
    this.options.process.shell(
      `git clean -fdx ${excludes
        .map((pattern) => `-e ${this.options.process.quote(pattern)}`)
        .join(" ")}`,
      root,
      {
        quiet: true,
        timing: false,
        label: `clean benchmark worktree ${path.basename(root)}`,
      },
    );
  }

  /**
   * Finds the source root used to count a fixture's TypeScript files.
   *
   * @param project Fixture project.
   * @returns Existing selected-branch source root, or the legacy fallback.
   */
  public sourceRoot(project: ITtscBenchmarkPerformanceProject): string {
    for (const branch of TtscBenchmarkPerformanceCell.branches(
      project,
      this.options.cell,
    )) {
      const root = path.join(
        this.cloneDirectory(project, branch),
        project.filesRoot,
      );
      if (fs.existsSync(root)) return root;
    }
    return path.join(this.cloneDirectory(project, "legacy"), project.filesRoot);
  }

  /**
   * Counts non-declaration TypeScript source files below a fixture root.
   *
   * @param root Source root.
   * @returns Number of TypeScript source files.
   */
  public countSourceFiles(root: string): number {
    if (!fs.existsSync(root)) return 0;
    const skip = new Set([
      ".git",
      "node_modules",
      "dist",
      "lib",
      "out",
      "build",
      "coverage",
    ]);
    let count = 0;
    const walk = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, {
        withFileTypes: true,
      })) {
        if (entry.isDirectory()) {
          if (!skip.has(entry.name)) {
            walk(path.join(directory, entry.name));
          }
        } else if (
          /\.(ts|tsx|mts|cts)$/.test(entry.name) &&
          !/\.d\.(ts|mts|cts)$/.test(entry.name)
        ) {
          count++;
        }
      }
    };
    walk(root);
    return count;
  }

  /**
   * Deletes one exact persistent clone directory.
   *
   * @param project Fixture project.
   * @param branch Benchmark branch.
   */
  public remove(
    project: ITtscBenchmarkPerformanceProject,
    branch: ITtscBenchmarkPerformanceCell.Branch,
  ): void {
    const directory = this.cloneDirectory(project, branch);
    if (!fs.existsSync(directory)) return;
    this.options.process.time(
      `remove clone ${project.repoName}@${branch}`,
      () => {
        fs.rmSync(directory, { recursive: true, force: true });
      },
    );
  }

  private status(
    root: string,
    project?: ITtscBenchmarkPerformanceProject,
  ): string {
    const status =
      this.options.process.shell(
        "git status --short --untracked-files=normal",
        root,
        {
          quiet: true,
          check: false,
          timing: false,
        },
      ).stdout ?? "";
    return status
      .split("\n")
      .filter((line) => line && !this.isAllowedDirtyLine(line, project))
      .join("\n");
  }

  private isAllowedDirtyLine(
    line: string,
    project?: ITtscBenchmarkPerformanceProject,
  ): boolean {
    const pathText = line.slice(3).trim();
    const paths = pathText.includes(" -> ")
      ? pathText.split(" -> ").map((part) => part.trim())
      : [pathText];
    return paths.every((file) => this.isAllowedDirtyPath(file, project));
  }

  private isAllowedDirtyPath(
    file: string,
    project?: ITtscBenchmarkPerformanceProject,
  ): boolean {
    const dirtyPath = file.replace(/^"|"$/g, "").replace(/\/$/, "");
    const allowed = [
      "node_modules",
      ".yarn-cache",
      ".pnpm-store",
      ".husky/_",
      "yarn.lock",
      "pnpm-lock.yaml",
      "package-lock.json",
      ...(project?.packageManager === "pnpm" ? ["pnpm-workspace.yaml"] : []),
      ...(project?.cleanExcludes ?? []),
    ];
    return allowed.some((pattern) => this.matchesDirtyPath(dirtyPath, pattern));
  }

  private matchesDirtyPath(dirtyPath: string, pattern: string): boolean {
    const normalized = pattern.replace(/\/\*\*$/, "").replace(/\/$/, "");
    if (normalized === "**/node_modules") {
      return dirtyPath.includes("node_modules");
    }
    if (normalized === "**/.husky/_") {
      return dirtyPath.endsWith(".husky/_");
    }
    return dirtyPath === normalized || dirtyPath.startsWith(`${normalized}/`);
  }
}

/** Contracts used by {@link TtscBenchmarkPerformanceWorktree}. */
export namespace TtscBenchmarkPerformanceWorktree {
  /** Dependencies shared by worktree operations. */
  export interface IOptions {
    /** Root that contains persistent benchmark clones. */
    workRoot: string;
    /** Cell-selection policy used when discovering fixture source roots. */
    cell: TtscBenchmarkPerformanceCell.IOptions;
    /** Shared command runner. */
    process: TtscBenchmarkPerformanceProcess;
  }
}
