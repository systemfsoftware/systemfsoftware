import { layerTransformerSchema, OpenApiGenerator } from '@effect/openapi-generator/OpenApiGenerator'
import { NodeFileSystem } from '@effect/platform-node'
import { mount } from '@systemfsoftware/effect-contract/http'
import { vi } from '@systemfsoftware/vitest'
import { Effect, FileSystem, Layer, Schema } from 'effect'
import type { HttpClient } from 'effect/http'
import type * as HttpClientError from 'effect/http/HttpClientError'
import type { SchemaError } from 'effect/Schema'
import { fixtureRegistry } from './http.fixture.js'

const generatedDirectory = new URL('../../.generated/', import.meta.url)
const clientPath = new URL('client.ts', generatedDirectory).pathname

export const generatedClientUrl: URL = new URL('client.ts', generatedDirectory)

export interface GeneratedClientError {
  readonly _tag: string
  readonly cause: Schema.Json
}

export interface GeneratedClientCall {
  readonly params?: Schema.Json
  readonly payload?: Schema.Json
}

export interface GeneratedClient {
  readonly [operation: string]: (
    options: GeneratedClientCall,
  ) => Effect.Effect<Schema.Json, GeneratedClientError | HttpClientError.HttpClientError | SchemaError>
}

export interface GeneratedClientModule {
  readonly make: (httpClient: HttpClient.HttpClient) => GeneratedClient
}

export const generationLayer: Layer.Layer<FileSystem.FileSystem | OpenApiGenerator> = NodeFileSystem.layer.pipe(
  Layer.merge(layerTransformerSchema),
)

export const generateClient = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const generator = yield* OpenApiGenerator
  const { document } = mount(fixtureRegistry)
  const clientSource = yield* generator.generate(document, { name: 'FixtureClient', format: 'httpclient' })
  const documentJson = yield* Effect.orDie(
    Schema.encodeUnknownEffect(Schema.fromJsonString(Schema.Json))(document),
  )
  yield* fs.makeDirectory(generatedDirectory.pathname, { recursive: true })
  yield* fs.writeFileString(clientPath, clientSource)
  return { clientSource, documentJson }
})

export const loadGeneratedClient = (): Promise<GeneratedClientModule> =>
  vi.importActual<GeneratedClientModule>(generatedClientUrl.pathname)
