import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'

import { HeldCase, RetiredCase } from './disposition.schema.js'

const LaneVerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/xstate-upstream-oracle/LaneVerdict')
type LaneVerdictTypeId = typeof LaneVerdictTypeId

/** The six categories a held failure is triaged into (KTD5.6). */
export const TriageCategory = Schema.Literals([
  'timing/order',
  'async/error propagation',
  'microstep count',
  'persisted shape',
  'internal member',
  'react server snapshot',
])
export type TriageCategory = typeof TriageCategory.Type

/** What the lane observed for one held case. */
export const ObservedOutcome = Schema.Literals(['passed', 'failed', 'skipped', 'todo'])
export type ObservedOutcome = typeof ObservedOutcome.Type

/** One case as the run reported it, keyed the same way the disposition holds it. */
export class ObservedCase extends Schema.TaggedClass<ObservedCase>()('ObservedCase', {
  key: Schema.String,
  file: Schema.String,
  package: Schema.String,
  outcome: ObservedOutcome,
  message: Schema.String,
}) {}

/** One re-homed fork test a retired case names, as the run reported it. */
export class ReplacementFile extends Schema.TaggedClass<ReplacementFile>()('ReplacementFile', {
  file: Schema.String,
  package: Schema.String,
  passed: Schema.Finite,
  failed: Schema.Finite,
}) {}

/** How many held failures fell into one triage category. */
export class CategoryCount extends Schema.TaggedClass<CategoryCount>()('CategoryCount', {
  category: TriageCategory,
  count: Schema.Finite,
}) {}

/** A case the run reported that the disposition neither holds nor retires. */
export class UnlistedCase extends Schema.TaggedClass<UnlistedCase>()('UnlistedCase', { key: Schema.String }) {}
/** A held case whose observed outcome differs from its declared mode. */
export class ModeMismatch extends Schema.TaggedClass<ModeMismatch>()('ModeMismatch', {
  key: Schema.String,
  declared: Schema.String,
  observed: ObservedOutcome,
}) {}
/** A retired case whose replacement file never ran. */
export class ReplacementMissing extends Schema.TaggedClass<ReplacementMissing>()('ReplacementMissing', {
  file: Schema.String,
}) {}
/** A retired case whose replacement file ran with a failure. */
export class ReplacementFailed extends Schema.TaggedClass<ReplacementFailed>()('ReplacementFailed', {
  file: Schema.String,
}) {}
/** A types file the type pass reported an error in. */
export class TypeErrorInFile
  extends Schema.TaggedClass<TypeErrorInFile>()('TypeErrorInFile', { file: Schema.String })
{}

export const Violation = Schema.Union([
  UnlistedCase,
  ModeMismatch,
  ReplacementMissing,
  ReplacementFailed,
  TypeErrorInFile,
])
export type Violation = typeof Violation.Type

/** The lane held every case it disposed of. */
export class LaneHolds extends Schema.TaggedClass<LaneHolds>()('LaneHolds', {
  passed: Schema.Finite,
  skipped: Schema.Finite,
  todo: Schema.Finite,
  retired: Schema.Finite,
  categories: Schema.Array(CategoryCount),
}) {
  readonly [LaneVerdictTypeId] = LaneVerdictTypeId
}

/** The lane refused the run, naming every violation. */
export class LaneRefused extends Schema.TaggedClass<LaneRefused>()('LaneRefused', {
  violations: Schema.Array(Violation),
  categories: Schema.Array(CategoryCount),
}) {
  readonly [LaneVerdictTypeId] = LaneVerdictTypeId
}

export const LaneVerdict = Schema.Union([LaneHolds, LaneRefused])
export type LaneVerdict = typeof LaneVerdict.Type

/** Everything the verdict is decided from: the disposition, the observation and the retired set. */
export class VerdictCommand extends Schema.TaggedClass<VerdictCommand>()('VerdictCommand', {
  held: Schema.Array(HeldCase),
  observed: Schema.Array(ObservedCase),
  retired: Schema.Array(RetiredCase),
  replacements: Schema.Array(ReplacementFile),
  typeErrors: Schema.Array(Schema.String),
}) {
  static readonly [Workflow.InstrumentationBrand] = { observed: 'app.oracle.observed' } as const
}

/** The no-violation arm of a tagged dispatch, typed once (KTD5.6). */
const NO_VIOLATIONS: ReadonlyArray<Violation> = []

const has = (keys: readonly string[], key: string): boolean => keys.includes(key)

const knownFiles = (command: VerdictCommand): ReadonlyArray<string> => [
  ...command.held.map((held) => held.key),
  ...command.retired.map((entry) => entry.file),
]

const unlistedOf = (command: VerdictCommand, observed: ObservedCase): ReadonlyArray<Violation> =>
  Match.value(has(knownFiles(command), observed.key)).pipe(
    Match.when(true, () => NO_VIOLATIONS),
    Match.when(false, () => [new UnlistedCase({ key: observed.key })]),
    Match.exhaustive,
  )

