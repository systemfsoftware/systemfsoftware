#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run=pnpm --allow-net=registry.npmjs.org
// plan-release.ts — decide which release phase this push is, from repository
// state alone.
//
// The publish used to hang off `pull_request: closed` for the Release PR. That
// trigger is single-shot: a run that failed at its preflight step left 32
// packages version-bumped on main with no tag, no npm release and no GitHub
// Release, and no later push could retry it. State is durable where a PR event
// is not, so the phase comes from state and a half-finished release resumes on
// the next push.
//
// Two numbers decide it (`./release-phase.ts`):
//   - `owed`    — workspace versions the npm registry does not yet serve
//                 (`./cycle.ts`, a registry fact: tags are written
//                 downstream of the publish that would prove them).
//   - `pending` — change intents `.changeset/ledger.yaml` does not record as
//                 consumed (`./pending-intents.ts`, because pnpm unlinks an
//                 intent file only once the registry confirms the version it
//                 produced).

import { parseArgs } from '@std/cli/parse-args'
import { loadWorkspaceCycle } from './cycle.ts'
import { countPendingIntents } from './pending-intents.ts'
import { decidePhase } from './release-phase.ts'

const flags = parseArgs(Deno.args, {
  string: ['output'],
})

const [pending, allOwed] = await Promise.all([countPendingIntents('.changeset'), loadWorkspaceCycle()])
const owed = allOwed.length
const phase = decidePhase(owed, pending)

// The key=value block is the job output. It goes to --output when given,
// because stdout also carries diagnostics and `>> "$GITHUB_OUTPUT"` would write
// those into the output file as bogus keys.
const outputs = [
  `phase=${phase}`,
  `pending_intents=${pending}`,
  `this_cycle=${owed}`,
].join('\n')

console.error(`plan-release: pending_intents=${pending} this_cycle=${owed} -> phase=${phase}`)

if (flags.output) await Deno.writeTextFile(flags.output, `${outputs}\n`, { append: true })
else console.log(outputs)
