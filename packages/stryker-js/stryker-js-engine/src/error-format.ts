/**
 * Engine-private error rendering (moved verbatim from the deleted
 * `@systemfsoftware/stryker-js/Mutant` `errorToString` family): rich
 * `Error`/`ErrnoException`/non-error values all render to a string, and
 * empty values render to `''`. Module-internal — never re-exported from the
 * package index.
 */

interface ErrnoException extends Error {
  code?: string
  errno?: number
  path?: string
  syscall?: string
}

function isErrnoException(error: unknown): error is ErrnoException {
  if (!(error instanceof Error)) {
    return false
  }
  if (!('code' in error)) {
    return false
  }
  const code: unknown = Reflect.get(error, 'code')
  return typeof code === 'string'
}

const isEmptyError = (error: unknown): boolean => {
  if (error === undefined || error === null) {
    return true
  }
  if (typeof error === 'string' && error.length === 0) {
    return true
  }
  if (error === 0 || error === false) {
    return true
  }
  if (typeof error === 'number' && Number.isNaN(error)) {
    return true
  }
  return false
}

const formatErrnoException = (error: ErrnoException): string => {
  const stack = error.stack
  if (stack !== undefined && stack.length > 0) {
    return `${error.name}: ${error.code} (${error.syscall}) ${stack}`
  }
  return `${error.name}: ${error.code} (${error.syscall})`
}

const formatError = (error: Error): string => {
  const message = `${error.name}: ${error.message}`
  if (error.stack !== undefined && error.stack.length > 0) {
    return `${message}\n${error.stack.toString()}`
  }
  return message
}

const stringifyNonError = (error: unknown): string => {
  if (typeof error === 'string') {
    return error
  }
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return JSON.stringify(error)
  }
  try {
    const json = JSON.stringify(error)
    if (typeof json === 'string' && json.length > 0) {
      return json
    }
  } catch {
  }
  if (typeof error === 'object' && error !== null && 'toString' in error) {
    const toStringValue: unknown = Reflect.get(error, 'toString')
    if (typeof toStringValue === 'function') {
      try {
        const text: unknown = Reflect.apply(toStringValue, error, [])
        if (typeof text === 'string' && text.length > 0 && text !== '[object Object]') {
          return text
        }
      } catch {
      }
    }
  }
  return ''
}

export function errorToString(error: unknown): string {
  if (isEmptyError(error)) {
    return ''
  }
  if (error instanceof Error) {
    if (isErrnoException(error)) {
      return formatErrnoException(error)
    }
    return formatError(error)
  }
  return stringifyNonError(error)
}
