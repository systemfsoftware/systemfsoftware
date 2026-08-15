import { TtscBenchmarkPerformanceCommand } from "./TtscBenchmarkPerformanceCommand.ts";
import type { ITtscBenchmarkPerformanceCell } from "./structures/ITtscBenchmarkPerformanceCell.ts";
import type { ITtscBenchmarkPerformanceProject } from "./structures/ITtscBenchmarkPerformanceProject.ts";

/** Builds and filters the exact performance benchmark cell matrix. */
export namespace TtscBenchmarkPerformanceCell {
  /** Cell-selection inputs supplied by the executable. */
  export interface IOptions {
    /** Boolean scope flags such as `--lint-only`. */
    flags: ReadonlySet<string>;

    /** Regular expressions whose matches are OR-combined with scope flags. */
    cellFilters: readonly RegExp[];
  }

  /** Builds all selected cells for one project in stable publication order. */
  export function project(
    fixture: ITtscBenchmarkPerformanceProject,
    options: IOptions,
  ): ITtscBenchmarkPerformanceCell[] {
    const cells: ITtscBenchmarkPerformanceCell[] = [];
    for (const branch of BRANCHES) {
      const branchCommands = fixture.commands[branch];
      if (branchCommands === undefined) continue;
      for (const operation of [
        "build",
        "noEmit",
        "eslint",
        "format",
      ] satisfies ITtscBenchmarkPerformanceCell.Operation[]) {
        const baseSteps = branchCommands[operation];
        if (baseSteps?.length !== 0 && baseSteps !== undefined) {
          const measuredSteps =
            branch === "ttsc-lint" &&
            TtscBenchmarkPerformanceCommand.isLintOperation(operation)
              ? TtscBenchmarkPerformanceCommand.diagnostics(baseSteps)
              : baseSteps;
          if (branch === "legacy" || operation === "eslint") {
            cells.push({
              id: `${fixture.name}:${branch}:${operation}:multi`,
              project: fixture,
              branch,
              op: operation,
              threading: "multi",
              steps: measuredSteps,
            });
          } else {
            const variants =
              operation === "format"
                ? TtscBenchmarkPerformanceCommand.formatThreadingVariants()
                : TtscBenchmarkPerformanceCommand.threadingVariants();
            for (const variant of variants)
              cells.push({
                id: `${fixture.name}:${branch}:${operation}:${variant.name}`,
                project: fixture,
                branch,
                op: operation,
                threading: variant.name,
                steps: variant.apply(measuredSteps),
              });
          }
          if (
            branch === "ttsc" &&
            (operation === "build" || operation === "noEmit")
          ) {
            const tsgoSteps =
              branchCommands[
                operation === "build" ? "tsgoBuild" : "tsgoNoEmit"
              ];
            if (tsgoSteps?.length)
              for (const variant of TtscBenchmarkPerformanceCommand.threadingVariants())
                cells.push({
                  id: `${fixture.name}:${branch}:tsgo:${operation}:${variant.name}`,
                  project: fixture,
                  tool: "tsgo",
                  branch,
                  op: operation,
                  threading: variant.name,
                  steps: variant.apply(tsgoSteps),
                });
          }
        }
      }
    }
    return filter(cells, options);
  }

  /** Lists selected fixture branches without changing their canonical order. */
  export function branches(
    fixture: ITtscBenchmarkPerformanceProject,
    options: IOptions,
  ): ITtscBenchmarkPerformanceCell.Branch[] {
    return [
      ...new Set(
        project(fixture, options).map(
          (cell: ITtscBenchmarkPerformanceCell) => cell.branch,
        ),
      ),
    ];
  }

  const BRANCHES: readonly ITtscBenchmarkPerformanceCell.Branch[] = [
    "legacy",
    "ttsc",
    "ttsc-lint",
  ];

  function filter(
    cells: ITtscBenchmarkPerformanceCell[],
    options: IOptions,
  ): ITtscBenchmarkPerformanceCell[] {
    const predicates: Array<(cell: ITtscBenchmarkPerformanceCell) => boolean> =
      [];
    if (
      options.flags.has("--ttsc-build-only") ||
      options.flags.has("--only-ttsc-build")
    )
      predicates.push(
        (cell: ITtscBenchmarkPerformanceCell): boolean =>
          cell.branch === "ttsc" && cell.op === "build" && cell.tool !== "tsgo",
      );
    if (options.flags.has("--lint-only")) predicates.push(isLintComparison);
    if (options.flags.has("--format-only")) predicates.push(isFormatComparison);
    for (const expression of options.cellFilters)
      predicates.push((cell: ITtscBenchmarkPerformanceCell): boolean =>
        expression.test(cell.id),
      );
    if (predicates.length === 0) return cells;
    return cells.filter((cell: ITtscBenchmarkPerformanceCell): boolean =>
      predicates.some((predicate) => predicate(cell)),
    );
  }

  function isLintComparison(cell: ITtscBenchmarkPerformanceCell): boolean {
    if (cell.branch === "legacy")
      return cell.op === "noEmit" || cell.op === "eslint";
    if (cell.branch === "ttsc")
      return cell.op === "noEmit" && cell.tool !== "tsgo";
    return cell.branch === "ttsc-lint" && cell.op === "noEmit";
  }

  function isFormatComparison(cell: ITtscBenchmarkPerformanceCell): boolean {
    return cell.op === "format";
  }
}
