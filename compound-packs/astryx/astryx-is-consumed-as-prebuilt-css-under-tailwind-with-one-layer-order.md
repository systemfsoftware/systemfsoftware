---
title: Astryx is consumed through its pre-built astryx.css and Tailwind 4 with one declared layer order, and no StyleX package or plugin is used
applies_when:
  - setting up the stylesheet, the bundler or the dependencies of an app that renders @astryxdesign/core components
  - adding, changing or reordering the CSS imports of an app entry or a Storybook preview that renders Astryx
  - a Tailwind class on an Astryx component has no effect, or Astryx styles override a Tailwind utility
  - adding a package or a build plugin to style Astryx components (any @stylexjs package, stylex.create, stylex.props)
tags: [astryx, tailwind, css, layers, build, setup]
---

Astryx ships its component styles as pre-built CSS, and Tailwind 4 owns the app's own utilities. The two coexist through one explicit cascade-layer order. Without the order declared first, Astryx's layers are created after Tailwind's, Astryx component styles outrank Tailwind utilities, and `className="bg-red-500"` on an Astryx component does nothing. Astryx needs no build plugin; this repo adds no StyleX in any form.

1. **Declare the layer order first, in the global stylesheet, before any import:**

   ```css
   @layer reset, theme, base, astryx-base, astryx-theme, components, utilities;
   ```

   Lowest to highest priority: `reset` (Astryx reset), `theme` (Tailwind variables), `base` (Tailwind preflight), `astryx-base` (Astryx component styles), `astryx-theme` (theme tokens), `components` (Tailwind component classes), `utilities` (Tailwind utilities, which win over every layer). Unlayered CSS the app writes wins over all of them.
2. **Import in this order, after the declaration:**

   ```css
   @import "tailwindcss/theme.css" layer(theme);
   @import "tailwindcss/preflight.css" layer(base);
   @import "@astryxdesign/core/reset.css";
   @import "@astryxdesign/core/astryx.css";
   @import "@astryxdesign/theme-neutral/theme.css"; /* or the app's generated theme CSS */
   @import "@astryxdesign/core/tailwind-theme.css";
   @import "tailwindcss/utilities.css" layer(utilities);
   ```

   `tailwindcss/theme.css` goes into the `theme` layer and `preflight.css` into `base`; both are imported by file, not through `@import "tailwindcss"`, because the single-import form creates Tailwind's layers before Astryx's. `reset.css` and `astryx.css` carry their own layer names. The theme CSS is the base theme's or the one the repo's theme build generates. `tailwind-theme.css` is the token bridge: it turns Astryx tokens into Tailwind utilities such as `bg-surface` and `text-primary` and reads Astryx's own custom properties, so light and dark switching still works.
3. **Consume the pre-built `astryx.css`.** Import the shipped `@astryxdesign/core/astryx.css`; do not recompile Astryx's styles in the app.
4. **No StyleX, anywhere.** No `@stylexjs/*` dependency, no StyleX bundler plugin (`@stylexjs/unplugin` or any other), no `stylex.create` or `stylex.props` in app code, no `xstyle` prop. Styling beyond component props is a Tailwind class (pack: astryx, astryx-components-first-styles-from-typed-vars.md). The only build step Tailwind adds is the Tailwind plugin or CLI that the bundler already runs for the stylesheet.
5. **Every root imports the same sheet** (pack: astryx, astryx-styles-and-providers-load-at-every-root.md).

Gate: none yet. The facts a check would read: from the package manager's resolved dependency graph of each app, any package named `@stylexjs/*` (none may be present); from the TypeScript compiler, any import from `@stylexjs/stylex` and any call to `stylex.create` or `stylex.props`; and from the global stylesheet parsed by a CSS parser (not a text pattern), that the first at-rule is `@layer` with the seven names in the order above and that `reset.css`, `astryx.css`, the theme CSS, `tailwind-theme.css` and `utilities.css` are imported in that order. A behaviour check is stronger: in a real browser, an Astryx `Button` rendered with `className="rounded-full"` has a computed `border-radius` of `9999px`.

Evidence: `evidence/upstream.md` (Astryx Tailwind examples), `evidence/reference-app.md` (stylesheet rows).
