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
 *   site a kernel run and the runner's lanes share (R2, R7, R8);
 * - `testIdentityOf()` — the package, test file and scenario of the running Vitest task the rerun line names (R6);
 * - `recordOfRun(program)` and `recordOfProperty({ name, spec, holds })` — the in-process runs a corpus drives a
 *   fixture through, each with its own check ledger and recorder (R11, KTD10);
 * - the types `FailureRecord`, `FailureRecordInput`, `TestIdentity`, `ReplayValue`, `AttributeValue`, `Breach`
 *   and `SpanRecorder` that describe them.
 *
 * @since 4.0.0
 */
export { throwFailureRecord } from './internal/failure-error.js'
export { testIdentityOf } from './internal/failure-identity.js'
export {
  type AttributeValue,
  type Breach,
  type FailureRecord,
  type FailureRecordInput,
  renderFailureRecord,
  type ReplayValue,
  type TestIdentity,
} from './internal/failure-record.js'
export { providedRoot as providedWorkspaceRoot } from './internal/provided.js'
export { type RecordedProperty, type RecordedRun, recordOfProperty, recordOfRun } from './internal/recorded-run.js'
export { createSpanRecorder, type SpanRecorder } from './internal/span-recorder.js'
