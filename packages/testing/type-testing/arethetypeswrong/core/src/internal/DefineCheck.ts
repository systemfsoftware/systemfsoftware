import type { Package } from '../CreatePackage.js'
import type { Analysis, Problem, ResolutionKind, ResolutionOption } from '../Types.js'
import type { CompilerHosts } from './MultiCompilerHost.js'

export interface CheckDependenciesContext<EnumerateFiles extends boolean = false> extends CheckExecutionContext {
  subpath: string
  resolutionKind: ResolutionKind
  resolutionOption: ResolutionOption
  fileName: EnumerateFiles extends true ? string : undefined
}

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

export type EnsureSerializable<T> = [T] extends [Serializable] ? T
  : [T] extends [object] ? Structure<T> extends Serializable ? T
    : never
  : never

export type Serializable =
  | string
  | number
  | null
  | undefined
  | boolean
  | { [key: string]: Serializable }
  | readonly Serializable[]

export interface AnyCheck {
  name: string
  enumerateFiles?: boolean
  // Method syntax, not a property: parameter positions are bivariant here, so a
  // check declaring its own dependency tuple stays assignable to this erased
  // supertype without an `any` standing in for it.
  dependencies(context: CheckDependenciesContext<boolean>): EnsureSerializable<readonly unknown[]>
  execute(dependencies: readonly unknown[], context: CheckExecutionContext): Problem[] | Problem | undefined
}

export function defineCheck<const Dependencies extends readonly unknown[], EnumerateFiles extends boolean>(options: {
  name: string
  enumerateFiles?: EnumerateFiles
  dependencies: (context: CheckDependenciesContext<EnumerateFiles>) => EnsureSerializable<Dependencies>
  execute: (dependencies: Dependencies, context: CheckExecutionContext) => Problem[] | Problem | undefined
}) {
  return options
}
