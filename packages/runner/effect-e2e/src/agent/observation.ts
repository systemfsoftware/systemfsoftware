import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Schema from 'effect/Schema'

import type { Observation } from '../engine/observation.schema.js'
import type { Route } from '../engine/route.schema.js'
import { type NodeStates, SemanticNode } from '../engine/semantic-node.schema.js'

export interface SecretValue {
  readonly name: string
  readonly value: string
}

const NAME_LIMIT = 256
const TEXT_LIMIT = 512

export const SECRET_MASK = (name: string): string => `[secret:${name}]`

const byLongestValue: Order.Order<SecretValue> = Order.mapInput(
  Order.Number,
  (secret: SecretValue) => -secret.value.length,
)

const maskableSecrets = (secrets: ReadonlyArray<SecretValue>): ReadonlyArray<SecretValue> =>
  Arr.filter(secrets, (secret) => secret.value !== '')

const longestFirst = (secrets: ReadonlyArray<SecretValue>): ReadonlyArray<SecretValue> =>
  Arr.sort(maskableSecrets(secrets), byLongestValue)

interface Claim {
  readonly start: number
  readonly end: number
  readonly name: string
}

const overlapsAny = (claims: ReadonlyArray<Claim>, start: number, end: number): boolean =>
  Arr.some(claims, (claim) => claim.start < end && start < claim.end)

const occurrenceOf = (text: string, value: string, from: number): Option.Option<number> =>
  Option.filter(Option.some(text.indexOf(value, from)), (at) => at >= 0)

const claimedAt = (text: string, secret: SecretValue, claims: ReadonlyArray<Claim>, start: number) => {
  const end = start + secret.value.length
  return overlapsAny(claims, start, end)
    ? claimsOf(text, secret, claims, start + 1)
    : claimsOf(text, secret, [...claims, { start, end, name: secret.name }], end)
}

const claimsOf = (
  text: string,
  secret: SecretValue,
  claims: ReadonlyArray<Claim>,
  from: number,
): ReadonlyArray<Claim> =>
  Option.match(occurrenceOf(text, secret.value, from), {
    onNone: () => claims,
    onSome: (start) => claimedAt(text, secret, claims, start),
  })

const byStart: Order.Order<Claim> = Order.mapInput(Order.Number, (claim: Claim) => claim.start)

const renderedWith = (text: string, claims: ReadonlyArray<Claim>): string => {
  const rendered = Arr.reduce(Arr.sort(claims, byStart), { out: '', at: 0 }, (done, claim) => ({
    out: `${done.out}${text.slice(done.at, claim.start)}${SECRET_MASK(claim.name)}`,
    at: claim.end,
  }))
  return `${rendered.out}${text.slice(rendered.at)}`
}

const redactClaimed = (secrets: ReadonlyArray<SecretValue>, text: string, claimed: ReadonlyArray<Claim>): string =>
  renderedWith(text, Arr.reduce(longestFirst(secrets), claimed, (claims, secret) => claimsOf(text, secret, claims, 0)))

/** Replace every occurrence of each non-empty secret value by its mask, longest value first, by literal search. */
export const redactText: {
  (secrets: ReadonlyArray<SecretValue>, text: string): string
  (secrets: ReadonlyArray<SecretValue>): (text: string) => string
} = Function.dual(
  2,
  (secrets: ReadonlyArray<SecretValue>, text: string): string => redactClaimed(secrets, text, []),
)

interface CutMatch {
  readonly secret: SecretValue
  readonly length: number
}

/** The largest k in 1..value.length-1 such that text ends with the value's first k characters; 0 when there is none. */
const trailingPrefixLength = (secret: SecretValue, text: string): number =>
  secret.value.length < 2 ? 0 : foundPrefixLength(secret, text)

const foundPrefixLength = (secret: SecretValue, text: string): number =>
  Option.getOrElse(
    Option.firstSomeOf(Arr.map(prefixCandidates(secret), (length) => suffixPrefixOf(secret, text, length))),
    () => 0,
  )

