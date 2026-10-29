---
title: Every root that renders Astryx statically imports the global stylesheet, wraps its tree in Theme and LinkProvider, and loads the theme's font
applies_when:
  - adding or changing an app entry, an extra HTML entry, a Storybook preview or a browser-test setup that renders @astryxdesign/core
  - adding a LayerProvider or configuring toasts and sheets
tags: [design-system, astryx, roots, providers]
---

Every root that renders Astryx (the app entry, each extra HTML entry, .storybook/preview and the browser-test setup file) statically imports the one global stylesheet; never through a dynamic import or only from a lazily loaded route.

Every root wraps its tree in Theme, given the brand's built theme and the color mode, and in LinkProvider, given the router's link component.

The app loads the font family the theme names, through a font package imported in the global stylesheet or a link in each HTML entry.

A LayerProvider, when the app configures layers (toast position, edge insets), is mounted once in the root and nowhere below it.

Decision test: for each root the diff adds or changes, check four things: a static import of the global stylesheet; a Theme around the tree; a LinkProvider with the router's link component; the theme's font loaded. A missing one fails, and so does a LayerProvider below a root.

Defect it prevents: a story or browser test without the stylesheet or Theme renders an unstyled or unbranded page, so review and tests pass on something no person sees; without LinkProvider every Astryx link does a full page reload; the theme names its font but never loads it, so without the font every viewer silently gets the fallback; a nested LayerProvider is a no-op, so its configuration silently does nothing.

```tsx
// WRONG: .storybook/preview.tsx
export const decorators = [(Story) => <Story />]
```

```tsx
// RIGHT: .storybook/preview.tsx
import '../src/global.css'
export const decorators = [
  (Story) => (
    <Theme theme={brandTheme} mode='light'>
      <LinkProvider component={RouterLink}>
        <Story />
      </LinkProvider>
    </Theme>
  ),
]
```

Source: @astryxdesign/core README ("Next.js + Tailwind" providers; "No build step": the theme names its font and never loads it); LinkProvider docs (replaces the default anchor with the router's link for client-side routing); LayerProvider source doc comment (optional; nested providers are no-ops).

Gate: judge
