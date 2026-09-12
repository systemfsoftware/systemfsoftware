import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import all, { defaultIgnores as allIgnores } from '@systemfsoftware/all'
import * as allNamespace from '@systemfsoftware/all'
import preset, { defaultIgnores as presetIgnores } from '@systemfsoftware/oxlint-preset'
import { describe, expect, it } from 'vitest'

const MODULE_SOURCE = readFileSync(fileURLToPath(new URL('../mod.ts', import.meta.url)), 'utf8')

describe('re-export module source', () => {
  it('Should_DeclareNoConfig_When_TheModuleIsAReExport', () => {
    expect(MODULE_SOURCE).not.toContain('defineConfig(')
    expect(MODULE_SOURCE).not.toContain('import.meta.resolve')
  })
})

describe('re-export equality with the canonical root', () => {
  it('Should_DeepEqualTheCanonicalRoot_When_TheDefaultExportIsImported', () => {
    expect(all).toStrictEqual(preset)
  })

  it('Should_DeepEqualTheCanonicalDefaultIgnores_When_TheNamedExportIsImported', () => {
    expect(allIgnores).toStrictEqual(presetIgnores)
  })

  it('Should_ExposeOnlyTheDefaultAndDefaultIgnores_When_TheNamespaceIsImported', () => {
    expect(Object.keys(allNamespace).sort()).toStrictEqual(['default', 'defaultIgnores'])
  })
})
