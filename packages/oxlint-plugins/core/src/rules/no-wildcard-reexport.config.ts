export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Ban bare `export * from "..."` re-exports in favor of explicit named re-export lists',
  },
  hasSuggestions: false,
  messages: {
    wildcardReexport:
      '{{source}} is forbidden. Expected: An explicit named re-export list — `export { a, b } from "{{source}}"` declaring each name you expose, with the default re-exported via `export { default } from "{{source}}"` when it belongs on the surface. Actual: `export * from "{{source}}"` — which does not re-export the default export and silently drops every name shared with another `export *`. Fix: Replace with `export { name1, name2, ... } from "{{source}}"`, adding `export { default }` explicitly when the default export is part of the surface.',
  },
} as const
