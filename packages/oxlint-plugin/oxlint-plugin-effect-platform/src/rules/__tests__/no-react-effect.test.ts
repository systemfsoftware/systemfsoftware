import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  effectBanDirectiveVerdict,
  REACT_EFFECT_EXPECTED,
  reactEffectCallVerdict,
  reactEffectReexportVerdict,
  reactEffectReferenceVerdict,
  reactModuleLoadVerdict,
} from '../no-react-effect.config.js'
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

const TSX = { parserOptions: { lang: 'tsx' as const } }

const verdictError = (verdict: { readonly name: string; readonly actual: string; readonly fix: string }) => ({
  messageId: 'reactEffect' as const,
  data: { ...verdict, expected: REACT_EFFECT_EXPECTED },
})

const callError = () => verdictError(reactEffectCallVerdict())
const referenceError = () => verdictError(reactEffectReferenceVerdict())
const reexportError = () => verdictError(reactEffectReexportVerdict())
const loadError = (name: string) => verdictError(reactModuleLoadVerdict(name))
const directiveError = (form: string, line: number) => verdictError(effectBanDirectiveVerdict(form, line))

const REACT_EFFECT_IMPORT = "import { useEffect } from 'react'\n"
const ATOM_IMPORT = "import { Atom } from '@systemfsoftware/effect-atom'\n"
const RULE_ID = '@systemfsoftware/effect-platform/no-react-effect'

