import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { TtscBenchmarkPerformancePackage } from "./TtscBenchmarkPerformancePackage.ts";
import { TtscBenchmarkPerformanceWorktree } from "./TtscBenchmarkPerformanceWorktree.ts";
import type { ITtscBenchmarkPerformanceCell } from "./structures/ITtscBenchmarkPerformanceCell.ts";
import type { ITtscBenchmarkPerformanceMeasurement } from "./structures/ITtscBenchmarkPerformanceMeasurement.ts";
import type { ITtscBenchmarkPerformanceProject } from "./structures/ITtscBenchmarkPerformanceProject.ts";
import type { ITtscBenchmarkPerformanceReport } from "./structures/ITtscBenchmarkPerformanceReport.ts";

/**
 * Owns performance report metadata, persistence, validation, and website merge
 * behavior.
 *
 * One instance represents one benchmark invocation. Its metadata cache survives
 * sequential clone removal, while every persisted report retains the historical
 * project order and raw sample arrays used by the dashboard.
 */
export class TtscBenchmarkPerformanceReport {
  private readonly projectMetaCache = new Map<
    string,
    ITtscBenchmarkPerformanceProject.IMeta
  >();

  /**
   * Creates a report coordinator for one benchmark invocation.
   *
   * @param options Immutable paths, versions, sampling counts, and worktree
   *   dependencies shared by every report operation.
   */
  public constructor(
    private readonly options: TtscBenchmarkPerformanceReport.IOptions,
  ) {}

  /**
   * Creates the mutable report updated after each measured cell.
   *
   * Unless reset was requested, measurements from the most complete valid
   * website or checkpoint report are reused. Selected project metadata is
   * refreshed without discarding its existing measurements.
   *
   * @param projects Prepared projects selected for this invocation.
   * @returns Report ordered by the canonical fixture corpus.
   */
  public create(
    projects: ITtscBenchmarkPerformanceProject[],
  ): ITtscBenchmarkPerformanceReport {
    const previous = this.options.reset ? null : this.loadPrevious();
    const selected = new Set(
      projects.map(
        (project: ITtscBenchmarkPerformanceProject): string => project.name,
      ),
    );
    const reports = new Map<string, ITtscBenchmarkPerformanceReport.IProject>(
      (previous?.projects ?? [])
        .filter(
          (project: ITtscBenchmarkPerformanceReport.IProject): boolean =>
            Boolean(project?.name) && !selected.has(project.name),
        )
        .map(
          (
            project: ITtscBenchmarkPerformanceReport.IProject,
          ): [string, ITtscBenchmarkPerformanceReport.IProject] => [
            project.name,
            project,
          ],
        ),
    );
    for (const project of projects) {
      const old = previous?.projects.find(
        (candidate: ITtscBenchmarkPerformanceReport.IProject): boolean =>
          candidate.name === project.name,
      );
      reports.set(
        project.name,
        this.projectReport(
          project,
          Array.isArray(old?.measurements) ? old.measurements : [],
        ),
      );
    }

    const orderedReports: ITtscBenchmarkPerformanceReport.IProject[] = [];
    for (const project of this.options.projects) {
      const report = reports.get(project.name);
      if (report !== undefined) {
        orderedReports.push(report);
        reports.delete(project.name);
      }
    }
    orderedReports.push(...reports.values());
    return {
      date: new Date().toISOString(),
      runs: this.options.runs,
      warmup: this.options.warmup,
      host: this.host(projects),
      projects: orderedReports,
    };
  }

  /**
   * Returns the report row for a project, creating it when first measured.
   *
   * @param report Mutable invocation report.
   * @param project Fixture whose row is required.
   * @returns Existing or newly appended project report.
   */
  public ensureProject(
    report: ITtscBenchmarkPerformanceReport,
    project: ITtscBenchmarkPerformanceProject,
  ): ITtscBenchmarkPerformanceReport.IProject {
    let projectReport = report.projects.find(
      (candidate: ITtscBenchmarkPerformanceReport.IProject): boolean =>
        candidate.name === project.name,
    );
    if (projectReport === undefined) {
      projectReport = this.projectReport(project, []);
      report.projects.push(projectReport);
    }
    return projectReport;
  }

