import type { Effect } from 'effect'
import type { Package } from '../CreatePackage.js'
import type { Analysis, Problem, ResolutionKind, ResolutionOption } from '../Types.js'
import type { CompilerHosts } from './MultiCompilerHost.js'

/** @internal */
export interface CheckDependenciesContext<EnumerateFiles extends boolean = false> extends CheckExecutionContext {
  subpath: string
  resolutionKind: ResolutionKind
  resolutionOption: ResolutionOption
  fileName: EnumerateFiles extends true ? string : undefined
}

/** @internal */
export interface CheckExecutionContext {
  pkg: Package
  hosts: CompilerHosts
  entrypoints: Analysis['entrypoints']
  programInfo: Analysis['programInfo']
}

// Interface types are not assignable to Serializable due to missing index signature.
// This breaks them down into an equivalently structured object type, which have
// implicit index signatures for assignability purposes.
type Structure<T> = T extends (...args: never) => unknown ? T : { [K in keyof T]: Structure<T[K]> }

/** @internal */
export type EnsureSerializable<T> = [T] extends [Serializable] ? T
  : [T] extends [object] ? Structure<T> extends Serializable ? T
    : never
  : never

/** @internal */
export type Serializable =
  | string
  | number
  | null
  | undefined
  | boolean
  | { [key: string]: Serializable }
  | readonly Serializable[]

/** @internal */
export interface AnyCheck {
  name: string
  enumerateFiles?: boolean
  dependencies(context: CheckDependenciesContext<boolean>): EnsureSerializable<readonly unknown[]>
  gather?(dependencies: readonly unknown[], context: CheckExecutionContext): Effect.Effect<unknown>
  execute(
    dependencies: readonly unknown[],
    context: CheckExecutionContext,
    gathered: unknown,
  ): Problem[] | Problem | undefined
}

/** @internal */
export function defineCheck<
  const Dependencies extends readonly unknown[],
  EnumerateFiles extends boolean,
  Gathered = undefined,
>(options: {
  name: string
  enumerateFiles?: EnumerateFiles
  dependencies: (context: CheckDependenciesContext<EnumerateFiles>) => EnsureSerializable<Dependencies>
  gather?: (dependencies: Dependencies, context: CheckExecutionContext) => Effect.Effect<Gathered>
  execute: (
    dependencies: Dependencies,
    context: CheckExecutionContext,
    gathered: Gathered,
  ) => Problem[] | Problem | undefined
}) {
  return options
}
