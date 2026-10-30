---
title: Screen copy says literally what the product does or what the person gets, with none of the listed stock AI constructions
applies_when:
  - writing or changing a heading, tagline, description or button label on a user-facing screen
  - accepting screen copy drafted by a language model
tags: [content, copy, ai-writing]
---

Make every heading and tagline say literally what the product does or what the person gets (test: does the phrase name an action the product performs or a thing the person receives?). Never put any of these in a copy string on a user-facing screen:

- a metaphor that describes the product as something it is not (a guardian, a companion, a co-pilot, a watchtower)
- a "not X but Y" or "not just X, it's Y" contrast
- three parallel words or short phrases as a slogan ("Fast. Simple. Secure.")
- an em dash
- the words seamless, powerful, effortless, groundbreaking, vibrant, renowned, profound

```tsx
// WRONG
<h1>Your inventory's quiet guardian — always watching, always ready, always yours.</h1>
// RIGHT
<h1>See stock for every warehouse in one list, and get an email when an item runs low.</h1>
```
