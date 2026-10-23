---
title: Astryx components and their props come first, looked up with the astryx CLI, and any extra style is a Tailwind class from the tailwind-theme.css token bridge
applies_when:
  - adding or editing a screen, block or component built from @astryxdesign/core components
  - writing a className, a style prop or a CSS file next to Astryx components
  - building a UI piece (a list, a status mark, a layout, a dialog) that Astryx may already ship
  - choosing a color, spacing, radius or font size for an element in an app that renders Astryx
tags: [astryx, components, tailwind, tokens, cli, styling]
---

Astryx has components for layout, spacing, data, status and navigation, and props for their variants. An agent that guesses writes `<div>`s and hex values that drift from the theme and do not switch with light and dark. Look the component up, use its props, and only then style with Tailwind classes that read the theme's tokens.

1. **Look it up before writing it.** Before using or building a UI piece, run the Astryx docs CLI: `astryx build "<idea>"` for a kit of page, blocks and components; `astryx component <Name>` for a component's props and examples; `astryx search "<thing>"` when unsure a component or prop exists; `astryx docs <topic>` for layout, tokens, styling and theme. Run it through the package manager (`pnpm exec astryx ...`) or as `npx @astryxdesign/cli ...`; the unscoped `npx astryx` is an unrelated package.
2. **Never hand-roll what Astryx ships.** If the CLI names a component that does the job (a shell, side navigation, table, list row, status dot, token, dialog, toast), use it. A lookalike, or a `swizzle` copy made to change one value, is a defect; a missing capability is reported (`astryx gap-report`) and built on Astryx primitives.
3. **Props first.** Spacing, alignment, size, variant, elevation and tone are set through component props (`<VStack gap={4}>`, `<Text type="supporting" color="secondary">`, `<Button variant="primary">`), and layout through layout components, not through raw `<div>` or `<span>` wrappers.
4. **Then Tailwind classes from the bridge.** When props cannot express it, use a Tailwind utility on the element, or on the Astryx component through its `className` (all Astryx components accept it; utilities win because they are in the last layer). The color, surface, border and text utilities come from `@astryxdesign/core/tailwind-theme.css`: `bg-surface`, `bg-card`, `bg-muted`, `text-primary`, `text-secondary`, `border-strong`, `text-error`, `bg-success`, and the rest the bridge registers. Look the class up in `@astryxdesign/core/tailwind-theme.css` (or with `astryx search "tailwind"`) before assuming it exists.
5. **No raw values where a token exists.** No hex, `rgb()` or `hsl()` color, no pixel value for spacing, radius or type size, no Tailwind palette color (`bg-red-500`, `text-blue-600`) for a color a token covers. No arbitrary-value bracket with a custom property (`bg-[var(--color-background-surface)]`, `p-[var(--spacing-4)]`) when a bridge class exists for it; the bracket form is the escape hatch for a token the bridge does not cover, and each use names that gap in a comment.
6. **No StyleX and no other styling system.** No `stylex.create`, `stylex.props` or `xstyle` (pack: astryx, astryx-is-consumed-as-prebuilt-css-under-tailwind-with-one-layer-order.md), no `style={{...}}` for anything a prop or class expresses, no `@apply` or imported component CSS file.
7. **Self-check before done.** Re-read the changed files and replace any `style={{...}}`, raw layout element, hardcoded value, palette class or bracketed `var()` with the component, the prop or the bridge class.

```tsx
import { Button } from '@astryxdesign/core/Button'
import { VStack } from '@astryxdesign/core/Layout'
import { Heading, Text } from '@astryxdesign/core/Text'

export function Panel() {
  return (
    <main className='min-h-screen bg-body p-8'>
      <VStack gap={4}>
        <Heading level={2}>Dashboard</Heading>
        <Text type='body' color='secondary'>Astryx owns the component, the token bridge owns the rest.</Text>
        <Button label='Save' variant='primary' className='shadow-sm' />
      </VStack>
    </main>
  )
}
```

Gate: none yet. The facts a check would read: from the TypeScript compiler, each JSX `className` string literal that holds a Tailwind color or size utility with a bracketed `var(` or a hex or pixel literal where the bridge registers a utility for that token (the bridge's `@theme` entries are the list); each `style` prop on an Astryx component; and, for point 2, the `astryx search` result for the piece a diff hand-builds, given with the diff to a judge.

Evidence: `evidence/upstream.md` (Astryx Tailwind examples, CLI), `evidence/reference-app.md` (component usage rows).
