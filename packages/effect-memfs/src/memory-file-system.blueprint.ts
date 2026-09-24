import { Blueprint } from '@systemfsoftware/effect-cell-types'
import { Context, Effect, Layer } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Handle from './memory-file-system.handle.js'
import { type Contents, MemoryFileSystemSpec } from './MemoryFileSystemSpec.schema.js'
import { Watcher } from './watcher.service.js'

export { type Contents, MemoryFileSystemSpec }

export const TypeId = Symbol.for('~systemfsoftware/memfs/MemoryFileSystemBlueprint')
export type TypeId = typeof TypeId

export const effect = (spec: MemoryFileSystemSpec): Effect.Effect<FileSystem.FileSystem> =>
  Effect.map(Handle.make(spec), Handle.fileSystem)

const servicesOf = (handle: Handle.MemoryFileSystem): Context.Context<FileSystem.FileSystem | Watcher> =>
  Context.make(FileSystem.FileSystem, Handle.fileSystem(handle)).pipe(Context.add(Watcher, Handle.watcher(handle)))

export const layer = (spec: MemoryFileSystemSpec): Layer.Layer<FileSystem.FileSystem | Watcher> =>
  Layer.effectContext(Effect.map(Handle.make(spec), servicesOf))

const MemoryFileSystem = Blueprint.make<MemoryFileSystemSpec>()(TypeId).steps({
  steps: {
    withContents: (spec, contents: Contents): MemoryFileSystemSpec =>
      new MemoryFileSystemSpec({ cwd: spec.cwd, contents }),
    withCwd: (spec, cwd: string): MemoryFileSystemSpec => new MemoryFileSystemSpec({ cwd, contents: spec.contents }),
  },
  targets: { effect, layer },
})

export type MemoryFileSystemBlueprint = Blueprint.Of<typeof MemoryFileSystem>

export const isMemoryFileSystemBlueprint = MemoryFileSystem.is

export const make = (contents: Contents = {}): MemoryFileSystemBlueprint =>
  MemoryFileSystem.of(new MemoryFileSystemSpec({ cwd: '/', contents }))

export const withContents = MemoryFileSystem.operations.withContents

export const withCwd = MemoryFileSystem.operations.withCwd
