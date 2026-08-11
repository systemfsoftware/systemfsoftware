import type { Workflow } from '@systemfsoftware/effect-cell-types'
import { type Either, left, right } from 'effect/Either'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import { type AgentKind, AgentLabel, AgentName, RosterEntry } from './agent.schema.js'

const RosterTypeId: unique symbol = Symbol.for('@terok/project-agents/Roster')
type RosterTypeId = typeof RosterTypeId

export class ListAgentsCommand extends S.TaggedClass<ListAgentsCommand>()('ListAgentsCommand', {
  roster: S.Array(RosterEntry),
  all: S.Boolean,
}) {
  readonly [RosterTypeId] = RosterTypeId
}

export class RowsDecision extends S.TaggedClass<RowsDecision>()('RowsDecision', {
  rows: S.Array(S.Struct({ name: AgentName, label: AgentLabel })),
}) {
  readonly [RosterTypeId] = RosterTypeId
}

export class EmptyRosterDecision extends S.TaggedClass<EmptyRosterDecision>()('EmptyRosterDecision', {}) {
  readonly [RosterTypeId] = RosterTypeId
}

export class DuplicateRosterEntryNameError extends S.TaggedError<DuplicateRosterEntryNameError>()(
  'DuplicateRosterEntryNameError',
  { name: AgentName },
) {
  readonly [RosterTypeId] = RosterTypeId
}

export const ListAgentsDecision = S.Union(RowsDecision, EmptyRosterDecision)
export type ListAgentsDecision = S.Schema.Type<typeof ListAgentsDecision>

export type ListAgentsError = DuplicateRosterEntryNameError

type Row = { readonly name: AgentName; readonly label: AgentLabel }

const isAgent = (kind: AgentKind): boolean =>
  Match.value(kind).pipe(
    Match.tag('Agent', () => true),
    Match.tag('Tool', () => false),
    Match.tag('Provider', () => false),
    Match.exhaustive,
  )

const asLabel = (name: AgentName): AgentLabel => S.decodeUnknownSync(AgentLabel)(name)

const labelOf = (entry: RosterEntry): AgentLabel =>
  Option.getOrElse(entry.label, () => Option.getOrElse(entry.authProviderLabel, () => asLabel(entry.name)))

const compareNames = (a: AgentName, b: AgentName): number => Number(a > b) - Number(a < b)

const rowsFor = (entries: ReadonlyArray<RosterEntry>, all: boolean): ReadonlyArray<Row> =>
  entries
    .filter((entry) => all || isAgent(entry.kind))
    .map((entry) => ({ name: entry.name, label: labelOf(entry) }))
    .sort((a, b) => compareNames(a.name, b.name))

const duplicateName = (entries: ReadonlyArray<RosterEntry>): Option.Option<AgentName> =>
  Option.fromNullable(
    entries.find((entry) => entries.some((other) => other !== entry && other.name === entry.name))?.name,
  )

const rowsDecision = (rows: ReadonlyArray<Row>): ListAgentsDecision =>
  Match.value(Option.fromNullable(rows[0])).pipe(
    Match.tag('Some', () => new RowsDecision({ rows })),
    Match.tag('None', () => new EmptyRosterDecision()),
    Match.exhaustive,
  )

export const listAgents: Workflow<ListAgentsCommand, ListAgentsDecision, ListAgentsError> = (
  command: ListAgentsCommand,
): Either<ListAgentsDecision, DuplicateRosterEntryNameError> =>
  Match.value(duplicateName(command.roster)).pipe(
    Match.tag('Some', ({ value }) => left(new DuplicateRosterEntryNameError({ name: value }))),
    Match.tag('None', () => right(rowsDecision(rowsFor(command.roster, command.all)))),
    Match.exhaustive,
  )
