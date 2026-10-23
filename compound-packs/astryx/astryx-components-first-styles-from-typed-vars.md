---
title: Astryx components and their props come first, looked up with the astryx CLI, and any extra style is StyleX keyed to the typed theme vars
applies_when:
  - adding or editing a screen, block or component built from @astryxdesign/core components
  - writing a style object, a CSS file, a style prop or a className next to Astryx components
  - building a UI piece (a list, a status mark, a layout, a dialog) that Astryx may already ship
tags: [astryx, components, stylex, tokens, cli, styling]
---

Astryx has components for layout, spacing, data, status and navigation, and props for their variants. An agent that guesses writes `<div>`s and hex values that drift from the theme and do not switch with light and dark. Look the component up, use its props, and only then style.

1. **Look it up before writing it.** Before using or building a UI piece, run the Astryx CLI: `astryx build "<idea>"` for a kit of page, blocks and components; `astryx component <Name>` for a component's props and examples; `astryx search "<thing>"` when unsure a component or prop exists; `astryx docs <topic>` for layout, tokens, styling and theme. Run it through the package manager (`pnpm exec astryx ...`) or as `npx @astryxdesign/cli ...`; the unscoped `npx astryx` is an unrelated package.
2. **Never hand-roll what Astryx ships.** If the CLI names a component that does the job (a shell, side navigation, table, list row, status dot, token, dialog, toast), use it. A hand-rolled replacement, or a `swizzle` copy made to change one value, is a defect; a missing capability is reported (`astryx gap-report`) and built on Astryx primitives.
3. **Props first.** Spacing, alignment, size, variant, elevation and tone are set through component props, and layout through layout components (a full page in an app shell or a layout with panels), not through raw `<div>` or `<span>` wrappers.
4. **Extra style is StyleX with typed vars.** When props cannot express it, write `stylex.create` with values from the typed vars in `@astryxdesign/core/theme/tokens.stylex` (`colorVars`, `spacingVars`, `radiusVars` and the rest), keyed by the raw custom-property name: `colorVars['--color-border']`, never `colorVars.border`. A raw `'var(--color-border)'` string emits the same CSS but loses typo detection: a misspelt token compiles to a dead property and nothing reports it. No raw hex, rgb or pixel values for anything a token covers.
5. **Apply it one way.** `xstyle={...}` on an Astryx component, or `{...stylex.props(...)}` on a raw DOM element; never both on one element, and never beside a `style` or `className` prop. No imported `.css` files or `@apply` for component styling.
6. **Self-check before done.** Re-read the changed files and replace any `style={{...}}`, raw layout element, imported component CSS or hardcoded value with the component, the prop or a StyleX style keyed to a typed var.

```ts
import { colorVars, radiusVars, spacingVars } from '@astryxdesign/core/theme/tokens.stylex'
import * as stylex from '@stylexjs/stylex'

const styles = stylex.create({
  panel: {
    backgroundColor: colorVars['--color-background-surface'],
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
    paddingInline: spacingVars['--spacing-8'],
  },
})
```

Gate: none yet. The facts a check would read: from the TypeScript compiler, each property value inside a `stylex.create` call that is not an expression of a typed var imported from `@astryxdesign/core/theme/tokens.stylex` (a string literal, a template with `var(`, a number for a color or spacing property); each JSX element that carries both `xstyle` or spread `stylex.props` and `style` or `className`; and, for point 2, the `astryx search` result for the piece a diff hand-builds, given with the diff to a judge.

Evidence: `evidence/reference-app.md` (component usage rows), `evidence/upstream.md` (CLI).
