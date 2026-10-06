import { Array as Arr, Effect, Option, Order, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import { makeDiagramId } from './diagram-id.js'
import type { DiagramId } from './Diagram.schema.js'
import type { DiagramConfig } from './DiagramConfig.schema.js'
import { ModuleImportError, UnrecognizedModuleError } from './DiagramError.schema.js'
import { importModule } from './module-loader.js'
import { isObjectLike, type Raw, type RawObject, symbolValueOf } from './shape.js'
import { WorkflowSchemasLike, type WorkflowSchemasLike as WorkflowSchemas } from './WorkflowSchemas.schema.js'

const WORKFLOW_SCHEMAS_KEY = Symbol.for('@systemfsoftware/effect-cell-types/WorkflowSchemas')

export interface DiscoveredWorkflow {
  readonly id: DiagramId
  readonly module: string
  readonly name: string
  readonly title: string
  readonly schemas: WorkflowSchemas
}

export interface DiscoverOptions {
  readonly cwd: string
  readonly config: DiagramConfig
}

export type DiscoveryError = ModuleImportError | UnrecognizedModuleError | PlatformError

const asObjectLike = (value: Raw): object | undefined => isObjectLike(value) ? value : undefined

const workflowSchemasOf = (value: Raw): Option.Option<WorkflowSchemas> =>
  Option.flatMap(
    Option.flatMap(Option.fromNullishOr(asObjectLike(value)), symbolValueOf(WORKFLOW_SCHEMAS_KEY)),
    (raw) => Schema.decodeUnknownOption(WorkflowSchemasLike)(raw),
  )

const workflowDiscovered = (
  relative: string,
  modulePath: string,
  name: string,
  schemas: WorkflowSchemas,
): DiscoveredWorkflow => ({
  id: makeDiagramId(`${relative}-${name}`),
  module: modulePath,
  name,
  title: name,
  schemas,
})

const toDiscovered = (
  relative: string,
  modulePath: string,
  name: string,
  value: Raw,
): ReadonlyArray<DiscoveredWorkflow> =>
  Option.match(workflowSchemasOf(value), {
    onNone: () => [],
    onSome: (schemas) => [workflowDiscovered(relative, modulePath, name, schemas)],
  })

const classifyModule = (
  cwd: string,
  modulePath: string,
  path: Path.Path,
  namespace: RawObject,
): ReadonlyArray<DiscoveredWorkflow> => {
  const relative = path.relative(cwd, modulePath)
  return Arr.flatMap(Object.entries(namespace), (entry) => toDiscovered(relative, modulePath, entry[0], entry[1]))
}

const expandGlobs = (
  options: DiscoverOptions,
): Effect.Effect<ReadonlyArray<string>, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* Effect.service(FileSystem.FileSystem)
    const path = yield* Effect.service(Path.Path)
    const groups = yield* Effect.forEach(
      options.config.modules,
      (pattern) => fs.glob(pattern, { root: options.cwd }),
      { concurrency: 1 },
    )
    const joined = Arr.map(
      Arr.flatMap(groups, (group) => group),
      (entry) => path.isAbsolute(entry) ? entry : path.join(options.cwd, entry),
    )
    return Arr.sort(Order.String)(Arr.dedupe(joined))
  })

const discoverModule = (
  options: DiscoverOptions,
  path: Path.Path,
  modulePath: string,
): Effect.Effect<ReadonlyArray<DiscoveredWorkflow>, ModuleImportError | UnrecognizedModuleError> =>
  Effect.gen(function*() {
    const namespace = yield* importModule(modulePath)
    const found = classifyModule(options.cwd, modulePath, path, namespace)
    if (found.length === 0) {
      return yield* UnrecognizedModuleError.make({ module: modulePath })
    }
    return found
  })

export const discover = (
  options: DiscoverOptions,
): Effect.Effect<ReadonlyArray<DiscoveredWorkflow>, DiscoveryError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Effect.service(Path.Path)
    const modulePaths = yield* expandGlobs(options)
    const groups = yield* Effect.forEach(
      modulePaths,
      (modulePath) => discoverModule(options, path, modulePath),
      { concurrency: 1 },
    )
    return Arr.sortWith(Arr.flatMap(groups, (group) => group), (discovered) => discovered.id, Order.String)
  })
