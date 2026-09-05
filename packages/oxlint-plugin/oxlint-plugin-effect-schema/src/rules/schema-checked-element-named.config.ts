export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const CHECKED_ELEMENT_EXPECTED =
  'a collection element that is either unchecked or a named binding — the checked node lives in its own module-scope declaration and the combinator receives the name' as const

export const CHECKED_ELEMENT_ACTUAL =
  'an anonymous checked node constructed inline as the collection element, so the invariant has no named home' as const

export const CHECKED_ELEMENT_FIX =
  "bind the checked chain to a module-scope const and pass the name to the combinator — the binding is the one home for the invariant's constructive metadata and the unchecked base its property tests generate from" as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A checked schema node passed inline as a collection combinator element lives in a named module-scope declaration: the combinator receives the name.',
  },
  schema: [],
  messages: {
    anonymousCheckedElement: MESSAGE,
  },
} as const
