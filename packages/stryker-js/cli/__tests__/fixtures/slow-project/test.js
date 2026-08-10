import assert from 'node:assert/strict'
import { add, div, gt, lt, mul, sub } from './src/calculator.js'

assert.equal(add(2, 3), 5)
assert.equal(sub(5, 3), 2)
assert.equal(mul(2, 3), 6)
assert.equal(div(6, 3), 2)
assert.equal(gt(3, 2), true)
assert.equal(gt(2, 2), false)
assert.equal(lt(2, 3), true)
assert.equal(lt(2, 2), false)
