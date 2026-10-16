import { Effect, FileSystem } from 'effect'
import * as PlatformError from 'effect/PlatformError'
import { document, Observed } from './FailureDump.schema.js'

export { document, Observed }

export interface DumpRequest extends Observed {
  readonly conjunct: string
  readonly report: string
  readonly name?: string | undefined
}

const DEFAULT_DIRECTORY = 'artifacts/traces'

const sanitize = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, '-')

const fileNameOf = (request: DumpRequest): string =>
  `${sanitize(request.name ?? request.traceId)}.${sanitize(request.conjunct)}.txt`

export const write = (
  request: DumpRequest,
): Effect.Effect<string, PlatformError.PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(DEFAULT_DIRECTORY, { recursive: true })
    const path = `${DEFAULT_DIRECTORY}/${fileNameOf(request)}`
    yield* fs.writeFileString(path, document(request, request.report))
    return path
  })
