import fs from "node:fs";
import path from "node:path";

import { TtscBenchmarkObject } from "./TtscBenchmarkObject.ts";

/**
 * Validates and merges partial performance reports into website publication
 * state without discarding untouched benchmark cells.
 */
export namespace TtscBenchmarkPerformanceWebsiteMerger {
  type Tool =
    | "tsc"
    | "tsgo"
    | "ttsc"
    | "ttsc+@ttsc/lint"
    | "eslint"
    | "@ttsc/lint"
    | "ttsc-format"
    | "prettier";

  type Measurement = Record<string, unknown> & {
    id: string;
    branch: "legacy" | "ttsc" | "ttsc-lint";
    tool: Tool;
    op: "build" | "noEmit" | "eslint" | "format";
    threading: "single" | "checkers2" | "checkers4" | "checkers8" | "multi";
    samples: number[];
    lintSamples?: number[];
    lintPluginSamples?: number[];
    transformHostSamples?: number[];
    raceRetries?: number;
    failure?: "race" | "error";
    exitStatus?: number | null;
  };

  type ProjectReport = Record<string, unknown> & {
    name: string;
    repo: string;
    kind: string;
    files: number;
    typescript: string;
    tsgo: string;
    measurements: Measurement[];
  };

  type HostReport = Record<string, unknown> & {
    os: string;
    kernel: string;
    cpu: string;
    cores: number;
    ramGB: number;
    node: string;
    ttsc: string;
    typescript: string;
    tsgo: string;
  };

  type BenchmarkReport = Record<string, unknown> & {
    date: string;
    host: HostReport;
    runs: number;
    warmup: number;
    projects: ProjectReport[];
  };

  type PartialReport = {
    name: string;
    data: BenchmarkReport;
  };

