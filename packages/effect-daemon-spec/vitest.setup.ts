import { isCI } from '@systemfsoftware/vitest-config'
import { Match } from 'effect'
import { FastCheck as fc } from 'effect/testing'

const mode = Match.value({
  strykerWorker: Boolean(process.env.STRYKER_MUTATOR_WORKER),
  ci: isCI,
}).pipe(
  Match.when({ strykerWorker: true }, () => 'stryker' as const),
  Match.when({ ci: true }, () => 'ci' as const),
  Match.orElse(() => 'local' as const),
)

const numRuns = { stryker: 30, local: 100, ci: 1000 }[mode]

fc.configureGlobal({ numRuns })
