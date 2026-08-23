import { Context, Effect, Layer } from 'effect'
import ts from 'typescript'

import type { ModuleKind } from './Problem.schema.js'

export interface ResolveModuleNameResult {
  readonly resolution: ts.ResolvedModuleFull | undefined
  readonly failedLookupLocations: readonly string[]
  readonly trace: readonly string[]
}

export interface TypescriptHostHandle {
  readonly resolveModuleName: (
    moduleSpecifier: string,
    importingFileName: string,
    resolutionMode: ts.ResolutionMode,
    noDtsResolution: boolean,
  ) => ResolveModuleNameResult
  readonly getSourceFileFromCacheOrRead: (fileName: string) => ts.SourceFile
  readonly getModuleKindForFile: (fileName: string) => ModuleKind
}

export interface TypescriptAdapterService {
  readonly createHosts: () => Effect.Effect<
    ReadonlyMap<'node10' | 'node16' | 'bundler', TypescriptHostHandle>,
    never
  >
}

export class TypescriptAdapter extends Context.Service<TypescriptAdapter, TypescriptAdapterService>()(
  '@systemfsoftware/arethetypeswrong/TypescriptAdapter',
) {}

export const TypescriptAdapterStub: Layer.Layer<TypescriptAdapter, never, never> = Layer.succeed(
  TypescriptAdapter,
  {
    createHosts: () => Effect.succeed(new Map()),
  },
)
