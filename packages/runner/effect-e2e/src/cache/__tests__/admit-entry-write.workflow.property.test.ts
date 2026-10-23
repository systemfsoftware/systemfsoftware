import { it } from '@systemfsoftware/vitest'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { AdmitEntryWrite, admitEntryWrite, type WriteAdmission } from '../admit-entry-write.workflow.js'
import { entryWireBytesOf, entryWireTextOf, TraceEntry } from '../entry.schema.js'

type Admit = typeof admitEntryWrite

const WIRE_BYTES_CAP = 1_048_576

const admissionOf = (admit: Admit, command: AdmitEntryWrite): WriteAdmission =>
  Result.match(admit(command), { onFailure: (missing: never) => missing, onSuccess: (admission) => admission })

const labelOf = (admission: WriteAdmission): string =>
  Match.valueTags(admission, {
    WriteAdmitted: ({ bytes }) => `admitted ${new TextDecoder().decode(bytes)}`,
    WriteRefused: ({ answer }) => `refused ${answer._tag}`,
  })

const wireOf = (entry: TraceEntry): string => Option.getOrElse(entryWireTextOf(entry), () => '')

const withAlerts = (entry: TraceEntry, alerts: ReadonlyArray<string>): TraceEntry => ({ ...entry, alerts })

const paddedTo = (entry: TraceEntry, bytes: number): TraceEntry => {
  const slim = withAlerts(entry, [])
  return withAlerts(slim, ['a'.repeat(bytes - entryWireBytesOf(slim) - 2)])
}

it.prop(
  '∀e_AdmitEntryWrite_≡AdmittedBytesAreWireText',
  { of: [TraceEntry], subject: admitEntryWrite, arbitrary: { seed: 500_011 } },
  (subject, [entry]) =>
    labelOf(admissionOf(subject, new AdmitEntryWrite({ mode: 'read-write', entry }))) === `admitted ${wireOf(entry)}`,
)

it.prop(
  '∀e_AdmitEntryWrite_→OversizedPastCap',
  { of: [TraceEntry], subject: admitEntryWrite, arbitrary: { seed: 500_012 } },
  (subject, [entry]) => {
    const exact = paddedTo(entry, WIRE_BYTES_CAP)
    const over = paddedTo(entry, WIRE_BYTES_CAP + 1)
    return labelOf(admissionOf(subject, new AdmitEntryWrite({ mode: 'read-write', entry: exact }))) ===
        `admitted ${wireOf(exact)}` &&
      labelOf(admissionOf(subject, new AdmitEntryWrite({ mode: 'read-write', entry: over }))) === 'refused Oversized'
  },
)

it.prop(
  '∀e_AdmitEntryWrite_→ReadOnlyRefusedBeforeSize',
  { of: [TraceEntry, Schema.Boolean], subject: admitEntryWrite, arbitrary: { seed: 500_013 } },
  (subject, [entry, oversized]) => {
    const drawn = oversized ? paddedTo(entry, WIRE_BYTES_CAP + 1) : entry
    return labelOf(admissionOf(subject, new AdmitEntryWrite({ mode: 'read-only', entry: drawn }))) ===
      'refused ReadOnly'
  },
)
