import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match } from 'effect'
import * as Result from 'effect/Result'
import { MountPackageFile, PathMounted, UnexpectedAbsoluteFixturePath } from './mount-package-file.schema.js'

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
