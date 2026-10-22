import { Context, type Effect } from 'effect'
import { SuiteFsError } from './suite-fs.schema.js'

export type SuiteModule = object

export interface SuiteFsShape {
  readonly exists: (path: string) => Effect.Effect<boolean>
  readonly readFileString: (path: string) => Effect.Effect<string, SuiteFsError>
  readonly writeFileString: (path: string, content: string) => Effect.Effect<void, SuiteFsError>
  readonly makeDirectory: (path: string) => Effect.Effect<void, SuiteFsError>
  readonly listFiles: Effect.Effect<ReadonlyArray<string>, SuiteFsError>
  readonly importModule: (path: string) => Effect.Effect<SuiteModule, SuiteFsError>
}

export class SuiteFs extends Context.Service<SuiteFs, SuiteFsShape>()('@systemfsoftware/effect-e2e/SuiteFs') {}