/** The candidate lengths, longest first: value.length-1 down to 1. */
const prefixCandidates = (secret: SecretValue): ReadonlyArray<number> => {
  const top = secret.value.length - 1
  return Arr.makeBy(top, (index) => top - index)
}

const suffixPrefixOf = (secret: SecretValue, text: string, length: number): Option.Option<number> =>
  text.endsWith(secret.value.slice(0, length)) ? Option.some(length) : Option.none()

const matchAt = (secret: SecretValue, text: string): Option.Option<CutMatch> =>
  Option.map(
    Option.filter(Option.some(trailingPrefixLength(secret, text)), (length) => length > 0),
    (length) => ({ secret, length }),
  )

const byLongestMatch: Order.Order<CutMatch> = Order.mapInput(Order.Number, (match: CutMatch) => -match.length)

/** The longest trailing secret prefix across all secrets; ties keep the first in longest-value order. */
const cutMatchIn = (secrets: ReadonlyArray<SecretValue>, text: string): Option.Option<CutMatch> =>
  Arr.head(Arr.sort(Arr.getSomes(Arr.map(longestFirst(secrets), (secret) => matchAt(secret, text))), byLongestMatch))

const cutRedacted = (secrets: ReadonlyArray<SecretValue>, text: string, match: CutMatch): string =>
  redactClaimed(secrets, text, [{ start: text.length - match.length, end: text.length, name: match.secret.name }])

const redactCutAtLimit = (secrets: ReadonlyArray<SecretValue>, limit: number, text: string): string =>
  text.length === limit
    ? Option.match(cutMatchIn(secrets, text), {
      onNone: () => redactText(secrets, text),
      onSome: (match: CutMatch) => cutRedacted(secrets, text, match),
    })
    : redactText(secrets, text)

/**
 * Redact a field that was cut at `limit` characters: when the text is exactly `limit` long and ends with a
 * secret prefix, that prefix is masked too; then every full value is masked as in `redactText`.
 */
export const redactCut: {
  (secrets: ReadonlyArray<SecretValue>, limit: number, text: string): string
  (secrets: ReadonlyArray<SecretValue>, limit: number): (text: string) => string
} = Function.dual(3, redactCutAtLimit)

const queryTermOf = ([key, value]: readonly [string, string]): string => `${key}=${value}`

const querySuffixOf = (query: ReadonlyArray<readonly [string, string]>): string =>
  query.length === 0 ? '' : `?${Arr.join(Arr.map(query, queryTermOf), '&')}`

const disabledWordOf = (states: NodeStates): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(states.disabled), (value) => value === true).pipe(Option.map(() => 'disabled'))

const stateWordOf = (defined: boolean | undefined, whenTrue: string, whenFalse: string): Option.Option<string> =>
  Option.map(Option.fromNullishOr(defined), (value) => (value ? whenTrue : whenFalse))

const stateWordsOf = (states: NodeStates): ReadonlyArray<string> =>
  Arr.getSomes(
    [
      disabledWordOf(states),
      stateWordOf(states.checked, 'checked', 'unchecked'),
      stateWordOf(states.selected, 'selected', 'unselected'),
      stateWordOf(states.expanded, 'expanded', 'collapsed'),
      stateWordOf(states.pressed, 'pressed', 'unpressed'),
    ],
  )

const fieldPartOf = (label: string, value: string): string => ` ${label}="${value}"`

const textPartOf = (node: SemanticNode, redactField: (limit: number, text: string) => string): string =>
  node.text === undefined ? '' : fieldPartOf('text', redactField(TEXT_LIMIT, node.text))

const valuePartOf = (node: SemanticNode, redactField: (limit: number, text: string) => string): string =>
  node.value === undefined ? '' : fieldPartOf('value', redactField(TEXT_LIMIT, node.value))

