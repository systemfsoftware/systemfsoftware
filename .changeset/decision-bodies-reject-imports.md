---
'@systemfsoftware/oxlint-plugin-effect-workflow': major
'@systemfsoftware/oxlint-plugin-effect-dmmf': major
---

`make-body-purity` reports every import referenced inside a `Workflow.make` body, except the sealed pure `effect` surface. A decision is the innermost point of the sandwich, so imports run toward it and never out of it: the reader imports the workflow, and nothing sits beneath the pure core. A body reaching a sibling module invents a layer there whose purity nothing checks — this rule visits make bodies only, so it never reads the module the body reached.

The rule previously exempted eight relative specifiers, which is why such a body could pass. The exemption keyed on the filename an author typed, so adding a line certified a module without reading it, renaming a file un-certified one whose contents had not changed, and a specifier like `./Survivors.js` certified that name in any package in any directory.

Expect new findings in any package whose decision bodies call helpers from neighbouring modules. Each has two resolutions: move the referenced code into the deciding file, or move the decision into the file that already holds the code. One decision, one file. Passing the helper in as a parameter is not a third option — a pure helper does not earn a requirement. Where the reference is a decoder, the decode belongs at the edge and its result passes into the decision as data.
