import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'

import type { ArtifactStoreShape } from './artifact-store.service.js'
import { ArtifactStore } from './artifact-store.service.js'
import type { Artifact } from './artifact.schema.js'
import { fileNameOf } from './artifact.schema.js'

export interface MemoryArtifactStoreOptions {
  readonly output: string
}

export interface MemoryArtifactStore extends ArtifactStoreShape {
  readonly read: (path: string) => Effect.Effect<Option.Option<Uint8Array>>
}

const pathOf = (output: string, artifact: Artifact): string =>
  [output, 'results', artifact.directory, fileNameOf(artifact.kind)].join('/').replace(/\/{2,}/g, '/')

export const make = (options: MemoryArtifactStoreOptions): Effect.Effect<MemoryArtifactStore> =>
  Effect.map(Ref.make(HashMap.empty<string, Uint8Array>()), (held) => ({
    put: (artifact) => {
      const at = pathOf(options.output, artifact)
      return Effect.as(Ref.update(held, HashMap.set(at, artifact.bytes)), { kind: artifact.kind, path: at })
    },
    read: (path) => Effect.map(Ref.get(held), (entries) => HashMap.get(entries, path)),
  }))

export const layer = (options: MemoryArtifactStoreOptions): Layer.Layer<ArtifactStore> =>
  Layer.effect(ArtifactStore)(make(options))
