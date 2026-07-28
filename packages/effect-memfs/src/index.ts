import type * as FileSystem from '@effect/platform/FileSystem'
import type { Layer } from 'effect'
import { layer, layerWith, make } from './memory-file-system.adapter.js'
import type { Contents } from './memory-file-system.shape.js'

// Not `export * as`: API Extractor cannot follow a namespace re-export and emits
// the members undeclared, degrading every one to `any` in the rollup and API report.
export const MemoryFileSystem: {
  readonly layer: Layer.Layer<FileSystem.FileSystem>
  readonly layerWith: (contents: Contents) => Layer.Layer<FileSystem.FileSystem>
  readonly make: (contents?: Contents, opts?: { cwd: string }) => FileSystem.FileSystem
} = { layer, layerWith, make }

export type { Contents } from './memory-file-system.shape.js'
