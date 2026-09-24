import { Resource } from '@systemfsoftware/effect-cell-types'
import { dual } from 'effect/Function'
import { MemoryFileSystem } from './memory-file-system.handle.js'
import { type Contents, MemoryFileSystemSpec } from './MemoryFileSystemSpec.schema.js'

export { type Contents, MemoryFileSystemSpec }

export const MemoryFileSystems = Resource.make({ spec: MemoryFileSystemSpec, handle: MemoryFileSystem })

export type MemoryFileSystemResource = Resource.Of<typeof MemoryFileSystems>

export const make = (contents: Contents): MemoryFileSystemResource =>
  MemoryFileSystems.of(new MemoryFileSystemSpec({ cwd: '/', contents }))

export const withContents: {
  (contents: Contents): (self: MemoryFileSystemResource) => MemoryFileSystemResource
  (self: MemoryFileSystemResource, contents: Contents): MemoryFileSystemResource
} = dual(
  2,
  (self: MemoryFileSystemResource, contents: Contents): MemoryFileSystemResource =>
    MemoryFileSystems.of(new MemoryFileSystemSpec({ cwd: self.spec.cwd, contents })),
)

export const withCwd: {
  (cwd: string): (self: MemoryFileSystemResource) => MemoryFileSystemResource
  (self: MemoryFileSystemResource, cwd: string): MemoryFileSystemResource
} = dual(
  2,
  (self: MemoryFileSystemResource, cwd: string): MemoryFileSystemResource =>
    MemoryFileSystems.of(new MemoryFileSystemSpec({ cwd, contents: self.spec.contents })),
)
