/**
 * Compiler — declarations for the TypeScript compiler and version guard.
 */
import { FileName } from '@systemfsoftware/stryker-js/Mutant'
import { Schema as S } from 'effect'
export const TypeScriptVersion = S.NonEmptyString.pipe(S.brand('TypeScriptVersion'))
export type TypeScriptVersion = typeof TypeScriptVersion.Type

/** The installed TypeScript version is below the supported floor. */
export class UnsupportedTypeScriptVersionError extends S.TaggedError<UnsupportedTypeScriptVersionError>()(
  'UnsupportedTypeScriptVersionError',
  {
    version: TypeScriptVersion,
  },
) {
  override get message(): string {
    return `@systemfsoftware/stryker-js-typescript-checker only supports typescript@7.0.0 or higher. Found typescript@${this.version}`
  }
}

/** Requested file is not present in the hybrid in-memory file map. */
export class HybridFileNotFoundError extends S.TaggedError<HybridFileNotFoundError>()(
  'HybridFileNotFoundError',
  {
    fileName: FileName,
  },
) {}
