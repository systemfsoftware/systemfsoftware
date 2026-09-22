import { Schema } from 'effect'

export const Connected = Schema.TaggedStruct('Connected', {})
export const Refused = Schema.TaggedStruct('Refused', {})
export const DialEvidence = Schema.Union([Connected, Refused])
export type DialEvidence = typeof DialEvidence.Type

export const Responded = Schema.TaggedStruct('Responded', { statusLine: Schema.String })
export const HttpEvidence = Schema.Union([Responded, Refused])
export type HttpEvidence = typeof HttpEvidence.Type
