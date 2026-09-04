# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Constitution corpus

### Constitution corpus
The complete set of law documents the repository ships, treated as one unit. The corpus is what the gate certifies and what agents are bound by — not any single file's contents. Shrinking the measured portion of the corpus is a defect, not an optimization.

### Rule
One fenced YAML block inside the constitution carrying an id of the form `CONST-<family><number>` — the family letter is one of G, E, P, D, B, T, N, W, S (governance, enforcement, purity, domain modelling, boundary, testing, naming & structure, work discipline, subtraction). A rule is the atomic unit of law: it is minted with a fresh number, amended in place, or vacated. Minting takes the next free number in the family — a minting law enforced by review, not by the gate. A vacated number is never reused for new law.


### Vacuous pass
A gate exiting green because it measured less than it claims — a missing input, an input that contributes nothing, a comparison arm that reads only part of the history. The output shape is identical to a healthy run, so the green actively certifies the absence of defects it did not look for. The doctrine this repo's gate is built on: assert the corpus, not only the contents; a gate that cannot fail is a certificate, not enforcement.

### Residency
The delivery contract for law: whatever must bind an agent is always present in its context window, with no retrieval step. The counter-design — a thin resident pointer plus retrieved full text — forces presence at fetch time but never conformance at use time, so it inflates apparent compliance without producing it. What cannot fit residency is reference material, not law.

### Corpus gate
The single check that certifies the constitution corpus — schema of every rule block, id and family registry, citation integrity across the corpus, and cross-revision comparison on demand. It runs as the repository's test command and again at every commit through the pre-commit hook, which makes any corpus-shape change also a gate change: the gate certifies the very input set a restructure edits.
