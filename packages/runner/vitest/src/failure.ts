/**
 * The failure entry of the fork: everything a spec failure is rendered from, and everything the runner needs to
 * refuse a record that breaks the contract (KTD1, KTD7).
 *
 * Three things carry the whole surface:
 *
 * - `createSpanRecorder()` — the per-run in-memory tracer whose spans a failure is rendered from (KTD2);
 * - `renderFailureRecord({ failure, spans, identity, replay })` — the pure, never-throwing renderer. It returns
 *   the tag the thrown error should carry, the record text Vitest prints, and the `breaches` it found: `R1` an
 *   empty headline, `R2` no first location, `R6` a replay value on a baseline run or a missing rerun;
 * - the types `FailureRecord`, `FailureRecordInput`, `TestIdentity`, `ReplayValue`, `AttributeValue`, `Breach`
 *   and `SpanRecorder` that describe both.
 *
 * @since 4.0.0
 */
export {
  type AttributeValue,
  type Breach,
  type FailureRecord,
  type FailureRecordInput,
  renderFailureRecord,
  type ReplayValue,
  type TestIdentity,
} from './internal/failure-record.js'
export { createSpanRecorder, type SpanRecorder } from './internal/span-recorder.js'
