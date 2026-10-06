import { describe, it } from '@systemfsoftware/vitest'
import { Schema } from 'effect'
import * as Result from 'effect/Result'

import { CaseMode, HeldCase, RetiredCase } from '../disposition.schema.js'
import {
  LaneHolds,
  LaneRefused,
  type LaneVerdict,
  laneVerdict,
  ObservedCase,
  ObservedOutcome,
  ReplacementFailed,
  ReplacementFile,
  ReplacementMissing,
  TriageCategory,
  TypeErrorInFile,
  VerdictCommand,
  type Violation,
} from '../lane-verdict.workflow.js'

type DecideLane = typeof laneVerdict

const commandOf = (
  held: ReadonlyArray<HeldCase>,
  observed: ReadonlyArray<ObservedCase>,
  retired: ReadonlyArray<RetiredCase> = [],
  replacements: ReadonlyArray<ReplacementFile> = [],
  typeErrors: ReadonlyArray<string> = [],
): VerdictCommand => VerdictCommand.make({ held, observed, retired, replacements, typeErrors })

const verdictOf = (subject: DecideLane, command: VerdictCommand): LaneVerdict => Result.getOrThrow(subject(command))

const violationsOf = <A extends Violation>(
  verdict: LaneVerdict,
  matches: (value: Violation) => value is A,
): ReadonlyArray<A> => Schema.is(LaneRefused)(verdict) ? verdict.violations.filter(matches) : []

describe('laneVerdict', () => {
  it.prop(
    '∀mode_LaneVerdict_=DeclaredMode',
    { of: [CaseMode, ObservedOutcome], subject: laneVerdict },
    (subject: DecideLane, [mode, outcome]) => {
      const verdict = verdictOf(
        subject,
        commandOf(
          [HeldCase.make({ key: 'k', mode })],
          [ObservedCase.make({ key: 'k', file: 'f', package: 'p', outcome, message: '' })],
        ),
      )
      return Schema.is(LaneHolds)(verdict) === (mode === outcome)
    },
  )

  it.prop(
    '∀replacement_LaneVerdict_=ReplacementOutcome',
    { of: [Schema.Boolean, Schema.Int], subject: laneVerdict },
    (subject: DecideLane, [present, failed]) => {
      const retired = [RetiredCase.make({ file: 'u', package: 'p', replacementFile: 'r', reason: '' })]
      const replacements = present
        ? [ReplacementFile.make({ file: 'r', package: 'p', passed: failed === 0 ? 2 : 0, failed })]
        : []
      const verdict = verdictOf(subject, commandOf([], [], retired, replacements))
      const expected = present ? (failed === 0 ? 0 : 1) : 1
      const named = present && failed === 0
        ? 0
        : violationsOf(verdict, Schema.is(ReplacementFailed)).length +
          violationsOf(verdict, Schema.is(ReplacementMissing)).length
      return named === expected && (present && failed === 0) === Schema.is(LaneHolds)(verdict)
    },
  )

  it.prop(
    '∀failures_LaneVerdict_∈DeclaredCategories',
    { of: [Schema.Array(ObservedCase)], subject: laneVerdict },
    (subject: DecideLane, [observed]) => {
      const held = observed.map((entry) => HeldCase.make({ key: entry.key, mode: 'passed' }))
      const failures = observed.map((entry) =>
        ObservedCase.make({
          key: entry.key,
          file: entry.file,
          package: entry.package,
          outcome: 'failed',
          message: entry.message,
        })
      )
      const verdict = verdictOf(subject, commandOf(held, failures))
      const sum = verdict.categories.reduce((total, entry) => total + entry.count, 0)
      const categories = verdict.categories.filter((entry) => entry.count > 0).map((entry) => entry.category)
      return sum === failures.length && categories.every((category) => TriageCategory.literals.includes(category))
    },
  )

  it.prop(
    '∀files_LaneVerdict_=NamedTypeErrors',
    { of: [Schema.Array(Schema.String)], subject: laneVerdict },
    (subject: DecideLane, [files]) => {
      const verdict = verdictOf(subject, commandOf([], [], [], [], files))
      const named = violationsOf(verdict, Schema.is(TypeErrorInFile)).map((violation) => violation.file).sort()
      return named.join('|') === [...files].sort().join('|')
    },
  )
})
