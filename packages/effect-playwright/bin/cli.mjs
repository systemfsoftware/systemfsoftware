#!/usr/bin/env node
/// <reference types="node" />
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const cliPath = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'cli.js')
require(cliPath)
