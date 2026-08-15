import cp from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { TtscBenchmarkConstant } from "./TtscBenchmarkConstant.ts";
import { TtscBenchmarkNumber } from "./TtscBenchmarkNumber.ts";
import { TtscBenchmarkObject } from "./TtscBenchmarkObject.ts";

/** Runs the structural graph benchmark against a real TypeScript project. */
export namespace TtscBenchmarkGraphStructural {
  interface ISample {
    sourceFiles: number;
    nodes: number;
    externalNodes: number;
    edges: {
      heritage: number;
      "value-call": number;
      "type-ref": number;
    };
    totalEdges: number;
    symbolFiles: number;
    coveredFiles: number;
    coverage: number;
    loadMs: number;
    buildMs: number;
    buildShareOfLoad: number;
  }

  /**
   * Runs the structural graph benchmark command.
   *
   * @param entrypointDirectory Directory containing the executable bootstrap.
   */
  export function main(entrypointDirectory: string): void {
    // Resolved from the package rather than counted up from the bootstrap.
    // Counting was correct only while the executables sat one directory deeper,
    // and it failed silently when they moved: every path below stayed a valid
    // string and pointed one level outside the repository.
    const benchmarkRoot: string = TtscBenchmarkConstant.ROOT;
    const repoRoot: string = TtscBenchmarkConstant.REPOSITORY_ROOT;
    const ttscDir: string = path.join(repoRoot, "packages", "ttsc");
    const workRoot: string = path.join(benchmarkRoot, ".work");
    const args: Record<string, string> = parseArgs(process.argv.slice(2));
    const project: string = path.resolve(args.project ?? ttscDir);
    const tsconfig: string = args.tsconfig ?? "tsconfig.json";
    const runs: number = positiveInteger(args.runs ?? "5", "--runs");
    const warmup: number = nonNegativeInteger(args.warmup ?? "1", "--warmup");
    const goRoot: string = path.join(os.homedir(), "go-sdk", "go", "bin");
    const runRoot: string = path.join(
      workRoot,
      "graph",
      "structural",
      `run-${process.pid}`,
    );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GOCACHE: path.join(runRoot, "go-cache"),
      GOTMPDIR: path.join(runRoot, "go-tmp"),
      PATH: fs.existsSync(goRoot)
        ? `${goRoot}${path.delimiter}${process.env.PATH ?? ""}`
        : process.env.PATH,
    };
    const binary: string = path.join(
      runRoot,
      `graphbench-${process.pid}${process.platform === "win32" ? ".exe" : ""}`,
    );

    const runChecked = (
      command: string,
      commandArgs: readonly string[],
      cwd: string,
    ): string => {
      const result: cp.SpawnSyncReturns<string> = cp.spawnSync(
        command,
        commandArgs,
        {
          cwd,
          env,
          encoding: "utf8",
          windowsHide: true,
        },
      );
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(
          `${command} ${commandArgs.join(" ")} failed (${result.status})\n${result.stderr ?? ""}`,
        );
      return result.stdout ?? "";
    };
    const measure = (): ISample => {
      const out: string = runChecked(
        binary,
        ["--cwd", project, "--tsconfig", tsconfig],
        ttscDir,
      );
      const parsed: unknown = JSON.parse(out.trim());
      if (isSample(parsed) === false)
        throw new Error("graphbench returned an invalid measurement");
      return parsed;
    };

