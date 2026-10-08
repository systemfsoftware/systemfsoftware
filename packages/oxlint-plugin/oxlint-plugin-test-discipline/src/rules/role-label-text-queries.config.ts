export const BANNED_QUERY_MESSAGE =
  '`{{name}}` is a banned page query. It selects the page by CSS, a DOM attribute, an element handle or a test id, so the test breaks when markup moves and no longer says what the user sees. Query by role, label or visible text instead: getByRole, getByLabel, getByLabelText, getByText (and their findBy*, queryBy*, getAllBy* variants), chained .filter({ hasText }), or ariaSnapshot().' as const

export const HAS_OPTION_MESSAGE =
  "`{{name}}` is Playwright's `has`/`hasNot` locator option, which takes a CSS locator or an element handle and so couples the test to markup. Replace it with `filter({ hasText })`, or chain a role/label/text query with `.filter(...)`." as const

export const DATA_ATTRIBUTE_SELECTOR_MESSAGE =
  'This string contains `[data-`, a DOM attribute selector: `{{snippet}}`. A test must query by role, label or visible text, never by a data attribute. Pass a role/label/text query instead, or delete the selector.' as const

export const meta = {
  type: 'problem',
  docs: {
    description: 'A test queries the page only by role, label or visible text, never by CSS or a data attribute.',
  },
  schema: [],
  messages: {
    bannedQuery: BANNED_QUERY_MESSAGE,
    hasOption: HAS_OPTION_MESSAGE,
    dataAttributeSelector: DATA_ATTRIBUTE_SELECTOR_MESSAGE,
  },
} as const
