---
title: The global stylesheet declares one cascade-layer order first, imports Tailwind by file and Astryx's pre-built CSS, and adds no StyleX
applies_when:
  - setting up or reordering the global stylesheet of an app that renders Astryx
  - a Tailwind class on an Astryx component has no effect
  - adding a package or build plugin to style Astryx components
tags: [design-system, astryx, css-layers, stylex]
---

The global stylesheet's first statement is @layer reset, theme, base, astryx-base, astryx-theme, components, utilities;.

The Tailwind and Astryx imports follow it in this order: tailwindcss/theme.css layer(theme), tailwindcss/preflight.css layer(base), @astryxdesign/core/reset.css, @astryxdesign/core/astryx.css, the generated theme CSS, @astryxdesign/core/tailwind-theme.css, tailwindcss/utilities.css layer(utilities); Tailwind is never imported through the single @import "tailwindcss".

Astryx is consumed as the shipped @astryxdesign/core/astryx.css and never recompiled, and no @stylexjs package, StyleX bundler plugin, stylex.create, stylex.props or xstyle prop is added.

Gate: judge
