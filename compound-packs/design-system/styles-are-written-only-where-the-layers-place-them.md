---
title: An Astryx app writes no CSS outside the global stylesheet's layers, and a style prop carries only a value computed at render
applies_when:
  - adding a CSS file, a CSS module, a <style> element or a CSS-in-JS library to an app that renders @astryxdesign/core
  - adding a style prop to a component or element
tags: [design-system, astryx, css-layers, styling]
---

All CSS an app writes lives in the global stylesheet, inside the cascade layers that stylesheet declares. No CSS module, per-component CSS file, <style> element or runtime CSS-in-JS library (styled-components, Emotion and the like) is added.

A style prop carries only a value computed at render from props or state (a measured width, a drag offset). A value known when the code is written is a utility class or a component prop.

Decision test: the diff fails if it adds a .css or .module.css file other than the global stylesheet, a <style> element, an import of a CSS-in-JS library, or a style prop whose value is a literal or a constant.

Defect it prevents: a declaration outside any cascade layer, and an inline style attribute, outrank every layered rule whatever its specificity, so one such rule overrides Astryx's component styles and every Tailwind utility at once, and the layer order stops deciding what the page shows.

```tsx
// WRONG
import styles from './OrderRow.module.css'
<Card className={styles.row} style={{ padding: 16 }} />
```

```tsx
// RIGHT
<Card padding={4} style={{ transform: `translateY(${dragOffset}px)` }} />
```

Source: MDN, @layer (styles not in a layer override styles in named and anonymous layers); CSS Cascading and Inheritance Level 5, cascade sorting order (layers, then inline style).

Gate: judge
