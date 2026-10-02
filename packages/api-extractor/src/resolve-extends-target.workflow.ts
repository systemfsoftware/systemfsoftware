import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

const TargetTypeId: unique symbol = Symbol.for('@systemfsoftware/api-extractor/ExtendsTargetDecision')
type TargetTypeId = typeof TargetTypeId

export class RelativeExtendsTarget extends Schema.TaggedClass<RelativeExtendsTarget>()('RelativeExtendsTarget', {
  specifier: Schema.String,
  fromFolder: Schema.String,
}) {
  readonly [TargetTypeId] = TargetTypeId
}

export class ModuleExtendsTarget extends Schema.TaggedClass<ModuleExtendsTarget>()('ModuleExtendsTarget', {
  specifier: Schema.String,
  fromFolder: Schema.String,
}) {
  readonly [TargetTypeId] = TargetTypeId
}

export const ExtendsTargetDecision = Schema.Union([RelativeExtendsTarget, ModuleExtendsTarget])
export type ExtendsTargetDecision = typeof ExtendsTargetDecision.Type

export class ExtendsTarget extends Schema.TaggedClass<ExtendsTarget>()('ExtendsTarget', {
  specifier: Schema.String,
  fromFolder: Schema.String,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const relativeSpecifierPattern = /^\.\.?[\\/]/

const isRelativeSpecifier = (specifier: string): boolean => relativeSpecifierPattern.test(specifier)

export const resolveExtendsTarget = Workflow.make({
  command: ExtendsTarget,
  decision: ExtendsTargetDecision,
  error: Schema.Never,
  decide: (command: ExtendsTarget): Result.Result<ExtendsTargetDecision, never> =>
    Match.value(isRelativeSpecifier(command.specifier)).pipe(
      Match.when(
        true,
        () =>
          Result.succeed(
            new RelativeExtendsTarget({ specifier: command.specifier, fromFolder: command.fromFolder }),
          ),
      ),
      Match.when(
        false,
        () =>
          Result.succeed(
            new ModuleExtendsTarget({ specifier: command.specifier, fromFolder: command.fromFolder }),
          ),
      ),
      Match.exhaustive,
    ),
})
