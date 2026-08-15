/** Observable result of one baseline or graph-agent benchmark attempt. */
export interface ITtscBenchmarkAgentSample {
  /** Total provider tokens charged to the completed sample. */
  tokens: number;

  /** Cached input tokens reported across completed turns. */
  cached?: number;

  /** Hidden reasoning tokens reported across completed turns. */
  reasoning?: number;

  /** Total tokens after adding separately reported reasoning tokens. */
  tokensWithReasoning?: number;

  /** Number of completed agent turns. */
  turns?: number;

  /** Per-turn token ledger retained for trace auditing. */
  usage?: ITtscBenchmarkAgentSample.IUsage[];

  /** Total shell, web, and MCP tool calls observed in the trace. */
  tools: number;

  /** Source-file read calls when the harness exposes a separate counter. */
  reads?: number;

  /** Text-search calls when the harness exposes a separate counter. */
  grep?: number;

  /** Shell command calls, including reads and searches. */
  shell: number;

  /** Web lookup calls. */
  web: number;

  /** Calls made to the selected graph MCP server. */
  graph: number;

  /** Tool calls that do not belong to a named metric bucket. */
  other?: number;

  /** Distinct source-file touches inferred from shell activity. */
  sourceTouches?: number;

  /** Shell calls classified as source reads or searches. */
  shellSource?: number;

  /** Exact shell command strings retained for manual audit. */
  shellCommands: string[];

  /** Raw tool-call counts keyed by provider event type. */
  types?: Record<string, number>;

  /** Provider-reported cost in US dollars when available. */
  cost?: number;

  /** Wall-clock duration of the agent attempt in milliseconds. */
  durMs: number;

  /** Provider model version resolved for the attempt. */
  modelVersion?: string;

  /** Whether the attempt completed and satisfied its arm validity checks. */
  ok: boolean;

  /** Final visible agent answer retained for human quality review. */
  answer: string;

  /** Failure text for an unsuccessful attempt, otherwise an empty string. */
  error: string;

  /** Stable prompt manifest identifier. */
  promptId?: string;

  /** Verified SHA-256 digest of the exact prompt text. */
  questionSha256?: string;

  /** One-based sample number within its benchmark cell. */
  run?: number;

  /** Number of attempts consumed after transient retries. */
  attempts?: number;
}

/** Companion axes and token-ledger contracts for an agent sample. */
export namespace ITtscBenchmarkAgentSample {
  /** Agent benchmark comparison arm. */
  export type Arm = "baseline" | "graph";

  /** Numeric sample field available for comparison and reporting. */
  export type Metric = "cost" | "durMs" | "tokens" | "tools";

  /** Token usage reported for one completed agent turn. */
  export interface IUsage {
    /** Non-cached input tokens charged to the turn. */
    input: number;

    /** Input tokens served from the provider cache. */
    cachedInput: number;

    /** Visible assistant output tokens. */
    output: number;

    /** Hidden reasoning tokens reported by the provider. */
    reasoning: number;
  }
}
