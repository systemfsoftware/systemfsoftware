import type { ITtscBenchmarkGraphWebsiteAgentCell } from "./structures/ITtscBenchmarkGraphWebsiteAgentCell.ts";

/** Identity serializer for published graph-agent benchmark cells. */
export namespace TtscBenchmarkGraphWebsiteCell {
  /**
   * Serializes exactly the axes rendered by the graph benchmark website.
   *
   * Fixture branch, reasoning effort, and setup duration are metadata, so they
   * cannot create a second visible copy of a remeasured cell.
   */
  export function key(cell: ITtscBenchmarkGraphWebsiteAgentCell): string {
    return JSON.stringify([
      cell.harness,
      cell.tool ?? "ttsc-graph",
      cell.repo,
      cell.promptId ?? "",
      cell.promptFamily ?? "project-specific",
      cell.model,
      cell.daemon === true ? "daemon" : "single",
    ]);
  }
}
