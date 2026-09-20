import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import { layer } from './MemoryFileSystemAdapter.js'
import { make } from './MemoryFileSystemMake.js'
import type { Contents } from './MemoryFileSystemShape.js'

export { make } from './MemoryFileSystemMake.js'

export const layerWith = (contents: Contents): Layer.Layer<FileSystem.FileSystem> =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.sync(() => make(contents)),
  )

// Not `export * as`: API Extractor cannot follow a namespace re-export and emits
// the members undeclared, degrading every one to `any` in the rollup and API report.
export const MemoryFileSystem: {
  readonly layer: Layer.Layer<FileSystem.FileSystem>
  readonly layerWith: (contents: Contents) => Layer.Layer<FileSystem.FileSystem>
  readonly make: (contents?: Contents, opts?: { cwd: string }) => FileSystem.FileSystem
} = { layer, layerWith, make }

export type { Contents } from './MemoryFileSystemShape.js'
