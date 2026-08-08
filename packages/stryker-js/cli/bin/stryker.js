#!/usr/bin/env node
import { runStrykerCli } from '../dist/index.mjs'

process.title = 'stryker'
// Run the Stryker CLI through the Effect bootstrap (NodeRuntime.runMain equivalent)
runStrykerCli(process.argv)
