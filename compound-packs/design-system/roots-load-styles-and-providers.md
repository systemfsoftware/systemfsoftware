---
title: Every root that renders Astryx imports the global stylesheet and wraps its tree in Theme, LinkProvider and LayerProvider
applies_when:
  - adding an app entry, an HTML entry, a Storybook preview or a Vitest browser setup that renders Astryx
  - Astryx components render unstyled, or links reload the page
tags: [design-system, astryx, roots, providers]
---

Every root that renders Astryx (the app entry, each extra HTML entry, .storybook/preview and the Vitest browser setup file) statically imports the one global stylesheet, never through a dynamic import or only from a lazily loaded route.

Every root wraps its tree once in Theme (the generated theme and the color mode), then LinkProvider (given the router's link component), then LayerProvider, and LayerProvider is mounted only there.

The app loads the font family the theme names, through a font package imported in the global stylesheet or a link in each HTML entry.

Gate: judge
