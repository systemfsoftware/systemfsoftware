import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const CaseKeyVerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/xstate-upstream-oracle/CaseKeyVerdict')
type CaseKeyVerdictTypeId = typeof CaseKeyVerdictTypeId

/** A case identity before keys are assigned (KTD5.4). */
export class CaseIdentity extends Schema.TaggedClass<CaseIdentity>()('CaseIdentity', {
  file: Schema.String,
  ancestors: Schema.Array(Schema.String),
  title: Schema.String,
}) {}

export class CaseKeysAssigned extends Schema.TaggedClass<CaseKeysAssigned>()('CaseKeysAssigned', {
  keys: Schema.Array(Schema.String),
}) {
  readonly [CaseKeyVerdictTypeId] = CaseKeyVerdictTypeId
}

export class CaseReportEmpty extends Schema.TaggedClass<CaseReportEmpty>()('CaseReportEmpty', {}) {
  readonly [CaseKeyVerdictTypeId] = CaseKeyVerdictTypeId
}

export const CaseKeyVerdict = Schema.Union([CaseKeysAssigned, CaseReportEmpty])
export type CaseKeyVerdict = typeof CaseKeyVerdict.Type

export class CaseKeyCommand extends Schema.TaggedClass<CaseKeyCommand>()('CaseKeyCommand', {
  cases: Schema.Array(CaseIdentity),
}) {
  static readonly [Workflow.InstrumentationBrand] = { cases: 'app.oracle.cases' } as const
}

const identityText = (identity: CaseIdentity): string =>
  [identity.file, ...identity.ancestors, identity.title].join(' > ')

const sameIdentity = (a: CaseIdentity, b: CaseIdentity): boolean =>
  [a.file === b.file, a.title === b.title, a.ancestors.join(' > ') === b.ancestors.join(' > ')].every(Boolean)

/**
 * Assigns each case its occurrence index by counting the identical full titles
 * before it (KTD5.4). The index of an identical title depends only on the other
 * identical titles, so the multiset of keys is independent of the report order.
 */
const caseKeys = (cases: readonly CaseIdentity[]): readonly string[] =>
  cases.map((identity, index) =>
    `${identityText(identity)} :: ${cases.slice(0, index).filter((prior) => sameIdentity(prior, identity)).length}`
  )

export const assignCaseKeys = Workflow.make({
  command: CaseKeyCommand,
  decision: CaseKeyVerdict,
  error: Schema.Never,
  decide: (command): Result.Result<CaseKeyVerdict, never> =>
    Result.succeed(
      Match.value(command.cases.length === 0).pipe(
        Match.when(true, () => CaseReportEmpty.make({})),
        Match.when(false, () => CaseKeysAssigned.make({ keys: caseKeys(command.cases) })),
        Match.exhaustive,
      ),
    ),
})
