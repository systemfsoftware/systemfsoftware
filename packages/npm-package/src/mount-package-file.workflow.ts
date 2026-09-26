import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const PackageTreeMountTypeId: unique symbol = Symbol.for('@systemfsoftware/npm-package/PackageTreeMount')
type PackageTreeMountTypeId = typeof PackageTreeMountTypeId

export class PathMounted extends Schema.TaggedClass<PathMounted>()('PathMounted', {
  mountedKey: Schema.String,
}) {
  readonly [PackageTreeMountTypeId] = PackageTreeMountTypeId
}

export class UnexpectedAbsoluteFixturePath extends Schema.TaggedError<UnexpectedAbsoluteFixturePath>()(
  'UnexpectedAbsoluteFixturePath',
  { key: Schema.String },
) {
  readonly [PackageTreeMountTypeId] = PackageTreeMountTypeId

  override get message(): string {
    return `Unexpected absolute fixture path: ${this.key}`
  }
}

export class MountPackageFile extends Schema.TaggedClass<MountPackageFile>()('MountPackageFile', {
  key: Schema.String,
  packageName: Schema.String,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const packagePrefixOf = (packageName: string): string => `/node_modules/${packageName}/`

const mountAbsoluteKey = (
  command: MountPackageFile,
): Result.Result<PathMounted, UnexpectedAbsoluteFixturePath> =>
  Match.value(command.key.startsWith(packagePrefixOf(command.packageName))).pipe(
    Match.when(true, () => Result.succeed(new PathMounted({ mountedKey: command.key }))),
    Match.when(false, () => Result.fail(new UnexpectedAbsoluteFixturePath({ key: command.key }))),
    Match.exhaustive,
  )

export const mountPackageFile = Workflow.make({
  command: MountPackageFile,
  decision: PathMounted,
  error: UnexpectedAbsoluteFixturePath,
  decide: (command): Result.Result<PathMounted, UnexpectedAbsoluteFixturePath> =>
    Match.value(command.key.startsWith('/')).pipe(
      Match.when(true, () => mountAbsoluteKey(command)),
      Match.when(false, () =>
        Result.succeed(
          new PathMounted({ mountedKey: `${packagePrefixOf(command.packageName)}${command.key}` }),
        )),
      Match.exhaustive,
    ),
})