  /**
   * Merges validated reports below one partial root into an existing website
   * report supplied by the CLI.
   *
   * @param arguments_ Partial-report directory and website JSON path.
   */
  export async function main(arguments_: readonly string[]): Promise<void> {
    const [partialsDir, websiteJsonPath] = arguments_;
    if (!partialsDir || !websiteJsonPath) {
      console.error("usage: merge.ts <partials-dir> <website-benchmark.json>");
      process.exitCode = 1;
      return;
    }

    const loadedWebsite = loadJson(websiteJsonPath);
    if (!isBenchmarkReport(loadedWebsite)) {
      throw new Error(
        `[merge] ${websiteJsonPath}: existing website benchmark is invalid`,
      );
    }
    const website: BenchmarkReport = loadedWebsite;

    const partials: PartialReport[] = [];
    for (const entry of fs.readdirSync(partialsDir, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      const reportPath = path.join(partialsDir, entry.name, "report.json");
      if (!fs.existsSync(reportPath)) {
        console.warn(`[merge] ${entry.name}: report.json missing, skipping`);
        continue;
      }
      const data = loadJson(reportPath);
      if (!isBenchmarkReport(data)) {
        console.warn(`[merge] ${entry.name}: not a valid report, skipping`);
        continue;
      }
      partials.push({ name: entry.name, data });
    }

    const partialsWithData = partials.filter(
      (partial) => countMeasurements(partial.data) > 0,
    );
    const freshest = partialsWithData.reduce<PartialReport | null>(
      (best, partial) => {
        if (!best) return partial;
        const left = Date.parse(best.data.date ?? "") || 0;
        const right = Date.parse(partial.data.date ?? "") || 0;
        return right > left ? partial : best;
      },
      null,
    );
    if (freshest) {
      if (freshest.data.date) website.date = freshest.data.date;
      if (freshest.data.host) website.host = freshest.data.host;
      if (freshest.data.runs != null) website.runs = freshest.data.runs;
      if (freshest.data.warmup != null) website.warmup = freshest.data.warmup;
    }

    for (const { name, data } of partials) {
      for (const project of data.projects) {
        const index = website.projects.findIndex(
          (candidate) => candidate.name === project.name,
        );
        if (index === -1) {
          website.projects.push(project);
          console.log(
            `[merge] ${name}: appended new project ${project.name} ` +
              `(${project.measurements?.length ?? 0} measurements)`,
          );
          continue;
        }
        const existing = website.projects[index]!;
        const freshById = new Map<string, Measurement>(
          (project.measurements ?? []).map((measurement) => [
            measurement.id,
            measurement,
          ]),
        );
        const measurements: Measurement[] = [];
        for (const old of existing.measurements ?? []) {
          const fresh = freshById.get(old.id);
          if (fresh) {
            measurements.push(fresh);
            freshById.delete(old.id);
          } else {
            measurements.push(old);
          }
        }
        measurements.push(...freshById.values());
        website.projects[index] = {
          ...existing,
          ...project,
          measurements,
        };
        console.log(
          `[merge] ${name}: ${project.name} ` +
            `(${project.measurements?.length ?? 0} fresh, ` +
            `${measurements.length} total)`,
        );
      }
    }

    fs.writeFileSync(websiteJsonPath, `${JSON.stringify(website, null, 2)}\n`);
    console.log(
      `[merge] wrote ${websiteJsonPath} (${website.projects.length} projects)`,
    );
  }

  function loadJson(file: string): unknown {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  }

  function countMeasurements(report: BenchmarkReport): number {
    return report.projects.reduce(
      (sum, project) => sum + project.measurements.length,
      0,
    );
  }

  function isBenchmarkReport(input: unknown): input is BenchmarkReport {
    if (
      !TtscBenchmarkObject.isRecord(input) ||
      !isIsoDate(input.date) ||
      !isPositiveInteger(input.runs) ||
      !isNonNegativeInteger(input.warmup) ||
      !isHostReport(input.host) ||
      !Array.isArray(input.projects)
    ) {
      return false;
    }
    const projectNames = new Set<string>();
    for (const project of input.projects) {
      if (!isProjectReport(project) || projectNames.has(project.name)) {
        return false;
      }
      projectNames.add(project.name);
    }
    return true;
  }

  function isProjectReport(input: unknown): input is ProjectReport {
    if (
      !TtscBenchmarkObject.isRecord(input) ||
      !isNonEmptyString(input.name) ||
      !isNonEmptyString(input.repo) ||
      !isNonEmptyString(input.kind) ||
      !isNonNegativeInteger(input.files) ||
      !isNonEmptyString(input.typescript) ||
      !isNonEmptyString(input.tsgo) ||
      !Array.isArray(input.measurements)
    ) {
      return false;
    }
    const measurementIds = new Set<string>();
    for (const measurement of input.measurements) {
      if (
        !isMeasurement(measurement, input.name) ||
        measurementIds.has(measurement.id)
      ) {
        return false;
      }
      measurementIds.add(measurement.id);
    }
    return true;
  }

  function isMeasurement(
    input: unknown,
    projectName: string,
  ): input is Measurement {
    if (
      !TtscBenchmarkObject.isRecord(input) ||
      !isBenchmarkBranch(input.branch) ||
      !isBenchmarkTool(input.tool) ||
      !isBenchmarkOperation(input.op) ||
      !isBenchmarkThreading(input.threading)
    ) {
      return false;
    }
    const expectedId = (
      input.tool === "tsgo"
        ? [projectName, input.branch, "tsgo", input.op, input.threading]
        : [projectName, input.branch, input.op, input.threading]
    ).join(":");
    return (
      input.id === expectedId &&
      isNumberArray(input.samples) &&
      isOptionalNumberArray(input.lintSamples) &&
      isOptionalNumberArray(input.lintPluginSamples) &&
      isOptionalNumberArray(input.transformHostSamples) &&
      (input.raceRetries === undefined ||
        isNonNegativeInteger(input.raceRetries)) &&
      (input.failure === undefined ||
        input.failure === "race" ||
        input.failure === "error") &&
      (input.exitStatus === undefined ||
        input.exitStatus === null ||
        Number.isInteger(input.exitStatus))
    );
  }

  function isHostReport(input: unknown): input is HostReport {
    return (
      TtscBenchmarkObject.isRecord(input) &&
      isNonEmptyString(input.os) &&
      isNonEmptyString(input.kernel) &&
      isNonEmptyString(input.cpu) &&
      isPositiveInteger(input.cores) &&
      isPositiveNumber(input.ramGB) &&
      isNonEmptyString(input.node) &&
      isNonEmptyString(input.ttsc) &&
      isNonEmptyString(input.typescript) &&
      isNonEmptyString(input.tsgo)
    );
  }

  function isBenchmarkBranch(input: unknown): input is Measurement["branch"] {
    return input === "legacy" || input === "ttsc" || input === "ttsc-lint";
  }

  function isBenchmarkTool(input: unknown): input is Tool {
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

  function isBenchmarkOperation(input: unknown): input is Measurement["op"] {
    return (
      input === "build" ||
      input === "noEmit" ||
      input === "eslint" ||
      input === "format"
    );
  }

  function isBenchmarkThreading(
    input: unknown,
  ): input is Measurement["threading"] {
    return (
      input === "single" ||
      input === "checkers2" ||
      input === "checkers4" ||
      input === "checkers8" ||
      input === "multi"
    );
  }

  function isNumberArray(input: unknown): input is number[] {
    return (
      Array.isArray(input) &&
      input.every(
        (value: unknown): value is number =>
          typeof value === "number" && Number.isFinite(value) && value >= 0,
      )
    );
  }

  function isOptionalNumberArray(
    input: unknown,
  ): input is number[] | undefined {
    return input === undefined || isNumberArray(input);
  }

  function isNonEmptyString(input: unknown): input is string {
    return typeof input === "string" && input.length > 0;
  }

  function isPositiveNumber(input: unknown): input is number {
    return typeof input === "number" && Number.isFinite(input) && input > 0;
  }

  function isPositiveInteger(input: unknown): input is number {
    return isPositiveNumber(input) && Number.isInteger(input);
  }

  function isNonNegativeInteger(input: unknown): input is number {
    return (
      typeof input === "number" &&
      Number.isFinite(input) &&
      Number.isInteger(input) &&
      input >= 0
    );
  }

  function isIsoDate(input: unknown): input is string {
    if (!isNonEmptyString(input)) return false;
    const timestamp = Date.parse(input);
    return (
      Number.isFinite(timestamp) && new Date(timestamp).toISOString() === input
    );
  }
}
