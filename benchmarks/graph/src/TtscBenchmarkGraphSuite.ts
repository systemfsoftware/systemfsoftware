import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { TtscBenchmarkConstant } from "./TtscBenchmarkConstant.ts";
import { TtscBenchmarkGraph } from "./TtscBenchmarkGraph.ts";
import { TtscBenchmarkGraphWebsiteCell } from "./TtscBenchmarkGraphWebsiteCell.ts";
import { TtscBenchmarkNumber } from "./TtscBenchmarkNumber.ts";
import type { ITtscBenchmarkGraphProject } from "./structures/ITtscBenchmarkGraphProject.ts";
import type { ITtscBenchmarkGraphPrompt } from "./structures/ITtscBenchmarkGraphPrompt.ts";
import { ITtscBenchmarkGraphWebsiteAgentCell } from "./structures/ITtscBenchmarkGraphWebsiteAgentCell.ts";

/**
 * Executes the fixed-baseline graph-agent suite and publishes its measurements.
 *
 * The suite keeps the no-MCP baseline stable across graph iterations: baseline
 * runs populate the cache, while graph runs compare one new sample per prompt
 * against that cache. Entrypoint-relative child scripts remain supplied by the
 * export-free executable so importing this module never starts a benchmark.
 */
export namespace TtscBenchmarkGraphSuite {
  interface IPublishedSample {
    tokens: number;
    cached?: number;
    reasoning?: number;
    tokensWithReasoning?: number;
    turns?: number;
    tools?: number;
    reads?: number;
    grep?: number;
    shell?: number;
    web?: number;
    graph?: number;
    other?: number;
    sourceTouches?: number;
    shellSource?: number;
    cost?: number;
    durMs?: number;
    run?: number;
    attempts?: number;
  }

  interface IBenchmarkSamples {
    baseline: IPublishedSample[];
    graph: IPublishedSample[];
  }

  interface IPromptResult {
    exitCode: number | null;
    prompt: ITtscBenchmarkGraphPrompt;
    report: string;
    samples: IPublishedSample[];
  }

  interface IStoredWebsiteAgentCell extends ITtscBenchmarkGraphWebsiteAgentCell {
    [key: string]: unknown;
    samples?: IBenchmarkSamples;
  }

  interface IWebsiteDocument {
    [key: string]: unknown;
    schemaVersion: number;
    generatedAt: string;
    structural: unknown;
    agent: {
      cells: IStoredWebsiteAgentCell[];
    };
    index?: unknown;
  }

  interface ISuiteRow {
    id: string;
    b: number;
    g: number;
    red: number | null;
    graphCalls: number;
    shellCalls: number;
    toolCalls: number;
  }

