export const A11Y_TEST_NOT_ERROR_MESSAGE =
  "`a11y.test` is `'{{actual}}'`, which turns the axe gate off or down to a warning. It must stay `'error'`: set `parameters.a11y.test = 'error'`, never 'todo' or 'off'." as const

export const A11Y_DISABLED_MESSAGE =
  '`a11y.disable: true` turns the axe gate off for this story. Delete the `disable` key so the a11y test stays on.' as const

export const meta = {
  type: 'problem',
  docs: {
    description: "A story keeps the axe gate on: `parameters.a11y.test` is 'error' and `disable` is absent.",
  },
  schema: [],
  messages: {
    a11yTestNotError: A11Y_TEST_NOT_ERROR_MESSAGE,
    a11yDisabled: A11Y_DISABLED_MESSAGE,
  },
} as const
