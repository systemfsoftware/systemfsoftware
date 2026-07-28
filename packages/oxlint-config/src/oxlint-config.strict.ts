import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

/**
 * The base config turns on `correctness` only, which leaves most rules of the
 * plugins it loads inert — they live in the other categories. This preset opts
 * a package into the three that catch defects rather than style.
 *
 * The other ~1750 findings those categories produce were read and rejected:
 * they rename, reorder, and reshape working code. A rule that fires on correct
 * code is how a team learns to disable rules, so the bar here is a rule whose
 * every finding is a bug or a latent one.
 */
export default defineConfig({
  extends: [base],

  rules: {
    // A condition that cannot change the outcome is a dead branch: the mutation
    // gate reports it as a survivor that no test can kill.
    'typescript/no-unnecessary-condition': 'error',

    // `if (hook.async)` on `boolean | undefined` reads the same whether the
    // field is absent or false — the exact shape of the bugs fixed today.
    'typescript/strict-boolean-expressions': 'error',

    // `!` asserts away precisely the null the type system is warning about.
    'typescript/no-non-null-assertion': 'error',
  },
})
