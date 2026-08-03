import cellTaxonomy from '@systemfsoftware/oxlint-plugin-cell-taxonomy'
import { describe, expect, it } from 'vitest'

import base from '../oxlint-config.base.js'

const cellsUnderTaxonomy = (): ReadonlyArray<string> => {
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
  return cells
}

describe('cell admission registration', () => {
  it.each(cellsUnderTaxonomy())('Should_EnableAnAdmissionRule_When_TaxonomyCarries_%s', (cell) => {
    const admissionRules = Object.keys(base.rules ?? {}).filter((name) => name.includes(`/${cell}-`))
    expect(admissionRules).not.toStrictEqual([])
  })
})