const statesPartOf = (states: NodeStates): string => {
  const words = stateWordsOf(states)
  return words.length === 0 ? '' : ` (${Arr.join(words, ', ')})`
}

const roleOf = (node: SemanticNode): string => (node.role === undefined ? '-' : node.role)

const nameOf = (node: SemanticNode, redactField: (limit: number, text: string) => string): string =>
  redactField(NAME_LIMIT, node.name === undefined ? '' : node.name)

const nodeLineOf = (
  node: SemanticNode,
  depth: number,
  redactField: (limit: number, text: string) => string,
): string => {
  const indent = '  '.repeat(depth)
  return `${indent}[${node.ref.id}] ${roleOf(node)} "${nameOf(node, redactField)}"${textPartOf(node, redactField)}${
    valuePartOf(node, redactField)
  }${statesPartOf(node.states)}`
}

const visibleLinesOf = (
  nodes: ReadonlyArray<SemanticNode>,
  depth: number,
  redactField: (limit: number, text: string) => string,
): ReadonlyArray<string> =>
  Arr.flatMap(nodes, (node) =>
    node.states.hidden
      ? []
      : [nodeLineOf(node, depth, redactField), ...visibleLinesOf(node.children, depth + 1, redactField)])

const routeLineOf = (observation: Observation, redactField: (limit: number, text: string) => string): string =>
  `route: ${observation.route.origin}${
    redactField(Number.POSITIVE_INFINITY, `${observation.route.path}${querySuffixOf(observation.route.query)}`)
  }`

/** The first line is the redacted route; then one line per visible node in pre-order, hidden subtrees skipped. */
export const formatObservation: {
  (observation: Observation, redactField: (limit: number, text: string) => string): string
  (observation: Observation): (redactField: (limit: number, text: string) => string) => string
} = Function.dual(
  2,
  (observation: Observation, redactField: (limit: number, text: string) => string): string =>
    Arr.join([routeLineOf(observation, redactField), ...visibleLinesOf(observation.tree, 0, redactField)], '\n'),
)

interface StableNode {
  readonly id: string
  readonly node: Omit<SemanticNode, 'ref' | 'children'>
  readonly children: ReadonlyArray<StableNode>
}

const stableNodeOf = ({ ref, children, ...node }: SemanticNode): StableNode => ({
  id: ref.id,
  node,
  children: children.map(stableNodeOf),
})

export const stableTextOf = (observation: Observation): string =>
  JSON.stringify([observation.route, observation.tree.map(stableNodeOf)])

// The property laws below pin the redaction contract of this module: masking by name, the cut-at-limit
// prefix rule, and hidden-subtree skipping. Inputs are drawn from the production schemas; secrets are
// derived words (lowercase-alphanumeric, >= 3 chars) so they never collide with the uppercase constants.

const HOME_ROUTE: Route = { origin: 'HTTPS://APP.TEST', path: '/HOME', query: [] }

const maskOf = (name: string): string => `[secret:${name}]`

const countOf = (text: string, part: string): number => text.split(part).length - 1

const lettersOf = (raw: string): string => raw.replace(/[^a-z0-9]/gu, '').slice(0, 24)

const paddedWordOf = (letters: string): string => letters.length >= 4 ? letters : `${letters}qzq0`.slice(0, 4)

const withLetterOf = (padded: string): string => /[a-z]/u.test(padded) ? padded : `${padded}q`

/** A lowercase-alphanumeric word (>= 4 chars, at least one letter) so secrets never collide with the uppercase names and constants the laws render. */
const wordOf = (raw: string): string => withLetterOf(paddedWordOf(lettersOf(raw)))

/** A char guaranteed absent from `text`, so a filler run can never extend a secret prefix or hide a whole value. */
const outsideChar = (text: string): string =>
  Option.getOrElse(Arr.findFirst(['z', 'y', 'x', '0', 'q', 'j'], (char) => !text.includes(char)), () => 'Q')

