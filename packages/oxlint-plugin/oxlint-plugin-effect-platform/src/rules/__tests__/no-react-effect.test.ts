import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { effectBanDirectiveVerdict, REACT_EFFECT_EXPECTED, reactModuleLoadVerdict } from '../no-react-effect.config.js'
import { noReactEffect } from '../no-react-effect.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const verdictError = (verdict: { readonly name: string; readonly actual: string; readonly fix: string }) => ({
  messageId: 'reactEffect' as const,
  data: { ...verdict, expected: REACT_EFFECT_EXPECTED },
})

const loadError = (name: string) => verdictError(reactModuleLoadVerdict(name))
const directiveError = (form: string, line: number) => verdictError(effectBanDirectiveVerdict(form, line))

const REACT_EFFECT_IMPORT = "import { useEffect } from 'react'\n"
const RULE_ID = '@systemfsoftware/effect-platform/no-react-effect'

ruleTester.run('no-react-effect', noReactEffect, {
  valid: [
    {
      name: 'Should_Pass_When_RequireIsALocalFunction',
      code: "const require = (id: string): string => id\nrequire('react')",
      filename: 'src/feature.ts',
    },
    {
      name: 'Should_Pass_When_ADynamicImportLoadsAnotherModule',
      code: "import('./react')",
      filename: 'src/feature.ts',
    },
    {
      name: 'Should_Pass_When_ADirectiveNamesAnotherRule',
      code: "import { useMemo } from 'react'\n// oxlint-disable-next-line no-console\nuseMemo(() => 1, [])",
      filename: 'src/feature.ts',
    },
    {
      name: 'Should_Pass_When_AnImportBanDirectiveCoversANonReactImport',
      code: "// oxlint-disable-next-line no-restricted-imports\nimport { readFileSync } from 'node:fs'",
      filename: 'src/feature.ts',
    },
    {
      name: 'Should_Pass_When_AnUnnamedDirectiveCoversOnlyTheEffectCall',
      code: `${REACT_EFFECT_IMPORT}// oxlint-disable-next-line\nuseEffect(f, [f])`,
      filename: 'src/feature.ts',
    },
    {
      name: 'Should_Pass_When_AnImportBanBlockDirectiveIsClosedBeforeTheReactImport',
      code:
        "/* oxlint-disable no-restricted-imports */\nimport { readFileSync } from 'node:fs'\n/* oxlint-enable no-restricted-imports */\nimport { useEffect } from 'react'",
      filename: 'src/feature.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ReactIsLoadedByDynamicImport',
      code: "import('react')",
      filename: 'src/feature.ts',
      errors: [loadError("import('react')")],
    },
    {
      name: 'Should_Report_When_ReactIsLoadedByTemplateDynamicImport',
      code: 'import(`react`)',
      filename: 'src/feature.ts',
      errors: [loadError("import('react')")],
    },
    {
      name: 'Should_Report_When_ReactIsLoadedByGlobalRequire',
      code: "require('react')",
      filename: 'src/feature.ts',
      errors: [loadError("require('react')")],
    },
    {
      name: 'Should_Report_When_ANextLineDirectiveNamesTheRule',
      code: `${REACT_EFFECT_IMPORT}// oxlint-disable-next-line ${RULE_ID} -- reason\nuseEffect(f, [f])`,
      filename: 'src/feature.ts',
      errors: [directiveError('oxlint-disable-next-line', 2)],
    },
    {
      name: 'Should_Report_When_AFileDirectiveNamesTheRule',
      code: `/* oxlint-disable ${RULE_ID} */\n${REACT_EFFECT_IMPORT}useEffect(f, [f])`,
      filename: 'src/feature.ts',
      errors: [directiveError('oxlint-disable', 1)],
    },
    {
      name: 'Should_Report_When_AnEslintDirectiveNamesTheRule',
      code: `${REACT_EFFECT_IMPORT}useEffect(f, [f]) // eslint-disable-line ${RULE_ID}`,
      filename: 'src/feature.ts',
      errors: [directiveError('eslint-disable-line', 2)],
    },
    {
      name: 'Should_Report_When_ADirectiveNamesTheRuleWithNoReachToCover',
      code: `// oxlint-disable-next-line ${RULE_ID}\nconst a = 1`,
      filename: 'src/feature.ts',
      errors: [directiveError('oxlint-disable-next-line', 1)],
    },
    {
      name: 'Should_Report_When_AnImportBanDirectiveCoversTheUseEffectImport',
      code: `// oxlint-disable-next-line no-restricted-imports\n${REACT_EFFECT_IMPORT}`,
      filename: 'src/feature.ts',
      errors: [directiveError('oxlint-disable-next-line', 1)],
    },
    {
      name: 'Should_Report_When_AnImportBanDirectiveCoversARefusedReactImport',
      code: "// oxlint-disable-next-line no-restricted-imports\nimport { useLayoutEffect } from 'react'",
      filename: 'src/feature.ts',
      errors: [directiveError('oxlint-disable-next-line', 1)],
    },
    {
      name: 'Should_Report_When_AnUnnamedDirectiveCoversTheUseEffectReexport',
      code: "// oxlint-disable-next-line\nexport { useEffect } from 'react'",
      filename: 'src/feature.ts',
      errors: [directiveError('oxlint-disable-next-line', 1)],
    },
    {
      name: 'Should_Report_When_AnUnnamedFileDirectiveCoversANamespaceReactImport',
      code: "/* eslint-disable */\nimport * as React from 'react'",
      filename: 'src/feature.ts',
      errors: [directiveError('eslint-disable', 1)],
    },
    {
      name: 'Should_Report_When_AnImportBanBlockDirectiveCoversExportAllFromReact',
      code: "/* oxlint-disable eslint/no-restricted-imports */\nexport * from 'react'",
      filename: 'src/feature.ts',
      errors: [directiveError('oxlint-disable', 1)],
    },
    {
      name: 'Should_Report_When_AnUnnamedDirectiveCoversAReactLoad',
      code: "// oxlint-disable-next-line\nrequire('react')",
      filename: 'src/feature.ts',
      errors: [directiveError('oxlint-disable-next-line', 1), loadError("require('react')")],
    },
  ],
})
