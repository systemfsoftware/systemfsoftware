---
title: An Astryx app writes no CSS outside the global stylesheet, and a style prop carries only a value computed at render
applies_when:
  - adding a CSS file, a CSS module, a <style> element or a CSS-in-JS library to an app that renders @astryxdesign/core
  - adding a style prop to a component or element
tags: [design-system, astryx, css-layers, styling]
---

Write all CSS an app owns in the global stylesheet, inside the cascade layers it declares. Never add a CSS module, per-component CSS file, `<style>` element or runtime CSS-in-JS library (styled-components, Emotion and the like): a declaration outside any layer, or an inline style, outranks every layered rule and overrides Astryx's component styles and every Tailwind utility at once.

**Third-party runtime `<style>` elements.** Prefer a package's exported static CSS imported into the global stylesheet. When a third-party package injects a `<style>` element at runtime and exports no static CSS file, let it inject its own element and authorize that exact element instead of copying it or pre-seeding a synthetic one: pass the document's per-request nonce (`'nonce-<nonce>'`) when the package accepts one, or allowlist the element's exact UTF-8 SHA-256 digest (`'sha256-<base64>'`) in the document's `style-src` directive when it does not.

Never vendor or copy internal package CSS strings into the repository, read unexported package paths, or pre-seed synthetic `<style>` elements in HTML. Record provenance beside the hash constant (package name, exact pinned version, and `<style>` element ID or symbol), pin the package to an exact version, and enforce freshness with a test verifying the CSP hash against the installed package's runtime output.

Use a `style` prop only for a value computed at render from props or state (a measured width, a drag offset). A value known when the code is written is a utility class or a component prop.

Never import StyleX in app code, call `stylex.create` or `stylex.props`, pass an `xstyle` prop, or add a StyleX compiler plugin; Astryx is consumed as its shipped CSS.

```tsx
// WRONG
import styles from './OrderRow.module.css'
<Card className={styles.row} style={{ padding: 16 }} />
// RIGHT
<Card padding={4} style={{ transform: `translateY(${dragOffset}px)` }} />
```
