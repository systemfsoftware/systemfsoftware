# Evidence: upstream sources

This file is storage: it is never read as a rule. Read 2026-10-23.

## Astryx README (`packages/core/README.md`, github.com/facebook/astryx, main)

- Quick Start: "Astryx ships pre-built CSS and JS, so you import three stylesheets (order matters) and wrap your app in a theme provider": `reset.css`, `astryx.css`, then the theme's `theme.css`.
- "The import order maps to the layer cascade: `reset.css` (`@layer reset`) → `astryx.css` component styles (`@layer astryx-base`) → `theme.css` token overrides (`@layer astryx-theme`)."
- Providers: `<Theme theme={neutralTheme}>` and `<LinkProvider component={Link}>`.
- Vite: "Same CSS imports and providers as above. No build plugins needed; Astryx ships pre-built." The StyleX plugin is needed only for the app's own `stylex.create` styles.
- CDN recipe: "Theme CSS is scoped to that attribute [`data-astryx-theme` on `<html>`], so without it the page renders with the built-in defaults"; "Nothing in the three stylesheets sets a document font ... `Button` is `font: inherit`. Without that one declaration its label renders in the browser's default serif"; "The theme _names_ Figtree; it never loads it."
- CLI: `astryx component <Name>`, `astryx docs theme` ("Theme, defineTheme, light/dark"), `astryx theme build` ("build theme CSS for production"), `astryx swizzle`, `astryx upgrade --apply`, `astryx gap-report`. "Always use the scoped name: the unscoped `astryx` resolves to an unrelated npm package until `@astryxdesign/cli` is a dependency."

## StyleX (stylexjs.com)

- Learn: "No runtime style injection"; "Generate a static CSS file at compile-time"; collision-free atomic CSS.

## Runtime CSS-in-JS costs (cited by (pack: ui-craft, a-design-system-renders-only-with-its-styles-loaded.md))

- react.dev, `useInsertionEffect`: "We don't recommend runtime `<style>` tag injection for two reasons: 1. Runtime injection forces the browser to recalculate the styles a lot more often. 2. Runtime injection can be very slow if it happens at the wrong time in the React lifecycle."
- Sam Magura (an Emotion maintainer), "Why We're Breaking Up with CSS-in-JS", 2022-10-16: average of the first 10 renders went from 54.3 ms to 27.7 ms (48% less) after moving from runtime CSS-in-JS to Sass modules.