  /**
   * Runs the graph suite for the command-line arguments in the current process.
   *
   * `entrypointDirectory` must be the directory containing the export-free
   * graph suite executable and its sibling agent harnesses. Keeping this path
   * explicit preserves child-process resolution when the reusable module moves
   * elsewhere.
   *
   * @param entrypointDirectory Absolute directory of the suite executable.
   */
  export async function main(entrypointDirectory: string): Promise<void> {
    const repoRoot = TtscBenchmarkConstant.REPOSITORY_ROOT;
    const workDir = TtscBenchmarkGraph.resolveWorkDir(repoRoot);
    const projectSpecs: Readonly<Record<string, ITtscBenchmarkGraphProject>> =
      TtscBenchmarkGraph.PROJECTS;
    const websiteJson = path.join(
      repoRoot,
      "website",
      "public",
      "benchmark",
      "graph.json",
    );
    const graphBenchmarkScript = path.resolve(entrypointDirectory, "index.ts");
    const PUBLISHED_SAMPLE_KEYS = [
      "tokens",
      "cached",
      "reasoning",
      "tokensWithReasoning",
      "turns",
      "tools",
      "reads",
      "grep",
      "shell",
      "web",
      "graph",
      "other",
      "sourceTouches",
      "shellSource",
      "cost",
      "durMs",
      "run",
      "attempts",
    ] as const satisfies readonly (keyof IPublishedSample)[];

    function arg(name: string): string | undefined;
    function arg(name: string, fallback: string): string;
    function arg(name: string, fallback?: string): string | undefined {
      const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
      return hit ? hit.slice(name.length + 3) : fallback;
    }

    const noWebsite = process.argv.includes("--no-website");
    const publishSuitePath = arg("publish-suite");
    if (publishSuitePath) {
      publishWebsiteReports(reportsFromSuite(path.resolve(publishSuitePath)));
      process.exit(0);
    }

    const armArgument = arg("arm");
    if (armArgument !== "baseline" && armArgument !== "graph")
      throw new Error("--arm=baseline | graph is required");
    const arm: "baseline" | "graph" = armArgument;
    const harness = arg("harness", "codex");
    const model = arg("model", harness === "codex" ? "gpt-5.4-mini" : "sonnet");
    const runs = TtscBenchmarkNumber.parsePositive(
      arg("runs", arm === "baseline" ? "5" : "1"),
      "--runs",
    );
    const maxRunRetries = arg(
      "max-run-retries",
      arm === "baseline" ? "4" : "0",
    );
    const family = arg("family", "dedicated");
    const outer = TtscBenchmarkNumber.parsePositive(
      arg("concurrency", "4"),
      "--concurrency",
    );
    const inner = TtscBenchmarkNumber.parsePositive(
      arg("inner-concurrency", String(runs)),
      "--inner-concurrency",
    );
    const storePath = path.resolve(
      arg(
        "baseline-store",
        path.join(
          TtscBenchmarkConstant.WORK_ROOT,
          "graph",
          `baselines-${harness}.json`,
        ),
      ),
    );
    const outPath = arg("out");
    const setup = !process.argv.includes("--no-setup");

    const harnessScript = path.resolve(
      entrypointDirectory,
      harness === "codex" ? "agent-ab-codex.ts" : "agent-ab.ts",
    );
    const manifest = parsePromptManifest(
      parseJsonFile(
        path.join(TtscBenchmarkConstant.QUESTIONS_ROOT, "manifest.json"),
      ),
    );
    // --repo limits the suite to a subset (comma-separated) for validation or for
    // targeting one project; default is every project in the family.
    const repoFilter = arg("repo");
    const repoSet = repoFilter ? new Set(repoFilter.split(",")) : null;
    const prompts = (manifest.prompts ?? []).filter(
      (p) =>
        (family === "all" || p.family === family) &&
        (!repoSet || repoSet.has(p.repo)),
    );
    if (prompts.length === 0)
      throw new Error(`no prompts for family ${family}`);

    ensureFixtures(prompts);

    function fixtureOf(prompt: ITtscBenchmarkGraphPrompt): string {
      const spec = projectSpecs[prompt.repo];
      if (!spec) throw new Error(`unknown repo ${prompt.repo}`);
      const branch = prompt.fixtureBranch ?? spec.sourceBranch;
      if (branch !== spec.sourceBranch) {
        throw new Error(
          `prompt ${prompt.id} requests fixture branch ${branch}; graph suite requires ${spec.sourceBranch}`,
        );
      }
      return TtscBenchmarkGraph.projectDir(workDir, spec);
    }

    function ensureFixtures(
      selectedPrompts: readonly ITtscBenchmarkGraphPrompt[],
    ): void {
      const repositories = [
        ...new Set(selectedPrompts.map((prompt) => prompt.repo)),
      ];
      if (setup) {
        runFixtureSetup(repositories);
      } else {
        const missing = selectedPrompts
          .map((prompt) => [prompt.id, fixtureOf(prompt)] as const)
          .filter(([, dir]) => !fs.existsSync(dir));
        if (missing.length !== 0)
          throw new Error(
            `missing prepared graph fixtures: ${missing
              .map(([id, dir]) => `${id} at ${dir}`)
              .join(", ")}`,
          );
      }
      const stillMissing = selectedPrompts
        .map((prompt) => [prompt.id, fixtureOf(prompt)] as const)
        .filter(([, dir]) => !fs.existsSync(dir));
      if (stillMissing.length !== 0) {
        throw new Error(
          `graph fixture setup did not create: ${stillMissing
            .map(([id, dir]) => `${id} at ${dir}`)
            .join(", ")}`,
        );
      }
    }

    function runFixtureSetup(repos: readonly string[]): void {
      const args = TtscBenchmarkConstant.nodeTypeScriptArguments(
        graphBenchmarkScript,
        [
          "--setup-only",
          `--project=${repos.join(",")}`,
          "--tools=ttsc-graph",
          `--models=${model}`,
        ],
      );
      const result = cp.spawnSync(process.execPath, args, {
        cwd: repoRoot,
        env: process.env,
        encoding: "utf8",
        windowsHide: true,
      });
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(
          `graph fixture setup failed (${result.status})\n${result.stdout ?? ""}${result.stderr ?? ""}`,
        );
    }

    const tmpDir = path.join(
      TtscBenchmarkConstant.WORK_ROOT,
      "graph",
      "suite-tmp",
    );
    fs.mkdirSync(tmpDir, { recursive: true });

    const median = (xs: readonly number[]): number => {
      if (!xs.length) return 0;
      const s = [...xs].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
    };

    const mean = (xs: readonly number[]): number =>
      xs.length === 0
        ? 0
        : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

    /**
     * Run one prompt through the harness for the selected arm; return its
     * samples.
     */
    function runPrompt(
      prompt: ITtscBenchmarkGraphPrompt,
    ): Promise<IPromptResult> {
      return new Promise<IPromptResult>((resolve) => {
        const report = path.join(
          tmpDir,
          `${harness}-${model}-${prompt.id}-${arm}.json`,
        );
        const childOut = path.join(
          tmpDir,
          `${harness}-${model}-${prompt.id}-${arm}.child.out.log`,
        );
        const childErr = path.join(
          tmpDir,
          `${harness}-${model}-${prompt.id}-${arm}.child.err.log`,
        );
        fs.rmSync(report, { force: true });
        fs.rmSync(childOut, { force: true });
        fs.rmSync(childErr, { force: true });
        const dir = fixtureOf(prompt);
        if (!dir || !fs.existsSync(dir))
          throw new Error(
            `missing prepared graph fixture for ${prompt.id}: ${dir}`,
          );
        const childArgs = TtscBenchmarkConstant.nodeTypeScriptArguments(
          harnessScript,
          [
            `--prompt-id=${prompt.id}`,
            `--arm=${arm}`,
            `--runs=${runs}`,
            `--model=${model}`,
            `--max-run-retries=${maxRunRetries}`,
            `--repo-dir=${dir}`,
            `--report=${report}`,
          ],
        );
        const child = cp.spawn(process.execPath, childArgs, {
          cwd: repoRoot,
          env: { ...process.env, TTSC_BENCH_CONCURRENCY: String(inner) },
          windowsHide: true,
        });
        let out = "";
        let err = "";
        child.stdout?.on("data", (data: Buffer | string) => (out += data));
        child.stderr?.on("data", (data: Buffer | string) => (err += data));
        child.on("close", (code) => {
          if (out) fs.writeFileSync(childOut, out);
          if (err) fs.writeFileSync(childErr, err);
          let samples: IPublishedSample[] = [];
          try {
            samples = samplesForArm(parseJsonFile(report), arm);
          } catch {
            /* report missing — child crashed */
          }
          const toks = samples.map((s) => s.tokens);
          console.log(
            `  ${prompt.id.padEnd(32)} ${arm}  ${samples.length}/${runs} ok  median ${median(toks)} tok` +
              (code === 0 ? "" : `  [exit ${code}]`) +
              (samples.length === 0 && err
                ? `  ${err.trim().split("\n").slice(-2).join(" | ")}`
                : ""),
          );
          resolve({ exitCode: code, prompt, report, samples });
        });
      });
    }

    /** Run all prompts with at most `outer` in flight. */
    async function fanOut<T, R>(
      items: readonly T[],
      fn: (item: T) => Promise<R>,
    ): Promise<R[]> {
      const results: R[] = [];
      let next = 0;
      const lanes = Array.from(
        { length: Math.max(1, Math.min(outer, items.length)) },
        async () => {
          while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i]!);
          }
        },
      );
      await Promise.all(lanes);
      return results;
    }

    console.log(
      `\nsuite: ${harness}/${model}  arm=${arm}  runs=${runs}  family=${family}  ${prompts.length} prompt(s)  concurrency=${outer}\n`,
    );

    const results = await fanOut(prompts, runPrompt);
    const incomplete = results.filter(
      (result) => result.exitCode !== 0 || result.samples.length !== runs,
    );
    if (incomplete.length !== 0) {
      throw new Error(
        `graph suite has incomplete cells: ${incomplete
          .map(
            (result) =>
              `${result.prompt.id} (${result.samples.length}/${runs}, exit ${result.exitCode ?? "signal"})`,
          )
          .join(", ")}`,
      );
    }
    publishWebsiteReports(results.map((result) => result.report));

    if (arm === "baseline") {
      const store = fs.existsSync(storePath)
        ? recordOrEmpty(parseJsonFile(storePath))
        : {};
      for (const { prompt, samples } of results) {
        if (!samples.length) continue;
        const toks = samples.map((s) => s.tokens);
        store[`${model}/${prompt.id}`] = {
          harness,
          model,
          repo: prompt.repo,
          promptId: prompt.id,
          runs: samples.length,
          medianTokens: median(toks),
          medianTools: median(samples.map((s) => s.tools ?? 0)),
          medianShell: median(samples.map((s) => s.shell ?? 0)),
          medianGraph: median(samples.map((s) => s.graph ?? 0)),
          tokens: toks,
        };
      }
      fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`);
      console.log(`\nbaseline cached -> ${storePath}`);
    } else {
      const store = fs.existsSync(storePath)
        ? recordOrEmpty(parseJsonFile(storePath))
        : {};
      console.log(
        `\n${"prompt".padEnd(32)} baseline -> graph  reduction  tools`,
      );
      const rows: ISuiteRow[] = [];
      for (const { prompt, samples } of results) {
        if (!samples.length) continue;
        const g = median(samples.map((s) => s.tokens));
        const graphCalls = median(samples.map((s) => s.graph ?? 0));
        const shellCalls = median(samples.map((s) => s.shell ?? 0));
        const toolCalls = median(samples.map((s) => s.tools ?? 0));
        const base = store[`${model}/${prompt.id}`];
        const b = storedMedianTokens(base);
        const red = b ? Math.round((1 - g / b) * 100) : null;
        rows.push({
          id: prompt.id,
          b,
          g,
          red,
          graphCalls,
          shellCalls,
          toolCalls,
        });
        console.log(
          `  ${prompt.id.padEnd(32)} ${b || "?"} -> ${g}  ${red === null ? "(no baseline)" : red + "%"}` +
            `  graph ${graphCalls} shell ${shellCalls} tools ${toolCalls}`,
        );
      }
      const reds = rows
        .map((row) => row.red)
        .filter((red): red is number => red !== null);
      if (reds.length)
        console.log(
          `\naverage token reduction across ${reds.length} prompt(s): ${mean(reds)}%`,
        );
      if (outPath) {
        const cells = results.map(({ prompt, report }) => ({
          harness,
          model,
          arm,
          repo: prompt.repo,
          promptId: prompt.id,
          promptFamily: prompt.family,
          report,
        }));
        fs.writeFileSync(
          path.resolve(outPath),
          `${JSON.stringify({ harness, model, arm, runs, maxRunRetries, family, cells, rows }, null, 2)}\n`,
        );
      }
    }

    function reportsFromSuite(file: string): string[] {
      const suite = parseJsonFile(file);
      if (!isRecord(suite) || !Array.isArray(suite.cells)) return [];
      const base = path.dirname(file);
      return suite.cells
        .filter(isRecord)
        .map((cell) => cell.report)
        .filter((report): report is string => typeof report === "string")
        .map((report) =>
          path.isAbsolute(report) ? report : path.resolve(base, report),
        );
    }

    function publishWebsiteReports(reports: readonly string[]): void {
      if (noWebsite) return;
      const cells = reports
        .filter((report) => fs.existsSync(report))
        .map((report) => websiteCellFromReport(parseJsonFile(report)))
        .filter((cell): cell is IStoredWebsiteAgentCell => cell !== null);
      if (cells.length === 0) return;
      const prior = fs.existsSync(websiteJson)
        ? parseJsonFile(websiteJson)
        : null;
      const out: IWebsiteDocument = {
        ...(isRecord(prior) ? prior : {}),
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        structural: isRecord(prior) ? (prior.structural ?? null) : null,
        agent: { cells: storedWebsiteCells(prior) },
      };
      for (const cell of cells) {
        const key = TtscBenchmarkGraphWebsiteCell.key(cell);
        const at = out.agent.cells.findIndex(
          (old) => TtscBenchmarkGraphWebsiteCell.key(old) === key,
        );
        if (at >= 0) {
          const existing = out.agent.cells[at]!;
          const existingBaseline = existing.samples?.baseline.length ?? 0;
          const existingGraph = existing.samples?.graph.length ?? 0;
          const nextBaseline = cell.samples?.baseline.length ?? 0;
          const nextGraph = cell.samples?.graph.length ?? 0;
          if (nextBaseline < existingBaseline || nextGraph < existingGraph) {
            console.warn(
              `skip thinner agent cell: ${cell.tool ?? "ttsc-graph"} / ${
                cell.repo
              } / ${cell.modelVersion ?? cell.model} / ${
                cell.promptFamily ?? "project-specific"
              } (${nextBaseline}/${nextGraph} < ${existingBaseline}/${existingGraph})`,
            );
            continue;
          }
          out.agent.cells[at] = { ...existing, ...cell };
        } else out.agent.cells.push(cell);
      }
      fs.mkdirSync(path.dirname(websiteJson), { recursive: true });
      fs.writeFileSync(websiteJson, `${JSON.stringify(out)}\n`);
      console.log(
        `website: upserted ${cells.length} cell(s) -> ${path.relative(repoRoot, websiteJson)}`,
      );
    }

    function websiteCellFromReport(
      data: unknown,
    ): IStoredWebsiteAgentCell | null {
      if (!isRecord(data)) return null;
      const rawModel = stringValue(data.model) ?? "unknown";
      const resolvedModel = stringValue(data.modelVersion) ?? rawModel;
      const tool = reportTool(data);
      const samples = sanitizeSamples(data.samples);
      if (samples.baseline.length === 0 && samples.graph.length === 0)
        return null;
      const model = agentLabel(resolvedModel);
      const version = modelVersionId(resolvedModel) ?? modelVersionId(rawModel);
      const effort = stringValue(data.effort);
      const promptId = stringValue(data.promptId);
      const promptFamily = stringValue(data.promptFamily);
      const questionSha256 = stringValue(data.questionSha256);
      const fixtureBranch = stringValue(data.fixtureBranch);
      const harness = ITtscBenchmarkGraphWebsiteAgentCell.parseHarness(
        stringValue(data.harness) ??
          (resolvedModel.startsWith("gpt-") ? "codex" : "claude-code"),
      );
      const websiteTool = ITtscBenchmarkGraphWebsiteAgentCell.parseTool(tool);
      const websiteRepo = ITtscBenchmarkGraphWebsiteAgentCell.parseRepo(
        stringValue(data.repo) ?? "",
      );
      const websitePromptFamily =
        promptFamily === undefined
          ? undefined
          : ITtscBenchmarkGraphWebsiteAgentCell.parsePromptFamily(promptFamily);
      return {
        harness,
        tool: websiteTool,
        repo: websiteRepo,
        model,
        ...(version ? { modelVersion: version } : {}),
        ...(effort ? { effort } : {}),
        ...(promptId ? { promptId } : {}),
        ...(websitePromptFamily ? { promptFamily: websitePromptFamily } : {}),
        ...(questionSha256 ? { questionSha256 } : {}),
        ...(fixtureBranch ? { fixtureBranch } : {}),
        daemon: data.daemon === true,
        runs: data.runs,
        question: data.question,
        samples,
      };
    }

    function reportTool(data: Record<string, unknown>): string {
      const samples = isRecord(data.samples) ? data.samples : {};
      const baseline = Array.isArray(samples.baseline) ? samples.baseline : [];
      const graph = Array.isArray(samples.graph) ? samples.graph : [];
      return baseline.length > 0 && graph.length === 0
        ? "baseline"
        : (stringValue(data.tool) ?? "ttsc-graph");
    }

    function agentLabel(resolvedModel: string): string {
      if (
        resolvedModel === "sonnet" ||
        resolvedModel.startsWith("claude-sonnet-")
      )
        return "claude-code-sonnet";
      if (resolvedModel === "opus" || resolvedModel.startsWith("claude-opus-"))
        return "claude-code-opus";
      if (!resolvedModel.startsWith("gpt-"))
        return `claude-code-${resolvedModel}`;
      const tier = resolvedModel
        .split("-")
        .filter((token) => token && !/^[0-9.]+$/.test(token))
        .join("-");
      return `codex-${tier}`;
    }

    function modelVersionId(resolvedModel: string): string | undefined {
      if (
        resolvedModel.startsWith("claude-") ||
        resolvedModel.startsWith("gpt-")
      )
        return resolvedModel;
      return undefined;
    }

    function sanitizeSamples(samples: unknown): IBenchmarkSamples {
      const source = isRecord(samples) ? samples : {};
      return {
        baseline: (Array.isArray(source.baseline) ? source.baseline : [])
          .filter(validMeasuredSample)
          .map(sanitizeSample),
        graph: (Array.isArray(source.graph) ? source.graph : [])
          .filter(validMeasuredSample)
          .map(sanitizeSample),
      };
    }

    function validMeasuredSample(sample: unknown): sample is IPublishedSample {
      if (
        !isRecord(sample) ||
        !(Number(sample.tokens ?? 0) > 0) ||
        sample.ok === false
      )
        return false;
      return PUBLISHED_SAMPLE_KEYS.every(
        (key) => sample[key] === undefined || typeof sample[key] === "number",
      );
    }

    function sanitizeSample(sample: IPublishedSample): IPublishedSample {
      const out: Partial<Record<keyof IPublishedSample, number>> = {};
      for (const key of PUBLISHED_SAMPLE_KEYS) {
        if (sample[key] !== undefined) out[key] = sample[key];
      }
      return { ...out, tokens: sample.tokens };
    }

    function samplesForArm(
      report: unknown,
      selectedArm: "baseline" | "graph",
    ): IPublishedSample[] {
      if (!isRecord(report) || !isRecord(report.samples)) return [];
      const samples = report.samples[selectedArm];
      return Array.isArray(samples) ? samples.filter(validMeasuredSample) : [];
    }

    function parseJsonFile(file: string): unknown {
      return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    }

    function parsePromptManifest(
      data: unknown,
    ): ITtscBenchmarkGraphPrompt.IManifest {
      if (
        !isRecord(data) ||
        data.schemaVersion !== 1 ||
        !Array.isArray(data.prompts) ||
        !data.prompts.every(isGraphBenchmarkPrompt)
      ) {
        throw new Error("invalid graph benchmark prompt manifest");
      }
      return {
        schemaVersion: 1,
        prompts: data.prompts,
      };
    }

    function isGraphBenchmarkPrompt(
      prompt: unknown,
    ): prompt is ITtscBenchmarkGraphPrompt {
      return (
        isRecord(prompt) &&
        typeof prompt.id === "string" &&
        typeof prompt.repo === "string" &&
        (prompt.family === "common" || prompt.family === "dedicated") &&
        typeof prompt.file === "string" &&
        (prompt.fixtureBranch === undefined ||
          prompt.fixtureBranch === "graph") &&
        typeof prompt.tsconfig === "string" &&
        typeof prompt.questionSha256 === "string"
      );
    }

    function storedWebsiteCells(data: unknown): IStoredWebsiteAgentCell[] {
      if (data === null) return [];
      if (
        !isRecord(data) ||
        !isRecord(data.agent) ||
        !Array.isArray(data.agent.cells) ||
        !data.agent.cells.every(isStoredWebsiteAgentCell)
      )
        throw new TypeError(`invalid graph website report: ${websiteJson}`);
      return data.agent.cells;
    }

    function isStoredWebsiteAgentCell(
      cell: unknown,
    ): cell is IStoredWebsiteAgentCell {
      return (
        isRecord(cell) &&
        typeof cell.harness === "string" &&
        ITtscBenchmarkGraphWebsiteAgentCell.isHarness(cell.harness) &&
        typeof cell.repo === "string" &&
        ITtscBenchmarkGraphWebsiteAgentCell.isRepo(cell.repo) &&
        typeof cell.model === "string" &&
        (cell.tool === undefined ||
          (typeof cell.tool === "string" &&
            ITtscBenchmarkGraphWebsiteAgentCell.isTool(cell.tool))) &&
        (cell.promptId === undefined || typeof cell.promptId === "string") &&
        (cell.promptFamily === undefined ||
          (typeof cell.promptFamily === "string" &&
            ITtscBenchmarkGraphWebsiteAgentCell.isPromptFamily(
              cell.promptFamily,
            ))) &&
        (cell.daemon === undefined || typeof cell.daemon === "boolean")
      );
    }

    function storedMedianTokens(value: unknown): number {
      return isRecord(value) && typeof value.medianTokens === "number"
        ? value.medianTokens
        : 0;
    }

    function stringValue(value: unknown): string | undefined {
      return typeof value === "string" ? value : undefined;
    }

    function recordOrEmpty(value: unknown): Record<string, unknown> {
      return isRecord(value) ? value : {};
    }

    function isRecord(value: unknown): value is Record<string, unknown> {
      return (
        typeof value === "object" && value !== null && !Array.isArray(value)
      );
    }
  }
}
