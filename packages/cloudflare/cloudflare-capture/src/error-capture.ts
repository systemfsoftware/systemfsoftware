import { client } from '@systemfsoftware/alchemy-cloudflare'
import { Option, Schema } from 'effect'
import * as Arr from 'effect/Array'
import type { CapturedResponse, CaptureMethod, RawValue } from './captured-response.schema.js'

/** A raw answer from the edge: the HTTP status and whatever JSON it carried. */
export interface CapturedAttempt {
  readonly status: number
  readonly body: RawValue
}

/** What a case knows before its answer arrives: the recorded coordinates. */
export interface CaptureMeta {
  readonly case: string
  readonly operation: string
  readonly method: CaptureMethod
  readonly endpoint: string
  readonly capturedOn: string
}

/** An answer together with the coordinates it is recorded under. */
export interface CaptureAttemptOf {
  readonly meta: CaptureMeta
  readonly attempt: CapturedAttempt
}

/** Cloudflare's first `{ code, message }` entry. */
export interface EnvelopeError {
  readonly code: number
  readonly message: string
}

const firstEnvelopeError = (attempt: CapturedAttempt) =>
  Option.flatMap(
    Schema.decodeUnknownOption(client.CloudflareEnvelope)(attempt.body),
    (envelope) => Option.flatMap(Option.fromUndefinedOr(envelope.errors), (errors) => Arr.head(errors)),
  )

/**
 * The `{ code, message }` Cloudflare answers with, falling back to the raw
 * status when the body carries no envelope. The one place the wire shape is
 * read, so every captured code and message traces to this decision.
 */
export const envelopeErrorOf = (attempt: CapturedAttempt): EnvelopeError => {
  const entry = firstEnvelopeError(attempt)
  return {
    code: Option.getOrElse(Option.flatMap(entry, (error) => Option.fromUndefinedOr(error.code)), () => 0),
    message: Option.getOrElse(
      Option.flatMap(entry, (error) => Option.fromUndefinedOr(error.message)),
      () => `HTTP ${attempt.status}`,
    ),
  }
}

/** The fixture record for a captured attempt: the answer's coordinates, no ids. */
export const capturedResponseOf = ({ meta, attempt }: CaptureAttemptOf): CapturedResponse => {
  const error = envelopeErrorOf(attempt)
  return {
    case: meta.case,
    product: client.productFamily(meta.endpoint),
    operation: meta.operation,
    method: meta.method,
    endpoint: meta.endpoint,
    status: attempt.status,
    code: error.code,
    message: error.message,
    capturedOn: meta.capturedOn,
  }
}
