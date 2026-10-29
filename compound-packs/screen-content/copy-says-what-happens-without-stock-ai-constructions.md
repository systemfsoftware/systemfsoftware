---
title: Screen copy says literally what the product does or what the person gets, with none of the listed stock AI constructions
applies_when:
  - writing or changing a heading, tagline, description or button label on a user-facing screen
  - accepting screen copy drafted by a language model
tags: [content, copy, ai-writing]
---

Every heading and tagline says literally what the product does or what the person gets. No copy string on a user-facing screen contains any of these constructions:

- a metaphor that describes the product as something it is not (a guardian, a companion, a co-pilot, a watchtower);
- a 'not X but Y' or 'not just X, it's Y' contrast;
- three parallel words or short phrases used as a slogan ('Fast. Simple. Secure.');
- an em dash (—);
- one of these words: seamless, powerful, effortless, groundbreaking, vibrant, renowned, profound.

Review test: read each copy string the diff adds or changes on a user-facing screen. The change fails when a heading or tagline does not say what the product does or what the person gets, or when any string contains a construction from the list above. Whether a phrase is a metaphor is judged by one question: does it name an action the product performs or a thing the person receives?

Prevents: copy that reads as machine-written and says nothing, so the person cannot tell what the product does.

```tsx
// WRONG: metaphor, em dash, a three-part slogan and a contrast
<h1>Your inventory's quiet guardian — always watching, always ready, always yours.</h1>
<p>Not just a spreadsheet, but a smarter way to work.</p>
```

```tsx
// RIGHT: says what it does and what the person gets
<h1>See stock for every warehouse in one list, and get an email when an item runs low.</h1>
```

Source: Wikipedia, Signs of AI writing, sections 'Rule of three', 'Negative parallelisms', 'Overuse of em dashes' and 'Promotional and advertisement-like language' (its words to watch include vibrant, groundbreaking, renowned and profound): https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing ; and the maintainers' copy ruling that product copy is literal and specific, with no metaphor taglines, triads, 'not X but Y', em-dash cadence or seamless, powerful or effortless.

The review judge decides from the copy in the diff; an uncertain verdict escalates to a person and never passes.

Gate: judge
