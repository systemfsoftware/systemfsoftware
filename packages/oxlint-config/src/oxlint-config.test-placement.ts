import strict from '@systemfsoftware/oxlint-config/strict'
import testPlacement from '@systemfsoftware/oxlint-plugin-test-placement'
import { defineConfig } from 'oxlint'

/**
 * Turns on the test-placement rules. Opt-in, not part of `base`: the rules
 * gate the DMMF cell taxonomy, which lives only under `omp/`. The tooling
 * packages under `packages/` colocate RuleTester suites in `src/**` by their
 * own convention, and a rule that fires on sanctioned code is how a team
 * learns to disable rules.
 */
export default defineConfig({
  extends: [strict],
  rules: { ...testPlacement.configs.recommended.rules },
})
