import { describe, it } from '@effect/vitest'
import { Arbitrary, Either, FastCheck as fc, Option } from 'effect'
import { RosterEntry } from '../agent.schema.js'
import { listAgents, ListAgentsCommand } from '../roster.workflow.js'

const isAgentEntry = (entry: RosterEntry): boolean => entry.kind._tag === 'Agent'

const hasDuplicateNames = (entries: ReadonlyArray<RosterEntry>): boolean =>
  new Set(entries.map((entry) => entry.name)).size !== entries.length

const rowFor = (
  decision: { readonly rows: ReadonlyArray<{ readonly name: string }> },
  name: string,
): boolean => decision.rows.some((row) => row.name === name)

describe('listAgents — table decisions', () => {
  it.prop('∀c_ListAgents_≤Sorted', [ListAgentsCommand], ([command]) =>
    Either.match(listAgents(command), {
      onLeft: () => true,
      onRight: (decision) => {
        if (decision._tag !== 'RowsDecision') return true
        const names = decision.rows.map((row) => row.name)
        return [...names].sort().join('\u0000') === names.join('\u0000')
      },
    }))

  it.prop('∀g_ListAgents_=LabelFallback', [fc.gen()], ([g]) => {
    const entry = g(Arbitrary.make, RosterEntry)
    const result = listAgents(new ListAgentsCommand({ roster: [entry], all: true }))
    return Either.match(result, {
      onLeft: () => false,
      onRight: (decision) => {
        if (decision._tag !== 'RowsDecision') return false
        const row = decision.rows.find((candidate) => candidate.name === entry.name)
        return (
          row !== undefined &&
          row.label === Option.getOrElse(entry.label, () => Option.getOrElse(entry.authProviderLabel, () => entry.name))
        )
      },
    })
  })

  it.prop('∀g_ListAgents_⊆AgentsWhenBare', [fc.gen()], ([g]) => {
    const entry = g(Arbitrary.make, RosterEntry)
    const result = listAgents(new ListAgentsCommand({ roster: [entry], all: false }))
    return Either.match(result, {
      onLeft: () => false,
      onRight: (decision) =>
        isAgentEntry(entry)
          ? decision._tag === 'RowsDecision' && decision.rows.length === 1
          : decision._tag === 'EmptyRosterDecision',
    })
  })

  it.prop('∀g_ListAgents_=RowCount', [fc.gen()], ([g]) => {
    const first = g(Arbitrary.make, RosterEntry)
    const second = g(Arbitrary.make, RosterEntry)
    if (first.name === second.name) return true
    const result = listAgents(new ListAgentsCommand({ roster: [first, second], all: true }))
    return Either.match(result, {
      onLeft: () => false,
      onRight: (decision) =>
        decision._tag === 'RowsDecision' &&
        decision.rows.length === 2 &&
        rowFor(decision, first.name) &&
        rowFor(decision, second.name),
    })
  })

  it.prop('∀c_EmptyRoster_=EmptyDecision', [ListAgentsCommand], ([command]) =>
    command.roster.length > 0 ||
    Either.match(listAgents(command), {
      onLeft: () => false,
      onRight: (decision) => decision._tag === 'EmptyRosterDecision',
    }))

  it.prop(
    '∀c_DuplicateRoster_∈ErrorChannel',
    [ListAgentsCommand],
    ([command]) => Either.isLeft(listAgents(command)) === hasDuplicateNames(command.roster),
  )
})
