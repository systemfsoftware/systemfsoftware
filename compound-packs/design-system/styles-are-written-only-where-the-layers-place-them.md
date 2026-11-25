---
title: An Astryx app writes no CSS outside the global stylesheet, and a style prop carries only a value computed at render
applies_when:
  - adding a CSS file, a CSS module, a <style> element or a CSS-in-JS library to an app that renders @astryxdesign/core
  - adding a style prop to a component or element
tags: [design-system, astryx, css-layers, styling]
---

Write all CSS an app owns in the global stylesheet, inside the cascade layers it declares. Never add a CSS module, per-component CSS file, `<style>` element or runtime CSS-in-JS library (styled-components, Emotion and the like): a declaration outside any layer, or an inline style, outranks every layered rule and overrides Astryx's component styles and every Tailwind utility at once.

## Third-party runtime `<style>` elements under strict CSP

1. **Static CSS or per-request nonce first.** Prefer a third-party UI package's exported static stylesheets imported into the global stylesheet (`style-src 'self'`), or pass the document's per-request CSP nonce (`'nonce-<per-request>'`) whenever the package supports it.
2. **Public-entry build-time SHA-256 derivation when neither exists.** When an exact-pinned third-party package injects a deterministic, un-nonced `<style>` element at runtime and exports no static CSS for those rules:
   - Derive the exact UTF-8 SHA-256 digest (`'sha256-<base64>'`) **at build time** by mounting the package's **public `exports` entry** in Node (for example, via a Vite virtual module) and pass the derived digest into the shared CSP policy builder as a typed build artifact.
   - Record provenance at the build-time derivation site: upstream package name, public `exports` entry mounted, injected `<style>` selector/ID, and the missing upstream static-CSS or nonce capability so the exception can be removed once upstream ships it.
3. **Forbidden workarounds.** Never hard-code or commit a `'sha256-...'` digest literal in repository source, never vendor or copy internal package CSS strings, never pre-seed a synthetic `<style>` element in HTML, never enable `'unsafe-inline'`, and never read unexported internal package paths at runtime (or at build time when a public `exports` entry triggers the style injection).
4. **Exact catalog pin and fail-closed build.** Pin the third-party package to an exact version in the pnpm catalog (no `^`, `~`, or range). The build-time derivation must throw a fatal build error—aborting the build—if mounting the public entry fails or captures zero, multiple, or whitespace-only `<style>` outputs; never fall back to an empty hash list or `'unsafe-inline'`.
5. **Verification.** Guard the derivation helper's formatting and fail-closed invariants with in-source property tests (never a test pinning a literal digest), and prove end-to-end CSP acceptance with a browser E2E `securitypolicyviolation` suite against the built Worker response.

**Why & evidence:** Hard-coded SHA-256 constants drift silently on package bumps or invite tautological hash-pinning tests, vendored internal CSS duplicates package ownership, pre-seeded `<style>` sentinels break if upstream changes its DOM guard, and falling back to an empty hash list on failed build-time extraction silently strips runtime styles without failing the build.

**Gate:**

- Exact version pin in `pnpm-workspace.yaml` (no `^` or `~`).
- `oxlint` (`no-restricted-imports`) and Node ESM `exports` blocking unexported internal package paths.
- Build-time Vite virtual-module derivation (`vite build` / `astro build`) throwing on missing, duplicate, or empty `<style>` capture, plus `review` confirming zero literal `'sha256-'` constants in source and provenance recorded at the derivation site.
- In-source property tests (`vitest`) on the derivation helper and CSP policy builder.
- Browser E2E `securitypolicyviolation` test suite against `/web`.

**Calibration:**

- `wrong:` Hard-coding `const SLIDE_RULES_HASH = "'sha256-abc...'"` in `packages/contracts`, importing `@astryxdesign/core/dist/Layer/layerSlideRules.js`, pre-seeding `<style id="astryx-layer-slide-rules">`, or swallowing derivation errors to return `[]`.
- `right:` Pinning `@astryxdesign/core` to an exact version in `pnpm-workspace.yaml`, mounting `@astryxdesign/core/Layer` in Node during the Vite build to emit `virtual:astryx-slide-rules-csp-hash` with provenance comments, throwing on zero/multiple/empty `<style>` capture, passing the validated `Sha256Source` into `packages/contracts`, and asserting `0` `securitypolicyviolation` events in browser E2E.

Use a `style` prop only for a value computed at render from props or state (a measured width, a drag offset). A value known when the code is written is a utility class or a component prop.

Never import StyleX in app code, call `stylex.create` or `stylex.props`, pass an `xstyle` prop, or add a StyleX compiler plugin; Astryx is consumed as its shipped CSS.

```tsx
// WRONG
import styles from './OrderRow.module.css'
<Card className={styles.row} style={{ padding: 16 }} />
// RIGHT
<Card padding={4} style={{ transform: `translateY(${dragOffset}px)` }} />
```
