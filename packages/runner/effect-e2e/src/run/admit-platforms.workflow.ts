import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

const AdmitPlatformsTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/AdmitPlatforms')

/** The platforms a test can declare it runs on (requirements AC-2.5, §7). */
export const TestPlatform = Schema.Literals(['web', 'ios', 'android'])
export type TestPlatform = typeof TestPlatform.Type

export class AdmitPlatforms extends Schema.TaggedClass<AdmitPlatforms>()('AdmitPlatforms', {
  declared: TestPlatform.pipe(Schema.NonEmptyArray, Schema.Option),
  platform: TestPlatform,
  target: Schema.String,
}) {
  static readonly [Workflow.InstrumentationBrand] = { platform: 'app.e2e.run.target-platform' } as const
}

export class Admitted extends Schema.TaggedClass<Admitted>()('Admitted', {}) {
  readonly [AdmitPlatformsTypeId] = AdmitPlatformsTypeId
}

export class PlatformSkipped extends Schema.TaggedClass<PlatformSkipped>()('PlatformSkipped', {
  reason: Schema.String,
}) {
  readonly [AdmitPlatformsTypeId] = AdmitPlatformsTypeId
}

export const PlatformAdmission = Schema.Union([Admitted, PlatformSkipped])
export type PlatformAdmission = typeof PlatformAdmission.Type

const reasonOf = (command: AdmitPlatforms, declared: Arr.NonEmptyReadonlyArray<TestPlatform>): string =>
  `declared for ${declared.join(', ')}; target "${command.target}" runs on ${command.platform}`

const admissionOf = (command: AdmitPlatforms) => (declared: Arr.NonEmptyReadonlyArray<TestPlatform>) =>
  Match.value(Arr.contains(declared, command.platform)).pipe(
    Match.when(true, (): PlatformAdmission => new Admitted({})),
    Match.when(false, (): PlatformAdmission => new PlatformSkipped({ reason: reasonOf(command, declared) })),
    Match.exhaustive,
  )

const decide = (command: AdmitPlatforms): Result.Result<PlatformAdmission, never> =>
  Result.succeed(
    Option.match(command.declared, {
      onNone: (): PlatformAdmission => new Admitted({}),
      onSome: admissionOf(command),
    }),
  )

export const admitPlatforms = Workflow.make({
  command: AdmitPlatforms,
  decision: PlatformAdmission,
  error: Schema.Never,
  decide,
})
