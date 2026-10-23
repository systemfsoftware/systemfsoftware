import type { NodeStates, SemanticNode } from '@systemfsoftware/effect-e2e/engine'
import * as Option from 'effect/Option'
import * as Str from 'effect/String'
import type { DOMWindow } from 'jsdom'

/** A node of the semantic tree beside the element it was built from. */
export interface DomEntry {
  readonly node: SemanticNode
  readonly element: Element
}

/** The tree an observation answers, and every node in document order with its element. */
export interface DomTree {
  readonly tree: ReadonlyArray<SemanticNode>
  readonly entries: ReadonlyArray<DomEntry>
}

// The role each <input> type answers to; a type not listed has no role here.
const INPUT_ROLES: Readonly<Record<string, string>> = {
  checkbox: 'checkbox',
  radio: 'radio',
  text: 'textbox',
  email: 'textbox',
  search: 'textbox',
  tel: 'textbox',
  url: 'textbox',
  button: 'button',
  submit: 'button',
  reset: 'button',
}

const HEADINGS: Readonly<Record<string, true>> = { h1: true, h2: true, h3: true, h4: true, h5: true, h6: true }

// Roles whose accessible name falls back to their own text when no label names them.
const NAMED_BY_CONTENT: Readonly<Record<string, true>> = { link: true, button: true, heading: true }

const EMPTY: DomTree = { tree: [], entries: [] }

const normalized = (text: string): string => text.replace(/\s+/g, ' ').trim()

const nonEmpty = (text: string): Option.Option<string> => Option.liftPredicate(normalized(text), Str.isNonEmpty)

const attribute = (element: Element, name: string): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(element.getAttribute(name)), nonEmpty)

const textOf = (element: Element): string => Option.getOrElse(Option.fromNullishOr(element.textContent), () => '')

const isHidden = (element: Element): boolean =>
  element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true'

const inputRole = (input: HTMLInputElement): Option.Option<string> =>
  Option.fromNullishOr(INPUT_ROLES[input.type.toLowerCase()])

const labelledByText = (element: Element): Option.Option<string> =>
  Option.flatMap(attribute(element, 'aria-labelledby'), (ids) =>
    nonEmpty(
      ids.split(' ').map((id) =>
        Option.match(Option.fromNullishOr(element.ownerDocument.getElementById(id)), {
          onNone: () => '',
          onSome: textOf,
        })
      ).join(' '),
    ))

const labelText = (window: DOMWindow, element: Element): Option.Option<string> =>
  element instanceof window.HTMLInputElement || element instanceof window.HTMLTextAreaElement
    ? nonEmpty(Array.from(element.labels ?? [], textOf).join(' '))
    : Option.none()

const nameOf = (window: DOMWindow, element: Element, role: string): Option.Option<string> =>
  attribute(element, 'aria-label').pipe(
    Option.orElse(() => labelledByText(element)),
    Option.orElse(() => labelText(window, element)),
    Option.orElse(() => (NAMED_BY_CONTENT[role] === true ? nonEmpty(textOf(element)) : Option.none())),
  )

const implicitRole = (window: DOMWindow, element: Element): Option.Option<string> => {
  if (element instanceof window.HTMLInputElement) return inputRole(element)
  if (element instanceof window.HTMLTextAreaElement) return Option.some('textbox')
  if (element instanceof window.HTMLButtonElement) return Option.some('button')
  if (element instanceof window.HTMLAnchorElement) {
    return element.hasAttribute('href') ? Option.some('link') : Option.none()
  }
  if (HEADINGS[element.localName] === true) return Option.some('heading')
  // A form is a landmark only when something names it.
  return element.localName === 'form' && Option.isSome(nameOf(window, element, 'form'))
    ? Option.some('form')
    : Option.none()
}

const roleOf = (window: DOMWindow, element: Element): Option.Option<string> =>
  Option.orElse(attribute(element, 'role'), () => implicitRole(window, element))

const checkedOf = (window: DOMWindow, element: Element, role: string): Pick<NodeStates, 'checked'> => {
  if (role !== 'checkbox' && role !== 'radio') return {}
  return element instanceof window.HTMLInputElement
    ? { checked: element.checked }
    : { checked: element.getAttribute('aria-checked') === 'true' }
}

const statesOf = (window: DOMWindow, element: Element, role: string): NodeStates => ({
  disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true',
  hidden: false,
  ...checkedOf(window, element, role),
})

const valueOf = (window: DOMWindow, element: Element): Pick<SemanticNode, 'value'> =>
  element instanceof window.HTMLInputElement || element instanceof window.HTMLTextAreaElement
    ? { value: element.value }
    : {}

const childPath = (path: string, index: number): string => (path === '' ? String(index) : `${path}.${index}`)

const joined = (parts: ReadonlyArray<DomTree>): DomTree => ({
  tree: parts.flatMap((part) => part.tree),
  entries: parts.flatMap((part) => part.entries),
})

/*
 * Each element's ref id is its child-index path from <body>, so a ref names the same element for as
 * long as the document keeps its shape; fills and taps change no shape. An element with no role is
 * structural: it is skipped and its children are hoisted into its parent.
 */
const treeAt = (window: DOMWindow, revision: string, path: string) => (element: Element): DomTree => {
  if (isHidden(element)) return EMPTY
  const inner = joined(
    Array.from(element.children, (child, index) => treeAt(window, revision, childPath(path, index))(child)),
  )
  return Option.match(roleOf(window, element), {
    onNone: () => inner,
    onSome: (role): DomTree => {
      const node: SemanticNode = {
        ref: { id: path, revision },
        role,
        ...Option.match(nameOf(window, element, role), { onNone: () => ({}), onSome: (name) => ({ name }) }),
        ...valueOf(window, element),
        states: statesOf(window, element, role),
        children: inner.tree,
      }
      return { tree: [node], entries: [{ node, element }, ...inner.entries] }
    },
  })
}

export const domTreeOf = (window: DOMWindow) => (revision: string): DomTree =>
  Option.match(Option.fromNullishOr(window.document.body), {
    onNone: () => EMPTY,
    onSome: (body) =>
      joined(Array.from(body.children, (child, index) => treeAt(window, revision, String(index))(child))),
  })
