import {
  AutomationUnsupported,
  type ByRole,
  type EngineCapability,
  type LocatorExpression,
  type NthIndex,
  type SemanticNode,
  type TextPattern,
} from '@systemfsoftware/effect-e2e/engine'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'

import type { DomEntry } from './dom-tree.js'

export type Resolved = Result.Result<ReadonlyArray<DomEntry>, AutomationUnsupported>

const refusal = (message: string, what: string): AutomationUnsupported =>
  new AutomationUnsupported({ message, evidence: [{ _tag: 'LogEvidence', text: what }] })

export const undeclared = (capability: EngineCapability): AutomationUnsupported =>
  refusal(`the engine does not declare the ${capability} capability`, capability)

export const unimplemented = (what: string): AutomationUnsupported =>
  refusal(`the jsdom port fake does not implement ${what}`, what)

const nameOf = (node: SemanticNode): string => Option.getOrElse(Option.fromNullishOr(node.name), () => '')

export const textOf = (node: SemanticNode): string =>
  Option.fromNullishOr(node.text).pipe(
    Option.orElse(() => Option.fromNullishOr(node.name)),
    Option.getOrElse(() => ''),
  )

const normalized = (text: string): string => text.trim().replace(/\s+/g, ' ').toLowerCase()

const matchesText = (pattern: TextPattern, text: string): boolean =>
  pattern.exact ? text === pattern.value : normalized(text).includes(normalized(pattern.value))

const mentions = (pattern: TextPattern) => (node: SemanticNode): boolean =>
  [node.text, node.name].some((text) => text !== undefined && matchesText(pattern, text)) ||
  node.children.some(mentions(pattern))

const isControl = (node: SemanticNode): boolean => node.value !== undefined || node.states.checked !== undefined

const hasRole = (locator: ByRole) => ({ node }: DomEntry): boolean =>
  node.role === locator.role && (locator.name === undefined || matchesText(locator.name, nameOf(node)))

const nthOf = (index: NthIndex) => (entries: ReadonlyArray<DomEntry>): ReadonlyArray<DomEntry> =>
  Match.value(index).pipe(
    Match.when('first', () => entries.slice(0, 1)),
    Match.when('last', () => entries.slice(-1)),
    Match.orElse((at) => Option.toArray(Arr.get(entries, at < 0 ? entries.length + at : at))),
  )

export const resolveIn = (entries: ReadonlyArray<DomEntry>) => (expression: LocatorExpression): Resolved =>
  Match.value(expression).pipe(
    Match.discriminatorsExhaustive('kind')({
      ByRole: (locator): Resolved => Result.succeed(entries.filter(hasRole(locator))),
      ByText: ({ text }): Resolved => Result.succeed(entries.filter(({ node }) => matchesText(text, textOf(node)))),
      ByLabel: ({ text }): Resolved =>
        Result.succeed(entries.filter(({ node }) => isControl(node) && matchesText(text, nameOf(node)))),
      Filter: ({ inner, text }): Resolved =>
        Result.map(resolveIn(entries)(inner), (found) => found.filter(({ node }) => mentions(text)(node))),
      Nth: ({ inner, index }): Resolved => Result.map(resolveIn(entries)(inner), nthOf(index)),
      Frame: (): Resolved => Result.fail(undeclared('frames')),
      ByPlaceholder: (): Resolved => Result.fail(unimplemented('placeholder locators')),
      ByTestId: (): Resolved => Result.fail(unimplemented('test-id locators')),
      Selector: (): Resolved => Result.fail(unimplemented('CSS selector locators')),
    }),
  )