  /**
   * Captures metadata while a sequential-mode fixture clone still exists.
   *
   * File counts are accepted only when positive, and the legacy TypeScript
   * version is read only from the legacy branch.
   *
   * @param project Fixture whose clone is currently available.
   * @param branch Available fixture branch.
   */
  public captureProjectMeta(
    project: ITtscBenchmarkPerformanceProject,
    branch: ITtscBenchmarkPerformanceCell.Branch,
  ): void {
    const meta = this.projectMetaCache.get(project.name) ?? {};
    if (meta.files == null || meta.files === 0) {
      const files = this.options.worktree.countSourceFiles(
        this.options.worktree.sourceRoot(project),
      );
      if (files > 0) this.cacheProjectMeta(project.name, { files });
    }
    if (branch === "legacy" && !meta.legacyTypescript) {
      const legacyTypescript =
        TtscBenchmarkPerformancePackage.dependencyVersion(
          this.options.worktree.cloneDirectory(project, "legacy"),
          "typescript",
        );
      if (legacyTypescript) {
        this.cacheProjectMeta(project.name, { legacyTypescript });
      }
    }
  }

  /**
   * Refreshes a report row from metadata captured before clone removal.
   *
   * @param report Mutable invocation report.
   * @param project Fixture whose cached metadata should be applied.
   */
  public refreshProjectMeta(
    report: ITtscBenchmarkPerformanceReport,
    project: ITtscBenchmarkPerformanceProject,
  ): void {
    const projectReport = this.ensureProject(report, project);
    const meta = this.projectMetaCache.get(project.name) ?? {};
    if (meta.files != null && meta.files > 0) {
      projectReport.files = meta.files;
    }
    if (meta.legacyTypescript) {
      projectReport.typescript = this.displayLegacyTypescriptVersion(
        meta.legacyTypescript,
      );
    }
  }

