import { Console, Effect, FileSystem, Option, Path, type PlatformError, Result, Runtime, Schema } from 'effect'
import { Command, Flag } from 'effect/cli'
import { decide, type Decision } from './layers/check.ts'
import {
  LayerMap,
  LayersRefused,
  type Manifest,
  ManifestDoc,
  ManifestRefused,
  MapRefused,
  toManifest,
} from './layers/layers.schema.ts'

import { assignments } from './layers/list.ts'
import { failureLines, listJson, listLines, passLines } from './report.ts'

export { failureLines, LayersRefused }

class PrintedRefusal extends LayersRefused {
  override readonly [Runtime.errorReported] = false
}

const refuseAt = (at: string) => (error: { readonly message: string }) =>
  Effect.fail(new PrintedRefusal({ findings: [MapRefused.make({ path: at, reason: error.message })] }))

const decodeMapText = Schema.decodeUnknownEffect(Schema.fromJsonString(LayerMap))
const decodeManifestText = Schema.decodeUnknownEffect(Schema.fromJsonString(ManifestDoc))

const SKIPPED: Record<string, true> = { node_modules: true, dist: true }

const walked = (name: string): boolean => !name.startsWith('.') && SKIPPED[name] !== true

const manifestLeaf = (name: string, full: string): readonly string[] => name === 'package.json' ? [full] : []

const manifestPaths = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
): Effect.Effect<readonly string[], PlatformError.PlatformError> =>
  Effect.gen(function*() {
    const names = (yield* fs.readDirectory(dir)).filter(walked).toSorted()
    const found = yield* Effect.forEach(names, (name) =>
      Effect.gen(function*() {
        const full = path.join(dir, name)
        const info = yield* fs.stat(full)
        return info.type === 'Directory' ? yield* manifestPaths(fs, path, full) : manifestLeaf(name, full)
      }), { concurrency: 8 })
    return found.flat()
  })

const readMap = (root: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const file = path.join(root, 'package-layers.json')
    return yield* fs.readFileString(file).pipe(
      Effect.flatMap((text) => decodeMapText(text, { onExcessProperty: 'error' })),
      Effect.catch(refuseAt('package-layers.json')),
    )
  })

const readManifest = (fs: FileSystem.FileSystem, relative: string, file: string) =>
  fs.readFileString(file).pipe(
    Effect.flatMap((text) => decodeManifestText(text)),
    Effect.map((doc) => toManifest({ path: relative, doc })),
    Effect.mapError((error) => ManifestRefused.make({ path: relative, reason: error.message })),
    Effect.result,
  )

const readManifests = (root: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const packages = path.join(root, 'packages')
    const files = yield* manifestPaths(fs, path, packages).pipe(
      Effect.catch(refuseAt('packages')),
    )
    const results = yield* Effect.forEach(files, (file) => readManifest(fs, path.relative(root, file), file), {
      concurrency: 8,
    })
    return {
      manifests: results.filter(Result.isSuccess).map((result): Manifest => result.success),
      refused: results.filter(Result.isFailure).map((result) => result.failure),
    }
  })

export type CheckEnv = FileSystem.FileSystem | Path.Path

/** The whole check over one tree: decoded inputs in, the decision or a refusal out. */
export const runCheck = (root: string): Effect.Effect<Decision, LayersRefused, CheckEnv> =>
  Effect.gen(function*() {
    const map = yield* readMap(root)
    const { manifests, refused } = yield* readManifests(root)
    const decision = decide({ map, manifests, refused })
    return decision.findings.length === 0
      ? decision
      : yield* new PrintedRefusal({ findings: decision.findings })
  })

const resolveRoot = (root: Option.Option<string>) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    return yield* Option.match(root, {
      onNone: () => path.fromFileUrl(new URL('../../../', import.meta.url)),
      onSome: (given) => Effect.succeed(path.resolve(given)),
    })
  })

const root = Flag.Directory('root', { mustExist: true }).pipe(
  Flag.withDescription('The repository root to check; defaults to the tree holding this tool'),
  Flag.optional,
)

const check = Command.make('check', { root }, (input) =>
  Effect.gen(function*() {
    const at = yield* resolveRoot(input.root)
    yield* runCheck(at).pipe(
      Effect.matchEffect({
        onFailure: (refused) =>
          Console.error(failureLines(refused.findings).join('\n')).pipe(Effect.andThen(Effect.fail(refused))),
        onSuccess: (decision) => Console.log(passLines(decision).join('\n')),
      }),
    )
  })).pipe(
    Command.withDescription(
      'Check package-layers.json and every packages/**/package.json: each present package in exactly one category, no forbidden runtime or peer edge',
    ),
  )

const list = Command.make('list', {
  root,
  json: Flag.Boolean('json').pipe(
    Flag.withDefault(false),
    Flag.withDescription('Print the assignments as a JSON array'),
  ),
}, (input) =>
  Effect.gen(function*() {
    const rows = assignments(yield* readMap(yield* resolveRoot(input.root)))
    yield* Console.log(input.json ? listJson(rows) : listLines(rows).join('\n'))
  })).pipe(Command.withDescription('Print each package in package-layers.json with its category'))

export const cli = Command.make('package-layers').pipe(
  Command.withDescription('The package layer map and its checks'),
  Command.withSubcommands([check, list]),
)
