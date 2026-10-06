import { Array as Arr, Effect, HashSet, Option } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import type { DiagramError } from './build.js'
import { loadDiagramConfig } from './config.js'
import { discover } from './discover.js'
import { renderDiscovered } from './render.js'
import { type DiagramReport, type DiagramRunOptions, machineCountOf, workflowCountOf } from './report.js'

type ArtifactStatus =
  | { readonly status: 'ok'; readonly file: string }
  | { readonly status: 'stale'; readonly file: string }
  | { readonly status: 'missing'; readonly file: string }

const staleOrOk = (actual: string, expected: string, file: string): ArtifactStatus =>
  actual === expected ? { status: 'ok', file } : { status: 'stale', file }

const statusOf = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  outDir: string,
  file: string,
  expected: string | undefined,
): Effect.Effect<ArtifactStatus, PlatformError> =>
  Effect.gen(function*() {
    const target = path.join(outDir, file)
    const content = yield* fs.readFileString(target).pipe(Effect.option)
    return Option.match(content, {
      onNone: (): ArtifactStatus => ({ status: 'missing', file }),
      onSome: (actual): ArtifactStatus => staleOrOk(actual, expected ?? '', file),
    })
  })

const messageOf = (artifact: ArtifactStatus): string =>
  artifact.status === 'missing' ? `missing artifact: ${artifact.file}` : `stale artifact: ${artifact.file}`

const messagesOf = (statuses: ReadonlyArray<ArtifactStatus>, orphans: ReadonlyArray<string>): ReadonlyArray<string> => [
  ...Arr.map(Arr.filter(statuses, (artifact) => artifact.status !== 'ok'), messageOf),
  ...Arr.map(orphans, (file) => `orphan artifact: ${file}`),
]

const exitCodeOf = (messages: ReadonlyArray<string>): number => messages.length === 0 ? 0 : 1

const summaryOf = (
  messages: ReadonlyArray<string>,
  machines: number,
  workflows: number,
  files: number,
): ReadonlyArray<string> =>
  messages.length === 0 ? [`ok: ${machines} machines, ${workflows} workflows, ${files} files`] : messages

export const check = (
  options: DiagramRunOptions,
): Effect.Effect<DiagramReport, DiagramError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const config = yield* loadDiagramConfig(options.cwd)
    const discovered = yield* discover({ cwd: options.cwd, config })
    const rendered = yield* renderDiscovered(discovered)
    const fs = yield* Effect.service(FileSystem.FileSystem)
    const path = yield* Effect.service(Path.Path)
    const outDir = path.join(options.cwd, config.outDir)
    const expectedFiles = [...rendered.files.keys()]
    const actual = yield* fs.readDirectory(outDir).pipe(Effect.orElseSucceed(() => []))
    const statuses = yield* Effect.forEach(
      expectedFiles,
      (file) => statusOf(fs, path, outDir, file, rendered.files.get(file)),
      { concurrency: 1 },
    )
    const expectedSet = HashSet.fromIterable(expectedFiles)
    const orphans = Arr.filter(actual, (file) => !HashSet.has(expectedSet, file))
    const messages = messagesOf(statuses, orphans)
    const machines = machineCountOf(discovered)
    const workflows = workflowCountOf(discovered)
    return {
      exitCode: exitCodeOf(messages),
      messages: summaryOf(messages, machines, workflows, expectedFiles.length),
      machines,
      workflows,
      files: expectedFiles.length,
    }
  })
