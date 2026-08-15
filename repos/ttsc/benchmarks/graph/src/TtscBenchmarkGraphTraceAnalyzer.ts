import fs from "node:fs";
import path from "node:path";

/**
 * Analyzes graph-benchmark trace navigation without scoring answer prose.
 *
 * The analyzer reports tool lanes, shell/source fallback, repeated queries,
 * output sizes, and token summaries from both supported agent stream formats.
 */
export namespace TtscBenchmarkGraphTraceAnalyzer {
  /**
   * Runs the trace-analysis CLI for the executable in the supplied directory.
   *
   * The directory marks the executable boundary while user-provided report,
   * trace, and output paths retain their legacy current-directory resolution.
   */
  export function main(entrypointDirectory: string): void {
    void entrypointDirectory;
    analyze();
  }

  function analyze(): void {
    type JsonRecord = Record<string, unknown>;
    type Lane = "graph" | "read" | "search" | "shell" | "other";

    interface ITraceCall {
      name: string;
      input: JsonRecord;
      output: unknown;
      status?: unknown;
      exitCode?: number | null;
    }

    interface ITraceIssue {
      kind: string;
      detail: string;
    }

    interface ITraceResult {
      calls: ITraceCall[];
      tokens: number;
      cached: number;
      reasoning: number;
      turns: number;
      messages: string[];
      types: Record<string, number>;
    }

    interface ICallCounts {
      graph: number;
      read: number;
      search: number;
      shell: number;
      other: number;
    }

    interface ILargestOutput {
      index: number;
      name: string;
      target: string;
      bytes: number;
      status?: unknown;
      exitCode?: number | null;
    }

    interface ITraceRun {
      run: number;
      tokens: number;
      cached: number;
      reasoning: number;
      turns: number;
      tools: number;
      counts: ICallCounts;
      outputBytes: number;
      largestOutputs: ILargestOutput[];
      messages: string[];
      types: Record<string, number>;
      sequence: string[];
      issues: ITraceIssue[];
      fallbacks: ITraceIssue[];
    }

    interface IArmSummary {
      runs: number;
      medianTokens: number;
      medianTools: number;
      medianOutputBytes: number;
      medianByLane: ICallCounts;
      misuseTally: Record<string, number>;
      cleanRuns: number;
    }

    function arg(name: string, fallback?: string): string | undefined {
      const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
      return hit ? hit.slice(name.length + 3) : fallback;
    }

    function isJsonRecord(value: unknown): value is JsonRecord {
      return (
        typeof value === "object" && value !== null && !Array.isArray(value)
      );
    }

    function asJsonRecord(value: unknown): JsonRecord | undefined {
      return isJsonRecord(value) ? value : undefined;
    }

    function stringValue(value: unknown): string | undefined {
      return typeof value === "string" ? value : undefined;
    }

    function numberValue(value: unknown): number {
      return typeof value === "number" ? value : 0;
    }

    function optionalNumberValue(value: unknown): number | null | undefined {
      return typeof value === "number" || value === null ? value : undefined;
    }

    const reportPath = arg("report");
    let traceDir = arg("trace-dir");
    if (!traceDir && reportPath) {
      const report: unknown = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      if (isJsonRecord(report) && typeof report.traceDir === "string") {
        traceDir = report.traceDir;
      }
    }
    if (!traceDir) {
      console.error(
        "analyze-traces.ts: --trace-dir=<dir> or --report=<path> required",
      );
      process.exit(2);
    }
    if (!fs.existsSync(traceDir)) {
      console.error(`analyze-traces.ts: trace dir not found: ${traceDir}`);
      process.exit(1);
    }

    const outPath = arg("out");
    const TS_SOURCE = /\.(ts|tsx|mts|cts)$/i;
    const SHELL_SEARCH = /\b(grep|rg|ag|find|sed|awk|Select-String)\b/i;
    const SHELL_READ_TS =
      /\b(cat|head|tail|type|Get-Content|gc)\b[^|]*\.[cm]?tsx?\b/i;

    function laneOf(name: string): Lane {
      if (/graph|ttsc/i.test(name)) return "graph";
      if (name === "Read") return "read";
      if (name === "Grep" || name === "Glob") return "search";
      if (name === "Bash" || name === "PowerShell" || name === "Shell")
        return "shell";
      return "other";
    }

    function parseTrace(text: string): ITraceResult {
      const calls: ITraceCall[] = [];
      let tokens = 0;
      let cached = 0;
      let reasoning = 0;
      let turns = 0;
      const messages: string[] = [];
      const types: Record<string, number> = {};

      for (const raw of text.split("\n")) {
        if (!raw.trim()) continue;
        let decoded: unknown;
        try {
          decoded = JSON.parse(raw);
        } catch {
          continue;
        }
        if (!isJsonRecord(decoded)) continue;
        const event = decoded;
        const eventType = stringValue(event.type) ?? "?";
        types[eventType] = (types[eventType] ?? 0) + 1;

        if (eventType === "turn.completed") {
          const usage = asJsonRecord(event.usage);
          tokens +=
            numberValue(usage?.input_tokens) +
            numberValue(usage?.output_tokens);
          cached += numberValue(usage?.cached_input_tokens);
          reasoning += numberValue(usage?.reasoning_output_tokens);
          turns++;
          continue;
        }

        if (eventType === "item.completed") {
          const item = asJsonRecord(event.item) ?? {};
          const itemType = stringValue(item.type) ?? "?";
          types[`item:${itemType}`] = (types[`item:${itemType}`] ?? 0) + 1;
          if (itemType === "agent_message") {
            if (typeof item.text === "string" && item.text.trim()) {
              messages.push(item.text);
            }
            continue;
          }
          if (itemType === "command_execution") {
            calls.push({
              name: "Shell",
              input: { command: stringValue(item.command) ?? "" },
              output: item.aggregated_output ?? "",
              exitCode: optionalNumberValue(item.exit_code),
              status: item.status,
            });
            continue;
          }
          if (itemType === "mcp_tool_call") {
            calls.push({
              name: mcpCallName(item),
              input:
                asJsonRecord(item.arguments) ?? asJsonRecord(item.input) ?? {},
              output: mcpOutput(item),
              status: item.status,
            });
            continue;
          }
        }

        if (eventType !== "assistant") continue;
        const message = asJsonRecord(event.message);
        const usage = asJsonRecord(message?.usage);
        if (usage) {
          tokens +=
            numberValue(usage.input_tokens) +
            numberValue(usage.output_tokens) +
            numberValue(usage.cache_read_input_tokens) +
            numberValue(usage.cache_creation_input_tokens);
        }
        const textBlocks: string[] = [];
        const content = Array.isArray(message?.content) ? message.content : [];
        for (const value of content) {
          const block = asJsonRecord(value);
          if (!block) continue;
          if (block.type === "text" && typeof block.text === "string") {
            textBlocks.push(block.text);
            continue;
          }
          if (block.type !== "tool_use" || block.name === "ToolSearch")
            continue;
          if (typeof block.name !== "string") continue;
          calls.push({
            name: block.name,
            input: asJsonRecord(block.input) ?? {},
            output: "",
          });
        }
        if (textBlocks.length) messages.push(textBlocks.join("\n"));
      }

      return { calls, tokens, cached, reasoning, turns, messages, types };
    }

    function mcpCallName(item: JsonRecord): string {
      const server =
        stringValue(item.server) ?? stringValue(item.server_name) ?? "";
      const tool =
        stringValue(item.tool_name) ??
        stringValue(item.tool) ??
        stringValue(item.name) ??
        "";
      if (server && tool) return `${server}.${tool}`;
      return (
        stringValue(item.name) ??
        stringValue(item.tool_name) ??
        stringValue(item.toolName) ??
        stringValue(item.tool) ??
        stringValue(item.identifier) ??
        "mcp_tool_call"
      );
    }

    function mcpOutput(item: JsonRecord): unknown {
      const value =
        item.result ?? item.output ?? item.content ?? item.error ?? "";
      return typeof value === "string" ? value : JSON.stringify(value);
    }

    function targetOf(call: ITraceCall): string {
      const input = call.input;
      if (call.name === "Read") return stringValue(input.file_path) ?? "";
      if (call.name === "Grep" || call.name === "Glob")
        return stringValue(input.pattern) ?? stringValue(input.query) ?? "";
      if (
        call.name === "Bash" ||
        call.name === "PowerShell" ||
        call.name === "Shell"
      )
        return (stringValue(input.command) ?? "").slice(0, 120);
      if (/lookup|query|index/i.test(call.name))
        return stringValue(input.query) ?? stringValue(input.question) ?? "";
      if (/trace/i.test(call.name))
        return `${stringValue(input.from) ?? ""}${
          stringValue(input.to) ? ` -> ${stringValue(input.to)}` : ""
        }`;
      if (/details|expand/i.test(call.name))
        return `[${Array.isArray(input.handles) ? input.handles.length : 0} handle(s)]`;
      return "";
    }

    function outputSize(call: ITraceCall): number {
      const out = call.output ?? "";
      return typeof out === "string"
        ? out.length
        : (JSON.stringify(out)?.length ?? 0);
    }

    function misuseOf(calls: ITraceCall[]): {
      issues: ITraceIssue[];
      fallbacks: ITraceIssue[];
    } {
      const issues: ITraceIssue[] = [];
      const fallbacks: ITraceIssue[] = [];
      const graphCalls = calls.filter((call) => laneOf(call.name) === "graph");

      for (const call of calls) {
        const lane = laneOf(call.name);
        const command = stringValue(call.input.command) ?? "";
        if (lane === "read") {
          if (TS_SOURCE.test(stringValue(call.input.file_path) ?? ""))
            issues.push({
              kind: "read TS source by hand",
              detail: targetOf(call),
            });
          else
            fallbacks.push({
              kind: "read non-TS file",
              detail: targetOf(call),
            });
        } else if (lane === "search") {
          issues.push({
            kind: "searched with Grep/Glob",
            detail: targetOf(call),
          });
        } else if (lane === "shell") {
          if (SHELL_SEARCH.test(command) || SHELL_READ_TS.test(command))
            issues.push({
              kind: "read/searched source via shell",
              detail: targetOf(call),
            });
          else fallbacks.push({ kind: "shell", detail: targetOf(call) });
          if (call.exitCode && call.exitCode !== 0)
            issues.push({ kind: "failed shell probe", detail: targetOf(call) });
        }
      }

      const details = graphCalls.filter((call) =>
        /details|expand/i.test(call.name),
      );
      if (details.length > 1)
        issues.push({
          kind: "unbatched graph details",
          detail: `${details.length} calls; batch handles into one`,
        });

      const queries = graphCalls
        .filter((call) => /lookup|query/i.test(call.name))
        .map((call) =>
          (
            stringValue(call.input.query) ??
            stringValue(call.input.question) ??
            ""
          )
            .trim()
            .toLowerCase(),
        );
      const dupes = queries.filter(
        (query, index) => query && queries.indexOf(query) !== index,
      );
      for (const query of new Set(dupes))
        issues.push({ kind: "repeated graph query", detail: query });

      if (graphCalls.length === 0)
        issues.push({
          kind: "answered without the graph",
          detail: "0 graph calls",
        });

      return { issues, fallbacks };
    }

    const files = fs
      .readdirSync(traceDir)
      .filter((file) => file.endsWith(".stream.jsonl"));

    const byArm: Record<string, ITraceRun[]> = {};
    for (const file of files) {
      const match = /^(.*)-run-(\d+)\.stream\.jsonl$/.exec(file);
      if (!match) continue;
      const arm = match[1];
      const run = match[2];
      if (arm === undefined || run === undefined) continue;
      const parsed = parseTrace(
        fs.readFileSync(path.join(traceDir, file), "utf8"),
      );
      const counts: ICallCounts = {
        graph: 0,
        read: 0,
        search: 0,
        shell: 0,
        other: 0,
      };
      for (const call of parsed.calls) counts[laneOf(call.name)]++;
      const outputBytes = parsed.calls.reduce(
        (sum, call) => sum + outputSize(call),
        0,
      );
      const largestOutputs = parsed.calls
        .map((call, index) => ({
          index: index + 1,
          name: call.name,
          target: targetOf(call),
          bytes: outputSize(call),
          status: call.status,
          exitCode: call.exitCode,
        }))
        .filter((call) => call.bytes > 0)
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 5);
      const { issues, fallbacks } =
        arm === "graph"
          ? misuseOf(parsed.calls)
          : { issues: [], fallbacks: [] };
      (byArm[arm] ??= []).push({
        run: Number(run),
        tokens: parsed.tokens,
        cached: parsed.cached,
        reasoning: parsed.reasoning,
        turns: parsed.turns,
        tools: parsed.calls.length,
        counts,
        outputBytes,
        largestOutputs,
        messages: parsed.messages.slice(-6),
        types: parsed.types,
        sequence: parsed.calls.map((call) => `${call.name}(${targetOf(call)})`),
        issues,
        fallbacks,
      });
    }

