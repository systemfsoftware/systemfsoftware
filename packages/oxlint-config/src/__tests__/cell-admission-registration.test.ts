import cellTaxonomy from '@systemfsoftware/oxlint-plugin-cell-taxonomy'
import { describe, expect, it } from 'vitest'

import base from '../oxlint-config.base.js'

/**
 * Cells whose admission rules are delivered consumer-side (e.g. `executor` because its
 * plugin imports `effect-cell-types` directly and sits outside the aggregate to keep the
 * graph acyclic — OX-DL1) are exempt from base registration.
 */
const CONSUMER_DELIVERED_CELLS: readonly string[] = ['executor']
const cellsUnderTaxonomy = (): readonly string[] => {
  const options: unknown = cellTaxonomy.rules['cell-suffix-required']?.meta?.defaultOptions
  if (!Array.isArray(options) || options.length === 0) {
    throw new TypeError('cell-suffix-required exposes no defaultOptions to read the cell list from')
  }
  const first: unknown = options[0]
  if (typeof first !== 'object' || first === null || !('cells' in first)) {
    throw new TypeError('cell-suffix-required defaultOptions[0] carries no cells key')
  }
  const cells: unknown = Reflect.get(first, 'cells')
  if (!Array.isArray(cells) || !cells.every((cell): cell is string => typeof cell === 'string')) {
    throw new TypeError('cell-suffix-required cells is not a string array')
  }
  return cells.filter((cell) => !CONSUMER_DELIVERED_CELLS.includes(cell))
}

describe('cell admission registration', () => {
  it.each(cellsUnderTaxonomy())('Should_EnableAnAdmissionRule_When_TaxonomyCarries_%s', (cell) => {
    const admissionRules = Object.keys(base.rules ?? {}).filter((name) => name.includes(`/${cell}-`))
    expect(admissionRules).not.toStrictEqual([])
  })
})
