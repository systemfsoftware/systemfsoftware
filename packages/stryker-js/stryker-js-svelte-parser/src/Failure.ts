/**
 * Failure — what a parse returns when it cannot produce an AST. These are plain
 * tagged records, not exceptions: the host discriminates on `_tag` without
 * sharing a class identity with this package, and nothing throws across the
 * factory boundary.
 */

const SvelteCompilerNotFoundTag = { _tag: 'SvelteCompilerNotFound' } as const

type SvelteCompilerNotFoundTag = typeof SvelteCompilerNotFoundTag

/** The project's svelte install could not supply a compiler. */
export interface SvelteCompilerNotFound extends SvelteCompilerNotFoundTag {
  readonly exitClass: 'ConfigError'
  readonly fileName: string
  readonly specifier: string
  readonly projectDir: string
  readonly message: string
  readonly cause: unknown
}

const SvelteVersionNotSupportedTag = { _tag: 'SvelteVersionNotSupported' } as const

type SvelteVersionNotSupportedTag = typeof SvelteVersionNotSupportedTag

/** The project's svelte compiler is older than this parser supports. */
export interface SvelteVersionNotSupported extends SvelteVersionNotSupportedTag {
  readonly fileName: string
  readonly version: string
  readonly message: string
  readonly cause: string
}

const SvelteWalkerNotFoundTag = { _tag: 'SvelteWalkerNotFound' } as const

type SvelteWalkerNotFoundTag = typeof SvelteWalkerNotFoundTag

/** The module that walks the template could not supply a `walk` function. */
export interface SvelteWalkerNotFound extends SvelteWalkerNotFoundTag {
  readonly exitClass: 'ConfigError'
  readonly fileName: string
  readonly specifier: string
  readonly message: string
  readonly cause: string
}

const SvelteParseFailedTag = { _tag: 'SvelteParseFailed' } as const

type SvelteParseFailedTag = typeof SvelteParseFailedTag

/** The compiler refused the component, or produced an AST this parser cannot read. */
export interface SvelteParseFailed extends SvelteParseFailedTag {
  readonly fileName: string
  readonly message: string
  readonly cause: unknown
}

export type SvelteParserFailure =
  | SvelteCompilerNotFound
  | SvelteVersionNotSupported
  | SvelteWalkerNotFound
  | SvelteParseFailed

export function svelteCompilerNotFound(
  fileName: string,
  specifier: string,
  projectDir: string,
  cause: unknown,
): SvelteCompilerNotFound {
  return {
    exitClass: 'ConfigError',
    _tag: 'SvelteCompilerNotFound',
    fileName: fileName,
    specifier: specifier,
    projectDir: projectDir,
    cause: cause,
    message: `Svelte compiler not found for ${fileName}: cannot resolve "${specifier}" from ${projectDir}`,
  }
}

export function svelteVersionNotSupported(
  fileName: string,
  version: string,
  expected: string,
): SvelteVersionNotSupported {
  return {
    _tag: 'SvelteVersionNotSupported',
    fileName: fileName,
    version: version,
    cause: `Expected ${expected}`,
    message: `Svelte version ${version} is not supported for ${fileName} (expected ${expected})`,
  }
}

export function svelteWalkerNotFound(
  fileName: string,
  specifier: string,
  cause: string,
): SvelteWalkerNotFound {
  return {
    exitClass: 'ConfigError',
    _tag: 'SvelteWalkerNotFound',
    fileName: fileName,
    specifier: specifier,
    cause: cause,
    message: `Svelte walker not found for ${fileName}: cannot load "${specifier}" (${cause})`,
  }
}

export function svelteParseFailed(fileName: string, cause: unknown): SvelteParseFailed {
  return {
    _tag: 'SvelteParseFailed',
    fileName: fileName,
    cause: cause,
    message: `Failed to parse Svelte component ${fileName}`,
  }
}

/**
 * The carrier for a failure on its way out of a ported helper. The parser's
 * internals throw — a helper four calls deep cannot return through every
 * caller's types — and `parse` unwraps the record at the boundary, so no
 * exception ever crosses the factory's public surface.
 */
export class SvelteFailure extends Error {
  constructor(readonly failure: SvelteParserFailure) {
    super(failure.message)
  }
}

/** Throw `failure` from a helper whose return type cannot carry it. */
export function fail(failure: SvelteParserFailure): never {
  throw new SvelteFailure(failure)
}
