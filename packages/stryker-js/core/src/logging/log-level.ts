/**
 * Re-export of @stryker-mutator/api/core's LogLevel const enum as a local runtime object.
 * The upstream uses `const enum` which rolldown/oxc doesn't inline at bundle time,
 * and which has no runtime emit.
 *
 * Using a const object + type pattern instead of an enum keeps the type structurally
 * compatible with the upstream's LogLevel (both are the same string literal union),
 * so values from @stryker-mutator/api/core types are assignable without casting.
 */
export const LogLevel = {
  Trace: 'trace',
  Debug: 'debug',
  Information: 'info',
  Warning: 'warn',
  Error: 'error',
  Fatal: 'fatal',
  Off: 'off',
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];