ruleTester.run('no-react-effect', noReactEffect, {
  valid: [
    {
      name: 'Should_Pass_When_TheHydrationEffectCallsAtomHydrateFromEffectAtom',
      code:
        `${REACT_EFFECT_IMPORT}${ATOM_IMPORT}useEffect(() => { Atom.Hydration.hydrate(registry, queue) }, [registry, queue])`,
      filename: 'src/hydration-boundary.ts',
    },
    {
      name: 'Should_Pass_When_AtomIsImportedFromEffectAtomUnderAnAlias',
      code:
        `${REACT_EFFECT_IMPORT}import { Atom as A } from '@systemfsoftware/effect-atom'\nuseEffect(() => { A.Hydration.hydrate(registry, queue) }, [registry, queue])`,
      filename: 'src/hydration-boundary.ts',
    },
    {
      name: 'Should_Pass_When_TheHydrationEffectRunsInsideAComponent',
      code:
        `${REACT_EFFECT_IMPORT}${ATOM_IMPORT}const C = () => {\n  useEffect(() => { Atom.Hydration.hydrate(registry, queue) }, [registry, queue])\n  return <div />\n}`,
      filename: 'src/component.tsx',
      languageOptions: TSX,
    },
    {
      name: 'Should_Pass_When_UseEffectIsImportedFromAnotherModule',
      code: "import { useEffect } from './local'\nuseEffect(() => {}, [])",
      filename: 'src/feature.ts',
    },
    {
      name: 'Should_Pass_When_ReactIsNamespaceImported',
      code: "import * as React from 'react'\nReact.useEffect(() => {}, [])",
      filename: 'src/feature.ts',
    },
    {
      name: 'Should_Pass_When_ReactIsDefaultImported',
      code: "import React from 'react'\nReact.useEffect(() => {}, [])",
      filename: 'src/feature.ts',
    },
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
      name: 'Should_Pass_When_AnUnnamedDirectiveCoversNoBannedReach',
      code: "import { useMemo } from 'react'\n// oxlint-disable-next-line\nuseMemo(() => 1, [])",
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
      errors: [directiveError('oxlint-disable-next-line', 2), callError()],
    },
    {
      name: 'Should_Report_When_AFileDirectiveNamesTheRule',
      code: `/* oxlint-disable ${RULE_ID} */\n${REACT_EFFECT_IMPORT}useEffect(f, [f])`,
      filename: 'src/feature.ts',
      errors: [directiveError('oxlint-disable', 1), callError()],
    },
    {
      name: 'Should_Report_When_AnEslintDirectiveNamesTheRule',
      code: `${REACT_EFFECT_IMPORT}useEffect(f, [f]) // eslint-disable-line ${RULE_ID}`,
      filename: 'src/feature.ts',
      errors: [directiveError('eslint-disable-line', 2), callError()],
    },
    {
      name: 'Should_Report_When_AnUnnamedDirectiveCoversAnEffectReach',
      code: `${REACT_EFFECT_IMPORT}// oxlint-disable-next-line\nuseEffect(f, [f])`,
      filename: 'src/feature.ts',
      errors: [directiveError('oxlint-disable-next-line', 2), callError()],
    },
    {
      name: 'Should_Report_When_AnImportBanDirectiveCoversARefusedReactImport',
      code: "// oxlint-disable-next-line no-restricted-imports\nimport { useLayoutEffect } from 'react'",
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
      name: 'Should_Report_When_TheNamedImportIsCalled',
      code: `${REACT_EFFECT_IMPORT}useEffect(() => { store.set(1) }, [store])`,
      filename: 'src/feature.ts',
      errors: [callError()],
    },
    {
      name: 'Should_Report_When_TheAliasedImportIsCalled',
      code: "import { useEffect as e } from 'react'\ne(() => { store.set(1) }, [store])",
      filename: 'src/feature.ts',
      errors: [callError()],
    },
    {
      name: 'Should_Report_When_TheImportIsPassedAsAValue',
      code: `${REACT_EFFECT_IMPORT}const e = useEffect`,
      filename: 'src/feature.ts',
      errors: [referenceError()],
    },
    {
      name: 'Should_Report_When_TheImportIsReexportedFromReact',
      code: "export { useEffect } from 'react'",
      filename: 'src/feature.ts',
      errors: [reexportError()],
    },
    {
      name: 'Should_Report_When_TheImportIsReexportedUnderAnAliasFromReact',
      code: "export { useEffect as e } from 'react'",
      filename: 'src/feature.ts',
      errors: [reexportError()],
    },
    {
      name: 'Should_Report_When_TheLocalImportIsReexported',
      code: `${REACT_EFFECT_IMPORT}export { useEffect }`,
      filename: 'src/feature.ts',
      errors: [referenceError()],
    },
    {
      name: 'Should_Report_When_AtomComesFromALocalModule',
      code:
        `${REACT_EFFECT_IMPORT}import { Atom } from './local'\nuseEffect(() => { Atom.Hydration.hydrate(registry, queue) }, [registry, queue])`,
      filename: 'src/feature.ts',
      errors: [callError()],
    },
    {
      name: 'Should_Report_When_TheHydrationEffectHasNoDependencyArray',
      code: `${REACT_EFFECT_IMPORT}${ATOM_IMPORT}useEffect(() => { Atom.Hydration.hydrate(registry, queue) })`,
      filename: 'src/feature.ts',
      errors: [callError()],
    },
    {
      name: 'Should_Report_When_TheCallbackHasAnExpressionBody',
      code:
        `${REACT_EFFECT_IMPORT}${ATOM_IMPORT}useEffect(() => Atom.Hydration.hydrate(registry, queue), [registry, queue])`,
      filename: 'src/feature.ts',
      errors: [callError()],
    },
    {
      name: 'Should_Report_When_TheCallbackHasASecondStatement',
      code:
        `${REACT_EFFECT_IMPORT}${ATOM_IMPORT}useEffect(() => { Atom.Hydration.hydrate(registry, queue); track() }, [registry, queue])`,
      filename: 'src/feature.ts',
      errors: [callError()],
    },
    {
      name: 'Should_Report_When_HydrateTakesOneArgument',
      code: `${REACT_EFFECT_IMPORT}${ATOM_IMPORT}useEffect(() => { Atom.Hydration.hydrate(registry) }, [registry])`,
      filename: 'src/feature.ts',
      errors: [callError()],
    },
    {
      name: 'Should_Report_When_AComponentCallsTheReactEffectHook',
      code:
        `${REACT_EFFECT_IMPORT}const C = () => {\n  useEffect(() => { store.set(1) }, [store])\n  return <div />\n}`,
      filename: 'src/component.tsx',
      languageOptions: TSX,
      errors: [callError()],
    },
  ],
})
