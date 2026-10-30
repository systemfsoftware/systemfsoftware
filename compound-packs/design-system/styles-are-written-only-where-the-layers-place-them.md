---
title: An Astryx app writes no CSS outside the global stylesheet, and a style prop carries only a value computed at render
applies_when:
  - adding a CSS file, a CSS module, a <style> element or a CSS-in-JS library to an app that renders @astryxdesign/core
  - adding a style prop to a component or element
tags: [design-system, astryx, css-layers, styling]
---

Write all CSS an app owns in the global stylesheet, inside the cascade layers it declares. Never add a CSS module, per-component CSS file, `<style>` element or runtime CSS-in-JS library (styled-components, Emotion and the like): a declaration outside any layer, or an inline style, outranks every layered rule and overrides Astryx's component styles and every Tailwind utility at once.

Use a `style` prop only for a value computed at render from props or state (a measured width, a drag offset). A value known when the code is written is a utility class or a component prop.

Never import StyleX in app code, call `stylex.create` or `stylex.props`, pass an `xstyle` prop, or add a StyleX compiler plugin; Astryx is consumed as its shipped CSS.

```tsx
// WRONG
import styles from './OrderRow.module.css'
<Card className={styles.row} style={{ padding: 16 }} />
// RIGHT
<Card padding={4} style={{ transform: `translateY(${dragOffset}px)` }} />
```
