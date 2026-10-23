---
title: An Astryx app's own StyleX compiles at build through @stylexjs/unplugin, and a StyleX sheet outside the entry stylesheet fails the build
applies_when:
  - setting up the bundler for an app that depends on @astryxdesign/core and writes its own stylex.create styles
  - changing the StyleX plugin, its cssInjectionTarget, the app's HTML entries or its CSS chunking
  - Astryx app styles are present in dev but missing on a production build
tags: [astryx, stylex, vite, build, css, unplugin]
---

Astryx itself ships pre-built CSS and needs no build plugin. The app's own styles (`stylex.create`, see (pack: astryx, astryx-components-first-styles-from-typed-vars.md)) do: StyleX compiles them at build into one atomic stylesheet. If that sheet is not emitted, or is appended to a CSS asset no HTML document links, the app's styles apply only after some async chunk loads, or never. Dev serves the sheet from middleware, so the fault shows only on a production build.

1. **Compile with `@stylexjs/unplugin`.** The bundler config registers the StyleX plugin (`stylex.vite({ ... })` for Vite) with `useCSSLayers: true`, so StyleX rules sit in cascade layers beside Astryx's layers instead of winning by specificity.
2. **Pin the injection target to the entry stylesheet.** Set `cssInjectionTarget` to a function that matches the hashed entry stylesheet names (for Vite, `index-<hash>.css`, and `preview-<hash>.css` when Storybook builds). The plugin's default is a literal name that never matches a hashed asset, so it falls back to the first CSS asset in emission order, which is the entry's only by luck.
3. **Fail the build when the sheet is missing or stranded.** A build-only plugin runs after the bundle is written and reads the emitted directory: it finds the stylesheets that hold the StyleX sheet (StyleX's `@layer priority` block is the marker), and throws when none does, when the one that does is linked by no built HTML document, or when a document links stylesheets but not the StyleX one (one injection target cannot serve two entries; give each its own build). The evidence holds a working implementation (`evidence/reference-app.md`, stylex-entry-css plugin rows).
4. **No runtime styling beside it.** No runtime CSS-in-JS library and no `<style>` injection for app styles; values that change at runtime use a StyleX dynamic style function.

Gate: the entry-stylesheet build plugin of point 3, in a repo that installs it: `vite build` exits non-zero when the StyleX sheet is missing, stranded in an unlinked asset or absent from a document's stylesheets. In a repo without it, none yet; the facts it reads are the emitted files under the build's `outDir`, the `<link rel="stylesheet">` hrefs of each built HTML document, and which emitted stylesheet holds the StyleX layer block.

Evidence: `evidence/reference-app.md` (StyleX build rows), `evidence/upstream.md` (StyleX docs).
