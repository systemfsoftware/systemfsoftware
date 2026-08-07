import { normalizeFileName } from '@stryker-mutator/util'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { toRawTestId } from '../../src/test-helpers.js'
import { createVitestFile, createVitestTest } from '../util/factories.js'

describe('test-helpers', () => {
  describe(toRawTestId.name, () => {
    it('should return correct testId', () => {
      // Using normalizeFileName here mimics the behavior of vitest on windows: using forward slashes
      const filePath = normalizeFileName(path.resolve('src', 'file.js'))
      const test = createVitestTest({
        file: createVitestFile({ filepath: filePath }),
      })
      const result = toRawTestId(test)
      expect(result).toBe(`${filePath}#suite test1`)
    })
  })
})
