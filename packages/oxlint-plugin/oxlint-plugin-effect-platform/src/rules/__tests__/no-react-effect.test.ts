import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  REACT_EFFECT_EXPECTED,
  REACT_EFFECT_FIX,
  reactEffectCallVerdict,
  reactEffectReexportVerdict,
  reactEffectReferenceVerdict,
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

const verdictError = (verdict: { readonly name: string; readonly actual: string }) => ({
  messageId: 'reactEffect' as const,
  data: {
    ...verdict,
    expected: REACT_EFFECT_EXPECTED,
    fix: REACT_EFFECT_FIX,
  },
})

const callError = () => verdictError(reactEffectCallVerdict())
const referenceError = () => verdictError(reactEffectReferenceVerdict())
const reexportError = () => verdictError(reactEffectReexportVerdict())

const REACT_EFFECT_IMPORT = "import { useEffect } from 'react'\n"
const ATOM_IMPORT = "import { Atom } from '@systemfsoftware/effect-atom'\n"

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
  ],
  invalid: [
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