const unlisted = (command: VerdictCommand): ReadonlyArray<Violation> =>
  command.observed.flatMap((observed) => unlistedOf(command, observed))

const mismatchOf = (held: HeldCase, observed: ObservedCase): ReadonlyArray<Violation> =>
  Match.value(held.mode === observed.outcome).pipe(
    Match.when(true, () => NO_VIOLATIONS),
    Match.when(false, () => [new ModeMismatch({ key: held.key, declared: held.mode, observed: observed.outcome })]),
    Match.exhaustive,
  )

const modeMismatches = (command: VerdictCommand): ReadonlyArray<Violation> =>
  command.held.flatMap((held) =>
    Option.match(Option.fromNullishOr(command.observed.find((observed) => observed.key === held.key)), {
      onNone: () => NO_VIOLATIONS,
      onSome: (observed) => mismatchOf(held, observed),
    })
  )

const replacementViolationOf = (
  retired: RetiredCase,
  file: Option.Option<ReplacementFile>,
): ReadonlyArray<Violation> =>
  Option.match(file, {
    onNone: () => [new ReplacementMissing({ file: retired.replacementFile })],
    onSome: (found) =>
      Match.value(found.failed === 0).pipe(
        Match.when(true, () => NO_VIOLATIONS),
        Match.when(false, () => [new ReplacementFailed({ file: retired.replacementFile })]),
        Match.exhaustive,
      ),
  })

const replacementViolations = (command: VerdictCommand): ReadonlyArray<Violation> =>
  command.retired.flatMap((retired) =>
    replacementViolationOf(
      retired,
      Option.fromNullishOr(command.replacements.find((file) => file.file === retired.replacementFile)),
    )
  )

const typeViolations = (command: VerdictCommand): ReadonlyArray<Violation> =>
  command.typeErrors.map((file) => new TypeErrorInFile({ file }))

const heldKeys = (command: VerdictCommand): ReadonlyArray<string> => command.held.map((held) => held.key)

const heldFailures = (command: VerdictCommand): ReadonlyArray<ObservedCase> =>
  command.observed
    .filter((observed) => has(heldKeys(command), observed.key))
    .filter((observed) => observed.outcome === 'failed')

const RULES: ReadonlyArray<{ readonly pattern: RegExp; readonly category: TriageCategory }> = [
  { pattern: /microstep|macrostep/i, category: 'microstep count' },
  { pattern: /react|server snapshot/i, category: 'react server snapshot' },
  { pattern: /persist|snapshot|serializ|hydrat/i, category: 'persisted shape' },
  { pattern: /timing|order|deadline|clock/i, category: 'timing/order' },
  { pattern: /async|error|reject|throw|promise/i, category: 'async/error propagation' },
  { pattern: /_|internal|private|system\./i, category: 'internal member' },
]

/** Exactly one category per failure: the first rule that matches, else the last category. */
const categoryOf = (message: string): TriageCategory =>
  Option.match(Option.fromNullishOr(RULES.find((rule) => rule.pattern.test(message))), {
    onNone: () => 'internal member',
    onSome: (rule) => rule.category,
  })

const categoryCounts = (command: VerdictCommand): ReadonlyArray<CategoryCount> =>
  TriageCategory.literals.map((category) =>
    new CategoryCount({
      category,
      count: heldFailures(command).filter((failure) => categoryOf(failure.message) === category).length,
    })
  )

const violations = (command: VerdictCommand): ReadonlyArray<Violation> => [
  ...unlisted(command),
  ...modeMismatches(command),
  ...replacementViolations(command),
  ...typeViolations(command),
]

const countBy = (command: VerdictCommand, outcome: ObservedOutcome): number =>
  command.observed.filter((observed) => observed.outcome === outcome).length

const refused = (command: VerdictCommand): LaneVerdict =>
  LaneRefused.make({ violations: violations(command), categories: categoryCounts(command) })

const holds = (command: VerdictCommand): LaneVerdict =>
  LaneHolds.make({
    passed: countBy(command, 'passed'),
    skipped: countBy(command, 'skipped'),
    todo: countBy(command, 'todo'),
    retired: command.retired.length,
    categories: categoryCounts(command),
  })

/** The lane's verdict: holds every disposed case, or refuses and names each violation (KTD5.6). */
export const laneVerdict = Workflow.make({
  command: VerdictCommand,
  decision: LaneVerdict,
  error: Schema.Never,
  decide: (command): Result.Result<LaneVerdict, never> =>
    Result.succeed(
      Match.value(violations(command).length === 0).pipe(
        Match.when(true, () => holds(command)),
        Match.when(false, () => refused(command)),
        Match.exhaustive,
      ),
    ),
})
