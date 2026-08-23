/**
 * The shape Node gives a failed syscall. Declared structurally rather than as
 * `NodeJS.ErrnoException`: that namespace is ambient, so a consumer compiling
 * these sources with no ambient types would fail on it.
 */
export interface ErrnoException extends Error {
  code?: string
  errno?: number
  path?: string
  syscall?: string
}

export function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && typeof (error as ErrnoException).code === 'string'
}

export function errorToString(error: unknown): string {
  if (!error) {
    return ''
  }
  if (error instanceof Error) {
    if (isErrnoException(error)) {
      return `${error.name}: ${error.code} (${error.syscall}) ${error.stack}`
    }
    const message = `${error.name}: ${error.message}`
    if (error.stack) {
      return `${message}\n${error.stack.toString()}`
    } else {
      return message
    }
  }
  const value: unknown = error
  return String(value)
}

export const ERROR_CODES = Object.freeze({
  NoSuchFileOrDirectory: 'ENOENT',
})
