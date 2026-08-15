import { TtscBenchmarkGraph } from "../TtscBenchmarkGraph.ts";
import type { ITtscBenchmarkGraphPrompt } from "./ITtscBenchmarkGraphPrompt.ts";

/** Visible axes that uniquely identify one published graph-agent cell. */
export interface ITtscBenchmarkGraphWebsiteAgentCell {
  /** Agent harness implementation. */
  harness: ITtscBenchmarkGraphWebsiteAgentCell.Harness;

  /** Graph comparator, defaulting to `ttsc-graph` for legacy cells. */
  tool?: ITtscBenchmarkGraphWebsiteAgentCell.Tool;

  /** Fixture repository registered in the graph corpus. */
  repo: TtscBenchmarkGraph.ProjectName;

  /** Stable prompt identifier when the manifest supplies one. */
  promptId?: string;

  /** Prompt family used by cells without a stable prompt identifier. */
  promptFamily?: ITtscBenchmarkGraphWebsiteAgentCell.PromptFamily;

  /** Stable model tier rendered by the website. */
  model: string;

  /** Whether the ttsc graph arm reused a resident daemon. */
  daemon?: boolean;
}

/** Closed identity axes for published graph-agent cells. */
export namespace ITtscBenchmarkGraphWebsiteAgentCell {
  /** Agent harness implementations supported by the benchmark. */
  export type Harness = "claude-code" | "codex";

  /** Comparator tools rendered by the graph benchmark website. */
  export type Tool =
    | "baseline"
    | "codebase-memory"
    | "codegraph"
    | "serena"
    | "ttsc-graph";

  /** Current prompt families plus accepted historical aliases. */
  export type PromptFamily =
    | ITtscBenchmarkGraphPrompt.Family
    | "project-specific"
    | "shared-onboarding";

  /** Tests whether a string names a supported agent harness. */
  export function isHarness(input: string): input is Harness {
    return input === "claude-code" || input === "codex";
  }

  /** Tests whether a string names a rendered comparator tool. */
  export function isTool(input: string): input is Tool {
    return (
      input === "baseline" ||
      input === "codebase-memory" ||
      input === "codegraph" ||
      input === "serena" ||
      input === "ttsc-graph"
    );
  }

  /** Tests whether a string names a graph fixture project. */
  export function isRepo(
    input: string,
  ): input is TtscBenchmarkGraph.ProjectName {
    return Object.hasOwn(TtscBenchmarkGraph.PROJECTS, input);
  }

  /** Tests whether a string is a current or historical prompt family. */
  export function isPromptFamily(input: string): input is PromptFamily {
    return (
      input === "common" ||
      input === "dedicated" ||
      input === "project-specific" ||
      input === "shared-onboarding"
    );
  }

  /** Validates and returns a supported agent harness identifier. */
  export function parseHarness(input: string): Harness {
    if (isHarness(input)) return input;
    throw new TypeError(`unsupported graph benchmark harness: ${input}`);
  }

  /** Validates and returns a comparator tool rendered by the website. */
  export function parseTool(input: string): Tool {
    if (isTool(input)) return input;
    throw new TypeError(`unsupported graph benchmark tool: ${input}`);
  }

  /** Validates and returns a graph fixture project name. */
  export function parseRepo(input: string): TtscBenchmarkGraph.ProjectName {
    if (isRepo(input)) return input;
    throw new TypeError(`unsupported graph benchmark repository: ${input}`);
  }

  /** Validates and returns a current or historical prompt-family label. */
  export function parsePromptFamily(input: string): PromptFamily {
    if (isPromptFamily(input)) return input;
    throw new TypeError(`unsupported graph benchmark prompt family: ${input}`);
  }
}
