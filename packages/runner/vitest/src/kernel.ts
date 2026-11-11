/**
 * The refusal kernel, published as `@systemfsoftware/vitest/kernel`: the mechanism the fork's `it` lanes refuse
 * slop with, for a library that registers its own tests and wants the same refusals.
 *
 * A check is minted against a ledger, a body is a generator the driver steps, and every refusal is data the
 * library passes in:
 * - {@link expectFor} builds a test's `expect` from {@link Tables} (which matchers are refused and with what text)
 *   and {@link Subject}s (check surfaces for the library's own values);
 * - {@link makeLedger} counts checks per observed state and per check kind, with {@link LedgerOptions};
 * - {@link drive} steps a body through an {@link Interpreter}: which yielded values run, and which open a new
 *   observed state;
 * - {@link Gate}, {@link RequirementOf} and {@link BodyRefusal} refuse a body at its test name at compile time,
 *   and {@link Handle} (built with {@link makeHandle}) is the non-Effect value a body yields so that a bare
 *   `Effect` is not a step;
 * - {@link installGuard}, {@link markTask} and {@link isMarked} refuse a raw `expect` and an unregistered test.
 *
 * @since 4.1.0
 */
export {
  type AnySubject,
  Asserted,
  type AssertedShape,
  type Check,
  type Checked,
  type Checks,
  type Expect,
  expectFor,
  type ExpectOptions,
  isCheck,
  type Judgement,
  type Ledger,
  type LedgerInput,
  type LedgerOptions,
  type Limit,
  type MakeAssertion,
  makeLedger,
  type Matchers,
  type Mint,
  mintCheck,
  type MintInput,
  type Negative,
  type Positive,
  type Shapes,
  type Subject,
  valueKind,
  type WindowLimits,
} from './internal/checks.js'
export {
  type Body,
  defaultInterpreter,
  drive,
  type DriveInput,
  type Interpreter,
  isRunnable,
  type Runnable,
} from './internal/driver.js'
export {
  type BodyRefusal,
  type Gate,
  type Handle,
  HandleTypeId,
  isHandle,
  makeHandle,
  type RequirementOf,
  type Unresolved,
} from './internal/gate.js'
export { installGuard, isMarked, markTask } from './internal/guard.js'
export {
  booleanRefusal,
  type ForkTables,
  forkTables,
  type GateTexts,
  isRefusal,
  neededText,
  negatedText,
  noCheckRefusal,
  refusalOf,
  refuseAsyncBody,
  refusedText,
  refuseEffectBody,
  refusePiecewise,
  refuseRawExpect,
  refuseSyncBody,
  refuseUnyielded,
  type Tables,
  unprovidedText,
} from './internal/refusals.js'
