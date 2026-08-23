// oxlint-disable typescript/no-wrapper-object-types -- this file mirrors TypeScript's own
// ambient declarations, which use `Symbol` for `ts.Symbol` and `String`/`Number` for branded strings.
// The wrapper-object rule is for application code, not for compiler-type augmentations.
// Ambient augmentation for the TypeScript compiler's internal API. This file is the sole
// declaration site for the small internal surface this package calls; it replaces the
// previous augmentation package. Every member here exists in the installed
// `typescript@6.0.3` runtime. Keep this list minimal: do not re-add members U1/U2 removed.
import 'typescript'

declare module 'typescript' {
  // Path/string utilities
  export function combinePaths(path: string, ...paths: (string | undefined)[]): string
  export function ensureTrailingDirectorySeparator(path: Path): Path
  export function ensureTrailingDirectorySeparator(path: string): string
  export function comparePathsCaseInsensitive(a: string, b: string): Comparison
  /** @internal */
  export enum Comparison {
    LessThan = -1,
    EqualTo = 0,
    GreaterThan = 1,
  }
  export function forEachAncestorDirectory<T>(
    directory: Path,
    callback: (directory: Path) => T | undefined,
  ): T | undefined
  export function forEachAncestorDirectory<T>(
    directory: string,
    callback: (directory: string) => T | undefined,
  ): T | undefined
  export function toPath(
    fileName: string,
    basePath: string | undefined,
    getCanonicalFileName: (path: string) => string,
  ): Path
  export type GetCanonicalFileName = (fileName: string) => string
  export function createGetCanonicalFileName(useCaseSensitiveFileNames: boolean): GetCanonicalFileName
  export function getAnyExtensionFromPath(path: string): string
  export function getAnyExtensionFromPath(
    path: string,
    extensions: string | readonly string[],
    ignoreCase: boolean,
  ): string
  export function hasTSFileExtension(fileName: string): boolean
  export function hasJSFileExtension(fileName: string): boolean
  export function isDeclarationFileName(fileName: string): boolean
  export function pathIsRelative(path: string): boolean
  export function getTypesPackageName(packageName: string): string
  export function unmangleScopedPackageName(typesPackageName: string): string

  // Binder
  export function bindSourceFile(file: SourceFile, options: CompilerOptions): void

  // Package-scope resolution
  export function getTemporaryModuleResolutionState(
    packageJsonInfoCache: PackageJsonInfoCache | undefined,
    host: ModuleResolutionHost,
    options: CompilerOptions,
  ): ModuleResolutionState
  export function getPackageScopeForPath(directory: string, state: ModuleResolutionState): PackageJsonInfo | undefined
  export interface ModuleResolutionState {
    host: ModuleResolutionHost
    compilerOptions: CompilerOptions
    packageJsonInfoCache: PackageJsonInfoCache | undefined
  }
  export interface PackageJsonInfo {
    packageDirectory: string
    contents: PackageJsonInfoContents
  }
  export interface PackageJsonInfoContents {
    packageJsonContent: {
      type?: string
    }
  }
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
  export interface TypeChecker {
    resolveExternalModuleSymbol(symbol: Symbol): Symbol
    getExportsAndPropertiesOfModule(moduleSymbol: Symbol): Symbol[]
    getSymbolFlags(symbol: Symbol): SymbolFlags
  }

  // CompilerOptions extra
  export interface CompilerOptions {
    /** @internal */
    noDtsResolution?: boolean
  }
}
