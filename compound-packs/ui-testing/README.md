# UI Testing

How a UI's behaviour is proven by Storybook stories run in a real browser: what a journey specifies and how it reads, where a story's I/O comes from, how its state stays its own, and how stories query and size. Work that writes or reviews a story must honor it.

Rules are top-level `.md` files with `title`, `applies_when` and `tags`, cited as `(pack: ui-testing, <file>.md)`. Rule text is evidence that `ce-plan` and `ce-code-review` quote, not an enforcement contract. Subfolders are storage the resolver never reads.

| Rule                                                    | Holds                                                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `stories-get-io-from-stand-ins-beside-the-io-module.md` | The two modules the preview substitutes (I/O layer, router), where their stand-ins go, and that nothing else is substituted |
| `each-journey-starts-from-reset-fixture-controls.md`    | How `src/io/__mocks__/fixture-controls.ts` is reset and set around mount and each step                                      |
| `journeys-are-embedded-gherkin.md`                      | What a journey's Feature, steps and Thens say                                                                               |
| `stories-are-the-ui-tests.md`                           | UI behaviour is proven by stories in a real browser, never a simulated DOM                                                  |
| `queries-are-accessible.md`                             | How steps find and assert on elements                                                                                       |
| `layout-claims-pin-the-viewport.md`                     | Pinning a viewport for a layout claim                                                                                       |
