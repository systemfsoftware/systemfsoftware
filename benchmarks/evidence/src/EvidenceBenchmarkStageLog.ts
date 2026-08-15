import path from "node:path";

/**
 * Names and orders the per-stage native stream logs retained beside a run.
 *
 * One append-only file per retained Goal name keeps the log vocabulary and the
 * report's stage vocabulary identical, so a reader who sees `backend-remind-3`
 * in a stage table opens `backend-remind-3.log` without a lookup table. The
 * objective sequence is deterministic and supplementation is bounded, so the
 * names alone recover the order and carry no numeric prefix.
 */
export namespace EvidenceBenchmarkStageLog {
  /**
   * Stage names that may become a file name under a run root.
   *
   * The pattern guards the file system rather than the objective vocabulary: a
   * stage name reaches this module from the retained instruction plan, which
   * the runner already validates, and the only new risk a log file adds is a
   * name that escapes its run root.
   */
  const STAGE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

  /** Returns the retained log file for one stage under a run root. */
  export function resolve(runRoot: string, stage: string): string {
    if (!STAGE.test(stage) || stage.length > 64)
      throw new Error(`Benchmark stage cannot name a log file: ${stage}.`);
    return path.join(path.resolve(runRoot), `${stage}.log`);
  }

  /**
   * Returns every stage log of a run in objective order.
   *
   * Order is what makes the split reversible. A consumer that reconstructs the
   * native stream — the API-cost collector does — must read these files in the
   * order the runner wrote them, carrying an incomplete trailing line into the
   * next file, because a chunk boundary can fall inside a JSON line.
   */
  export function order(
    runRoot: string,
    goals: readonly { index: number; name: string }[],
  ): string[] {
    return [...goals]
      .sort((left, right) => left.index - right.index)
      .map((goal) => resolve(runRoot, goal.name));
  }
}
