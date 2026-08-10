#!/usr/bin/env -S deno run
// PreToolUse hook contract: exit 0 allows the command, exit 2 refuses it.
// query, search and vsearch fan out over every collection flagged
// includeByDefault, which is local state this repo cannot know, so a nil result
// names no scope and nobody can re-run it. ls, get and collection are scoped already.

import { toText } from '@std/streams'

// One match per qmd retrieval call, cut at the next pipeline or list operator so
// a later scoped call cannot launder an earlier unscoped one.
const RETRIEVAL = /qmd\s+(?:query|search|vsearch)(?:[^|;&]*)/g
const HELP = /(?:^|\s)(?:--help|-h)(?:\s|$)/
const SCOPED = /(?:^|\s)(?:-c|--collection)(?:\s|=)/

export interface CommandPayload {
  readonly tool_input?: { readonly command?: string }
}

export const unscopedCall = (command: string): string | null =>
  command.match(RETRIEVAL)?.find((call) => !HELP.test(call) && !SCOPED.test(call)) ?? null

if (import.meta.main) {
  const raw = await toText(Deno.stdin.readable)
  let command: string
  try {
    command = (JSON.parse(raw) as CommandPayload).tool_input?.command ?? ''
  } catch {
    Deno.exit(0)
  }

  const offender = unscopedCall(command)
  if (offender === null) Deno.exit(0)

  console.error(
    `Unscoped qmd retrieval: ${offender.trim()}\nPass at least one -c <collection>; take names from \`qmd collection list\` (REPO-W5).`,
  )
  Deno.exit(2)
}