/** A proper-prefix length in 1..word.length-1 chosen from the draw. */
const prefixLengthOf = (drawn: number, word: string): number => 1 + (Math.abs(drawn) % (word.length - 1))

const observationOf = (tree: ReadonlyArray<SemanticNode>): Observation => ({
  route: HOME_ROUTE,
  revision: 'R1',
  tree,
})

const definedEntriesOf = (
  fields: {
    readonly role?: string | undefined
    readonly name?: string | undefined
    readonly text?: string | undefined
    readonly value?: string | undefined
  },
): ReadonlyArray<readonly [string, string]> =>
  Object.entries({ role: fields.role, name: fields.name, text: fields.text, value: fields.value }).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  )

const leafOf = (
  id: string,
  fields: {
    readonly role?: string
    readonly name?: string
    readonly text?: string
    readonly value?: string
    readonly hidden?: boolean
  } = {},
): SemanticNode => ({
  ...Object.fromEntries(definedEntriesOf(fields)),
  ref: { id, revision: 'R1' },
  states: { disabled: false, hidden: fields.hidden === true },
  children: [],
})

/**
 * The drawn subtree with its engine handles (ref ids, roles) replaced by uppercase constants. Handles are
 * assigned by the engine, never typed by the page, and the model calls tools by them, so the formatter prints
 * them verbatim; a drawn handle that happens to spell the secret says nothing about redaction.
 */
const handledOf = (nodes: ReadonlyArray<SemanticNode>, path: string): ReadonlyArray<SemanticNode> =>
  Arr.map(nodes, (node, index) => ({
    ...Object.fromEntries(definedEntriesOf({ name: node.name, text: node.text, value: node.value })),
    ref: { id: `N${path}_${String(index)}`, revision: 'R1' },
    role: 'ROLE',
    states: node.states,
    children: handledOf(node.children, `${path}_${String(index)}`),
  }))

/** The drawn node's subtree under a fresh visible node, with one field planted — never spreading the drawn node itself. */
const plantedOf = (
  node: SemanticNode,
  id: string,
  field: 'name' | 'text' | 'value',
  content: string,
): SemanticNode => ({
  ...Object.fromEntries([[field, content]]),
  ref: { id, revision: 'R1' },
  role: 'ROLE',
  states: { disabled: false, hidden: false },
  children: handledOf(node.children, '0'),
})

/**
 * A secret the formatter's own fixed text cannot spell: labels (`text=`), state words (`disabled`) and the mask
 * itself (`[secret:…]`) are lowercase, so a bare word could appear in the output with no content leaking.
 */
const framedSecretOf = (raw: string): SecretValue => ({ name: 'S_VAULT', value: `~${wordOf(raw)}~` })

/** The output with every mask of `name` removed; a secret found in what remains leaked. */
const outsideMasksOf = (formatted: string, name: string): string => formatted.split(maskOf(name)).join('')

/** A fresh hidden node with the given children, standing in for a hidden subtree. */
const hidingOf = (children: ReadonlyArray<SemanticNode>): SemanticNode => ({
  ref: { id: 'HID_N', revision: 'R1' },
  role: 'ROLE',
  states: { disabled: false, hidden: true },
  children,
})

const hiddenLeaf: SemanticNode = leafOf('HID_C', { role: 'ROLE', name: 'HID_NAME' })

