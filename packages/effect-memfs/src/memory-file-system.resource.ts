import { Resource } from '@systemfsoftware/effect-cell-types'
import { Effect, Layer } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Handle from './memory-file-system.handle.js'
import { type Contents, MemoryFileSystemSpec } from './MemoryFileSystemSpec.schema.js'

export { type Contents, MemoryFileSystemSpec }

export const TypeId = Symbol.for('~systemfsoftware/memfs/MemoryFileSystemResource')
export type TypeId = typeof TypeId

export const effect = (spec: MemoryFileSystemSpec): Effect.Effect<FileSystem.FileSystem> =>
  Effect.sync(() => Handle.fileSystem(Handle.make(spec)))

export const layer = (spec: MemoryFileSystemSpec): Layer.Layer<FileSystem.FileSystem> =>
  Layer.effect(FileSystem.FileSystem, effect(spec))

const MemoryFileSystem = Resource.make<MemoryFileSystemSpec>()({
  typeId: TypeId,
  combinators: {
    withContents: (spec, contents: Contents): MemoryFileSystemSpec =>
      new MemoryFileSystemSpec({ cwd: spec.cwd, contents }),
    withCwd: (spec, cwd: string): MemoryFileSystemSpec => new MemoryFileSystemSpec({ cwd, contents: spec.contents }),
  },
  projections: { effect, layer },
})

export type MemoryFileSystemResource = Resource.Of<typeof MemoryFileSystem>

export const isMemoryFileSystemResource = MemoryFileSystem.is

export const make = (contents: Contents = {}): MemoryFileSystemResource =>
  MemoryFileSystem.of(new MemoryFileSystemSpec({ cwd: '/', contents }))

export const withContents = MemoryFileSystem.combinators.withContents

export const withCwd = MemoryFileSystem.combinators.withCwd
