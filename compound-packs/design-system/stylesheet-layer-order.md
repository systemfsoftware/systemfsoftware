---
title: The global stylesheet of an Astryx app declares its cascade-layer order first and imports Tailwind and Astryx's shipped CSS into those layers in the documented order
applies_when:
  - creating or editing the global stylesheet of an app that renders @astryxdesign/core with Tailwind
  - adding a package or build plugin that styles Astryx components
tags: [design-system, astryx, tailwind, css-layers, stylex]
---

The global stylesheet's first statement is:

```css
@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;
```

The imports follow it in this order, each Tailwind file with its layer(): tailwindcss/theme.css layer(theme); tailwindcss/preflight.css layer(base); @astryxdesign/core/reset.css; @astryxdesign/core/astryx.css; the brand's generated theme CSS; @astryxdesign/core/tailwind-theme.css; tailwindcss/utilities.css layer(utilities).

Astryx is consumed as its shipped CSS (@astryxdesign/core/astryx.css). @stylexjs/stylex is installed only because @astryxdesign/core lists it as a peer dependency: app code never imports it, never calls stylex.create or stylex.props, never passes an xstyle prop, and no StyleX compiler plugin is added to the build.

Decision test: the diff fails if the global stylesheet's first statement differs from the layer statement above, an import is missing, out of the listed order or lacks its layer(), a Tailwind import is the single @import "tailwindcss", or any app module or build config imports StyleX or adds a StyleX plugin.

Defect it prevents: a Tailwind file imported without its layer() is unlayered and overrides every Astryx component style, and utilities placed before astryx-base lose to component styles, so a class on an Astryx component has no effect. A StyleX build adds a second pipeline of component styles that the layer statement does not place.

```css
/* WRONG */
@import 'tailwindcss';
@import '@astryxdesign/core/astryx.css';
```

```css
/* RIGHT */
@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;
@import 'tailwindcss/theme.css' layer(theme);
@import 'tailwindcss/preflight.css' layer(base);
@import '@astryxdesign/core/reset.css';
@import '@astryxdesign/core/astryx.css';
@import './theme/brand.css';
@import '@astryxdesign/core/tailwind-theme.css';
@import 'tailwindcss/utilities.css' layer(utilities);
```

Source: @astryxdesign/core README, "Next.js + Tailwind" (this stylesheet, verbatim apart from the theme file) and "Next.js (simplest)" (Astryx ships pre-built CSS; no build plugins needed); @astryxdesign/core package.json (peerDependencies include @stylexjs/stylex); MDN, @layer.

Gate: judge
