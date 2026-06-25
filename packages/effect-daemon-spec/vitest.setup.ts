import { Match } from 'effect'
import { configureGlobal } from 'fast-check'

const mode = Match.value({
  strykerWorker: Boolean(process.env.STRYKER_MUTATOR_WORKER),
  ci: Boolean(process.env.CI),
}).pipe(
  Match.when({ strykerWorker: true }, () => 'stryker' as const),
  Match.when({ ci: true }, () => 'ci' as const),
  Match.orElse(() => 'local' as const),
)

const numRuns = { stryker: 30, local: 100, ci: 1000 }[mode]

configureGlobal({ numRuns })
