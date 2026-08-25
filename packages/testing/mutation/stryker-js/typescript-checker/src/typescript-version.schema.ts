import { Schema as S } from 'effect'

/**
 * The installed TypeScript version is below the supported floor.
 */
export class UnsupportedTypeScriptVersionError extends S.TaggedError<UnsupportedTypeScriptVersionError>()(
  'UnsupportedTypeScriptVersionError',
  {
    version: S.String,
  },
) {
  override get message(): string {
    return `@systemfsoftware/stryker-js-typescript-checker only supports typescript@7.0.0 or higher. Found typescript@${this.version}`
  }
}