    fs.mkdirSync(env.GOCACHE!, { recursive: true });
    fs.mkdirSync(env.GOTMPDIR!, { recursive: true });
    try {
      console.log("Building graphbench...");
      runChecked("go", ["build", "-o", binary, "./cmd/graphbench"], ttscDir);

      console.log(
        `Benchmarking @ttsc/graph on ${path.relative(repoRoot, project) || project} (${tsconfig}), ${runs} run(s) + ${warmup} warmup\n`,
      );

      for (let i: number = 0; i < warmup; i++) measure();
      const samples: ISample[] = [];
      for (let i: number = 0; i < runs; i++) {
        const sample: ISample = measure();
        samples.push(sample);
        console.log(
          `  run ${i + 1}: load ${sample.loadMs.toFixed(0)}ms, build ${sample.buildMs.toFixed(0)}ms, ` +
            `${sample.nodes} nodes, ${sample.totalEdges} edges, coverage ${(sample.coverage * 100).toFixed(1)}%`,
        );
      }

      const first: ISample = samples[0]!;
      const report = {
        project: path.relative(repoRoot, project) || project,
        tsconfig,
        runs,
        sourceFiles: first.sourceFiles,
        nodes: first.nodes,
        externalNodes: first.externalNodes,
        edges: first.edges,
        totalEdges: first.totalEdges,
        symbolFiles: first.symbolFiles,
        coveredFiles: first.coveredFiles,
        coverage: first.coverage,
        loadMsMedian: TtscBenchmarkNumber.median(samples.map((s) => s.loadMs)),
        buildMsMedian: TtscBenchmarkNumber.median(
          samples.map((s) => s.buildMs),
        ),
        buildShareMedian: TtscBenchmarkNumber.median(
          samples.map((s) => s.buildShareOfLoad),
        ),
      };

      console.log("\nResult (counts deterministic; timings indicative):");
      console.log(`  source files:  ${report.sourceFiles}`);
      console.log(
        `  nodes:         ${report.nodes} (${report.externalNodes} external boundary leaves)`,
      );
      console.log(
        `  edges:         ${report.totalEdges} (heritage ${report.edges.heritage}, ` +
          `value-call ${report.edges["value-call"]}, type-ref ${report.edges["type-ref"]})`,
      );
      console.log(
        `  fair coverage: ${(report.coverage * 100).toFixed(1)}% ` +
          `(${report.coveredFiles}/${report.symbolFiles} symbol-bearing files cross-linked)`,
      );
      console.log(
        `  load time:     ${report.loadMsMedian.toFixed(0)} ms (median)`,
      );
      console.log(
        `  graph build:   ${report.buildMsMedian.toFixed(0)} ms (median), ` +
          `${(report.buildShareMedian * 100).toFixed(1)}% on top of the load it rides`,
      );

      const reportPath: string = path.join(
        workRoot,
        "graph",
        "structural",
        "report.json",
      );
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`\nReport: ${path.relative(repoRoot, reportPath)}`);
    } finally {
      fs.rmSync(runRoot, { recursive: true, force: true });
    }
  }

  function isSample(input: unknown): input is ISample {
    if (
      TtscBenchmarkObject.isRecord(input) === false ||
      TtscBenchmarkObject.isRecord(input.edges) === false
    )
      return false;
    return [
      input.sourceFiles,
      input.nodes,
      input.externalNodes,
      input.edges.heritage,
      input.edges["value-call"],
      input.edges["type-ref"],
      input.totalEdges,
      input.symbolFiles,
      input.coveredFiles,
      input.coverage,
      input.loadMs,
      input.buildMs,
      input.buildShareOfLoad,
    ].every((value: unknown) => typeof value === "number");
  }

  function parseArgs(argv: readonly string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const argument of argv) {
      const match: RegExpExecArray | null = /^--([^=]+)=(.*)$/.exec(argument);
      if (match !== null) out[match[1]!] = match[2]!;
    }
    return out;
  }

  function positiveInteger(value: string, label: string): number {
    const parsed: number = nonNegativeInteger(value, label);
    if (parsed === 0) throw new Error(`${label} must be greater than zero`);
    return parsed;
  }

  function nonNegativeInteger(value: string, label: string): number {
    const parsed: number = Number(value);
    if (Number.isInteger(parsed) === false || parsed < 0)
      throw new Error(`${label} must be a non-negative integer`);
    return parsed;
  }
}
