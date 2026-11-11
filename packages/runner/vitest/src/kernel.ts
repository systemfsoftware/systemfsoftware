/**
 * The refusal kernel, published as `@systemfsoftware/vitest/kernel`: the mechanism the fork's `it` lanes refuse
 * slop with, for a library that registers its own tests and wants the same refusals.
 *
 * The fork's refusals are a floor. A library passes its vocabulary as data, and it can reword a refusal and add
 * refusals of its own; it cannot remove or narrow one, mint a check that cannot fail, or admit a second check
 * on one observed state:
 * - {@link makeLedger} counts one check per observed state, resolves the library's {@link TableRows} over the
 *   fork's own, and is the only way to get a {@link Ledger};
 * - {@link expectFor} builds a test's `expect` from a ledger and {@link Subject}s (check surfaces for the
 *   library's own values), whose judgements run through the ledger's tables, the boolean refusal and the one-check
 *   rule;
 * - {@link drive} steps a body through an {@link Interpreter}: which yielded values run, and which steps may open
 *   a new observed state;
 * - {@link Gate}, {@link RequirementOf} and {@link BodyRefusal} refuse a body at its test name at compile time,
 *   and {@link Handle} (built with {@link makeHandle} around the Effect it runs) is the non-Effect value a body
 *   yields so that a bare `Effect` is not a step;
 * - {@link installGuard}, {@link markTask} and {@link isMarked} refuse a raw `expect` and an unregistered test.
 *
 * @since 4.1.0
 */
export {
  type AnySubject,
  type Asserted,
  type Check,
  type Checks,
  type Expect,
  expectFor,
  type ExpectOptions,
  type Judgement,
  type Ledger,
  type LedgerInput,
  type LedgerOptions,
  type MakeAssertion,
  makeLedger,
  type Mint,
  type Subject,
} from './kernel/checks.js'
export { type Body, drive, type DriveInput, type Interpreter, type Runnable } from './kernel/driver.js'
export { type BodyRefusal, type Gate, type Handle, isHandle, makeHandle, type RequirementOf } from './kernel/gate.js'
export { installGuard, isMarked, markTask } from './kernel/guard.js'
export { type GateTexts, type TableRows } from './kernel/refusals.js'