    function median(values: number[]): number {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const upper = sorted[mid] ?? 0;
      const lower = sorted[mid - 1] ?? 0;
      return sorted.length % 2 ? upper : (lower + upper) / 2;
    }

    console.log(`Trace analysis: ${traceDir}\n`);
    const summary: Record<string, IArmSummary> = {};
    for (const [arm, runs] of Object.entries(byArm)) {
      const medLanes: ICallCounts = {
        graph: median(runs.map((run) => run.counts.graph)),
        read: median(runs.map((run) => run.counts.read)),
        search: median(runs.map((run) => run.counts.search)),
        shell: median(runs.map((run) => run.counts.shell)),
        other: median(runs.map((run) => run.counts.other)),
      };
      const issues = runs.flatMap((run) => run.issues);
      const issueTally: Record<string, number> = {};
      for (const issue of issues)
        issueTally[issue.kind] = (issueTally[issue.kind] ?? 0) + 1;
      const runsWithMisuse = runs.filter((run) => run.issues.length).length;

      const armSummary: IArmSummary = {
        runs: runs.length,
        medianTokens: median(runs.map((run) => run.tokens)),
        medianTools: median(runs.map((run) => run.tools)),
        medianOutputBytes: median(runs.map((run) => run.outputBytes)),
        medianByLane: medLanes,
        misuseTally: issueTally,
        cleanRuns: runs.length - runsWithMisuse,
      };
      summary[arm] = armSummary;

      console.log(`[${arm}]  ${runs.length} run(s)`);
      console.log(
        `  median tokens ${armSummary.medianTokens}   tools ${armSummary.medianTools}` +
          `   output ${armSummary.medianOutputBytes} bytes` +
          `   (graph ${medLanes.graph}, read ${medLanes.read}, search ${medLanes.search}, shell ${medLanes.shell})`,
      );

      if (arm === "graph") {
        console.log(
          `  tool discipline: ${runs.length - runsWithMisuse}/${runs.length} runs clean`,
        );
        for (const [kind, count] of Object.entries(issueTally))
          console.log(`    ${count}x ${kind}`);
        for (const run of runs.filter((item) => item.issues.length)) {
          console.log(`    run ${run.run}:`);
          for (const issue of run.issues)
            console.log(
              `      - ${issue.kind}${issue.detail ? `: ${issue.detail}` : ""}`,
            );
        }
      }
      console.log("");
    }

    if (reportPath || arg("token-headline")) {
      const baseline = summary.baseline?.medianTokens ?? 0;
      const graph = summary.graph?.medianTokens ?? 0;
      if (baseline && graph)
        console.log(
          `Token reduction (graph vs baseline): ${Math.round((1 - graph / baseline) * 100)}%  (${baseline} -> ${graph})\n`,
        );
    }

    if (outPath) {
      fs.writeFileSync(
        path.resolve(outPath),
        `${JSON.stringify({ traceDir, arms: summary, runs: byArm }, null, 2)}\n`,
      );
      console.log(`analysis written: ${outPath}`);
    }
  }
}
