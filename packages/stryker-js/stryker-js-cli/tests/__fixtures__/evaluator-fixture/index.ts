import { declarePlugin, type PluginModule } from '@systemfsoftware/stryker-js'
import type { Evaluator } from '@systemfsoftware/stryker-js/Evaluator'
import type { MutantStatus } from '@systemfsoftware/stryker-js/Mutant'

const FAILING_STATUSES: readonly MutantStatus[] = ['Survived', 'NoCoverage']

const fixtureGate: Evaluator = (report) => {
  const failing = Object.values(report.files).some((file) =>
    file.mutants.some((mutant) => FAILING_STATUSES.includes(mutant.status))
  )
  if (!failing) {
    return null
  }
  return {
    exitClass: 'VerdictFail',
    message: 'the fixture gate rejects a report with surviving or uncovered mutants',
  }
}

const fixtureGatePlugin = declarePlugin('Evaluator', 'fixture-gate', () => fixtureGate)

export const strykerPlugins: PluginModule['strykerPlugins'] = [fixtureGatePlugin]
