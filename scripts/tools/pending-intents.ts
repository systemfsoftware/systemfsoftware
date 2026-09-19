// pending-intents.ts — count change intents the ledger does not record as
// consumed.
//
// `pnpm version -r` consumes an intent into `.changeset/ledger.yaml` on the
// version PR, but it unlinks the intent file only on a later run, after the
// registry confirms the versions those intents produced. Counting
// `.changeset/*.md` therefore answers "how many intent files exist", never "how
// many are pending" — read that way, every release leaves the pipeline in the
// version phase forever, and each push opens a version-packages PR that deletes
// files the previous run already consumed.
//
// The ledger is the record of consumption. An absent or unreadable ledger
// degrades toward "nothing consumed" — more intents look pending — which errs
// toward the version phase the version-bump guard can survive, never toward
// phase `none`, which would silently skip a release. An unreadable ledger and a
// malformed one are the same case here on purpose: both mean "consumption
// cannot be read", and both must land on the conservative side of the line.

import { expandGlob } from '@std/fs/expand-glob'
import { basename, join } from '@std/path'
import { parse } from '@std/yaml'

const consumedIntentStems = (ledgerYaml: string): Set<string> => {
  const parsed = parse(ledgerYaml)
  const stems = new Set<string>()
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return stems
  for (const value of Object.values(parsed)) {
    let intents: unknown
    if (Array.isArray(value)) intents = value
    else if (value !== null && typeof value === 'object' && 'intents' in value) intents = value.intents
    else continue
    if (!Array.isArray(intents)) continue
    for (const intent of intents) {
      if (typeof intent === 'string') stems.add(intent)
    }
  }
  return stems
}

const readConsumedStems = async (ledgerPath: string): Promise<Set<string>> => {
  try {
    return consumedIntentStems(await Deno.readTextFile(ledgerPath))
  } catch {
    return new Set()
  }
}

/** Intent `.md` files under `changesetDir` whose stem the ledger has not recorded. */
export const countPendingIntents = async (changesetDir: string): Promise<number> => {
  const consumed = await readConsumedStems(join(changesetDir, 'ledger.yaml'))
  let pending = 0
  for await (const entry of expandGlob(join(changesetDir, '*.md'))) {
    const stem = basename(entry.path, '.md')
    if (stem !== 'README' && !consumed.has(stem)) pending++
  }
  return pending
}
