#!/usr/bin/env node
// oxlint-disable
// @ts-nocheck
'use strict'
/**
 * JSDoc comment for the module
 * @module test
 */
// stryker disable next-line StringLiteral
// line comment before
const greeting: string = 'hello' // trailing comment
/* block comment */
function foo(
  // param comment
  x: string,
): string {
  // inside function
  return x
}
/* multi
   line
   block */
export { foo, greeting }
