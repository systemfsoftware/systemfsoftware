import type { EvidenceBenchmarkEffort } from "../typings/EvidenceBenchmarkEffort";
import type { ITtscEvidenceBenchmarkTokenUsage } from "./ITtscEvidenceBenchmarkTokenUsage";

/**
 * Cost and provenance of one runner-owned review inspection.
 *
 * Inspection is part of what an arm costs, so its tokens and elapsed time join
 * the cell's totals. They stay on their own record rather than folded into
 * `threadTokenUsage` so a reader can always separate what the measured agent
 * spent from what judging it spent.
 */
export interface ITtscEvidenceBenchmarkInspection {
  /**
   * One-based position of this attempt at the same Review boundary.
   *
   * Every attempt is retained, not only the one that decided, because an
   * attempt that spent tokens and produced nothing is a fact about the run.
   */
  attempt: number;

  /** Model taken from the run's identity, never a cheaper substitute. */
  model: string;

  /** Reasoning effort taken from the run's identity. */
  effort: EvidenceBenchmarkEffort;

  /** Time at which the runner spawned the inspecting thread. */
  startedAt: string;

  /**
   * Wall time of the inspecting process.
   *
   * The inspection runs after the measured app-server has exited, so this
   * duration overlaps no process record and is additive.
   */
  elapsedMs: number;

  /** Native token counters reported by the inspecting thread. */
  tokenUsage: ITtscEvidenceBenchmarkTokenUsage;

  /** Native thread the inspection ran in, when it reported one. */
  threadId?: string;

  /** Retained inspection artifacts relative to the run root. */
  logRelativePath: string;

  /** Stage log the inspection read, relative to the run root. */
  stageLogRelativePath: string;

  /**
   * Why the inspection produced no decision.
   *
   * A failed inspection leaves the pause undecided rather than guessing, so the
   * run stops at the same operator boundary it stopped at before the inspecting
   * thread existed.
   */
  failure?: string;
}
