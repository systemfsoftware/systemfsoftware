import { InternalInvariantError } from '../errors/index.js'

export const invariant = (message: string): InternalInvariantError =>
  new InternalInvariantError({ message: `API Extractor internal error: ${message}` })
