import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import { type ConfigError, loadDiagramConfig } from './config.js'
import type { DiagramRenderError } from './DiagramError.schema.js'
import { discover, type DiscoveryError } from './discover.js'
import { renderDiscovered } from './render.js'
import { type DiagramReport, type DiagramRunOptions, machineCountOf, workflowCountOf } from './report.js'

export type DiagramError = ConfigError | DiscoveryError | DiagramRenderError

const writeArtifact = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  outDir: string,
  file: string,
  content: string,
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function*() {
    const target = path.join(outDir, file)
    yield* fs.makeDirectory(path.dirname(target), { recursive: true })
    yield* fs.writeFileString(target, content)
  })

export const build = (
  options: DiagramRunOptions,
): Effect.Effect<DiagramReport, DiagramError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const config = yield* loadDiagramConfig(options.cwd)
    const discovered = yield* discover({ cwd: options.cwd, config })
    const rendered = yield* renderDiscovered(discovered)
    const fs = yield* Effect.service(FileSystem.FileSystem)
    const path = yield* Effect.service(Path.Path)
    const outDir = path.join(options.cwd, config.outDir)
    yield* Effect.forEach(
      [...rendered.files],
      (entry) => writeArtifact(fs, path, outDir, entry[0], entry[1]),
      { concurrency: 1 },
    )
    const machines = machineCountOf(discovered)
    const workflows = workflowCountOf(discovered)
    return {
      exitCode: 0,
      messages: [`wrote ${rendered.files.size} files for ${machines} machines and ${workflows} workflows`],
      machines,
      workflows,
      files: rendered.files.size,
    }
  })
