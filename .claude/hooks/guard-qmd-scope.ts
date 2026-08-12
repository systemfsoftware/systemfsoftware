#!/usr/bin/env -S deno run
// PreToolUse hook contract: exit 0 allows the command, exit 2 refuses it.
// Unscoped: query, search and vsearch fan out over every includeByDefault
// collection, local state this repo cannot know, so a nil result names no scope.
// Cold-start: query and vsearch load three GGUFs per invocation and the CLI is a
// fresh process every call, so they outrun the tool timeout. Measured here
// 2026-08-11: search 0.34s, query >120s (also with --no-rerank), vsearch >180s.

import { toText } from '@std/streams'

// One match per qmd retrieval call, cut at the next pipeline or list operator so
// a later scoped call cannot launder an earlier unscoped one.
const RETRIEVAL = /qmd\s+(?:query|search|vsearch)(?:[^|;&]*)/g
const HELP = /(?:^|\s)(?:--help|-h)(?:\s|$)/
const SCOPED = /(?:^|\s)(?:-c|--collection)(?:\s|=)/
const COLD_START = /^qmd\s+(?:query|vsearch)\b/

export interface CommandPayload {
  readonly tool_input?: { readonly command?: string }
}

const retrievalCalls = (command: string): readonly string[] =>
  (command.match(RETRIEVAL) ?? []).filter((call) => !HELP.test(call))

export const unscopedCall = (command: string): string | null =>
  retrievalCalls(command).find((call) => !SCOPED.test(call)) ?? null

export const coldStartCall = (command: string): string | null =>
  retrievalCalls(command).find((call) => COLD_START.test(call.trim())) ?? null

if (import.meta.main) {
  const raw = await toText(Deno.stdin.readable)
  let command: string
  try {
    command = (JSON.parse(raw) as CommandPayload).tool_input?.command ?? ''
  } catch {
    Deno.exit(0)
  }

  const unscoped = unscopedCall(command)
  if (unscoped !== null) {
    console.error(
      `Unscoped qmd retrieval: ${unscoped.trim()}\nPass at least one -c <collection>; take names from \`qmd collection list\` (REPO-W5).`,
    )
    Deno.exit(2)
  }

  const coldStart = coldStartCall(command)
  if (coldStart !== null) {
    console.error(
      `Cold-start qmd retrieval: ${coldStart.trim()}\nquery and vsearch reload the expansion, embedding and reranker GGUFs on every CLI call on this GPU-less host, so they outrun the tool timeout (measured: search 0.34s, query >120s, vsearch >180s).\nUse \`qmd search <terms> -c <collection>\` — it loads no model and clears the REPO-W4 plan gate identically.`,
    )
    Deno.exit(2)
  }

  Deno.exit(0)
}
