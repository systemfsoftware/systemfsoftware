import { Effect, Layer } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import * as Handle from './memory-file-system.handle.js'
import { type Contents, MemoryFileSystemSpec } from './MemoryFileSystemSpec.schema.js'

export { type Contents, MemoryFileSystemSpec }

const TypeId = Symbol.for('~systemfsoftware/memfs/MemoryFileSystemResource')
export type TypeId = typeof TypeId

export interface MemoryFileSystemResource extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly spec: MemoryFileSystemSpec
  withContents(contents: Contents): MemoryFileSystemResource
  withCwd(cwd: string): MemoryFileSystemResource
  readonly effect: Effect.Effect<FileSystem.FileSystem>
  readonly layer: Layer.Layer<FileSystem.FileSystem>
}

export const effect = (spec: MemoryFileSystemSpec): Effect.Effect<FileSystem.FileSystem> =>
  Effect.sync(() => Handle.fileSystem(Handle.make(spec)))

export const layer = (spec: MemoryFileSystemSpec): Layer.Layer<FileSystem.FileSystem> =>
  Layer.effect(FileSystem.FileSystem, effect(spec))

const makeProto = (spec: MemoryFileSystemSpec): MemoryFileSystemResource => ({
  [TypeId]: TypeId,
  spec,
  withContents: (contents: Contents) => makeProto(new MemoryFileSystemSpec({ cwd: spec.cwd, contents })),
  withCwd: (cwd: string) => makeProto(new MemoryFileSystemSpec({ cwd, contents: spec.contents })),
  get effect() {
    return effect(spec)
  },
  get layer() {
    return layer(spec)
  },
  ...Prototype,
})

export const make = (contents: Contents = {}): MemoryFileSystemResource =>
  makeProto(new MemoryFileSystemSpec({ cwd: '/', contents }))
