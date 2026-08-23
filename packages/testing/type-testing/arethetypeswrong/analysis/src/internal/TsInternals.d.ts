// oxlint-disable typescript/no-wrapper-object-types -- this file mirrors TypeScript's own
// ambient declarations, which use `Symbol` for `ts.Symbol` and `String`/`Number` for branded strings.
// The wrapper-object rule is for application code, not for compiler-type augmentations.
// Ambient augmentation for the TypeScript compiler's internal API. This file is the sole
// declaration site for the small internal surface this package calls. Every member here must
// exist in the installed `typescript@6.0.3` runtime; keep the list minimal.
import 'typescript'

declare module 'typescript' {
  // Path/string utilities
  /** @internal */
  export function combinePaths(path: string, ...paths: (string | undefined)[]): string
  /** @internal */
  export function ensureTrailingDirectorySeparator(path: Path): Path
  /** @internal */
  export function ensureTrailingDirectorySeparator(path: string): string
  /** @internal */
  export function comparePathsCaseInsensitive(a: string, b: string): Comparison
  /** @internal */
  export enum Comparison {
    LessThan = -1,
    EqualTo = 0,
    GreaterThan = 1,
  }
  /** @internal */
  export function forEachAncestorDirectory<T>(
    directory: Path,
    callback: (directory: Path) => T | undefined,
  ): T | undefined
  /** @internal */
  export function forEachAncestorDirectory<T>(
    directory: string,
    callback: (directory: string) => T | undefined,
  ): T | undefined
  /** @internal */
  export function toPath(
    fileName: string,
    basePath: string | undefined,
    getCanonicalFileName: (path: string) => string,
  ): Path
  /** @internal */
  export type GetCanonicalFileName = (fileName: string) => string
  /** @internal */
  export function createGetCanonicalFileName(useCaseSensitiveFileNames: boolean): GetCanonicalFileName
  /** @internal */
  export function getAnyExtensionFromPath(path: string): string
  /** @internal */
  export function getAnyExtensionFromPath(
    path: string,
    extensions: string | readonly string[],
    ignoreCase: boolean,
  ): string
  /** @internal */
  export function hasTSFileExtension(fileName: string): boolean
  /** @internal */
  export function hasJSFileExtension(fileName: string): boolean
  /** @internal */
  export function isDeclarationFileName(fileName: string): boolean
  /** @internal */
  export function pathIsRelative(path: string): boolean
  /** @internal */
  export function getTypesPackageName(packageName: string): string
  /** @internal */
  export function unmangleScopedPackageName(packageName: string): string

  // Binder
  /** @internal */
  export function bindSourceFile(file: SourceFile, options: CompilerOptions): void

  // Package-scope resolution
  /** @internal */
  export function getTemporaryModuleResolutionState(
    packageJsonInfoCache: PackageJsonInfoCache | undefined,
    host: ModuleResolutionHost,
    options: CompilerOptions,
  ): ModuleResolutionState
  /** @internal */
  export function getPackageScopeForPath(directory: string, state: ModuleResolutionState): PackageJsonInfo | undefined
  /** @internal */
  export interface ModuleResolutionState {
    host: ModuleResolutionHost
    compilerOptions: CompilerOptions
    packageJsonInfoCache: PackageJsonInfoCache | undefined
  }
  /** @internal */
  export interface PackageJsonInfo {
    packageDirectory: string
    contents: PackageJsonInfoContents
  }
  /** @internal */
  export interface PackageJsonInfoContents {
    packageJsonContent: {
      type?: string
    }
  }
  /** @internal */
  export interface SourceFile {
    symbol: Symbol
    locals?: SymbolTable
    imports?: readonly StringLiteralLike[]
    externalModuleIndicator?: Node | true
    commonJsModuleIndicator?: Node
    path: Path
    scriptKind: ScriptKind
  }

  // TypeChecker internals
  /** @internal */
  export interface TypeChecker {
    resolveExternalModuleSymbol(symbol: Symbol): Symbol
    getExportsAndPropertiesOfModule(moduleSymbol: Symbol): Symbol[]
    getSymbolFlags(symbol: Symbol): SymbolFlags
  }

  // CompilerOptions extra
  /** @internal */
  export interface CompilerOptions {
    /** @internal */
    noDtsResolution?: boolean
  }
}
