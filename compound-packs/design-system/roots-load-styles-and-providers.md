---
title: Every root that renders Astryx statically imports the global stylesheet, wraps its tree in Theme and LinkProvider, and loads the theme's font
applies_when:
  - adding or changing an app entry, an extra HTML entry, a Storybook preview or a browser-test setup that renders @astryxdesign/core
  - adding a LayerProvider or configuring toasts and sheets
tags: [design-system, astryx, roots, providers]
---

Every root that renders Astryx (the app entry, each extra HTML entry, `.storybook/preview`, the browser-test setup) statically imports the one global stylesheet, wraps its tree in `Theme` (given the brand's built theme and the color mode) and in `LinkProvider` (given the router's link component), and loads the font family the theme names. Never import the stylesheet dynamically or only from a lazily loaded route.

A root missing one renders an unstyled or unbranded page that review and tests pass, makes every Astryx link reload the page, or silently falls back to a default font. Mount a `LayerProvider` (toast position, edge insets) once in the root and nowhere below it; a nested one does nothing.

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
