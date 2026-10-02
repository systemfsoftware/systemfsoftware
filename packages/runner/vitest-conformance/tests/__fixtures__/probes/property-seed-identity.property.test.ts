import { it } from '@systemfsoftware/vitest'
import * as Schema from 'effect/Schema'

const objectVerdict = (value: number): Record<string, number> => ({ seen: value })

it.prop(
  '∀n_FirstIdentity_⊥Verdict',
  { of: [Schema.Int], subject: (n: number) => n },
  (subject, [value]) =>
    // @ts-expect-error the run time, not the compiler, is what must refuse an object verdict on the sync lane
    objectVerdict(subject(value)),
)

it.prop(
  '∀n_SecondIdentity_⊥Verdict',
  { of: [Schema.Int], subject: (n: number) => n },
  (subject, [value]) =>
    // @ts-expect-error the run time, not the compiler, is what must refuse an object verdict on the sync lane
    objectVerdict(subject(value)),
)
