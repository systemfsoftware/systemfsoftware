import { Schema } from 'effect'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import fixture from '../fixtures/cloudflare-errors.json' with { type: 'json' }
import { type CapturedResponse, CapturedResponses } from './captured-response.schema.js'

/**
 * The fixture, decoded at import through the typed `Result` channel with
 * `onExcessProperty: 'error'`. A record carrying a field the schema does not
 * name — a leaked `id`, say — fails the import, so the build and the suite
 * refuse it rather than the emulator answering from it.
 */
export const capturedResponses: ReadonlyArray<CapturedResponse> = Result.getOrThrow(
  Schema.decodeResult(CapturedResponses, { onExcessProperty: 'error' })(fixture),
)

/** The captured answer for `caseId`, or `Option.none` when the fixture has none. */
export const lookupCaptured = (caseId: string): Option.Option<CapturedResponse> =>
  Arr.findFirst(capturedResponses, (record) => record.case === caseId)
