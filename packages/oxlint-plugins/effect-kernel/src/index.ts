import { kernelNoAmbientImpurity } from './rules/kernel-no-ambient-impurity.js'
import { kernelNoDomainImports } from './rules/kernel-no-domain-imports.js'
import { kernelNoEffectRuntime } from './rules/kernel-no-effect-runtime.js'
import { kernelNoJunkDrawerName } from './rules/kernel-no-junk-drawer-name.js'
import { kernelNoThrow } from './rules/kernel-no-throw.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-kernel'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('kernel-no-throw')]: 'error',
  [rule('kernel-no-ambient-impurity')]: 'error',
  [rule('kernel-no-effect-runtime')]: 'error',
  [rule('kernel-no-domain-imports')]: 'error',
  [rule('kernel-no-junk-drawer-name')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'kernel-no-throw': kernelNoThrow,
    'kernel-no-ambient-impurity': kernelNoAmbientImpurity,
    'kernel-no-effect-runtime': kernelNoEffectRuntime,
    'kernel-no-domain-imports': kernelNoDomainImports,
    'kernel-no-junk-drawer-name': kernelNoJunkDrawerName,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
