# Astryx Compound Pack

How an app uses the Astryx design system (`@astryxdesign/*`, github.com/facebook/astryx) so its components render styled and its own styles stay on the theme: setup, theme build, StyleX build, component usage and navigation. The pack is opt-in. A repo that does not enroll it is untouched, and an enrolled repo sees a rule only while it does Astryx work, because every rule's `applies_when` names Astryx work. The rules carry no product's colors, fonts or paths; examples use a placeholder theme, and each repo keeps its own tokens and paths in its `AGENTS.md`.

The evidence the rules were drawn from (a working Astryx app with file and line references, the Astryx README, the StyleX docs) is in `evidence/`.
