---
title: UI is built from Astryx components and styled through their props and the Tailwind utilities the Astryx token bridge registers
applies_when:
  - building or styling a screen, layout or component in an app that renders @astryxdesign/core
  - adding a component library, a CSS file or a style prop
tags: [design-system, astryx, tailwind, styling]
---

UI is built from @astryxdesign/core components; never a hand-built lookalike of a component Astryx ships, a swizzled copy of one, or shadcn/ui or another component library, installed or copied in.

Spacing, alignment, size, variant, tone and layout are set through Astryx props and layout components (VStack, HStack); never a div or span styled to do what an Astryx layout component or prop does.

A style no prop expresses is a Tailwind utility, and every color, surface, border and text value comes from a utility @astryxdesign/core/tailwind-theme.css registers; never a hex, rgb() or hsl() color, a px literal for spacing, radius or type size, a Tailwind palette color, or an arbitrary-value bracket ([var(--...)], [#...], [12px]).

An Astryx token the bridge does not expose gets a Tailwind theme variable in the global stylesheet's @theme inline block whose value is that token's var(), and is then used as a utility, never as a bracket.

Never use @apply, a CSS module, a component CSS file or a runtime CSS-in-JS library, and a style prop carries only a value computed at render from props or state.

Whether a hand-built piece duplicates an Astryx component is decided by the review judge; an uncertain case escalates.

Gate: judge
