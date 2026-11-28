---
title: A single-root app wraps its tree in Theme; a page of islands mounts no Theme, and the document owns the theme
applies_when:
  - adding or changing an app entry, an extra HTML entry, a Storybook preview or a browser-test setup that renders @astryxdesign/core
  - adding or changing an island, or any page whose interactive parts hydrate as separate React roots (Astro islands, partial hydration)
  - adding a LayerProvider or configuring toasts and sheets
  - writing a theme or colour-scheme attribute on `<html>` or `<body>`
tags: [design-system, astryx, roots, providers, islands, theme]
---

Astryx's `Theme` writes `<html>` when it has no `Theme` above it. From an effect it sets `data-theme` (or removes it in `system` mode) and `data-astryx-theme`, and removes both when it unmounts. A nested `Theme` skips this. So the rule depends on how many React roots own the document.

**One root owns the document** (a single-page app entry, a Storybook preview, a browser-test setup):

- Statically import the one global stylesheet. Never import it dynamically or only from a lazily loaded route.
- Wrap the tree in `Theme`, given the brand's built theme and a concrete `light` or `dark` mode: the scheme the document's head script already resolved, never `system`, so the root writes the value already there.
- Wrap it in `LinkProvider`, given the router's link component.
- Load the font family the theme names.
- Put the theme name on the server-rendered `<html>` as `data-astryx-theme`, so scoped theme CSS applies before hydration.

**Many roots share the document** (each island is its own React root):

- Mount no `Theme`, at any depth, in an island or in markup rendered on the server. Whether a `Theme` has a parent depends on wrappers that a refactor or a split can remove. Once it has none, it rewrites `<html>` at hydration, and every island does so at a different time.
- The layout owns the theme. The server writes `data-astryx-theme` on `<html>`, and a nested named theme is a static `<div data-astryx-theme="…">` around its subtree. One inline head script resolves the visitor's choice before first paint, writes `data-theme`, and its toggle handler updates it. Nothing else writes `<html>` or `<body>`.
- The layout imports the global stylesheet and loads the font. An island that opens toasts or sheets mounts its own `LayerProvider`.
- JavaScript that needs a theme colour (a chart, a canvas) reads it through a concrete property, `getComputedStyle(el).color` with `color: var(--token)`, and watches `data-theme` with a `MutationObserver`. Reading the custom property itself returns unresolved `light-dark()` text.

A root missing a provider it needs renders an unstyled or unbranded page that review and tests pass, makes every Astryx link reload the page, or falls back to a default font. Mount a `LayerProvider` once per React root and nowhere below it; a nested one does nothing.

```tsx
// WRONG: .storybook/preview.tsx
export const decorators = [(Story) => <Story />]
// RIGHT
import '../src/global.css'
export const decorators = [(Story) => (
  <Theme theme={brandTheme} mode='light'>
    <LinkProvider component={RouterLink}>
      <Story />
    </LinkProvider>
  </Theme>
)]
```

```tsx
// WRONG: an island on a server-rendered page
export default function PromoBanner(props: Props) {
  return (
    <AppRoot>
      <Theme theme={promoTheme} mode='system'>
        <Action {...props} />
      </Theme>
    </AppRoot>
  )
}
// RIGHT: the page's server markup carries <div data-astryx-theme="promo">; the island supplies context only
export default function PromoBanner(props: Props) {
  return (
    <IslandRoot>
      <Action {...props} />
    </IslandRoot>
  )
}
```

**Gate:**

- `oxlint` banning every way of reaching `Theme` (named, aliased, namespace, destructured, re-exported, dynamic) outside the modules that only single-root trees render.
- A built-page check that records every `<html>` attribute from first paint through the last hydration and fails when one takes two values or a script writes `data-astryx-theme`.
- `review` for a new root's providers.
