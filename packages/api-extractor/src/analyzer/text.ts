import { InternalInvariantError } from '../errors/index.js'

const newLineRegExp = /\r\n|\r|\n/g

export const convertToLf = (input: string): string => input.replace(newLineRegExp, '\n')

export const truncateWithEllipsis = (s: string, maximumLength: number): string => {
  if (maximumLength < 0) {
    throw new InternalInvariantError({ message: 'The maximumLength cannot be a negative number' })
  }

  if (s.length <= maximumLength) {
    return s
  }

  if (s.length <= 3) {
    return s.substring(0, maximumLength)
  }

  return s.substring(0, maximumLength - 3) + '...'
}
