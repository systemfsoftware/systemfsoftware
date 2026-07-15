#!/usr/bin/env node
import { StrykerCli } from '../dist/index.mjs'

process.title = 'stryker'
// Run the Stryker CLI
new StrykerCli(process.argv).run()
