#!/usr/bin/env node
/// <reference types="node" />
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findExportedSchemas } from './dist/index.mjs'

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tests/__fixtures__')

const found = findExportedSchemas(fixtureDir)
  .map(
    /** @param {{ name: string }} entry @returns {string} */
    (entry) => entry.name,
  )
  .sort((a, b) => a.localeCompare(b))

assert.deepStrictEqual(found, ['pinFirst', 'pinSecond'])
console.log(`inhabitance pin ok: ${found.join(',')}`)
