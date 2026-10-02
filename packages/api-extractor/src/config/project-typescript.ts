import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import { dual } from 'effect/Function'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { NodePackageJsonFromString } from '../analyzer/graph/package-json.schema.js'
import { ancestorsNearestFirst, PACKAGE_FILE_NAME, readOptionalText } from './folder-walk.js'

const versionPattern = /^v?(\d+)\.(\d+)\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

type MajorMinor = readonly [number, number]

const majorThenMinorKey = (version: MajorMinor): number => version[0] * 1_000_000 + version[1]

const majorMinorOf = (version: string): Option.Option<MajorMinor> =>
  Option.map(
    Option.fromNullishOr(versionPattern.exec(version)),
    (found): MajorMinor => [Number(found[1]), Number(found[2])],
  )

const isNewerThan = (target: MajorMinor, bundled: MajorMinor): boolean =>
  majorThenMinorKey(target) > majorThenMinorKey(bundled)

const newerThan = (bundledVersion: string) => (targetVersion: string): Option.Option<string> =>
  Option.flatMap(
    majorMinorOf(bundledVersion),
    (bundled) =>
      Option.flatMap(
        majorMinorOf(targetVersion),
        (target) => Option.filter(Option.some(targetVersion), () => isNewerThan(target, bundled)),
      ),
  )

const resolveTypeScriptModule = Option.liftThrowable((projectFolder: string): string =>
  process.getBuiltinModule('module').createRequire(`${projectFolder}/`).resolve('typescript')
)

const versionOfContents = (contents: string): Option.Option<string> =>
  Option.flatMap(
    Schema.decodeOption(NodePackageJsonFromString)(contents),
    (manifest) => Option.fromNullishOr(manifest.version),
  )

type ManifestRead = Result.Result<Option.Option<string>, PlatformError>

const manifestExists = (read: ManifestRead): boolean =>
  Result.match(read, { onFailure: () => true, onSuccess: Option.isSome })

const readableTextOf = (read: ManifestRead): Option.Option<string> =>
  Result.match(read, { onFailure: () => Option.none<string>(), onSuccess: (text) => text })

/**
 * The target project's TypeScript version when upstream's compatibility heuristic notices it: a
 * newer major release, or the same major with a newer minor. The module is resolved from the
 * project folder and its version read from the nearest package manifest, exactly as upstream's
 * `_checkCompilerCompatibility` does; every resolution failure simply means "no notice".
 */
export const newerProjectTypeScriptVersion = dual<
  (
    bundledVersion: string,
  ) => (projectFolder: string) => Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path>,
  (
    projectFolder: string,
    bundledVersion: string,
  ) => Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path>
>(2, (projectFolder: string, bundledVersion: string): Effect.Effect<
  Option.Option<string>,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const resolved = resolveTypeScriptModule(projectFolder)
    const parents = Option.getOrElse(
      Option.map(resolved, (found) => ancestorsNearestFirst(path.dirname(found), path)),
      (): readonly string[] => [],
    )
    const manifests: ReadonlyArray<ManifestRead> = yield* Effect.forEach(
      parents,
      (folder) => Effect.result(readOptionalText(path.join(folder, PACKAGE_FILE_NAME), fs)),
      { concurrency: 1 },
    )
    const nearestVersion: Option.Option<string> = Option.flatMap(
      Option.flatMap(Arr.findFirst(manifests, manifestExists), readableTextOf),
      versionOfContents,
    )
    return Option.flatMap(nearestVersion, newerThan(bundledVersion))
  }))
