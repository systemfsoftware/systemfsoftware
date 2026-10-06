import { it } from '@systemfsoftware/vitest'
import { Array as Arr, Option, Schema } from 'effect'
import { assembleLedger } from '../assemble.js'
import { classify, joinGrants } from '../classify.js'
import { Entry, Marker } from '../Entry.schema.js'
import { Ledger } from '../Ledger.schema.js'
import { renderJson } from '../render-json.js'
import { renderMarkdown } from '../render-md.js'

const emptyIndex = joinGrants({ configEntries: [], grants: [], patches: [] })

const OWNED_TODO = /^TODO\(@[A-Za-z0-9][A-Za-z0-9-]{0,38}\):\s*\S/

const markerText = (input: { readonly owned: boolean; readonly reason: string }): string =>
  input.owned ? `TODO(@ryanleecode): fix ${input.reason}` : input.reason

const renderBoth = (entries: ReadonlyArray<Entry>) => {
  const ledger = assembleLedger({ entries, index: emptyIndex, channels: ['t'], fileCount: entries.length })
  return { json: renderJson(ledger), md: renderMarkdown(ledger) }
}

const entryCount = (json: string): number =>
  Option.match(Schema.decodeUnknownOption(Ledger)(JSON.parse(json)), {
    onNone: () => -1,
    onSome: (ledger) => ledger.entries.length,
  })

it.prop(
  '∀markerText_TodoOwner_≡SpecGrammar',
  {
    of: [Schema.Struct({ owned: Schema.Boolean, reason: Schema.String })],
    subject: (input: { readonly owned: boolean; readonly reason: string }) =>
      classify(Marker.make({ file: 'a.ts', line: 1, tag: 'TODO', text: markerText(input) }), emptyIndex)._tag,
  },
  (subject, [input]) => (subject(input) === 'Declared') === OWNED_TODO.test(markerText(input).trim()),
)

it.prop(
  '∀entries_Render_≡OrderInsensitive',
  { of: [Schema.Array(Entry)], subject: renderBoth },
  (subject, [entries]) => {
    const forward = subject(entries)
    const reversed = subject(Arr.reverse(entries))
    return forward.json === reversed.json &&
      forward.md === reversed.md &&
      entryCount(forward.json) === entries.length
  },
)
