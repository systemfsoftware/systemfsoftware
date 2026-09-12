/**
 * Compiler — the run time seam to the project's own svelte install. The compiler
 * and the template walker are the user's substrate, not this package's: neither
 * appears in the manifest, and every specifier is resolved from the project
 * directory the parser was built for.
 */
import { fail, svelteCompilerNotFound, type SvelteParserFailure, svelteWalkerNotFound } from './Failure.js'
import { isRecord } from './Guard.js'

/** The subset of `svelte/compiler` this parser uses. */
export interface SvelteCompiler {
  readonly VERSION: string
  readonly parse: (source: string, options: { readonly filename: string }) => unknown
}

/** The `walk` shape `estree-walker` and svelte 4's compiler both provide. */
export type WalkFn = (node: unknown, handlers: { readonly enter: (node: unknown) => void }) => unknown

export interface Version {
  readonly major: number
  readonly minor: number
}

const SVELTE_COMPILER_SPECIFIER = 'svelte/compiler'
const ESTREE_WALKER_SPECIFIER = 'estree-walker'
const ESTREE_WALKER_MISSING = 'estree-walker module without walk export'
const COMPILER_WALK_MISSING = 'svelte/compiler module without walk export'
const COMPILER_PARSE_MISSING = 'svelte/compiler module without a parse export'
const VERSION_PATTERN = /^(\d+)\.(\d+)(?:\.\d+)?/

/** Svelte 5 moved the template walk out of the compiler and into `estree-walker`. */
const SVELTE_5: Version = { major: 5, minor: 0 }

export function loadSvelteCompiler(projectDir: string, fileName: string): SvelteCompiler {
  const loaded = requireFromProject(
    projectDir,
    SVELTE_COMPILER_SPECIFIER,
    (cause) => svelteCompilerNotFound(fileName, SVELTE_COMPILER_SPECIFIER, projectDir, cause),
  )
  if (!isSvelteCompiler(loaded)) {
    return fail(svelteCompilerNotFound(fileName, SVELTE_COMPILER_SPECIFIER, projectDir, COMPILER_PARSE_MISSING))
  }
  return loaded
}

export function loadTemplateWalker(projectDir: string, version: string, fileName: string): WalkFn {
  const specifier = walkerSpecifier(version)
  const loaded = requireFromProject(
    projectDir,
    specifier,
    (cause) => svelteWalkerNotFound(fileName, specifier, causeMessage(cause)),
  )
  const walk = walkOf(loaded)
  if (walk === undefined) {
    return fail(svelteWalkerNotFound(fileName, specifier, walkerMissingCause(specifier)))
  }
  return walk
}

export function parseVersion(version: string): Version | undefined {
  const match = VERSION_PATTERN.exec(version)
  if (match === null) {
    return undefined
  }
  return { major: Number(match[1]), minor: Number(match[2]) }
}

export function compareVersion(left: Version, right: Version): number {
  if (left.major !== right.major) {
    return left.major - right.major
  }
  return left.minor - right.minor
}

export function isAtLeast(version: string, minimum: Version): boolean {
  const parsed = parseVersion(version)
  if (parsed === undefined) {
    return false
  }
  return compareVersion(parsed, minimum) >= 0
}

function walkerSpecifier(version: string): string {
  if (isAtLeast(version, SVELTE_5)) {
    return ESTREE_WALKER_SPECIFIER
  }
  return SVELTE_COMPILER_SPECIFIER
}

function walkerMissingCause(specifier: string): string {
  if (specifier === ESTREE_WALKER_SPECIFIER) {
    return ESTREE_WALKER_MISSING
  }
  return COMPILER_WALK_MISSING
}

/**
 * Resolves a specifier from the project the way a module evaluated next to that
 * project's package.json would, then loads it. The load is synchronous because
 * the Parser contract is — which is why the host's own `require` support is the
 * floor for an ESM-only `estree-walker` install.
 *
 * `process.getBuiltinModule` is the one route to the host module loader that
 * keeps this package free of `node:` imports, the same route the CLI's own
 * Module port takes.
 */
function requireFromProject(
  projectDir: string,
  specifier: string,
  missing: (cause: unknown) => SvelteParserFailure,
): unknown {
  try {
    const nodeModule = process.getBuiltinModule('node:module')
    const requireFromProjectDir = nodeModule.createRequire(`${projectDir}/package.json`)
    const loaded: unknown = requireFromProjectDir(specifier)
    return loaded
  } catch (error) {
    return fail(missing(error))
  }
}

function isSvelteCompiler(value: unknown): value is SvelteCompiler {
  if (!isRecord(value)) {
    return false
  }
  return hasCompilerMembers(value)
}

function hasCompilerMembers(record: Record<string, unknown>): record is Record<string, unknown> & SvelteCompiler {
  return typeof record['VERSION'] === 'string' && typeof record['parse'] === 'function'
}

function walkOf(value: unknown): WalkFn | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  return walkFieldOf(value)
}

function walkFieldOf(record: Record<string, unknown>): WalkFn | undefined {
  const walk = record['walk']
  if (!isWalkFunction(walk)) {
    return undefined
  }
  return walk
}

function isWalkFunction(value: unknown): value is WalkFn {
  return typeof value === 'function'
}

function causeMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message
  }
  return 'module could not be resolved from the project'
}
