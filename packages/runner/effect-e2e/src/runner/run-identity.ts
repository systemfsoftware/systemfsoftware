import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { inject } from 'vitest'

import { RunId } from '../report/report.schema.js'

/** The provided-context key under which the generated global setup hands every worker of a run its one run id. */
export const RUN_ID_KEY = '@systemfsoftware/effect-e2e:run-id'

export const RUN_OUTPUT_KEY = '@systemfsoftware/effect-e2e:run-output'

/** The provided-context key under which the global setup names why it refused the suite config. */
export const RUN_REFUSAL_KEY = '@systemfsoftware/effect-e2e:run-refusal'

declare module 'vitest' {
  interface ProvidedContext {
    '@systemfsoftware/effect-e2e:run-id': string
    '@systemfsoftware/effect-e2e:run-output': string
    '@systemfsoftware/effect-e2e:run-refusal': string
  }
}

export const mintRunId = (project: string): RunId => RunId.make(`${project}-${globalThis.crypto.randomUUID()}`)

const injected = Option.liftThrowable(() => inject(RUN_ID_KEY))

/**
 * The run id the global setup provided, or none when the suite registered no e2e global setup (or the value is not
 * a run id); the runner then mints its own.
 */
export const providedRunId = (): Option.Option<RunId> =>
  Option.flatMap(injected(), (value) => Schema.decodeOption(RunId)(value))
