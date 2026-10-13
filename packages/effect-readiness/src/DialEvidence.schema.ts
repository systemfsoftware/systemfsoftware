import { Schema } from 'effect'

export const StatusCode = Schema.Int.pipe(
  Schema.check(
    Schema.isBetween(
      { minimum: 100, maximum: 599 },
      { message: 'an HTTP status code is an integer between 100 and 599' },
    ),
  ),
  Schema.brand('StatusCode'),
)
export type StatusCode = typeof StatusCode.Type

/** The status line's provider grammar lives in the adapter that reads it: `http-status-line.schema.ts`. */
export const Responded = Schema.TaggedStruct('Responded', { statusCode: StatusCode })
export type Responded = typeof Responded.Type

export const Connected = Schema.TaggedStruct('Connected', {})
export const Refused = Schema.TaggedStruct('Refused', {})
export const DialEvidence = Schema.Union([Connected, Refused])
export type DialEvidence = typeof DialEvidence.Type

export const HttpEvidence = Schema.Union([Responded, Refused])
export type HttpEvidence = typeof HttpEvidence.Type
