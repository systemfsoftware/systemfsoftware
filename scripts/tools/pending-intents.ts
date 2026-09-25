// pending-intents.ts — count change intents the ledger does not record as
// consumed and that request a release.
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
//
// An intent whose every bump is `none` requests no release: `pnpm version -r`
// bumps no manifest for it, so the version phase has nothing to put in a PR
// and `open-release-pr.sh` opens none. Counted as pending, such an intent held
// the planner in the version phase on every push and the owed versions never
// reached the publish job. It is consumed alongside the next intent that does
// request a release. Frontmatter that cannot be read counts as pending, on the
// same conservative side as an unreadable ledger.

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

const BUMP_NONE = 'none'

/** False only when the frontmatter parses to a non-empty map whose every bump is `none`. */
const requestsRelease = (content: string): boolean => {
  const match = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return true
  let bumps: unknown
  try {
    bumps = parse(match[1])
  } catch {
    return true
  }
  if (bumps === null || typeof bumps !== 'object' || Array.isArray(bumps)) return true
  const values = Object.values(bumps)
  return values.length === 0 || values.some((bump) => bump !== BUMP_NONE)
}

/** Intent `.md` files under `changesetDir` the ledger has not recorded and that request a release. */
export const countPendingIntents = async (changesetDir: string): Promise<number> => {
  const consumed = await readConsumedStems(join(changesetDir, 'ledger.yaml'))
  let pending = 0
  for await (const entry of expandGlob(join(changesetDir, '*.md'))) {
    const stem = basename(entry.path, '.md')
    if (stem === 'README' || consumed.has(stem)) continue
    if (requestsRelease(await Deno.readTextFile(entry.path))) pending++
  }
  return pending
}
