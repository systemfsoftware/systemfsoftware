import { Schema } from 'effect'
import { DialEvidence, HttpEvidence } from './DialEvidence.schema.js'

export const Absent = Schema.TaggedStruct('Absent', {})
export const LogEntries = Schema.TaggedStruct('LogEntries', { entries: Schema.Array(Schema.String) })
export const ProbeEvidence = Schema.Union([Absent, DialEvidence, HttpEvidence, LogEntries])
export type ProbeEvidence = typeof ProbeEvidence.Type
