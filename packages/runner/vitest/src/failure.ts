/**
 * The failure entry of the fork: everything a spec failure is rendered from, everything the runner needs to refuse
 * a record that breaks the contract, and the in-process way a corpus drives a fixture through the same pipeline
 * (KTD1, KTD7, KTD10).
 *
 * The surface:
 *
 * - `createSpanRecorder()` — the per-run in-memory tracer whose spans a failure is rendered from (KTD2);
 * - `renderFailureRecord({ failure, spans, identity, replay })` — the pure, never-throwing renderer. It returns
 *   the tag the thrown error should carry, the record text Vitest prints, and the `breaches` it found: `R1` an
 *   empty headline, `R2` no first location, `R6` a replay value on a baseline run or a missing rerun;
 * - `throwFailureRecord({ failure, spans, identity, replay })` — renders that record and throws it, the one throw
 *   site a kernel run and the runner's lanes share (R2, R7, R8). A record that breaks one of those rules is not
 *   thrown as-is: a `FailureRecordRefused` is thrown in its place, naming each breach in fixed prose, keeping the
 *   original failure as its `cause` and the record it would have printed in its `stack` (R10, KTD7);
 * - `testIdentityOf()` — the package, test file and scenario of the running Vitest task the rerun line names (R6);
 * - `recordOfRun(program)` and `recordOfProperty({ name, spec, holds })` — the in-process runs a corpus drives a
 *   fixture through, each with its own check ledger and recorder (R11, KTD10);
 * - `callFrameOutside(library)`, `callSite()` and `withRaisingFrame(error, frame)` — the author's call site,
 *   captured while it is on the stack, the site form `effect-gherkin-spec` writes as `code.site`, and the error
 *   that leads with the frame, for a library whose failure is raised after its caller's frame is gone (R2, KTD6);
 * - `summaryOf(value)` — the one cause summary: the headline and chain text a failure renders, so a library that
 *   derives its own message (a `StepError`) builds it from the same formatter the record uses;
 * - `witnessOf(value)` — a value's rendered text beside a JSON-safe projection of the same traversal, for a
 *   counterexample that crosses Vitest's worker-to-reporter transport (R3, KD7);
 * - the replay the rerun line carries: `Replay` and `ReplayFromText` (its codec) with `replayOfText(text)`, this
 *   package's one replay grammar, which the spec runtime reads a `CONFORMANCE_REPLAY` text through (KTD10);
 * - the types `FailureRecord`, `FailureRecordInput`, `TestIdentity`, `ReplayValue`, `AttributeValue`, `Breach`
 *   and `SpanRecorder` that describe them.
 *
 * @since 4.0.0
 */
export { callFrameOutside, callSite, withRaisingFrame } from './internal/call-site.js'
export type { Breach } from './internal/errors.schema.js'
export {
  type AttributeValue,
  type FailureRecord,
  type FailureRecordInput,
  type JsonValue,
  renderFailureRecord,
  type ReplayValue,
  summaryOf,
  type TestIdentity,
  testIdentityOf,
  throwFailureRecord,
  type Witness,
  witnessOf,
} from './internal/failure-record.js'
export { providedRoot as providedWorkspaceRoot } from './internal/provided.js'
export {
  type RecordedFile,
  type RecordedProperty,
  type RecordedRun,
  recordOfFile,
  recordOfProperty,
  recordOfRun,
} from './internal/recorded-run.js'
export { createSpanRecorder, type SpanRecorder } from './internal/span-recorder.js'
export { Replay, ReplayFromText, replayOfText } from './replay.schema.js'
