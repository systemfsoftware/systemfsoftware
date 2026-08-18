import type { InstrumenterContext, MutantCoverage } from '@systemfsoftware/stryker-js-plugin-api/core'
import { afterAll, afterEach, beforeAll, beforeEach, inject, RunnerTestCase, RunnerTestSuite } from 'vitest'

// This file is copied to the sandbox dir, don't import anything local!
// See https://github.com/stryker-mutator/stryker-js/issues/5305

const globalNamespace = inject('globalNamespace')
const mutantActivation = inject('mutantActivation')
const mode = inject('mode')

const ns: InstrumenterContext = globalThis[globalNamespace] ?? (globalThis[globalNamespace] = {})

/**
 * The subset of the vitest suite the report hooks write to. The hook's real
 * `TaskMeta` type is keyed from an ambient module augmentation that oxlint's
 * checker cannot resolve, so the write path is typed structurally instead.
 */
interface SuiteWithTaskMeta {
  meta: { hitCount?: number; mutantCoverage?: MutantCoverage }
}

ns.hitLimit = inject('hitLimit')
const isGreaterThanVitest4Point1 = inject('isGreaterThanVitest4Point1')

if (mode === 'mutant') {
  beforeAll(() => {
    ns.hitCount = 0
  })

  if (mutantActivation === 'static') {
    ns.activeMutant = inject('activeMutant')
  } else {
    beforeAll(() => {
      ns.activeMutant = inject('activeMutant')
    })
  }

  if (isGreaterThanVitest4Point1) {
    // Vitest's hooks API requires this empty destructure to allow access to suite.meta
    // eslint-disable-next-line no-empty-pattern
    afterAll(({}, suite: SuiteWithTaskMeta) => {
      suite.meta.hitCount = ns.hitCount
    })
  } else {
    afterAll(({ meta }: { meta: { hitCount?: number } }) => {
      meta.hitCount = ns.hitCount
    })
  }
} else {
  ns.activeMutant = undefined

  beforeEach(({ task }) => {
    ns.currentTestId = toRawTestId(task)
  })

  afterEach(() => {
    ns.currentTestId = undefined
  })

  if (isGreaterThanVitest4Point1) {
    // Vitest's hooks API requires this empty destructure to allow access to suite.meta
    // eslint-disable-next-line no-empty-pattern
    afterAll(({}, suite: SuiteWithTaskMeta) => {
      suite.meta.mutantCoverage = ns.mutantCoverage
    })
  } else {
    afterAll(({ meta }: { meta: { mutantCoverage?: MutantCoverage } }) => {
      meta.mutantCoverage = ns.mutantCoverage
    })
  }
}

// Stryker disable all: this file is copied to the sandbox dir
function collectTestName({
  name,
  suite,
}: {
  name: string
  suite?: RunnerTestSuite
}): string {
  const nameParts = [name]
  let currentSuite = suite
  while (currentSuite) {
    nameParts.unshift(currentSuite.name)
    currentSuite = currentSuite.suite
  }
  return nameParts.join(' ').trim()
}

function toRawTestId(test: RunnerTestCase): string {
  return `${test.file?.filepath ?? 'unknown.js'}#${collectTestName(test)}`
}
// Stryker restore all
