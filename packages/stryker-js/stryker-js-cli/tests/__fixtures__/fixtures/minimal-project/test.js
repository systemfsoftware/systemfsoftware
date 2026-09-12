import assert from 'node:assert/strict'
import { add } from './src/calculator.js'

assert.equal(add(2, 3), 5)
assert.equal(add(-1, 1), 0)