  /**
   * Describes the measurement host and the toolchain versions shared by rows.
   *
   * @param projects Projects whose installed legacy TypeScript versions
   *   contribute to the host summary.
   * @returns Host metadata persisted in the report.
   */
  public host(
    projects: ITtscBenchmarkPerformanceProject[],
  ): ITtscBenchmarkPerformanceReport.IHost {
    const cpus = os.cpus();
    let osName = `${os.type()} ${os.release()}`;
    try {
      const pretty = fs
        .readFileSync("/etc/os-release", "utf8")
        .match(/^PRETTY_NAME="?([^"\n]+)"?/m);
      if (pretty?.[1]) osName = pretty[1];
    } catch {
      // Keep os.type/os.release fallback.
    }
    return {
      os: osName,
      kernel: os.release(),
      cpu: cpus[0]?.model?.trim() ?? "unknown",
      cores: cpus.length,
      ramGB: Math.round(os.totalmem() / 2 ** 30),
      node: process.version,
      ttsc: this.options.ttscVersion,
      typescript: this.displayLegacyTypescriptVersion(
        this.commonDependencyVersion(projects, "legacy", "typescript"),
      ),
      tsgo: this.options.typescriptGoVersion,
    };
  }

  /**
   * Builds the human-readable companion report from raw samples.
   *
   * The table reports minimum sample values, while JSON remains authoritative
   * and retains every sample for dashboard-side reduction.
   *
   * @param report Machine-readable report.
   * @returns Markdown report without its final newline.
   */
  public buildMarkdown(report: ITtscBenchmarkPerformanceReport): string {
    const lines: string[] = [];
    lines.push("# ttsc benchmark");
    lines.push("");
    lines.push(`- Date: ${report.date}`);
    lines.push(
      `- Runs: ${this.options.runs} measured + ${this.options.warmup} warmup per cell`,
    );
    lines.push("");
    lines.push("## Host");
    lines.push("");
    lines.push("| Field | Value |");
    lines.push("| --- | --- |");
    for (const [key, value] of Object.entries(report.host)) {
      lines.push(`| ${key} | ${value} |`);
    }
    lines.push("");

    for (const project of report.projects) {
      lines.push(`## ${project.name}`);
      lines.push("");
      lines.push(
        "| Branch | Op | Threading | Min | @ttsc/lint sidecar | @ttsc/lint | Transform host | Samples | Failure |",
      );
      lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
      for (const measurement of project.measurements) {
        lines.push(
          `| ${measurement.branch} | ${measurement.op} | ${measurement.threading} | ${this.formatMilliseconds(this.sampleMinimum(measurement.samples))} | ` +
            `${this.formatMilliseconds(this.sampleMinimum(measurement.lintSamples))} | ` +
            `${this.formatMilliseconds(this.sampleMinimum(measurement.lintPluginSamples))} | ` +
            `${this.formatMilliseconds(this.sampleMinimum(measurement.transformHostSamples))} | ` +
            `${
              measurement.samples
                ?.map((sample: number): string => sample.toFixed(0))
                .join(", ") || "-"
            } | ` +
            `${measurement.failure ?? ""} |`,
        );
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  /**
   * Persists Markdown, raw JSON, checkpoint JSON, and optionally website JSON.
   *
   * Website publication first merges audited historical rows so a targeted
   * invocation cannot erase cells or projects outside its selected scope.
   *
   * @param report Mutable invocation report to persist.
   * @param options Per-write website publication request; defaults to false.
   */
  public write(
    report: ITtscBenchmarkPerformanceReport,
    {
      publishWebsite = false,
    }: ITtscBenchmarkPerformanceReport.IWriteOptions = {},
  ): void {
    fs.writeFileSync(
      this.options.outputMarkdown,
      this.buildMarkdown(report) + "\n",
    );
    fs.writeFileSync(
      this.options.reportJson,
      JSON.stringify(report, null, 2) + "\n",
    );
    fs.writeFileSync(
      this.options.checkpointJson,
      JSON.stringify(report, null, 2) + "\n",
    );
    if (publishWebsite && this.options.publishWebsite) {
      fs.mkdirSync(path.dirname(this.options.websiteJson), {
        recursive: true,
      });
      const websiteReport = this.mergeWebsiteMeasurements(report);
      fs.writeFileSync(
        this.options.websiteJson,
        JSON.stringify(websiteReport, null, 2) + "\n",
      );
    }
  }

  /**
   * Validates the complete JSON schema accepted for checkpoint reuse.
   *
   * @param input Untrusted value parsed from disk.
   * @returns Whether the value is a complete performance report.
   */
  public isReport(input: unknown): input is ITtscBenchmarkPerformanceReport {
    if (!TtscBenchmarkPerformancePackage.isRecord(input)) return false;
    return (
      this.isIsoDate(input.date) &&
      this.isPositiveInteger(input.runs) &&
      this.isNonNegativeInteger(input.warmup) &&
      this.isHost(input.host) &&
      Array.isArray(input.projects) &&
      input.projects.every((project: unknown): boolean =>
        this.isProject(project),
      ) &&
      new Set(
        input.projects.map(
          (project: ITtscBenchmarkPerformanceReport.IProject): string =>
            project.name,
        ),
      ).size === input.projects.length
    );
  }

  private cacheProjectMeta(
    projectName: string,
    updates: ITtscBenchmarkPerformanceProject.IMeta,
  ): void {
    const existing = this.projectMetaCache.get(projectName) ?? {};
    this.projectMetaCache.set(projectName, {
      ...existing,
      ...updates,
    });
  }

  private projectReport(
    project: ITtscBenchmarkPerformanceProject,
    measurements: ITtscBenchmarkPerformanceMeasurement[],
  ): ITtscBenchmarkPerformanceReport.IProject {
    const meta = this.projectMetaCache.get(project.name) ?? {};
    return {
      name: project.name,
      repo: project.repoName,
      kind: project.kind,
      files:
        meta.files ??
        this.options.worktree.countSourceFiles(
          this.options.worktree.sourceRoot(project),
        ),
      typescript: this.displayLegacyTypescriptVersion(
        meta.legacyTypescript ??
          TtscBenchmarkPerformancePackage.dependencyVersion(
            this.options.worktree.cloneDirectory(project, "legacy"),
            "typescript",
          ),
      ),
      tsgo: this.options.typescriptGoVersion,
      measurements,
    };
  }

  private commonDependencyVersion(
    projects: ITtscBenchmarkPerformanceProject[],
    branch: ITtscBenchmarkPerformanceCell.Branch,
    name: string,
  ): string {
    const versions = [
      ...new Set(
        projects
          .map(
            (project: ITtscBenchmarkPerformanceProject): string | undefined => {
              if (branch === "legacy" && name === "typescript") {
                const cached = this.projectMetaCache.get(
                  project.name,
                )?.legacyTypescript;
                if (cached) return cached;
              }
              return TtscBenchmarkPerformancePackage.dependencyVersion(
                this.options.worktree.cloneDirectory(project, branch),
                name,
              );
            },
          )
          .filter((version: string | undefined): version is string =>
            Boolean(version),
          ),
      ),
    ];
    if (versions.length === 0) return "unknown";
    return versions.length === 1
      ? (versions[0] ?? "unknown")
      : "varies by fixture";
  }

  private displayLegacyTypescriptVersion(version?: string): string {
    if (!version || version === "unknown") return version ?? "unknown";
    if (version === "varies by fixture") return version;
    if (version === "6.0.0-dev.20260416" || version === "6.0.3") {
      return this.options.legacyTypescriptDisplayVersion;
    }
    return version.startsWith("v") ? version : `v${version}`;
  }

  private sampleMinimum(samples?: number[]): number {
    return samples && samples.length > 0 ? Math.min(...samples) : 0;
  }

  private formatMilliseconds(milliseconds: number): string {
    return milliseconds > 0 ? `${(milliseconds / 1000).toFixed(2)} s` : "-";
  }

  private loadPrevious(): ITtscBenchmarkPerformanceReport | null {
    const candidates: ITtscBenchmarkPerformanceReport[] = [];
    for (const file of [
      this.options.websiteJson,
      this.options.checkpointJson,
    ]) {
      const input = this.loadJson(file);
      if (this.isReport(input)) candidates.push(input);
    }
    candidates.sort(
      (
        left: ITtscBenchmarkPerformanceReport,
        right: ITtscBenchmarkPerformanceReport,
      ): number => this.measurementCount(right) - this.measurementCount(left),
    );
    return candidates[0] ?? null;
  }

  private measurementCount(report: ITtscBenchmarkPerformanceReport): number {
    return report.projects.reduce(
      (
        sum: number,
        project: ITtscBenchmarkPerformanceReport.IProject,
      ): number => sum + project.measurements.length,
      0,
    );
  }

  private mergeWebsiteMeasurements(
    report: ITtscBenchmarkPerformanceReport,
  ): ITtscBenchmarkPerformanceReport {
    if (this.options.reset) return report;
    const previous = this.loadJson(this.options.websiteJson);
    if (!this.isReport(previous)) {
      if (fs.existsSync(this.options.websiteJson))
        throw new TypeError(
          `invalid performance website report: ${this.options.websiteJson}`,
        );
      return report;
    }

    const cloned: unknown = JSON.parse(JSON.stringify(report));
    if (!this.isReport(cloned)) {
      throw new Error("internal error: serialized benchmark report is invalid");
    }
    const merged = cloned;
    for (const project of merged.projects) {
      const oldProject = previous.projects.find(
        (candidate: ITtscBenchmarkPerformanceReport.IProject): boolean =>
          candidate.name === project.name,
      );
      if (oldProject === undefined || !Array.isArray(oldProject.measurements)) {
        continue;
      }

      const freshById = new Map<string, ITtscBenchmarkPerformanceMeasurement>(
        project.measurements.map(
          (
            measurement: ITtscBenchmarkPerformanceMeasurement,
          ): [string, ITtscBenchmarkPerformanceMeasurement] => [
            measurement.id,
            measurement,
          ],
        ),
      );
      const measurements: ITtscBenchmarkPerformanceMeasurement[] = [];
      for (const oldMeasurement of oldProject.measurements) {
        if (this.isObsoleteMergedMeasurement(oldMeasurement)) continue;
        const fresh = freshById.get(oldMeasurement.id);
        if (fresh !== undefined) {
          measurements.push(fresh);
          freshById.delete(oldMeasurement.id);
        } else {
          measurements.push(oldMeasurement);
        }
      }
      measurements.push(...freshById.values());
      project.measurements = measurements;
    }

    const existing = new Set(
      merged.projects.map(
        (project: ITtscBenchmarkPerformanceReport.IProject): string =>
          project.name,
      ),
    );
    for (const oldProject of previous.projects) {
      if (!existing.has(oldProject.name)) {
        merged.projects.push(this.pruneObsoleteMeasurements(oldProject));
      }
    }
    return merged;
  }

  private pruneObsoleteMeasurements(
    project: ITtscBenchmarkPerformanceReport.IProject,
  ): ITtscBenchmarkPerformanceReport.IProject {
    return {
      ...project,
      measurements: (project.measurements ?? []).filter(
        (measurement: ITtscBenchmarkPerformanceMeasurement): boolean =>
          !this.isObsoleteMergedMeasurement(measurement),
      ),
    };
  }

  private isObsoleteMergedMeasurement(
    measurement: ITtscBenchmarkPerformanceMeasurement,
  ): boolean {
    if (measurement.threading === "multi" && measurement.branch !== "legacy") {
      return measurement.op === "build" || measurement.op === "noEmit";
    }
    return (
      measurement.op === "format" &&
      /^(?:checkers2|checkers4|checkers8)$/.test(measurement.threading)
    );
  }

  private isNumberArray(input: unknown): input is number[] {
    return (
      Array.isArray(input) &&
      input.every(
        (entry: unknown): boolean =>
          typeof entry === "number" && Number.isFinite(entry) && entry >= 0,
      )
    );
  }

  private isOptionalNumberArray(input: unknown): input is number[] | undefined {
    return input === undefined || this.isNumberArray(input);
  }

  private isMeasurement(
    input: unknown,
    projectName: string,
  ): input is ITtscBenchmarkPerformanceMeasurement {
    if (!TtscBenchmarkPerformancePackage.isRecord(input)) return false;
    const expectedId: string = (
      input.tool === "tsgo"
        ? [projectName, input.branch, "tsgo", input.op, input.threading]
        : [projectName, input.branch, input.op, input.threading]
    ).join(":");
    return (
      input.id === expectedId &&
      this.isBranch(input.branch) &&
      this.isTool(input.tool) &&
      this.isOperation(input.op) &&
      this.isThreading(input.threading) &&
      this.isNumberArray(input.samples) &&
      this.isOptionalNumberArray(input.lintSamples) &&
      this.isOptionalNumberArray(input.lintPluginSamples) &&
      this.isOptionalNumberArray(input.transformHostSamples) &&
      (input.raceRetries === undefined ||
        this.isNonNegativeInteger(input.raceRetries)) &&
      (input.failure === undefined ||
        input.failure === "race" ||
        input.failure === "error") &&
      (input.exitStatus === undefined ||
        input.exitStatus === null ||
        Number.isInteger(input.exitStatus))
    );
  }

  private isProject(
    input: unknown,
  ): input is ITtscBenchmarkPerformanceReport.IProject {
    if (!TtscBenchmarkPerformancePackage.isRecord(input)) return false;
    return (
      this.isNonEmptyString(input.name) &&
      this.isNonEmptyString(input.repo) &&
      this.isNonEmptyString(input.kind) &&
      this.isNonNegativeInteger(input.files) &&
      this.isNonEmptyString(input.typescript) &&
      this.isNonEmptyString(input.tsgo) &&
      Array.isArray(input.measurements) &&
      input.measurements.every((measurement: unknown): boolean =>
        this.isMeasurement(measurement, input.name as string),
      ) &&
      new Set(
        input.measurements.map(
          (measurement: ITtscBenchmarkPerformanceMeasurement): string =>
            measurement.id,
        ),
      ).size === input.measurements.length
    );
  }

  private isHost(
    input: unknown,
  ): input is ITtscBenchmarkPerformanceReport.IHost {
    if (!TtscBenchmarkPerformancePackage.isRecord(input)) return false;
    return (
      this.isNonEmptyString(input.os) &&
      this.isNonEmptyString(input.kernel) &&
      this.isNonEmptyString(input.cpu) &&
      this.isPositiveInteger(input.cores) &&
      typeof input.ramGB === "number" &&
      Number.isFinite(input.ramGB) &&
      input.ramGB > 0 &&
      this.isNonEmptyString(input.node) &&
      this.isNonEmptyString(input.ttsc) &&
      this.isNonEmptyString(input.typescript) &&
      this.isNonEmptyString(input.tsgo)
    );
  }

  private isBranch(
    input: unknown,
  ): input is ITtscBenchmarkPerformanceCell.Branch {
    return input === "legacy" || input === "ttsc" || input === "ttsc-lint";
  }

  private isOperation(
    input: unknown,
  ): input is ITtscBenchmarkPerformanceCell.Operation {
    return (
      input === "build" ||
      input === "noEmit" ||
      input === "eslint" ||
      input === "format"
    );
  }

  private isThreading(
    input: unknown,
  ): input is ITtscBenchmarkPerformanceCell.Threading {
    return (
      input === "single" ||
      input === "multi" ||
      input === "checkers2" ||
      input === "checkers4" ||
      input === "checkers8"
    );
  }

  private isTool(input: unknown): boolean {
    return (
      input === "tsc" ||
      input === "tsgo" ||
      input === "ttsc" ||
      input === "ttsc+@ttsc/lint" ||
      input === "eslint" ||
      input === "@ttsc/lint" ||
      input === "ttsc-format" ||
      input === "prettier"
    );
  }

  private isNonEmptyString(input: unknown): input is string {
    return typeof input === "string" && input.length > 0;
  }

  private isPositiveInteger(input: unknown): input is number {
    return this.isNonNegativeInteger(input) && input > 0;
  }

  private isNonNegativeInteger(input: unknown): input is number {
    return (
      typeof input === "number" &&
      Number.isFinite(input) &&
      Number.isInteger(input) &&
      input >= 0
    );
  }

  private isIsoDate(input: unknown): input is string {
    if (!this.isNonEmptyString(input)) return false;
    const timestamp: number = Date.parse(input);
    return (
      Number.isFinite(timestamp) && new Date(timestamp).toISOString() === input
    );
  }

  private loadJson(file: string): unknown {
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  }
}

/** Constructor contracts for {@link TtscBenchmarkPerformanceReport}. */
export namespace TtscBenchmarkPerformanceReport {
  /** Immutable report paths, versions, and benchmark invocation policy. */
  export interface IOptions {
    /** Checkpoint JSON path updated after every report write. */
    checkpointJson: string;

    /** Display label substituted for the supported legacy TypeScript release. */
    legacyTypescriptDisplayVersion: string;

    /** Markdown report path written for human inspection. */
    outputMarkdown: string;

    /** Canonical fixture corpus whose order controls report rows. */
    projects: readonly ITtscBenchmarkPerformanceProject[];

    /** Whether website JSON writes are allowed for this invocation. */
    publishWebsite: boolean;

    /** Machine-readable raw report path written beside Markdown. */
    reportJson: string;

    /** Whether historical report and website measurements are discarded. */
    reset: boolean;

    /** Number of measured runs requested per cell. */
    runs: number;

    /** Workspace ttsc version recorded in host metadata. */
    ttscVersion: string;

    /** Pinned TypeScript-Go version recorded for every project and host. */
    typescriptGoVersion: string;

    /** Number of unmeasured warmup runs requested per cell. */
    warmup: number;

    /** Website performance JSON path merged only on requested publication. */
    websiteJson: string;

    /** Shared worktree service used for clone paths and source file counts. */
    worktree: TtscBenchmarkPerformanceWorktree;
  }
}