const redactedBy = (secrets: ReadonlyArray<SecretValue>) => (limit: number, text: string): string =>
  redactCut(secrets, limit, text)

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as undefined, so a static import would ship the test runner.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀t_PlantedName_¬∈Format',
    { of: [SemanticNode, Schema.String], subject: formatObservation, arbitrary: { seed: 505_001 } },
    (format, [drawn, raw]) => {
      const secret = framedSecretOf(raw)
      const tree = [plantedOf(drawn, 'N1', 'name', `x${secret.value}y`)]
      const formatted = format(observationOf(tree), redactedBy([secret]))
      return formatted.includes(maskOf(secret.name)) && !outsideMasksOf(formatted, secret.name).includes(secret.value)
    },
  )

  it.prop(
    '∀t_PlantedText_¬∈Format',
    { of: [SemanticNode, Schema.String], subject: formatObservation, arbitrary: { seed: 505_002 } },
    (format, [drawn, raw]) => {
      const secret = framedSecretOf(raw)
      const tree = [plantedOf(drawn, 'N1', 'text', `x${secret.value}y`)]
      const formatted = format(observationOf(tree), redactedBy([secret]))
      return formatted.includes(maskOf(secret.name)) && !outsideMasksOf(formatted, secret.name).includes(secret.value)
    },
  )

  it.prop(
    '∀t_PlantedValue_¬∈Format',
    { of: [SemanticNode, Schema.String], subject: formatObservation, arbitrary: { seed: 505_003 } },
    (format, [drawn, raw]) => {
      const secret = framedSecretOf(raw)
      const tree = [plantedOf(drawn, 'N1', 'value', `x${secret.value}y`)]
      const formatted = format(observationOf(tree), redactedBy([secret]))
      return formatted.includes(maskOf(secret.name)) && !outsideMasksOf(formatted, secret.name).includes(secret.value)
    },
  )

  it.prop(
    '∀w_CutName_≡MaskedAtTail',
    { of: [Schema.String, Schema.Int], subject: formatObservation, arbitrary: { seed: 505_004 } },
    (format, [raw, picked]) => {
      const word = wordOf(raw)
      const tail = word.slice(0, prefixLengthOf(picked, word))
      const filler = outsideChar(word).repeat(256 - tail.length)
      const secret = { name: 'S_CUT', value: word }
      const tree = [leafOf('N1', { role: 'ROLE', name: `${filler}${tail}` })]
      const formatted = format(observationOf(tree), redactedBy([secret]))
      return formatted.includes(`${filler}${maskOf(secret.name)}`) && !formatted.includes(`${filler}${tail}`)
    },
  )

  it.prop(
    '∀w_CutText_≡MaskedAtTail',
    { of: [Schema.String, Schema.Int], subject: formatObservation, arbitrary: { seed: 505_005 } },
    (format, [raw, picked]) => {
      const word = wordOf(raw)
      const tail = word.slice(0, prefixLengthOf(picked, word))
      const filler = outsideChar(word).repeat(512 - tail.length)
      const secret = { name: 'S_CUT', value: word }
      const tree = [leafOf('N1', { role: 'ROLE', text: `${filler}${tail}` })]
      const formatted = format(observationOf(tree), redactedBy([secret]))
      return formatted.includes(`${filler}${maskOf(secret.name)}`) && !formatted.includes(`${filler}${tail}`)
    },
  )

  it.prop(
    '∀w_ShortText_≡Unchanged',
    { of: [Schema.String, Schema.Int], subject: redactCut, arbitrary: { seed: 505_006 } },
    (cut, [raw, picked]) => {
      const word = wordOf(raw)
      const tail = word.slice(0, prefixLengthOf(picked, word))
      const text = `${outsideChar(word).repeat(300)}${tail}`
      return cut([{ name: 'S_SHORT', value: word }], 512, text) === text
    },
  )

  it.prop(
    '∀s_EmptySecret_≡Identity',
    {
      of: [Schema.String],
      subject: (text: string): string => redactCut([{ name: 'S_EMPTY', value: '' }], 256, text),
      arbitrary: { seed: 505_007 },
    },
    (subject, [raw]) => {
      const cutText = `${raw}${'q'.repeat(400)}`.slice(0, 256)
      return subject(raw) === raw && subject(cutText) === cutText
    },
  )

  it.prop(
    '∀w_NestedValues_≡ExactMasks',
    { of: [Schema.String], subject: redactText, arbitrary: { seed: 505_008 } },
    (redact, [raw]) => {
      const word = wordOf(raw)
      const long = { name: 'S_LONG', value: word }
      const short = { name: 'T_SHORT', value: word.slice(0, 2) }
      const filler = outsideChar(word).repeat(20)
      return redact([short, long], `${short.value}|${long.value}|${filler}`) ===
        `${maskOf(short.name)}|${maskOf(long.name)}|${filler}`
    },
  )

  it.prop(
    '∀t_HiddenNodes_¬∈Format',
    { of: [SemanticNode], subject: formatObservation, arbitrary: { seed: 505_009 } },
    (format, [drawn]) => {
      const tree = [plantedOf(drawn, 'VIS_ROOT', 'name', 'LBL'), hidingOf([hiddenLeaf])]
      const formatted = format(observationOf(tree), redactedBy([]))
      const hiddenCount = countOf(formatted, 'HID_N') + countOf(formatted, 'HID_C')
      return hiddenCount === 0 && formatted.includes('VIS_ROOT')
    },
  )

  it.prop(
    '∀t_VisibleRefs_≡Once',
    { of: [SemanticNode], subject: formatObservation, arbitrary: { seed: 505_010 } },
    (format, [drawn]) => {
      const withSequentialIds = (nodes: ReadonlyArray<SemanticNode>): ReadonlyArray<SemanticNode> => {
        let next = 0
        const visit = (node: SemanticNode): SemanticNode => {
          const id = `N${String(next)}`
          next += 1
          return {
            ref: { id, revision: 'R1' },
            states: { disabled: false, hidden: false },
            children: node.children.map(visit),
          }
        }
        return nodes.map(visit)
      }
      const tree = withSequentialIds([drawn])
      const formatted = format(observationOf(tree), redactedBy([]))
      const idsOf = (nodes: ReadonlyArray<SemanticNode>): ReadonlyArray<string> =>
        Arr.flatMap(nodes, (node) => [node.ref.id, ...idsOf(node.children)])
      return Arr.every(idsOf(tree), (id) => countOf(formatted, `[${id}]`) === 1)
    },
  )

  it.prop(
    '∀w_RouteSecret_⊆MaskedRoute',
    { of: [Schema.String], subject: formatObservation, arbitrary: { seed: 505_011 } },
    (format, [raw]) => {
      const secret = { name: 'S_ROUTE', value: wordOf(raw) }
      const route: Route = {
        origin: 'HTTPS://APP.TEST',
        path: `/P${secret.value}X`,
        query: [['Q', `Z${secret.value}`]],
      }
      const formatted = format({ route, revision: 'R1', tree: [leafOf('N1', { role: 'ROLE' })] }, redactedBy([secret]))
      return countOf(formatted, maskOf(secret.name)) === 2 && !formatted.includes(secret.value)
    },
  )

  it.prop(
    '∀w_CutValue_≡MaskedAtTail',
    { of: [Schema.String, Schema.Int], subject: formatObservation, arbitrary: { seed: 505_012 } },
    (format, [raw, picked]) => {
      const word = wordOf(raw)
      const tail = word.slice(0, prefixLengthOf(picked, word))
      const filler = outsideChar(word).repeat(512 - tail.length)
      const secret = { name: 'S_CUT', value: word }
      const tree = [leafOf('N1', { role: 'ROLE', value: `${filler}${tail}` })]
      const formatted = format(observationOf(tree), redactedBy([secret]))
      return formatted.includes(`${filler}${maskOf(secret.name)}`) && !formatted.includes(`${filler}${tail}`)
    },
  )

  it.prop(
    '∀w_InnerPrefix_≡Unchanged',
    { of: [Schema.String, Schema.Int], subject: redactCut, arbitrary: { seed: 505_013 } },
    (cut, [raw, picked]) => {
      const word = wordOf(raw)
      const tail = word.slice(0, prefixLengthOf(picked, word))
      const text = `${outsideChar(word).repeat(100)}${tail}${outsideChar(word).repeat(50)}`
      return cut([{ name: 'S_INNER', value: word }], 512, text) === text
    },
  )

  it.prop(
    '∀w_SharedPrefixes_≡LongestMask',
    { of: [Schema.String], subject: formatObservation, arbitrary: { seed: 505_014 } },
    (format, [raw]) => {
      const word = wordOf(raw)
      const long = { name: 'S_LONG', value: word }
      const short = { name: 'T_SHORT', value: `${word.slice(1, 3)}${outsideChar(word)}` }
      const tail = word.slice(0, 3)
      const filler = outsideChar(word).repeat(512 - tail.length)
      const tree = [leafOf('N1', { role: 'ROLE', value: `${filler}${tail}` })]
      const formatted = format(observationOf(tree), redactedBy([long, short]))
      const maskedByLong = formatted.includes(`${filler}${maskOf(long.name)}`)
      const leaked = countOf(formatted, maskOf(short.name)) + countOf(formatted, tail)
      return maskedByLong && leaked === 0
    },
  )

  it.prop(
    '∀t_HiddenParent_¬∈Format',
    { of: [SemanticNode], subject: formatObservation, arbitrary: { seed: 505_015 } },
    (format, [drawn]) => {
      const tree = [hidingOf([plantedOf(drawn, 'VIS_CHILD', 'name', 'LBL')]), leafOf('VIS_SIB', { role: 'ROLE' })]
      const formatted = format(observationOf(tree), redactedBy([]))
      const hiddenCount = countOf(formatted, 'HID_N') + countOf(formatted, 'VIS_CHILD')
      return hiddenCount === 0 && formatted.includes('VIS_SIB')
    },
  )

  it.prop(
    '∀w_RepeatedSecret_≡Twice',
    { of: [Schema.String], subject: redactText, arbitrary: { seed: 505_016 } },
    (redact, [raw]) => {
      const secret = { name: 'S_TWICE', value: wordOf(raw) }
      const result = redact([secret], `${secret.value}|${secret.value}`)
      return countOf(result, maskOf(secret.name)) === 2 && !result.includes(secret.value)
    },
  )

  it.prop(
    '∀w_CaseMismatch_≡ExactText',
    { of: [Schema.String], subject: redactText, arbitrary: { seed: 505_017 } },
    (redact, [raw]) => {
      const secret = { name: 'S_CASE', value: wordOf(raw) }
      const upper = secret.value.toUpperCase()
      return redact([secret], `${upper}|${secret.value}`) === `${upper}|${maskOf(secret.name)}`
    },
  )

  it.prop(
    '∀w_LeadingPrefix_≡Unchanged',
    { of: [Schema.String, Schema.Int], subject: redactCut, arbitrary: { seed: 505_018 } },
    (cut, [raw, picked]) => {
      const word = wordOf(raw)
      const tail = word.slice(0, prefixLengthOf(picked, word))
      const text = `${tail}${outsideChar(word).repeat(512 - tail.length)}`
      return cut([{ name: 'S_LEAD', value: word }], 512, text) === text
    },
  )

  it.prop(
    '∀w_CutAndWhole_⊆BothMasks',
    { of: [Schema.String, Schema.Int], subject: formatObservation, arbitrary: { seed: 505_019 } },
    (format, [raw, picked]) => {
      const word = wordOf(raw)
      const tail = word.slice(0, prefixLengthOf(picked, word))
      const gap = outsideChar(word)
      const between = gap.repeat(512 - 100 - word.length - tail.length)
      const secret = { name: 'S_BOTH', value: word }
      const tree = [leafOf('N1', { role: 'ROLE', value: `${gap.repeat(100)}${word}${between}${tail}` })]
      const formatted = format(observationOf(tree), redactedBy([secret]))
      const masks = countOf(formatted, maskOf(secret.name)) + countOf(formatted, `${between}${maskOf(secret.name)}`)
      const wholeGone = countOf(formatted, word) === 0
      return masks === 3 && wholeGone
    },
  )
}
