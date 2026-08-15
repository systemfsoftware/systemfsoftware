import fs from "node:fs";
import path from "node:path";

import { repositoryRoot } from "./suiteRoot";

/** The sentence a document uses to prescribe one claim's unlock. */
const UNLOCK = /delete `disabled` from/i;

/**
 * Orders claims the way the Evidence arm's own staged-unlock document tells a
 * cell to unlock them.
 *
 * The order is a real property of the graph rather than a presentation detail:
 * a claim references the population an earlier layer produces, so enabling one
 * before its evidence exists selects nothing and proves nothing. Reading the
 * order from the document the measured agent receives is what keeps this suite
 * walking the same path a cell walks — and what makes a claim the document
 * forgot to mention a failure here rather than a silent gap in the campaign.
 *
 * Only the lines that actually prescribe an unlock are read. A document also
 * names its claims outside the unlock steps — in its claim table, placement,
 * and prose — and those mentions carry no ordering at all; ranking by first
 * appearance anywhere let one of them put the last claim first. A claim named
 * nowhere in an unlock step fails loudly instead, because that is a claim no
 * cell is told when to open.
 *
 * @param instruction Repository-relative document that prescribes the unlocks.
 * @param claims Claim names discovered in the configuration under test.
 * @returns The same names, ordered as the document prescribes.
 */
export const claimUnlockOrder = (
  instruction: string,
  claims: readonly string[],
): string[] => {
  const steps = unlockSteps(instruction);
  // Line first, then position within it: several claims are unlocked by one
  // sentence, and their order inside that sentence is the order it prescribes.
  // Folding both into one number would need a bound on line length that
  // nothing guarantees.
  const positions = new Map<string, readonly [number, number]>();
  for (const claim of claims) {
    const step = steps.find((entry) => entry.text.includes(`\`${claim}\``));
    if (step === undefined)
      throw new Error(
        `${instruction} never tells a cell when to unlock claim '${claim}'. A staged claim no instruction opens stays disabled for the whole run and measures nothing.`,
      );
    positions.set(claim, [step.line, step.text.indexOf(`\`${claim}\``)]);
  }
  const at = (claim: string): readonly [number, number] =>
    positions.get(claim) ?? [0, 0];
  return [...claims].sort((left, right) => {
    const [leftLine, leftColumn] = at(left);
    const [rightLine, rightColumn] = at(right);
    return leftLine === rightLine
      ? leftColumn - rightColumn
      : leftLine - rightLine;
  });
};

/**
 * Answers whether one instruction is the one that tells a cell to open a claim.
 *
 * This is how a walk decides which of the workspace's configurations it owns,
 * without naming any of them. An objective governs the claims its own
 * instruction unlocks, wherever the template happens to declare them, so a
 * claim that moves between packages stays covered by the same walk.
 */
export const claimIsUnlockedBy = (
  instruction: string,
  claim: string,
): boolean =>
  unlockSteps(instruction).some((entry) => entry.text.includes(`\`${claim}\``));

const unlockSteps = (
  instruction: string,
): { readonly line: number; readonly text: string }[] => {
  const location: string = path.resolve(repositoryRoot, instruction);
  const steps = fs
    .readFileSync(location, "utf8")
    .split("\n")
    .map((text, line) => ({ line, text }))
    .filter((entry) => UNLOCK.test(entry.text));
  if (steps.length === 0)
    throw new Error(
      `${instruction} prescribes no claim unlock, so no order can be read from it. Either the arm no longer stages its claims, or the instruction changed shape and this suite is no longer reading it.`,
    );
  return steps;
};
