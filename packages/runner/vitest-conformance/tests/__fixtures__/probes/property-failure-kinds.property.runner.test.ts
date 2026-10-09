import { it } from '@systemfsoftware/vitest'
import * as Schema from 'effect/Schema'

/**
 * Raises each of the four property failure kinds once, so a nested run's reporter receives one of each (R8, R21):
 * a falsified property, a non-boolean verdict, a coverage class confidently under its minimum, and the file-end
 * vacuous verdict. `alwaysOne` is the one subject no property refutes, so the vacuous verdict names it alone; the
 * falsified property's subject is recorded nowhere, because a refutation dies before its impostor run.
 */

/** Drops the last element, so a property pinning the length falsifies it on any non-empty input. */
const dropsLast = (xs: ReadonlyArray<number>): ReadonlyArray<number> => xs.slice(0, -1)

const alwaysOne = (_x: number): number => 1

const objectVerdict = (value: number): Record<string, number> => ({ answer: value })

it.prop(
  '∀xs_DropsTheLast_⊆Input',
  { of: [Schema.Array(Schema.Int)], subject: dropsLast },
  (subject, [xs]) => subject(xs).length === xs.length,
)

it.prop(
  '∀n_ReturnsAnObject_⊥Verdict',
  { of: [Schema.Int], subject: alwaysOne, runs: 5 },
  (subject, [n]) =>
    // @ts-expect-error the run time, not the compiler, is what must refuse an object verdict on the sync lane
    objectVerdict(subject(n)),
)

it.prop(
  '∀n_UnreachableCoverage_⊇Minimum',
  {
    of: [Schema.Int],
    subject: alwaysOne,
    cover: { unreachable: [(n: number) => Number.isNaN(n), 0.5] },
  },
  (subject, [n]) => subject(n) === 1,
)

it.prop(
  '∀n_AlwaysOne_=One',
  { of: [Schema.Int], subject: alwaysOne },
  (subject, [n]) => subject(n) === 1,
)
