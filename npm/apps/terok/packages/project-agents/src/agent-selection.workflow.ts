import type { Workflow } from '@systemfsoftware/effect-cell-types'
import { type Either, left, right } from 'effect/Either'
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'
import { AgentName, RosterEntry } from './agent.schema.js'

const AgentSelectionTypeId: unique symbol = Symbol.for('@terok/project-agents/AgentSelection')
type AgentSelectionTypeId = typeof AgentSelectionTypeId

export class ValidateSelectionCommand extends S.TaggedClass<ValidateSelectionCommand>()(
  'ValidateSelectionCommand',
  {
    raw: S.String,
    roster: S.Array(RosterEntry),
  },
) {
  readonly [AgentSelectionTypeId] = AgentSelectionTypeId
}

export class AllSelection extends S.TaggedClass<AllSelection>()('AllSelection', {
  excludes: S.Array(AgentName),
}) {
  readonly [AgentSelectionTypeId] = AgentSelectionTypeId
}

export class NamedSelection extends S.TaggedClass<NamedSelection>()('NamedSelection', {
  names: S.Array(AgentName),
  excludes: S.Array(AgentName),
}) {
  readonly [AgentSelectionTypeId] = AgentSelectionTypeId
}

export const Selection = S.Union(AllSelection, NamedSelection)
export type Selection = S.Schema.Type<typeof Selection>

export class SelectionAccepted extends S.TaggedClass<SelectionAccepted>()('SelectionAccepted', {
  raw: S.String,
  parsed: Selection,
  resolved: S.Array(AgentName),
}) {
  readonly [AgentSelectionTypeId] = AgentSelectionTypeId
}

export class UnknownRosterEntriesError extends S.TaggedError<UnknownRosterEntriesError>()(
  'UnknownRosterEntriesError',
  {
    unknownNames: S.Array(S.String),
    availableNames: S.Array(AgentName),
  },
) {
  readonly [AgentSelectionTypeId] = AgentSelectionTypeId
}

export class InvalidSelectionSyntaxError extends S.TaggedError<InvalidSelectionSyntaxError>()(
  'InvalidSelectionSyntaxError',
  {
    raw: S.String,
  },
) {
  readonly [AgentSelectionTypeId] = AgentSelectionTypeId
}

export const SelectionError = S.Union(UnknownRosterEntriesError, InvalidSelectionSyntaxError)
export type SelectionError = S.Schema.Type<typeof SelectionError>

export type SelectionDecision = SelectionAccepted

type RawSelection = {
  readonly all: boolean
  readonly includes: ReadonlyArray<string>
  readonly excludes: ReadonlyArray<string>
}

const normalizePart = (part: string): string => part.trim().toLowerCase()

const parseSelection = (raw: string): Either<RawSelection, InvalidSelectionSyntaxError> => {
  const parts = raw.split(',').map(normalizePart).filter((part) => part.length > 0)
  return Match.value(parts.length === 0).pipe(
    Match.when(true, () => right({ all: true, includes: [], excludes: [] })),
    Match.when(false, () => {
      const all = parts.includes('all')
      const excludes = parts.filter((part) => part.startsWith('-')).map((part) => part.slice(1))
      const includes = parts.filter((part) => !part.startsWith('-') && part !== 'all')
      return Match.value(excludes.some((name) => name.length === 0)).pipe(
        Match.when(true, () => left(new InvalidSelectionSyntaxError({ raw }))),
        Match.when(false, () => right({ all, includes, excludes })),
        Match.exhaustive,
      )
    }),
    Match.exhaustive,
  )
}

const compareNames = (a: AgentName, b: AgentName): number => Number(a > b) - Number(a < b)

const sortedNames = (entries: ReadonlyArray<RosterEntry>): ReadonlyArray<AgentName> =>
  entries.map((entry) => entry.name).sort(compareNames)

const promoteName = (name: string): AgentName => S.decodeUnknownSync(AgentName)(name)

const closeOver = (
  base: ReadonlyArray<AgentName>,
  dependsOn: ReadonlyMap<string, ReadonlyArray<AgentName>>,
): ReadonlyArray<AgentName> => {
  const merged = Array.from(new Set([...base, ...base.flatMap((name) => dependsOn.get(name) ?? [])]))
  return Match.value(merged.length === base.length).pipe(
    Match.when(true, () => merged),
    Match.when(false, () => closeOver(merged, dependsOn)),
    Match.exhaustive,
  )
}

const resolvedFor = (selection: Selection, roster: ReadonlyArray<RosterEntry>): ReadonlyArray<AgentName> => {
  const installable = roster.filter((entry) => entry.install)
  const dependsOn = roster.reduce(
    (map, entry) => map.set(entry.name, entry.dependsOn),
    new Map<string, ReadonlyArray<AgentName>>(),
  )
  const base = Match.value(selection).pipe(
    Match.tag('AllSelection', () => installable.map((entry) => entry.name)),
    Match.tag('NamedSelection', ({ names }) => names),
    Match.exhaustive,
  )
  const excludes = Match.value(selection).pipe(
    Match.tag('AllSelection', ({ excludes }) => excludes),
    Match.tag('NamedSelection', ({ excludes }) => excludes),
    Match.exhaustive,
  )
  const protectedDeps = new Set(closeOver(base, dependsOn).filter((name) => !base.includes(name)))
  const applied = excludes.filter((name) => !protectedDeps.has(name))
  return closeOver(base, dependsOn)
    .filter((name) => !applied.includes(name))
    .sort(compareNames)
}

const selectionFor = (
  raw: RawSelection,
  roster: ReadonlyArray<RosterEntry>,
  rawText: string,
): Either<SelectionDecision, SelectionError> => {
  const installable = roster.filter((entry) => entry.install)
  const installableNames = new Set<string>(installable.map((entry) => entry.name))
  const unknown = Array.from(
    new Set([...raw.includes, ...raw.excludes].filter((name) => !installableNames.has(name))),
  )
  return Match.value(unknown.length > 0).pipe(
    Match.when(true, () =>
      left(
        new UnknownRosterEntriesError({ unknownNames: unknown, availableNames: sortedNames(installable) }),
      )),
    Match.when(false, () => {
      const includes = raw.includes.map(promoteName)
      const excludes = raw.excludes.map(promoteName)
      const selection: Selection = Match.value(raw.all || includes.length === 0).pipe(
        Match.when(true, () => new AllSelection({ excludes })),
        Match.when(false, () => new NamedSelection({ names: includes, excludes })),
        Match.exhaustive,
      )
      return right(
        new SelectionAccepted({ raw: rawText, parsed: selection, resolved: resolvedFor(selection, roster) }),
      )
    }),
    Match.exhaustive,
  )
}

export const validateSelection: Workflow<
  ValidateSelectionCommand,
  SelectionDecision,
  SelectionError
> = (
  command: ValidateSelectionCommand,
): Either<SelectionDecision, UnknownRosterEntriesError | InvalidSelectionSyntaxError> =>
  Match.value(parseSelection(command.raw)).pipe(
    Match.tag('Left', ({ left: error }) => left(error)),
    Match.tag('Right', ({ right: raw }) => selectionFor(raw, command.roster, command.raw)),
    Match.exhaustive,
  )
